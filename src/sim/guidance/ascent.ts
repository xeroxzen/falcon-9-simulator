import type {
  AscentPhase,
  MissionConfig,
  Vec3,
  VehicleConfig,
} from '../types.js';
import { DEG_TO_RAD, G0 } from '../config/constants.js';
import { clamp, enuToEci, localEnuBasisEci, norm, normalize } from '../math.js';

export interface AscentGuidanceInput {
  readonly timeS: number;
  readonly altitudeM: number;
  readonly latRad: number;
  readonly lonRad: number;
  readonly vAirRelEci: Vec3;
  readonly mach: number;
  readonly dynamicPressurePa: number;
  readonly dragN: number;
  readonly totalMassKg: number;
  readonly stage1PropellantKg: number;
  readonly activeEngineCount: number;
  readonly ambientPressurePa: number;
  readonly launchAzimuthDeg: number;
  readonly pitchKickStartTimeS: number | null;
}

export interface AscentGuidanceCommand {
  readonly phase: AscentPhase;
  readonly targetAttitudeEci: Vec3;
  readonly throttle: number;
  readonly pitchKickStartTimeS: number | null;
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
  const reservePropKg =
    vehicle.stage1.propellantMassKg * gCfg.mecoPropellantReserveFraction;

  const basis = localEnuBasisEci(input.latRad, input.lonRad, input.timeS);
  const speedAir = norm(input.vAirRelEci);

  // Check MECO cutoff
  if (input.stage1PropellantKg <= reservePropKg) {
    const att =
      speedAir > 1.0 ? normalize(input.vAirRelEci) : basis.up;
    return {
      phase: 'MECO',
      targetAttitudeEci: att,
      throttle: 0,
      pitchKickStartTimeS: input.pitchKickStartTimeS,
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

  // Throttle schedule: nominal 100%, with EMPIRICAL 2.0 s liftoff ramp,
  // max-Q bucket, and axial G-limit.
  // EMPIRICAL: Real Falcon 9 releases its hold-down clamps at full thrust; the
  // slow v(2s) ~ 3.2 m/s seen across DM-1, CRS-16, and Iridium NEXT 8 is likely
  // a webcast telemetry smoothing / T+0 clock-offset artifact rather than a
  // physical engine spool-up. Kept as an empirical alignment correction.
  let throttle =
    input.timeS < 2.0 ? 0.72 + 0.28 * clamp(input.timeS / 2.0, 0, 1) : 1.0;

  // Max-Q throttle bucket (ASSUMED smooth transonic bucket centered on Mach 1.02..1.42)
  if (
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
    mecoTriggered: false,
  };
}
