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
import { CONSTANTS_REGISTRY as R } from '../config/registry.js';
import {
  add,
  clamp,
  computeOrbitalElements,
  cross,
  dot,
  norm,
  normalize,
  scale,
  sub,
} from '../math.js';

/** Default ASSUMED parking/transfer perigee altitude for two-burn Hohmann insertions (185 km). */
export const DEFAULT_TRANSFER_PERIGEE_ALT_M = R.DEFAULT_TRANSFER_PERIGEE_ALT_M.value;

/** HEURISTIC: Target orbit altitude threshold used ONLY as the What-If default when ascentProfile is omitted. */
export const AUTO_TWO_BURN_ALTITUDE_M = R.AUTO_TWO_BURN_ALTITUDE_M.value;

export function isTwoBurnMission(mission: MissionConfig): boolean {
  if (mission.ascentProfile !== undefined) {
    return mission.ascentProfile === 'TWO_BURN';
  }
  return mission.guidance.twoBurn ?? mission.targetOrbitAltitudeM > AUTO_TWO_BURN_ALTITUDE_M;
}

export interface Stage2GuidanceMemory {
  phase: Stage2Phase;
  seco1Done: boolean;
  seco1TimeS: number | null;
  ses2Started: boolean;
  seco2Done: boolean;
  /** Analytic Keplerian time-to-apoapsis (s) during COAST_TO_SES2; null outside coast. */
  timeToApoapsisS: number | null;
}

export function createStage2GuidanceMemory(): Stage2GuidanceMemory {
  return {
    phase: 'COAST_TO_SES1',
    seco1Done: false,
    seco1TimeS: null,
    ses2Started: false,
    seco2Done: false,
    timeToApoapsisS: null,
  };
}

export interface Stage2GuidanceCommand {
  readonly phase: Stage2Phase;
  readonly targetAttitudeEci: Vec3;
  readonly throttle: number;
  /** True on the step SECO-1 cuts off (final cutoff for single-burn; transfer cutoff for two-burn). */
  readonly secoTriggered: boolean;
  /** True on the step SES-2 ignites (two-burn only). */
  readonly ses2Triggered: boolean;
  /** True on the step SECO-2 cuts off (two-burn only). */
  readonly seco2Triggered: boolean;
  /** True once Stage 2 has completed all burns (or depleted propellant). */
  readonly missionComplete: boolean;
}

/**
 * Closed-loop Stage 2 ascent guidance supporting both:
 *   1. Single-burn direct circular LEO insertion (target <= 250 km):
 *      Optimal radial boundary-value / linear-tangent steering + cross-track yaw plane steering.
 *   2. Two-burn Hohmann transfer (target > 250 km, or explicit guidance.twoBurn = true):
 *      - SES-1 -> SECO-1: Inserts into an elliptical transfer orbit with perigee near
 *        h_park = 185 km (ASSUMED) and apoapsis at targetOrbitAltitudeM, plus cross-track
 *        yaw inclination control.
 *      - COAST_TO_SES2: Ballistic coast to apoapsis; analytic Keplerian time-to-apoapsis
 *        t_to_apo = (pi - M) / n centers SES-2 ignition on apoapsis (t_to_apo <= 0.5 * t_burn2).
 *      - SES-2 -> SECO-2: Prograde circularization burn at apoapsis until specific orbital
 *        energy reaches circular target energy -mu / (2 * r_target) (or propellant exhausted).
 */
export function computeStage2Guidance(
  timeS: number,
  mecoTimeS: number,
  dynamic: BodyDynamicState,
  totalMassKg: number,
  altitudeM: number,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  memory?: Stage2GuidanceMemory
): Stage2GuidanceCommand {
  const ses1TimeS = mecoTimeS + mission.guidance.ses1DelayFromMecoS;
  const twoBurn = isTwoBurnMission(mission);

  const r = norm(dynamic.positionEci);
  const rHat = scale(dynamic.positionEci, 1 / r);
  const vRadial = dot(dynamic.velocityEci, rHat);
  const vHorizVec = sub(dynamic.velocityEci, scale(rHat, vRadial));
  const vHoriz = norm(vHorizVec);
  const hHat = vHoriz > 1e-3 ? scale(vHorizVec, 1 / vHoriz) : rHat;

  // Coast between MECO / stage sep and SES-1
  if (timeS < ses1TimeS) {
    const prePitch = 0.25; // ~14 deg above horizontal
    const att = normalize(
      add(scale(hHat, Math.cos(prePitch)), scale(rHat, Math.sin(prePitch)))
    );
    if (memory) {
      memory.phase = 'COAST_TO_SES1';
      memory.timeToApoapsisS = null;
    }
    return {
      phase: 'COAST_TO_SES1',
      targetAttitudeEci: att,
      throttle: 0,
      secoTriggered: false,
      ses2Triggered: false,
      seco2Triggered: false,
      missionComplete: false,
    };
  }

  const rTarget = EARTH_RADIUS_EQUATORIAL_M + mission.targetOrbitAltitudeM;
  const targetCircEnergy = -EARTH_MU / (2 * rTarget);
  const currentEnergy = 0.5 * dot(dynamic.velocityEci, dynamic.velocityEci) - EARTH_MU / r;

  // MVac throttle with Stage 2 axial G-limit (separate from Stage 1 maxAxialAccelG)
  const mvac = vehicle.stage2.engine;
  const maxG = mission.guidance.stage2MaxAccelG ?? vehicle.stage2MaxAccelG;
  const maxAllowedThrustN = maxG * G0 * totalMassKg;
  const throttle = clamp(
    maxAllowedThrustN / mvac.thrustVacuumN,
    mvac.minThrottle,
    mvac.maxThrottle
  );
  const thrustN = throttle * mvac.thrustVacuumN;
  const aThrust = thrustN / totalMassKg;
  const mdot = thrustN / (mvac.ispVacuumS * G0);
  const vEx = mvac.ispVacuumS * G0;

  // Cross-track yaw plane steering helper (drives inclination to targetInclinationDeg)
  const computeYawSteeredHoriz = (gain: number, maxSinYaw: number): Vec3 => {
    const hVec = cross(dynamic.positionEci, dynamic.velocityEci);
    const hMag = norm(hVec);
    const curIncRad = hMag > 1e-6 ? Math.acos(clamp(hVec.z / hMag, -1, 1)) : 0;
    const targetIncRad = mission.targetInclinationDeg * DEG_TO_RAD;
    const incErrRad = targetIncRad - curIncRad;
    const nHat = hMag > 1e-6 ? scale(hVec, 1 / hMag) : { x: 0, y: 0, z: 1 };
    const yawSign = hHat.z >= 0 ? 1 : -1;
    const sinYaw = clamp(yawSign * incErrRad * gain, -maxSinYaw, maxSinYaw);
    const cosYaw = Math.sqrt(Math.max(0, 1 - sinYaw * sinYaw));
    return add(scale(hHat, cosYaw), scale(nHat, sinYaw));
  };

  // ============================================================================
  // SINGLE-BURN DIRECT INSERTION PATH (PEG variable-mass linear-tangent BVP)
  // Supports both standard ~200 km LEO and lofted ~620 km direct circular SSO.
  // ============================================================================
  if (!twoBurn) {
    const vCirc = Math.sqrt(EARTH_MU / rTarget);
    // Use spherical radius error (rTarget - r) consistent with targetCircEnergy
    // and computeOrbitalElements (avoids up to 21.4 km WGS84 geodetic oblateness
    // mismatch at high inclinations like 51.6 deg ISS and 97.9 deg SSO).
    const altErr = rTarget - r;

    // Cutoff when propellant is exhausted OR specific orbital energy reaches
    // circular target energy (the piecewise constant-thrust / G-limited PEG
    // BVP drives altErr -> 0 and vRadial -> 0 right at energy cutoff).
    if (dynamic.propellantKg <= 0 || currentEnergy >= targetCircEnergy) {
      if (memory) {
        memory.phase = 'SECO';
        memory.seco1Done = true;
        memory.seco2Done = true;
      }
      return {
        phase: 'SECO',
        targetAttitudeEci: hHat,
        throttle: 0,
        secoTriggered: true,
        ses2Triggered: false,
        seco2Triggered: false,
        missionComplete: true,
      };
    }

    // Piecewise exact time-to-go tGo accounting for Stage 2 G-limiting:
    //   - Phase A (full thrust): mass > mCap = T_vac / (maxG * g0)
    //   - Phase B (constant accel aMax = maxG * g0): mass <= mCap
    const highAltLoft = mission.targetOrbitAltitudeM > 250_000;
    const vMag = norm(dynamic.velocityEci);
    const vReqSq = vCirc * vCirc + 2 * (EARTH_MU / r - EARTH_MU / rTarget);
    const dvEnergyRem = Math.max(0.5, Math.sqrt(Math.max(0, vReqSq)) - vMag);
    const dvHorizRem = Math.max(0.5, vCirc - vHoriz);
    // Use energy-equivalent dv (exact at circular cutoff) with horizontal floor
    const dvEst = Math.max(dvEnergyRem, dvHorizRem * 0.98);

    const aMax = maxG * G0;
    const mCap = mvac.thrustVacuumN / aMax;
    const mdotMax = mvac.thrustVacuumN / vEx;
    const gLimited = totalMassKg <= mCap * 1.001;

    let tGoRaw: number;
    if (gLimited) {
      // Exact constant-acceleration remaining burn time
      tGoRaw = dvEst / Math.max(0.1, aThrust);
    } else {
      const dvToCap = vEx * Math.log(totalMassKg / mCap);
      if (dvEst <= dvToCap) {
        const tauMax = totalMassKg / mdotMax;
        tGoRaw = tauMax * (1 - Math.exp(-dvEst / vEx));
      } else {
        const tToCap = (totalMassKg - mCap) / mdotMax;
        const tAfterCap = (dvEst - dvToCap) / aMax;
        tGoRaw = tToCap + tAfterCap;
      }
    }
    const tau = mdot > 1e-6 ? totalMassKg / mdot : 1_000;
    const tGo = clamp(tGoRaw, 3.0, tau * 0.96);

    let aRadCmd: number;
    const gEff = EARTH_MU / (r * r) - (vHoriz * vHoriz) / r;
    if (highAltLoft && !gLimited && tGo > 15.0) {
      // Exact variable-mass PEG integrals over [0, tGo] during constant-thrust climb,
      // with linear gravity decay gEff(t) = gEff * (1 - t / tGo) -> rhsV uses 1/2, rhsR uses 1/3.
      const b0 = -vEx * Math.log(Math.max(1e-4, 1 - tGo / tau));
      const b1 = b0 * tau - vEx * tGo;
      const c0 = b0 * tGo - b1;
      const c1 = c0 * tau - 0.5 * vEx * tGo * tGo;
      const det = b0 * c1 - b1 * c0;

      const rhsV = -vRadial + 0.5 * gEff * tGo;
      const rhsR = altErr - vRadial * tGo + (1 / 3) * gEff * tGo * tGo;

      if (Math.abs(det) > 1e-6) {
        const A = (c1 * rhsV - b1 * rhsR) / det;
        aRadCmd = A * aThrust;
      } else {
        aRadCmd = gEff + (6.0 * altErr) / (tGo * tGo) - (4.0 * vRadial) / tGo;
      }
    } else {
      // Exact constant-acceleration BVP for linear gravity decay gEff(t) = gEff*(1 - t/tGo)
      aRadCmd = gEff + (6.0 * altErr) / (tGo * tGo) - (4.0 * vRadial) / tGo;
    }

    const sinTheta = clamp(
      aRadCmd / Math.max(0.1, aThrust),
      highAltLoft ? -0.80 : -0.55,
      highAltLoft ? 0.90 : 0.72
    );
    const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));

    const horizSteered = computeYawSteeredHoriz(26.0, 0.35);
    const targetAttitudeEci = normalize(
      add(scale(horizSteered, cosTheta), scale(rHat, sinTheta))
    );

    if (memory) memory.phase = 'STAGE2_BURN';
    return {
      phase: 'STAGE2_BURN',
      targetAttitudeEci,
      throttle,
      secoTriggered: false,
      ses2Triggered: false,
      seco2Triggered: false,
      missionComplete: false,
    };
  }

  // ============================================================================
  // TWO-BURN HOHMANN TRANSFER PATH (target > 250 km)
  // ============================================================================
  const mem = memory ?? createStage2GuidanceMemory();
  const hParkM = mission.guidance.transferPerigeeAltitudeM ?? DEFAULT_TRANSFER_PERIGEE_ALT_M;
  const rPark = EARTH_RADIUS_EQUATORIAL_M + hParkM;
  const aTx = 0.5 * (rPark + rTarget);
  const vPerigeeTx = Math.sqrt(EARTH_MU * (2 / rPark - 1 / aTx));

  // --- Phase 1: SES-1 -> SECO-1 (Transfer Orbit Insertion) ---
  if (!mem.seco1Done) {
    const orb = computeOrbitalElements(dynamic.positionEci, dynamic.velocityEci);
    if (dynamic.propellantKg <= 0) {
      mem.phase = 'SECO';
      mem.seco1Done = true;
      mem.seco1TimeS = timeS;
      mem.seco2Done = true;
      mem.timeToApoapsisS = null;
      return {
        phase: 'SECO',
        targetAttitudeEci: hHat,
        throttle: 0,
        secoTriggered: true,
        ses2Triggered: false,
        seco2Triggered: false,
        missionComplete: true,
      };
    }

    // Trigger SECO-1 once transfer orbit perigee is safely out of atmosphere (>120 km)
    // and osculating apogee reaches targetOrbitAltitudeM.
    if (
      orb.perigeeAltitudeM > 120_000 &&
      orb.apogeeAltitudeM >= mission.targetOrbitAltitudeM
    ) {
      mem.phase = 'COAST_TO_SES2';
      mem.seco1Done = true;
      mem.seco1TimeS = timeS;
      return {
        phase: 'COAST_TO_SES2',
        targetAttitudeEci: hHat,
        throttle: 0,
        secoTriggered: true,
        ses2Triggered: false,
        seco2Triggered: false,
        missionComplete: false,
      };
    }

    const dvRem = Math.max(20, vPerigeeTx - vHoriz);
    const tGoEst =
      mdot > 0
        ? (totalMassKg / mdot) * (1 - Math.exp(-dvRem / vEx))
        : dvRem / Math.max(0.1, aThrust);
    const tGo = Math.max(25.0, tGoEst);

    const gEff = EARTH_MU / (r * r) - (vHoriz * vHoriz) / r;
    const altErr = hParkM - altitudeM;
    const aRadCmd = gEff + (6.0 * altErr) / (tGo * tGo) - (4.0 * vRadial) / tGo;

    const sinTheta = clamp(aRadCmd / Math.max(0.1, aThrust), -0.45, 0.72);
    const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));

    const horizSteered = computeYawSteeredHoriz(26.0, 0.35);
    const targetAttitudeEci = normalize(
      add(scale(horizSteered, cosTheta), scale(rHat, sinTheta))
    );

    mem.phase = 'STAGE2_BURN';
    mem.timeToApoapsisS = null;
    return {
      phase: 'STAGE2_BURN',
      targetAttitudeEci,
      throttle,
      secoTriggered: false,
      ses2Triggered: false,
      seco2Triggered: false,
      missionComplete: false,
    };
  }

  // --- Phase 2: COAST_TO_SES2 (Ballistic Transfer Coast to Apoapsis) ---
  if (!mem.ses2Started) {
    const orb = computeOrbitalElements(dynamic.positionEci, dynamic.velocityEci);
    const a = orb.semiMajorAxisM;
    const e = orb.eccentricity;
    const coastElapsedS = mem.seco1TimeS !== null ? timeS - mem.seco1TimeS : 0;

    // Analytic Keplerian time to apoapsis (E -> pi, M -> pi)
    let tToApo = 0;
    if (a > EARTH_RADIUS_EQUATORIAL_M && e > 1e-5 && e < 0.99) {
      const cosE = clamp((1 - r / a) / e, -1, 1);
      const E = Math.acos(cosE);
      const M = E - e * Math.sin(E);
      const n = Math.sqrt(EARTH_MU / (a * a * a));
      if (vRadial >= 0) {
        tToApo = Math.max(0, (Math.PI - M) / n);
      } else {
        // Past apoapsis (or slightly descending right after SECO-1 before climbing)
        tToApo = coastElapsedS < 120 ? (Math.PI + M) / n : 0;
      }
    }
    mem.timeToApoapsisS = tToApo;

    // Circularization delta-v and burn duration at apoapsis
    const rApo = Math.max(r, a * (1 + e));
    const vApo = Math.sqrt(Math.max(0, EARTH_MU * (2 / rApo - 1 / Math.max(rApo, a))));
    const vCircApo = Math.sqrt(EARTH_MU / rApo);
    const dv2 = Math.max(0, vCircApo - vApo);
    const tBurn2 =
      mdot > 0 && dv2 > 0
        ? (totalMassKg / mdot) * (1 - Math.exp(-dv2 / vEx))
        : dv2 / Math.max(0.1, aThrust);

    const readyForSes2 =
      (coastElapsedS >= 60 && tToApo <= 0.5 * tBurn2) ||
      (coastElapsedS >= 300 && vRadial <= 0);

    if (readyForSes2) {
      mem.ses2Started = true;
      mem.phase = 'STAGE2_BURN_2';
      mem.timeToApoapsisS = 0;
      const horizSteered = computeYawSteeredHoriz(12.0, 0.15);
      return {
        phase: 'STAGE2_BURN_2',
        targetAttitudeEci: normalize(horizSteered),
        throttle,
        secoTriggered: false,
        ses2Triggered: true,
        seco2Triggered: false,
        missionComplete: false,
      };
    }

    mem.phase = 'COAST_TO_SES2';
    return {
      phase: 'COAST_TO_SES2',
      targetAttitudeEci: hHat,
      throttle: 0,
      secoTriggered: false,
      ses2Triggered: false,
      seco2Triggered: false,
      missionComplete: false,
    };
  }

  // --- Phase 3: SES-2 -> SECO-2 (Circularization Burn at Apoapsis) ---
  const orb2 = computeOrbitalElements(dynamic.positionEci, dynamic.velocityEci);
  const targetApoCircEnergy = -EARTH_MU / (2 * Math.max(rTarget, r));
  if (
    dynamic.propellantKg <= 0 ||
    currentEnergy >= Math.max(targetCircEnergy, targetApoCircEnergy) ||
    orb2.perigeeAltitudeM >= mission.targetOrbitAltitudeM - 1_500
  ) {
    mem.phase = 'SECO';
    mem.seco2Done = true;
    mem.timeToApoapsisS = null;
    return {
      phase: 'SECO',
      targetAttitudeEci: hHat,
      throttle: 0,
      secoTriggered: false,
      ses2Triggered: false,
      seco2Triggered: true,
      missionComplete: true,
    };
  }

  // Prograde horizontal burn with gentle inclination trim
  const horizSteered = computeYawSteeredHoriz(12.0, 0.15);
  mem.phase = 'STAGE2_BURN_2';
  return {
    phase: 'STAGE2_BURN_2',
    targetAttitudeEci: normalize(horizSteered),
    throttle,
    secoTriggered: false,
    ses2Triggered: false,
    seco2Triggered: false,
    missionComplete: false,
  };
}
