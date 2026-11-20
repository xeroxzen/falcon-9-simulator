import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  createMutableFrameTransform,
  sampleFrameAt,
  sampleFrameTransformInto,
  useSimStore,
  type CameraMode,
  type FocusStage,
  type MutableFrameTransform,
} from '../store/simStore.js';
import type { Vec3 } from '../sim/types.js';
import { installDebugHook, updateDebugFrame } from './debugBridge.js';
import { Stage1Mesh, Stage2Mesh } from './Falcon9Vehicle.js';
import {
  EarthAndSky,
  LandingPadMesh,
  LaunchPadMesh,
} from './EnvironmentScene.js';

// Pre-allocated scratch math objects (ZERO per-frame heap allocations in useFrame)
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const SCRATCH_DIR = new THREE.Vector3();
const SCRATCH_FOCUS = new THREE.Vector3();
const SCRATCH_S1_POS = new THREE.Vector3();
const SCRATCH_S2_POS = new THREE.Vector3();
const SCRATCH_S1_ATT = new THREE.Vector3();
const SCRATCH_S2_ATT = new THREE.Vector3();
const SCRATCH_P1 = new THREE.Vector3();
const SCRATCH_P2 = new THREE.Vector3();
const SCRATCH_Q1 = new THREE.Quaternion();
const SCRATCH_Q2 = new THREE.Quaternion();
const SCRATCH_OFFSET = new THREE.Vector3();
const SCRATCH_LOOK_TARGET = new THREE.Vector3();
const SCRATCH_DESIRED = new THREE.Vector3();
const SCRATCH_CAM_OFF = new THREE.Vector3();
const SCRATCH_LOOK_DIR = new THREE.Vector3();
const SCRATCH_FRAME: MutableFrameTransform = createMutableFrameTransform();

/** Convert ENU (x=E, y=N, z=U) into Three.js right-handed (x=E, y=U, z=-N) in-place. */
function enuToThreeInto(v: Vec3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x, v.z, -v.y);
}

/** Write quaternion aligning +Y (vehicle nose) with a Three.js unit direction in-place. */
function dirToQuatInto(dirThree: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  SCRATCH_DIR.copy(dirThree);
  const lenSq = SCRATCH_DIR.lengthSq();
  if (lenSq < 1e-6) return out.identity();
  SCRATCH_DIR.divideScalar(Math.sqrt(lenSq));
  if (SCRATCH_DIR.y < -0.9999) {
    out.setFromAxisAngle(X_AXIS, Math.PI);
  } else {
    out.setFromUnitVectors(UP_AXIS, SCRATCH_DIR);
  }
  return out;
}

/** Frame-rate-independent critically damped spring (Game Programming Gems 4), zero alloc. */
function dampVec3(
  cur: THREE.Vector3,
  target: THREE.Vector3,
  vel: THREE.Vector3,
  smoothTime: number,
  dt: number
): void {
  const omega = 2 / Math.max(0.001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const dx = cur.x - target.x;
  const dy = cur.y - target.y;
  const dz = cur.z - target.z;
  const tx = (vel.x + omega * dx) * dt;
  const ty = (vel.y + omega * dy) * dt;
  const tz = (vel.z + omega * dz) * dt;
  vel.set(
    (vel.x - omega * tx) * exp,
    (vel.y - omega * ty) * exp,
    (vel.z - omega * tz) * exp
  );
  cur.set(
    target.x + (dx + tx) * exp,
    target.y + (dy + ty) * exp,
    target.z + (dz + tz) * exp
  );
}

/**
 * Position s1Group and s2Group in floating-origin coordinates for a given `viewStage`,
 * writing the resulting focus position and stage quaternions into scratch objects.
 */
function positionVehiclesForStage(
  frame: MutableFrameTransform,
  viewStage: FocusStage,
  s1Group: THREE.Group | null,
  s2Group: THREE.Group | null
): { nearPad: boolean; nearLanding: boolean } {
  const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
  const nearLanding =
    viewStage === 'stage1' &&
    frame.separated &&
    frame.stage1.altitudeM < 15_000;

  if (nearPad) {
    enuToThreeInto(frame.stage1.padEnuM, SCRATCH_S1_POS);
    enuToThreeInto(frame.stage1.attitudePadEnu, SCRATCH_S1_ATT);
    SCRATCH_S2_POS.copy(SCRATCH_S1_POS);
    SCRATCH_S2_ATT.copy(SCRATCH_S1_ATT);
    SCRATCH_FOCUS.copy(SCRATCH_S1_POS);
  } else if (nearLanding) {
    enuToThreeInto(frame.stage1.landingEnuM, SCRATCH_S1_POS);
    enuToThreeInto(frame.stage1.attitudeLandingEnu, SCRATCH_S1_ATT);
    enuToThreeInto(frame.stage2.landingEnuM, SCRATCH_S2_POS);
    enuToThreeInto(frame.stage2.attitudeLandingEnu, SCRATCH_S2_ATT);
    SCRATCH_FOCUS.copy(SCRATCH_S1_POS);
  } else {
    enuToThreeInto(frame.stage1.padEnuM, SCRATCH_P1);
    enuToThreeInto(frame.stage2.padEnuM, SCRATCH_P2);
    if (viewStage === 'stage1') {
      SCRATCH_S1_POS.set(0, 0, 0);
      SCRATCH_S2_POS.copy(SCRATCH_P2).sub(SCRATCH_P1);
      SCRATCH_FOCUS.set(0, 0, 0);
    } else {
      SCRATCH_S2_POS.set(0, 0, 0);
      SCRATCH_S1_POS.copy(SCRATCH_P1).sub(SCRATCH_P2);
      SCRATCH_FOCUS.set(0, 0, 0);
    }
    enuToThreeInto(frame.stage1.attitudePadEnu, SCRATCH_S1_ATT);
    enuToThreeInto(frame.stage2.attitudePadEnu, SCRATCH_S2_ATT);
  }

  dirToQuatInto(SCRATCH_S1_ATT, SCRATCH_Q1);
  dirToQuatInto(SCRATCH_S2_ATT, SCRATCH_Q2);

  if (s1Group) {
    const s1Y =
      nearLanding && frame.stage1.phase === 'LANDED'
        ? Math.max(0, SCRATCH_S1_POS.y)
        : SCRATCH_S1_POS.y;
    s1Group.position.set(SCRATCH_S1_POS.x, s1Y, SCRATCH_S1_POS.z);
    s1Group.quaternion.copy(SCRATCH_Q1);
  }

  if (s2Group) {
    if (!frame.separated) {
      SCRATCH_OFFSET.set(0, 42.6, 0).applyQuaternion(SCRATCH_Q1);
      s2Group.position.copy(SCRATCH_S1_POS).add(SCRATCH_OFFSET);
      s2Group.quaternion.copy(SCRATCH_Q1);
    } else {
      s2Group.position.copy(SCRATCH_S2_POS);
      s2Group.quaternion.copy(SCRATCH_Q2);
    }
  }

  return { nearPad, nearLanding };
}

/**
 * Single-renderer, single-canvas, two-scissored-viewport Split View renderer.
 * Only mounted when `isSplit === true`, so R3F's normal pipeline + Bloom runs
 * in single view while Split View renders both Stage 2 (left) and Stage 1 (right)
 * in a single WebGL context at 60+ fps.
 */
function SplitScissorPass({
  s1GroupRef,
  s2GroupRef,
}: {
  readonly s1GroupRef: React.RefObject<THREE.Group | null>;
  readonly s2GroupRef: React.RefObject<THREE.Group | null>;
}) {
  const { gl, scene, size } = useThree();
  const camLeftRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camRightRef = useRef<THREE.PerspectiveCamera | null>(null);

  if (!camLeftRef.current) {
    camLeftRef.current = new THREE.PerspectiveCamera(48, 1, 0.5, 45_000);
  }
  if (!camRightRef.current) {
    camRightRef.current = new THREE.PerspectiveCamera(48, 1, 0.5, 45_000);
  }

  useFrame((_, delta) => {
    const dtClamped = Math.min(delta, 0.05);
    const store = useSimStore.getState();
    store.advanceTime(dtClamped);

    if (!sampleFrameTransformInto(store.trajectory, useSimStore.getState().timeS, SCRATCH_FRAME)) {
      return;
    }
    const frame = SCRATCH_FRAME;

    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    gl.info.reset();

    const fullW = size.width;
    const fullH = size.height;
    const halfW = Math.floor(fullW / 2);
    const rightW = fullW - halfW;
    const aspectL = Math.max(0.1, halfW / Math.max(1, fullH));
    const aspectR = Math.max(0.1, rightW / Math.max(1, fullH));

    const camL = camLeftRef.current!;
    const camR = camRightRef.current!;
    if (Math.abs(camL.aspect - aspectL) > 1e-4) {
      camL.aspect = aspectL;
      camL.updateProjectionMatrix();
    }
    if (Math.abs(camR.aspect - aspectR) > 1e-4) {
      camR.aspect = aspectR;
      camR.updateProjectionMatrix();
    }

    gl.setScissorTest(true);

    // --- Left viewport: Stage 2 Orbital Ascent ---
    positionVehiclesForStage(frame, 'stage2', s1GroupRef.current, s2GroupRef.current);
    SCRATCH_OFFSET.set(0, 18, 0).applyQuaternion(SCRATCH_Q2);
    SCRATCH_LOOK_TARGET.copy(SCRATCH_FOCUS).add(SCRATCH_OFFSET);
    camL.position
      .copy(SCRATCH_LOOK_TARGET)
      .add(SCRATCH_DESIRED.set(82 * 0.72, 82 * 0.16, 82 * 0.72));
    camL.lookAt(SCRATCH_LOOK_TARGET);
    gl.setViewport(0, 0, halfW, fullH);
    gl.setScissor(0, 0, halfW, fullH);
    gl.render(scene, camL);

    // --- Right viewport: Stage 1 Booster Recovery ---
    const { nearLanding } = positionVehiclesForStage(
      frame,
      'stage1',
      s1GroupRef.current,
      s2GroupRef.current
    );
    SCRATCH_OFFSET.set(0, 18, 0).applyQuaternion(SCRATCH_Q1);
    SCRATCH_LOOK_TARGET.copy(SCRATCH_FOCUS).add(SCRATCH_OFFSET);
    camR.position
      .copy(SCRATCH_LOOK_TARGET)
      .add(SCRATCH_DESIRED.set(82 * 0.72, 82 * 0.16, 82 * 0.72));
    camR.lookAt(SCRATCH_LOOK_TARGET);
    gl.setViewport(halfW, 0, rightW, fullH);
    gl.setScissor(halfW, 0, rightW, fullH);
    gl.render(scene, camR);

    gl.setScissorTest(false);
    gl.setViewport(0, 0, fullW, fullH);

    const footHeightAboveDeck = nearLanding
      ? (s1GroupRef.current?.position.y ?? SCRATCH_S1_POS.y) +
        (frame.stage1.landingLegsDeployed ? 0.03 : 0.3)
      : null;
    updateDebugFrame(camR, gl.domElement, footHeightAboveDeck, {
      calls,
      triangles,
    });
  }, 1);

  return null;
}

interface SceneContentProps {
  readonly viewStage: FocusStage;
  readonly cameraMode: CameraMode;
  readonly isSplit: boolean;
}

function SceneContent({ viewStage, cameraMode, isSplit }: SceneContentProps) {
  const { camera, gl } = useThree();
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);

  const s1GroupRef = useRef<THREE.Group>(null);
  const s2GroupRef = useRef<THREE.Group>(null);
  const camTargetRef = useRef(new THREE.Vector3(0, 35, 0));
  const camPosVelRef = useRef(new THREE.Vector3(0, 0, 0));
  const camTgtVelRef = useRef(new THREE.Vector3(0, 0, 0));
  const prevOriginKeyRef = useRef<string>('');
  const camInitializedRef = useRef(false);

  useEffect(() => {
    installDebugHook();
    // Disable autoReset so renderer.info.render accumulates ALL WebGL draw calls
    // and triangles across the entire frame (scene + shadows + postprocessing).
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  const frame = useMemo(
    () => sampleFrameAt(trajectory, timeS),
    [trajectory, timeS]
  );

  // Single-viewport update loop (zero per-frame heap allocations)
  useFrame((_, delta) => {
    if (isSplit) return;

    const dtClamped = Math.min(delta, 0.05);
    const store = useSimStore.getState();
    store.advanceTime(dtClamped);

    if (
      !store.trajectory ||
      !sampleFrameTransformInto(store.trajectory, useSimStore.getState().timeS, SCRATCH_FRAME)
    ) {
      return;
    }
    const curFrame = SCRATCH_FRAME;

    const { nearPad, nearLanding } = positionVehiclesForStage(
      curFrame,
      viewStage,
      s1GroupRef.current,
      s2GroupRef.current
    );

    const footHeightAboveDeck = nearLanding
      ? (s1GroupRef.current?.position.y ?? SCRATCH_S1_POS.y) +
        (curFrame.stage1.landingLegsDeployed ? 0.03 : 0.3)
      : null;

    // Read true per-frame WebGL draw calls & triangles directly from renderer.info.render
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    gl.info.reset();
    updateDebugFrame(camera, gl.domElement, footHeightAboveDeck, {
      calls,
      triangles,
    });

    // Camera positioning with frame-rate-independent critically damped smoothing.
    // Snap ONLY when floating-origin anchor / camera mode / stage changes, or when
    // lag exceeds 25 m (e.g., timeline scrub or 100x jump).
    const originKey = `${nearPad ? 'pad' : nearLanding ? 'land' : 'hi'}:${viewStage}:${cameraMode}`;
    const originSwitched = prevOriginKeyRef.current !== originKey;
    prevOriginKeyRef.current = originKey;

    const activeQuat = viewStage === 'stage1' ? SCRATCH_Q1 : SCRATCH_Q2;
    SCRATCH_OFFSET.set(0, curFrame.separated ? 18 : 28, 0).applyQuaternion(activeQuat);
    SCRATCH_LOOK_TARGET.copy(SCRATCH_FOCUS).add(SCRATCH_OFFSET);

    const moveCamera = (desiredPos: THREE.Vector3, desiredTarget: THREE.Vector3) => {
      const lag = camera.position.distanceTo(desiredPos);
      if (!camInitializedRef.current || originSwitched || lag > 25) {
        camera.position.copy(desiredPos);
        camTargetRef.current.copy(desiredTarget);
        camPosVelRef.current.set(0, 0, 0);
        camTgtVelRef.current.set(0, 0, 0);
        camInitializedRef.current = true;
      } else {
        dampVec3(camera.position, desiredPos, camPosVelRef.current, 0.16, dtClamped);
        dampVec3(camTargetRef.current, desiredTarget, camTgtVelRef.current, 0.12, dtClamped);
      }
      camera.lookAt(camTargetRef.current);
    };

    if (cameraMode === 'chase') {
      const dist = curFrame.separated ? 82 : 142;
      SCRATCH_DESIRED.set(
        SCRATCH_LOOK_TARGET.x + dist * 0.72,
        SCRATCH_LOOK_TARGET.y + dist * 0.16,
        SCRATCH_LOOK_TARGET.z + dist * 0.72
      );
      moveCamera(SCRATCH_DESIRED, SCRATCH_LOOK_TARGET);
    } else if (cameraMode === 'pad') {
      if (nearPad) {
        SCRATCH_DESIRED.set(95, 18, 125);
      } else {
        SCRATCH_DESIRED.set(
          SCRATCH_LOOK_TARGET.x + 90,
          SCRATCH_LOOK_TARGET.y + 20,
          SCRATCH_LOOK_TARGET.z + 110
        );
      }
      moveCamera(SCRATCH_DESIRED, SCRATCH_LOOK_TARGET);
    } else if (cameraMode === 'droneship') {
      if (nearLanding) {
        SCRATCH_DESIRED.set(78, 16, 85);
      } else {
        SCRATCH_DESIRED.set(
          SCRATCH_LOOK_TARGET.x + 75,
          SCRATCH_LOOK_TARGET.y + 18,
          SCRATCH_LOOK_TARGET.z + 85
        );
      }
      moveCamera(SCRATCH_DESIRED, SCRATCH_LOOK_TARGET);
    } else if (cameraMode === 'onboard-s1') {
      SCRATCH_CAM_OFF.set(2.8, 38.5, 0).applyQuaternion(SCRATCH_Q1);
      SCRATCH_LOOK_DIR.set(0, -25, 0).applyQuaternion(SCRATCH_Q1);
      camera.position.copy(SCRATCH_S1_POS).add(SCRATCH_CAM_OFF);
      SCRATCH_DESIRED.copy(SCRATCH_S1_POS).add(SCRATCH_LOOK_DIR);
      camera.lookAt(SCRATCH_DESIRED);
    } else if (cameraMode === 'onboard-s2') {
      if (curFrame.separated) {
        SCRATCH_P1.copy(SCRATCH_S2_POS);
      } else {
        SCRATCH_OFFSET.set(0, 42.6, 0).applyQuaternion(SCRATCH_Q1);
        SCRATCH_P1.copy(SCRATCH_S1_POS).add(SCRATCH_OFFSET);
      }
      SCRATCH_CAM_OFF.set(2.8, 10.0, 0).applyQuaternion(SCRATCH_Q2);
      SCRATCH_LOOK_DIR.set(0, -30, 0).applyQuaternion(SCRATCH_Q2);
      camera.position.copy(SCRATCH_P1).add(SCRATCH_CAM_OFF);
      SCRATCH_DESIRED.copy(SCRATCH_P1).add(SCRATCH_LOOK_DIR);
      camera.lookAt(SCRATCH_DESIRED);
    } else if (cameraMode === 'orbit') {
      camTargetRef.current.copy(SCRATCH_LOOK_TARGET);
    }
  });

  if (!frame || !trajectory) return null;

  const activeSnap = viewStage === 'stage1' ? frame.stage1 : frame.stage2;
  const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
  const nearLanding =
    (viewStage === 'stage1' || isSplit) &&
    frame.separated &&
    frame.stage1.altitudeM < 15_000;

  return (
    <>
      <EarthAndSky altitudeM={activeSnap.altitudeM} />

      <ambientLight intensity={0.42} />
      <directionalLight
        position={[300, 450, 220]}
        intensity={2.4}
        color="#fff8ee"
        castShadow
      />
      <directionalLight
        position={[-200, -80, -150]}
        intensity={0.55}
        color="#6aa6ff"
      />

      {nearPad && <LaunchPadMesh siteId={trajectory.launchSiteId} timeS={timeS} />}
      {nearLanding && <LandingPadMesh mode={trajectory.landingMode} />}

      <group ref={s1GroupRef}>
        <Stage1Mesh snapshot={frame.stage1} separated={frame.separated} />
      </group>

      <group ref={s2GroupRef}>
        <Stage2Mesh
          snapshot={frame.stage2}
          hasFairing={trajectory.hasFairing}
          separated={frame.separated}
        />
      </group>

      {cameraMode === 'orbit' && !isSplit && (
        <OrbitControls
          target={camTargetRef.current}
          enableDamping
          dampingFactor={0.08}
          minDistance={18}
          maxDistance={600}
        />
      )}

      {isSplit ? (
        <SplitScissorPass s1GroupRef={s1GroupRef} s2GroupRef={s2GroupRef} />
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={0.85}
            mipmapBlur
            intensity={1.15}
            radius={0.6}
          />
        </EffectComposer>
      )}
    </>
  );
}

export function MissionCanvas() {
  const cameraMode = useSimStore((s) => s.cameraMode);
  const focusStage = useSimStore((s) => s.focusStage);
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);

  const isSplit =
    cameraMode === 'split' &&
    trajectory !== null &&
    timeS >= trajectory.stageSepTimeS;

  const effectiveStage: FocusStage =
    cameraMode === 'onboard-s2'
      ? 'stage2'
      : cameraMode === 'onboard-s1' || cameraMode === 'droneship'
        ? 'stage1'
        : focusStage;

  return (
    <div className="single-viewport">
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ fov: 48, near: 0.5, far: 45_000, position: [100, 45, 115] }}
        dpr={[1, 1.5]}
      >
        <SceneContent
          viewStage={effectiveStage}
          cameraMode={cameraMode}
          isSplit={isSplit}
        />
      </Canvas>
      {isSplit && (
        <div className="split-overlay" aria-hidden="true">
          <div className="split-divider" />
          <div className="pane-badge pane-badge-left">STAGE 2 — ORBITAL ASCENT</div>
          <div className="pane-badge pane-badge-right">STAGE 1 — BOOSTER RECOVERY</div>
        </div>
      )}
    </div>
  );
}
