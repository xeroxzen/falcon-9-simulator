import type { AtmosphereSample, Vec3 } from '../types.js';
import {
  ASCENT_CD_MACH_TABLE,
  BOOSTER_DESCENT_CD_MACH_TABLE,
} from '../config/falcon9.js';
import { add, clamp, dot, norm, normalize, scale, sub } from '../math.js';
import { DEG_TO_RAD } from '../config/constants.js';

export interface AeroOutput {
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly cd: number;
  readonly dragMagnitudeN: number;
  readonly dragForceEci: Vec3;
}

function interpolateMachTable(
  mach: number,
  table: readonly (readonly [number, number])[]
): number {
  if (mach <= table[0]![0]) return table[0]![1];
  const last = table[table.length - 1]!;
  if (mach >= last[0]) return last[1];

  for (let i = 0; i < table.length - 1; i++) {
    const [m0, cd0] = table[i]!;
    const [m1, cd1] = table[i + 1]!;
    if (mach >= m0 && mach <= m1) {
      const t = (mach - m0) / (m1 - m0);
      return cd0 + t * (cd1 - cd0);
    }
  }
  return last[1];
}

/**
 * Piecewise-linear interpolation of ASSUMED Mach-dependent drag coefficient Cd(M)
 * for the ascending Falcon 9 stack.
 */
export function ascentDragCoefficient(mach: number): number {
  return interpolateMachTable(mach, ASCENT_CD_MACH_TABLE);
}

/**
 * Piecewise-linear interpolation of ASSUMED Mach-dependent drag coefficient Cd(M)
 * for the tail-first descending Stage 1 booster (octaweb base + deployed grid fins).
 */
export function boosterDescentDragCoefficient(mach: number): number {
  return interpolateMachTable(mach, BOOSTER_DESCENT_CD_MACH_TABLE);
}

/**
 * Compute aerodynamic drag force in ECI given air-relative velocity, atmosphere,
 * and reference area.
 */
export function evaluateAscentAerodynamics(
  vAirRelEci: Vec3,
  atmosphere: AtmosphereSample,
  referenceAreaM2: number
): AeroOutput {
  const speed = norm(vAirRelEci);
  if (speed < 1e-6 || atmosphere.densityKgM3 <= 0) {
    return {
      mach: 0,
      dynamicPressurePa: 0,
      cd: ascentDragCoefficient(0),
      dragMagnitudeN: 0,
      dragForceEci: { x: 0, y: 0, z: 0 },
    };
  }

  const mach =
    atmosphere.speedOfSoundMs > 0 ? speed / atmosphere.speedOfSoundMs : 0;
  const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * speed * speed;
  const cd = ascentDragCoefficient(mach);
  const dragMagnitudeN = dynamicPressurePa * cd * referenceAreaM2;
  const dragForceEci = scale(vAirRelEci, -dragMagnitudeN / speed);

  return {
    mach,
    dynamicPressurePa,
    cd,
    dragMagnitudeN,
    dragForceEci,
  };
}

export interface BoosterAeroOutput extends AeroOutput {
  readonly liftMagnitudeN: number;
  readonly totalAeroForceEci: Vec3;
}

/**
 * ASSUMED simplified grid-fin + booster-body lift slope (per radian of grid-fin
 * deflection command, max +/-20 deg -> max C_L ~ 0.28, L/D ~ 0.25-0.30).
 */
const BOOSTER_GRID_FIN_CL_PER_RAD = 0.8;

/**
 * Compute tail-first booster aerodynamic drag plus simplified grid-fin lateral lift
 * in the direction `steerDirEci` (projected perpendicular to air-relative velocity).
 */
export function evaluateBoosterAerodynamics(
  vAirRelEci: Vec3,
  atmosphere: AtmosphereSample,
  referenceAreaM2: number,
  steerDirEci: Vec3,
  gridFinDeflectionDeg: number
): BoosterAeroOutput {
  const speed = norm(vAirRelEci);
  if (speed < 1e-6 || atmosphere.densityKgM3 <= 0) {
    return {
      mach: 0,
      dynamicPressurePa: 0,
      cd: boosterDescentDragCoefficient(0),
      dragMagnitudeN: 0,
      dragForceEci: { x: 0, y: 0, z: 0 },
      liftMagnitudeN: 0,
      totalAeroForceEci: { x: 0, y: 0, z: 0 },
    };
  }

  const mach =
    atmosphere.speedOfSoundMs > 0 ? speed / atmosphere.speedOfSoundMs : 0;
  const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * speed * speed;
  const cd = boosterDescentDragCoefficient(mach);
  const dragMagnitudeN = dynamicPressurePa * cd * referenceAreaM2;
  const vHat = scale(vAirRelEci, 1 / speed);
  const dragForceEci = scale(vHat, -dragMagnitudeN);

  const clampedDefl = clamp(gridFinDeflectionDeg, -20, 20);
  const cl = BOOSTER_GRID_FIN_CL_PER_RAD * Math.abs(clampedDefl) * DEG_TO_RAD;
  const liftMagnitudeN = dynamicPressurePa * cl * referenceAreaM2;

  // Project steerDir perpendicular to velocity vector
  const perp = sub(steerDirEci, scale(vHat, dot(steerDirEci, vHat)));
  const perpNorm = norm(perp);
  const liftForceEci =
    perpNorm > 1e-6 && liftMagnitudeN > 0
      ? scale(normalize(perp), liftMagnitudeN)
      : { x: 0, y: 0, z: 0 };

  return {
    mach,
    dynamicPressurePa,
    cd,
    dragMagnitudeN,
    dragForceEci,
    liftMagnitudeN,
    totalAeroForceEci: add(dragForceEci, liftForceEci),
  };
}

