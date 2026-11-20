import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import { DM1_MISSION, SAOCOM_1A_MISSION } from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';
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
});
