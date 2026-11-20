/**
 * Physical and planetary constants (WGS-84 & US Standard Atmosphere 1976).
 * Pure constants module — no external dependencies.
 */

/** Standard gravity g0 (m/s^2) — CGPM 1901 / ISO 80000-3 */
export const G0 = 9.80665;

/** Earth standard gravitational parameter mu = G*M_earth (m^3/s^2) — WGS-84 (NIMA TR8350.2) */
export const EARTH_MU = 3.986004418e14;

/** WGS-84 equatorial radius a (m) — NIMA TR8350.2 */
export const EARTH_RADIUS_EQUATORIAL_M = 6_378_137.0;

/** WGS-84 flattening f — NIMA TR8350.2 */
export const EARTH_FLATTENING = 1.0 / 298.257223563;

/** WGS-84 polar radius b = a * (1 - f) (m) */
export const EARTH_RADIUS_POLAR_M =
  EARTH_RADIUS_EQUATORIAL_M * (1.0 - EARTH_FLATTENING);

/** WGS-84 first eccentricity squared e^2 = 2f - f^2 */
export const EARTH_E2 =
  2.0 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;

/** WGS-84 mean Earth radius (m) for simple great-circle downrange calculation */
export const EARTH_RADIUS_MEAN_M = 6_371_008.8;

/** Earth sidereal rotation rate omega (rad/s) — WGS-84 (NIMA TR8350.2) */
export const EARTH_OMEGA_RAD_S = 7.292115e-5;

/** Earth second zonal harmonic J2 — EGM96 / WGS-84 */
export const EARTH_J2 = 1.08262668e-3;

/** US Standard Atmosphere 1976 effective Earth radius r0 (m) — NOAA-S/T 76-1562 */
export const US76_R0_M = 6_356_766.0;

/** US Standard Atmosphere 1976 sea-level pressure p0 (Pa) */
export const SEA_LEVEL_PRESSURE_PA = 101_325.0;

/** US Standard Atmosphere 1976 sea-level temperature T0 (K) */
export const SEA_LEVEL_TEMP_K = 288.15;

/** US Standard Atmosphere 1976 specific gas constant for dry air R_air (J/(kg*K)) */
export const AIR_GAS_CONSTANT = 287.05287;

/** Ratio of specific heats for dry air gamma */
export const AIR_GAMMA = 1.4;

export const DEG_TO_RAD = Math.PI / 180.0;
export const RAD_TO_DEG = 180.0 / Math.PI;
