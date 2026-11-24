import type {
  AscentPhase,
  GeodeticCoord,
  MissionConfig,
  Vec3,
  VehicleConfig,
} from '../types.js';
import { DEG_TO_RAD, EARTH_RADIUS_EQUATORIAL_M, G0 } from '../config/constants.js';
import { LANDING_SITES } from '../config/falcon9.js';
import {
  clamp,
  dot,
  ecefToEci,
  enuToEci,
  geodeticToEcef,
  localEnuBasisEci,
  norm,
  normalize,
  scale,
  sub,
} from '../math.js';

export interface AscentGuidanceInput {
  readonly timeS: number;
  readonly altitudeM: number;
  readonly latRad: number;
  readonly lonRad: number;
  readonly positionEci?: Vec3;
  readonly vAirRelEci: Vec3;
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly dragN: number;
  readonly totalMassKg: number;
  readonly stage1PropellantKg: number;
  /** Actual Stage 1 dry mass (kg), including dryMassScale dispersion when present. */
  readonly actualStage1DryMassKg?: number;
  /** Actual Isp scale factor (dispersion), defaults to 1.0. */
  readonly actualIspScale?: number;
  readonly activeEngineCount: number;
  readonly ambientPressurePa: number;
  readonly launchAzimuthDeg: number;
  readonly pitchKickStartTimeS: number | null;
  readonly throttleBucketStartTimeS?: number | null;
}

/** Lean telemetry-derived touchdown propellant margin floor (kg). */
const CLOSED_LOOP_LEAN_FLOOR_KG = 2_500;

function resolveAscentRecoveryTarget(
  mission: MissionConfig,
  launchAzimuthDeg: number
): GeodeticCoord | null {
  if (mission.landingMode === 'RTLS') {
    const site =
      (mission.landingSiteId ? LANDING_SITES[mission.landingSiteId] : undefined) ??
      (mission.launchSite.id === 'SLC-4E' ? LANDING_SITES['LZ-4'] : LANDING_SITES['LZ-40']);
    return {
      latRad: site.latDeg * DEG_TO_RAD,
      lonRad: site.lonDeg * DEG_TO_RAD,
      altitudeM: site.elevationM,
    };
  }
  if (mission.landingMode === 'ASDS' && mission.droneshipDownrangeKm !== undefined) {
    // Spherical great-circle destination along launch azimuth at droneshipDownrangeKm
    const lat1 = mission.launchSite.latDeg * DEG_TO_RAD;
    const lon1 = mission.launchSite.lonDeg * DEG_TO_RAD;
    const az = launchAzimuthDeg * DEG_TO_RAD;
    const ang = (mission.droneshipDownrangeKm * 1_000) / EARTH_RADIUS_EQUATORIAL_M;
    const sinLat2 = Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(az);
    const lat2 = Math.asin(clamp(sinLat2, -1, 1));
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(az) * Math.sin(ang) * Math.cos(lat1),
        Math.cos(ang) - Math.sin(lat1) * sinLat2
      );
    return { latRad: lat2, lonRad: lon2, altitudeM: 0 };
  }
  return null;
}

/**
 * Closed-loop MECO propellant reserve calculator (kg).
 * Triggers MECO on the absolute measured S1 propellant required for the actual
 * recovery profile (boostback + entry + landing + lean 2,500 kg floor) given
 * actual dry mass, actual Isp, and instantaneous position/velocity, so propellant
 * load, dry-mass, thrust, and wind dispersions are absorbed by MECO time & Stage 2
 * margin rather than starving the booster's landing fuel.
 */
function computeClosedLoopMecoReserveKg(
  input: AscentGuidanceInput,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  basis: ReturnType<typeof localEnuBasisEci>
): number {
  const gCfg = mission.guidance;
  const baseReserveKg =
    vehicle.stage1.propellantMassKg * gCfg.mecoPropellantReserveFraction;

  if (mission.landingMode === 'EXPENDABLE') {
    return baseReserveKg;
  }

  const mDryActual = input.actualStage1DryMassKg ?? vehicle.stage1.dryMassKg;
  const dryScale = mDryActual / vehicle.stage1.dryMassKg;
  const ispScale = input.actualIspScale ?? 1.0;
  let reqKg = baseReserveKg * (dryScale / ispScale);

  // Real-time closed-loop boostback + entry + landing budget for RTLS & close-in ASDS-BB
  if (
    input.positionEci !== undefined &&
    input.stage1PropellantKg < reqKg * 1.45 &&
    (mission.landingMode === 'RTLS' || mission.droneshipDownrangeKm !== undefined)
  ) {
    const target = resolveAscentRecoveryTarget(mission, input.launchAzimuthDeg);
    if (target !== null) {
      const vUp = dot(input.vAirRelEci, basis.up);
      const vHorizVec = sub(input.vAirRelEci, scale(basis.up, vUp));
      const targetEci = ecefToEci(geodeticToEcef(target), input.timeS);
      const toTargetEci = sub(targetEci, input.positionEci);
      const toTargetHoriz = sub(toTargetEci, scale(basis.up, dot(toTargetEci, basis.up)));
      const gLocal = 9.55;
      const hAbove = Math.max(0, input.altitudeM - target.altitudeM);
      // Propagate physical stage-sep + cold-gas RCS flip coast before boostback ignition
      const tFlipCoast = gCfg.stageSepDelayS + 15.0;
      const hFlip = Math.max(0, hAbove + vUp * tFlipCoast - 0.5 * gLocal * tFlipCoast * tFlipCoast);
      const vUpFlip = vUp - gLocal * tFlipCoast;
      const toTargetHorizFlip = sub(toTargetHoriz, scale(vHorizVec, tFlipCoast));
      const disc = Math.max(0, vUpFlip * vUpFlip + 2 * gLocal * hFlip);
      const dragFactor = mission.landingMode === 'RTLS' ? 0.92 : 0.965;
      const bbPitchRad = (gCfg.boostbackPitchDeg ?? -4.0) * DEG_TO_RAD;
      // Downward boostback pitch depresses apogee and shortens ballistic flight time
      const tFlight =
        ((vUpFlip + Math.sqrt(disc)) / gLocal) *
        dragFactor *
        (1 + 0.28 * Math.sin(bbPitchRad));
      const predMiss = sub(scale(vHorizVec, Math.max(10, tFlight)), toTargetHorizFlip);
      const missDist = norm(predMiss);
      const dvBb =
        missDist / Math.max(10, tFlight) / Math.max(0.5, Math.cos(bbPitchRad));

      const ispVac = vehicle.stage1.engine.ispVacuumS * ispScale;
      const ispSl = vehicle.stage1.engine.ispSeaLevelS * ispScale;
      const dvLnd = 720;
      const vFallEst = Math.sqrt(Math.max(0, vUp * vUp + 2 * gLocal * hAbove));
      const dvEnt = Math.min(920, Math.max(550, 0.54 * vFallEst));

      const mAfterEnt =
        (mDryActual + CLOSED_LOOP_LEAN_FLOOR_KG) * Math.exp(dvLnd / (ispSl * G0));
      const mAfterBb = mAfterEnt * Math.exp(dvEnt / (ispVac * G0));
      const mAtMeco = mAfterBb * Math.exp((dvBb * 1.05) / (ispVac * G0));
      const closedLoopKg = mAtMeco - mDryActual;

      if (closedLoopKg > reqKg) {
        reqKg = closedLoopKg;
      }
    }
  }

  return reqKg;
}

export interface AscentGuidanceCommand {
  readonly phase: AscentPhase;
  readonly targetAttitudeEci: Vec3;
  readonly throttle: number;
  readonly pitchKickStartTimeS: number | null;
  readonly throttleBucketStartTimeS: number | null;
  readonly mecoTriggered: boolean;
}

/**
 * Compute Stage 1 ascent guidance commands (liftoff -> MECO):
 *  1. Vertical rise until pitchKickAltitudeM
 *  2. Smooth pitchover kick along launch azimuth
 *  3. Gravity turn (align thrust with air-relative velocity)
 *  4. Max-Q throttle bucket
 *  5. Axial acceleration limiting (e.g. 4.5 g)
 *  6. MECO at propellant reserve cutoff
 *
 * All guidance timings and thresholds are ASSUMED approximations (see docs/ASSUMPTIONS.md).
 */
export function computeAscentGuidance(
  input: AscentGuidanceInput,
  vehicle: VehicleConfig,
  mission: MissionConfig
): AscentGuidanceCommand {
  const gCfg = mission.guidance;
  const basis = localEnuBasisEci(input.latRad, input.lonRad, input.timeS);
  const reservePropKg = computeClosedLoopMecoReserveKg(input, vehicle, mission, basis);
  const speedAir = norm(input.vAirRelEci);

  let throttleBucketStartTimeS = input.throttleBucketStartTimeS ?? null;

  // Check MECO cutoff
  if (input.stage1PropellantKg <= reservePropKg) {
    const att =
      speedAir > 1.0 ? normalize(input.vAirRelEci) : basis.up;
    return {
      phase: 'MECO',
      targetAttitudeEci: att,
      throttle: 0,
      pitchKickStartTimeS: input.pitchKickStartTimeS,
      throttleBucketStartTimeS,
      mecoTriggered: true,
    };
  }

  // Attitude phase logic (use height ABOVE LAUNCH PAD, not AMSL, so high-elevation
  // pads like Vandenberg SLC-4E at 114 m AMSL still clear the tower properly)
  const heightAbovePadM = input.altitudeM - mission.launchSite.elevationM;
  let pitchKickStartTimeS = input.pitchKickStartTimeS;
  let phase: AscentPhase;
  let targetAttitudeEci: Vec3;

  if (
    pitchKickStartTimeS === null &&
    heightAbovePadM < gCfg.pitchKickAltitudeM
  ) {
    phase = 'VERTICAL_RISE';
    targetAttitudeEci = basis.up;
  } else {
    if (pitchKickStartTimeS === null) {
      pitchKickStartTimeS = input.timeS;
    }
    const dtKick = input.timeS - pitchKickStartTimeS;
    if (dtKick < gCfg.pitchKickDurationS) {
      phase = 'PITCHOVER';
      const frac = clamp(dtKick / gCfg.pitchKickDurationS, 0, 1);
      const pitchRad = gCfg.pitchKickAngleDeg * DEG_TO_RAD * frac;
      const azRad = input.launchAzimuthDeg * DEG_TO_RAD;
      const east = Math.sin(pitchRad) * Math.sin(azRad);
      const north = Math.sin(pitchRad) * Math.cos(azRad);
      const up = Math.cos(pitchRad);
      targetAttitudeEci = normalize(enuToEci(east, north, up, basis));
    } else {
      phase = 'GRAVITY_TURN';
      targetAttitudeEci =
        speedAir > 1.0 ? normalize(input.vAirRelEci) : basis.up;
    }
  }

  // Throttle schedule: nominal 100% from clamp release, with max-Q bucket and
  // axial G-limit. (The former EMPIRICAL 2.0 s liftoff ramp was removed in
  // Part D Variant (a) in favor of the fitted webcast-clock offset in
  // validation comparisons, selected by holdout performance.)
  let throttle = 1.0;

  // Max-Q throttle bucket:
  // System-ID v2 parameterized trapezoidal bucket (startMach, durationS, depth),
  // falling back to legacy Mach 1.02..maxQThrottleEndMach when omitted.
  if (
    gCfg.maxQThrottleStartMach !== undefined &&
    gCfg.maxQThrottleDurationS !== undefined &&
    gCfg.maxQThrottleDurationS > 0.5
  ) {
    if (
      throttleBucketStartTimeS === null &&
      input.altitudeM < 28_000 &&
      input.mach >= gCfg.maxQThrottleStartMach
    ) {
      throttleBucketStartTimeS = input.timeS;
    }
    if (throttleBucketStartTimeS !== null) {
      const dtBucket = input.timeS - throttleBucketStartTimeS;
      const dur = gCfg.maxQThrottleDurationS;
      if (dtBucket >= 0 && dtBucket < dur) {
        phase = 'MAX_Q_THROTTLE';
        const rampS = clamp(0.2 * dur, 2.0, 5.0);
        if (dtBucket < rampS) {
          const frac = clamp(dtBucket / rampS, 0, 1);
          throttle = Math.min(throttle, 1.0 - frac * (1.0 - gCfg.maxQMinThrottle));
        } else if (dtBucket <= dur - rampS) {
          throttle = Math.min(throttle, gCfg.maxQMinThrottle);
        } else {
          const frac = clamp((dtBucket - (dur - rampS)) / rampS, 0, 1);
          throttle = Math.min(
            throttle,
            gCfg.maxQMinThrottle + frac * (1.0 - gCfg.maxQMinThrottle)
          );
        }
      }
    }
  } else if (
    input.altitudeM < 28_000 &&
    input.dynamicPressurePa >= gCfg.maxQThrottleStartPa &&
    input.mach < gCfg.maxQThrottleEndMach
  ) {
    phase = 'MAX_Q_THROTTLE';
    if (input.mach < 1.24) {
      // Smoothly ramp down across Mach 1.02..1.22 so q peaks naturally near T+58-61 s
      const rampDown = clamp((input.mach - 1.02) / 0.20, 0, 1);
      throttle = Math.min(throttle, 1.0 - rampDown * (1.0 - gCfg.maxQMinThrottle));
    } else {
      // Smoothly ramp back up from Mach 1.24 to maxQThrottleEndMach
      const rampUp = clamp(
        (input.mach - 1.24) / Math.max(0.05, gCfg.maxQThrottleEndMach - 1.24),
        0,
        1
      );
      throttle = Math.min(
        throttle,
        gCfg.maxQMinThrottle + rampUp * (1.0 - gCfg.maxQMinThrottle)
      );
    }
  }

  // Axial acceleration limit (cap (T - D) / (m * g0) <= maxAxialAccelG)
  if (input.activeEngineCount > 0) {
    const spec = vehicle.stage1.engine;
    const maxG = gCfg.maxAxialAccelG ?? vehicle.maxAxialAccelG;
    const maxAllowedThrustN =
      maxG * G0 * input.totalMassKg + input.dragN;
    const backPressureLossN =
      input.activeEngineCount * input.ambientPressurePa * spec.exitAreaM2;
    const maxVacThrustAt100 = input.activeEngineCount * spec.thrustVacuumN;
    const gLimitThrottle =
      (maxAllowedThrustN + backPressureLossN) / maxVacThrustAt100;
    if (gLimitThrottle < throttle) {
      throttle = clamp(gLimitThrottle, spec.minThrottle, spec.maxThrottle);
    }
  }

  return {
    phase,
    targetAttitudeEci,
    throttle,
    pitchKickStartTimeS,
    throttleBucketStartTimeS,
    mecoTriggered: false,
  };
}
