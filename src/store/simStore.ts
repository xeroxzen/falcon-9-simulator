import { create } from 'zustand';
import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
} from '../sim/config/missions.js';
import type { MissionConfig, Vec3 } from '../sim/types.js';
import { normalize } from '../sim/math.js';
import type {
  MissionTrajectoryData,
  PlaybackFrame,
  StageFrameSnapshot,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol.js';

export type CameraMode =
  | 'orbit'
  | 'chase'
  | 'pad'
  | 'droneship'
  | 'onboard-s1'
  | 'onboard-s2'
  | 'split';

export type FocusStage = 'stage1' | 'stage2';

export const AVAILABLE_MISSIONS: readonly MissionConfig[] = [
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function lerpStage(
  a: StageFrameSnapshot,
  b: StageFrameSnapshot,
  t: number
): StageFrameSnapshot {
  const nearest = t < 0.5 ? a : b;
  return {
    ...nearest,
    padEnuM: lerpVec3(a.padEnuM, b.padEnuM, t),
    landingEnuM: lerpVec3(a.landingEnuM, b.landingEnuM, t),
    attitudePadEnu: normalize(lerpVec3(a.attitudePadEnu, b.attitudePadEnu, t)),
    attitudeLandingEnu: normalize(
      lerpVec3(a.attitudeLandingEnu, b.attitudeLandingEnu, t)
    ),
    attitudeLocalEnu: normalize(
      lerpVec3(a.attitudeLocalEnu, b.attitudeLocalEnu, t)
    ),
    altitudeM: lerp(a.altitudeM, b.altitudeM, t),
    downrangeM: lerp(a.downrangeM, b.downrangeM, t),
    distanceToTargetM: lerp(a.distanceToTargetM, b.distanceToTargetM, t),
    speedEarthRelMs: lerp(a.speedEarthRelMs, b.speedEarthRelMs, t),
    speedInertialMs: lerp(a.speedInertialMs, b.speedInertialMs, t),
    verticalSpeedMs: lerp(a.verticalSpeedMs, b.verticalSpeedMs, t),
    horizontalSpeedMs: lerp(a.horizontalSpeedMs, b.horizontalSpeedMs, t),
    mach: lerp(a.mach, b.mach, t),
    dynamicPressurePa: lerp(a.dynamicPressurePa, b.dynamicPressurePa, t),
    thrustN: lerp(a.thrustN, b.thrustN, t),
    throttle: lerp(a.throttle, b.throttle, t),
    axialAccelG: lerp(a.axialAccelG, b.axialAccelG, t),
    totalMassKg: lerp(a.totalMassKg, b.totalMassKg, t),
    propellantKg: lerp(a.propellantKg, b.propellantKg, t),
    propellantFraction: lerp(a.propellantFraction, b.propellantFraction, t),
    gridFinDeflectionDeg: lerp(a.gridFinDeflectionDeg, b.gridFinDeflectionDeg, t),
    ambientPressurePa: lerp(a.ambientPressurePa, b.ambientPressurePa, t),
  };
}

/**
 * Smoothly interpolate between deterministic physics frames at any playback time `timeS`.
 */
export function sampleFrameAt(
  trajectory: MissionTrajectoryData | null,
  timeS: number
): PlaybackFrame | null {
  if (!trajectory || trajectory.frames.length === 0) return null;
  const frames = trajectory.frames;
  if (timeS <= frames[0]!.timeS) return frames[0]!;
  const last = frames[frames.length - 1]!;
  if (timeS >= last.timeS) return last;

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.timeS <= timeS) lo = mid;
    else hi = mid;
  }
  const f0 = frames[lo]!;
  const f1 = frames[hi]!;
  const span = f1.timeS - f0.timeS;
  const alpha = span > 1e-6 ? (timeS - f0.timeS) / span : 0;

  return {
    timeS,
    separated: timeS >= trajectory.stageSepTimeS,
    stage1: lerpStage(f0.stage1, f1.stage1, alpha),
    stage2: lerpStage(f0.stage2, f1.stage2, alpha),
  };
}

interface SimStoreState {
  mission: MissionConfig;
  trajectory: MissionTrajectoryData | null;
  loading: boolean;
  error: string | null;
  timeS: number;
  playing: boolean;
  playbackSpeed: number;
  cameraMode: CameraMode;
  focusStage: FocusStage;
  showEngineerPanel: boolean;
  runMission: (mission: MissionConfig) => void;
  setTimeS: (t: number) => void;
  advanceTime: (dtRealS: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setFocusStage: (stage: FocusStage) => void;
  toggleEngineerPanel: () => void;
}

let workerInstance: Worker | null = null;
let latestRequestId = 0;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../worker/physics.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return workerInstance;
}

export const useSimStore = create<SimStoreState>((set, get) => ({
  mission: DEFAULT_LEO_ASDS_MISSION,
  trajectory: null,
  loading: false,
  error: null,
  timeS: 0,
  playing: false,
  playbackSpeed: 1,
  cameraMode: 'chase',
  focusStage: 'stage1',
  showEngineerPanel: true,

  runMission: (mission) => {
    const requestId = ++latestRequestId;
    set({ mission, loading: true, error: null, playing: false, timeS: 0 });

    const worker = getWorker();
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.requestId !== latestRequestId) return;
      if (msg.type === 'MISSION_RESULT') {
        set({
          trajectory: msg.data,
          loading: false,
          error: null,
          timeS: 0,
          playing: true,
        });
      } else {
        set({ loading: false, error: msg.message });
      }
    };
    worker.onerror = (err) => {
      set({ loading: false, error: err.message || 'Physics worker error' });
    };

    const req: WorkerRequest = {
      type: 'RUN_MISSION',
      requestId,
      vehicle: FALCON9_BLOCK5,
      mission,
      sampleIntervalS: 0.25,
    };
    worker.postMessage(req);
  },

  setTimeS: (t) => {
    const dur = get().trajectory?.durationS ?? 0;
    set({ timeS: Math.max(0, Math.min(dur, t)) });
  },

  advanceTime: (dtRealS) => {
    const { playing, timeS, playbackSpeed, trajectory } = get();
    if (!playing || !trajectory) return;
    const next = timeS + dtRealS * playbackSpeed;
    if (next >= trajectory.durationS) {
      set({ timeS: trajectory.durationS, playing: false });
    } else {
      set({ timeS: next });
    }
  },

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setFocusStage: (focusStage) => set({ focusStage }),
  toggleEngineerPanel: () =>
    set((s) => ({ showEngineerPanel: !s.showEngineerPanel })),
}));
