import type {
  EngineSpec,
  LandingSiteConfig,
  LaunchSiteConfig,
  VehicleConfig,
} from '../types.js';
import { SEA_LEVEL_PRESSURE_PA } from './constants.js';

/**
 * Falcon 9 Block 5 vehicle and propulsion configuration.
 *
 * Every value includes its public source or is explicitly marked ASSUMED
 * with rationale. See docs/ASSUMPTIONS.md for full discussion.
 */

// ---------------------------------------------------------------------------
// Merlin 1D (Stage 1, sea-level variant)
// ---------------------------------------------------------------------------
// Source: SpaceX Falcon User's Guide & SpaceX Falcon 9 spec page:
//   - 9x Merlin 1D total sea-level thrust = 7,607 kN -> 845.222 kN/engine
//   - 9x Merlin 1D total vacuum thrust   = 8,227 kN -> 914.111 kN/engine
//   - Vacuum Isp = 311 s (public SpaceX / aerospace reference value)
//
// Physics consistency note:
//   For a choked nozzle at fixed chamber pressure, mass flow mdot is
//   independent of ambient pressure: mdot = T_vac / (Isp_vac * g0).
//   Using T_sl = 7,607/9 kN and T_vac = 8,227/9 kN gives:
//     A_exit = (T_vac - T_sl) / p0 = 0.67988 m^2 (exit diameter ~0.930 m,
//     matching the publicly reported ~0.92 m Merlin 1D nozzle diameter).
//   The corresponding choked-flow sea-level Isp is:
//     Isp_sl = Isp_vac * (T_sl / T_vac) = 287.56 s.
const MERLIN_1D_THRUST_SL_N = 7_607_000 / 9; // 845,222.22 N per engine
const MERLIN_1D_THRUST_VAC_N = 8_227_000 / 9; // 914,111.11 N per engine
const MERLIN_1D_EXIT_AREA_M2 =
  (MERLIN_1D_THRUST_VAC_N - MERLIN_1D_THRUST_SL_N) / SEA_LEVEL_PRESSURE_PA;
const MERLIN_1D_ISP_VAC_S = 311.0;
const MERLIN_1D_ISP_SL_S =
  MERLIN_1D_ISP_VAC_S * (MERLIN_1D_THRUST_SL_N / MERLIN_1D_THRUST_VAC_N);

export const MERLIN_1D_SPEC: EngineSpec = {
  name: 'Merlin 1D (Block 5)',
  thrustSeaLevelN: MERLIN_1D_THRUST_SL_N,
  thrustVacuumN: MERLIN_1D_THRUST_VAC_N,
  ispSeaLevelS: MERLIN_1D_ISP_SL_S,
  ispVacuumS: MERLIN_1D_ISP_VAC_S,
  exitAreaM2: MERLIN_1D_EXIT_AREA_M2,
  /** ASSUMED: Publicly cited Merlin 1D deep-throttle capability is ~40% */
  minThrottle: 0.4,
  maxThrottle: 1.0,
};

// ---------------------------------------------------------------------------
// Merlin 1D Vacuum (Stage 2, MVac)
// ---------------------------------------------------------------------------
// Source: SpaceX Falcon 9 spec page:
//   - Vacuum thrust = 981 kN (220,500 lbf)
//   - Vacuum Isp    = 348 s
export const MVAC_SPEC: EngineSpec = {
  name: 'Merlin 1D Vacuum (MVac)',
  thrustSeaLevelN: 0,
  thrustVacuumN: 981_000,
  ispSeaLevelS: 0,
  ispVacuumS: 348.0,
  /** ASSUMED: ~3.3 m MVac radiatively cooled nozzle extension */
  exitAreaM2: Math.PI * 1.65 * 1.65,
  /** ASSUMED: MVac minimum throttle ~39-40% */
  minThrottle: 0.39,
  maxThrottle: 1.0,
};

const CORE_DIAMETER_M = 3.7;

export const FALCON9_BLOCK5: VehicleConfig = {
  name: 'Falcon 9 Block 5',
  /** Source: SpaceX Falcon User's Guide (70 m) */
  totalHeightM: 70.0,
  /** Source: SpaceX Falcon User's Guide (3.7 m) */
  coreDiameterM: CORE_DIAMETER_M,
  /** Source: SpaceX Falcon User's Guide (5.2 m) */
  fairingDiameterM: 5.2,
  /** Source: SpaceX Falcon User's Guide (13.1 m) */
  fairingLengthM: 13.1,
  /** Source: Public SpaceX / Wikipedia F9 Block 5 specs (~1,900 kg both halves) */
  fairingMassKg: 1_900,
  /** Core cross-sectional reference area pi*(3.7/2)^2 = 10.7521 m^2 */
  referenceAreaM2: Math.PI * (CORE_DIAMETER_M / 2) * (CORE_DIAMETER_M / 2),
  stage1: {
    name: 'Falcon 9 Stage 1 (Booster)',
    /** ASSUMED: Block 5 reusable dry mass with landing legs, octaweb thermal shield & Ti grid fins (~27.2 t) */
    dryMassKg: 27_200,
    /** ASSUMED/Sourced est.: Subcooled LOX/RP-1 Block 5 load (~395.7-411 t) */
    propellantMassKg: 411_000,
    diameterM: CORE_DIAMETER_M,
    /** Source: Public Falcon 9 Block 5 geometry (~42.6 m incl. interstage) */
    lengthM: 42.6,
    engineCount: 9,
    engine: MERLIN_1D_SPEC,
  },
  stage2: {
    name: 'Falcon 9 Stage 2',
    /** ASSUMED/Sourced est.: Publicly cited ~4,000-4,500 kg dry mass */
    dryMassKg: 4_500,
    /** ASSUMED/Sourced est.: Subcooled LOX/RP-1 Block 5 load (publicly cited ~111,500 kg) */
    propellantMassKg: 111_500,
    diameterM: CORE_DIAMETER_M,
    /** Source: Public Falcon 9 Block 5 geometry (~12.6 m) */
    lengthM: 12.6,
    engineCount: 1,
    engine: MVAC_SPEC,
  },
  /** ASSUMED: Typical Falcon 9 S1 axial acceleration limit (~4.5 g before MECO) */
  maxAxialAccelG: 4.5,
  /** ASSUMED: Simplified 3-DOF ascent attitude slew rate limit (5 deg/s) */
  maxAttitudeSlewRateRadS: (5.0 * Math.PI) / 180.0,
  /** ASSUMED: Simplified cold-gas RCS booster flip slew rate (12 deg/s -> ~15 s for 180 deg flip) */
  boosterFlipSlewRateRadS: (12.0 * Math.PI) / 180.0,
};

// ---------------------------------------------------------------------------
// Launch & Landing Sites (WGS-84)
// ---------------------------------------------------------------------------
export const LAUNCH_SITES: Record<'LC-39A' | 'SLC-40' | 'SLC-4E', LaunchSiteConfig> = {
  'LC-39A': {
    id: 'LC-39A',
    name: 'Kennedy Space Center LC-39A',
    latDeg: 28.60833,
    lonDeg: -80.60444,
    elevationM: 15.0,
    source: 'KSC / WGS-84 geodetic coordinates (28°36\'30"N, 80°36\'16"W, ~15 m AMSL)',
  },
  'SLC-40': {
    id: 'SLC-40',
    name: 'Cape Canaveral Space Force Station SLC-40',
    latDeg: 28.5619,
    lonDeg: -80.5772,
    elevationM: 4.0,
    source: 'CCSFS / WGS-84 geodetic coordinates (28°33\'43"N, 80°34\'38"W, ~4 m AMSL)',
  },
  'SLC-4E': {
    id: 'SLC-4E',
    name: 'Vandenberg Space Force Base SLC-4E',
    latDeg: 34.6320,
    lonDeg: -120.6107,
    elevationM: 114.0,
    source: 'VSFB / WGS-84 geodetic coordinates (34°37\'55"N, 120°36\'38"W, ~114 m AMSL)',
  },
};

export const LANDING_SITES: Record<'LZ-1' | 'LZ-4', LandingSiteConfig> = {
  'LZ-1': {
    id: 'LZ-1',
    name: 'Cape Canaveral Landing Zone 1 (LZ-1)',
    latDeg: 28.48575,
    lonDeg: -80.54294,
    elevationM: 3.0,
    source: 'CCSFS former LC-13 / WGS-84 (28°29\'08.7"N, 80°32\'34.6"W, ~3 m AMSL)',
  },
  'LZ-4': {
    id: 'LZ-4',
    name: 'Vandenberg Landing Zone 4 (LZ-4)',
    latDeg: 34.6342,
    lonDeg: -120.6150,
    elevationM: 114.0,
    source: 'VSFB former SLC-4W / WGS-84 (34°38\'03"N, 120°36\'54"W, ~114 m AMSL)',
  },
};

/**
 * ASSUMED Mach-dependent drag coefficient Cd(M) for Falcon 9 ascent stack
 * referenced to core cross-sectional area (10.7521 m^2).
 *
 * Accounts for the 5.2 m hammerhead fairing (21.24 m^2 = 1.98x core area),
 * folded landing legs, and stowed grid fins:
 *  - Subsonic Cd_core ~ 0.48 (equivalent to Cd_fairing ~ 0.24)
 *  - Transonic wave-drag peak ~ 0.88 at M = 1.05
 *  - Supersonic decay toward ~ 0.36 at M >= 4.0
 */
export const ASCENT_CD_MACH_TABLE: readonly (readonly [number, number])[] = [
  [0.0, 0.48],
  [0.5, 0.48],
  [0.8, 0.56],
  [0.95, 0.76],
  [1.05, 0.88],
  [1.2, 0.80],
  [1.5, 0.66],
  [2.0, 0.52],
  [3.0, 0.42],
  [4.0, 0.36],
  [6.0, 0.32],
  [10.0, 0.30],
];

/**
 * ASSUMED Mach-dependent drag coefficient Cd(M) for tail-first descending
 * Stage 1 booster (blunt octaweb base + deployed titanium grid fins),
 * referenced to core cross-sectional area (10.7521 m^2).
 */
export const BOOSTER_DESCENT_CD_MACH_TABLE: readonly (readonly [number, number])[] = [
  [0.0, 0.85],
  [0.5, 0.90],
  [0.85, 1.15],
  [1.1, 1.45],
  [1.5, 1.35],
  [2.5, 1.15],
  [4.0, 1.05],
  [8.0, 1.00],
];
