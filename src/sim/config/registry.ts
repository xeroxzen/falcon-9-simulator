/**
 * Central Physics & Guidance Constants Registry (Single Source of Truth).
 *
 * Every SOURCED, CALIBRATED, EMPIRICAL, ASSUMED, and HEURISTIC constant used by
 * the pure-TypeScript simulation core lives here with full provenance:
 *   - value, unit, label, category
 *   - source or derivation
 *   - flights calibrated on (if applicable)
 *   - git commit hash where the value was established/verified
 *
 * The tables in docs/ASSUMPTIONS.md are generated directly from this registry
 * (and verified in tests/constants-registry.test.ts) so docs cannot drift from code.
 */

export type ConstantLabel =
  | 'SOURCED'
  | 'CALIBRATED'
  | 'EMPIRICAL'
  | 'ASSUMED'
  | 'HEURISTIC';

export type ConstantCategory =
  | 'Planetary & Atmosphere'
  | 'Vehicle & Propulsion'
  | 'Aerodynamics'
  | 'Ascent & Stage 2 Guidance'
  | 'Booster Recovery & Entry'
  | 'Mission Design & Solver'
  | 'Monte Carlo & Navigation';

export type ConstantValue = number | readonly (readonly [number, number])[];

export interface RegistryEntry<T extends ConstantValue = ConstantValue> {
  readonly id: string;
  readonly value: T;
  readonly unit: string;
  readonly label: ConstantLabel;
  readonly category: ConstantCategory;
  readonly sourceOrDerivation: string;
  /** Flights used for calibration/fit, or empty when not calibrated on flight telemetry. */
  readonly calibratedOn: readonly string[];
  /** Git commit hash (short) where this value was established or last updated. */
  readonly commit: string;
  /** Optional prior/posterior uncertainty note for MAP-fitted or calibrated values. */
  readonly uncertainty?: string;
}

function entry<T extends ConstantValue>(def: RegistryEntry<T>): RegistryEntry<T> {
  return def;
}

export const CONSTANTS_REGISTRY = {
  // =========================================================================
  // 1. Planetary & Atmosphere
  // =========================================================================
  G0: entry({
    id: 'G0',
    value: 9.80665,
    unit: 'm/s^2',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'CGPM 1901 / ISO 80000-3 standard gravity',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_MU: entry({
    id: 'EARTH_MU',
    value: 3.986004418e14,
    unit: 'm^3/s^2',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'WGS-84 (NIMA TR8350.2) geocentric gravitational constant',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_RADIUS_EQUATORIAL_M: entry({
    id: 'EARTH_RADIUS_EQUATORIAL_M',
    value: 6_378_137.0,
    unit: 'm',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'WGS-84 (NIMA TR8350.2) equatorial semi-major axis a',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_FLATTENING: entry({
    id: 'EARTH_FLATTENING',
    value: 1.0 / 298.257223563,
    unit: '1',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'WGS-84 (NIMA TR8350.2) flattening f = 1 / 298.257223563',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_RADIUS_MEAN_M: entry({
    id: 'EARTH_RADIUS_MEAN_M',
    value: 6_371_008.8,
    unit: 'm',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'WGS-84 mean Earth radius for great-circle downrange',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_OMEGA_RAD_S: entry({
    id: 'EARTH_OMEGA_RAD_S',
    value: 7.292115e-5,
    unit: 'rad/s',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'WGS-84 (NIMA TR8350.2) Earth sidereal rotation rate',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  EARTH_J2: entry({
    id: 'EARTH_J2',
    value: 1.08262668e-3,
    unit: '1',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'EGM96 / WGS-84 second zonal harmonic J2',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  US76_R0_M: entry({
    id: 'US76_R0_M',
    value: 6_356_766.0,
    unit: 'm',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 (NOAA-S/T 76-1562) effective radius r0',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  SEA_LEVEL_PRESSURE_PA: entry({
    id: 'SEA_LEVEL_PRESSURE_PA',
    value: 101_325.0,
    unit: 'Pa',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 sea-level pressure p0',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  SEA_LEVEL_TEMP_K: entry({
    id: 'SEA_LEVEL_TEMP_K',
    value: 288.15,
    unit: 'K',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 sea-level temperature T0',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  AIR_GAS_CONSTANT: entry({
    id: 'AIR_GAS_CONSTANT',
    value: 287.05287,
    unit: 'J/(kg*K)',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 specific gas constant for dry air',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  AIR_GAMMA: entry({
    id: 'AIR_GAMMA',
    value: 1.4,
    unit: '1',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 ratio of specific heats for dry air',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  US76_TOP_GEOMETRIC_M: entry({
    id: 'US76_TOP_GEOMETRIC_M',
    value: 86_000.0,
    unit: 'm',
    label: 'SOURCED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'US Standard Atmosphere 1976 top of 7-layer geopotential model',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ATMO_UPPER_SCALE_HEIGHT_M: entry({
    id: 'ATMO_UPPER_SCALE_HEIGHT_M',
    value: 5_800.0,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'Exponential scale height continuation above 86 km in lower thermosphere',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ATMO_VACUUM_CUTOFF_M: entry({
    id: 'ATMO_VACUUM_CUTOFF_M',
    value: 200_000.0,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'Altitude above which atmospheric density and pressure are treated as vacuum (0)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ASSUMED_MAX_Q_ALPHA_PA_DEG: entry({
    id: 'ASSUMED_MAX_Q_ALPHA_PA_DEG',
    value: 200_000,
    unit: 'Pa*deg',
    label: 'ASSUMED',
    category: 'Planetary & Atmosphere',
    sourceOrDerivation: 'Representative orbital launch vehicle structural bending-moment envelope (~3.49 kPa*rad)',
    calibratedOn: [],
    commit: 'v1.1.0',
  }),

  // =========================================================================
  // 2. Vehicle & Propulsion
  // =========================================================================
  MERLIN_1D_THRUST_VAC_N: entry({
    id: 'MERLIN_1D_THRUST_VAC_N',
    value: 908_722,
    unit: 'N',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 914.11 +/- 6.00 kN SpaceX spec = 8,227 kN / 9)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '908.72 +/- 5.63 kN/engine',
  }),
  MERLIN_1D_EXIT_AREA_M2: entry({
    id: 'MERLIN_1D_EXIT_AREA_M2',
    value: 0.680,
    unit: 'm^2',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 0.680 +/- 0.015 m^2 from SpaceX (T_vac - T_sl) / p0, d_exit = 0.931 m)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '0.680 +/- 0.015 m^2',
  }),
  MERLIN_1D_ISP_VAC_S: entry({
    id: 'MERLIN_1D_ISP_VAC_S',
    value: 311.04,
    unit: 's',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 311.0 +/- 2.0 s SpaceX spec)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '311.04 +/- 1.91 s',
  }),
  MERLIN_1D_MIN_THROTTLE: entry({
    id: 'MERLIN_1D_MIN_THROTTLE',
    value: 0.4,
    unit: '1',
    label: 'ASSUMED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Publicly cited Merlin 1D Block 5 deep-throttle floor (~40%)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  MVAC_THRUST_VAC_N: entry({
    id: 'MVAC_THRUST_VAC_N',
    value: 983_169,
    unit: 'N',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 981.0 +/- 10.0 kN SpaceX spec)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '983.17 +/- 9.26 kN',
  }),
  MVAC_ISP_VAC_S: entry({
    id: 'MVAC_ISP_VAC_S',
    value: 347.90,
    unit: 's',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 348.0 +/- 2.0 s SpaceX spec)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '347.90 +/- 1.98 s',
  }),
  MVAC_NOZZLE_RADIUS_M: entry({
    id: 'MVAC_NOZZLE_RADIUS_M',
    value: 1.65,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Approximate 3.3 m diameter MVac radiatively cooled nozzle extension',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  MVAC_MIN_THROTTLE: entry({
    id: 'MVAC_MIN_THROTTLE',
    value: 0.39,
    unit: '1',
    label: 'ASSUMED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Publicly cited MVac minimum throttle (~39-40%)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_TOTAL_HEIGHT_M: entry({
    id: 'F9_TOTAL_HEIGHT_M',
    value: 70.0,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: "SpaceX Falcon User's Guide (70 m overall vehicle height)",
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_CORE_DIAMETER_M: entry({
    id: 'F9_CORE_DIAMETER_M',
    value: 3.7,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: "SpaceX Falcon User's Guide (3.7 m core diameter)",
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_FAIRING_DIAMETER_M: entry({
    id: 'F9_FAIRING_DIAMETER_M',
    value: 5.2,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: "SpaceX Falcon User's Guide (5.2 m fairing diameter)",
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_FAIRING_LENGTH_M: entry({
    id: 'F9_FAIRING_LENGTH_M',
    value: 13.1,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: "SpaceX Falcon User's Guide (13.1 m fairing length)",
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_FAIRING_MASS_KG: entry({
    id: 'F9_FAIRING_MASS_KG',
    value: 1_900,
    unit: 'kg',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Public SpaceX / Wikipedia F9 Block 5 fairing mass (~1,900 kg both halves)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_S1_DRY_MASS_KG: entry({
    id: 'F9_S1_DRY_MASS_KG',
    value: 26_955,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (MAP ~ 27.0 +/- 1.9 t, prior 25.6 +/- 2.0 t; prior-dominated, see BACKLOG)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '26,955 +/- 1,857 kg (prior 25,600 +/- 2,000 kg)',
  }),
  F9_S1_PROPELLANT_MASS_KG: entry({
    id: 'F9_S1_PROPELLANT_MASS_KG',
    value: 422_671,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 411,000 +/- 8,000 kg Spaceflight101 / Wikipedia F9 FT-B5)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '422,671 +/- 6,148 kg',
  }),
  F9_S1_LENGTH_M: entry({
    id: 'F9_S1_LENGTH_M',
    value: 42.6,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Public Falcon 9 Block 5 Stage 1 + interstage geometry (~42.6 m)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_S2_DRY_MASS_KG: entry({
    id: 'F9_S2_DRY_MASS_KG',
    value: 4_234,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 4,200 +/- 400 kg public F9 Stage 2 estimates)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '4,234 +/- 398 kg',
  }),
  F9_S2_PROPELLANT_MASS_KG: entry({
    id: 'F9_S2_PROPELLANT_MASS_KG',
    value: 111_310,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A fit (prior 109,500 +/- 3,000 kg Spaceflight101 / Wikipedia F9 FT-B5)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '111,310 +/- 1,668 kg',
  }),
  F9_S2_LENGTH_M: entry({
    id: 'F9_S2_LENGTH_M',
    value: 12.6,
    unit: 'm',
    label: 'SOURCED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Public Falcon 9 Block 5 Stage 2 geometry (~12.6 m)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  F9_S1_MAX_AXIAL_ACCEL_G: entry({
    id: 'F9_S1_MAX_AXIAL_ACCEL_G',
    value: 3.69,
    unit: 'g',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Variant A vehicle-level Stage 1 axial G cap (prior 4.00 +/- 0.50 g)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '3.69 +/- 0.45 g',
  }),
  F9_S2_MAX_AXIAL_ACCEL_G: entry({
    id: 'F9_S2_MAX_AXIAL_ACCEL_G',
    value: 3.52,
    unit: 'g',
    label: 'CALIBRATED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'MAP Stage 2-only fit with widened prior (3.50 +/- 0.40 g, MLE 3.52 g)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'c1adfc1',
    uncertainty: '3.52 +/- 0.31 g',
  }),
  ASCENT_ATTITUDE_SLEW_RATE_DEG_S: entry({
    id: 'ASCENT_ATTITUDE_SLEW_RATE_DEG_S',
    value: 5.0,
    unit: 'deg/s',
    label: 'ASSUMED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Simplified 3-DOF ascent attitude slew rate cap',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  BOOSTER_FLIP_SLEW_RATE_DEG_S: entry({
    id: 'BOOSTER_FLIP_SLEW_RATE_DEG_S',
    value: 12.0,
    unit: 'deg/s',
    label: 'ASSUMED',
    category: 'Vehicle & Propulsion',
    sourceOrDerivation: 'Simplified cold-gas RCS booster flip slew rate (~15 s for 180 deg flip)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),

  // =========================================================================
  // 3. Aerodynamics
  // =========================================================================
  ASCENT_CD_MAP_SCALE: entry({
    id: 'ASCENT_CD_MAP_SCALE',
    value: 1.041,
    unit: '1',
    label: 'CALIBRATED',
    category: 'Aerodynamics',
    sourceOrDerivation: 'MAP Variant A ascent drag multiplier (prior 1.00 +/- 0.15; prior-dominated)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'cda728a',
    uncertainty: '1.041 +/- 0.149',
  }),
  ASCENT_CD_MACH_BASE_TABLE: entry({
    id: 'ASCENT_CD_MACH_BASE_TABLE',
    value: [
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
    ] as readonly (readonly [number, number])[],
    unit: 'Cd(M)',
    label: 'ASSUMED',
    category: 'Aerodynamics',
    sourceOrDerivation: 'Core-area-referenced (10.7521 m^2) slender launch-vehicle Cd(M), scaled by 1.975x fairing/core area ratio',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  BOOSTER_DESCENT_CD_MACH_TABLE: entry({
    id: 'BOOSTER_DESCENT_CD_MACH_TABLE',
    value: [
      [0.0, 1.15],
      [0.5, 1.20],
      [0.85, 1.30],
      [1.05, 1.42],
      [1.5, 1.68],
      [2.2, 1.68],
      [2.9, 1.65],
      [4.0, 1.58],
      [8.0, 1.50],
    ] as readonly (readonly [number, number])[],
    unit: 'Cd(M)',
    label: 'CALIBRATED',
    category: 'Aerodynamics',
    sourceOrDerivation: 'Tail-first octaweb + titanium grid-fin Cd(M) reconstructed from stage1 telemetry (incl. M < 1.2); LOO validated & cross-checked on 6 B3/4 flights',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: '99843f1',
  }),
  BOOSTER_GRID_FIN_CL_PER_RAD: entry({
    id: 'BOOSTER_GRID_FIN_CL_PER_RAD',
    value: 0.8,
    unit: 'rad^-1',
    label: 'ASSUMED',
    category: 'Aerodynamics',
    sourceOrDerivation: 'Simplified grid-fin + booster-body lateral lift slope (max +/-20 deg -> L/D ~ 0.25-0.30)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),

  // =========================================================================
  // 4. Ascent & Stage 2 Guidance
  // =========================================================================
  IGNITION_START_S: entry({
    id: 'IGNITION_START_S',
    value: -3.0,
    unit: 's',
    label: 'SOURCED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: "SpaceX Falcon User's Guide / webcast Merlin 1D TEA-TEB ignition command at T-3 s",
    calibratedOn: [],
    commit: '558b5c7',
  }),
  WATER_DELUGE_START_S: entry({
    id: 'WATER_DELUGE_START_S',
    value: -5.0,
    unit: 's',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Pad Niagara acoustic water deluge start prior to T-3 s ignition (exact valve timings unpublished)',
    calibratedOn: [],
    commit: '558b5c7',
  }),
  IGNITION_SPOOL_UP_DURATION_S: entry({
    id: 'IGNITION_SPOOL_UP_DURATION_S',
    value: 2.2,
    unit: 's',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Smoothstep thrust spool-up 0->100% (T-3.0 to T-0.8 s) before 0.8 s hold-down health verification',
    calibratedOn: [],
    commit: '558b5c7',
  }),
  WEBCAST_LIFTOFF_OFFSET_S: entry({
    id: 'WEBCAST_LIFTOFF_OFFSET_S',
    value: 0,
    unit: 's',
    label: 'CALIBRATED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Hold-down clamp release at T=0 fits early webcast ascent (T+0..30 s) best at 0.0 s (38-40 m RMS)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: '04d3799',
  }),
  ASCENT_PITCH_KICK_ALTITUDE_M: entry({
    id: 'ASCENT_PITCH_KICK_ALTITUDE_M',
    value: 150,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Tower-clearance altitude AGL above launch pad before initiating pitchover kick',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ASCENT_PITCH_KICK_DURATION_S: entry({
    id: 'ASCENT_PITCH_KICK_DURATION_S',
    value: 8.0,
    unit: 's',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Smooth pitchover ramp duration from vertical rise into gravity turn',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ASCENT_MAX_Q_THROTTLE_START_PA: entry({
    id: 'ASCENT_MAX_Q_THROTTLE_START_PA',
    value: 22_000,
    unit: 'Pa',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Shared v1 transonic max-Q throttle bucket entry dynamic pressure',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ASCENT_MAX_Q_THROTTLE_END_MACH: entry({
    id: 'ASCENT_MAX_Q_THROTTLE_END_MACH',
    value: 1.38,
    unit: 'Mach',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Shared v1 transonic max-Q throttle bucket exit Mach number',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  ASCENT_MAX_Q_MIN_THROTTLE: entry({
    id: 'ASCENT_MAX_Q_MIN_THROTTLE',
    value: 0.72,
    unit: '1',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Shared v1 transonic max-Q throttle bucket minimum throttle setting',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  STAGE_SEP_DELAY_S: entry({
    id: 'STAGE_SEP_DELAY_S',
    value: 3.5,
    unit: 's',
    label: 'SOURCED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Typical MECO-to-stage-separation delay in SpaceX press kits and webcasts (~3-4 s)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  SES1_DELAY_FROM_MECO_S: entry({
    id: 'SES1_DELAY_FROM_MECO_S',
    value: 8.0,
    unit: 's',
    label: 'SOURCED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Typical MECO-to-SES-1 ignition delay in SpaceX press kits (DM-1 overrides with 11.0 s from events.json)',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  FAIRING_SEP_ALTITUDE_M: entry({
    id: 'FAIRING_SEP_ALTITUDE_M',
    value: 115_000,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Free-molecular aerodynamic heating threshold (~115 km) for payload fairing jettison',
    calibratedOn: [],
    commit: 'v1.0.0',
  }),
  CLASS_LEO_MAX_AXIAL_ACCEL_G: entry({
    id: 'CLASS_LEO_MAX_AXIAL_ACCEL_G',
    value: 2.9,
    unit: 'g',
    label: 'EMPIRICAL',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Effective late-S1 accel cap for Class 0 LEO (sits 0.39-0.77 g below reconstructed true axial accel 3.29-3.67 g; BACKLOG #10)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'Iridium NEXT 8'],
    commit: 'df229f4',
  }),
  CLASS_GTO_MAX_AXIAL_ACCEL_G: entry({
    id: 'CLASS_GTO_MAX_AXIAL_ACCEL_G',
    value: 3.6,
    unit: 'g',
    label: 'EMPIRICAL',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Effective late-S1 accel cap for Class 1 GTO (sits 0.22-0.26 g below reconstructed true axial accel 3.82-3.86 g; BACKLOG #10)',
    calibratedOn: ['Bangabandhu-1'],
    commit: 'df229f4',
  }),
  CLASS_GTO_ALTITUDE_THRESHOLD_M: entry({
    id: 'CLASS_GTO_ALTITUDE_THRESHOLD_M',
    value: 2_000_000,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'What-If orbit-type mission-class predictor threshold (9/10 LOO accuracy on 10 Block 5 flights)',
    calibratedOn: [],
    commit: 'd7e22aa',
  }),
  CLOSED_LOOP_LEAN_FLOOR_KG: entry({
    id: 'CLOSED_LOOP_LEAN_FLOOR_KG',
    value: 2_500,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Closed-loop MECO absolute touchdown propellant floor above ~4.5-5.5 t landing burn (8-flight aero mass ~30.5-31.6 t)',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: '388a1cd',
  }),
  DEFAULT_TRANSFER_PERIGEE_ALT_M: entry({
    id: 'DEFAULT_TRANSFER_PERIGEE_ALT_M',
    value: 185_000,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Two-burn Hohmann transfer parking perigee altitude (matching ~183 km Iridium-8 transfer perigee)',
    calibratedOn: [],
    commit: 'v1.3.1',
  }),
  AUTO_TWO_BURN_ALTITUDE_M: entry({
    id: 'AUTO_TWO_BURN_ALTITUDE_M',
    value: 250_000,
    unit: 'm',
    label: 'HEURISTIC',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'What-If default altitude threshold to enable two-burn Hohmann transfer when ascentProfile is omitted',
    calibratedOn: [],
    commit: 'v1.3.1',
  }),
  IRIDIUM_8_DRONESHIP_DOWNRANGE_KM: entry({
    id: 'IRIDIUM_8_DRONESHIP_DOWNRANGE_KM',
    value: 244,
    unit: 'km',
    label: 'ASSUMED',
    category: 'Ascent & Stage 2 Guidance',
    sourceOrDerivation: 'Estimated from Pacific NOTMAR hazard zone & observed 33 s partial boostback burn (exact km unpublished in press kit)',
    calibratedOn: [],
    commit: 'e87a77e',
  }),

  // =========================================================================
  // 5. Booster Recovery & Entry
  // =========================================================================
  SUTTON_GRAVES_K_EARTH: entry({
    id: 'SUTTON_GRAVES_K_EARTH',
    value: 1.7415e-4,
    unit: 'W/(m^(3/2)*(m/s)^3)',
    label: 'SOURCED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Sutton & Graves (1971) NASA TR R-376 Earth convective stagnation heating constant',
    calibratedOn: [],
    commit: '70826b1',
  }),
  BOOSTER_BASE_RADIUS_M: entry({
    id: 'BOOSTER_BASE_RADIUS_M',
    value: 1.85,
    unit: 'm',
    label: 'SOURCED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Falcon 9 core base radius (3.7 m / 2) used as blunt-body effective nose radius in Sutton-Graves proxy',
    calibratedOn: [],
    commit: '70826b1',
  }),
  ENTRY_BURN_HEATING_LIMIT_MW_M2: entry({
    id: 'ENTRY_BURN_HEATING_LIMIT_MW_M2',
    value: 0.022,
    unit: 'MW/m^2',
    label: 'CALIBRATED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Predictive Sutton-Graves entry-burn thermal envelope target (+0.06 km 8-flight ignition-altitude bias; LOO -1.93 / +0.97 km)',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  ENTRY_BURN_AERO_LEAD_S: entry({
    id: 'ENTRY_BURN_AERO_LEAD_S',
    value: 14.0,
    unit: 's',
    label: 'CALIBRATED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Predictive entry-burn aerodynamic lead time before unburned peak stagnation heating',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  ENTRY_BURN_TARGET_ACCEL_G: entry({
    id: 'ENTRY_BURN_TARGET_ACCEL_G',
    value: 3.6,
    unit: 'g',
    label: 'CALIBRATED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Mass-invariant 3-engine throttled / 1-3-1 average entry deceleration (matches 3.4-4.2 g across 11 telemetry flights)',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  ENTRY_BURN_MAX_DURATION_S: entry({
    id: 'ENTRY_BURN_MAX_DURATION_S',
    value: 26.0,
    unit: 's',
    label: 'CALIBRATED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Maximum 3-engine entry-burn duration cap',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  TERMINAL_FLARE_TARGET_VTD_MS: entry({
    id: 'TERMINAL_FLARE_TARGET_VTD_MS',
    value: 0.55,
    unit: 'm/s',
    label: 'ASSUMED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Nominal terminal touchdown vertical speed keeping 0.55 + 1.35 m/s max ASDS deck heave < 2.0 m/s',
    calibratedOn: [],
    commit: 'e87a77e',
  }),
  TERMINAL_FLARE_HEIGHT_M: entry({
    id: 'TERMINAL_FLARE_HEIGHT_M',
    value: 1.85,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Terminal flare transition altitude AGL above 1.5 m peak ASDS ocean heave',
    calibratedOn: [],
    commit: 'e87a77e',
  }),
  ANTI_HOVER_FLARE_GATE_ALT_M: entry({
    id: 'ANTI_HOVER_FLARE_GATE_ALT_M',
    value: 2.5,
    unit: 'm',
    label: 'HEURISTIC',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Altitude gate below which anti-hover timer starts to mitigate unaided INS negative v_z bias (tracked in BACKLOG for radar velocity estimation)',
    calibratedOn: [],
    commit: 'a6e7a2f',
  }),
  ANTI_HOVER_FLARE_DELAY_S: entry({
    id: 'ANTI_HOVER_FLARE_DELAY_S',
    value: 3.5,
    unit: 's',
    label: 'HEURISTIC',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Terminal flare dwell time before ramping vTd to break unaided INS velocity-bias hover-hang',
    calibratedOn: [],
    commit: 'a6e7a2f',
  }),
  ANTI_HOVER_FLARE_RAMP_MS_PER_S: entry({
    id: 'ANTI_HOVER_FLARE_RAMP_MS_PER_S',
    value: 0.15,
    unit: 'm/s^2',
    label: 'HEURISTIC',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Smooth vTd ramp rate after flare dwell delay so descent resumes without hard free-fall',
    calibratedOn: [],
    commit: 'a6e7a2f',
  }),
  ANTI_HOVER_FLARE_MAX_ADD_MS: entry({
    id: 'ANTI_HOVER_FLARE_MAX_ADD_MS',
    value: 0.65,
    unit: 'm/s',
    label: 'HEURISTIC',
    category: 'Booster Recovery & Entry',
    sourceOrDerivation: 'Maximum additional descent speed commanded by anti-hover ramp (caps vTd at 1.20 m/s)',
    calibratedOn: [],
    commit: 'a6e7a2f',
  }),

  // =========================================================================
  // 6. Mission Design & Solver
  // =========================================================================
  PROFILE_KICK_LEO_DIRECT_DEG: entry({
    id: 'PROFILE_KICK_LEO_DIRECT_DEG',
    value: 1.3,
    unit: 'deg',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Median Part D per-flight fitted pitch kick for LEO direct profiles (1.19-1.37 deg)',
    calibratedOn: ['DM-1', 'SpaceX CRS-16', 'SAOCOM 1A', 'SSO-A'],
    commit: 'cda728a',
  }),
  PROFILE_KICK_LEO_TWO_BURN_DEG: entry({
    id: 'PROFILE_KICK_LEO_TWO_BURN_DEG',
    value: 1.7,
    unit: 'deg',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Median Part D per-flight fitted pitch kick for LEO two-burn profiles (1.71-1.73 deg)',
    calibratedOn: ['Iridium NEXT 8', 'Iridium NEXT 7'],
    commit: 'cda728a',
  }),
  PROFILE_KICK_GTO_DEG: entry({
    id: 'PROFILE_KICK_GTO_DEG',
    value: 2.45,
    unit: 'deg',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Median Part D per-flight fitted pitch kick for GTO profiles (2.40-2.51 deg)',
    calibratedOn: ['Bangabandhu-1', 'TelStar v19', 'Eshail 2'],
    commit: 'cda728a',
  }),
  SOLVER_S2_TIE_BAND_KG: entry({
    id: 'SOLVER_S2_TIE_BAND_KG',
    value: 500,
    unit: 'kg',
    label: 'HEURISTIC',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Stage 2 fuel-margin tie-breaker band (~0.45% S2 prop) within which solver prefers kick closest to profile median',
    calibratedOn: [],
    commit: 'a6e7a2f',
  }),
  SOLVER_BOOSTBACK_HEAT_CEILING_MW_M2: entry({
    id: 'SOLVER_BOOSTBACK_HEAT_CEILING_MW_M2',
    value: 0.025,
    unit: 'MW/m^2',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Boostback-class solver entry-heating ceiling (~15% above 0.022 target; real 8 boostback flights 0.013-0.033 MW/m^2)',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  SOLVER_BALLISTIC_HEAT_CEILING_MW_M2: entry({
    id: 'SOLVER_BALLISTIC_HEAT_CEILING_MW_M2',
    value: 0.085,
    unit: 'MW/m^2',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Ballistic ASDS solver entry-heating ceiling inside real GTO ASDS envelope (0.068-0.126 MW/m^2, mean 0.099)',
    calibratedOn: ['KoreaSat 5A', 'SES-11', 'BulgariaSat-1'],
    commit: '388a1cd',
  }),
  SOLVER_BOOSTBACK_FUEL_FLOOR_KG: entry({
    id: 'SOLVER_BOOSTBACK_FUEL_FLOOR_KG',
    value: 3_500,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Boostback-class nominal landing fuel floor from measured skewed left-tail 3-sigma post-MECO RSS = 3,465 kg (9 MC drivers)',
    calibratedOn: ['DEFAULT_RTLS (MC N=300x9)'],
    commit: 'a6e7a2f',
  }),
  SOLVER_BALLISTIC_FUEL_FLOOR_KG: entry({
    id: 'SOLVER_BALLISTIC_FUEL_FLOOR_KG',
    value: 2_500,
    unit: 'kg',
    label: 'CALIBRATED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Ballistic ASDS lean touchdown propellant margin floor derived from 8-flight aero-descent mass inference (~30.5-31.6 t)',
    calibratedOn: ['Iridium NEXT 8', 'SAOCOM 1A'],
    commit: 'd5a054e',
  }),
  SOLVER_MAX_GRID_FIN_SAT_FRACTION: entry({
    id: 'SOLVER_MAX_GRID_FIN_SAT_FRACTION',
    value: 0.15,
    unit: '1',
    label: 'ASSUMED',
    category: 'Mission Design & Solver',
    sourceOrDerivation: 'Maximum allowable aero-descent grid-fin saturation fraction for mission-design feasibility',
    calibratedOn: [],
    commit: 'v1.3.0',
  }),

  // =========================================================================
  // 7. Monte Carlo & Navigation
  // =========================================================================
  NAV_CORR_TIME_S: entry({
    id: 'NAV_CORR_TIME_S',
    value: 45.0,
    unit: 's',
    label: 'ASSUMED',
    category: 'Monte Carlo & Navigation',
    sourceOrDerivation: 'First-order Gauss-Markov INS/GPS navigation bias correlation time constant',
    calibratedOn: [],
    commit: 'v1.2.0',
  }),
  NAV_ALT_AID_ACQ_M: entry({
    id: 'NAV_ALT_AID_ACQ_M',
    value: 3_000.0,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Monte Carlo & Navigation',
    sourceOrDerivation: 'Downward-looking landing radar altimeter acquisition altitude AGL',
    calibratedOn: [],
    commit: 'v1.2.0',
  }),
  NAV_ALT_RADAR_FLOOR_M: entry({
    id: 'NAV_ALT_RADAR_FLOOR_M',
    value: 0.15,
    unit: 'm',
    label: 'ASSUMED',
    category: 'Monte Carlo & Navigation',
    sourceOrDerivation: 'Landing radar altimeter residual multipath/clutter floor sigma',
    calibratedOn: [],
    commit: 'v1.2.0',
  }),
  NAV_ALT_RADAR_SCALE: entry({
    id: 'NAV_ALT_RADAR_SCALE',
    value: 0.002,
    unit: '1',
    label: 'ASSUMED',
    category: 'Monte Carlo & Navigation',
    sourceOrDerivation: 'Landing radar altimeter range-proportional error scale (0.2% of AGL)',
    calibratedOn: [],
    commit: 'v1.2.0',
  }),
  NAV_ALT_AID_MIN_TAU_S: entry({
    id: 'NAV_ALT_AID_MIN_TAU_S',
    value: 2.0,
    unit: 's',
    label: 'ASSUMED',
    category: 'Monte Carlo & Navigation',
    sourceOrDerivation: 'Minimum closed-loop radar/INS vertical filter correlation time near touchdown',
    calibratedOn: [],
    commit: 'v1.2.0',
  }),
} as const satisfies Record<string, RegistryEntry>;

export type ConstantId = keyof typeof CONSTANTS_REGISTRY;

export const REGISTRY_CATEGORIES: readonly ConstantCategory[] = [
  'Planetary & Atmosphere',
  'Vehicle & Propulsion',
  'Aerodynamics',
  'Ascent & Stage 2 Guidance',
  'Booster Recovery & Entry',
  'Mission Design & Solver',
  'Monte Carlo & Navigation',
];

export const REGISTRY_ENTRIES: readonly RegistryEntry[] = Object.values(CONSTANTS_REGISTRY);

function formatConstantValue(val: ConstantValue, unit: string): string {
  if (typeof val === 'number') {
    const numStr =
      Math.abs(val) >= 1e6 || (val !== 0 && Math.abs(val) < 1e-3)
        ? val.toExponential(4)
        : Number.isInteger(val)
          ? val.toLocaleString('en-US')
          : String(val);
    return unit === '1' ? `\`${numStr}\`` : `\`${numStr} ${unit}\``;
  }
  const summary = val.map(([m, cd]) => `${m}:${cd}`).join(', ');
  return `\`[${val.length} pts]\` (${summary})`;
}

/**
 * Render the Markdown tables for docs/ASSUMPTIONS.md directly from CONSTANTS_REGISTRY.
 * Used both by scripts/generate-assumptions-tables.ts and tests/constants-registry.test.ts.
 */
export function renderConstantsRegistryMarkdown(): string {
  const lines: string[] = [
    '<!-- BEGIN GENERATED: CONSTANTS_REGISTRY -->',
    '<!-- Auto-generated from src/sim/config/registry.ts via `pnpm docs:assumptions`. Do not edit by hand. -->',
    '',
    '## Constants Registry (Single Source of Truth)',
    '',
    `Every \`SOURCED\`, \`CALIBRATED\`, \`EMPIRICAL\`, \`ASSUMED\`, and \`HEURISTIC\` constant in \`src/sim/\` (${REGISTRY_ENTRIES.length} entries) is defined in \`src/sim/config/registry.ts\` and rendered here automatically.`,
    '',
  ];

  for (const category of REGISTRY_CATEGORIES) {
    const items = REGISTRY_ENTRIES.filter((e) => e.category === category);
    if (items.length === 0) continue;
    lines.push(`### ${category}`);
    lines.push('');
    lines.push('| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of items) {
      const valStr = formatConstantValue(item.value, item.unit);
      const flightsStr =
        item.calibratedOn.length > 0 ? item.calibratedOn.join(', ') : '—';
      const srcStr = item.uncertainty
        ? `${item.sourceOrDerivation} *(post: ${item.uncertainty})*`
        : item.sourceOrDerivation;
      lines.push(
        `| \`${item.id}\` | ${valStr} | \`${item.label}\` | ${flightsStr} | \`${item.commit}\` | ${srcStr} |`
      );
    }
    lines.push('');
  }

  lines.push('<!-- END GENERATED: CONSTANTS_REGISTRY -->');
  return lines.join('\n');
}
