export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GeodeticCoord {
  /** Geodetic latitude in radians (positive North) */
  readonly latRad: number;
  /** Geodetic longitude in radians (positive East) */
  readonly lonRad: number;
  /** Altitude above WGS-84 ellipsoid in meters */
  readonly altitudeM: number;
}

export type LandingSiteId = 'LZ-1' | 'LZ-2' | 'LZ-40' | 'LZ-4';

export type LaunchCoast = 'EAST' | 'WEST';

export interface LaunchSiteConfig {
  readonly id: 'LC-39A' | 'SLC-40' | 'SLC-4E';
  readonly name: string;
  readonly coast: LaunchCoast;
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly elevationM: number;
  /** Sourced range-safety launch azimuth corridor [minDeg, maxDeg] clockwise from North. */
  readonly azimuthCorridorDeg: readonly [number, number];
  /** Sourced valid orbital inclination range [minDeg, maxDeg] reachable from this range. */
  readonly inclinationRangeDeg: readonly [number, number];
  /** Default inclination when switching to this launch site in What-If. */
  readonly defaultInclinationDeg: number;
  readonly corridorSource: string;
  readonly source: string;
}

export interface LandingSiteConfig {
  readonly id: LandingSiteId;
  readonly name: string;
  readonly coast: LaunchCoast;
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly elevationM: number;
  readonly status: 'ACTIVE' | 'RETIRED';
  /** ISO date windows (YYYY-MM-DD) when pad was available for recovery. */
  readonly activeWindows: readonly {
    readonly from: string;
    readonly until?: string;
    readonly note?: string;
  }[];
  readonly statusNote: string;
  readonly source: string;
}

export interface DroneshipConfig {
  readonly id: 'ASOG' | 'OCISLY' | 'JRTI';
  readonly name: string;
  readonly status: 'ACTIVE' | 'REPURPOSED';
  readonly currentCoast: LaunchCoast | null;
  readonly homePort: string;
  readonly serviceHistory: readonly {
    readonly coast: LaunchCoast;
    readonly from: string;
    readonly until?: string;
  }[];
  readonly statusNote: string;
  readonly source: string;
}

export type LandingMode = 'ASDS' | 'RTLS' | 'EXPENDABLE';

export interface EngineSpec {
  readonly name: string;
  readonly thrustSeaLevelN: number;
  readonly thrustVacuumN: number;
  readonly ispSeaLevelS: number;
  readonly ispVacuumS: number;
  /** Nozzle exit area in m^2, derived from (T_vac - T_sl) / p0 */
  readonly exitAreaM2: number;
  readonly minThrottle: number;
  readonly maxThrottle: number;
}

export interface StageSpec {
  readonly name: string;
  readonly dryMassKg: number;
  readonly propellantMassKg: number;
  readonly diameterM: number;
  readonly lengthM: number;
  readonly engineCount: number;
  readonly engine: EngineSpec;
}

export interface VehicleConfig {
  readonly name: string;
  readonly totalHeightM: number;
  readonly coreDiameterM: number;
  readonly fairingDiameterM: number;
  readonly fairingLengthM: number;
  readonly fairingMassKg: number;
  readonly referenceAreaM2: number;
  readonly stage1: StageSpec;
  readonly stage2: StageSpec;
  readonly maxAxialAccelG: number;
  readonly stage2MaxAccelG: number;
  readonly maxAttitudeSlewRateRadS: number;
  /** ASSUMED booster RCS/cold-gas flip slew rate (rad/s) */
  readonly boosterFlipSlewRateRadS: number;
}

export interface EngineOutConfig {
  /** Mission elapsed time (s) when engine fails */
  readonly timeS: number;
  /** 0-based index of Merlin engine (0 = center, 1..8 = outer ring) */
  readonly engineIndex: number;
}

export interface WindConfig {
  /** Constant wind vector in local pad ENU frame (m/s) */
  readonly eastMs: number;
  readonly northMs: number;
  readonly upMs: number;
}

export interface DispersionConfig {
  /** Multiplicative thrust scale (e.g., 1.0 ± 0.01) */
  readonly thrustScale: number;
  /** Multiplicative Isp scale (e.g., 1.0 ± 0.005) */
  readonly ispScale: number;
  /** Multiplicative drag coefficient Cd scale (e.g., 1.0 ± 0.05) */
  readonly cdScale: number;
  /** Multiplicative propellant load scale (e.g., 1.0 ± 0.005) */
  readonly propellantLoadScale?: number;
  /** Multiplicative dry mass scale (e.g., 1.0 ± 0.01) */
  readonly dryMassScale?: number;
  /** Altitude-varying wind gust amplitude (m/s, east/north) */
  readonly windGustEastMs: number;
  readonly windGustNorthMs: number;
  readonly windGustPhaseRad: number;
  /** Horizontal navigation position noise (1-sigma meters) */
  readonly navNoiseM: number;
  /** Vertical altitude navigation error (meters, e.g. ±5 m) */
  readonly navAltNoiseM?: number;
  /** Velocity navigation error per axis (m/s, e.g. ±0.3 m/s) */
  readonly navVelNoiseMs?: number;
  /** ASDS droneship station-keeping position offset (meters, e.g. ±10 m) */
  readonly droneshipOffsetEastM?: number;
  readonly droneshipOffsetNorthM?: number;
  /** ASDS deck heave amplitude (m, ~7 s wave period) & roll amplitude (deg, ~8 s period) */
  readonly deckHeaveAmpM?: number;
  readonly deckRollAmpDeg?: number;
  readonly deckPhaseRad?: number;
  /** First-order actuator & throttle response lag time constant (seconds) */
  readonly actuatorLagS: number;
  /** Deterministic seed for step-level navigation noise */
  readonly seed: number;
}

export interface AscentGuidanceConfig {
  /** Altitude (m) at which pitchover maneuver begins (ASSUMED) */
  readonly pitchKickAltitudeM: number;
  /** Pitchover angle from vertical in degrees (ASSUMED) */
  readonly pitchKickAngleDeg: number;
  /** Duration over which pitchover kick is applied in seconds (ASSUMED) */
  readonly pitchKickDurationS: number;
  /** Dynamic pressure threshold (Pa) to begin max-Q throttle bucket (ASSUMED) */
  readonly maxQThrottleStartPa: number;
  /** Mach number above which max-Q throttle ramps back to 100% (ASSUMED) */
  readonly maxQThrottleEndMach: number;
  /** Minimum throttle fraction during max-Q bucket (ASSUMED) */
  readonly maxQMinThrottle: number;
  /** Minimum S1 propellant fraction reserved at MECO for recovery */
  readonly mecoPropellantReserveFraction: number;
  /** Optional override for S1 max axial acceleration (g) (e.g. crewed flights) */
  readonly maxAxialAccelG?: number;
  /** Coast time (s) from MECO to stage separation (ASSUMED ~3-4 s) */
  readonly stageSepDelayS: number;
  /** Time (s) from MECO to Stage 2 ignition SES-1 (ASSUMED ~8-11 s) */
  readonly ses1DelayFromMecoS: number;
  /** Altitude (m) for fairing separation (skipped if hasFairing is false) */
  readonly fairingSepAltitudeM: number;
  /** Optional override for S2 max axial acceleration (g) */
  readonly stage2MaxAccelG?: number;
  /**
   * Optional explicit Stage 2 burn profile override.
   * When omitted, targetOrbitAltitudeM > 250,000 m automatically selects two-burn
   * Hohmann transfer (SES-1 -> transfer coast -> SES-2 circularization at apoapsis).
   */
  readonly twoBurn?: boolean;
  /** ASSUMED parking/transfer perigee altitude (m) for two-burn SES-1 (default 185,000 m) */
  readonly transferPerigeeAltitudeM?: number;
  /** When true (What-If), run solveMissionAscentDesign in the worker before simulating */
  readonly autoDesignAscent?: boolean;
}

export type AscentProfile = 'DIRECT' | 'TWO_BURN';

export interface MissionConfig {
  readonly id: string;
  readonly name: string;
  readonly launchSite: LaunchSiteConfig;
  /** Sourced mission ascent burn profile ('DIRECT' single-burn or 'TWO_BURN' Hohmann). Omitted only for What-If default (>250 km heuristic). */
  readonly ascentProfile?: AscentProfile;
  readonly payloadMassKg: number;
  /** False for Dragon capsules (no separable fairing halves) */
  readonly hasFairing: boolean;
  readonly targetOrbitAltitudeM: number;
  readonly targetInclinationDeg: number;
  /** 'ASCENDING' (northeast from Cape) or 'DESCENDING' (south from Vandenberg) */
  readonly launchDirection?: 'ASCENDING' | 'DESCENDING';
  /** Optional ISO mission date (YYYY-MM-DD) for historical landing zone / droneship availability. */
  readonly missionDate?: string;
  readonly landingMode: LandingMode;
  readonly landingSiteId?: LandingSiteId;
  readonly enableJ2: boolean;
  readonly dtS: number;
  /** Optional pre-launch terminal countdown duration in seconds (e.g. 10 -> T-10 s to T-0 clamp release). */
  readonly countdownS?: number;
  readonly maxSimTimeS: number;
  readonly wind: WindConfig;
  readonly dispersions?: DispersionConfig;
  readonly engineOuts: readonly EngineOutConfig[];
  readonly guidance: AscentGuidanceConfig;
}

export type AscentPhase =
  | 'PAD'
  | 'IGNITION'
  | 'VERTICAL_RISE'
  | 'PITCHOVER'
  | 'GRAVITY_TURN'
  | 'MAX_Q_THROTTLE'
  | 'MECO';

export type Stage2Phase =
  | 'ATTACHED'
  | 'COAST_TO_SES1'
  | 'STAGE2_BURN'
  | 'COAST_TO_SES2'
  | 'STAGE2_BURN_2'
  | 'SECO'
  | 'ORBIT';

export type BoosterPhase =
  | 'ASCENT'
  | 'MECO_COAST'
  | 'FLIP'
  | 'BOOSTBACK_BURN'
  | 'BALLISTIC_COAST'
  | 'ENTRY_BURN'
  | 'AERO_DESCENT'
  | 'LANDING_BURN'
  | 'LANDED'
  | 'CRASHED';

export interface EngineState {
  readonly index: number;
  readonly active: boolean;
  readonly failed: boolean;
  readonly throttle: number;
  readonly thrustN: number;
  readonly massFlowKgS: number;
}

export interface AtmosphereSample {
  readonly temperatureK: number;
  readonly pressurePa: number;
  readonly densityKgM3: number;
  readonly speedOfSoundMs: number;
}

/**
 * Core integrated physics state vector (ECI frame) for Stage 1 ascent.
 */
export interface DynamicState {
  readonly positionEci: Vec3;
  readonly velocityEci: Vec3;
  readonly stage1PropellantKg: number;
  /** Unit vector of thrust/vehicle nose direction in ECI */
  readonly attitudeEci: Vec3;
}

/**
 * Core integrated physics state for an independent stage body (S1 booster or S2).
 */
export interface BodyDynamicState {
  readonly positionEci: Vec3;
  readonly velocityEci: Vec3;
  readonly propellantKg: number;
  /** Unit vector of vehicle longitudinal axis (+nose) in ECI */
  readonly attitudeEci: Vec3;
}

export interface SimState {
  readonly timeS: number;
  readonly phase: AscentPhase;
  readonly dynamic: DynamicState;
  readonly totalMassKg: number;
  readonly geodetic: GeodeticCoord;
  readonly downrangeM: number;
  readonly speedInertialMs: number;
  readonly speedAirRelMs: number;
  readonly verticalSpeedMs: number;
  readonly horizontalSpeedMs: number;
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly dragN: number;
  readonly thrustN: number;
  readonly throttle: number;
  readonly axialAccelG: number;
  readonly pitchFromVerticalDeg: number;
  readonly angleOfAttackDeg: number;
  /** Aerodynamic load indicator q * alpha (Pa * deg) */
  readonly qAlphaPaDeg: number;
  readonly engines: readonly EngineState[];
  readonly atmosphere: AtmosphereSample;
}

export interface Stage2State {
  readonly timeS: number;
  readonly phase: Stage2Phase;
  readonly dynamic: BodyDynamicState;
  readonly fairingAttached: boolean;
  readonly totalMassKg: number;
  readonly geodetic: GeodeticCoord;
  readonly downrangeM: number;
  readonly speedInertialMs: number;
  readonly speedEarthRelMs: number;
  readonly verticalSpeedMs: number;
  readonly horizontalSpeedMs: number;
  readonly thrustN: number;
  readonly throttle: number;
  readonly axialAccelG: number;
  readonly pitchAboveHorizonDeg: number;
  readonly engines: readonly EngineState[];
}

export interface BoosterState {
  readonly timeS: number;
  readonly phase: BoosterPhase;
  readonly dynamic: BodyDynamicState;
  readonly totalMassKg: number;
  readonly geodetic: GeodeticCoord;
  readonly downrangeM: number;
  readonly distanceToTargetM: number;
  readonly speedInertialMs: number;
  readonly speedAirRelMs: number;
  readonly verticalSpeedMs: number;
  readonly horizontalSpeedMs: number;
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly dragN: number;
  readonly thrustN: number;
  readonly throttle: number;
  readonly axialAccelG: number;
  /** Angle between booster longitudinal axis and local vertical (degrees) */
  readonly tiltFromVerticalDeg: number;
  /** Grid fin deflection command in degrees [-20, +20] */
  readonly gridFinDeflectionDeg: number;
  readonly landingLegsDeployed: boolean;
  readonly engines: readonly EngineState[];
}

export interface OrbitalElements {
  readonly semiMajorAxisM: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly perigeeAltitudeM: number;
  readonly apogeeAltitudeM: number;
  readonly specificEnergyJKg: number;
}

export type MissionEventType =
  | 'IGNITION'
  | 'LIFTOFF'
  | 'PITCHOVER'
  | 'MAX_Q'
  | 'ENGINE_OUT'
  | 'MECO'
  | 'STAGE_SEP'
  | 'SES_1'
  | 'FAIRING_SEP'
  | 'SECO_1'
  | 'SES_2'
  | 'SECO_2'
  | 'FLIP_START'
  | 'BOOSTBACK_START'
  | 'BOOSTBACK_END'
  | 'APOGEE'
  | 'ENTRY_BURN_START'
  | 'ENTRY_BURN_END'
  | 'LANDING_BURN_START'
  | 'LANDING_LEGS_DEPLOY'
  | 'TOUCHDOWN'
  | 'CRASH';

export interface MissionEvent {
  readonly type: MissionEventType;
  readonly timeS: number;
  readonly altitudeM: number;
  readonly speedMs: number;
  readonly downrangeM: number;
  readonly detail: string;
}

export interface AscentRunResult {
  readonly finalState: SimState;
  readonly events: readonly MissionEvent[];
  readonly samples: readonly SimState[];
  readonly peakDynamicPressurePa: number;
  readonly peakDynamicPressureTimeS: number;
  readonly peakQAlphaPaDeg: number;
  readonly peakQAlphaTimeS: number;
  readonly peakAxialAccelG: number;
  readonly launchAzimuthDeg: number;
}

export interface FullMissionResult {
  readonly ascent: AscentRunResult;
  readonly stage2Samples: readonly Stage2State[];
  readonly stage2Final: Stage2State;
  readonly boosterSamples: readonly BoosterState[];
  readonly boosterFinal: BoosterState;
  readonly orbit: OrbitalElements;
  readonly landingTarget: GeodeticCoord;
  readonly boosterOutcome: 'LANDED' | 'CRASHED' | 'EXPENDED';
  readonly boosterFailureReason?: string;
  readonly orbitAchieved: boolean;
  readonly events: readonly MissionEvent[];
}
