import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DM1_MISSION,
  IRIDIUM_NEXT_8_MISSION,
  SAOCOM_1A_MISSION,
} from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';
import { runAscentToMeco } from '../src/sim/simulation.js';
import {
  cleanAndResampleTelemetry,
  loadMissionTelemetry,
} from '../src/validation/load-telemetry.js';
import {
  compareBoosterToTelemetry,
  compareMissionToTelemetry,
} from '../src/validation/compare.js';

const TELEMETRY_ROOT = '/Users/andilejaden/Developer/OpenSource/Telemetry-Data';

describe('Telemetry loader & OCR cleaner', () => {
  it('normalizes km -> m, drops >15g OCR spikes, and resamples to 1 Hz', () => {
    const raw = {
      time: [0.0, 0.5, 1.0, 1.03, 1.5, 2.0, 2.5, 3.0],
      velocity: [0, 10, 20, 9999, 30, 40, 50, 60], // 9999 is an OCR spike
      altitude: [0, 0.01, 0.02, 500, 0.03, 0.04, 0.05, 0.06], // 500 km spike
    };

    const cleaned = cleanAndResampleTelemetry(raw);
    expect(cleaned.droppedOutliers).toBe(1);
    expect(cleaned.samples1Hz.map((s) => s.timeS)).toEqual([0, 1, 2, 3]);
    expect(cleaned.samples1Hz[2]!.velocityMs).toBeCloseTo(40, 6);
    expect(cleaned.samples1Hz[2]!.altitudeM).toBeCloseTo(40, 6);
  });

  it('validates DM-1 simulation with Max-Q < 5% and MECO time/alt/vel < 10%', () => {
    if (!fs.existsSync(TELEMETRY_ROOT)) {
      return;
    }
    const real = loadMissionTelemetry(TELEMETRY_ROOT, 'DM-1');
    const sim = runFullMission(FALCON9_BLOCK5, DM1_MISSION, 1.0);
    const report = compareMissionToTelemetry(sim, real);

    expect(report.mecoTimeDelta).not.toBeNull();
    expect(report.mecoAltDelta).not.toBeNull();
    expect(report.mecoVelDelta).not.toBeNull();
    expect(report.maxQTimeDelta).not.toBeNull();

    expect(Math.abs(report.maxQTimeDelta!.relErrorPct)).toBeLessThan(5.0);
    expect(Math.abs(report.mecoTimeDelta!.relErrorPct)).toBeLessThan(10.0);
    expect(Math.abs(report.mecoAltDelta!.relErrorPct)).toBeLessThan(10.0);
    expect(Math.abs(report.mecoVelDelta!.relErrorPct)).toBeLessThan(10.0);
  });

  it('produces post-separation booster telemetry comparison on SAOCOM 1A', () => {
    if (!fs.existsSync(TELEMETRY_ROOT)) {
      return;
    }
    const real = loadMissionTelemetry(TELEMETRY_ROOT, 'SAOCOM 1A');
    const sim = runFullMission(FALCON9_BLOCK5, SAOCOM_1A_MISSION, 1.0);
    const bReport = compareBoosterToTelemetry(sim, real);

    expect(bReport).not.toBeNull();
    expect(bReport!.phaseErrors.length).toBe(4);
    expect(bReport!.overlayRows.length).toBeGreaterThan(5);
  });

  it('records kick provenance on all historical missions and detects >0.10 deg kick drift on re-fit', () => {
    const historicalMissions = [
      { mission: DM1_MISSION, telemetryKey: 'DM-1' },
      { mission: IRIDIUM_NEXT_8_MISSION, telemetryKey: 'Iridium NEXT 8' },
      { mission: SAOCOM_1A_MISSION, telemetryKey: 'SAOCOM 1A' },
    ] as const;

    for (const { mission } of historicalMissions) {
      expect(mission.fittedKickProvenance).toBeDefined();
      expect(mission.fittedKickProvenance!.modelVersion.length).toBeGreaterThan(0);
      expect(mission.fittedKickProvenance!.commit.length).toBeGreaterThanOrEqual(7);
      expect(mission.fittedKickProvenance!.sourceTelemetry.length).toBeGreaterThan(0);
    }

    if (!fs.existsSync(TELEMETRY_ROOT)) {
      return;
    }

    const fitLoss = (
      mission: (typeof historicalMissions)[number]['mission'],
      real: ReturnType<typeof loadMissionTelemetry>,
      kickDeg: number
    ): number => {
      const candidate = {
        ...mission,
        dtS: 0.02,
        guidance: { ...mission.guidance, pitchKickAngleDeg: kickDeg },
      };
      const sim = runAscentToMeco(FALCON9_BLOCK5, candidate, 1.0);
      const s1Series = real.stage1?.samples1Hz ?? [];
      const s2Series = real.stage2?.samples1Hz ?? [];
      const series =
        s2Series.length > 0 && s2Series[0]!.timeS <= 10 ? s2Series : s1Series;
      const tEnd = Math.min(real.events?.meco ?? 160, sim.finalState.timeS);
      let altSq = 0;
      let velSq = 0;
      let n = 0;
      for (const s of sim.samples) {
        if (s.timeS < 0 || s.timeS > tEnd) continue;
        const r = series.find((p) => Math.abs(p.timeS - s.timeS) < 0.51);
        if (!r) continue;
        const dAltKm = (s.geodetic.altitudeM - r.altitudeM) / 1000;
        const dVelMs = s.speedAirRelMs - r.velocityMs;
        altSq += dAltKm * dAltKm;
        velSq += dVelMs * dVelMs;
        n++;
      }
      if (n === 0) return Infinity;
      const altRmsKm = Math.sqrt(altSq / n);
      const velRmsMs = Math.sqrt(velSq / n);
      return (altRmsKm / 1.0) ** 2 + (velRmsMs / 50.0) ** 2;
    };

    for (const { mission, telemetryKey } of historicalMissions) {
      const real = loadMissionTelemetry(TELEMETRY_ROOT, telemetryKey);
      let bestKick = mission.guidance.pitchKickAngleDeg;
      let bestLoss = Infinity;
      // Coarse search [0.5, 3.0] deg in 0.10 deg steps
      for (let k = 0.5; k <= 3.001; k += 0.1) {
        const loss = fitLoss(mission, real, k);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestKick = k;
        }
      }
      // Fine search [bestKick - 0.12, bestKick + 0.12] in 0.01 deg steps
      const fineLo = Math.max(0.5, bestKick - 0.12);
      const fineHi = Math.min(3.0, bestKick + 0.12);
      for (let k = fineLo; k <= fineHi + 1e-6; k += 0.01) {
        const loss = fitLoss(mission, real, k);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestKick = k;
        }
      }
      const driftDeg = Math.abs(bestKick - mission.guidance.pitchKickAngleDeg);
      expect(
        driftDeg,
        `${mission.name} kick drifted ${driftDeg.toFixed(2)} deg (shipped ${mission.guidance.pitchKickAngleDeg} deg vs re-fit ${bestKick.toFixed(2)} deg)`
      ).toBeLessThanOrEqual(0.1);
    }
  }, 30_000);
});
