import type { FullMissionResult } from '../sim/types.js';
import type {
  LoadedMissionTelemetry,
  TelemetryPointSI,
} from './load-telemetry.js';

export interface PhaseErrorStats {
  readonly phaseName: string;
  readonly startTimeS: number;
  readonly endTimeS: number;
  readonly sampleCount: number;
  readonly altitudeRmsM: number;
  readonly velocityRmsMs: number;
}

export interface EventDelta {
  readonly real: number;
  readonly sim: number;
  readonly delta: number;
  readonly relErrorPct: number;
}

export interface OverlayRow {
  readonly timeS: number;
  readonly realAltM: number;
  readonly simAltM: number;
  readonly realVelMs: number;
  readonly simVelMs: number;
}

export interface BoosterValidationReport {
  readonly missionName: string;
  readonly phaseErrors: readonly PhaseErrorStats[];
  readonly apogeeAltDelta: EventDelta | null;
  readonly apogeeTimeDelta: EventDelta | null;
  readonly landingTimeDelta: EventDelta | null;
  readonly overlayRows: readonly OverlayRow[];
}

export interface ValidationComparisonReport {
  readonly missionName: string;
  readonly velocityFrame: 'EARTH_RELATIVE_ECEF';
  readonly phaseErrors: readonly PhaseErrorStats[];
  readonly maxQTimeDelta: EventDelta | null;
  readonly mecoTimeDelta: EventDelta | null;
  readonly mecoAltDelta: EventDelta | null;
  readonly mecoVelDelta: EventDelta | null;
  readonly overlayRows: readonly OverlayRow[];
}

function interpolateSeries(
  series: readonly TelemetryPointSI[],
  t: number
): TelemetryPointSI | null {
  if (series.length === 0) return null;
  if (t < series[0]!.timeS || t > series[series.length - 1]!.timeS) {
    return null;
  }
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.timeS <= t) lo = mid;
    else hi = mid;
  }
  const p0 = series[lo]!;
  const p1 = series[hi]!;
  const span = p1.timeS - p0.timeS;
  if (span > 15) return null;
  const a = span > 1e-9 ? (t - p0.timeS) / span : 0;
  return {
    timeS: t,
    altitudeM: p0.altitudeM + a * (p1.altitudeM - p0.altitudeM),
    velocityMs: p0.velocityMs + a * (p1.velocityMs - p0.velocityMs),
  };
}

function makeDelta(real: number, sim: number): EventDelta {
  const delta = sim - real;
  const relErrorPct = real !== 0 ? (delta / real) * 100 : 0;
  return { real, sim, delta, relErrorPct };
}

/**
 * Compare a simulated full mission against real SpaceX webcast telemetry.
 *
 * Velocity frame: SpaceX webcast telemetry reports Earth-relative (ECEF) speed
 * (v = 0 at liftoff, and ~7,547 m/s at 198 km 51.6° orbit vs ~7,786 m/s inertial).
 * Therefore, we compare against simulated Earth-relative speed (`speedAirRelMs`
 * with zero wind during S1, `speedEarthRelMs` during S2).
 */
export function compareMissionToTelemetry(
  sim: FullMissionResult,
  real: LoadedMissionTelemetry
): ValidationComparisonReport {
  // Combine stage1 (0..MECO) and stage2 (MECO..SECO) when stage2 raw starts after separation
  const s1Series = real.stage1?.samples1Hz ?? [];
  const s2Series = real.stage2?.samples1Hz ?? [];
  const realSeries: TelemetryPointSI[] =
    s2Series.length > 0 && s2Series[0]!.timeS <= 10
      ? [...s2Series]
      : [
          ...s1Series.filter((p) => p.timeS <= (real.events?.meco ?? 160)),
          ...s2Series,
        ];
  if (realSeries.length === 0) {
    throw new Error(`No usable telemetry samples in ${real.missionName}`);
  }

  // Build unified simulated ascent + stage 2 timeline in Earth-relative velocity
  const simTimeline: TelemetryPointSI[] = [];
  for (const s of sim.ascent.samples) {
    simTimeline.push({
      timeS: s.timeS,
      altitudeM: s.geodetic.altitudeM,
      velocityMs: s.speedAirRelMs,
    });
  }
  for (const s2 of sim.stage2Samples) {
    if (
      simTimeline.length > 0 &&
      s2.timeS <= simTimeline[simTimeline.length - 1]!.timeS
    ) {
      continue;
    }
    simTimeline.push({
      timeS: s2.timeS,
      altitudeM: s2.geodetic.altitudeM,
      velocityMs: s2.speedEarthRelMs,
    });
  }

  const realMaxQ = real.events?.maxq ?? sim.ascent.peakDynamicPressureTimeS;
  const realMeco = real.events?.meco ?? sim.ascent.finalState.timeS;
  const realSes1 = real.events?.ses1 ?? realMeco + 10;
  const maxOverlapTime = Math.min(
    realSeries[realSeries.length - 1]!.timeS,
    simTimeline[simTimeline.length - 1]!.timeS
  );

  const computePhaseRms = (
    phaseName: string,
    tStart: number,
    tEnd: number
  ): PhaseErrorStats => {
    let sumAltSq = 0;
    let sumVelSq = 0;
    let count = 0;
    for (const rp of realSeries) {
      if (rp.timeS < tStart || rp.timeS > tEnd) continue;
      const sp = interpolateSeries(simTimeline, rp.timeS);
      if (!sp) continue;
      const dAlt = sp.altitudeM - rp.altitudeM;
      const dVel = sp.velocityMs - rp.velocityMs;
      sumAltSq += dAlt * dAlt;
      sumVelSq += dVel * dVel;
      count++;
    }
    return {
      phaseName,
      startTimeS: tStart,
      endTimeS: tEnd,
      sampleCount: count,
      altitudeRmsM: count > 0 ? Math.sqrt(sumAltSq / count) : 0,
      velocityRmsMs: count > 0 ? Math.sqrt(sumVelSq / count) : 0,
    };
  };

  const phaseErrors: PhaseErrorStats[] = [
    computePhaseRms('Ascent to Max-Q', 0, realMaxQ),
    computePhaseRms('Max-Q to MECO', realMaxQ, realMeco),
    computePhaseRms('Stage 2 Ascent', realSes1, maxOverlapTime),
  ];

  const maxQTimeDelta =
    real.events?.maxq != null
      ? makeDelta(real.events.maxq, sim.ascent.peakDynamicPressureTimeS)
      : null;

  const realAtMeco =
    real.events?.meco != null
      ? interpolateSeries(realSeries, real.events.meco)
      : null;
  const mecoTimeDelta =
    real.events?.meco != null
      ? makeDelta(real.events.meco, sim.ascent.finalState.timeS)
      : null;
  const mecoAltDelta =
    realAtMeco != null
      ? makeDelta(realAtMeco.altitudeM, sim.ascent.finalState.geodetic.altitudeM)
      : null;
  const mecoVelDelta =
    realAtMeco != null
      ? makeDelta(realAtMeco.velocityMs, sim.ascent.finalState.speedAirRelMs)
      : null;

  // Build overlay table every 20 s
  const overlayRows: OverlayRow[] = [];
  for (let t = 0; t <= maxOverlapTime; t += 20) {
    const rp = interpolateSeries(realSeries, t);
    const sp = interpolateSeries(simTimeline, t);
    if (rp && sp) {
      overlayRows.push({
        timeS: t,
        realAltM: rp.altitudeM,
        simAltM: sp.altitudeM,
        realVelMs: rp.velocityMs,
        simVelMs: sp.velocityMs,
      });
    }
  }

  return {
    missionName: real.missionName,
    velocityFrame: 'EARTH_RELATIVE_ECEF',
    phaseErrors,
    maxQTimeDelta,
    mecoTimeDelta,
    mecoAltDelta,
    mecoVelDelta,
    overlayRows,
  };
}

/**
 * Compare post-separation Stage 1 booster recovery telemetry against real
 * `stage1 raw.json` through boostback, apogee/coast, entry burn, and landing.
 */
export function compareBoosterToTelemetry(
  sim: FullMissionResult,
  real: LoadedMissionTelemetry
): BoosterValidationReport | null {
  const realS1 = real.stage1?.samples1Hz;
  if (!realS1 || realS1.length === 0) return null;

  const simBooster: TelemetryPointSI[] = sim.boosterSamples.map((b) => ({
    timeS: b.timeS,
    altitudeM: b.geodetic.altitudeM,
    velocityMs: b.speedAirRelMs,
  }));
  if (simBooster.length < 2) return null;

  const ev = real.events;
  const tMeco = ev?.meco ?? sim.ascent.finalState.timeS;
  const tBbStart = ev?.boostback_start ?? tMeco + 12;
  const tBbEnd = ev?.boostback_end ?? tBbStart + 40;
  const tEntryStart = ev?.entry_start ?? tBbEnd + 140;
  const tEntryEnd = ev?.entry_end ?? tEntryStart + 25;
  const tLandStart = ev?.landing_start ?? tEntryEnd + 50;
  const tEndOverlap = Math.min(
    realS1[realS1.length - 1]!.timeS,
    simBooster[simBooster.length - 1]!.timeS
  );

  const computePhaseRms = (
    phaseName: string,
    tStart: number,
    tEnd: number
  ): PhaseErrorStats => {
    let sumAltSq = 0;
    let sumVelSq = 0;
    let count = 0;
    for (const rp of realS1) {
      if (rp.timeS < tStart || rp.timeS > tEnd) continue;
      const sp = interpolateSeries(simBooster, rp.timeS);
      if (!sp) continue;
      const dAlt = sp.altitudeM - rp.altitudeM;
      const dVel = sp.velocityMs - rp.velocityMs;
      sumAltSq += dAlt * dAlt;
      sumVelSq += dVel * dVel;
      count++;
    }
    return {
      phaseName,
      startTimeS: tStart,
      endTimeS: tEnd,
      sampleCount: count,
      altitudeRmsM: count > 0 ? Math.sqrt(sumAltSq / count) : 0,
      velocityRmsMs: count > 0 ? Math.sqrt(sumVelSq / count) : 0,
    };
  };

  const phaseErrors: PhaseErrorStats[] = [
    computePhaseRms('Boostback Burn', tBbStart, tBbEnd),
    computePhaseRms('Coast & Apogee', tBbEnd, tEntryStart),
    computePhaseRms('Entry Burn', tEntryStart, tEntryEnd),
    computePhaseRms('Aero & Landing', tEntryEnd, tEndOverlap),
  ];

  // Real vs sim booster apogee
  let realPeak = realS1[0]!;
  for (const p of realS1) {
    if (p.timeS > tMeco && p.altitudeM > realPeak.altitudeM) realPeak = p;
  }
  let simPeak = simBooster[0]!;
  for (const p of simBooster) {
    if (p.altitudeM > simPeak.altitudeM) simPeak = p;
  }

  const apogeeAltDelta = makeDelta(realPeak.altitudeM, simPeak.altitudeM);
  const apogeeTimeDelta = makeDelta(
    ev?.apogee ?? realPeak.timeS,
    simPeak.timeS
  );
  const landingTimeDelta =
    ev?.landing_end != null
      ? makeDelta(ev.landing_end, sim.boosterFinal.timeS)
      : makeDelta(realS1[realS1.length - 1]!.timeS, sim.boosterFinal.timeS);

  const overlayRows: OverlayRow[] = [];
  for (let t = Math.ceil(tMeco / 20) * 20; t <= tEndOverlap; t += 20) {
    const rp = interpolateSeries(realS1, t);
    const sp = interpolateSeries(simBooster, t);
    if (rp && sp) {
      overlayRows.push({
        timeS: t,
        realAltM: rp.altitudeM,
        simAltM: sp.altitudeM,
        realVelMs: rp.velocityMs,
        simVelMs: sp.velocityMs,
      });
    }
  }
  // Ensure landing burn start is visible if in range
  if (tLandStart <= tEndOverlap) {
    const rp = interpolateSeries(realS1, tLandStart);
    const sp = interpolateSeries(simBooster, tLandStart);
    if (rp && sp && !overlayRows.some((r) => r.timeS === tLandStart)) {
      overlayRows.push({
        timeS: tLandStart,
        realAltM: rp.altitudeM,
        simAltM: sp.altitudeM,
        realVelMs: rp.velocityMs,
        simVelMs: sp.velocityMs,
      });
      overlayRows.sort((a, b) => a.timeS - b.timeS);
    }
  }

  return {
    missionName: real.missionName,
    phaseErrors,
    apogeeAltDelta,
    apogeeTimeDelta,
    landingTimeDelta,
    overlayRows,
  };
}
