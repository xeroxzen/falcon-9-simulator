import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
} from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';
import { buildMissionTrajectory } from '../src/worker/buildTrajectory.js';
import { sampleFrameAt, useSimStore } from '../src/store/simStore.js';

describe('Worker protocol & Zustand store determinism and CLI parity', () => {
  it('scrubbing to t then playing produces bit-identical state to an uninterrupted run', () => {
    const traj = buildMissionTrajectory(
      FALCON9_BLOCK5,
      DEFAULT_LEO_ASDS_MISSION,
      0.25
    );

    // Uninterrupted advance from t=0 to t=200 in 0.5 s increments
    useSimStore.setState({
      trajectory: traj,
      timeS: 0,
      playing: true,
      playbackSpeed: 1,
    });
    for (let i = 0; i < 400; i++) {
      useSimStore.getState().advanceTime(0.5);
    }
    const uninterruptedT = useSimStore.getState().timeS;
    const uninterruptedFrame = sampleFrameAt(traj, uninterruptedT);

    // Scrub to t=120, then play forward to t=200
    useSimStore.getState().setTimeS(120);
    useSimStore.getState().setPlaying(true);
    for (let i = 0; i < 160; i++) {
      useSimStore.getState().advanceTime(0.5);
    }
    const scrubbedT = useSimStore.getState().timeS;
    const scrubbedFrame = sampleFrameAt(traj, scrubbedT);

    expect(scrubbedT).toBe(uninterruptedT);
    expect(scrubbedFrame).toEqual(uninterruptedFrame);
  });

  it('HUD interpolated values match headless CLI telemetry at the same timestamps', () => {
    const cli = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 1.0);
    const traj = buildMissionTrajectory(
      FALCON9_BLOCK5,
      DEFAULT_LEO_ASDS_MISSION,
      1.0
    );

    // Check Stage 1 ascent samples (t = 30, 60, 120 s)
    for (const tCheck of [30, 60, 120]) {
      const cliSample = cli.ascent.samples.find((s) => s.timeS === tCheck);
      expect(cliSample).toBeDefined();
      const hudFrame = sampleFrameAt(traj, tCheck);
      expect(hudFrame).not.toBeNull();

      expect(hudFrame!.stage1.altitudeM).toBeCloseTo(
        cliSample!.geodetic.altitudeM,
        6
      );
      expect(hudFrame!.stage1.speedEarthRelMs).toBeCloseTo(
        cliSample!.speedAirRelMs,
        6
      );
      expect(hudFrame!.stage1.downrangeM).toBeCloseTo(
        cliSample!.downrangeM,
        6
      );
      expect(hudFrame!.stage1.dynamicPressurePa).toBeCloseTo(
        cliSample!.dynamicPressurePa,
        6
      );
      expect(hudFrame!.stage1.propellantKg).toBeCloseTo(
        cliSample!.dynamic.stage1PropellantKg,
        6
      );
    }

    // Check post-separation Stage 2 & Booster at a sampled post-MECO timestamp
    const s2Sample = cli.stage2Samples[Math.floor(cli.stage2Samples.length / 2)]!;
    const hudS2 = sampleFrameAt(traj, s2Sample.timeS);
    expect(hudS2).not.toBeNull();
    expect(hudS2!.stage2.altitudeM).toBeCloseTo(
      s2Sample.geodetic.altitudeM,
      1
    );
    expect(hudS2!.stage2.speedEarthRelMs).toBeCloseTo(
      s2Sample.speedEarthRelMs,
      1
    );

    const bSample = cli.boosterSamples[Math.floor(cli.boosterSamples.length / 2)]!;
    const hudB = sampleFrameAt(traj, bSample.timeS);
    expect(hudB).not.toBeNull();
    expect(hudB!.stage1.altitudeM).toBeCloseTo(
      bSample.geodetic.altitudeM,
      1
    );
    expect(hudB!.stage1.speedEarthRelMs).toBeCloseTo(
      bSample.speedAirRelMs,
      1
    );
  });

  it('dynamically generates multi-burn stage segments for RTLS without hard-coding', () => {
    const traj = buildMissionTrajectory(
      FALCON9_BLOCK5,
      DEFAULT_LEO_RTLS_MISSION,
      0.5
    );
    const s1Burns = traj.segments.filter(
      (s) => s.stage === 'STAGE1' && s.kind === 'BURN'
    );
    // RTLS Stage 1 must have 4 distinct burns: Ascent, Boostback, Entry, Landing
    expect(s1Burns.length).toBeGreaterThanOrEqual(4);
    expect(traj.events.some((e) => e.type === 'BOOSTBACK_START')).toBe(true);
    expect(traj.events.some((e) => e.type === 'ENTRY_BURN_START')).toBe(true);
    expect(traj.events.some((e) => e.type === 'LANDING_BURN_START')).toBe(true);
  });
});
