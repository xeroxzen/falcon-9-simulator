import { create } from 'zustand';
import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
  SAOCOM_1A_MISSION,
} from '../sim/config/missions.js';
import type { MissionConfig, Vec3 } from '../sim/types.js';
import { normalize } from '../sim/math.js';
import { soundEngine } from '../audio/soundEngine.js';
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
  | 'pad-fixed'
  | 'droneship'
  | 'onboard-s1'
  | 'onboard-s2'
  | 'split';

export type FocusStage = 'stage1' | 'stage2';

export type QualityTier = 'low' | 'med' | 'high';

export interface QualityPreset {
  readonly dpr: number | [number, number];
  readonly bloom: boolean;
  readonly starCount: number;
  readonly shadows: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: { dpr: 1, bloom: false, starCount: 700, shadows: false },
  med: { dpr: [1, 1.25], bloom: true, starCount: 1400, shadows: false },
  high: { dpr: [1, 1.5], bloom: true, starCount: 2200, shadows: true },
};

function detectDefaultQualityTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isPhone = w <= 600 || (h <= 500 && w <= 950);
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  if (isPhone) return 'low';
  if (coarse || w <= 1024) return 'med';
  return 'high';
}

function detectInitialShowEngineerPanel(): boolean {
  if (typeof window === 'undefined') return true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isPhone = w <= 600 || (h <= 500 && w <= 950);
  return !isPhone;
}

export interface ComponentSelection {
  readonly componentId: string;
  /** Optional 0-based engine index for Merlin 1D (#1..#9) */
  readonly engineIndex?: number;
}

export const AVAILABLE_MISSIONS: readonly MissionConfig[] = [
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
  SAOCOM_1A_MISSION,
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
    qAlphaPaDeg: lerp(a.qAlphaPaDeg, b.qAlphaPaDeg, t),
    thrustN: lerp(a.thrustN, b.thrustN, t),
    throttle: lerp(a.throttle, b.throttle, t),
    axialAccelG: lerp(a.axialAccelG, b.axialAccelG, t),
    totalMassKg: lerp(a.totalMassKg, b.totalMassKg, t),
    propellantKg: lerp(a.propellantKg, b.propellantKg, t),
    propellantFraction: lerp(a.propellantFraction, b.propellantFraction, t),
    gridFinDeflectionDeg: lerp(a.gridFinDeflectionDeg, b.gridFinDeflectionDeg, t),
    ambientPressurePa: lerp(a.ambientPressurePa, b.ambientPressurePa, t),
    ambientDensityKgM3: lerp(a.ambientDensityKgM3, b.ambientDensityKgM3, t),
  };
}

function lerpVec3Into(a: Vec3, b: Vec3, t: number, out: { x: number; y: number; z: number }): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
}

function lerpDirInto(a: Vec3, b: Vec3, t: number, out: { x: number; y: number; z: number }): void {
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const z = a.z + (b.z - a.z) * t;
  const n = Math.hypot(x, y, z);
  if (n > 1e-9) {
    out.x = x / n;
    out.y = y / n;
    out.z = z / n;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 1;
  }
}

export interface MutableStageTransform {
  readonly padEnuM: { x: number; y: number; z: number };
  readonly landingEnuM: { x: number; y: number; z: number };
  readonly attitudePadEnu: { x: number; y: number; z: number };
  readonly attitudeLandingEnu: { x: number; y: number; z: number };
  altitudeM: number;
  phase: string;
  landingLegsDeployed: boolean;
}

export interface MutableFrameTransform {
  separated: boolean;
  readonly stage1: MutableStageTransform;
  readonly stage2: MutableStageTransform;
}

export function createMutableFrameTransform(): MutableFrameTransform {
  return {
    separated: false,
    stage1: {
      padEnuM: { x: 0, y: 0, z: 0 },
      landingEnuM: { x: 0, y: 0, z: 0 },
      attitudePadEnu: { x: 0, y: 0, z: 1 },
      attitudeLandingEnu: { x: 0, y: 0, z: 1 },
      altitudeM: 0,
      phase: 'PAD',
      landingLegsDeployed: false,
    },
    stage2: {
      padEnuM: { x: 0, y: 0, z: 0 },
      landingEnuM: { x: 0, y: 0, z: 0 },
      attitudePadEnu: { x: 0, y: 0, z: 1 },
      attitudeLandingEnu: { x: 0, y: 0, z: 1 },
      altitudeM: 0,
      phase: 'ATTACHED',
      landingLegsDeployed: false,
    },
  };
}

/**
 * Zero-allocation frame transform sampler for 60+ fps `useFrame` loops.
 * Writes interpolated positions/attitudes directly into `out` without creating objects.
 */
export function sampleFrameTransformInto(
  trajectory: MissionTrajectoryData | null,
  timeS: number,
  out: MutableFrameTransform
): boolean {
  if (!trajectory || trajectory.frames.length === 0) return false;
  const frames = trajectory.frames;
  let f0: PlaybackFrame;
  let f1: PlaybackFrame;
  let alpha = 0;
  if (timeS <= frames[0]!.timeS) {
    f0 = f1 = frames[0]!;
  } else if (timeS >= frames[frames.length - 1]!.timeS) {
    f0 = f1 = frames[frames.length - 1]!;
  } else {
    let lo = 0;
    let hi = frames.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.timeS <= timeS) lo = mid;
      else hi = mid;
    }
    f0 = frames[lo]!;
    f1 = frames[hi]!;
    const span = f1.timeS - f0.timeS;
    alpha = span > 1e-6 ? (timeS - f0.timeS) / span : 0;
  }

  out.separated = timeS >= trajectory.stageSepTimeS;

  const s1a = f0.stage1;
  const s1b = f1.stage1;
  const s1n = alpha < 0.5 ? s1a : s1b;
  lerpVec3Into(s1a.padEnuM, s1b.padEnuM, alpha, out.stage1.padEnuM);
  lerpVec3Into(s1a.landingEnuM, s1b.landingEnuM, alpha, out.stage1.landingEnuM);
  lerpDirInto(s1a.attitudePadEnu, s1b.attitudePadEnu, alpha, out.stage1.attitudePadEnu);
  lerpDirInto(s1a.attitudeLandingEnu, s1b.attitudeLandingEnu, alpha, out.stage1.attitudeLandingEnu);
  out.stage1.altitudeM = lerp(s1a.altitudeM, s1b.altitudeM, alpha);
  out.stage1.phase = s1n.phase;
  out.stage1.landingLegsDeployed = s1n.landingLegsDeployed;

  const s2a = f0.stage2;
  const s2b = f1.stage2;
  const s2n = alpha < 0.5 ? s2a : s2b;
  lerpVec3Into(s2a.padEnuM, s2b.padEnuM, alpha, out.stage2.padEnuM);
  lerpVec3Into(s2a.landingEnuM, s2b.landingEnuM, alpha, out.stage2.landingEnuM);
  lerpDirInto(s2a.attitudePadEnu, s2b.attitudePadEnu, alpha, out.stage2.attitudePadEnu);
  lerpDirInto(s2a.attitudeLandingEnu, s2b.attitudeLandingEnu, alpha, out.stage2.attitudeLandingEnu);
  out.stage2.altitudeM = lerp(s2a.altitudeM, s2b.altitudeM, alpha);
  out.stage2.phase = s2n.phase;
  out.stage2.landingLegsDeployed = s2n.landingLegsDeployed;

  return true;
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

/**
 * High-frequency mutable simulation clock read/written in the priority -1 useFrame
 * without triggering React re-renders on every animation frame. Zustand `timeS`
 * is synced at ~10 Hz during playback (and immediately on scrubs/seeks) so HUD
 * components stay smooth with minimal GC pressure.
 */
export const liveSimClock = {
  timeS: 0,
  lastHudSyncMs: 0,
};

interface SimStoreState {
  baseMission: MissionConfig;
  mission: MissionConfig;
  nominalTrajectory: MissionTrajectoryData | null;
  trajectory: MissionTrajectoryData | null;
  isWhatIfActive: boolean;
  loading: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
  timeS: number;
  playing: boolean;
  playbackSpeed: number;
  cameraMode: CameraMode;
  focusStage: FocusStage;
  qualityTier: QualityTier;
  soundMuted: boolean;
  showEngineerPanel: boolean;
  showWhatIfPanel: boolean;
  showHotspots: boolean;
  bottomSheetHeightPx: number;
  rightDrawerWidthPx: number;
  mobileControlsHidden: boolean;
  selectedComponent: ComponentSelection | null;
  hoveredComponent: ComponentSelection | null;
  runMission: (mission: MissionConfig, asWhatIf?: boolean) => void;
  resetToNominal: () => void;
  setTimeS: (t: number) => void;
  advanceTime: (dtRealS: number) => void;
  /** High-frequency rAF clock tick: clamps dt <= 50 ms, updates liveSimClock, throttles HUD sync to ~10 Hz */
  tickFrameClock: (dtRealS: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setFocusStage: (stage: FocusStage) => void;
  setQualityTier: (tier: QualityTier) => void;
  toggleSoundMute: () => void;
  setSoundMuted: (muted: boolean) => void;
  setBottomSheetHeightPx: (px: number) => void;
  setRightDrawerWidthPx: (px: number) => void;
  setMobileControlsHidden: (hidden: boolean) => void;
  toggleEngineerPanel: () => void;
  toggleWhatIfPanel: () => void;
  toggleHotspots: () => void;
  selectComponent: (sel: ComponentSelection | null) => void;
  hoverComponent: (sel: ComponentSelection | null) => void;
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
  baseMission: DEFAULT_LEO_ASDS_MISSION,
  mission: DEFAULT_LEO_ASDS_MISSION,
  nominalTrajectory: null,
  trajectory: null,
  isWhatIfActive: false,
  loading: false,
  loadingProgress: 0,
  loadingStage: '',
  error: null,
  timeS: 0,
  playing: false,
  playbackSpeed: 1,
  cameraMode: 'chase',
  focusStage: 'stage1',
  qualityTier: detectDefaultQualityTier(),
  soundMuted: true,
  showEngineerPanel: detectInitialShowEngineerPanel(),
  showWhatIfPanel: false,
  showHotspots: false,
  bottomSheetHeightPx: 0,
  rightDrawerWidthPx: 0,
  mobileControlsHidden: false,
  selectedComponent: null,
  hoveredComponent: null,

  runMission: (mission, asWhatIf = false) => {
    const requestId = ++latestRequestId;
    set((s) => ({
      baseMission: asWhatIf ? s.baseMission : mission,
      mission,
      isWhatIfActive: asWhatIf,
      loading: true,
      loadingProgress: 0.08,
      loadingStage: 'Dispatching to Web Worker…',
      error: null,
      playing: false,
    }));

    const worker = getWorker();
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.requestId !== latestRequestId) return;
      if (msg.type === 'MISSION_PROGRESS') {
        set({ loadingProgress: msg.progress, loadingStage: msg.stage });
        return;
      }
      if (msg.type === 'MISSION_RESULT') {
        const startT = msg.data.startTimeS ?? 0;
        // Start playback at T-10 s terminal count while keeping full T-60 s venting scrubbable
        const initialT = Math.max(startT, -10);
        liveSimClock.timeS = initialT;
        liveSimClock.lastHudSyncMs = performance.now();
        set((s) => ({
          trajectory: msg.data,
          nominalTrajectory: asWhatIf ? s.nominalTrajectory : msg.data,
          loading: false,
          loadingProgress: 1,
          loadingStage: '',
          error: null,
          timeS: initialT,
          playing: true,
        }));
      } else {
        set({
          loading: false,
          loadingProgress: 0,
          loadingStage: '',
          error: msg.message,
        });
      }
    };
    worker.onerror = (err) => {
      set({
        loading: false,
        loadingProgress: 0,
        loadingStage: '',
        error: err.message || 'Physics worker error',
      });
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

  resetToNominal: () => {
    const { baseMission, nominalTrajectory } = get();
    if (nominalTrajectory) {
      const startT = nominalTrajectory.startTimeS ?? 0;
      const initialT = Math.max(startT, -10);
      liveSimClock.timeS = initialT;
      liveSimClock.lastHudSyncMs = performance.now();
      set({
        mission: baseMission,
        trajectory: nominalTrajectory,
        isWhatIfActive: false,
        timeS: initialT,
        playing: true,
      });
    } else {
      get().runMission(baseMission, false);
    }
  },

  setTimeS: (t) => {
    const traj = get().trajectory;
    const minT = traj?.startTimeS ?? 0;
    const dur = traj?.durationS ?? 0;
    const clamped = Math.max(minT, Math.min(dur, t));
    liveSimClock.timeS = clamped;
    liveSimClock.lastHudSyncMs = performance.now();
    set({ timeS: clamped });
  },

  advanceTime: (dtRealS) => {
    const { playing, timeS, playbackSpeed, trajectory } = get();
    if (!playing || !trajectory) return;
    const next = timeS + dtRealS * playbackSpeed;
    if (next >= trajectory.durationS) {
      liveSimClock.timeS = trajectory.durationS;
      set({ timeS: trajectory.durationS, playing: false });
    } else {
      liveSimClock.timeS = next;
      set({ timeS: next });
    }
  },

  tickFrameClock: (dtRealS) => {
    const { playing, playbackSpeed, trajectory } = get();
    if (!playing || !trajectory) return;
    const clampedDt = Math.min(Math.max(0, dtRealS), 0.05);
    const next = liveSimClock.timeS + clampedDt * playbackSpeed;
    const now = performance.now();
    if (next >= trajectory.durationS) {
      liveSimClock.timeS = trajectory.durationS;
      liveSimClock.lastHudSyncMs = now;
      set({ timeS: trajectory.durationS, playing: false });
    } else {
      liveSimClock.timeS = next;
      // Throttle HUD/React state updates to ~10 Hz (every 100 ms) during playback
      if (now - liveSimClock.lastHudSyncMs >= 100) {
        liveSimClock.lastHudSyncMs = now;
        set({ timeS: next });
      }
    }
  },

  togglePlay: () =>
    set((s) => {
      const nextPlaying = !s.playing;
      liveSimClock.lastHudSyncMs = performance.now();
      return { playing: nextPlaying, timeS: liveSimClock.timeS };
    }),
  setPlaying: (playing) => {
    liveSimClock.lastHudSyncMs = performance.now();
    set({ playing, timeS: liveSimClock.timeS });
  },
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setFocusStage: (focusStage) => set({ focusStage }),
  setQualityTier: (qualityTier) => set({ qualityTier }),
  toggleSoundMute: () => {
    const next = !get().soundMuted;
    soundEngine.setMuted(next);
    set({ soundMuted: next });
  },
  setSoundMuted: (muted) => {
    soundEngine.setMuted(muted);
    set({ soundMuted: muted });
  },
  setBottomSheetHeightPx: (bottomSheetHeightPx) => set({ bottomSheetHeightPx }),
  setRightDrawerWidthPx: (rightDrawerWidthPx) => set({ rightDrawerWidthPx }),
  setMobileControlsHidden: (mobileControlsHidden) => set({ mobileControlsHidden }),
  toggleEngineerPanel: () =>
    set((s) => {
      const next = !s.showEngineerPanel;
      const isPhone =
        typeof window !== 'undefined' &&
        (window.innerWidth <= 600 ||
          (window.innerHeight <= 500 && window.innerWidth <= 950));
      return {
        showEngineerPanel: next,
        showWhatIfPanel: isPhone && next ? false : s.showWhatIfPanel,
        selectedComponent: isPhone && next ? null : s.selectedComponent,
        hoveredComponent: isPhone ? null : s.hoveredComponent,
        mobileControlsHidden: false,
      };
    }),
  toggleWhatIfPanel: () =>
    set((s) => {
      const next = !s.showWhatIfPanel;
      const isPhone =
        typeof window !== 'undefined' &&
        (window.innerWidth <= 600 ||
          (window.innerHeight <= 500 && window.innerWidth <= 950));
      return {
        showWhatIfPanel: next,
        selectedComponent: next ? null : s.selectedComponent,
        showEngineerPanel: isPhone && next ? false : s.showEngineerPanel,
        hoveredComponent: null,
        mobileControlsHidden: false,
      };
    }),
  toggleHotspots: () => set((s) => ({ showHotspots: !s.showHotspots })),
  selectComponent: (selectedComponent) =>
    set((s) => {
      const isPhone =
        typeof window !== 'undefined' &&
        (window.innerWidth <= 600 ||
          (window.innerHeight <= 500 && window.innerWidth <= 950));
      return {
        selectedComponent,
        showWhatIfPanel: selectedComponent ? false : s.showWhatIfPanel,
        showEngineerPanel:
          isPhone && selectedComponent ? false : s.showEngineerPanel,
        hoveredComponent: isPhone ? null : s.hoveredComponent,
        mobileControlsHidden: false,
      };
    }),
  hoverComponent: (hoveredComponent) => set({ hoveredComponent }),
}));
