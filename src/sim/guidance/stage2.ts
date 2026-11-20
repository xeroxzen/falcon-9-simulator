import type {
  BodyDynamicState,
  MissionConfig,
  Stage2Phase,
  Vec3,
  VehicleConfig,
} from '../types.js';
import {
  DEG_TO_RAD,
  EARTH_MU,
  EARTH_RADIUS_EQUATORIAL_M,
  G0,
} from '../config/constants.js';
import { add, clamp, cross, dot, norm, normalize, scale, sub } from '../math.js';

export interface Stage2GuidanceCommand {
  readonly phase: Stage2Phase;
  readonly targetAttitudeEci: Vec3;
  readonly throttle: number;
  readonly secoTriggered: boolean;
}

/**
 * Closed-loop Stage 2 ascent guidance using a linear-tangent / optimal radial
 * boundary-value steering law.
 *
 * Physics & guidance law (documented in docs/ASSUMPTIONS.md):
 *   In the instantaneous orbital plane defined by radial unit vector r_hat and
 *   horizontal prograde unit vector h_hat:
 *   - Estimate time-to-go t_go via Tsiolkovsky from remaining horizontal delta-v
 *     to circular orbital speed v_circ = sqrt(mu / (Re + h_target)).
 *   - Compute required radial acceleration to drive altitude error (h_target - h)
 *     and radial velocity v_r to zero at t_go:
 *       a_r,cmd = g_eff + 6*(h_target - h)/t_go^2 - 4*v_r/t_go
 *     where g_eff = mu/r^2 - v_h^2/r is gravity minus centrifugal acceleration.
 *   - Pitch angle theta above local horizontal satisfies sin(theta) = a_r,cmd / a_T,
 *     producing a smooth linear-tangent-like pitch profile that pitches slightly
 *     above horizontal early to build apogee, then levels out to 0° (or slightly
 *     negative if lofted above target altitude) for circular insertion at SECO-1.
 *   - SECO-1 triggers when specific orbital energy reaches the circular orbit
 *     energy (-mu / (2 * r_target)) or Stage 2 propellant is exhausted.
 */
export function computeStage2Guidance(
  timeS: number,
  mecoTimeS: number,
  dynamic: BodyDynamicState,
  totalMassKg: number,
  altitudeM: number,
  vehicle: VehicleConfig,
  mission: MissionConfig
): Stage2GuidanceCommand {
  const ses1TimeS = mecoTimeS + mission.guidance.ses1DelayFromMecoS;

  const r = norm(dynamic.positionEci);
  const rHat = scale(dynamic.positionEci, 1 / r);
  const vRadial = dot(dynamic.velocityEci, rHat);
  const vHorizVec = sub(dynamic.velocityEci, scale(rHat, vRadial));
  const vHoriz = norm(vHorizVec);
  const hHat = vHoriz > 1e-3 ? scale(vHorizVec, 1 / vHoriz) : rHat;

  // Coast between MECO / stage sep and SES-1
  if (timeS < ses1TimeS) {
    // Pitch gently toward slightly above horizontal during coast to prepare for SES-1
    const prePitch = 0.25; // ~14 deg above horizontal
    const att = normalize(
      add(scale(hHat, Math.cos(prePitch)), scale(rHat, Math.sin(prePitch)))
    );
    return {
      phase: 'COAST_TO_SES1',
      targetAttitudeEci: att,
      throttle: 0,
      secoTriggered: false,
    };
  }

  // Check propellant depletion or target orbital energy achieved (SECO-1)
  const rTarget = EARTH_RADIUS_EQUATORIAL_M + mission.targetOrbitAltitudeM;
  const targetEnergy = -EARTH_MU / (2 * rTarget);
  const currentEnergy = 0.5 * dot(dynamic.velocityEci, dynamic.velocityEci) - EARTH_MU / r;

  if (dynamic.propellantKg <= 0 || currentEnergy >= targetEnergy) {
    return {
      phase: 'SECO',
      targetAttitudeEci: hHat,
      throttle: 0,
      secoTriggered: true,
    };
  }

  // MVac throttle with optional G-limit (e.g., 3.5 g for crewed DM-1, 4.5 g nominal)
  const mvac = vehicle.stage2.engine;
  const maxG = mission.guidance.stage2MaxAccelG ?? vehicle.maxAxialAccelG;
  const maxAllowedThrustN = maxG * G0 * totalMassKg;
  const throttle = clamp(
    maxAllowedThrustN / mvac.thrustVacuumN,
    mvac.minThrottle,
    mvac.maxThrottle
  );

  const thrustN = throttle * mvac.thrustVacuumN;
  const aThrust = thrustN / totalMassKg;
  const mdot = thrustN / (mvac.ispVacuumS * G0);

  // Estimate remaining burn time t_go using Tsiolkovsky
  const vCirc = Math.sqrt(EARTH_MU / rTarget);
  const dvRem = Math.max(20, vCirc - vHoriz);
  const vEx = mvac.ispVacuumS * G0;
  const tGoEst =
    mdot > 0
      ? (totalMassKg / mdot) * (1 - Math.exp(-dvRem / vEx))
      : dvRem / Math.max(0.1, aThrust);
  const tGo = Math.max(25.0, tGoEst);

  // Optimal radial boundary-value acceleration command
  const gEff = EARTH_MU / (r * r) - (vHoriz * vHoriz) / r;
  const altErr = mission.targetOrbitAltitudeM - altitudeM;
  const aRadCmd = gEff + (6.0 * altErr) / (tGo * tGo) - (4.0 * vRadial) / tGo;

  const sinTheta = clamp(aRadCmd / Math.max(0.1, aThrust), -0.45, 0.72);
  const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));

  // Closed-loop cross-track yaw plane steering to drive orbital inclination
  // within <0.05 deg of target inclination.
  // For angular momentum h = r x v and nHat = h / |h|:
  //   d(h_z)/dt = (r x a_T)_z; along +nHat, (r x nHat)_z = -r * hHat_z.
  // Since cos(i) = h_z / |h|, increasing i requires decreasing h_z,
  // so yawing along sign(hHat_z) * nHat increases inclination.
  const hVec = cross(dynamic.positionEci, dynamic.velocityEci);
  const hMag = norm(hVec);
  const curIncRad = hMag > 1e-6 ? Math.acos(clamp(hVec.z / hMag, -1, 1)) : 0;
  const targetIncRad = mission.targetInclinationDeg * DEG_TO_RAD;
  const incErrRad = targetIncRad - curIncRad;
  const nHat = hMag > 1e-6 ? scale(hVec, 1 / hMag) : { x: 0, y: 0, z: 1 };
  const yawSign = hHat.z >= 0 ? 1 : -1;
  const sinYaw = clamp(yawSign * incErrRad * 26.0, -0.35, 0.35);
  const cosYaw = Math.sqrt(Math.max(0, 1 - sinYaw * sinYaw));

  const horizSteered = add(scale(hHat, cosYaw), scale(nHat, sinYaw));
  const targetAttitudeEci = normalize(
    add(scale(horizSteered, cosTheta), scale(rHat, sinTheta))
  );

  return {
    phase: 'STAGE2_BURN',
    targetAttitudeEci,
    throttle,
    secoTriggered: false,
  };
}
