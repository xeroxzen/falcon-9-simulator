import type {
  AscentPhase,
  AscentRunResult,
  DynamicState,
  MissionConfig,
  MissionEvent,
  SimState,
  Vec3,
  VehicleConfig,
} from './types.js';
import { DEG_TO_RAD, G0, RAD_TO_DEG } from './config/constants.js';
import { rk4Step, type Rk4Space } from './integrator.js';
import {
  add,
  addScaled,
  angleBetweenRad,
  computeLaunchAzimuthDeg,
  dot,
  earthRotationVelocityEci,
  ecefToGeodetic,
  eciToEcef,
  enuToEci,
  geodeticToEcef,
  greatCircleDistanceM,
  localEnuBasisEci,
  norm,
  normalize,
  scale,
  slewUnitVector,
  sub,
} from './math.js';
import { evaluateAscentAerodynamics } from './models/aerodynamics.js';
import { sampleAtmosphere } from './models/atmosphere.js';
import { gravitationalAccelerationEci } from './models/gravity.js';
import { evaluateStagePropulsion } from './models/propulsion.js';
import { computeAscentGuidance } from './guidance/ascent.js';

interface DynamicDerivative {
  readonly dPos: Vec3;
  readonly dVel: Vec3;
  readonly dProp1: number;
}

/**
 * Total inert + upper-stage mass carried during Stage 1 ascent (excluding S1 propellant).
 */
export function computeAscentFixedMassKg(
  vehicle: VehicleConfig,
  payloadMassKg: number,
  hasFairing = true
): number {
  return (
    vehicle.stage1.dryMassKg +
    vehicle.stage2.dryMassKg +
    vehicle.stage2.propellantMassKg +
    (hasFairing ? vehicle.fairingMassKg : 0) +
    payloadMassKg
  );
}

/**
 * Create the initial on-pad SimState at T-0.
 */
export function createInitialAscentState(
  vehicle: VehicleConfig,
  mission: MissionConfig
): SimState {
  const latRad = mission.launchSite.latDeg * DEG_TO_RAD;
  const lonRad = mission.launchSite.lonDeg * DEG_TO_RAD;
  const altM = mission.launchSite.elevationM;

  // At t = 0, ECI == ECEF
  const posEci = geodeticToEcef({ latRad, lonRad, altitudeM: altM });
  const velEci = earthRotationVelocityEci(posEci);
  const basis = localEnuBasisEci(latRad, lonRad, 0);

  const dynamic: DynamicState = {
    positionEci: posEci,
    velocityEci: velEci,
    stage1PropellantKg: vehicle.stage1.propellantMassKg,
    attitudeEci: basis.up,
  };

  return buildSimState(
    0,
    'PAD',
    dynamic,
    1.0,
    vehicle,
    mission,
    latRad,
    lonRad
  );
}

function windVelocityEci(
  latRad: number,
  lonRad: number,
  timeS: number,
  mission: MissionConfig
): Vec3 {
  const { eastMs, northMs, upMs } = mission.wind;
  if (eastMs === 0 && northMs === 0 && upMs === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const basis = localEnuBasisEci(latRad, lonRad, timeS);
  return enuToEci(eastMs, northMs, upMs, basis);
}

function buildSimState(
  timeS: number,
  phase: AscentPhase,
  dynamic: DynamicState,
  throttle: number,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  padLatRad: number,
  padLonRad: number
): SimState {
  const posEcef = eciToEcef(dynamic.positionEci, timeS);
  const geodetic = ecefToGeodetic(posEcef);
  const basis = localEnuBasisEci(geodetic.latRad, geodetic.lonRad, timeS);
  const atmosphere = sampleAtmosphere(geodetic.altitudeM);

  const vRot = earthRotationVelocityEci(dynamic.positionEci);
  const vWind = windVelocityEci(
    geodetic.latRad,
    geodetic.lonRad,
    timeS,
    mission
  );
  const vAirRel = sub(sub(dynamic.velocityEci, vRot), vWind);
  const vGroundRel = sub(dynamic.velocityEci, vRot);

  const aero = evaluateAscentAerodynamics(
    vAirRel,
    atmosphere,
    vehicle.referenceAreaM2
  );
  const prop = evaluateStagePropulsion(
    vehicle.stage1,
    throttle,
    atmosphere.pressurePa,
    timeS,
    dynamic.stage1PropellantKg,
    mission.engineOuts
  );

  const fixedMass = computeAscentFixedMassKg(
    vehicle,
    mission.payloadMassKg,
    mission.hasFairing
  );
  const totalMassKg = fixedMass + Math.max(0, dynamic.stage1PropellantKg);

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

  // Felt axial acceleration (non-gravitational acceleration along vehicle axis) in g's
  const netAxialForceN = prop.totalThrustN - aero.dragMagnitudeN;
  const axialAccelG = netAxialForceN / (totalMassKg * G0);

  const pitchFromVerticalDeg =
    angleBetweenRad(dynamic.attitudeEci, basis.up) * RAD_TO_DEG;
  const speedAirRelMs = norm(vAirRel);
  const angleOfAttackDeg =
    speedAirRelMs > 1.0
      ? angleBetweenRad(dynamic.attitudeEci, vAirRel) * RAD_TO_DEG
      : 0;

  return {
    timeS,
    phase,
    dynamic,
    totalMassKg,
    geodetic,
    downrangeM,
    speedInertialMs: norm(dynamic.velocityEci),
    speedAirRelMs,
    verticalSpeedMs,
    horizontalSpeedMs,
    mach: aero.mach,
    dynamicPressurePa: aero.dynamicPressurePa,
    dragN: aero.dragMagnitudeN,
    thrustN: prop.totalThrustN,
    throttle,
    axialAccelG,
    pitchFromVerticalDeg,
    angleOfAttackDeg,
    engines: prop.engines,
    atmosphere,
  };
}

export interface AscentStepContext {
  readonly launchAzimuthDeg: number;
  readonly padLatRad: number;
  readonly padLonRad: number;
  pitchKickStartTimeS: number | null;
}

/**
 * Advance the ascent simulation by one deterministic RK4 step of `dt`.
 */
export function stepAscent(
  state: SimState,
  dt: number,
  vehicle: VehicleConfig,
  mission: MissionConfig,
  ctx: AscentStepContext
): SimState {
  const fixedMass = computeAscentFixedMassKg(
    vehicle,
    mission.payloadMassKg,
    mission.hasFairing
  );
  const activeCount = state.engines.filter((e) => e.active).length;

  const cmd = computeAscentGuidance(
    {
      timeS: state.timeS,
      altitudeM: state.geodetic.altitudeM,
      latRad: state.geodetic.latRad,
      lonRad: state.geodetic.lonRad,
      // Fly ground-relative gravity turn (like real DOLILU guidance) so surface
      // winds apply physical aero loads without weathercocking the pitchover kick.
      vAirRelEci: sub(
        state.dynamic.velocityEci,
        earthRotationVelocityEci(state.dynamic.positionEci)
      ),
      mach: state.mach,
      dynamicPressurePa: state.dynamicPressurePa,
      dragN: state.dragN,
      totalMassKg: state.totalMassKg,
      stage1PropellantKg: state.dynamic.stage1PropellantKg,
      activeEngineCount: activeCount,
      ambientPressurePa: state.atmosphere.pressurePa,
      launchAzimuthDeg: ctx.launchAzimuthDeg,
      pitchKickStartTimeS: ctx.pitchKickStartTimeS,
    },
    vehicle,
    mission
  );

  ctx.pitchKickStartTimeS = cmd.pitchKickStartTimeS;

  // Rate-limited 3-DOF attitude slew toward commanded attitude
  const nextAttitude = slewUnitVector(
    state.dynamic.attitudeEci,
    cmd.targetAttitudeEci,
    vehicle.maxAttitudeSlewRateRadS * dt
  );
  // Use midpoint attitude for forces across the step
  const stepAttitude = normalize(add(state.dynamic.attitudeEci, nextAttitude));
  const stepThrottle = cmd.throttle;

  const rk4Space: Rk4Space<DynamicState, DynamicDerivative> = {
    derivative(t: number, s: DynamicState): DynamicDerivative {
      const posEcef = eciToEcef(s.positionEci, t);
      const geo = ecefToGeodetic(posEcef);
      const atmo = sampleAtmosphere(geo.altitudeM);

      const vRot = earthRotationVelocityEci(s.positionEci);
      const vWind = windVelocityEci(geo.latRad, geo.lonRad, t, mission);
      const vAirRel = sub(sub(s.velocityEci, vRot), vWind);

      const disp = mission.dispersions;
      const aero = evaluateAscentAerodynamics(
        vAirRel,
        atmo,
        vehicle.referenceAreaM2,
        disp?.cdScale ?? 1
      );
      const prop = evaluateStagePropulsion(
        vehicle.stage1,
        stepThrottle,
        atmo.pressurePa,
        t,
        s.stage1PropellantKg,
        mission.engineOuts,
        disp?.thrustScale ?? 1,
        disp?.ispScale ?? 1
      );

      const mass = fixedMass + Math.max(0, s.stage1PropellantKg);
      const gAcc = gravitationalAccelerationEci(s.positionEci, mission.enableJ2);
      const thrustVec = scale(stepAttitude, prop.totalThrustN);
      const totalNonGravAcc = scale(add(thrustVec, aero.dragForceEci), 1 / mass);

      return {
        dPos: s.velocityEci,
        dVel: add(gAcc, totalNonGravAcc),
        dProp1: -prop.totalMassFlowKgS,
      };
    },

    addScaled(s: DynamicState, d: DynamicDerivative, sc: number): DynamicState {
      return {
        positionEci: addScaled(s.positionEci, d.dPos, sc),
        velocityEci: addScaled(s.velocityEci, d.dVel, sc),
        stage1PropellantKg: Math.max(0, s.stage1PropellantKg + d.dProp1 * sc),
        attitudeEci: nextAttitude,
      };
    },

    combine(
      s: DynamicState,
      k1: DynamicDerivative,
      k2: DynamicDerivative,
      k3: DynamicDerivative,
      k4: DynamicDerivative,
      stepDt: number
    ): DynamicState {
      const c = stepDt / 6.0;
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
        stage1PropellantKg: Math.max(
          0,
          s.stage1PropellantKg +
            c * (k1.dProp1 + 2 * k2.dProp1 + 2 * k3.dProp1 + k4.dProp1)
        ),
        attitudeEci: nextAttitude,
      };
    },
  };

  const nextDynamic = rk4Step(state.timeS, state.dynamic, dt, rk4Space);
  // Avoid floating-point drift in time by rounding step index externally when running loops
  const nextTime = state.timeS + dt;

  return buildSimState(
    nextTime,
    cmd.phase,
    nextDynamic,
    stepThrottle,
    vehicle,
    mission,
    ctx.padLatRad,
    ctx.padLonRad
  );
}

/**
 * Run a full deterministic Stage 1 ascent from T-0 until MECO (or maxSimTimeS).
 * Records sampled telemetry every `sampleIntervalS` seconds plus all mission events.
 */
export function runAscentToMeco(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  sampleIntervalS = 1.0
): AscentRunResult {
  const launchAzimuthDeg = computeLaunchAzimuthDeg(
    mission.launchSite.latDeg,
    mission.targetInclinationDeg,
    mission.targetOrbitAltitudeM,
    mission.launchDirection === 'DESCENDING'
  );

  const ctx: AscentStepContext = {
    launchAzimuthDeg,
    padLatRad: mission.launchSite.latDeg * DEG_TO_RAD,
    padLonRad: mission.launchSite.lonDeg * DEG_TO_RAD,
    pitchKickStartTimeS: null,
  };

  let state = createInitialAscentState(vehicle, mission);
  const events: MissionEvent[] = [
    {
      type: 'LIFTOFF',
      timeS: 0,
      altitudeM: state.geodetic.altitudeM,
      speedMs: state.speedAirRelMs,
      downrangeM: 0,
      detail: `${mission.launchSite.id} liftoff (azimuth ${launchAzimuthDeg.toFixed(1)}°, mass ${(state.totalMassKg / 1000).toFixed(1)} t)`,
    },
  ];

  const samples: SimState[] = [state];
  const sampleEverySteps = Math.max(1, Math.round(sampleIntervalS / mission.dtS));
  const maxSteps = Math.round(mission.maxSimTimeS / mission.dtS);

  let peakQ = 0;
  let peakQState = state;
  let peakG = 0;
  let pitchoverRecorded = false;
  const recordedEngineOuts = new Set<number>();

  for (let step = 1; step <= maxSteps; step++) {
    const prevState = state;
    state = stepAscent(state, mission.dtS, vehicle, mission, ctx);

    // Exact deterministic timestamp from integer step count
    const exactTimeS = Number((step * mission.dtS).toFixed(6));
    if (exactTimeS !== state.timeS) {
      state = { ...state, timeS: exactTimeS };
    }

    if (state.dynamicPressurePa > peakQ) {
      peakQ = state.dynamicPressurePa;
      peakQState = state;
    }
    if (state.axialAccelG > peakG) {
      peakG = state.axialAccelG;
    }

    if (!pitchoverRecorded && state.phase === 'PITCHOVER') {
      pitchoverRecorded = true;
      events.push({
        type: 'PITCHOVER',
        timeS: state.timeS,
        altitudeM: state.geodetic.altitudeM,
        speedMs: state.speedAirRelMs,
        downrangeM: state.downrangeM,
        detail: `Pitchover kick initiated (${mission.guidance.pitchKickAngleDeg.toFixed(2)}° toward ${launchAzimuthDeg.toFixed(1)}° az)`,
      });
    }

    for (const eo of mission.engineOuts) {
      if (
        !recordedEngineOuts.has(eo.engineIndex) &&
        prevState.timeS < eo.timeS &&
        state.timeS >= eo.timeS
      ) {
        recordedEngineOuts.add(eo.engineIndex);
        events.push({
          type: 'ENGINE_OUT',
          timeS: state.timeS,
          altitudeM: state.geodetic.altitudeM,
          speedMs: state.speedAirRelMs,
          downrangeM: state.downrangeM,
          detail: `Merlin 1D #${eo.engineIndex + 1} shutdown`,
        });
      }
    }

    if (step % sampleEverySteps === 0) {
      samples.push(state);
    }

    if (state.phase === 'MECO') {
      if (samples[samples.length - 1]?.timeS !== state.timeS) {
        samples.push(state);
      }
      events.push({
        type: 'MAX_Q',
        timeS: peakQState.timeS,
        altitudeM: peakQState.geodetic.altitudeM,
        speedMs: peakQState.speedAirRelMs,
        downrangeM: peakQState.downrangeM,
        detail: `Peak dynamic pressure ${(peakQ / 1000).toFixed(2)} kPa (Mach ${peakQState.mach.toFixed(2)})`,
      });
      events.push({
        type: 'MECO',
        timeS: state.timeS,
        altitudeM: state.geodetic.altitudeM,
        speedMs: state.speedAirRelMs,
        downrangeM: state.downrangeM,
        detail: `MECO with ${((state.dynamic.stage1PropellantKg / vehicle.stage1.propellantMassKg) * 100).toFixed(1)}% S1 propellant remaining`,
      });
      break;
    }
  }

  // Sort events chronologically (MAX_Q is appended at MECO so reorder cleanly)
  events.sort((a, b) => a.timeS - b.timeS);

  return {
    finalState: state,
    events,
    samples,
    peakDynamicPressurePa: peakQ,
    peakDynamicPressureTimeS: peakQState.timeS,
    peakAxialAccelG: peakG,
    launchAzimuthDeg,
  };
}
