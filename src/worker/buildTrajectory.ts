import { DEG_TO_RAD } from '../sim/config/constants.js';
import {
  dot,
  eciToEcef,
  geodeticToEcef,
  localEnuBasisEcef,
  normalize,
  sub,
} from '../sim/math.js';
import { runFullMission } from '../sim/mission.js';
import { sampleAtmosphere } from '../sim/models/atmosphere.js';
import type {
  BoosterState,
  GeodeticCoord,
  MissionConfig,
  MissionEvent,
  SimState,
  Stage2State,
  Vec3,
  VehicleConfig,
} from '../sim/types.js';
import type {
  MissionTrajectoryData,
  PlaybackFrame,
  StageFrameSnapshot,
  StageSegment,
  TimelineEvent,
} from './protocol.js';

function ecefDeltaToEnu(
  posEcef: Vec3,
  anchorEcef: Vec3,
  anchorLatRad: number,
  anchorLonRad: number
): Vec3 {
  const d = sub(posEcef, anchorEcef);
  const b = localEnuBasisEcef(anchorLatRad, anchorLonRad);
  return {
    x: dot(d, b.east),
    y: dot(d, b.north),
    z: dot(d, b.up),
  };
}

function ecefDirToEnu(
  dirEcef: Vec3,
  anchorLatRad: number,
  anchorLonRad: number
): Vec3 {
  const b = localEnuBasisEcef(anchorLatRad, anchorLonRad);
  return normalize({
    x: dot(dirEcef, b.east),
    y: dot(dirEcef, b.north),
    z: dot(dirEcef, b.up),
  });
}

function eventLabelAndStage(ev: MissionEvent): {
  label: string;
  stage: TimelineEvent['stage'];
} {
  switch (ev.type) {
    case 'LIFTOFF':
      return { label: 'T-0 Liftoff', stage: 'STACK' };
    case 'PITCHOVER':
      return { label: 'Pitchover', stage: 'STACK' };
    case 'MAX_Q':
      return { label: 'Max-Q', stage: 'STACK' };
    case 'ENGINE_OUT':
      return { label: 'Engine Out', stage: 'STAGE1' };
    case 'MECO':
      return { label: 'MECO', stage: 'STAGE1' };
    case 'STAGE_SEP':
      return { label: 'Stage Sep', stage: 'MISSION' };
    case 'SES_1':
      return { label: 'SES-1', stage: 'STAGE2' };
    case 'FAIRING_SEP':
      return { label: 'Fairing Sep', stage: 'STAGE2' };
    case 'SECO_1':
      return { label: 'SECO-1', stage: 'STAGE2' };
    case 'FLIP_START':
      return { label: 'Flip', stage: 'STAGE1' };
    case 'BOOSTBACK_START':
      return { label: 'Boostback', stage: 'STAGE1' };
    case 'BOOSTBACK_END':
      return { label: 'BB Cutoff', stage: 'STAGE1' };
    case 'APOGEE':
      return { label: 'Apogee', stage: 'STAGE1' };
    case 'ENTRY_BURN_START':
      return { label: 'Entry Burn', stage: 'STAGE1' };
    case 'ENTRY_BURN_END':
      return { label: 'Entry End', stage: 'STAGE1' };
    case 'LANDING_BURN_START':
      return { label: 'Landing Burn', stage: 'STAGE1' };
    case 'LANDING_LEGS_DEPLOY':
      return { label: 'Legs Deploy', stage: 'STAGE1' };
    case 'TOUCHDOWN':
      return { label: 'Touchdown', stage: 'STAGE1' };
    case 'CRASH':
      return { label: 'Impact', stage: 'STAGE1' };
    default:
      return { label: ev.type, stage: 'MISSION' };
  }
}

function classifyStageKind(
  snap: StageFrameSnapshot
): { kind: StageSegment['kind']; label: string } {
  if (snap.phase === 'LANDED') return { kind: 'LANDED', label: 'Landed' };
  if (snap.phase === 'CRASHED') return { kind: 'CRASHED', label: 'Impact' };
  if (snap.phase === 'SECO' || snap.phase === 'ORBIT') {
    return { kind: 'ORBIT', label: 'Orbit' };
  }
  if (snap.thrustN > 100) {
    if (snap.phase === 'BOOSTBACK_BURN') return { kind: 'BURN', label: 'Boostback' };
    if (snap.phase === 'ENTRY_BURN') return { kind: 'BURN', label: 'Entry Burn' };
    if (snap.phase === 'LANDING_BURN') return { kind: 'BURN', label: 'Landing Burn' };
    if (snap.phase === 'STAGE2_BURN') return { kind: 'BURN', label: 'MVac Burn' };
    return { kind: 'BURN', label: 'Ascent Burn' };
  }
  if (snap.phase === 'AERO_DESCENT') {
    return { kind: 'AERO', label: 'Grid-Fin Glide' };
  }
  return { kind: 'COAST', label: 'Coast' };
}

export function buildDynamicSegments(frames: readonly PlaybackFrame[]): StageSegment[] {
  const segments: StageSegment[] = [];
  for (const stageKey of ['STAGE1', 'STAGE2'] as const) {
    let curKind: StageSegment['kind'] | null = null;
    let curLabel = '';
    let startT = 0;
    let count = 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const snap = stageKey === 'STAGE1' ? f.stage1 : f.stage2;
      const { kind, label } = classifyStageKind(snap);
      if (curKind === null) {
        curKind = kind;
        curLabel = label;
        startT = f.timeS;
      } else if (kind !== curKind || label !== curLabel) {
        segments.push({
          id: `${stageKey}-${count++}`,
          stage: stageKey,
          kind: curKind,
          label: curLabel,
          startTimeS: startT,
          endTimeS: f.timeS,
        });
        curKind = kind;
        curLabel = label;
        startT = f.timeS;
      }
    }
    if (curKind !== null && frames.length > 0) {
      segments.push({
        id: `${stageKey}-${count++}`,
        stage: stageKey,
        kind: curKind,
        label: curLabel,
        startTimeS: startT,
        endTimeS: frames[frames.length - 1]!.timeS,
      });
    }
  }
  return segments;
}

function buildSnapshotFromAscent(
  s: SimState,
  vehicle: VehicleConfig,
  padCoord: GeodeticCoord,
  padEcef: Vec3,
  landCoord: GeodeticCoord,
  landEcef: Vec3,
  hasFairing: boolean
): StageFrameSnapshot {
  const posEcef = eciToEcef(s.dynamic.positionEci, s.timeS);
  const attEcef = eciToEcef(s.dynamic.attitudeEci, s.timeS);
  return {
    padEnuM: ecefDeltaToEnu(posEcef, padEcef, padCoord.latRad, padCoord.lonRad),
    landingEnuM: ecefDeltaToEnu(posEcef, landEcef, landCoord.latRad, landCoord.lonRad),
    attitudePadEnu: ecefDirToEnu(attEcef, padCoord.latRad, padCoord.lonRad),
    attitudeLandingEnu: ecefDirToEnu(attEcef, landCoord.latRad, landCoord.lonRad),
    attitudeLocalEnu: ecefDirToEnu(attEcef, s.geodetic.latRad, s.geodetic.lonRad),
    altitudeM: s.geodetic.altitudeM,
    downrangeM: s.downrangeM,
    distanceToTargetM: 0,
    speedEarthRelMs: s.speedAirRelMs,
    speedInertialMs: s.speedInertialMs,
    verticalSpeedMs: s.verticalSpeedMs,
    horizontalSpeedMs: s.horizontalSpeedMs,
    mach: s.mach,
    dynamicPressurePa: s.dynamicPressurePa,
    qAlphaPaDeg: s.qAlphaPaDeg,
    thrustN: s.thrustN,
    throttle: s.throttle,
    axialAccelG: s.axialAccelG,
    totalMassKg: s.totalMassKg,
    propellantKg: s.dynamic.stage1PropellantKg,
    propellantFraction:
      s.dynamic.stage1PropellantKg / vehicle.stage1.propellantMassKg,
    phase: s.phase,
    activeEngineCount: s.engines.filter((e) => e.active).length,
    engines: s.engines,
    gridFinDeflectionDeg: 0,
    landingLegsDeployed: false,
    fairingAttached: hasFairing,
    ambientPressurePa: s.atmosphere.pressurePa,
    ambientDensityKgM3: s.atmosphere.densityKgM3,
  };
}

function buildSnapshotFromBooster(
  b: BoosterState,
  vehicle: VehicleConfig,
  padCoord: GeodeticCoord,
  padEcef: Vec3,
  landCoord: GeodeticCoord,
  landEcef: Vec3
): StageFrameSnapshot {
  const posEcef = eciToEcef(b.dynamic.positionEci, b.timeS);
  const attEcef = eciToEcef(b.dynamic.attitudeEci, b.timeS);
  const atmo = sampleAtmosphere(b.geodetic.altitudeM);
  return {
    padEnuM: ecefDeltaToEnu(posEcef, padEcef, padCoord.latRad, padCoord.lonRad),
    landingEnuM: ecefDeltaToEnu(posEcef, landEcef, landCoord.latRad, landCoord.lonRad),
    attitudePadEnu: ecefDirToEnu(attEcef, padCoord.latRad, padCoord.lonRad),
    attitudeLandingEnu: ecefDirToEnu(attEcef, landCoord.latRad, landCoord.lonRad),
    attitudeLocalEnu: ecefDirToEnu(attEcef, b.geodetic.latRad, b.geodetic.lonRad),
    altitudeM: b.geodetic.altitudeM,
    downrangeM: b.downrangeM,
    distanceToTargetM: b.distanceToTargetM,
    speedEarthRelMs: b.speedAirRelMs,
    speedInertialMs: b.speedInertialMs,
    verticalSpeedMs: b.verticalSpeedMs,
    horizontalSpeedMs: b.horizontalSpeedMs,
    mach: b.mach,
    dynamicPressurePa: b.dynamicPressurePa,
    qAlphaPaDeg: 0,
    thrustN: b.thrustN,
    throttle: b.throttle,
    axialAccelG: b.axialAccelG,
    totalMassKg: b.totalMassKg,
    propellantKg: b.dynamic.propellantKg,
    propellantFraction: b.dynamic.propellantKg / vehicle.stage1.propellantMassKg,
    phase: b.phase,
    activeEngineCount: b.engines.filter((e) => e.active).length,
    engines: b.engines,
    gridFinDeflectionDeg: b.gridFinDeflectionDeg,
    landingLegsDeployed: b.landingLegsDeployed,
    fairingAttached: false,
    ambientPressurePa: atmo.pressurePa,
    ambientDensityKgM3: atmo.densityKgM3,
  };
}

function buildSnapshotFromStage2(
  s2: Stage2State,
  vehicle: VehicleConfig,
  padCoord: GeodeticCoord,
  padEcef: Vec3,
  landCoord: GeodeticCoord,
  landEcef: Vec3
): StageFrameSnapshot {
  const posEcef = eciToEcef(s2.dynamic.positionEci, s2.timeS);
  const attEcef = eciToEcef(s2.dynamic.attitudeEci, s2.timeS);
  const atmo = sampleAtmosphere(s2.geodetic.altitudeM);
  return {
    padEnuM: ecefDeltaToEnu(posEcef, padEcef, padCoord.latRad, padCoord.lonRad),
    landingEnuM: ecefDeltaToEnu(posEcef, landEcef, landCoord.latRad, landCoord.lonRad),
    attitudePadEnu: ecefDirToEnu(attEcef, padCoord.latRad, padCoord.lonRad),
    attitudeLandingEnu: ecefDirToEnu(attEcef, landCoord.latRad, landCoord.lonRad),
    attitudeLocalEnu: ecefDirToEnu(attEcef, s2.geodetic.latRad, s2.geodetic.lonRad),
    altitudeM: s2.geodetic.altitudeM,
    downrangeM: s2.downrangeM,
    distanceToTargetM: 0,
    speedEarthRelMs: s2.speedEarthRelMs,
    speedInertialMs: s2.speedInertialMs,
    verticalSpeedMs: s2.verticalSpeedMs,
    horizontalSpeedMs: s2.horizontalSpeedMs,
    mach: atmo.speedOfSoundMs > 0 ? s2.speedEarthRelMs / atmo.speedOfSoundMs : 0,
    dynamicPressurePa:
      0.5 * atmo.densityKgM3 * s2.speedEarthRelMs * s2.speedEarthRelMs,
    qAlphaPaDeg: 0,
    thrustN: s2.thrustN,
    throttle: s2.throttle,
    axialAccelG: s2.axialAccelG,
    totalMassKg: s2.totalMassKg,
    propellantKg: s2.dynamic.propellantKg,
    propellantFraction: s2.dynamic.propellantKg / vehicle.stage2.propellantMassKg,
    phase: s2.phase,
    activeEngineCount: s2.engines.filter((e) => e.active).length,
    engines: s2.engines,
    gridFinDeflectionDeg: 0,
    landingLegsDeployed: false,
    fairingAttached: s2.fairingAttached,
    ambientPressurePa: atmo.pressurePa,
    ambientDensityKgM3: atmo.densityKgM3,
  };
}

function findNearestByTime<T extends { readonly timeS: number }>(
  arr: readonly T[],
  t: number
): T {
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.timeS <= t) lo = mid;
    else hi = mid;
  }
  const a = arr[lo]!;
  const b = arr[hi]!;
  return Math.abs(a.timeS - t) <= Math.abs(b.timeS - t) ? a : b;
}

/**
 * Pure worker payload builder: runs the deterministic physics simulation and
 * packages frames, dynamic events, and per-stage segments for the UI.
 */
export function buildMissionTrajectory(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  sampleIntervalS = 0.25
): MissionTrajectoryData {
  const t0 = performance.now();
  const res = runFullMission(vehicle, mission, sampleIntervalS);
  const computeTimeMs = performance.now() - t0;

  const padCoord: GeodeticCoord = {
    latRad: mission.launchSite.latDeg * DEG_TO_RAD,
    lonRad: mission.launchSite.lonDeg * DEG_TO_RAD,
    altitudeM: mission.launchSite.elevationM,
  };
  const padEcef = geodeticToEcef(padCoord);
  const landCoord = res.landingTarget;
  const landEcef = geodeticToEcef(landCoord);

  const stageSepEv = res.events.find((e) => e.type === 'STAGE_SEP');
  const stageSepTimeS =
    stageSepEv?.timeS ??
    res.ascent.finalState.timeS + mission.guidance.stageSepDelayS;

  const frames: PlaybackFrame[] = [];
  for (const s of res.ascent.samples) {
    const snap = buildSnapshotFromAscent(
      s,
      vehicle,
      padCoord,
      padEcef,
      landCoord,
      landEcef,
      mission.hasFairing
    );
    frames.push({
      timeS: s.timeS,
      separated: false,
      stage1: snap,
      stage2: {
        ...snap,
        propellantKg: vehicle.stage2.propellantMassKg,
        propellantFraction: 1.0,
        phase: 'ATTACHED',
        engines: [],
        activeEngineCount: 0,
      },
    });
  }

  const mecoT = res.ascent.finalState.timeS;
  const maxT = Math.max(res.stage2Final.timeS, res.boosterFinal.timeS);
  for (let t = mecoT + sampleIntervalS; t <= maxT + 0.001; t += sampleIntervalS) {
    const clampedT = Math.min(t, maxT);
    const b = findNearestByTime(res.boosterSamples, clampedT);
    const s2 = findNearestByTime(res.stage2Samples, clampedT);
    frames.push({
      timeS: Number(clampedT.toFixed(3)),
      separated: clampedT >= stageSepTimeS,
      stage1: buildSnapshotFromBooster(
        b,
        vehicle,
        padCoord,
        padEcef,
        landCoord,
        landEcef
      ),
      stage2: buildSnapshotFromStage2(
        s2,
        vehicle,
        padCoord,
        padEcef,
        landCoord,
        landEcef
      ),
    });
  }

  // Always emit the exact final frame at maxT so HUD/timeline match boosterFinal & stage2Final
  const lastEmittedT = frames.length > 0 ? frames[frames.length - 1]!.timeS : -1;
  if (lastEmittedT < maxT - 1e-4) {
    frames.push({
      timeS: Number(maxT.toFixed(3)),
      separated: maxT >= stageSepTimeS,
      stage1: buildSnapshotFromBooster(
        res.boosterFinal,
        vehicle,
        padCoord,
        padEcef,
        landCoord,
        landEcef
      ),
      stage2: buildSnapshotFromStage2(
        res.stage2Final,
        vehicle,
        padCoord,
        padEcef,
        landCoord,
        landEcef
      ),
    });
  }

  const events: TimelineEvent[] = res.events.map((ev, i) => {
    const { label, stage } = eventLabelAndStage(ev);
    return {
      id: `${ev.type}-${i}`,
      type: ev.type,
      label,
      stage,
      timeS: ev.timeS,
      altitudeM: ev.altitudeM,
      speedMs: ev.speedMs,
      downrangeM: ev.downrangeM,
      detail: ev.detail,
    };
  });

  const segments = buildDynamicSegments(frames);
  const apogeeEv = res.events.find((e) => e.type === 'APOGEE');
  const boosterApogeeM =
    apogeeEv?.altitudeM ??
    Math.max(
      res.ascent.finalState.geodetic.altitudeM,
      ...res.boosterSamples.map((b) => b.geodetic.altitudeM)
    );

  return {
    missionId: mission.id,
    missionName: mission.name,
    landingMode: mission.landingMode,
    launchSiteId: mission.launchSite.id,
    hasFairing: mission.hasFairing,
    durationS: maxT,
    stageSepTimeS,
    frames,
    events,
    segments,
    orbit: res.orbit,
    orbitAchieved: res.orbitAchieved,
    boosterOutcome: res.boosterOutcome,
    boosterFailureReason: res.boosterFailureReason,
    mecoTimeS: mecoT,
    boosterApogeeM,
    boosterTouchdownMissM: res.boosterFinal.distanceToTargetM,
    boosterPropRemainingKg: res.boosterFinal.dynamic.propellantKg,
    stage2PropRemainingKg: res.stage2Final.dynamic.propellantKg,
    landingTarget: res.landingTarget,
    computeTimeMs,
  };
}
