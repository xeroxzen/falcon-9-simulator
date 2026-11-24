import type { AscentGuidanceConfig, MissionConfig } from '../types.js';
import { MISSION_CLASS_SCHEDULES } from '../guidance/mission-design.js';
import { LAUNCH_SITES } from './falcon9.js';
import { CONSTANTS_REGISTRY as R } from './registry.js';

/**
 * Shared baseline Falcon 9 Block 5 LEO ascent guidance parameters.
 * Throttle-bucket & S1 late-burn accel limit from Mission-Class MAP fit (Class 0 LEO);
 * used WITHOUT per-mission retuning on holdout validation flights.
 */
const BASELINE_ASDS_GUIDANCE: AscentGuidanceConfig = {
  /** ASSUMED: Clear tower (~150 m) before pitchover */
  pitchKickAltitudeM: R.ASCENT_PITCH_KICK_ALTITUDE_M.value,
  /** Mission-design pitchover kick solved by solveMissionAscentDesign (2.90 g LEO + predictive Sutton-Graves entry burn) */
  pitchKickAngleDeg: 1.9,
  /** ASSUMED: Smooth pitchover duration */
  pitchKickDurationS: R.ASCENT_PITCH_KICK_DURATION_S.value,
  /** Shared v1 max-Q throttle bucket (22 kPa, Mach 1.02..1.38, 72% min throttle) */
  maxQThrottleStartPa: R.ASCENT_MAX_Q_THROTTLE_START_PA.value,
  maxQThrottleEndMach: R.ASCENT_MAX_Q_THROTTLE_END_MACH.value,
  maxQMinThrottle: R.ASCENT_MAX_Q_MIN_THROTTLE.value,
  /** Simplified Mission-Class MAP (Class 0 LEO): per-class S1 late-burn accel limit only */
  maxAxialAccelG: MISSION_CLASS_SCHEDULES.LEO.maxAxialAccelG,
  /** ASSUMED: 7.5% S1 propellant reserve at MECO for ASDS entry + landing */
  mecoPropellantReserveFraction: 0.075,
  stageSepDelayS: R.STAGE_SEP_DELAY_S.value,
  ses1DelayFromMecoS: R.SES1_DELAY_FROM_MECO_S.value,
  fairingSepAltitudeM: R.FAIRING_SEP_ALTITUDE_M.value,
};

const BASELINE_RTLS_GUIDANCE: AscentGuidanceConfig = {
  ...BASELINE_ASDS_GUIDANCE,
  /** Mission-design pitchover kick & MECO reserve solved jointly by solveMissionAscentDesign with Class 0 LEO 2.90 g cap */
  pitchKickAngleDeg: 1.35,
  mecoPropellantReserveFraction: 0.145,
};

export const DEFAULT_LEO_ASDS_MISSION: MissionConfig = {
  id: 'leo-asds-lc39a',
  name: 'LEO 200 km (51.6° incl.) — ASDS Recovery from LC-39A',
  launchSite: LAUNCH_SITES['LC-39A'],
  missionDate: '2026-06-01',
  payloadMassKg: 12_000,
  hasFairing: true,
  targetOrbitAltitudeM: 200_000,
  targetInclinationDeg: 51.6,
  landingMode: 'ASDS',
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 720,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  guidance: BASELINE_ASDS_GUIDANCE,
};

export const DEFAULT_LEO_RTLS_MISSION: MissionConfig = {
  ...DEFAULT_LEO_ASDS_MISSION,
  id: 'leo-rtls-slc40',
  name: 'LEO 200 km (28.6° incl.) — RTLS (LZ-40) from SLC-40',
  launchSite: LAUNCH_SITES['SLC-40'],
  missionDate: '2026-06-01',
  payloadMassKg: 5_000,
  targetInclinationDeg: 28.6,
  landingMode: 'RTLS',
  landingSiteId: 'LZ-40',
  guidance: {
    ...BASELINE_RTLS_GUIDANCE,
    /** Mission-design pitchover kick, reserve & boostback pitch solved jointly by solveMissionAscentDesign for SLC-40 -> LZ-40 */
    pitchKickAngleDeg: 1.1,
    mecoPropellantReserveFraction: 0.125,
    boostbackPitchDeg: -19,
  },
};

/**
 * Crew Dragon Demo-1 (SpX-DM1) — March 2, 2019 (Falcon 9 Block 5 B1051.1)
 *
 * Sources:
 *  - Launch site: KSC LC-39A (SpaceX / NASA DM-1 press kit)
 *  - Spacecraft launch mass: 12,055 kg Crew Dragon C204 + trunk (Wikipedia / NASA)
 *  - No payload fairing (Crew Dragon capsule + trunk replaces fairing)
 *  - Target orbit: ~198 km insertion, 51.66° inclination (ISS rendezvous)
 *  - Webcast events (Telemetry-Data/DM-1/JSON/events.json):
 *      maxq = 59 s, throttle_down = 44..71 s, meco = 158 s, ses1 = 169 s
 *
 * Human-rated flight differences (documented ASSUMED):
 *  - Crewed Dragon flights cap axial G at ~3.0-3.2 g and fly a steeper loft
 *    for pad/ascent abort envelope safety (MECO alt 85.3 km vs ~68 km nominal).
 */
export const DM1_MISSION: MissionConfig = {
  id: 'dm-1',
  name: 'Crew Dragon Demo-1 (DM-1) — Falcon 9 Block 5 B1051.1',
  launchSite: LAUNCH_SITES['LC-39A'],
  missionDate: '2019-03-02',
  /** Source: NASA / SpaceX DM-1 Press Kit (single-burn direct insertion to ~198 km ISS phasing orbit) */
  ascentProfile: 'DIRECT',
  payloadMassKg: 12_055,
  hasFairing: false,
  targetOrbitAltitudeM: 198_000,
  targetInclinationDeg: 51.66,
  landingMode: 'ASDS',
  fittedKickProvenance: {
    modelVersion: 'v1.7.0',
    commit: '7e71b8c',
    sourceTelemetry: 'Telemetry-Data/DM-1',
  },
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 720,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  guidance: {
    ...BASELINE_ASDS_GUIDANCE,
    /** Telemetry-fitted ascent pitch kick for DM-1 under v1.7.0 (2.90 g LEO, tOff = 0) */
    pitchKickAngleDeg: 1.56,
    mecoPropellantReserveFraction: 0.085,
    /** Sourced: DM-1 events.json (MECO 158 s -> SES-1 169 s = 11 s) */
    ses1DelayFromMecoS: 11.0,
  },
};

/**
 * HOLDOUT #1 (ZERO RETUNING): Iridium NEXT 8 — January 11, 2019 (Falcon 9 Block 5 B1049.2)
 * Uses exact BASELINE_ASDS_GUIDANCE with ZERO mission-specific tuning.
 * Automatically selects two-burn Hohmann transfer (targetOrbitAltitudeM > 250 km).
 *
 * Published Sources (NOT inferred from sim):
 *  - Launch site: Vandenberg SLC-4E (southbound descending polar launch; SpaceX Iridium-8 Press Kit)
 *  - Payload mass: 9,600 kg (10x Iridium NEXT @ 860 kg + 1,000 kg dispenser; SpaceX / Wikipedia)
 *  - Target orbit: 625 km circular polar LEO, 86.4°–86.6° inclination (SpaceX Iridium-8 Press Kit / Spaceflight Now)
 *  - Published SpaceX timeline (Spaceflight Now / Iridium-8 Press Kit):
 *      SECO-1 = T+00:08:46 (526 s) into ~183 x 625 km transfer orbit,
 *      ~43 min coast, SES-2 = T+00:51:48 (3,108 s), SECO-2 = T+00:51:51 (3,111 s, ~3 s burn)
 *  - Recovery: ASDS (Just Read The Instructions)
 */
export const IRIDIUM_NEXT_8_MISSION: MissionConfig = {
  id: 'iridium-next-8',
  name: 'Iridium NEXT 8 (Holdout ASDS) — Falcon 9 Block 5 B1049.2',
  launchSite: LAUNCH_SITES['SLC-4E'],
  missionDate: '2019-01-11',
  /** Source: SpaceX Iridium-8 Press Kit (two-burn Hohmann transfer: SECO-1 8:46, SES-2 51:48, SECO-2 51:51) */
  ascentProfile: 'TWO_BURN',
  payloadMassKg: 9_600,
  hasFairing: true,
  targetOrbitAltitudeM: 625_000,
  targetInclinationDeg: 86.6,
  launchDirection: 'DESCENDING',
  landingMode: 'ASDS',
  /** ASSUMED: 244 km downrange (not published in SpaceX press kit; estimated from Pacific NOTMAR hazard zone & 33 s boostback burn). */
  droneshipDownrangeKm: R.IRIDIUM_8_DRONESHIP_DOWNRANGE_KM.value,
  fittedKickProvenance: {
    modelVersion: 'v1.7.0',
    commit: '7e71b8c',
    sourceTelemetry: 'Telemetry-Data/Iridium NEXT 8',
  },
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 4_200,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  /**
   * Historical mission rule: telemetry-fitted ascent pitch kick (1.63 deg),
   * with recovery variables (10.5% MECO reserve, -25 deg boostback pitch)
   * solved by solveMissionAscentDesign at droneshipDownrangeKm = 244 km.
   */
  guidance: {
    ...BASELINE_ASDS_GUIDANCE,
    pitchKickAngleDeg: 1.63,
    mecoPropellantReserveFraction: 0.075,
    boostbackPitchDeg: -34,
  },
};

/**
 * HOLDOUT #2 (ZERO RETUNING): SAOCOM 1A — October 8, 2018 (Falcon 9 Block 5 B1048.2)
 * Uses exact BASELINE_RTLS_GUIDANCE with ZERO mission-specific tuning.
 * Also used for post-separation Stage 1 booster telemetry validation (has full
 * stage1 raw.json through boostback, apogee 134 km, entry burn, and LZ-4 landing).
 *
 * Published Sources (NOT inferred from sim):
 *  - Launch site: Vandenberg SLC-4E (southbound descending SSO launch; SpaceX SAOCOM 1A Press Kit)
 *  - Payload mass: 3,050 kg (CONAE SAOCOM 1A wet mass; ESA / Wikipedia)
 *  - Target orbit: 620 km (620–623 km) Sun-Synchronous Orbit, 97.89° inclination (ESA / SpaceX)
 *  - Burn profile: Single-burn direct insertion (`ascentProfile: 'DIRECT'`; SpaceX SAOCOM 1A Press Kit:
 *      SECO-1 = T+00:10:07 = 607 s, payload deploy T+00:12:37, no SES-2).
 *  - Recovery: RTLS to Vandenberg LZ-4
 */
export const SAOCOM_1A_MISSION: MissionConfig = {
  id: 'saocom-1a',
  name: 'SAOCOM 1A (Holdout RTLS + Booster Validation) — Falcon 9 Block 5 B1048.2',
  launchSite: LAUNCH_SITES['SLC-4E'],
  missionDate: '2018-10-08',
  /** Source: SpaceX SAOCOM 1A Press Kit (single-burn direct insertion, SECO-1 T+00:10:07, no SES-2) */
  ascentProfile: 'DIRECT',
  payloadMassKg: 3_050,
  hasFairing: true,
  targetOrbitAltitudeM: 620_000,
  targetInclinationDeg: 97.89,
  launchDirection: 'DESCENDING',
  landingMode: 'RTLS',
  landingSiteId: 'LZ-4',
  fittedKickProvenance: {
    modelVersion: 'v1.7.0',
    commit: '7e71b8c',
    sourceTelemetry: 'Telemetry-Data/SAOCOM 1A',
  },
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 900,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  /**
   * Historical mission rule: telemetry-fitted ascent pitch kick (1.10 deg),
   * with recovery variables (14.5% RTLS reserve, -19 deg boostback pitch)
   * solved by solveMissionAscentDesign for SLC-4E -> LZ-4.
   */
  guidance: {
    ...BASELINE_RTLS_GUIDANCE,
    pitchKickAngleDeg: 1.1,
    mecoPropellantReserveFraction: 0.135,
    boostbackPitchDeg: -10,
  },
};
