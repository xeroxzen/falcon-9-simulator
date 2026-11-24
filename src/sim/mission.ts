import type {
  BodyDynamicState,
  BoosterState,
  EngineState,
  FullMissionResult,
  GeodeticCoord,
  MissionConfig,
  MissionEvent,
  Stage2State,
  Vec3,
  VehicleConfig,
} from './types.js';
import {
  DEG_TO_RAD,
  EARTH_RADIUS_MEAN_M,
  G0,
  RAD_TO_DEG,
} from './config/constants.js';
import { LANDING_SITES } from './config/falcon9.js';
import { rk4Step, type Rk4Space } from './integrator.js';
import {
  add,
  addScaled,
  angleBetweenRad,
  computeOrbitalElements,
  dot,
  earthRotationVelocityEci,
  ecefToGeodetic,
  eciToEcef,
  enuToEci,
  greatCircleDistanceM,
  horizontalDistanceToTargetM,
  localEnuBasisEci,
  norm,
  normalize,
  scale,
  slewUnitVector,
  sub,
} from './math.js';
import {
  evaluateAscentAerodynamics,
  evaluateBoosterAerodynamics,
} from './models/aerodynamics.js';
import { sampleAtmosphere } from './models/atmosphere.js';
import { gravitationalAccelerationEci } from './models/gravity.js';
import { evaluateEngine } from './models/propulsion.js';
import {
  computeStage2Guidance,
  createStage2GuidanceMemory,
  isTwoBurnMission,
} from './guidance/stage2.js';
import {
  computeBoosterGuidance,
  ENTRY_BURN_AERO_LEAD_S,
  ENTRY_BURN_HEATING_LIMIT_MW_M2,
  ENTRY_BURN_MAX_DURATION_S,
  ENTRY_BURN_TARGET_ACCEL_G,
  predictBallisticEntryPeak,
  type BoosterGuidanceMemory,
} from './guidance/booster.js';
import { runAscentToMeco } from './simulation.js';

interface BodyDerivative {
  readonly dPos: Vec3;
  readonly dVel: Vec3;
  readonly dProp: number;
}

function windEci(
  latRad: number,
  lonRad: number,
  altitudeM: number,
  timeS: number,
  mission: MissionConfig
): Vec3 {
  const disp = mission.dispersions;
  let eastMs = mission.wind.eastMs;
  let northMs = mission.wind.northMs;
  const upMs = mission.wind.upMs;
  if (disp && (disp.windGustEastMs !== 0 || disp.windGustNorthMs !== 0)) {
    const hFade = Math.min(1, Math.max(0, altitudeM / 500));
    eastMs += disp.windGustEastMs * Math.sin(altitudeM / 3_500 + disp.windGustPhaseRad) * hFade;
    northMs += disp.windGustNorthMs * Math.cos(altitudeM / 4_200 + disp.windGustPhaseRad) * hFade;
  }
  if (eastMs === 0 && northMs === 0 && upMs === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return enuToEci(eastMs, northMs, upMs, localEnuBasisEci(latRad, lonRad, timeS));
}

function detUniform01(seed: number, step: number, channel: number): number {
  let x = (seed ^ (step * 374761393) ^ (channel * 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return ((x >>> 0) + 0.5) / 4294967296;
}

/** Deterministic standard normal N(0, 1) via Box-Muller transform. */
function detGaussian(seed: number, step: number, channel: number): number {
  const u1 = Math.max(1e-9, detUniform01(seed, step, channel * 2));
  const u2 = detUniform01(seed, step, channel * 2 + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function buildStage2State(
  timeS: number,
  phase: Stage2State['phase'],
  dynamic: BodyDynamicState,
  fairingAttached: boolean,
  throttle: number,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  padLatRad: number,
  padLonRad: number
): Stage2State {
  const posEcef = eciToEcef(dynamic.positionEci, timeS);
  const geodetic = ecefToGeodetic(posEcef);
  const basis = localEnuBasisEci(geodetic.latRad, geodetic.lonRad, timeS);
  const atmo = sampleAtmosphere(geodetic.altitudeM);

  const mvac = evaluateEngine(
    0,
    vehicle.stage2.engine,
    throttle,
    atmo.pressurePa,
    false,
    dynamic.propellantKg > 0
  );

  const disp = mission.dispersions;
  const fixedMass =
    vehicle.stage2.dryMassKg * (disp?.dryMassScale ?? 1) +
    (fairingAttached ? vehicle.fairingMassKg : 0) +
    mission.payloadMassKg;
  const totalMassKg = fixedMass + Math.max(0, dynamic.propellantKg);

  const vRot = earthRotationVelocityEci(dynamic.positionEci);
  const vGroundRel = sub(dynamic.velocityEci, vRot);
  const verticalSpeedMs = dot(vGroundRel, basis.up);
  const vGroundSq = dot(vGroundRel, vGroundRel);
  const horizontalSpeedMs = Math.sqrt(
    Math.max(0, vGroundSq - verticalSpeedMs * verticalSpeedMs)
  );
  const downrangeM = greatCircleDistanceM(
    padLatRad,
    padLonRad,
    geodetic.latRad,
    geodetic.lonRad
  );
  const pitchFromVert = angleBetweenRad(dynamic.attitudeEci, basis.up);
  const pitchAboveHorizonDeg = 90 - pitchFromVert * RAD_TO_DEG;

  return {
    timeS,
    phase,
    dynamic,
    fairingAttached,
    totalMassKg,
    geodetic,
    downrangeM,
    speedInertialMs: norm(dynamic.velocityEci),
    speedEarthRelMs: norm(vGroundRel),
    verticalSpeedMs,
    horizontalSpeedMs,
    thrustN: mvac.thrustN,
    throttle: mvac.throttle,
    axialAccelG: mvac.thrustN / (totalMassKg * G0),
    pitchAboveHorizonDeg,
    engines: [mvac],
  };
}

function evaluateBoosterEngines(
  vehicle: VehicleConfig,
  activeIndices: readonly number[],
  throttle: number,
  ambientPressurePa: number,
  propellantKg: number,
  timeS: number,
  mission: MissionConfig
): { engines: EngineState[]; totalThrustN: number; totalMassFlowKgS: number } {
  const engines: EngineState[] = [];
  let totalThrustN = 0;
  let totalMassFlowKgS = 0;

  const disp = mission.dispersions;
  for (let i = 0; i < vehicle.stage1.engineCount; i++) {
    const failed = mission.engineOuts.some(
      (eo) => eo.engineIndex === i && timeS >= eo.timeS
    );
    const commanded = activeIndices.includes(i) ? throttle : 0;
    const st = evaluateEngine(
      i,
      vehicle.stage1.engine,
      commanded,
      ambientPressurePa,
      failed,
      propellantKg > 0,
      disp?.thrustScale ?? 1,
      disp?.ispScale ?? 1
    );
    engines.push(st);
    totalThrustN += st.thrustN;
    totalMassFlowKgS += st.massFlowKgS;
  }

  return { engines, totalThrustN, totalMassFlowKgS };
}

function buildBoosterState(
  timeS: number,
  phase: BoosterState['phase'],
  dynamic: BodyDynamicState,
  activeIndices: readonly number[],
  throttle: number,
  aeroSteerDirEci: Vec3,
  gridFinDeflectionDeg: number,
  landingLegsDeployed: boolean,
  targetCoord: GeodeticCoord,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  padLatRad: number,
  padLonRad: number
): BoosterState {
  const posEcef = eciToEcef(dynamic.positionEci, timeS);
  const geodetic = ecefToGeodetic(posEcef);
  const basis = localEnuBasisEci(geodetic.latRad, geodetic.lonRad, timeS);
  const atmo = sampleAtmosphere(geodetic.altitudeM);

  const vRot = earthRotationVelocityEci(dynamic.positionEci);
  const vWind = windEci(geodetic.latRad, geodetic.lonRad, geodetic.altitudeM, timeS, mission);
  const vAirRel = sub(sub(dynamic.velocityEci, vRot), vWind);
  const vGroundRel = sub(dynamic.velocityEci, vRot);

  const aero = evaluateBoosterAerodynamics(
    vAirRel,
    atmo,
    vehicle.referenceAreaM2,
    aeroSteerDirEci,
    gridFinDeflectionDeg,
    mission.dispersions?.cdScale ?? 1
  );
  const prop = evaluateBoosterEngines(
    vehicle,
    activeIndices,
    throttle,
    atmo.pressurePa,
    dynamic.propellantKg,
    timeS,
    mission
  );

  const totalMassKg =
    vehicle.stage1.dryMassKg * (mission.dispersions?.dryMassScale ?? 1) +
    Math.max(0, dynamic.propellantKg);
  const verticalSpeedMs = dot(vGroundRel, basis.up);
  const vGroundSq = dot(vGroundRel, vGroundRel);
  const horizontalSpeedMs = Math.sqrt(
    Math.max(0, vGroundSq - verticalSpeedMs * verticalSpeedMs)
  );
  const downrangeM = greatCircleDistanceM(
    padLatRad,
    padLonRad,
    geodetic.latRad,
    geodetic.lonRad
  );
  const distanceToTargetM = horizontalDistanceToTargetM(
    dynamic.positionEci,
    timeS,
    targetCoord
  );

  const tiltFromVerticalDeg =
    angleBetweenRad(dynamic.attitudeEci, basis.up) * RAD_TO_DEG;

  return {
    timeS,
    phase,
    dynamic,
    totalMassKg,
    geodetic,
    downrangeM,
    distanceToTargetM,
    speedInertialMs: norm(dynamic.velocityEci),
    speedAirRelMs: norm(vAirRel),
    verticalSpeedMs,
    horizontalSpeedMs,
    mach: aero.mach,
    dynamicPressurePa: aero.dynamicPressurePa,
    dragN: aero.dragMagnitudeN,
    thrustN: prop.totalThrustN,
    throttle: activeIndices.length > 0 ? throttle : 0,
    axialAccelG: (prop.totalThrustN + aero.dragMagnitudeN) / (totalMassKg * G0),
    tiltFromVerticalDeg,
    gridFinDeflectionDeg,
    landingLegsDeployed,
    engines: prop.engines,
  };
}

/**
 * Fast pre-flight prediction of natural ASDS droneship location for an ASDS mission.
 * Propagates a coarse (dt = 0.25 s) ballistic + entry-burn + drag descent from
 * stage separation to sea level so the ASDS is stationed where the booster naturally arrives.
 */
function predictAsdsTargetCoord(
  startTimeS: number,
  initialDynamic: BodyDynamicState,
  vehicle: VehicleConfig,
  mission: MissionConfig
): GeodeticCoord {
  const dt = 0.25;
  let t = startTimeS;
  let dyn = initialDynamic;
  let entryBurnStart: number | null = null;
  let entryBurnDone = false;
  const s1PropTotal = vehicle.stage1.propellantMassKg;

  for (let i = 0; i < 2400; i++) {
    const posEcef = eciToEcef(dyn.positionEci, t);
    const geo = ecefToGeodetic(posEcef);
    if (geo.altitudeM <= 2_500 && i > 200) {
      // Account for horizontal travel during hoverslam deceleration (~6.5 s equivalent)
      const vRotEnd = earthRotationVelocityEci(dyn.positionEci);
      const vRelEnd = sub(dyn.velocityEci, vRotEnd);
      const posProjected = addScaled(dyn.positionEci, vRelEnd, 6.5);
      const geoProj = ecefToGeodetic(eciToEcef(posProjected, t + 6.5));
      return { latRad: geoProj.latRad, lonRad: geoProj.lonRad, altitudeM: 0 };
    }
    if (geo.altitudeM <= 0) {
      return { latRad: geo.latRad, lonRad: geo.lonRad, altitudeM: 0 };
    }

    const atmo = sampleAtmosphere(geo.altitudeM);
    const vRot = earthRotationVelocityEci(dyn.positionEci);
    const vRel = sub(dyn.velocityEci, vRot);
    const speedRel = norm(vRel);
    const basis = localEnuBasisEci(geo.latRad, geo.lonRad, t);
    const vUp = dot(vRel, basis.up);

    let activeEngines: number[] = [];
    let throttle = 0;
    const totalMassKg = vehicle.stage1.dryMassKg + dyn.propellantKg;
    if (!entryBurnDone && vUp < -50 && geo.altitudeM <= 95_000 && dyn.propellantKg > s1PropTotal * 0.026) {
      const vHoriz = norm(sub(vRel, scale(basis.up, vUp)));
      if (entryBurnStart === null) {
        if (i % 2 === 0) {
          const pred = predictBallisticEntryPeak(
            geo.altitudeM,
            vHoriz,
            vUp,
            totalMassKg,
            vehicle.referenceAreaM2
          );
          if (pred.peakQDotMWm2 > ENTRY_BURN_HEATING_LIMIT_MW_M2) {
            const vRatio = Math.cbrt(ENTRY_BURN_HEATING_LIMIT_MW_M2 / pred.peakQDotMWm2);
            const dvReq = Math.max(0, speedRel * (1 - vRatio));
            const a3 = Math.min(
              (3 * vehicle.stage1.engine.thrustVacuumN) / Math.max(1, totalMassKg),
              ENTRY_BURN_TARGET_ACCEL_G * G0
            );
            const tBurnEst = Math.min(ENTRY_BURN_MAX_DURATION_S, dvReq / Math.max(1, a3));
            if (pred.timeToPeakS <= tBurnEst + ENTRY_BURN_AERO_LEAD_S) {
              entryBurnStart = t;
            }
          }
        }
      }
      if (entryBurnStart !== null) {
        const burnDur = t - entryBurnStart;
        const pred = predictBallisticEntryPeak(
          geo.altitudeM,
          vHoriz,
          vUp,
          totalMassKg,
          vehicle.referenceAreaM2
        );
        if (
          pred.peakQDotMWm2 <= ENTRY_BURN_HEATING_LIMIT_MW_M2 ||
          burnDur >= ENTRY_BURN_MAX_DURATION_S ||
          geo.altitudeM <= 28_000 ||
          dyn.propellantKg <= s1PropTotal * 0.020
        ) {
          entryBurnDone = true;
        } else {
          activeEngines = [0, 1, 5];
          throttle = Math.max(
            0.4,
            Math.min(
              1.0,
              (ENTRY_BURN_TARGET_ACCEL_G * G0 * totalMassKg) /
                Math.max(1, 3 * vehicle.stage1.engine.thrustVacuumN)
            )
          );
        }
      }
    }

    const retro = speedRel > 1 ? scale(vRel, -1 / speedRel) : basis.up;
    const aero = evaluateBoosterAerodynamics(
      vRel,
      atmo,
      vehicle.referenceAreaM2,
      { x: 0, y: 0, z: 0 },
      0
    );
    const prop = evaluateBoosterEngines(
      vehicle,
      activeEngines,
      throttle,
      atmo.pressurePa,
      dyn.propellantKg,
      t,
      { ...mission, dispersions: undefined }
    );
    const mass = vehicle.stage1.dryMassKg + Math.max(0, dyn.propellantKg);
    const gAcc = gravitationalAccelerationEci(dyn.positionEci, mission.enableJ2);
    const fTotal = add(scale(retro, prop.totalThrustN), aero.totalAeroForceEci);
    const acc = add(gAcc, scale(fTotal, 1 / mass));

    dyn = {
      positionEci: addScaled(dyn.positionEci, dyn.velocityEci, dt),
      velocityEci: addScaled(dyn.velocityEci, acc, dt),
      propellantKg: Math.max(0, dyn.propellantKg - prop.totalMassFlowKgS * dt),
      attitudeEci: retro,
    };
    t += dt;
  }

  const finalGeo = ecefToGeodetic(eciToEcef(dyn.positionEci, t));
  return { latRad: finalGeo.latRad, lonRad: finalGeo.lonRad, altitudeM: 0 };
}

/**
 * Run a complete Falcon 9 Block 5 mission:
 *   1. Stage 1 ascent through MECO
 *   2. Coast -> Stage Separation
 *   3. Parallel Stage 2 closed-loop ascent to orbit (SECO-1)
 *      AND Stage 1 booster recovery (flip, boostback, entry burn, grid-fin aero,
 *      analytic hoverslam landing burn, touchdown on ASDS or LZ-1).
 */
export function runFullMission(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  sampleIntervalS = 1.0
): FullMissionResult {
  const ascent = runAscentToMeco(vehicle, mission, sampleIntervalS);
  const events: MissionEvent[] = [...ascent.events];

  const padLatRad = mission.launchSite.latDeg * DEG_TO_RAD;
  const padLonRad = mission.launchSite.lonDeg * DEG_TO_RAD;
  const dt = mission.dtS;
  const sampleEverySteps = Math.max(1, Math.round(sampleIntervalS / dt));

  const mecoState = ascent.finalState;
  const mecoTimeS = mecoState.timeS;
  const stageSepTimeS = mecoTimeS + mission.guidance.stageSepDelayS;

  // Initial Stage 2 & Booster states at MECO
  const initPropScale = mission.dispersions?.propellantLoadScale ?? 1;
  let s2Dyn: BodyDynamicState = {
    positionEci: mecoState.dynamic.positionEci,
    velocityEci: mecoState.dynamic.velocityEci,
    propellantKg: vehicle.stage2.propellantMassKg * initPropScale,
    attitudeEci: mecoState.dynamic.attitudeEci,
  };
  let fairingAttached = mission.hasFairing;

  let bDyn: BodyDynamicState = {
    positionEci: mecoState.dynamic.positionEci,
    velocityEci: mecoState.dynamic.velocityEci,
    propellantKg: mecoState.dynamic.stage1PropellantKg,
    attitudeEci: mecoState.dynamic.attitudeEci,
  };

  // Determine landing target (LZ-1/LZ-4/LZ-40 for RTLS, ballistic or close-in
  // partial-boostback downrange deck for ASDS).
  const rtlsSite = LANDING_SITES[mission.landingSiteId ?? 'LZ-40'];
  let needsBoostback = mission.landingMode === 'RTLS';
  let nominalLandingTarget: GeodeticCoord;
  if (mission.landingMode === 'RTLS') {
    nominalLandingTarget = {
      latRad: rtlsSite.latDeg * DEG_TO_RAD,
      lonRad: rtlsSite.lonDeg * DEG_TO_RAD,
      altitudeM: rtlsSite.elevationM,
    };
  } else {
    const ballisticTarget = predictAsdsTargetCoord(mecoTimeS, bDyn, vehicle, mission);
    const ballisticRangeM = greatCircleDistanceM(
      padLatRad,
      padLonRad,
      ballisticTarget.latRad,
      ballisticTarget.lonRad
    );
    if (
      mission.landingMode === 'ASDS' &&
      mission.droneshipDownrangeKm !== undefined &&
      mission.droneshipDownrangeKm * 1000 < ballisticRangeM - 15_000
    ) {
      // Place droneship at droneshipDownrangeKm along the great-circle bearing
      // from the launch site to the ballistic impact point, triggering partial boostback.
      const dLon = ballisticTarget.lonRad - padLonRad;
      const bearing = Math.atan2(
        Math.sin(dLon) * Math.cos(ballisticTarget.latRad),
        Math.cos(padLatRad) * Math.sin(ballisticTarget.latRad) -
          Math.sin(padLatRad) * Math.cos(ballisticTarget.latRad) * Math.cos(dLon)
      );
      const ang = (mission.droneshipDownrangeKm * 1000) / EARTH_RADIUS_MEAN_M;
      const lat2 = Math.asin(
        Math.sin(padLatRad) * Math.cos(ang) +
          Math.cos(padLatRad) * Math.sin(ang) * Math.cos(bearing)
      );
      const lon2 =
        padLonRad +
        Math.atan2(
          Math.sin(bearing) * Math.sin(ang) * Math.cos(padLatRad),
          Math.cos(ang) - Math.sin(padLatRad) * Math.sin(lat2)
        );
      nominalLandingTarget = { latRad: lat2, lonRad: lon2, altitudeM: 0 };
      needsBoostback = true;
    } else {
      nominalLandingTarget = ballisticTarget;
    }
  }

  let landingTarget: GeodeticCoord = nominalLandingTarget;
  if (
    mission.landingMode === 'ASDS' &&
    mission.dispersions &&
    ((mission.dispersions.droneshipOffsetEastM ?? 0) !== 0 ||
      (mission.dispersions.droneshipOffsetNorthM ?? 0) !== 0)
  ) {
    const dE = mission.dispersions.droneshipOffsetEastM ?? 0;
    const dN = mission.dispersions.droneshipOffsetNorthM ?? 0;
    const dLat = dN / 6_371_000;
    const dLon = dE / (6_371_000 * Math.max(0.1, Math.cos(nominalLandingTarget.latRad)));
    landingTarget = {
      latRad: nominalLandingTarget.latRad + dLat,
      lonRad: nominalLandingTarget.lonRad + dLon,
      altitudeM: nominalLandingTarget.altitudeM,
    };
  }

  const bMem: BoosterGuidanceMemory = {
    phase: 'MECO_COAST',
    entryBurnStartTimeS: null,
    landingLegsDeployed: false,
    needsBoostback,
  };

  let s2State = buildStage2State(
    mecoTimeS,
    'COAST_TO_SES1',
    s2Dyn,
    fairingAttached,
    0,
    vehicle,
    mission,
    padLatRad,
    padLonRad
  );
  let bState = buildBoosterState(
    mecoTimeS,
    'MECO_COAST',
    bDyn,
    [],
    0,
    { x: 0, y: 0, z: 0 },
    0,
    false,
    landingTarget,
    vehicle,
    mission,
    padLatRad,
    padLonRad
  );

  const stage2Samples: Stage2State[] = [s2State];
  const boosterSamples: BoosterState[] = [bState];

  const s2Mem = createStage2GuidanceMemory();
  const twoBurn = isTwoBurnMission(mission);

  let stageSepDone = false;
  let ses1Recorded = false;
  let seco1Recorded = false;
  let ses2Recorded = false;
  let stage2Done = false;
  let fairingSepRecorded = false;
  let flipRecorded = false;
  let boostbackStartRecorded = false;
  let boostbackEndRecorded = false;
  let apogeeRecorded = false;
  let entryStartRecorded = false;
  let entryEndRecorded = false;
  let landingStartRecorded = false;
  let legsRecorded = false;
  let boosterDone = false;
  let actualBoosterThrottle = 0;
  let actualGridFinDeflDeg = 0;

  // First-order Gauss-Markov navigation bias state (ASSUMED correlation time tau = 45 s).
  // Initialized from stationary distribution N(0, sigma^2) so bias is realistic at touchdown.
  // Horizontal navNoiseM is 1-sigma (0.5-2.0 m); altitude (±5 m) and velocity (±0.3 m/s)
  // bounds are treated as 3-sigma envelopes (sigma = bound / 3).
  // Below NAV_ALT_AID_ACQ_M (3,000 m AGL, ASSUMED), a downward-looking radar altimeter
  // fuses with INS/GPS via inverse-variance weighting:
  //   sigma_rad(h) = sqrt(sigma_floor^2 + (eps_scale * h)^2)
  //   sigma_eff(h) = 1 / sqrt(sigma_ins^-2 + sigma_rad(h)^-2)
  // with closed-loop filter time constant tau_eff = max(2.0 s, tau_ins * (sigma_eff/sigma_ins)^2).
  const NAV_CORR_TIME_S = 45.0;
  const NAV_ALT_AID_ACQ_M = 3_000.0;
  const NAV_ALT_RADAR_FLOOR_M = 0.15;
  const NAV_ALT_RADAR_SCALE = 0.002;
  const NAV_ALT_AID_MIN_TAU_S = 2.0;
  const initDisp = mission.dispersions;
  const altSigmaM = (initDisp?.navAltNoiseM ?? 0) / 3.0;
  const velSigmaMs = (initDisp?.navVelNoiseMs ?? 0) / 3.0;
  let navBiasEastM =
    initDisp && initDisp.navNoiseM > 0
      ? detGaussian(initDisp.seed, 0, 1) * initDisp.navNoiseM
      : 0;
  let navBiasNorthM =
    initDisp && initDisp.navNoiseM > 0
      ? detGaussian(initDisp.seed, 0, 2) * initDisp.navNoiseM
      : 0;
  let navBiasAltM =
    altSigmaM > 0 ? detGaussian(initDisp!.seed, 0, 3) * altSigmaM : 0;
  let navBiasVelEMs =
    velSigmaMs > 0 ? detGaussian(initDisp!.seed, 0, 4) * velSigmaMs : 0;
  let navBiasVelNMs =
    velSigmaMs > 0 ? detGaussian(initDisp!.seed, 0, 5) * velSigmaMs : 0;
  let navBiasVelUMs =
    velSigmaMs > 0 ? detGaussian(initDisp!.seed, 0, 6) * velSigmaMs : 0;

  const effectiveMaxTimeS = twoBurn
    ? Math.max(mission.maxSimTimeS, 4_200)
    : mission.maxSimTimeS;
  let curT = mecoTimeS;
  let step = 0;
  let nextSampleT = mecoTimeS + sampleIntervalS;

  while (curT < effectiveMaxTimeS - 1e-6) {
    step++;
    // Use 1.0 s RK4 steps during pure ballistic vacuum transfer coast after booster
    // has finished (truncation error < 1e-10/orbit, 100x faster); revert to fine dt
    // within 30 s of apoapsis SES-2 ignition or during any burn/booster phase.
    const inVacuumTransferCoast =
      twoBurn &&
      boosterDone &&
      s2Mem.seco1Done &&
      !s2Mem.ses2Started &&
      s2Mem.timeToApoapsisS !== null &&
      s2Mem.timeToApoapsisS > 30;
    const stepDt = inVacuumTransferCoast ? Math.min(1.0, sampleIntervalS >= 1.0 ? 1.0 : 0.5) : dt;
    const prevT = curT;
    const t = Number((curT + stepDt).toFixed(6));
    curT = t;

    // Stage separation impulse (~1.5 m/s pneumatic pusher separation along attitude)
    if (!stageSepDone && t >= stageSepTimeS) {
      stageSepDone = true;
      const sepDir = normalize(s2Dyn.attitudeEci);
      s2Dyn = {
        ...s2Dyn,
        velocityEci: addScaled(s2Dyn.velocityEci, sepDir, 0.8),
      };
      bDyn = {
        ...bDyn,
        velocityEci: addScaled(bDyn.velocityEci, sepDir, -0.7),
      };
      events.push({
        type: 'STAGE_SEP',
        timeS: t,
        altitudeM: s2State.geodetic.altitudeM,
        speedMs: s2State.speedEarthRelMs,
        downrangeM: s2State.downrangeM,
        detail: 'Pneumatic stage separation (S1 booster & S2 independent)',
      });
    }

    // --- Step Stage 2 ---
    if (!stage2Done) {
      if (
        fairingAttached &&
        s2State.geodetic.altitudeM >= mission.guidance.fairingSepAltitudeM
      ) {
        fairingAttached = false;
        if (!fairingSepRecorded) {
          fairingSepRecorded = true;
          events.push({
            type: 'FAIRING_SEP',
            timeS: t,
            altitudeM: s2State.geodetic.altitudeM,
            speedMs: s2State.speedEarthRelMs,
            downrangeM: s2State.downrangeM,
            detail: `Fairing jettison (-${vehicle.fairingMassKg} kg)`,
          });
        }
      }

      const s2Cmd = computeStage2Guidance(
        prevT,
        mecoTimeS,
        s2Dyn,
        s2State.totalMassKg,
        s2State.geodetic.altitudeM,
        vehicle,
        mission,
        s2Mem
      );

      const nextS2Att = slewUnitVector(
        s2Dyn.attitudeEci,
        s2Cmd.targetAttitudeEci,
        vehicle.maxAttitudeSlewRateRadS * stepDt
      );
      const stepS2Att = normalize(add(s2Dyn.attitudeEci, nextS2Att));
      const s2FixedMass =
        vehicle.stage2.dryMassKg +
        (fairingAttached ? vehicle.fairingMassKg : 0) +
        mission.payloadMassKg;

      const s2Space: Rk4Space<BodyDynamicState, BodyDerivative> = {
        derivative(tt, s) {
          const geo = ecefToGeodetic(eciToEcef(s.positionEci, tt));
          const atmo = sampleAtmosphere(geo.altitudeM);
          const vRot = earthRotationVelocityEci(s.positionEci);
          const vAir = sub(s.velocityEci, vRot);
          const aero = evaluateAscentAerodynamics(
            vAir,
            atmo,
            vehicle.referenceAreaM2
          );
          const mvac = evaluateEngine(
            0,
            vehicle.stage2.engine,
            s2Cmd.throttle,
            atmo.pressurePa,
            false,
            s.propellantKg > 0
          );
          const mass = s2FixedMass + Math.max(0, s.propellantKg);
          const gAcc = gravitationalAccelerationEci(
            s.positionEci,
            mission.enableJ2
          );
          const fVec = add(scale(stepS2Att, mvac.thrustN), aero.dragForceEci);
          return {
            dPos: s.velocityEci,
            dVel: add(gAcc, scale(fVec, 1 / mass)),
            dProp: -mvac.massFlowKgS,
          };
        },
        addScaled(s, d, sc) {
          return {
            positionEci: addScaled(s.positionEci, d.dPos, sc),
            velocityEci: addScaled(s.velocityEci, d.dVel, sc),
            propellantKg: Math.max(0, s.propellantKg + d.dProp * sc),
            attitudeEci: nextS2Att,
          };
        },
        combine(s, k1, k2, k3, k4, h) {
          const c = h / 6;
          return {
            positionEci: {
              x: s.positionEci.x + c * (k1.dPos.x + 2 * k2.dPos.x + 2 * k3.dPos.x + k4.dPos.x),
              y: s.positionEci.y + c * (k1.dPos.y + 2 * k2.dPos.y + 2 * k3.dPos.y + k4.dPos.y),
              z: s.positionEci.z + c * (k1.dPos.z + 2 * k2.dPos.z + 2 * k3.dPos.z + k4.dPos.z),
            },
            velocityEci: {
              x: s.velocityEci.x + c * (k1.dVel.x + 2 * k2.dVel.x + 2 * k3.dVel.x + k4.dVel.x),
              y: s.velocityEci.y + c * (k1.dVel.y + 2 * k2.dVel.y + 2 * k3.dVel.y + k4.dVel.y),
              z: s.velocityEci.z + c * (k1.dVel.z + 2 * k2.dVel.z + 2 * k3.dVel.z + k4.dVel.z),
            },
            propellantKg: Math.max(
              0,
              s.propellantKg + c * (k1.dProp + 2 * k2.dProp + 2 * k3.dProp + k4.dProp)
            ),
            attitudeEci: nextS2Att,
          };
        },
      };

      s2Dyn = rk4Step(prevT, s2Dyn, stepDt, s2Space);
      s2State = buildStage2State(
        t,
        s2Cmd.phase,
        s2Dyn,
        fairingAttached,
        s2Cmd.throttle,
        vehicle,
        mission,
        padLatRad,
        padLonRad
      );

      if (!ses1Recorded && s2Cmd.phase === 'STAGE2_BURN') {
        ses1Recorded = true;
        events.push({
          type: 'SES_1',
          timeS: t,
          altitudeM: s2State.geodetic.altitudeM,
          speedMs: s2State.speedEarthRelMs,
          downrangeM: s2State.downrangeM,
          detail: 'MVac ignition (SES-1)',
        });
      }

      if (!seco1Recorded && s2Cmd.secoTriggered) {
        seco1Recorded = true;
        const orb = computeOrbitalElements(s2Dyn.positionEci, s2Dyn.velocityEci);
        events.push({
          type: 'SECO_1',
          timeS: t,
          altitudeM: s2State.geodetic.altitudeM,
          speedMs: s2State.speedEarthRelMs,
          downrangeM: s2State.downrangeM,
          detail: `SECO-1: ${(orb.perigeeAltitudeM / 1000).toFixed(1)} x ${(orb.apogeeAltitudeM / 1000).toFixed(1)} km, incl ${orb.inclinationDeg.toFixed(2)}°`,
        });
        stage2Samples.push(s2State);
      }

      if (!ses2Recorded && s2Cmd.ses2Triggered) {
        ses2Recorded = true;
        events.push({
          type: 'SES_2',
          timeS: t,
          altitudeM: s2State.geodetic.altitudeM,
          speedMs: s2State.speedEarthRelMs,
          downrangeM: s2State.downrangeM,
          detail: 'MVac apoapsis circularization ignition (SES-2)',
        });
        stage2Samples.push(s2State);
      }

      if (s2Cmd.seco2Triggered) {
        const orb = computeOrbitalElements(s2Dyn.positionEci, s2Dyn.velocityEci);
        events.push({
          type: 'SECO_2',
          timeS: t,
          altitudeM: s2State.geodetic.altitudeM,
          speedMs: s2State.speedEarthRelMs,
          downrangeM: s2State.downrangeM,
          detail: `SECO-2: ${(orb.perigeeAltitudeM / 1000).toFixed(1)} x ${(orb.apogeeAltitudeM / 1000).toFixed(1)} km, incl ${orb.inclinationDeg.toFixed(2)}°`,
        });
        stage2Samples.push(s2State);
      }

      if (s2Cmd.missionComplete) {
        stage2Done = true;
      } else if (
        inVacuumTransferCoast
          ? t >= nextSampleT - 1e-6
          : step % sampleEverySteps === 0
      ) {
        stage2Samples.push(s2State);
      }
    }

    // --- Step Stage 1 Booster ---
    if (!boosterDone) {
      const prevBPhase = bMem.phase;
      const prevVUp = bState.verticalSpeedMs;
      const bGeo = bState.geodetic;
      const bAtmo = sampleAtmosphere(bGeo.altitudeM);

      const disp = mission.dispersions;
      // Time-correlated Gauss-Markov navigation bias (tau = 45 s, ASSUMED) fed into
      // guidance; touchdown criteria and reported miss distance ALWAYS use TRUE state bDyn.
      let sensedDyn = bDyn;
      let sensedGeo = bGeo;
      if (disp) {
        const phi = Math.exp(-dt / NAV_CORR_TIME_S);
        const sigmaW = Math.sqrt(Math.max(0, 1 - phi * phi));
        if (disp.navNoiseM > 0) {
          navBiasEastM = phi * navBiasEastM + sigmaW * disp.navNoiseM * detGaussian(disp.seed, step, 1);
          navBiasNorthM = phi * navBiasNorthM + sigmaW * disp.navNoiseM * detGaussian(disp.seed, step, 2);
        }
        if (altSigmaM > 0) {
          // Terminal-phase radar altimeter aiding (ASSUMED sensor-fusion model):
          // Below 3,000 m AGL, inverse-variance fusion of INS/GPS (altSigmaM) with a
          // downward radar altimeter (0.2% AGL scale error + 0.15 m residual floor)
          // smoothly reduces effective altitude bias sigma and filter time constant.
          const aglM = Math.max(0, bGeo.altitudeM - landingTarget.altitudeM);
          let effAltSigmaM = altSigmaM;
          let effAltTauS = NAV_CORR_TIME_S;
          if (aglM <= NAV_ALT_AID_ACQ_M) {
            const radSigmaM = Math.hypot(
              NAV_ALT_RADAR_FLOOR_M,
              NAV_ALT_RADAR_SCALE * aglM
            );
            effAltSigmaM =
              1 / Math.sqrt(1 / (altSigmaM * altSigmaM) + 1 / (radSigmaM * radSigmaM));
            const varRatio = (effAltSigmaM * effAltSigmaM) / (altSigmaM * altSigmaM);
            effAltTauS = Math.max(NAV_ALT_AID_MIN_TAU_S, NAV_CORR_TIME_S * varRatio);
          }
          const phiAlt = Math.exp(-dt / effAltTauS);
          const sigmaWAlt = Math.sqrt(Math.max(0, 1 - phiAlt * phiAlt));
          navBiasAltM =
            phiAlt * navBiasAltM +
            sigmaWAlt * effAltSigmaM * detGaussian(disp.seed, step, 3);
        }
        if (velSigmaMs > 0) {
          navBiasVelEMs = phi * navBiasVelEMs + sigmaW * velSigmaMs * detGaussian(disp.seed, step, 4);
          navBiasVelNMs = phi * navBiasVelNMs + sigmaW * velSigmaMs * detGaussian(disp.seed, step, 5);
          navBiasVelUMs = phi * navBiasVelUMs + sigmaW * velSigmaMs * detGaussian(disp.seed, step, 6);
        }
        const basisNav = localEnuBasisEci(bGeo.latRad, bGeo.lonRad, prevT);
        sensedDyn = {
          ...bDyn,
          positionEci: add(
            bDyn.positionEci,
            enuToEci(navBiasEastM, navBiasNorthM, navBiasAltM, basisNav)
          ),
          velocityEci:
            velSigmaMs > 0
              ? add(
                  bDyn.velocityEci,
                  enuToEci(navBiasVelEMs, navBiasVelNMs, navBiasVelUMs, basisNav)
                )
              : bDyn.velocityEci,
        };
        if (altSigmaM > 0) {
          sensedGeo = {
            ...bGeo,
            altitudeM: bGeo.altitudeM + navBiasAltM,
          };
        }
      }

      // Touchdown detection & impact criteria ALWAYS evaluate TRUE state (bDyn, bGeo);
      // guidance commands use the corrupted navigation estimate (sensedDyn, sensedGeo).
      const bCmd = computeBoosterGuidance(
        prevT,
        stageSepTimeS,
        sensedDyn,
        sensedGeo,
        bState.totalMassKg,
        bAtmo.pressurePa,
        bAtmo.densityKgM3,
        landingTarget,
        vehicle,
        mission,
        bMem,
        bDyn,
        bGeo
      );

      if (bCmd.phase === 'LANDED' || bCmd.phase === 'CRASHED') {
        boosterDone = true;
        // Use prevT (exact timestamp of bDyn) so ECI->ECEF matches the touchdown state
        bState = buildBoosterState(
          prevT,
          bCmd.phase,
          bDyn,
          [],
          0,
          { x: 0, y: 0, z: 0 },
          0,
          bCmd.landingLegsDeployed,
          landingTarget,
          vehicle,
          mission,
          padLatRad,
          padLonRad
        );
        boosterSamples.push(bState);
        events.push({
          type: bCmd.phase === 'LANDED' ? 'TOUCHDOWN' : 'CRASH',
          timeS: prevT,
          altitudeM: bState.geodetic.altitudeM,
          speedMs: bState.speedAirRelMs,
          downrangeM: bState.downrangeM,
          detail:
            bCmd.phase === 'LANDED'
              ? `Booster landed (${mission.landingMode}) | v_z=${bState.verticalSpeedMs.toFixed(2)} m/s, v_h=${bState.horizontalSpeedMs.toFixed(2)} m/s, tilt=${bState.tiltFromVerticalDeg.toFixed(2)}°, miss=${bState.distanceToTargetM.toFixed(2)} m, prop=${bDyn.propellantKg.toFixed(0)} kg`
              : `Booster impact (${mission.landingMode}): ${bMem.failureReason ?? 'Hard landing'} | v_z=${bState.verticalSpeedMs.toFixed(2)} m/s, v_h=${bState.horizontalSpeedMs.toFixed(2)} m/s, tilt=${bState.tiltFromVerticalDeg.toFixed(2)}°, miss=${bState.distanceToTargetM.toFixed(1)} m, prop=${bDyn.propellantKg.toFixed(0)} kg`,
        });
      } else {
    const slewRate =
      bCmd.phase === 'LANDING_BURN'
        ? (35.0 * Math.PI) / 180.0 // TVC gimbal authority during powered descent
        : bCmd.phase === 'FLIP'
          ? vehicle.boosterFlipSlewRateRadS
          : vehicle.maxAttitudeSlewRateRadS;
        const nextBAtt = slewUnitVector(
          bDyn.attitudeEci,
          bCmd.targetAttitudeEci,
          slewRate * dt
        );
        const stepBAtt = normalize(add(bDyn.attitudeEci, nextBAtt));

        // Optional first-order actuator lag on booster throttle & grid-fin deflection
        const lagS = disp?.actuatorLagS ?? 0;
        if (lagS > 0) {
          const alpha = dt / (lagS + dt);
          actualBoosterThrottle =
            bCmd.activeEngineIndices.length > 0
              ? actualBoosterThrottle + (bCmd.throttle - actualBoosterThrottle) * alpha
              : 0;
          actualGridFinDeflDeg =
            actualGridFinDeflDeg + (bCmd.gridFinDeflectionDeg - actualGridFinDeflDeg) * alpha;
        } else {
          actualBoosterThrottle = bCmd.throttle;
          actualGridFinDeflDeg = bCmd.gridFinDeflectionDeg;
        }

        const bSpace: Rk4Space<BodyDynamicState, BodyDerivative> = {
          derivative(tt, s) {
            const geo = ecefToGeodetic(eciToEcef(s.positionEci, tt));
            const atmo = sampleAtmosphere(geo.altitudeM);
            const vRot = earthRotationVelocityEci(s.positionEci);
            const vW = windEci(geo.latRad, geo.lonRad, geo.altitudeM, tt, mission);
            const vAir = sub(sub(s.velocityEci, vRot), vW);
            const aero = evaluateBoosterAerodynamics(
              vAir,
              atmo,
              vehicle.referenceAreaM2,
              bCmd.aeroSteerDirEci,
              actualGridFinDeflDeg,
              disp?.cdScale ?? 1
            );
            const prop = evaluateBoosterEngines(
              vehicle,
              bCmd.activeEngineIndices,
              actualBoosterThrottle,
              atmo.pressurePa,
              s.propellantKg,
              tt,
              mission
            );
            const mass = vehicle.stage1.dryMassKg + Math.max(0, s.propellantKg);
            const gAcc = gravitationalAccelerationEci(
              s.positionEci,
              mission.enableJ2
            );
            const fVec = add(
              scale(stepBAtt, prop.totalThrustN),
              aero.totalAeroForceEci
            );
            return {
              dPos: s.velocityEci,
              dVel: add(gAcc, scale(fVec, 1 / mass)),
              dProp: -prop.totalMassFlowKgS,
            };
          },
          addScaled(s, d, sc) {
            return {
              positionEci: addScaled(s.positionEci, d.dPos, sc),
              velocityEci: addScaled(s.velocityEci, d.dVel, sc),
              propellantKg: Math.max(0, s.propellantKg + d.dProp * sc),
              attitudeEci: nextBAtt,
            };
          },
          combine(s, k1, k2, k3, k4, h) {
            const c = h / 6;
            return {
              positionEci: {
                x: s.positionEci.x + c * (k1.dPos.x + 2 * k2.dPos.x + 2 * k3.dPos.x + k4.dPos.x),
                y: s.positionEci.y + c * (k1.dPos.y + 2 * k2.dPos.y + 2 * k3.dPos.y + k4.dPos.y),
                z: s.positionEci.z + c * (k1.dPos.z + 2 * k2.dPos.z + 2 * k3.dPos.z + k4.dPos.z),
              },
              velocityEci: {
                x: s.velocityEci.x + c * (k1.dVel.x + 2 * k2.dVel.x + 2 * k3.dVel.x + k4.dVel.x),
                y: s.velocityEci.y + c * (k1.dVel.y + 2 * k2.dVel.y + 2 * k3.dVel.y + k4.dVel.y),
                z: s.velocityEci.z + c * (k1.dVel.z + 2 * k2.dVel.z + 2 * k3.dVel.z + k4.dVel.z),
              },
              propellantKg: Math.max(
                0,
                s.propellantKg + c * (k1.dProp + 2 * k2.dProp + 2 * k3.dProp + k4.dProp)
              ),
              attitudeEci: nextBAtt,
            };
          },
        };

        bDyn = rk4Step(prevT, bDyn, dt, bSpace);
        bState = buildBoosterState(
          t,
          bCmd.phase,
          bDyn,
          bCmd.activeEngineIndices,
          bCmd.throttle,
          bCmd.aeroSteerDirEci,
          bCmd.gridFinDeflectionDeg,
          bCmd.landingLegsDeployed,
          landingTarget,
          vehicle,
          mission,
          padLatRad,
          padLonRad
        );

        // Record booster phase transition events
        if (!flipRecorded && bCmd.phase === 'FLIP') {
          flipRecorded = true;
          events.push({
            type: 'FLIP_START',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: 'Cold-gas RCS flip maneuver started',
          });
        }
        if (!boostbackStartRecorded && bCmd.phase === 'BOOSTBACK_BURN') {
          boostbackStartRecorded = true;
          events.push({
            type: 'BOOSTBACK_START',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: '3-engine RTLS boostback burn ignition',
          });
        }
        if (
          boostbackStartRecorded &&
          !boostbackEndRecorded &&
          prevBPhase === 'BOOSTBACK_BURN' &&
          bCmd.phase !== 'BOOSTBACK_BURN'
        ) {
          boostbackEndRecorded = true;
          events.push({
            type: 'BOOSTBACK_END',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: 'Boostback burn cutoff',
          });
        }
        if (!apogeeRecorded && prevVUp >= 0 && bState.verticalSpeedMs < 0) {
          apogeeRecorded = true;
          events.push({
            type: 'APOGEE',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: `Booster apogee at ${(bState.geodetic.altitudeM / 1000).toFixed(1)} km`,
          });
        }
        if (!entryStartRecorded && bCmd.phase === 'ENTRY_BURN') {
          entryStartRecorded = true;
          events.push({
            type: 'ENTRY_BURN_START',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: '3-engine reentry burn ignition',
          });
        }
        if (
          entryStartRecorded &&
          !entryEndRecorded &&
          prevBPhase === 'ENTRY_BURN' &&
          bCmd.phase !== 'ENTRY_BURN'
        ) {
          entryEndRecorded = true;
          events.push({
            type: 'ENTRY_BURN_END',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: 'Reentry burn cutoff',
          });
        }
        if (!landingStartRecorded && bCmd.phase === 'LANDING_BURN') {
          landingStartRecorded = true;
          events.push({
            type: 'LANDING_BURN_START',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: '1-engine hoverslam landing burn ignition',
          });
        }
        if (!legsRecorded && bCmd.landingLegsDeployed) {
          legsRecorded = true;
          events.push({
            type: 'LANDING_LEGS_DEPLOY',
            timeS: t,
            altitudeM: bState.geodetic.altitudeM,
            speedMs: bState.speedAirRelMs,
            downrangeM: bState.downrangeM,
            detail: 'Carbon-fiber landing legs deployed',
          });
        }

        if (step % sampleEverySteps === 0) {
          boosterSamples.push(bState);
        }
      }
    }

    if (t >= nextSampleT - 1e-6) {
      nextSampleT += sampleIntervalS;
    }

    if (stage2Done && boosterDone) {
      break;
    }
  }

  events.sort((a, b) => a.timeS - b.timeS);
  const orbit = computeOrbitalElements(
    s2State.dynamic.positionEci,
    s2State.dynamic.velocityEci
  );
  const orbitAchieved =
    orbit.perigeeAltitudeM >= 140_000 && orbit.eccentricity < 0.05;
  const boosterOutcome: FullMissionResult['boosterOutcome'] =
    mission.landingMode === 'EXPENDABLE'
      ? 'EXPENDED'
      : bState.phase === 'LANDED'
        ? 'LANDED'
        : 'CRASHED';

  const boosterFailureReason =
    boosterOutcome === 'CRASHED'
      ? (bMem.failureReason ?? 'Did not reach touchdown within simulation window')
      : undefined;

  return {
    ascent,
    stage2Samples,
    stage2Final: s2State,
    boosterSamples,
    boosterFinal: bState,
    orbit,
    landingTarget,
    boosterOutcome,
    boosterFailureReason,
    orbitAchieved,
    events,
  };
}
