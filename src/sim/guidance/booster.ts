import type {
  BodyDynamicState,
  BoosterPhase,
  GeodeticCoord,
  MissionConfig,
  Vec3,
  VehicleConfig,
} from '../types.js';
import { G0, RAD_TO_DEG } from '../config/constants.js';
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

export interface BoosterGuidanceMemory {
  phase: BoosterPhase;
  entryBurnStartTimeS: number | null;
  landingLegsDeployed: boolean;
  failureReason?: string;
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

  const s1PropTotal = vehicle.stage1.propellantMassKg;
  const retroDir = speedRel > 1 ? scale(vRel, -1 / speedRel) : basis.up;

  // 2. Flip maneuver (cold-gas RCS rotation toward boostback or retrograde)
  if (mem.phase === 'MECO_COAST' || mem.phase === 'FLIP') {
    mem.phase = 'FLIP';
    let flipTarget = retroDir;
    if (mission.landingMode === 'RTLS' && distHoriz > 100) {
      // Point nearly horizontal (slightly depressed -4 deg) back toward LZ
      // so RTLS apogee stays realistic (~125-140 km, not >200 km).
      const dirToLz = normalize(toTargetHoriz);
      flipTarget = normalize(add(scale(dirToLz, 0.997), scale(basis.up, -0.07)));
    }
    const angErr = angleBetweenRad(dynamic.attitudeEci, flipTarget);
    if (angErr < 0.14) {
      mem.phase =
        mission.landingMode === 'RTLS' ? 'BOOSTBACK_BURN' : 'BALLISTIC_COAST';
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

  // 3. Boostback burn (RTLS only, 3 engines: center + 2 outer)
  if (mem.phase === 'BOOSTBACK_BURN') {
    const reserveAfterBoostback = s1PropTotal * 0.042;
    // Predict ballistic time of flight to target altitude (scaled by 0.92 for
    // atmospheric drag shortening during descent)
    const gLocal = 9.55;
    const disc = Math.max(
      0,
      vUp * vUp + 2 * gLocal * Math.max(0, heightAboveTarget)
    );
    const tFlight = ((vUp + Math.sqrt(disc)) / gLocal) * 0.92;
    const predMiss = sub(scale(vHorizVec, tFlight), toTargetHoriz);
    const missDist = norm(predMiss);

    if (missDist < 1_500 || dynamic.propellantKg <= reserveAfterBoostback) {
      mem.phase = 'BALLISTIC_COAST';
    } else {
      // Fire nearly horizontal (slightly depressed -4 deg) opposite predicted miss
      // to reverse horizontal velocity cleanly without excessive apogee loft.
      const burnHorizDir = scale(predMiss, -1 / missDist);
      const burnDir = normalize(
        add(scale(burnHorizDir, 0.997), scale(basis.up, -0.07))
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

  // 4. Ballistic coast to atmospheric entry interface
  if (mem.phase === 'BALLISTIC_COAST') {
    const entryAltTrigger = mission.landingMode === 'RTLS' ? 60_000 : 70_000;
    const entrySpeedTrigger = mission.landingMode === 'RTLS' ? 1_050 : 1_300;
    if (
      vUp < 0 &&
      geodetic.altitudeM <= entryAltTrigger &&
      speedRel >= entrySpeedTrigger &&
      dynamic.propellantKg > s1PropTotal * 0.026
    ) {
      mem.phase = 'ENTRY_BURN';
      mem.entryBurnStartTimeS = timeS;
    } else if (vUp < 0 && geodetic.altitudeM <= 52_000) {
      mem.phase = 'AERO_DESCENT';
    } else {
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

  // 5. Entry burn (3 engines retrograde to shed supersonic speed before peak q)
  if (mem.phase === 'ENTRY_BURN') {
    const burnDur =
      mem.entryBurnStartTimeS !== null ? timeS - mem.entryBurnStartTimeS : 0;
    const landingReserve = s1PropTotal * (mission.landingMode === 'RTLS' ? 0.028 : 0.032);
    if (
      speedRel <= 850 ||
      burnDur >= 21.0 ||
      geodetic.altitudeM <= 30_000 ||
      dynamic.propellantKg <= landingReserve
    ) {
      mem.phase = 'AERO_DESCENT';
    } else {
      return {
        phase: 'ENTRY_BURN',
        targetAttitudeEci: retroDir,
        activeEngineIndices: [0, 1, 5],
        throttle: 1.0,
        aeroSteerDirEci: zeroVec,
        gridFinDeflectionDeg: 0,
        landingLegsDeployed: false,
      };
    }
  }

  // Compute analytic suicide-burn (hoverslam) ignition altitude.
  // Account for 1-3-1 multi-engine braking on heavier RTLS boosters (effective
  // 1.55-engine nominal deceleration) vs 1-engine ASDS hoverslam (85% throttle),
  // so atmospheric drag sheds energy down to ~2.2-3.5 km before ignition.
  const merlin = vehicle.stage1.engine;
  const nomThrottle = mission.landingMode === 'RTLS' ? 0.85 : 0.88;
  const nomEngEquiv = mission.landingMode === 'RTLS' ? 1.15 : 1.0;
  const nomThrust = Math.max(
    1,
    nomEngEquiv *
      (nomThrottle * merlin.thrustVacuumN - ambientPressurePa * merlin.exitAreaM2)
  );
  const aNetNom = Math.max(2.0, nomThrust / totalMassKg - G0);
  const vDown = Math.max(0, -vUp);
  const hIgnition = (vDown * vDown) / (2 * aNetNom) + 35.0;

  // 6. Aerodynamic descent with titanium grid fins
  const maxIgnitionAltM = mission.landingMode === 'RTLS' ? 6_000 : 4_500;
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

  // Terminal vertical profile with heave & altimeter-noise margin:
  // Brake toward a gentle v_td = 0.65 m/s at h_flare (1.4 m above nominal deck),
  // then hold a regulated ~0.65 m/s descent through the final 1.4 m window so
  // ±1.5 m ASDS deck heave and ±5 m altimeter noise do not cause > 2 m/s impacts
  // without inducing hover bounce on light T/W > 1 ASDS boosters.
  const vTd = mission.landingMode === 'RTLS' ? 0.65 : 0.45;
  const hFlare = mission.landingMode === 'RTLS' ? 2.6 : 1.05;
  let aUpCmd: number;
  if (heightAboveTarget > hFlare + 0.25) {
    const vDownExcessSq = Math.max(0, vDown * vDown - vTd * vTd);
    aUpCmd = G0 + vDownExcessSq / (2 * Math.max(heightAboveTarget - hFlare, 0.35));
  } else {
    aUpCmd = G0 + 2.4 * (vDown - vTd);
  }
  // Prevent T/W > 1 hover-bounce on light ASDS boosters: if vertical speed
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

  // Use 3 engines whenever 1 engine at 92% cannot meet required braking deceleration
  // while above 200 m and faster than 60 m/s; transition cleanly to 1 center engine once
  // 1 engine has ample margin to complete the hoverslam.
  const reqThrustN = aCmdMag * totalMassKg;
  const maxThrust1 =
    merlin.thrustVacuumN - ambientPressurePa * merlin.exitAreaM2;
  const useThreeEngines =
    mission.landingMode === 'RTLS'
      ? vDown > 15 && heightAboveTarget > 30 && reqThrustN > 0.78 * maxThrust1
      : vDown > 45 && heightAboveTarget > 150 && reqThrustN > 0.92 * maxThrust1;
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
