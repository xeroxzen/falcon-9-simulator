import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  sampleFrameAt,
  useSimStore,
  type CameraMode,
  type FocusStage,
} from '../store/simStore.js';
import type { Vec3 } from '../sim/types.js';
import { installDebugHook, updateDebugFrame } from './debugBridge.js';
import { Stage1Mesh, Stage2Mesh } from './Falcon9Vehicle.js';
import {
  EarthAndSky,
  LandingPadMesh,
  LaunchPadMesh,
} from './EnvironmentScene.js';

/** Convert ENU (x=E, y=N, z=U) to Three.js right-handed (x=E, y=U, z=-N). */
function enuToThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, -v.y);
}

/** Build quaternion aligning +Y (vehicle nose) with a Three.js unit direction. */
function dirToQuat(dirThree: THREE.Vector3): THREE.Quaternion {
  const up = new THREE.Vector3(0, 1, 0);
  const d = dirThree.clone().normalize();
  if (d.lengthSq() < 1e-6) return new THREE.Quaternion();
  const q = new THREE.Quaternion();
  if (d.y < -0.9999) {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  } else {
    q.setFromUnitVectors(up, d);
  }
  return q;
}

interface SceneContentProps {
  readonly viewStage: FocusStage;
  readonly cameraMode: CameraMode;
  readonly isPrimaryTicker: boolean;
}

function SceneContent({
  viewStage,
  cameraMode,
  isPrimaryTicker,
}: SceneContentProps) {
  const { camera, gl } = useThree();
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);
  const advanceTime = useSimStore((s) => s.advanceTime);

  const s1GroupRef = useRef<THREE.Group>(null);
  const s2GroupRef = useRef<THREE.Group>(null);
  const camTargetRef = useRef(new THREE.Vector3(0, 35, 0));

  useEffect(() => {
    installDebugHook();
  }, []);

  const frame = useMemo(
    () => sampleFrameAt(trajectory, timeS),
    [trajectory, timeS]
  );

  // Advance simulation clock once per animation frame (only in primary viewport)
  useFrame((_, delta) => {
    if (isPrimaryTicker) {
      advanceTime(Math.min(delta, 0.05));
    }

    if (!frame || !trajectory) return;

    const activeSnap = viewStage === 'stage1' ? frame.stage1 : frame.stage2;
    const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
    const nearLanding =
      viewStage === 'stage1' &&
      frame.separated &&
      frame.stage1.altitudeM < 15_000;

    // Choose floating-origin anchor for jitter-free millimeter precision:
    //  - Near pad during ascent: pad is at (0,0,0)
    //  - Near droneship/LZ during booster landing: landing pad is at (0,0,0)
    //  - High altitude / orbit: focused stage is at (0,0,0)
    let focusPos = new THREE.Vector3(0, 0, 0);
    let s1Pos = new THREE.Vector3(0, 0, 0);
    let s2Pos = new THREE.Vector3(0, 42.6, 0);
    let s1Att = enuToThree(frame.stage1.attitudeLocalEnu);
    let s2Att = enuToThree(frame.stage2.attitudeLocalEnu);

    if (nearPad) {
      s1Pos = enuToThree(frame.stage1.padEnuM);
      s1Att = enuToThree(frame.stage1.attitudePadEnu);
      s2Pos = s1Pos.clone();
      s2Att = s1Att.clone();
      focusPos = s1Pos.clone();
    } else if (nearLanding) {
      s1Pos = enuToThree(frame.stage1.landingEnuM);
      s1Att = enuToThree(frame.stage1.attitudeLandingEnu);
      // Stage 2 is far away in orbit; place at relative offset
      s2Pos = enuToThree(frame.stage2.landingEnuM);
      s2Att = enuToThree(frame.stage2.attitudeLandingEnu);
      focusPos = s1Pos.clone();
    } else {
      // High-altitude floating origin centered on focused stage
      const p1 = enuToThree(frame.stage1.padEnuM);
      const p2 = enuToThree(frame.stage2.padEnuM);
      if (viewStage === 'stage1') {
        s1Pos.set(0, 0, 0);
        s2Pos.copy(p2).sub(p1);
        focusPos.set(0, 0, 0);
      } else {
        s2Pos.set(0, 0, 0);
        s1Pos.copy(p1).sub(p2);
        focusPos.set(0, 0, 0);
      }
      s1Att = enuToThree(frame.stage1.attitudePadEnu);
      s2Att = enuToThree(frame.stage2.attitudePadEnu);
    }

    const q1 = dirToQuat(s1Att);
    const q2 = dirToQuat(s2Att);

    if (s1GroupRef.current) {
      // Clamp visual touchdown floor to deck datum y=0 when landed so leg feet rest flush
      const clampedS1Pos =
        nearLanding && frame.stage1.phase === 'LANDED'
          ? new THREE.Vector3(s1Pos.x, Math.max(0, s1Pos.y), s1Pos.z)
          : s1Pos;
      s1GroupRef.current.position.copy(clampedS1Pos);
      s1GroupRef.current.quaternion.copy(q1);
    }

    if (isPrimaryTicker) {
      // Deployed landing leg foot sits at local y=+0.03 m; deck top surface is at y=0.00 m
      const footHeightAboveDeck = nearLanding
        ? (s1GroupRef.current?.position.y ?? s1Pos.y) +
          (frame.stage1.landingLegsDeployed ? 0.03 : 0.3)
        : null;
      updateDebugFrame(camera, gl.domElement, footHeightAboveDeck);
    }

    if (s2GroupRef.current) {
      if (!frame.separated) {
        // Attached flush atop Stage 1 interstage (42.6 m along S1 nose)
        const offset = new THREE.Vector3(0, 42.6, 0).applyQuaternion(q1);
        s2GroupRef.current.position.copy(s1Pos).add(offset);
        s2GroupRef.current.quaternion.copy(q1);
      } else {
        s2GroupRef.current.position.copy(s2Pos);
        s2GroupRef.current.quaternion.copy(q2);
      }
    }

    // Camera positioning:
    // Directly track lookTarget in chase/split modes so the vehicle stays
    // rock-solid in frame across floating-origin switches and at 100x playback.
    const centerOffset = new THREE.Vector3(0, frame.separated ? 18 : 28, 0);
    const activeQuat = viewStage === 'stage1' ? q1 : q2;
    const lookTarget = focusPos
      .clone()
      .add(centerOffset.clone().applyQuaternion(activeQuat));
    camTargetRef.current.copy(lookTarget);

    if (cameraMode === 'chase' || cameraMode === 'split') {
      const dist = frame.separated ? 82 : 142;
      const desired = lookTarget
        .clone()
        .add(new THREE.Vector3(dist * 0.72, dist * 0.16, dist * 0.72));
      camera.position.copy(desired);
      camera.lookAt(camTargetRef.current);
    } else if (cameraMode === 'pad') {
      if (nearPad) {
        camera.position.set(95, 18, 125);
        camera.lookAt(camTargetRef.current);
      } else {
        camera.position.copy(lookTarget).add(new THREE.Vector3(90, 20, 110));
        camera.lookAt(camTargetRef.current);
      }
    } else if (cameraMode === 'droneship') {
      if (nearLanding) {
        camera.position.set(78, 16, 85);
        camera.lookAt(camTargetRef.current);
      } else {
        camera.position.copy(lookTarget).add(new THREE.Vector3(75, 18, 85));
        camera.lookAt(camTargetRef.current);
      }
    } else if (cameraMode === 'onboard-s1') {
      const camOffset = new THREE.Vector3(2.8, 38.5, 0).applyQuaternion(q1);
      const lookDown = new THREE.Vector3(0, -25, 0).applyQuaternion(q1);
      camera.position.copy(s1Pos).add(camOffset);
      camera.lookAt(s1Pos.clone().add(lookDown));
    } else if (cameraMode === 'onboard-s2') {
      const basePos = frame.separated
        ? s2Pos
        : s1Pos.clone().add(new THREE.Vector3(0, 42.6, 0).applyQuaternion(q1));
      const camOffset = new THREE.Vector3(2.8, 10.0, 0).applyQuaternion(q2);
      const lookBack = new THREE.Vector3(0, -30, 0).applyQuaternion(q2);
      camera.position.copy(basePos).add(camOffset);
      camera.lookAt(basePos.clone().add(lookBack));
    }
    void activeSnap;
  });

  if (!frame || !trajectory) return null;

  const activeSnap = viewStage === 'stage1' ? frame.stage1 : frame.stage2;
  const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
  const nearLanding =
    viewStage === 'stage1' &&
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

      {nearPad && <LaunchPadMesh siteId={trajectory.launchSiteId} />}
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

      {cameraMode === 'orbit' && (
        <OrbitControls
          target={camTargetRef.current}
          enableDamping
          dampingFactor={0.08}
          minDistance={18}
          maxDistance={600}
        />
      )}

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.85}
          mipmapBlur
          intensity={1.15}
          radius={0.6}
        />
      </EffectComposer>
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

  if (isSplit) {
    return (
      <div className="split-viewport">
        <div className="viewport-pane">
          <div className="pane-badge">STAGE 2 — ORBITAL ASCENT</div>
          <Canvas
            gl={{ preserveDrawingBuffer: true }}
            camera={{ fov: 48, near: 0.5, far: 45_000, position: [80, 40, 80] }}
            dpr={[1, 2]}
          >
            <SceneContent
              viewStage="stage2"
              cameraMode="split"
              isPrimaryTicker
            />
          </Canvas>
        </div>
        <div className="viewport-pane">
          <div className="pane-badge">STAGE 1 — BOOSTER RECOVERY</div>
          <Canvas
            gl={{ preserveDrawingBuffer: true }}
            camera={{ fov: 48, near: 0.5, far: 45_000, position: [80, 40, 80] }}
            dpr={[1, 2]}
          >
            <SceneContent
              viewStage="stage1"
              cameraMode="split"
              isPrimaryTicker={false}
            />
          </Canvas>
        </div>
      </div>
    );
  }

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
        dpr={[1, 2]}
      >
        <SceneContent
          viewStage={effectiveStage}
          cameraMode={cameraMode}
          isPrimaryTicker
        />
      </Canvas>
    </div>
  );
}
