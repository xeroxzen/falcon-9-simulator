/**
 * Physical and planetary constants (WGS-84 & US Standard Atmosphere 1976).
 * Re-exported from the single-source-of-truth CONSTANTS_REGISTRY.
 */
import { CONSTANTS_REGISTRY } from './registry.js';

/** Standard gravity g0 (m/s^2) — SOURCED: CGPM 1901 / ISO 80000-3 */
export const G0 = CONSTANTS_REGISTRY.G0.value;

/** Earth standard gravitational parameter mu = G*M_earth (m^3/s^2) — SOURCED: WGS-84 */
export const EARTH_MU = CONSTANTS_REGISTRY.EARTH_MU.value;

/** WGS-84 equatorial radius a (m) — SOURCED: NIMA TR8350.2 */
export const EARTH_RADIUS_EQUATORIAL_M = CONSTANTS_REGISTRY.EARTH_RADIUS_EQUATORIAL_M.value;

/** WGS-84 flattening f — SOURCED: NIMA TR8350.2 */
export const EARTH_FLATTENING = CONSTANTS_REGISTRY.EARTH_FLATTENING.value;

/** DERIVED: WGS-84 polar radius b = a * (1 - f) (m) */
export const EARTH_RADIUS_POLAR_M =
  EARTH_RADIUS_EQUATORIAL_M * (1.0 - EARTH_FLATTENING);

/** DERIVED: WGS-84 first eccentricity squared e^2 = 2f - f^2 */
export const EARTH_E2 =
  2.0 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;

/** WGS-84 mean Earth radius (m) — SOURCED: WGS-84 */
export const EARTH_RADIUS_MEAN_M = CONSTANTS_REGISTRY.EARTH_RADIUS_MEAN_M.value;

/** Earth sidereal rotation rate omega (rad/s) — SOURCED: WGS-84 */
export const EARTH_OMEGA_RAD_S = CONSTANTS_REGISTRY.EARTH_OMEGA_RAD_S.value;

/** Earth second zonal harmonic J2 — SOURCED: EGM96 / WGS-84 */
export const EARTH_J2 = CONSTANTS_REGISTRY.EARTH_J2.value;

/** US Standard Atmosphere 1976 effective Earth radius r0 (m) — SOURCED: NOAA-S/T 76-1562 */
export const US76_R0_M = CONSTANTS_REGISTRY.US76_R0_M.value;

/** US Standard Atmosphere 1976 sea-level pressure p0 (Pa) — SOURCED: US76 */
export const SEA_LEVEL_PRESSURE_PA = CONSTANTS_REGISTRY.SEA_LEVEL_PRESSURE_PA.value;

/** US Standard Atmosphere 1976 sea-level temperature T0 (K) — SOURCED: US76 */
export const SEA_LEVEL_TEMP_K = CONSTANTS_REGISTRY.SEA_LEVEL_TEMP_K.value;

/** US Standard Atmosphere 1976 specific gas constant for dry air (J/(kg*K)) — SOURCED: US76 */
export const AIR_GAS_CONSTANT = CONSTANTS_REGISTRY.AIR_GAS_CONSTANT.value;

/** Ratio of specific heats for dry air gamma — SOURCED: US76 */
export const AIR_GAMMA = CONSTANTS_REGISTRY.AIR_GAMMA.value;

/** DERIVED: Degrees to radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180.0;
/** DERIVED: Radians to degrees conversion factor */
export const RAD_TO_DEG = 180.0 / Math.PI;

/** ASSUMED structural aerodynamic load limit (dynamic pressure * angle of attack) */
export const ASSUMED_MAX_Q_ALPHA_PA_DEG = CONSTANTS_REGISTRY.ASSUMED_MAX_Q_ALPHA_PA_DEG.value;
