import type {
  EngineState,
  GeodeticCoord,
  MissionConfig,
  OrbitalElements,
  Vec3,
  VehicleConfig,
} from '../sim/types.js';

/**
 * Generic timeline event — supports arbitrary burns, coasts, and dynamic events
 * (e.g., SES-1, SECO-1, SES-2, SECO-2, ENGINE_OUT, FAIRING_SEP, etc.).
 */
export interface TimelineEvent {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly stage: 'STACK' | 'STAGE1' | 'STAGE2' | 'MISSION';
  readonly timeS: number;
  readonly altitudeM: number;
  readonly speedMs: number;
  readonly downrangeM: number;
  readonly detail: string;
}

/**
 * Dynamic burn/coast/aero segment per stage — allows the timeline UI to render
 * any number of burns and coasts per stage without hard-coding mission structure.
 */
export interface StageSegment {
  readonly id: string;
  readonly stage: 'STAGE1' | 'STAGE2';
  readonly kind: 'BURN' | 'COAST' | 'AERO' | 'LANDED' | 'ORBIT' | 'CRASHED';
  readonly label: string;
  readonly startTimeS: number;
  readonly endTimeS: number;
}

export interface StageFrameSnapshot {
  /** Position in local Launch Pad ENU (m): x=East, y=North, z=Up */
  readonly padEnuM: Vec3;
  /** Position in local Landing Target ENU (m): x=East, y=North, z=Up */
  readonly landingEnuM: Vec3;
  /** Unit attitude vector (+nose) in local Launch Pad ENU */
  readonly attitudePadEnu: Vec3;
  /** Unit attitude vector (+nose) in local Landing Target ENU */
  readonly attitudeLandingEnu: Vec3;
  /** Unit attitude vector (+nose) in local vehicle ENU (x=E, y=N, z=U) */
  readonly attitudeLocalEnu: Vec3;
  readonly altitudeM: number;
  readonly downrangeM: number;
  readonly distanceToTargetM: number;
  readonly speedEarthRelMs: number;
  readonly speedInertialMs: number;
  readonly verticalSpeedMs: number;
  readonly horizontalSpeedMs: number;
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly qAlphaPaDeg: number;
  readonly thrustN: number;
  readonly throttle: number;
  readonly axialAccelG: number;
  readonly totalMassKg: number;
  readonly propellantKg: number;
  readonly propellantFraction: number;
  readonly phase: string;
  readonly activeEngineCount: number;
  readonly engines: readonly EngineState[];
  readonly gridFinDeflectionDeg: number;
  readonly landingLegsDeployed: boolean;
  readonly fairingAttached: boolean;
  readonly ambientPressurePa: number;
  readonly ambientDensityKgM3: number;
}

export interface PlaybackFrame {
  readonly timeS: number;
  readonly separated: boolean;
  readonly stage1: StageFrameSnapshot;
  readonly stage2: StageFrameSnapshot;
}

export interface MissionTrajectoryData {
  readonly missionId: string;
  readonly missionName: string;
  readonly landingMode: MissionConfig['landingMode'];
  readonly launchSiteId: MissionConfig['launchSite']['id'];
  readonly hasFairing: boolean;
  /** First trajectory timestamp in seconds (e.g. -10 during terminal countdown, or 0). */
  readonly startTimeS: number;
  readonly durationS: number;
  readonly stageSepTimeS: number;
  readonly frames: readonly PlaybackFrame[];
  readonly events: readonly TimelineEvent[];
  readonly segments: readonly StageSegment[];
  readonly orbit: OrbitalElements;
  readonly orbitAchieved: boolean;
  readonly boosterOutcome: 'LANDED' | 'CRASHED' | 'EXPENDED';
  readonly boosterFailureReason?: string;
  readonly mecoTimeS: number;
  readonly boosterApogeeM: number;
  readonly boosterTouchdownMissM: number;
  readonly boosterPropRemainingKg: number;
  readonly stage2PropRemainingKg: number;
  readonly landingTarget: GeodeticCoord;
  readonly computeTimeMs: number;
}

// Worker <-> Main Thread Message Protocol
export type WorkerRequest = {
  readonly type: 'RUN_MISSION';
  readonly requestId: number;
  readonly vehicle: VehicleConfig;
  readonly mission: MissionConfig;
  readonly sampleIntervalS?: number;
};

export type WorkerResponse =
  | {
      readonly type: 'MISSION_PROGRESS';
      readonly requestId: number;
      readonly progress: number;
      readonly stage: string;
    }
  | {
      readonly type: 'MISSION_RESULT';
      readonly requestId: number;
      readonly data: MissionTrajectoryData;
    }
  | {
      readonly type: 'MISSION_ERROR';
      readonly requestId: number;
      readonly message: string;
    };
