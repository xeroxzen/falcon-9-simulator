import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  createMutableFrameTransform,
  liveSimClock,
  QUALITY_PRESETS,
  sampleFrameAt,
  sampleFrameTransformInto,
  useSimStore,
  type CameraMode,
  type FocusStage,
  type MutableFrameTransform,
  type QualityTier,
} from '../store/simStore.js';
import type { Vec3 } from '../sim/types.js';
import { installDebugHook, updateDebugFrame } from './debugBridge.js';
import { soundEngine } from '../audio/soundEngine.js';
import { computePathAtmosphere } from '../audio/acoustics.js';
import { Stage1Mesh, Stage2Mesh } from './Falcon9Vehicle.js';
import {
  EarthAndSky,
  LandingPadMesh,
  LaunchPadMesh,
} from './EnvironmentScene.js';

const SCRATCH_SRC_ENU = { x: 0, y: 0, z: 0 };
const SCRATCH_LST_ENU = { x: 0, y: 0, z: 0 };
const SCRATCH_SRC_VEL = { x: 0, y: 0, z: 0 };
const SCRATCH_LST_VEL = { x: 0, y: 0, z: 0 };
const PREV_CAM_WORLD = new THREE.Vector3();
let hasPrevCamWorld = false;

// Pre-allocated scratch math objects (ZERO per-frame heap allocations in useFrame)
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const SCRATCH_DIR = new THREE.Vector3();
const SCRATCH_P1 = new THREE.Vector3();
const SCRATCH_P2 = new THREE.Vector3();
const SCRATCH_OFFSET = new THREE.Vector3();
const SCRATCH_LOOK_TARGET = new THREE.Vector3();
const SCRATCH_DESIRED = new THREE.Vector3();
const SCRATCH_CAM_OFF = new THREE.Vector3();
const SCRATCH_LOOK_DIR = new THREE.Vector3();
const SCRATCH_S1_ATT = new THREE.Vector3();
const SCRATCH_S2_ATT = new THREE.Vector3();

/** Single-source-of-truth per-frame simulation & transform snapshot (zero alloc). */
interface FrameStateSnapshot {
  valid: boolean;
  timeS: number;
  dtClamped: number;
  nearPad: boolean;
  nearLanding: boolean;
  readonly transform: MutableFrameTransform;
  readonly focusPos: THREE.Vector3;
  readonly s1Pos: THREE.Vector3;
  readonly s2Pos: THREE.Vector3;
  readonly q1: THREE.Quaternion;
  readonly q2: THREE.Quaternion;
}

function createFrameStateSnapshot(): FrameStateSnapshot {
  return {
    valid: false,
    timeS: 0,
    dtClamped: 0,
    nearPad: true,
    nearLanding: false,
    transform: createMutableFrameTransform(),
    focusPos: new THREE.Vector3(),
    s1Pos: new THREE.Vector3(),
    s2Pos: new THREE.Vector3(),
    q1: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
  };
}

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

/** Frame-rate-independent critically damped scalar spring (zero alloc). */
function dampScalar(
  cur: number,
  target: number,
  velRef: { v: number },
  smoothTime: number,
  dt: number
): number {
  const omega = 2 / Math.max(0.001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = cur - target;
  const t = (velRef.v + omega * d) * dt;
  velRef.v = (velRef.v - omega * t) * exp;
  return target + (d + t) * exp;
}

/** Frame-rate-independent critically damped Vec3 spring (zero alloc). */
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
 * Compute floating-origin vehicle positions & orientations into `out` for a given `viewStage`.
 */
function computeStageTransformsInto(
  frame: MutableFrameTransform,
  viewStage: FocusStage,
  out: FrameStateSnapshot
): void {
  const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
  const nearLanding =
    viewStage === 'stage1' &&
    frame.separated &&
    frame.stage1.altitudeM < 15_000;

  out.nearPad = nearPad;
  out.nearLanding = nearLanding;

  if (nearPad) {
    enuToThreeInto(frame.stage1.padEnuM, out.s1Pos);
    enuToThreeInto(frame.stage1.attitudePadEnu, SCRATCH_S1_ATT);
    out.s2Pos.copy(out.s1Pos);
    SCRATCH_S2_ATT.copy(SCRATCH_S1_ATT);
    out.focusPos.copy(out.s1Pos);
  } else if (nearLanding) {
    enuToThreeInto(frame.stage1.landingEnuM, out.s1Pos);
    enuToThreeInto(frame.stage1.attitudeLandingEnu, SCRATCH_S1_ATT);
    enuToThreeInto(frame.stage2.landingEnuM, out.s2Pos);
    enuToThreeInto(frame.stage2.attitudeLandingEnu, SCRATCH_S2_ATT);
    out.focusPos.copy(out.s1Pos);
  } else {
    enuToThreeInto(frame.stage1.padEnuM, SCRATCH_P1);
    enuToThreeInto(frame.stage2.padEnuM, SCRATCH_P2);
    if (viewStage === 'stage1') {
      out.s1Pos.set(0, 0, 0);
      out.s2Pos.copy(SCRATCH_P2).sub(SCRATCH_P1);
      out.focusPos.set(0, 0, 0);
    } else {
      out.s2Pos.set(0, 0, 0);
      out.s1Pos.copy(SCRATCH_P1).sub(SCRATCH_P2);
      out.focusPos.set(0, 0, 0);
    }
    enuToThreeInto(frame.stage1.attitudePadEnu, SCRATCH_S1_ATT);
    enuToThreeInto(frame.stage2.attitudePadEnu, SCRATCH_S2_ATT);
  }

  dirToQuatInto(SCRATCH_S1_ATT, out.q1);
  dirToQuatInto(SCRATCH_S2_ATT, out.q2);
}

function applyTransformsToGroups(
  fs: FrameStateSnapshot,
  s1Group: THREE.Group | null,
  s2Group: THREE.Group | null
): void {
  if (s1Group) {
    const s1Y =
      fs.nearLanding && fs.transform.stage1.phase === 'LANDED'
        ? Math.max(0, fs.s1Pos.y)
        : fs.s1Pos.y;
    s1Group.position.set(fs.s1Pos.x, s1Y, fs.s1Pos.z);
    s1Group.quaternion.copy(fs.q1);
  }

  if (s2Group) {
    if (!fs.transform.separated) {
      SCRATCH_OFFSET.set(0, 42.6, 0).applyQuaternion(fs.q1);
      s2Group.position.copy(fs.s1Pos).add(SCRATCH_OFFSET);
      s2Group.quaternion.copy(fs.q1);
    } else {
      s2Group.position.copy(fs.s2Pos);
      s2Group.quaternion.copy(fs.q2);
    }
  }
}

/**
 * Single-renderer, single-canvas, two-scissored-viewport Split View renderer.
 * Reads directly from the single-source-of-truth `frameStateRef` populated at priority -1.
 */
function SplitScissorPass({
  frameStateRef,
  s1GroupRef,
  s2GroupRef,
}: {
  readonly frameStateRef: React.RefObject<FrameStateSnapshot>;
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

  useFrame(() => {
    const fs = frameStateRef.current;
    if (!fs || !fs.valid) return;

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
    computeStageTransformsInto(fs.transform, 'stage2', fs);
    applyTransformsToGroups(fs, s1GroupRef.current, s2GroupRef.current);
    SCRATCH_OFFSET.set(0, 18, 0).applyQuaternion(fs.q2);
    SCRATCH_LOOK_TARGET.copy(fs.focusPos).add(SCRATCH_OFFSET);
    camL.position
      .copy(SCRATCH_LOOK_TARGET)
      .add(SCRATCH_DESIRED.set(82 * 0.72, 82 * 0.16, 82 * 0.72));
    camL.lookAt(SCRATCH_LOOK_TARGET);
    gl.setViewport(0, 0, halfW, fullH);
    gl.setScissor(0, 0, halfW, fullH);
    gl.render(scene, camL);

    // --- Right viewport: Stage 1 Booster Recovery ---
    computeStageTransformsInto(fs.transform, 'stage1', fs);
    applyTransformsToGroups(fs, s1GroupRef.current, s2GroupRef.current);
    SCRATCH_OFFSET.set(0, 18, 0).applyQuaternion(fs.q1);
    SCRATCH_LOOK_TARGET.copy(fs.focusPos).add(SCRATCH_OFFSET);
    camR.position
      .copy(SCRATCH_LOOK_TARGET)
      .add(SCRATCH_DESIRED.set(82 * 0.72, 82 * 0.16, 82 * 0.72));
    camR.lookAt(SCRATCH_LOOK_TARGET);
    gl.setViewport(halfW, 0, rightW, fullH);
    gl.setScissor(halfW, 0, rightW, fullH);
    gl.render(scene, camR);

    gl.setScissorTest(false);
    gl.setViewport(0, 0, fullW, fullH);

    // Split View listener = primary (left) pane camera
    const splitStore = useSimStore.getState();
    if (splitStore.trajectory) {
      const nowFrame = sampleFrameAt(splitStore.trajectory, fs.timeS);
      if (nowFrame) {
        const s2Snap = nowFrame.stage2;
        SCRATCH_SRC_ENU.x = fs.s2Pos.x;
        SCRATCH_SRC_ENU.y = -fs.s2Pos.z;
        SCRATCH_SRC_ENU.z = fs.s2Pos.y;
        SCRATCH_LST_ENU.x = camL.position.x;
        SCRATCH_LST_ENU.y = -camL.position.z;
        SCRATCH_LST_ENU.z = camL.position.y;
        SCRATCH_SRC_VEL.x = 0;
        SCRATCH_SRC_VEL.y = 0;
        SCRATCH_SRC_VEL.z = s2Snap.verticalSpeedMs;
        SCRATCH_LST_VEL.x = 0;
        SCRATCH_LST_VEL.y = 0;
        SCRATCH_LST_VEL.z = s2Snap.verticalSpeedMs;
        soundEngine.update(
          {
            sourcePosEnuM: SCRATCH_SRC_ENU,
            sourceVelEnuMs: SCRATCH_SRC_VEL,
            listenerPosEnuM: SCRATCH_LST_ENU,
            listenerVelEnuMs: SCRATCH_LST_VEL,
            sourceAltM: s2Snap.altitudeM,
            listenerAltM: Math.max(0, s2Snap.altitudeM + 13),
            isOnboard: false,
            playbackSpeed: splitStore.playbackSpeed,
            playing: splitStore.playing,
            throttle: s2Snap.throttle,
            activeEngineCount: s2Snap.activeEngineCount,
            dynamicPressurePa: s2Snap.dynamicPressurePa,
            delugeIntensity: 0,
          },
          {
            simTimeS: fs.timeS,
            playing: splitStore.playing,
            playbackSpeed: splitStore.playbackSpeed,
            mecoTimeS: splitStore.trajectory.mecoTimeS,
            stageSepTimeS: splitStore.trajectory.stageSepTimeS,
            boosterSupersonicDescent: false,
            boosterAltM: nowFrame.stage1.altitudeM,
            distanceToListenerM: 82,
            airTransmission: 0,
          }
        );
      }
    }

    const footHeightAboveDeck = fs.nearLanding
      ? (s1GroupRef.current?.position.y ?? fs.s1Pos.y) +
        (fs.transform.stage1.landingLegsDeployed ? 0.03 : 0.3)
      : null;
    updateDebugFrame(camR, gl.domElement, footHeightAboveDeck, {
      calls,
      triangles,
    });
  }, 1);

  return null;
}

interface TouchCameraAdjust {
  yawOffset: number;
  elevOffset: number;
  zoomScale: number;
}

interface SceneContentProps {
  readonly viewStage: FocusStage;
  readonly cameraMode: CameraMode;
  readonly isSplit: boolean;
  readonly qualityTier: QualityTier;
  readonly touchAdjustRef: React.RefObject<TouchCameraAdjust>;
}

function SceneContent({
  viewStage,
  cameraMode,
  isSplit,
  qualityTier,
  touchAdjustRef,
}: SceneContentProps) {
  const { camera, gl, size, scene } = useThree();
  const qCfg = QUALITY_PRESETS[qualityTier];
  const bottomSheetHeightPx = useSimStore((s) => s.bottomSheetHeightPx);
  const rightDrawerWidthPx = useSimStore((s) => s.rightDrawerWidthPx);
  const selectedComponent = useSimStore((s) => s.selectedComponent);
  const trajectory = useSimStore((s) => s.trajectory);
  // Synced at ~10 Hz during playback (immediately on scrub) for low-GC HUD & mesh state
  const timeS = useSimStore((s) => s.timeS);

  const s1GroupRef = useRef<THREE.Group>(null);
  const s2GroupRef = useRef<THREE.Group>(null);
  const earthGroupRef = useRef<THREE.Group>(null);
  const starsGroupRef = useRef<THREE.Group>(null);
  const frameStateRef = useRef<FrameStateSnapshot>(createFrameStateSnapshot());

  // Chase camera smoothed orbit angle + zoom ONLY (position rigidly locked to target + offset)
  const chaseYawRef = useRef(Math.PI / 4);
  const chaseYawVelRef = useRef({ v: 0 });
  const chaseElevRef = useRef(Math.atan2(0.16, Math.hypot(0.72, 0.72)));
  const chaseElevVelRef = useRef({ v: 0 });
  const chaseDistRef = useRef(142);
  const chaseDistVelRef = useRef({ v: 0 });

  // Mode/target switch smoothing offset (decays to 0 after mode/stage switch, never lags velocity)
  const switchOffsetRef = useRef(new THREE.Vector3(0, 0, 0));
  const switchOffsetVelRef = useRef(new THREE.Vector3(0, 0, 0));
  const camTargetRef = useRef(new THREE.Vector3(0, 35, 0));
  const prevSwitchKeyRef = useRef<string>('');
  const prevSimTimeRef = useRef<number>(0);

  useEffect(() => {
    installDebugHook();
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  // Shift camera frustum via setViewOffset whenever a mobile bottom sheet or landscape
  // right drawer is open so the focused object is centered in the exact visible region
  // between the top bar and the panel (never sitting under the top bar or behind the drawer).
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (!persp.isPerspectiveCamera) return;
    if (!isSplit && bottomSheetHeightPx > 0 && size.height > bottomSheetHeightPx + 80) {
      const topBarPx = 68;
      const visCy = topBarPx + (size.height - topBarPx - bottomSheetHeightPx) * 0.5;
      const offsetY = size.height * 0.5 - visCy;
      persp.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
    } else if (!isSplit && rightDrawerWidthPx > 0 && size.width > rightDrawerWidthPx + 120) {
      const topBarPx = 62;
      const timelinePx = 64;
      const visCx = (size.width - rightDrawerWidthPx) * 0.5;
      const visCy = topBarPx + (size.height - topBarPx - timelinePx) * 0.5;
      const offsetX = size.width * 0.5 - visCx;
      const offsetY = size.height * 0.5 - visCy;
      persp.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height);
    } else {
      persp.clearViewOffset();
    }
    return () => {
      persp.clearViewOffset();
    };
  }, [camera, isSplit, bottomSheetHeightPx, rightDrawerWidthPx, size.width, size.height]);

  const frame = useMemo(
    () => sampleFrameAt(trajectory, timeS),
    [trajectory, timeS]
  );

  // PRIORITY -1: Single source of truth per frame.
  // Advances the clamped playback clock (max 50 ms) and interpolates the vehicle
  // transform ONCE into `frameStateRef.current` before ANY vehicle or camera update.
  useFrame((_, delta) => {
    const dtClamped = Math.min(Math.max(0, delta), 0.05);
    const store = useSimStore.getState();
    store.tickFrameClock(dtClamped);

    const fs = frameStateRef.current;
    fs.dtClamped = dtClamped;
    fs.timeS = liveSimClock.timeS;
    if (
      !store.trajectory ||
      !sampleFrameTransformInto(store.trajectory, fs.timeS, fs.transform)
    ) {
      fs.valid = false;
      return;
    }
    fs.valid = true;
    computeStageTransformsInto(fs.transform, viewStage, fs);
  }, -1);

  // PRIORITY 0: Apply transforms to vehicle meshes AND position camera from the
  // exact same `frameStateRef.current` snapshot (camera never reads previous frame!).
  useFrame(() => {
    if (isSplit) return;

    const fs = frameStateRef.current;
    if (!fs.valid) return;

    // 1. Update vehicle group transforms & Earth/Stars floating-origin anchors from this frame's snapshot
    applyTransformsToGroups(fs, s1GroupRef.current, s2GroupRef.current);
    const activeAltM =
      viewStage === 'stage1'
        ? fs.transform.stage1.altitudeM
        : fs.transform.stage2.altitudeM;
    if (earthGroupRef.current) {
      // Anchored to fs.focusPos so the nearPad -> highAlt floating-origin switch is 100% continuous
      // and Earth descends smoothly every frame (no 10 Hz React stair-step).
      earthGroupRef.current.position.set(
        fs.focusPos.x,
        fs.focusPos.y - (6_371 + activeAltM / 1000),
        fs.focusPos.z
      );
    }
    if (starsGroupRef.current) {
      starsGroupRef.current.position.copy(fs.focusPos);
    }

    // 2. Update debug/perf telemetry directly from renderer.info.render
    const footHeightAboveDeck = fs.nearLanding
      ? (s1GroupRef.current?.position.y ?? fs.s1Pos.y) +
        (fs.transform.stage1.landingLegsDeployed ? 0.03 : 0.3)
      : null;
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    gl.info.reset();
    updateDebugFrame(
      camera,
      gl.domElement,
      footHeightAboveDeck,
      {
        calls,
        triangles,
      },
      earthGroupRef.current,
      scene
    );

    // 3. Compute exact current-frame lookTarget (aimed at selected component center when a mobile panel is open)
    const activeQuat = viewStage === 'stage1' ? fs.q1 : fs.q2;
    const panelOpen = bottomSheetHeightPx > 0 || rightDrawerWidthPx > 0;
    let focusHeightM = fs.transform.separated ? 18 : 28;
    let fitObjHeightM = fs.transform.separated ? 42 : 70;
    if (panelOpen && selectedComponent) {
      const cid = selectedComponent.componentId;
      if (cid === 'stage1') {
        focusHeightM = 18.75;
        fitObjHeightM = 36;
      } else if (cid === 'falcon9-stack') {
        focusHeightM = 34.3;
        fitObjHeightM = 70;
      } else if (cid === 'interstage') {
        focusHeightM = 39.3;
        fitObjHeightM = 9;
      } else if (cid === 'grid-fins') {
        focusHeightM = 39.4;
        fitObjHeightM = 8;
      } else if (cid === 'landing-legs') {
        focusHeightM = 6.8;
        fitObjHeightM = 12;
      } else if (cid === 'merlin-1d') {
        focusHeightM = 1.0;
        fitObjHeightM = 6;
      } else if (cid === 'stage2') {
        focusHeightM = fs.transform.separated ? 6.3 : 48.9;
        fitObjHeightM = 16;
      } else if (cid === 'fairing') {
        focusHeightM = fs.transform.separated ? 19.1 : 61.7;
        fitObjHeightM = 16;
      } else if (cid === 'payload') {
        focusHeightM = fs.transform.separated ? 16.5 : 59.0;
        fitObjHeightM = 12;
      }
    }
    SCRATCH_OFFSET.set(0, focusHeightM, 0).applyQuaternion(activeQuat);
    SCRATCH_LOOK_TARGET.copy(fs.focusPos).add(SCRATCH_OFFSET);

    // Detect mode/target switch or discontinuous timeline scrub (> 2 s jump)
    const switchKey = `${viewStage}:${cameraMode}`;
    const switched =
      prevSwitchKeyRef.current !== '' && prevSwitchKeyRef.current !== switchKey;
    prevSwitchKeyRef.current = switchKey;
    const scrubbed = Math.abs(fs.timeS - prevSimTimeRef.current) > 2.0;
    prevSimTimeRef.current = fs.timeS;

    if (cameraMode === 'chase') {
      // Critically damped smoothing ONLY on orbit angle & zoom distance
      const adj = touchAdjustRef.current;
      const zoomScale = adj ? adj.zoomScale : 1;
      const yawOff = adj ? adj.yawOffset : 0;
      const elevOff = adj ? adj.elevOffset : 0;
      let baseDist = fs.transform.separated ? 82 : 142;
      if (panelOpen) {
        const halfFovRad = (48 * Math.PI) / 360;
        const visH =
          bottomSheetHeightPx > 0
            ? Math.max(120, size.height - 68 - bottomSheetHeightPx)
            : Math.max(120, size.height - 62 - 64);
        const visFracY = visH / Math.max(1, size.height);
        // Fit the entire object height cleanly inside 72% of the visible vertical region
        const requiredDist =
          (fitObjHeightM * 0.5) / (Math.tan(halfFovRad) * 0.72 * visFracY);
        baseDist = Math.max(baseDist * 0.75, requiredDist);
      }
      const targetDist = baseDist * zoomScale;
      const targetYaw = Math.PI / 4 + yawOff;
      const targetElev = Math.max(
        -0.75,
        Math.min(1.2, Math.atan2(0.16, Math.hypot(0.72, 0.72)) + elevOff)
      );

      if (scrubbed) {
        chaseDistRef.current = targetDist;
        chaseDistVelRef.current.v = 0;
        switchOffsetRef.current.set(0, 0, 0);
        switchOffsetVelRef.current.set(0, 0, 0);
      }

      const dist = dampScalar(
        chaseDistRef.current,
        targetDist,
        chaseDistVelRef.current,
        0.25,
        fs.dtClamped
      );
      const yaw = dampScalar(
        chaseYawRef.current,
        targetYaw,
        chaseYawVelRef.current,
        0.25,
        fs.dtClamped
      );
      const elev = dampScalar(
        chaseElevRef.current,
        targetElev,
        chaseElevVelRef.current,
        0.25,
        fs.dtClamped
      );
      chaseDistRef.current = dist;
      chaseYawRef.current = yaw;
      chaseElevRef.current = elev;

      const cosE = Math.cos(elev);
      SCRATCH_DESIRED.set(
        SCRATCH_LOOK_TARGET.x + dist * cosE * Math.sin(yaw),
        SCRATCH_LOOK_TARGET.y + dist * Math.sin(elev),
        SCRATCH_LOOK_TARGET.z + dist * cosE * Math.cos(yaw)
      );

      // On mode/stage switch, smooth only the relative switch delta (clamped <= 60 m),
      // except on discontinuous timeline scrubs where the camera snaps immediately.
      if (switched || scrubbed) {
        if (scrubbed) {
          switchOffsetRef.current.set(0, 0, 0);
        } else {
          switchOffsetRef.current.copy(camera.position).sub(SCRATCH_DESIRED);
          if (switchOffsetRef.current.lengthSq() > 60 * 60) {
            switchOffsetRef.current.set(0, 0, 0);
          }
        }
        switchOffsetVelRef.current.set(0, 0, 0);
      }
      if (switchOffsetRef.current.lengthSq() > 1e-6) {
        SCRATCH_CAM_OFF.set(0, 0, 0);
        dampVec3(
          switchOffsetRef.current,
          SCRATCH_CAM_OFF,
          switchOffsetVelRef.current,
          0.18,
          fs.dtClamped
        );
      }

      // Rigidly locked to target + offset along flight path (zero spring lag, zero 25 m snap)
      camera.position.copy(SCRATCH_DESIRED).add(switchOffsetRef.current);
      camTargetRef.current.copy(SCRATCH_LOOK_TARGET);
      camera.lookAt(camTargetRef.current);
    } else if (cameraMode === 'pad' || cameraMode === 'pad-fixed') {
      if (fs.nearPad) {
        // Positioned off-diagonal (+14, 24, +146) so:
        //  - zero lightning towers [±36, ±36] or strongback (-X) occlude the vehicle
        //  - the base launch mount, open flame trench, 4 hold-down clamps, and deflected
        //    ignition plume all sit cleanly ABOVE the bottom Webcast HUD & Timeline Bar.
        camera.position.set(14, 24, 146);
        if (cameraMode === 'pad-fixed') {
          // Fixed pad view: keeps mount, clamps, and tens-of-meters liftoff steam in frame through ~T+10 s
          camTargetRef.current.set(0, 18, 0);
        } else {
          camTargetRef.current.set(0, Math.max(16, SCRATCH_LOOK_TARGET.y - 16), 0);
        }
      } else {
        camera.position.set(
          SCRATCH_LOOK_TARGET.x + 90,
          SCRATCH_LOOK_TARGET.y + 20,
          SCRATCH_LOOK_TARGET.z + 110
        );
        camTargetRef.current.copy(SCRATCH_LOOK_TARGET);
      }
      camera.lookAt(camTargetRef.current);
    } else if (cameraMode === 'droneship') {
      if (fs.nearLanding) {
        camera.position.set(78, 16, 85);
      } else {
        camera.position.set(
          SCRATCH_LOOK_TARGET.x + 75,
          SCRATCH_LOOK_TARGET.y + 18,
          SCRATCH_LOOK_TARGET.z + 85
        );
      }
      camTargetRef.current.copy(SCRATCH_LOOK_TARGET);
      camera.lookAt(camTargetRef.current);
    } else if (cameraMode === 'onboard-s1') {
      SCRATCH_CAM_OFF.set(2.8, 38.5, 0).applyQuaternion(fs.q1);
      SCRATCH_LOOK_DIR.set(0, -25, 0).applyQuaternion(fs.q1);
      camera.position.copy(fs.s1Pos).add(SCRATCH_CAM_OFF);
      SCRATCH_DESIRED.copy(fs.s1Pos).add(SCRATCH_LOOK_DIR);
      camera.lookAt(SCRATCH_DESIRED);
    } else if (cameraMode === 'onboard-s2') {
      if (fs.transform.separated) {
        SCRATCH_P1.copy(fs.s2Pos);
      } else {
        SCRATCH_OFFSET.set(0, 42.6, 0).applyQuaternion(fs.q1);
        SCRATCH_P1.copy(fs.s1Pos).add(SCRATCH_OFFSET);
      }
      SCRATCH_CAM_OFF.set(2.8, 10.0, 0).applyQuaternion(fs.q2);
      SCRATCH_LOOK_DIR.set(0, -30, 0).applyQuaternion(fs.q2);
      camera.position.copy(SCRATCH_P1).add(SCRATCH_CAM_OFF);
      SCRATCH_DESIRED.copy(SCRATCH_P1).add(SCRATCH_LOOK_DIR);
      camera.lookAt(SCRATCH_DESIRED);
    } else if (cameraMode === 'orbit') {
      camTargetRef.current.copy(SCRATCH_LOOK_TARGET);
    }

    // Update physically-based Web Audio engine (listener = active camera; zero per-frame node allocs)
    const store = useSimStore.getState();
    if (!isSplit && store.trajectory) {
      const isOnboard = cameraMode === 'onboard-s1' || cameraMode === 'onboard-s2';
      const nowFrame = sampleFrameAt(store.trajectory, fs.timeS);
      if (nowFrame) {
        const isS2Focus =
          cameraMode === 'onboard-s2' || (viewStage === 'stage2' && nowFrame.separated);
        const srcSnap = isS2Focus ? nowFrame.stage2 : nowFrame.stage1;

        // Three.js world (X=E, Y=U, Z=-N) -> ENU (x=E, y=N, z=U)
        SCRATCH_SRC_ENU.x = fs.focusPos.x;
        SCRATCH_SRC_ENU.y = -fs.focusPos.z;
        SCRATCH_SRC_ENU.z = fs.focusPos.y;
        SCRATCH_LST_ENU.x = camera.position.x;
        SCRATCH_LST_ENU.y = -camera.position.z;
        SCRATCH_LST_ENU.z = camera.position.y;

        // Listener velocity from camera motion in world space
        if (hasPrevCamWorld && fs.dtClamped > 1e-4 && !scrubbed && !switched) {
          const invDt = 1 / fs.dtClamped;
          SCRATCH_LST_VEL.x = (camera.position.x - PREV_CAM_WORLD.x) * invDt;
          SCRATCH_LST_VEL.y = -(camera.position.z - PREV_CAM_WORLD.z) * invDt;
          SCRATCH_LST_VEL.z = (camera.position.y - PREV_CAM_WORLD.y) * invDt;
        } else {
          SCRATCH_LST_VEL.x = 0;
          SCRATCH_LST_VEL.y = 0;
          SCRATCH_LST_VEL.z = 0;
        }
        PREV_CAM_WORLD.copy(camera.position);
        hasPrevCamWorld = true;

        // Source velocity (approximated along attitude + vertical/horizontal speed)
        const vMag = srcSnap.speedEarthRelMs;
        SCRATCH_SRC_VEL.x = srcSnap.attitudePadEnu.x * vMag;
        SCRATCH_SRC_VEL.y = srcSnap.attitudePadEnu.y * vMag;
        SCRATCH_SRC_VEL.z = srcSnap.verticalSpeedMs;

        const srcAltM = srcSnap.altitudeM;
        const lstAltM = fs.nearPad || fs.nearLanding
          ? Math.max(0, camera.position.y)
          : Math.max(0, srcAltM + (camera.position.y - fs.focusPos.y));

        // Retarded emission sampling using US76 path-averaged speed of sound
        const distM = Math.hypot(
          SCRATCH_LST_ENU.x - SCRATCH_SRC_ENU.x,
          SCRATCH_LST_ENU.y - SCRATCH_SRC_ENU.y,
          SCRATCH_LST_ENU.z - SCRATCH_SRC_ENU.z
        );
        const { speedOfSoundMs } = computePathAtmosphere(srcAltM, lstAltM);
        const delayS = isOnboard ? 0 : Math.min(12.0, distM / speedOfSoundMs);
        const emitFrame =
          delayS > 0.02
            ? sampleFrameAt(store.trajectory, fs.timeS - delayS) ?? nowFrame
            : nowFrame;
        const emitSnap = isS2Focus ? emitFrame.stage2 : emitFrame.stage1;

        const tDeluge = fs.timeS - delayS;
        const delugeInt =
          fs.nearPad && tDeluge >= -5.0 && tDeluge <= 7.0
            ? tDeluge < -3.5
              ? Math.min(1, (tDeluge + 5.0) / 1.5)
              : tDeluge <= 3.0
                ? 1.0
                : Math.max(0, 1.0 - (tDeluge - 3.0) / 4.0)
            : 0;

        const out = soundEngine.update(
          {
            sourcePosEnuM: SCRATCH_SRC_ENU,
            sourceVelEnuMs: SCRATCH_SRC_VEL,
            listenerPosEnuM: SCRATCH_LST_ENU,
            listenerVelEnuMs: SCRATCH_LST_VEL,
            sourceAltM: srcAltM,
            listenerAltM: lstAltM,
            isOnboard,
            playbackSpeed: store.playbackSpeed,
            playing: store.playing,
            throttle: emitSnap.throttle,
            activeEngineCount: emitSnap.activeEngineCount,
            dynamicPressurePa: emitSnap.dynamicPressurePa,
            delugeIntensity: delugeInt,
          },
          {
            simTimeS: fs.timeS,
            playing: store.playing,
            playbackSpeed: store.playbackSpeed,
            mecoTimeS: store.trajectory.mecoTimeS,
            stageSepTimeS: store.trajectory.stageSepTimeS,
            boosterSupersonicDescent:
              nowFrame.separated &&
              nowFrame.stage1.verticalSpeedMs < -20 &&
              nowFrame.stage1.mach > 1.05,
            boosterAltM: nowFrame.stage1.altitudeM,
            distanceToListenerM: distM,
            airTransmission: 1.0,
          }
        );
        void out;
      }
    }
  }, 0);

  if (!frame || !trajectory) return null;

  const activeSnap = viewStage === 'stage1' ? frame.stage1 : frame.stage2;
  const nearPad = !frame.separated && frame.stage1.altitudeM < 12_000;
  const nearLanding =
    (viewStage === 'stage1' || isSplit) &&
    frame.separated &&
    frame.stage1.altitudeM < 15_000;

  return (
    <>
      <EarthAndSky
        altitudeM={activeSnap.altitudeM}
        earthGroupRef={earthGroupRef}
        starsGroupRef={starsGroupRef}
        starCount={qCfg.starCount}
      />

      <ambientLight intensity={0.42} />
      <directionalLight
        position={[300, 450, 220]}
        intensity={2.4}
        color="#fff8ee"
        castShadow={qCfg.shadows}
      />
      <directionalLight
        position={[-200, -80, -150]}
        intensity={0.55}
        color="#6aa6ff"
      />

      {nearPad && (
        <LaunchPadMesh
          siteId={trajectory.launchSiteId}
          timeS={timeS}
          qualityTier={qualityTier}
        />
      )}
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
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      )}

      {isSplit ? (
        <SplitScissorPass
          frameStateRef={frameStateRef}
          s1GroupRef={s1GroupRef}
          s2GroupRef={s2GroupRef}
        />
      ) : qCfg.bloom ? (
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={0.85}
            mipmapBlur
            intensity={1.15}
            radius={0.6}
          />
        </EffectComposer>
      ) : null}
    </>
  );
}

export function MissionCanvas() {
  const cameraMode = useSimStore((s) => s.cameraMode);
  const focusStage = useSimStore((s) => s.focusStage);
  const qualityTier = useSimStore((s) => s.qualityTier);
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);

  const qCfg = QUALITY_PRESETS[qualityTier];
  const touchAdjustRef = useRef<TouchCameraAdjust>({
    yawOffset: 0,
    elevOffset: 0,
    zoomScale: 1,
  });

  // Touch gesture state (one-finger orbit, two-finger pinch zoom, double-tap camera reset)
  const gestureRef = useRef<{
    mode: 'none' | 'orbit' | 'pinch';
    lastX: number;
    lastY: number;
    lastPinchDist: number;
    lastTapMs: number;
    lastTapX: number;
    lastTapY: number;
    moved: boolean;
  }>({
    mode: 'none',
    lastX: 0,
    lastY: 0,
    lastPinchDist: 0,
    lastTapMs: 0,
    lastTapX: 0,
    lastTapY: 0,
    moved: false,
  });

  const resetTouchCamera = () => {
    touchAdjustRef.current.yawOffset = 0;
    touchAdjustRef.current.elevOffset = 0;
    touchAdjustRef.current.zoomScale = 1;
    if (cameraMode === 'orbit') {
      setCameraMode('chase');
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (cameraMode === 'orbit') return;
    const g = gestureRef.current;
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      g.mode = 'orbit';
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      g.moved = false;
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      g.mode = 'pinch';
      g.lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      g.moved = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (cameraMode === 'orbit') return;
    const g = gestureRef.current;
    const adj = touchAdjustRef.current;
    if (g.mode === 'orbit' && e.touches.length === 1) {
      const t = e.touches[0]!;
      const dx = t.clientX - g.lastX;
      const dy = t.clientY - g.lastY;
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      adj.yawOffset -= dx * 0.008;
      adj.elevOffset = Math.max(-0.75, Math.min(1.0, adj.elevOffset + dy * 0.006));
      g.lastX = t.clientX;
      g.lastY = t.clientY;
    } else if (g.mode === 'pinch' && e.touches.length === 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (g.lastPinchDist > 10 && dist > 10) {
        const ratio = g.lastPinchDist / dist;
        adj.zoomScale = Math.max(0.45, Math.min(2.5, adj.zoomScale * ratio));
      }
      g.lastPinchDist = dist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g.moved && e.touches.length === 0 && e.changedTouches.length === 1) {
      const t = e.changedTouches[0]!;
      const now = performance.now();
      const dt = now - g.lastTapMs;
      const dist = Math.hypot(t.clientX - g.lastTapX, t.clientY - g.lastTapY);
      if (dt > 40 && dt < 340 && dist < 32) {
        resetTouchCamera();
        g.lastTapMs = 0;
      } else {
        g.lastTapMs = now;
        g.lastTapX = t.clientX;
        g.lastTapY = t.clientY;
      }
    }
    if (e.touches.length === 0) {
      g.mode = 'none';
    }
  };

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
    <div
      className="single-viewport"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={resetTouchCamera}
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ fov: 48, near: 0.5, far: 45_000, position: [100, 45, 115] }}
        dpr={qCfg.dpr}
      >
        <SceneContent
          viewStage={effectiveStage}
          cameraMode={cameraMode}
          isSplit={isSplit}
          qualityTier={qualityTier}
          touchAdjustRef={touchAdjustRef}
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
