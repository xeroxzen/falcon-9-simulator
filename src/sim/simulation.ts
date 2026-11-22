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
  hasFairing = true,
  dryMassScale = 1,
  propellantLoadScale = 1
): number {
  return (
    vehicle.stage1.dryMassKg * dryMassScale +
    vehicle.stage2.dryMassKg * dryMassScale +
    vehicle.stage2.propellantMassKg * propellantLoadScale +
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
  const propScale = mission.dispersions?.propellantLoadScale ?? 1;

  const dynamic: DynamicState = {
    positionEci: posEci,
    velocityEci: velEci,
    stage1PropellantKg: vehicle.stage1.propellantMassKg * propScale,
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
    geodetic.altitudeM,
    timeS,
    mission
  );
  const vAirRel = sub(sub(dynamic.velocityEci, vRot), vWind);
  const vGroundRel = sub(dynamic.velocityEci, vRot);

  const disp = mission.dispersions;
  const aero = evaluateAscentAerodynamics(
    vAirRel,
    atmosphere,
    vehicle.referenceAreaM2,
    disp?.cdScale ?? 1
  );
  const prop = evaluateStagePropulsion(
    vehicle.stage1,
    throttle,
    atmosphere.pressurePa,
    timeS,
    dynamic.stage1PropellantKg,
    mission.engineOuts,
    disp?.thrustScale ?? 1,
    disp?.ispScale ?? 1
  );

  const fixedMass = computeAscentFixedMassKg(
    vehicle,
    mission.payloadMassKg,
    mission.hasFairing,
    disp?.dryMassScale ?? 1,
    disp?.propellantLoadScale ?? 1
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

  // Felt axial acceleration (non-gravitational acceleration along vehicle axis) in g's.
  // While held down by the 4 pad clamps (t < 0), net vehicle acceleration is 0 g
  // (clamps react T - m*g until release at T = 0).
  const netAxialForceN = prop.totalThrustN - aero.dragMagnitudeN;
  const axialAccelG =
    timeS < 0 ? 0 : netAxialForceN / (totalMassKg * G0);

  const pitchFromVerticalDeg =
    angleBetweenRad(dynamic.attitudeEci, basis.up) * RAD_TO_DEG;
  const speedAirRelMs = norm(vAirRel);
  const angleOfAttackDeg =
    speedAirRelMs > 1.0
      ? angleBetweenRad(dynamic.attitudeEci, vAirRel) * RAD_TO_DEG
      : 0;
  const qAlphaPaDeg = aero.dynamicPressurePa * angleOfAttackDeg;

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
    qAlphaPaDeg,
    engines: prop.engines,
    atmosphere,
  };
}

export interface AscentStepContext {
  readonly launchAzimuthDeg: number;
  readonly padLatRad: number;
  readonly padLonRad: number;
  pitchKickStartTimeS: number | null;
  throttleBucketStartTimeS?: number | null;
  actualThrottle: number;
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
  const disp = mission.dispersions;
  const fixedMass = computeAscentFixedMassKg(
    vehicle,
    mission.payloadMassKg,
    mission.hasFairing,
    disp?.dryMassScale ?? 1,
    disp?.propellantLoadScale ?? 1
  );
  const activeCount = state.engines.filter((e) => e.active).length;

  const cmd = computeAscentGuidance(
    {
      timeS: state.timeS,
      altitudeM: state.geodetic.altitudeM,
      latRad: state.geodetic.latRad,
      lonRad: state.geodetic.lonRad,
      // Ground-relative gravity turn; wind still applies physical aero loads & q*alpha.
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
      throttleBucketStartTimeS: ctx.throttleBucketStartTimeS ?? null,
    },
    vehicle,
    mission
  );

  ctx.pitchKickStartTimeS = cmd.pitchKickStartTimeS;
  ctx.throttleBucketStartTimeS = cmd.throttleBucketStartTimeS;

  // Rate-limited 3-DOF attitude slew toward commanded attitude
  const nextAttitude = slewUnitVector(
    state.dynamic.attitudeEci,
    cmd.targetAttitudeEci,
    vehicle.maxAttitudeSlewRateRadS * dt
  );
  // Use midpoint attitude for forces across the step
  const stepAttitude = normalize(add(state.dynamic.attitudeEci, nextAttitude));
  const lagS = disp?.actuatorLagS ?? 0;
  if (lagS > 0 && cmd.throttle > 0) {
    const alpha = dt / (lagS + dt);
    ctx.actualThrottle =
      ctx.actualThrottle + (cmd.throttle - ctx.actualThrottle) * alpha;
  } else {
    ctx.actualThrottle = cmd.throttle;
  }
  const stepThrottle = ctx.actualThrottle;

  const rk4Space: Rk4Space<DynamicState, DynamicDerivative> = {
    derivative(t: number, s: DynamicState): DynamicDerivative {
      const posEcef = eciToEcef(s.positionEci, t);
      const geo = ecefToGeodetic(posEcef);
      const atmo = sampleAtmosphere(geo.altitudeM);

      const vRot = earthRotationVelocityEci(s.positionEci);
      const vWind = windVelocityEci(geo.latRad, geo.lonRad, geo.altitudeM, t, mission);
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
 * Pre-launch hold-down ignition constants:
 *  - IGNITION_START_S = -3.0 s: Merlin 1D TEA-TEB ignition command (SpaceX Falcon User's Guide / webcast)
 *  - SPOOL_UP_DURATION_S = 2.2 s (ASSUMED): smoothstep thrust spool-up 0 -> 100% (-3.0 to -0.8 s),
 *    followed by 0.8 s full-thrust hold-down health verification (-0.8 to 0.0 s) before clamp release at T = 0.
 */
export const IGNITION_START_S = -3.0;
export const WATER_DELUGE_START_S = -5.0;
const SPOOL_UP_DURATION_S = 2.2;

export function computeIgnitionSpoolThrottle(timeS: number): number {
  if (timeS < IGNITION_START_S) return 0;
  if (timeS >= IGNITION_START_S + SPOOL_UP_DURATION_S) return 1.0;
  const u = (timeS - IGNITION_START_S) / SPOOL_UP_DURATION_S;
  const smooth = u * u * (3 - 2 * u);
  // 10% initial TEA-TEB ignition flash at T-3.0 s, ramping smoothly to 100% by T-0.8 s
  return 0.1 + 0.9 * smooth;
}

/**
 * Run a full deterministic Stage 1 ascent from T-countdownS (if > 0) through T-0 clamp release until MECO.
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

  const padLatRad = mission.launchSite.latDeg * DEG_TO_RAD;
  const padLonRad = mission.launchSite.lonDeg * DEG_TO_RAD;

  const ctx: AscentStepContext = {
    launchAzimuthDeg,
    padLatRad,
    padLonRad,
    pitchKickStartTimeS: null,
    throttleBucketStartTimeS: null,
    actualThrottle: 1.0,
  };

  const samples: SimState[] = [];
  const events: MissionEvent[] = [];
  const sampleEverySteps = Math.max(1, Math.round(sampleIntervalS / mission.dtS));

  // Optional pre-launch terminal countdown & hold-down clamp ignition sequence (T-countdownS .. T-0)
  const countdownS = Math.max(0, mission.countdownS ?? 0);
  if (countdownS > 0) {
    const padPosEcef = geodeticToEcef({
      latRad: padLatRad,
      lonRad: padLonRad,
      altitudeM: mission.launchSite.elevationM,
    });
    const padAtmo = sampleAtmosphere(mission.launchSite.elevationM);
    const disp = mission.dispersions;
    const propScale = disp?.propellantLoadScale ?? 1;
    const liftoffPropKg = vehicle.stage1.propellantMassKg * propScale;

    // Pre-integrate hold-down propellant burn (T-3.0..0.0 s) so tank mass at T=0
    // clamp release equals exact liftoffPropKg while physically burning ~5.1 t on the clamps.
    const preSteps = Math.round(countdownS / mission.dtS);
    let holdDownBurnKg = 0;
    for (let k = 0; k < preSteps; k++) {
      const t = Number((-countdownS + k * mission.dtS).toFixed(6));
      const thr = computeIgnitionSpoolThrottle(t);
      if (thr > 0) {
        const p = evaluateStagePropulsion(
          vehicle.stage1,
          thr,
          padAtmo.pressurePa,
          t,
          liftoffPropKg + 10_000,
          mission.engineOuts,
          disp?.thrustScale ?? 1,
          disp?.ispScale ?? 1
        );
        holdDownBurnKg += p.totalMassFlowKgS * mission.dtS;
      }
    }

    let propKg = liftoffPropKg + holdDownBurnKg;
    let ignitionEventRecorded = false;

    for (let k = 0; k < preSteps; k++) {
      const t = Number((-countdownS + k * mission.dtS).toFixed(6));
      const thr = computeIgnitionSpoolThrottle(t);
      const phase: AscentPhase = t < IGNITION_START_S ? 'PAD' : 'IGNITION';

      if (k % sampleEverySteps === 0 || (!ignitionEventRecorded && t >= IGNITION_START_S)) {
        // Rotate pad ECEF position into ECI at negative timestamp t
        const posEci = eciToEcef(padPosEcef, -t);
        const velEci = earthRotationVelocityEci(posEci);
        const basis = localEnuBasisEci(padLatRad, padLonRad, t);
        const dyn: DynamicState = {
          positionEci: posEci,
          velocityEci: velEci,
          stage1PropellantKg: propKg,
          attitudeEci: basis.up,
        };
        const st = buildSimState(
          t,
          phase,
          dyn,
          thr,
          vehicle,
          mission,
          padLatRad,
          padLonRad
        );
        if (k % sampleEverySteps === 0) {
          samples.push(st);
        }
        if (!ignitionEventRecorded && t >= IGNITION_START_S) {
          ignitionEventRecorded = true;
          events.push({
            type: 'IGNITION',
            timeS: t,
            altitudeM: st.geodetic.altitudeM,
            speedMs: 0,
            downrangeM: 0,
            detail: `9× Merlin 1D TEA-TEB ignition on hold-down clamps (~${(holdDownBurnKg / 1000).toFixed(1)} t pre-release burn)`,
          });
        }
      }

      if (thr > 0) {
        const p = evaluateStagePropulsion(
          vehicle.stage1,
          thr,
          padAtmo.pressurePa,
          t,
          propKg,
          mission.engineOuts,
          disp?.thrustScale ?? 1,
          disp?.ispScale ?? 1
        );
        propKg = Math.max(liftoffPropKg, propKg - p.totalMassFlowKgS * mission.dtS);
      }
    }
  }

  let state = createInitialAscentState(vehicle, mission);
  events.push({
    type: 'LIFTOFF',
    timeS: 0,
    altitudeM: state.geodetic.altitudeM,
    speedMs: state.speedAirRelMs,
    downrangeM: 0,
    detail: `${mission.launchSite.id} clamp release & liftoff (azimuth ${launchAzimuthDeg.toFixed(1)}°, mass ${(state.totalMassKg / 1000).toFixed(1)} t)`,
  });

  samples.push(state);
  const maxSteps = Math.round(mission.maxSimTimeS / mission.dtS);

  let peakQ = 0;
  let peakQState = state;
  let peakQAlpha = 0;
  let peakQAlphaTimeS = 0;
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
    if (state.qAlphaPaDeg > peakQAlpha) {
      peakQAlpha = state.qAlphaPaDeg;
      peakQAlphaTimeS = state.timeS;
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
    peakQAlphaPaDeg: peakQAlpha,
    peakQAlphaTimeS,
    peakAxialAccelG: peakG,
    launchAzimuthDeg,
  };
}
