import type {
  BodyDynamicState,
  BoosterPhase,
  GeodeticCoord,
  MissionConfig,
  Vec3,
  VehicleConfig,
} from '../types.js';
import { DEG_TO_RAD, G0, RAD_TO_DEG } from '../config/constants.js';
import { CONSTANTS_REGISTRY as R } from '../config/registry.js';
import { sampleAtmosphere } from '../models/atmosphere.js';
import { boosterDescentDragCoefficient } from '../models/aerodynamics.js';
import {
  add,
  angleBetweenRad,
  clamp,
  dot,
  earthRotationVelocityEci,
  ecefToEci,
  geodeticToEcef,
  horizontalDistanceToTargetM,
  localEnuBasisEci,
  norm,
  normalize,
  scale,
  sub,
} from '../math.js';

export interface EntryBallisticPrediction {
  readonly peakQDotMWm2: number;
  readonly peakQPa: number;
  readonly timeToPeakS: number;
}

export interface BoosterGuidanceMemory {
  phase: BoosterPhase;
  entryBurnStartTimeS: number | null;
  landingLegsDeployed: boolean;
  /** True for RTLS and close-in ASDS missions requiring a partial boostback burn. */
  needsBoostback?: boolean;
  failureReason?: string;
  /** Cached ballistic entry heating lookahead (refreshed every 0.5 s). */
  lastEntryPredTimeS?: number;
  lastEntryPred?: EntryBallisticPrediction;
  /** Timestamp when booster first entered terminal flare (< 2.5 m AGL). */
  flareStartTimeS?: number;
}

/**
 * Vehicle-level predictive entry-burn thermal envelope parameters
 * (CALIBRATED on Block 5 Iridium NEXT 8 & SAOCOM 1A; single shared rule across
 * all recovery modes, zero per-flight or mode-specific altitude/speed thresholds).
 */
export const ENTRY_BURN_HEATING_LIMIT_MW_M2 = R.ENTRY_BURN_HEATING_LIMIT_MW_M2.value;
export const ENTRY_BURN_AERO_LEAD_S = R.ENTRY_BURN_AERO_LEAD_S.value;
/**
 * CALIBRATED: Target 3-engine axial deceleration (g) during the throttled / 1-3-1 entry burn
 * (reconstructed 3.4-4.2 g across all 11 telemetry flights; mass-invariant).
 */
export const ENTRY_BURN_TARGET_ACCEL_G = R.ENTRY_BURN_TARGET_ACCEL_G.value;
export const ENTRY_BURN_MAX_DURATION_S = R.ENTRY_BURN_MAX_DURATION_S.value;
const SUTTON_GRAVES_K = R.SUTTON_GRAVES_K_EARTH.value;
const BOOSTER_BASE_RADIUS_M = R.BOOSTER_BASE_RADIUS_M.value;

/**
 * Fast 2D ballistic lookahead from the current descending state to predict
 * unburned peak Sutton-Graves convective stagnation heating (MW/m^2), peak
 * dynamic pressure (Pa), and time remaining until peak heating (s).
 */
export function predictBallisticEntryPeak(
  altitudeM: number,
  speedHorizMs: number,
  vUpMs: number,
  massKg: number,
  referenceAreaM2: number
): EntryBallisticPrediction {
  let h = altitudeM;
  let vh = speedHorizMs;
  let vz = vUpMs;
  let peakQDot = 0;
  let peakQ = 0;
  let timeToPeakS = 0;
  const dt = 0.5;
  const invMass = 1 / Math.max(1, massKg);

  for (let t = 0; t < 120 && h > 4_000; t += dt) {
    const atm = sampleAtmosphere(h);
    const v = Math.hypot(vh, vz);
    const q = 0.5 * atm.densityKgM3 * v * v;
    const qDot =
      (SUTTON_GRAVES_K * Math.sqrt(atm.densityKgM3 / BOOSTER_BASE_RADIUS_M) * v * v * v) /
      1e6;
    if (qDot > peakQDot) {
      peakQDot = qDot;
      timeToPeakS = t;
    }
    if (q > peakQ) peakQ = q;
    const mach = atm.speedOfSoundMs > 0 ? v / atm.speedOfSoundMs : 0;
    const aDrag = q * boosterDescentDragCoefficient(mach) * referenceAreaM2 * invMass;
    const g = G0 * (6_371_000 / (6_371_000 + h)) ** 2;
    const invV = v > 1 ? 1 / v : 0;
    vh -= aDrag * vh * invV * dt;
    vz += (-g - aDrag * vz * invV) * dt;
    h += vz * dt;
  }

  return { peakQDotMWm2: peakQDot, peakQPa: peakQ, timeToPeakS };
}

export interface BoosterGuidanceCommand {
  readonly phase: BoosterPhase;
  readonly targetAttitudeEci: Vec3;
  /** Indices of active Merlin 1D engines (empty = engines off, [0,1,5] = 3-eng, [0] = 1-eng) */
  readonly activeEngineIndices: readonly number[];
  readonly throttle: number;
  /** Desired aerodynamic steering direction in ECI (for grid-fin lift) */
  readonly aeroSteerDirEci: Vec3;
  /** Commanded grid-fin deflection in degrees [-20, +20] */
  readonly gridFinDeflectionDeg: number;
  readonly landingLegsDeployed: boolean;
}

/**
 * Compute Stage 1 booster recovery guidance:
 *   MECO_COAST -> FLIP -> [BOOSTBACK_BURN (RTLS)] -> BALLISTIC_COAST
 *   -> ENTRY_BURN (3-engine) -> AERO_DESCENT (grid fins)
 *   -> LANDING_BURN (ZEM/ZEV optimal powered descent + suicide-burn vertical law)
 *   -> LANDED / CRASHED
 *
 * Realistic touchdown criteria enforced:
 *   - ASDS lateral miss < 10 m, RTLS lateral miss < 15 m
 *   - |v_z| < 2.0 m/s, |v_h| < 1.0 m/s, tilt < 5.0 deg, propellant > 0
 */
export function computeBoosterGuidance(
  timeS: number,
  stageSepTimeS: number,
  dynamic: BodyDynamicState,
  geodetic: GeodeticCoord,
  totalMassKg: number,
  ambientPressurePa: number,
  ambientDensityKgM3: number,
  targetCoord: GeodeticCoord,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  mem: BoosterGuidanceMemory,
  trueDynamic?: BodyDynamicState,
  trueGeodetic?: GeodeticCoord
): BoosterGuidanceCommand {
  const basis = localEnuBasisEci(geodetic.latRad, geodetic.lonRad, timeS);
  const vRot = earthRotationVelocityEci(dynamic.positionEci);
  const vRel = sub(dynamic.velocityEci, vRot);
  const speedRel = norm(vRel);
  const vUp = dot(vRel, basis.up);
  const vHorizVec = sub(vRel, scale(basis.up, vUp));

  // Target position in ECI at current time (sensed state used for guidance)
  const targetEci = ecefToEci(geodeticToEcef(targetCoord), timeS);
  const toTargetEci = sub(targetEci, dynamic.positionEci);
  const toTargetUp = dot(toTargetEci, basis.up);
  const toTargetHoriz = sub(toTargetEci, scale(basis.up, toTargetUp));
  const distHoriz = horizontalDistanceToTargetM(
    dynamic.positionEci,
    timeS,
    targetCoord
  );

  const heightAboveTarget = geodetic.altitudeM - targetCoord.altitudeM;
  const zeroVec: Vec3 = { x: 0, y: 0, z: 0 };

  // TRUE state used exclusively for physical ground/deck contact & landing criteria
  const tdDyn = trueDynamic ?? dynamic;
  const tdGeo = trueGeodetic ?? geodetic;
  const tdBasis = localEnuBasisEci(tdGeo.latRad, tdGeo.lonRad, timeS);
  const tdVRel = sub(tdDyn.velocityEci, earthRotationVelocityEci(tdDyn.positionEci));
  const tdVUp = dot(tdVRel, tdBasis.up);
  const tdVHoriz = norm(sub(tdVRel, scale(tdBasis.up, tdVUp)));
  const tdHeightAboveTarget = tdGeo.altitudeM - targetCoord.altitudeM;
  const tdDistHoriz = horizontalDistanceToTargetM(
    tdDyn.positionEci,
    timeS,
    targetCoord
  );
  const tdTiltDeg = angleBetweenRad(tdDyn.attitudeEci, tdBasis.up) * RAD_TO_DEG;

  // Optional ASDS deck motion (heave + roll) for realistic sea-state touchdown criteria
  const disp = mission.dispersions;
  const isAsdsDeck = mission.landingMode === 'ASDS' && disp !== undefined;
  const heaveAmp = isAsdsDeck ? (disp.deckHeaveAmpM ?? 0) : 0;
  const rollAmpDeg = isAsdsDeck ? (disp.deckRollAmpDeg ?? 0) : 0;
  const deckPhase = disp?.deckPhaseRad ?? 0;
  const heaveOmega = (2 * Math.PI) / 7.0; // ~7 s ocean swell period
  const rollOmega = (2 * Math.PI) / 8.0;  // ~8 s barge roll period
  const deckHeaveM = heaveAmp > 0 ? heaveAmp * Math.sin(heaveOmega * timeS + deckPhase) : 0;
  const deckHeaveVelMs =
    heaveAmp > 0 ? heaveAmp * heaveOmega * Math.cos(heaveOmega * timeS + deckPhase) : 0;
  const deckRollDeg =
    rollAmpDeg > 0 ? Math.abs(rollAmpDeg * Math.sin(rollOmega * timeS + deckPhase * 1.3)) : 0;

  // Strict realistic touchdown check on TRUE vehicle state relative to moving ASDS deck
  if (tdHeightAboveTarget <= deckHeaveM && timeS > stageSepTimeS + 10) {
    const maxMissM = mission.landingMode === 'RTLS' ? 15.0 : 10.0;
    const relVUp = tdVUp - deckHeaveVelMs;
    const relTiltDeg = tdTiltDeg + deckRollDeg;
    const reasons: string[] = [];
    if (tdDyn.propellantKg <= 0) reasons.push('Propellant depleted');
    if (Math.abs(relVUp) >= 2.0) {
      reasons.push(`Vertical speed ${Math.abs(relVUp).toFixed(1)} m/s (>= 2 m/s)`);
    }
    if (tdVHoriz >= 1.0) {
      reasons.push(`Horizontal speed ${tdVHoriz.toFixed(1)} m/s (>= 1 m/s)`);
    }
    if (relTiltDeg >= 5.0) {
      reasons.push(`Tilt ${relTiltDeg.toFixed(1)}° (>= 5°)`);
    }
    if (tdDistHoriz >= maxMissM) {
      reasons.push(`Off-target miss ${tdDistHoriz.toFixed(1)} m (>= ${maxMissM} m)`);
    }
    const softLanding = reasons.length === 0;
    mem.phase = softLanding ? 'LANDED' : 'CRASHED';
    mem.failureReason = softLanding ? undefined : reasons.join('; ');
    return {
      phase: mem.phase,
      targetAttitudeEci: tdBasis.up,
      activeEngineIndices: [],
      throttle: 0,
      aeroSteerDirEci: zeroVec,
      gridFinDeflectionDeg: 0,
      landingLegsDeployed: mem.landingLegsDeployed,
    };
  }

  // Expendable mode: no recovery burns
  if (mission.landingMode === 'EXPENDABLE') {
    const retro = speedRel > 1 ? scale(vRel, -1 / speedRel) : basis.up;
    mem.phase = 'BALLISTIC_COAST';
    return {
      phase: 'BALLISTIC_COAST',
      targetAttitudeEci: retro,
      activeEngineIndices: [],
      throttle: 0,
      aeroSteerDirEci: zeroVec,
      gridFinDeflectionDeg: 0,
      landingLegsDeployed: false,
    };
  }

  // 1. Short coast after stage separation before initiating RCS flip
  if (timeS < stageSepTimeS + 3.0) {
    mem.phase = 'MECO_COAST';
    return {
      phase: 'MECO_COAST',
      targetAttitudeEci: dynamic.attitudeEci,
      activeEngineIndices: [],
      throttle: 0,
      aeroSteerDirEci: zeroVec,
      gridFinDeflectionDeg: 0,
      landingLegsDeployed: false,
    };
  }

  // Compute physics-based propellant reserves from actual instantaneous dry mass
  // (actual totalMassKg - measured dynamic.propellantKg) and actual Isp, rather than
  // fractions of nominal stage propellant load.
  const actualDryMassKg = Math.max(10_000, totalMassKg - dynamic.propellantKg);
  const ispScaleActual = disp?.ispScale ?? 1.0;
  const merlinCfg = vehicle.stage1.engine;
  const landingPropReserveKg =
    (actualDryMassKg + 1_000) *
      (Math.exp(650 / (merlinCfg.ispSeaLevelS * ispScaleActual * G0)) - 1) +
    1_000;
  const entryIgnitionMinPropKg = landingPropReserveKg + 1_500;
  const boostbackCutoffReserveKg =
    (actualDryMassKg + landingPropReserveKg) *
      (Math.exp(650 / (merlinCfg.ispVacuumS * ispScaleActual * G0)) - 1) +
    landingPropReserveKg;
  const retroDir = speedRel > 1 ? scale(vRel, -1 / speedRel) : basis.up;

  const hasBoostback = mem.needsBoostback ?? mission.landingMode === 'RTLS';
  const bbPitchRad = (mission.guidance.boostbackPitchDeg ?? -4.0) * DEG_TO_RAD;
  const cosBb = Math.cos(bbPitchRad);
  const sinBb = Math.sin(bbPitchRad);

  // 2. Flip maneuver (cold-gas RCS rotation toward boostback or retrograde)
  if (mem.phase === 'MECO_COAST' || mem.phase === 'FLIP') {
    mem.phase = 'FLIP';
    let flipTarget = retroDir;
    if (hasBoostback && distHoriz > 100) {
      // Point at boostbackPitchDeg relative to local horizontal, opposite the predicted
      // drag-shortened ballistic miss — works identically for RTLS (pad behind)
      // and close-in ASDS partial boostback (droneship ahead, ballistic impact past it).
      const gLocal = 9.55;
      const disc = Math.max(
        0,
        vUp * vUp + 2 * gLocal * Math.max(0, heightAboveTarget)
      );
      const dragFactor = mission.landingMode === 'RTLS' ? 0.92 : 0.965;
      const tFlight = ((vUp + Math.sqrt(disc)) / gLocal) * dragFactor;
      const predMiss = sub(scale(vHorizVec, tFlight), toTargetHoriz);
      const missDist = norm(predMiss);
      const burnHorizDir =
        missDist > 1 ? scale(predMiss, -1 / missDist) : normalize(toTargetHoriz);
      flipTarget = normalize(add(scale(burnHorizDir, cosBb), scale(basis.up, sinBb)));
    }
    const angErr = angleBetweenRad(dynamic.attitudeEci, flipTarget);
    if (angErr < 0.14) {
      mem.phase = hasBoostback ? 'BOOSTBACK_BURN' : 'BALLISTIC_COAST';
    } else {
      return {
        phase: 'FLIP',
        targetAttitudeEci: flipTarget,
        activeEngineIndices: [],
        throttle: 0,
        aeroSteerDirEci: zeroVec,
        gridFinDeflectionDeg: 0,
        landingLegsDeployed: false,
      };
    }
  }

  // 3. Boostback burn (RTLS or close-in ASDS partial boostback; 3 engines: center + 2 outer)
  if (mem.phase === 'BOOSTBACK_BURN') {
    // Predict ballistic time of flight to target altitude (scaled for
    // atmospheric drag shortening during descent; steeper RTLS loses ~8%,
    // higher-velocity partial-boostback ASDS loses ~3.5% before entry burn).
    const gLocal = 9.55;
    const disc = Math.max(
      0,
      vUp * vUp + 2 * gLocal * Math.max(0, heightAboveTarget)
    );
    const dragFactor = mission.landingMode === 'RTLS' ? 0.92 : 0.965;
    const tFlight = ((vUp + Math.sqrt(disc)) / gLocal) * dragFactor;
    const predMiss = sub(scale(vHorizVec, tFlight), toTargetHoriz);
    const missDist = norm(predMiss);
    const cutoffMissM = mission.landingMode === 'RTLS' ? 1_500 : 500;

    if (missDist < cutoffMissM || dynamic.propellantKg <= boostbackCutoffReserveKg) {
      mem.phase = 'BALLISTIC_COAST';
    } else {
      const burnHorizDir = scale(predMiss, -1 / missDist);
      const burnDir = normalize(
        add(scale(burnHorizDir, cosBb), scale(basis.up, sinBb))
      );
      return {
        phase: 'BOOSTBACK_BURN',
        targetAttitudeEci: burnDir,
        activeEngineIndices: [0, 1, 5],
        throttle: 1.0,
        aeroSteerDirEci: zeroVec,
        gridFinDeflectionDeg: 0,
        landingLegsDeployed: false,
      };
    }
  }

  // 4. Ballistic coast to atmospheric entry interface (physics-based predictive heating rule)
  // Single vehicle-level rule across all recovery modes (no fixed altitude/speed thresholds):
  // ignite 3-engine throttled entry burn when unburned peak Sutton-Graves stagnation heating
  // exceeds ENTRY_BURN_HEATING_LIMIT_MW_M2 and time-to-peak-heating <= tBurnEst + aeroLead.
  const getEntryPrediction = (): EntryBallisticPrediction => {
    if (
      mem.lastEntryPred !== undefined &&
      mem.lastEntryPredTimeS !== undefined &&
      Math.abs(timeS - mem.lastEntryPredTimeS) < 0.49
    ) {
      return mem.lastEntryPred;
    }
    const pred = predictBallisticEntryPeak(
      geodetic.altitudeM,
      norm(vHorizVec),
      vUp,
      totalMassKg,
      vehicle.referenceAreaM2
    );
    mem.lastEntryPredTimeS = timeS;
    mem.lastEntryPred = pred;
    return pred;
  };

  if (mem.phase === 'BALLISTIC_COAST') {
    if (
      vUp < -50 &&
      geodetic.altitudeM <= 95_000 &&
      dynamic.propellantKg > entryIgnitionMinPropKg
    ) {
      const pred = getEntryPrediction();
      if (pred.peakQDotMWm2 > ENTRY_BURN_HEATING_LIMIT_MW_M2) {
        const vRatio = Math.cbrt(ENTRY_BURN_HEATING_LIMIT_MW_M2 / pred.peakQDotMWm2);
        const dvReq = Math.max(0, speedRel * (1 - vRatio));
        const a3 = Math.min(
          (3 * vehicle.stage1.engine.thrustVacuumN) / Math.max(1, totalMassKg),
          ENTRY_BURN_TARGET_ACCEL_G * G0
        );
        const tBurnEst = Math.min(ENTRY_BURN_MAX_DURATION_S, dvReq / Math.max(1, a3));
        if (pred.timeToPeakS <= tBurnEst + ENTRY_BURN_AERO_LEAD_S) {
          mem.phase = 'ENTRY_BURN';
          mem.entryBurnStartTimeS = timeS;
          mem.lastEntryPredTimeS = undefined;
        }
      }
    }
    if (mem.phase === 'BALLISTIC_COAST' && vUp < 0 && geodetic.altitudeM <= 35_000) {
      mem.phase = 'AERO_DESCENT';
    }
    if (mem.phase === 'BALLISTIC_COAST') {
      return {
        phase: 'BALLISTIC_COAST',
        targetAttitudeEci: retroDir,
        activeEngineIndices: [],
        throttle: 0,
        aeroSteerDirEci: zeroVec,
        gridFinDeflectionDeg: 0,
        landingLegsDeployed: false,
      };
    }
  }

  // 5. Entry burn (3-engine throttled / 1-3-1 average retrograde burn until predicted
  // post-burn peak stagnation heating drops under ENTRY_BURN_HEATING_LIMIT_MW_M2)
  if (mem.phase === 'ENTRY_BURN') {
    const burnDur =
      mem.entryBurnStartTimeS !== null ? timeS - mem.entryBurnStartTimeS : 0;
    const pred = getEntryPrediction();
    if (
      pred.peakQDotMWm2 <= ENTRY_BURN_HEATING_LIMIT_MW_M2 ||
      burnDur >= ENTRY_BURN_MAX_DURATION_S ||
      geodetic.altitudeM <= 28_000 ||
      dynamic.propellantKg <= landingPropReserveKg
    ) {
      mem.phase = 'AERO_DESCENT';
    } else {
      const entryThrottle = clamp(
        (ENTRY_BURN_TARGET_ACCEL_G * G0 * totalMassKg) /
          Math.max(1, 3 * vehicle.stage1.engine.thrustVacuumN),
        0.4,
        1.0
      );
      return {
        phase: 'ENTRY_BURN',
        targetAttitudeEci: retroDir,
        activeEngineIndices: [0, 1, 5],
        throttle: entryThrottle,
        aeroSteerDirEci: zeroVec,
        gridFinDeflectionDeg: 0,
        landingLegsDeployed: false,
      };
    }
  }

  // Compute analytic suicide-burn (hoverslam) ignition altitude using a single
  // unified physics-based deceleration envelope across all landing modes
  // (no RTLS/ASDS mode branch):
  //  - Nominal 1-engine stopping altitude hIgnition (88% throttle)
  //  - 3-engine emergency stopping floor hStop3 (at 80% x 3 engines): wait until
  //    4,500 m so atmospheric drag brakes for free UNLESS current (vDown, mass)
  //    physically requires higher altitude for safe 3-engine stopping (e.g., fast/heavy
  //    steep entries).
  const merlin = vehicle.stage1.engine;
  const maxThrust1 =
    merlin.thrustVacuumN - ambientPressurePa * merlin.exitAreaM2;
  const nomThrust = Math.max(1, 0.88 * maxThrust1);
  const aNetNom = Math.max(2.0, nomThrust / totalMassKg - G0);
  const aNet3 = Math.max(4.0, (2.4 * maxThrust1) / totalMassKg - G0);
  const vDown = Math.max(0, -vUp);
  const hIgnition = (vDown * vDown) / (2 * aNetNom) + 35.0;
  const hStop3 = (vDown * vDown) / (2 * aNet3) + 35.0;

  // 6. Aerodynamic descent with titanium grid fins
  const maxIgnitionAltM = Math.min(6_000, Math.max(4_500, 1.15 * hStop3));
  if (mem.phase === 'AERO_DESCENT') {
    if (
      heightAboveTarget <= maxIgnitionAltM &&
      vUp < -5 &&
      heightAboveTarget <= hIgnition &&
      dynamic.propellantKg > 0
    ) {
      mem.phase = 'LANDING_BURN';
    } else {
      // Aerodynamic glide-slope proportional controller:
      // Because drag acts anti-parallel to velocity, the glide ratio v_h / v_down
      // is nearly invariant during atmospheric descent. Projecting along the
      // current velocity vector gives the true unpowered impact miss; fin
      // deflection is proportional to the angular glide-slope error (with a
      // dynamic-pressure gate where fins have negligible authority above ~45 km).
      const qPa = 0.5 * ambientDensityKgM3 * speedRel * speedRel;
      if (qPa < 1_000) {
        return {
          phase: 'AERO_DESCENT',
          targetAttitudeEci: retroDir,
          activeEngineIndices: [],
          throttle: 0,
          aeroSteerDirEci: zeroVec,
          gridFinDeflectionDeg: 0,
          landingLegsDeployed: false,
        };
      }
      // Physical horizontal travel predictor:
      //  - During aero glide, drag acts anti-parallel to v so v_h/v_down is nearly invariant.
      //  - During constant-deceleration hoverslam, t_burn = 2*h/v_down and
      //    d_burn = 0.5*v_h*t_burn = v_h * (h / v_down) (the 0.5 and 2 cancel).
      //  - Slightly < 1.0 (~0.92) accounts for gravity steepening the flight path.
      const tGlide = (0.92 * heightAboveTarget) / Math.max(40, vDown);
      const predMiss = sub(scale(vHorizVec, tGlide), toTargetHoriz);
      const missDist = norm(predMiss);
      const steerDir =
        missDist > 1 ? scale(predMiss, -1 / missDist) : zeroVec;
      const angleErrDeg =
        Math.atan2(missDist, Math.max(heightAboveTarget, 600)) * RAD_TO_DEG;
      const deflDeg = clamp(angleErrDeg * 1.15, 0, 20);

      return {
        phase: 'AERO_DESCENT',
        targetAttitudeEci: retroDir,
        activeEngineIndices: [],
        throttle: 0,
        aeroSteerDirEci: steerDir,
        gridFinDeflectionDeg: deflDeg,
        landingLegsDeployed: false,
      };
    }
  }

  // 7. Landing burn: ZEM/ZEV optimal powered descent + vertical hoverslam
  if (heightAboveTarget <= 120) {
    mem.landingLegsDeployed = true;
  }

  if (dynamic.propellantKg <= 0) {
    return {
      phase: 'LANDING_BURN',
      targetAttitudeEci: basis.up,
      activeEngineIndices: [],
      throttle: 0,
      aeroSteerDirEci: zeroVec,
      gridFinDeflectionDeg: 0,
      landingLegsDeployed: mem.landingLegsDeployed,
    };
  }

  // Terminal vertical profile with heave & HEURISTIC velocity-bias anti-hover guard:
  // Brake toward v_td = 0.55 m/s at h_flare = 1.85 m (keeping v_td + max 1.35 m/s ASDS deck heave
  // below 2.0 m/s). If the booster remains in the final 2.5 m flare longer than 3.5 s (indicating
  // an unaided negative INS vertical velocity bias holding true v_down <= 0), gently ramp v_td
  // (+0.15 m/s per second) so true descent resumes smoothly without hover-hang propellant depletion.
  // Labelled HEURISTIC in CONSTANTS_REGISTRY; tracked in docs/BACKLOG.md for radar-based velocity estimation.
  if (heightAboveTarget < R.ANTI_HOVER_FLARE_GATE_ALT_M.value && mem.flareStartTimeS === undefined) {
    mem.flareStartTimeS = timeS;
  }
  const flareExcessS =
    mem.flareStartTimeS !== undefined
      ? Math.max(0, timeS - mem.flareStartTimeS - R.ANTI_HOVER_FLARE_DELAY_S.value)
      : 0;
  const vTd =
    R.TERMINAL_FLARE_TARGET_VTD_MS.value +
    Math.min(
      R.ANTI_HOVER_FLARE_MAX_ADD_MS.value,
      R.ANTI_HOVER_FLARE_RAMP_MS_PER_S.value * flareExcessS
    );
  const hFlare = R.TERMINAL_FLARE_HEIGHT_M.value;
  let aUpCmd: number;
  if (heightAboveTarget > hFlare + 0.25) {
    const vDownExcessSq = Math.max(0, vDown * vDown - vTd * vTd);
    aUpCmd = G0 + vDownExcessSq / (2 * Math.max(heightAboveTarget - hFlare, 0.35));
  } else {
    aUpCmd = G0 + 2.4 * (vDown - vTd);
  }
  // Prevent T/W > 1 hover-bounce on light boosters: if vertical speed
  // reverses upward near the deck, command engine cutoff so it settles cleanly.
  if (heightAboveTarget < 2.5 && vUp >= 0.0) {
    return {
      phase: 'LANDING_BURN',
      targetAttitudeEci: basis.up,
      activeEngineIndices: [],
      throttle: 0,
      aeroSteerDirEci: zeroVec,
      gridFinDeflectionDeg: 0,
      landingLegsDeployed: mem.landingLegsDeployed,
    };
  }

  // Exact constant-deceleration time-to-go: t_go = 2*h / (vDown + vTd)
  // Exact constant-deceleration time-to-go: t_go = 2*h / (vDown + vTd)
  // Target horizontal convergence (r_h -> 0, v_h -> 0) by a terminal vertical
  // alignment gate ~1.8 s before touchdown (~8-12 m AGL) so the booster arrives
  // upright with near-zero lateral speed before the final flare.
  const tGoTotal = (2 * Math.max(heightAboveTarget, 0.5)) / Math.max(vDown + vTd, 1.5);
  const tGoGate = Math.max(0.8, tGoTotal - 1.8);

  let aLatCmd: Vec3;
  if (heightAboveTarget > 12.0 && tGoTotal > 2.4) {
    // Textbook ZEM/ZEV targeting (r=0, v=0) at the terminal alignment gate
    const posTerm = scale(toTargetHoriz, 6.0 / (tGoGate * tGoGate));
    const velTerm = scale(vHorizVec, 4.0 / tGoGate);
    aLatCmd = sub(posTerm, velTerm);
  } else {
    // Terminal vertical descent (< 12 m): null residual horizontal velocity cleanly
    const posWeight = clamp((heightAboveTarget - 3.0) / 9.0, 0, 1);
    const posTerm = scale(toTargetHoriz, 0.8 * posWeight);
    const velTerm = scale(vHorizVec, 3.2);
    aLatCmd = sub(posTerm, velTerm);
  }

  const uprightFlare = clamp((heightAboveTarget - 0.5) / 2.1, 0, 1);
  const maxTiltRad =
    heightAboveTarget < 2.6
      ? 0.12 * uprightFlare // smoothly flares to 0 deg by 0.5 m AGL -> touchdown tilt < 1 deg
      : heightAboveTarget < 30.0
        ? 0.35
        : 0.65;
  const maxLatAccel = Math.max(1.0, aUpCmd) * Math.tan(maxTiltRad);
  const aLatMag = norm(aLatCmd);
  if (aLatMag > maxLatAccel) {
    aLatCmd = scale(aLatCmd, maxLatAccel / aLatMag);
  }

  const aCmdEci = add(scale(basis.up, Math.max(0.5, aUpCmd)), aLatCmd);
  const aCmdMag = norm(aCmdEci);
  const targetAttitudeEci = scale(aCmdEci, 1 / aCmdMag);

  // Unified physics-based 3-to-1 engine handoff across all landing modes (no mode branch):
  // Engage 3 engines whenever required braking thrust exceeds 90% of a single Merlin
  // while above 30 m AGL and descending faster than 15 m/s; transition smoothly to
  // the single center engine once 1 engine has ample thrust margin for terminal hoverslam.
  const reqThrustN = aCmdMag * totalMassKg;
  const useThreeEngines =
    vDown > 15 && heightAboveTarget > 30 && reqThrustN > 0.9 * maxThrust1;
  const activeEngines = useThreeEngines ? [0, 1, 5] : [0];
  const nEng = activeEngines.length;

  const rawThrottle =
    (reqThrustN / nEng + ambientPressurePa * merlin.exitAreaM2) /
    merlin.thrustVacuumN;
  const throttle = clamp(rawThrottle, merlin.minThrottle, merlin.maxThrottle);

  return {
    phase: 'LANDING_BURN',
    targetAttitudeEci,
    activeEngineIndices: activeEngines,
    throttle,
    aeroSteerDirEci: zeroVec,
    gridFinDeflectionDeg: 0,
    landingLegsDeployed: mem.landingLegsDeployed,
  };
}
