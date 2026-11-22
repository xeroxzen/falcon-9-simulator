import type { AscentGuidanceConfig, MissionConfig } from '../types.js';
import { LAUNCH_SITES } from './falcon9.js';

/**
 * Shared baseline Falcon 9 Block 5 ascent guidance parameters (ASSUMED).
 * Used WITHOUT per-mission retuning on holdout validation flights.
 */
const BASELINE_ASDS_GUIDANCE: AscentGuidanceConfig = {
  /** ASSUMED: Clear tower (~150 m) before pitchover */
  pitchKickAltitudeM: 150,
  /** Mission-design pitchover kick solved by solveMissionPitchKickDeg (meets orbit + >=4,000 kg ASDS 3-sigma margin) */
  pitchKickAngleDeg: 1.90,
  /** ASSUMED: Smooth pitchover duration */
  pitchKickDurationS: 8.0,
  /** ASSUMED: Max-Q throttle bucket entry threshold (triggers ~T+46-52 s) */
  maxQThrottleStartPa: 22_000,
  /** ASSUMED: Ramp back to 100% by Mach 1.38 */
  maxQThrottleEndMach: 1.38,
  /** ASSUMED: Throttle-down to 72% through max-Q */
  maxQMinThrottle: 0.72,
  /** ASSUMED: 7.5% S1 propellant reserve at MECO for ASDS entry + landing */
  mecoPropellantReserveFraction: 0.075,
  stageSepDelayS: 3.5,
  ses1DelayFromMecoS: 8.0,
  fairingSepAltitudeM: 115_000,
};

const BASELINE_RTLS_GUIDANCE: AscentGuidanceConfig = {
  ...BASELINE_ASDS_GUIDANCE,
  /** Mission-design pitchover kick & MECO reserve solved jointly by solveMissionAscentDesign (meets orbit + >=7,500 kg RTLS 3-sigma margin) */
  pitchKickAngleDeg: 1.40,
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
    /** Mission-design pitchover kick solved by solveMissionAscentDesign for SLC-40 -> LZ-40 */
    pitchKickAngleDeg: 1.35,
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
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 720,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  guidance: {
    ...BASELINE_ASDS_GUIDANCE,
    /** Part D MAP Variant A per-flight nuisance pitch-kick estimate (replaces hard-coded 1.25 deg) */
    pitchKickAngleDeg: 1.28,
    /** ASSUMED: Human-rated max-Q bucket & 3.0 g axial cap */
    maxQThrottleStartPa: 21_500,
    maxQThrottleEndMach: 1.42,
    maxQMinThrottle: 0.62,
    mecoPropellantReserveFraction: 0.085,
    maxAxialAccelG: 3.0,
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
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 4_200,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  guidance: BASELINE_ASDS_GUIDANCE,
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
  enableJ2: true,
  dtS: 0.01,
  countdownS: 60,
  maxSimTimeS: 900,
  wind: { eastMs: 0, northMs: 0, upMs: 0 },
  engineOuts: [],
  guidance: BASELINE_RTLS_GUIDANCE,
};
