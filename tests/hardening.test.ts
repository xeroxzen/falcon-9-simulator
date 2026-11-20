import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
} from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';
import { fmtFixed, fmtSignedDelta } from '../src/ui/format.js';
import { buildMissionTrajectory } from '../src/worker/buildTrajectory.js';

describe('Phase 6 Hardening & Invariants', () => {
  it('keeps grid-fin deflection saturation (< 20 deg stop) below 20% of aero descent across ASDS, RTLS, and DM-1', () => {
    for (const mission of [
      DEFAULT_LEO_ASDS_MISSION,
      DEFAULT_LEO_RTLS_MISSION,
      DM1_MISSION,
    ]) {
      const res = runFullMission(FALCON9_BLOCK5, mission, 0.5);
      const aero = res.boosterSamples.filter((s) => s.phase === 'AERO_DESCENT');
      expect(aero.length).toBeGreaterThan(10);
      const pinned = aero.filter(
        (s) => Math.abs(s.gridFinDeflectionDeg) >= 19.99
      );
      const satRatio = pinned.length / aero.length;
      expect(satRatio).toBeLessThan(0.2);
    }
  });

  it('guarantees exact miss-distance agreement between sim boosterFinal, worker telemetry, and ENU position', () => {
    for (const mission of [DEFAULT_LEO_ASDS_MISSION, DEFAULT_LEO_RTLS_MISSION]) {
      const sim = runFullMission(FALCON9_BLOCK5, mission, 0.25);
      const traj = buildMissionTrajectory(FALCON9_BLOCK5, mission, 0.25);
      const lastFrame = traj.frames[traj.frames.length - 1]!;

      expect(lastFrame.stage1.phase).toBe(sim.boosterFinal.phase);
      expect(
        Math.abs(
          lastFrame.stage1.distanceToTargetM -
            sim.boosterFinal.distanceToTargetM
        )
      ).toBeLessThan(1e-3);
      expect(
        Math.abs(
          traj.boosterTouchdownMissM - sim.boosterFinal.distanceToTargetM
        )
      ).toBeLessThan(1e-3);

      const enuHorizM = Math.hypot(
        lastFrame.stage1.landingEnuM.x,
        lastFrame.stage1.landingEnuM.y
      );
      expect(Math.abs(enuHorizM - sim.boosterFinal.distanceToTargetM)).toBeLessThan(
        0.02
      );
    }
  });

  it('handles extreme 22.8 t payload in ASDS mode honestly (cannot achieve orbit with positive margin AND recover booster)', () => {
    // 22,800 kg is Falcon 9 Block 5's EXPENDABLE LEO limit (SpaceX spec).
    // Attempting ASDS recovery with 22.8 t must NOT achieve nominal orbit with positive Stage 2 margin.
    const overloadedAsds = {
      ...DEFAULT_LEO_ASDS_MISSION,
      payloadMassKg: 22_800,
    };
    const res = runFullMission(FALCON9_BLOCK5, overloadedAsds, 2.0);
    const impossibleBoth =
      res.orbitAchieved &&
      res.stage2Final.dynamic.propellantKg > 0 &&
      res.boosterOutcome === 'LANDED';
    expect(impossibleBoth).toBe(false);
  });

  it('handles an early Stage 1 engine-out at T+5 s honestly (8 active engines, extended burn, finite state)', () => {
    const eoMission = {
      ...DEFAULT_LEO_ASDS_MISSION,
      engineOuts: [{ engineIndex: 3, timeS: 5.0 }],
    };
    const nominal = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 2.0);
    const eo = runFullMission(FALCON9_BLOCK5, eoMission, 2.0);

    const postFailureSample = eo.ascent.samples.find((s) => s.timeS >= 10);
    expect(postFailureSample).toBeDefined();
    expect(postFailureSample!.engines.filter((e) => e.active).length).toBe(8);
    expect(postFailureSample!.engines[3]!.failed).toBe(true);
    // Losing 1 of 9 engines extends Stage 1 burn duration to MECO
    expect(eo.ascent.finalState.timeS).toBeGreaterThan(
      nominal.ascent.finalState.timeS + 5
    );
    expect(Number.isFinite(eo.orbit.perigeeAltitudeM)).toBe(true);
    expect(Number.isFinite(eo.boosterFinal.distanceToTargetM)).toBe(true);
  });

  it('formats -0.0 as 0.0 everywhere via shared formatters', () => {
    expect(fmtFixed(-0.0001, 1)).toBe('0.0');
    expect(fmtFixed(-0.04, 1)).toBe('0.0');
    expect(fmtFixed(-0.0, 2)).toBe('0.00');
    expect(fmtFixed(-0.4, 0)).toBe('0');
    expect(fmtSignedDelta(-0.001, 'm', 2)).toBe('0.00 m');
    expect(fmtSignedDelta(1.25, 's', 1)).toBe('+1.3 s');
  });
});
