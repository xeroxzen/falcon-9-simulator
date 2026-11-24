import type { Vec3 } from '../types.js';
import {
  EARTH_J2,
  EARTH_MU,
  EARTH_RADIUS_EQUATORIAL_M,
} from '../config/constants.js';

/**
 * Compute gravitational acceleration vector (m/s^2) in ECI frame.
 * Supports inverse-square point-mass gravity plus optional J2 oblateness term.
 */
export function gravitationalAccelerationEci(
  rEci: Vec3,
  enableJ2: boolean
): Vec3 {
  const r2 = rEci.x * rEci.x + rEci.y * rEci.y + rEci.z * rEci.z;
  const r = Math.sqrt(r2);
  if (r === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const r3 = r2 * r;
  const muOverR3 = -EARTH_MU / r3;

  let ax = muOverR3 * rEci.x;
  let ay = muOverR3 * rEci.y;
  let az = muOverR3 * rEci.z;

  if (enableJ2) {
    const r5 = r3 * r2;
    const z2OverR2 = (rEci.z * rEci.z) / r2;
    const j2Factor =
      (-1.5 /* math: Legendre P2 */ *
        EARTH_J2 *
        EARTH_MU *
        EARTH_RADIUS_EQUATORIAL_M *
        EARTH_RADIUS_EQUATORIAL_M) /
      r5;
    const xyTerm = 1.0 - 5.0 * z2OverR2; /* math: Legendre P2 */
    const zTerm = 3.0 - 5.0 * z2OverR2; /* math: Legendre P2 */

    ax += j2Factor * rEci.x * xyTerm;
    ay += j2Factor * rEci.y * xyTerm;
    az += j2Factor * rEci.z * zTerm;
  }

  return { x: ax, y: ay, z: az };
}

/**
 * Specific gravitational potential energy (-mu/r + optional J2 potential) in J/kg.
 * Useful for energy conservation validation tests.
 */
export function specificGravitationalPotential(
  rEci: Vec3,
  enableJ2: boolean
): number {
  const r2 = rEci.x * rEci.x + rEci.y * rEci.y + rEci.z * rEci.z;
  const r = Math.sqrt(r2);
  if (r === 0) return 0;

  let u = -EARTH_MU / r;
  if (enableJ2) {
    const z2OverR2 = (rEci.z * rEci.z) / r2;
    const re2 = EARTH_RADIUS_EQUATORIAL_M * EARTH_RADIUS_EQUATORIAL_M;
    // U_J2 = +(mu/r) * J2 * (Re/r)^2 * 0.5 * (3*(z/r)^2 - 1)
    u += (EARTH_MU / r) * EARTH_J2 * (re2 / r2) * 0.5 * (3.0 * z2OverR2 - 1.0); /* math: Legendre P2 */
  }
  return u;
}
