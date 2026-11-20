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
  targetCoord: GeodeticCoord,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  mem: BoosterGuidanceMemory
): BoosterGuidanceCommand {
  const basis = localEnuBasisEci(geodetic.latRad, geodetic.lonRad, timeS);
  const vRot = earthRotationVelocityEci(dynamic.positionEci);
  const vRel = sub(dynamic.velocityEci, vRot);
  const speedRel = norm(vRel);
  const vUp = dot(vRel, basis.up);
  const vHorizVec = sub(vRel, scale(basis.up, vUp));
  const vHoriz = norm(vHorizVec);

  // Target position in ECI at current time
  const targetEci = ecefToEci(geodeticToEcef(targetCoord), timeS);
  const toTargetEci = sub(targetEci, dynamic.positionEci);
  const toTargetUp = dot(toTargetEci, basis.up);
  const toTargetHoriz = sub(toTargetEci, scale(basis.up, toTargetUp));
  const distHoriz = norm(toTargetHoriz);

  const heightAboveTarget = geodetic.altitudeM - targetCoord.altitudeM;
  const tiltDeg = angleBetweenRad(dynamic.attitudeEci, basis.up) * RAD_TO_DEG;
  const zeroVec: Vec3 = { x: 0, y: 0, z: 0 };

  // Strict realistic touchdown check
  if (heightAboveTarget <= 0 && timeS > stageSepTimeS + 10) {
    const maxMissM = mission.landingMode === 'RTLS' ? 15.0 : 10.0;
    const softLanding =
      Math.abs(vUp) < 2.0 &&
      vHoriz < 1.0 &&
      tiltDeg < 5.0 &&
      distHoriz < maxMissM &&
      dynamic.propellantKg > 0;
    mem.phase = softLanding ? 'LANDED' : 'CRASHED';
    return {
      phase: mem.phase,
      targetAttitudeEci: basis.up,
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
    const reserveAfterBoostback = s1PropTotal * 0.055;
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
    const landingReserve = s1PropTotal * 0.025;
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
  // Use 65% nominal throttle so 1 engine retains vertical headroom while tilted
  // for ZEM/ZEV lateral guidance (even on heavier high-margin RTLS boosters).
  const merlin = vehicle.stage1.engine;
  const nomThrottle = 0.65;
  const nomThrust1 = Math.max(
    1,
    nomThrottle * merlin.thrustVacuumN - ambientPressurePa * merlin.exitAreaM2
  );
  const aNetNom1 = Math.max(2.0, nomThrust1 / totalMassKg - G0);
  const vDown = Math.max(0, -vUp);
  const hIgnition = (vDown * vDown) / (2 * aNetNom1) + 25.0;

  // 6. Aerodynamic descent with titanium grid fins
  if (mem.phase === 'AERO_DESCENT') {
    if (
      heightAboveTarget <= 4_000 &&
      vUp < -5 &&
      heightAboveTarget <= hIgnition &&
      dynamic.propellantKg > 0
    ) {
      mem.phase = 'LANDING_BURN';
    } else {
      // Predict ground impact point (accounting for hoverslam horizontal travel ~0.75 * tFall)
      const tFall = (0.75 * heightAboveTarget) / Math.max(40, vDown);
      const predMiss = sub(scale(vHorizVec, tFall), toTargetHoriz);
      const missDist = norm(predMiss);
      const steerDir =
        missDist > 1 ? scale(predMiss, -1 / missDist) : zeroVec;
      const deflDeg = clamp((missDist / 250) * 20, 0, 20);

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

  // Target gentle touchdown speed v_td = 0.25 m/s so |v_z| < 2 m/s without hover bounce
  const vTd = 0.25;
  const vDownExcessSq = Math.max(0, vDown * vDown - vTd * vTd);
  const aUpCmd = G0 + vDownExcessSq / (2 * Math.max(heightAboveTarget, 0.25));

  // Exact constant-deceleration time-to-go: t_go = 2*h / (vDown + vTd)
  const tGoRaw = (2 * Math.max(heightAboveTarget, 0.5)) / Math.max(vDown + vTd, 1.5);
  const tGoPos = Math.max(2.0, tGoRaw);
  const tGoVel = Math.max(0.9, tGoRaw);

  // Exact textbook ZEM/ZEV optimal horizontal acceleration:
  //   a_horiz = posWeight * 6 * (r_target - r) / t_go^2 - 4 * v_horiz / t_go
  // Smoothly fade the position term from 1 -> 0 between 28 m and 10 m altitude,
  // then smoothly flare tilt toward vertical (0 deg) between 6 m and 1.5 m so
  // the booster touches down upright (< 1 deg) rather than riding a tilt cap.
  const posWeight = clamp((heightAboveTarget - 10.0) / 18.0, 0, 1);
  const posTerm = scale(toTargetHoriz, (6.0 * posWeight) / (tGoPos * tGoPos));
  const velTerm = scale(vHorizVec, 4.0 / tGoVel);
  let aLatCmd = sub(posTerm, velTerm);

  const uprightFlare = clamp((heightAboveTarget - 0.5) / 3.0, 0, 1);
  const maxTiltRad =
    heightAboveTarget < 3.5
      ? 0.10 * uprightFlare // smoothly flares to 0 deg by 0.5 m AGL -> touchdown tilt < 1 deg
      : heightAboveTarget < 45.0
        ? 0.26
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
    vDown > 60 && heightAboveTarget > 200 && reqThrustN > 0.92 * maxThrust1;
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
