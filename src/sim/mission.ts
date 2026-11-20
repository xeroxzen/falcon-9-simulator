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
import { DEG_TO_RAD, G0, RAD_TO_DEG } from './config/constants.js';
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
import { computeStage2Guidance } from './guidance/stage2.js';
import {
  computeBoosterGuidance,
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
  timeS: number,
  mission: MissionConfig
): Vec3 {
  const { eastMs, northMs, upMs } = mission.wind;
  if (eastMs === 0 && northMs === 0 && upMs === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return enuToEci(eastMs, northMs, upMs, localEnuBasisEci(latRad, lonRad, timeS));
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

  const fixedMass =
    vehicle.stage2.dryMassKg +
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
      propellantKg > 0
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
  const vWind = windEci(geodetic.latRad, geodetic.lonRad, timeS, mission);
  const vAirRel = sub(sub(dynamic.velocityEci, vRot), vWind);
  const vGroundRel = sub(dynamic.velocityEci, vRot);

  const aero = evaluateBoosterAerodynamics(
    vAirRel,
    atmo,
    vehicle.referenceAreaM2,
    aeroSteerDirEci,
    gridFinDeflectionDeg
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
    vehicle.stage1.dryMassKg + Math.max(0, dynamic.propellantKg);
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
  const distanceToTargetM = greatCircleDistanceM(
    targetCoord.latRad,
    targetCoord.lonRad,
    geodetic.latRad,
    geodetic.lonRad
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
      // Account for ~1.1 km horizontal travel during hoverslam deceleration
      const vRotEnd = earthRotationVelocityEci(dyn.positionEci);
      const vRelEnd = sub(dyn.velocityEci, vRotEnd);
      const posProjected = addScaled(dyn.positionEci, vRelEnd, 8.0);
      const geoProj = ecefToGeodetic(eciToEcef(posProjected, t + 8.0));
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
    if (
      !entryBurnDone &&
      vUp < 0 &&
      geo.altitudeM <= 70_000 &&
      speedRel >= 1_300 &&
      dyn.propellantKg > s1PropTotal * 0.025
    ) {
      if (entryBurnStart === null) entryBurnStart = t;
      if (speedRel > 850 && t - entryBurnStart < 22.0) {
        activeEngines = [0, 1, 5];
      } else {
        entryBurnDone = true;
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
      1.0,
      atmo.pressurePa,
      dyn.propellantKg,
      t,
      mission
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
  let s2Dyn: BodyDynamicState = {
    positionEci: mecoState.dynamic.positionEci,
    velocityEci: mecoState.dynamic.velocityEci,
    propellantKg: vehicle.stage2.propellantMassKg,
    attitudeEci: mecoState.dynamic.attitudeEci,
  };
  let fairingAttached = mission.hasFairing;

  let bDyn: BodyDynamicState = {
    positionEci: mecoState.dynamic.positionEci,
    velocityEci: mecoState.dynamic.velocityEci,
    propellantKg: mecoState.dynamic.stage1PropellantKg,
    attitudeEci: mecoState.dynamic.attitudeEci,
  };

  // Determine landing target (LZ-1/LZ-4 for RTLS, predicted downrange deck for ASDS)
  const rtlsSite = LANDING_SITES[mission.landingSiteId ?? 'LZ-1'];
  const landingTarget: GeodeticCoord =
    mission.landingMode === 'RTLS'
      ? {
          latRad: rtlsSite.latDeg * DEG_TO_RAD,
          lonRad: rtlsSite.lonDeg * DEG_TO_RAD,
          altitudeM: rtlsSite.elevationM,
        }
      : predictAsdsTargetCoord(mecoTimeS, bDyn, vehicle, mission);

  const bMem: BoosterGuidanceMemory = {
    phase: 'MECO_COAST',
    entryBurnStartTimeS: null,
    landingLegsDeployed: false,
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

  let stageSepDone = false;
  let ses1Recorded = false;
  let secoRecorded = false;
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

  const maxPostMecoSteps = Math.round(
    Math.max(60, mission.maxSimTimeS - mecoTimeS) / dt
  );

  for (let step = 1; step <= maxPostMecoSteps; step++) {
    const t = Number((mecoTimeS + step * dt).toFixed(6));
    const prevT = Number((mecoTimeS + (step - 1) * dt).toFixed(6));

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
    if (!secoRecorded) {
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
        mission
      );

      const nextS2Att = slewUnitVector(
        s2Dyn.attitudeEci,
        s2Cmd.targetAttitudeEci,
        vehicle.maxAttitudeSlewRateRadS * dt
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

      s2Dyn = rk4Step(prevT, s2Dyn, dt, s2Space);
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

      if (s2Cmd.secoTriggered) {
        secoRecorded = true;
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
      } else if (step % sampleEverySteps === 0) {
        stage2Samples.push(s2State);
      }
    }

    // --- Step Stage 1 Booster ---
    if (!boosterDone) {
      const prevBPhase = bMem.phase;
      const prevVUp = bState.verticalSpeedMs;
      const bGeo = bState.geodetic;
      const bAtmo = sampleAtmosphere(bGeo.altitudeM);

      const bCmd = computeBoosterGuidance(
        prevT,
        stageSepTimeS,
        bDyn,
        bGeo,
        bState.totalMassKg,
        bAtmo.pressurePa,
        landingTarget,
        vehicle,
        mission,
        bMem
      );

      if (bCmd.phase === 'LANDED' || bCmd.phase === 'CRASHED') {
        boosterDone = true;
        bState = buildBoosterState(
          t,
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
          timeS: t,
          altitudeM: bState.geodetic.altitudeM,
          speedMs: bState.speedAirRelMs,
          downrangeM: bState.downrangeM,
          detail:
            bCmd.phase === 'LANDED'
              ? `Booster landed (${mission.landingMode}) | v_z=${bState.verticalSpeedMs.toFixed(2)} m/s, v_h=${bState.horizontalSpeedMs.toFixed(2)} m/s, tilt=${bState.tiltFromVerticalDeg.toFixed(2)}°, miss=${bState.distanceToTargetM.toFixed(2)} m, prop=${bDyn.propellantKg.toFixed(0)} kg`
              : `Booster impact (${mission.landingMode}) | v_z=${bState.verticalSpeedMs.toFixed(2)} m/s, v_h=${bState.horizontalSpeedMs.toFixed(2)} m/s, tilt=${bState.tiltFromVerticalDeg.toFixed(2)}°, miss=${bState.distanceToTargetM.toFixed(1)} m, prop=${bDyn.propellantKg.toFixed(0)} kg`,
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

        const bSpace: Rk4Space<BodyDynamicState, BodyDerivative> = {
          derivative(tt, s) {
            const geo = ecefToGeodetic(eciToEcef(s.positionEci, tt));
            const atmo = sampleAtmosphere(geo.altitudeM);
            const vRot = earthRotationVelocityEci(s.positionEci);
            const vW = windEci(geo.latRad, geo.lonRad, tt, mission);
            const vAir = sub(sub(s.velocityEci, vRot), vW);
            const aero = evaluateBoosterAerodynamics(
              vAir,
              atmo,
              vehicle.referenceAreaM2,
              bCmd.aeroSteerDirEci,
              bCmd.gridFinDeflectionDeg
            );
            const prop = evaluateBoosterEngines(
              vehicle,
              bCmd.activeEngineIndices,
              bCmd.throttle,
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

    if (secoRecorded && boosterDone) {
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

  return {
    ascent,
    stage2Samples,
    stage2Final: s2State,
    boosterSamples,
    boosterFinal: bState,
    orbit,
    landingTarget,
    boosterOutcome,
    orbitAchieved,
    events,
  };
}
