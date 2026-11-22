import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
} from '../src/sim/config/missions.js';
import {
  defaultWhatIfPitchKickDeg,
  MISSION_CLASS_SCHEDULES,
  selectMissionClassSchedule,
  solveMissionPitchKickDeg,
} from '../src/sim/guidance/mission-design.js';
import { runAscentToMeco } from '../src/sim/simulation.js';

describe('Stage 1 ascent through MECO', () => {
  it('reaches realistic max-Q and MECO conditions for LC-39A ASDS mission', () => {
    const res = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 5.0);
    const f = res.finalState;

    expect(f.phase).toBe('MECO');
    // MECO time typically ~145-165 s for Falcon 9 ASDS
    expect(f.timeS).toBeGreaterThan(140);
    expect(f.timeS).toBeLessThan(170);

    // MECO altitude typically ~60-85 km
    expect(f.geodetic.altitudeM).toBeGreaterThan(55_000);
    expect(f.geodetic.altitudeM).toBeLessThan(95_000);

    // MECO air-relative speed typically ~2,000-2,600 m/s (~7,200-9,360 km/h)
    expect(f.speedAirRelMs).toBeGreaterThan(1_900);
    expect(f.speedAirRelMs).toBeLessThan(2_700);

    // Max-Q typically ~25-45 kPa around T+60-85 s
    expect(res.peakDynamicPressurePa).toBeGreaterThan(20_000);
    expect(res.peakDynamicPressurePa).toBeLessThan(50_000);
    expect(res.peakDynamicPressureTimeS).toBeGreaterThan(55);
    expect(res.peakDynamicPressureTimeS).toBeLessThan(95);

    // Axial acceleration cap respected
    expect(res.peakAxialAccelG).toBeLessThanOrEqual(
      FALCON9_BLOCK5.maxAxialAccelG + 0.05
    );
  });

  it('reaches earlier MECO with higher propellant reserve for RTLS mission', () => {
    const asds = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 10.0);
    const rtls = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_RTLS_MISSION, 10.0);

    expect(rtls.finalState.phase).toBe('MECO');
    expect(rtls.finalState.timeS).toBeLessThan(asds.finalState.timeS);
    expect(rtls.finalState.dynamic.stage1PropellantKg).toBeGreaterThan(
      asds.finalState.dynamic.stage1PropellantKg
    );
  });

  it('handles an engine-out event honestly (longer burn, 8 active engines, lower MECO altitude)', () => {
    const nominal = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 10.0);
    const engineOut = runAscentToMeco(
      FALCON9_BLOCK5,
      {
        ...DEFAULT_LEO_ASDS_MISSION,
        engineOuts: [{ timeS: 40, engineIndex: 2 }],
      },
      10.0
    );

    expect(engineOut.events.some((e) => e.type === 'ENGINE_OUT')).toBe(true);
    // Mid-burn sample after T+40s has 8 active engines and 1 failed engine
    const midBurn = engineOut.samples.find((s) => s.timeS === 60);
    expect(midBurn).toBeDefined();
    expect(midBurn!.engines.filter((e) => e.active).length).toBe(8);
    expect(midBurn!.engines.filter((e) => e.failed).length).toBe(1);

    // Lower TWR -> longer burn to consume same propellant and flatter, lower-altitude trajectory
    expect(engineOut.finalState.timeS).toBeGreaterThan(nominal.finalState.timeS);
    expect(engineOut.finalState.geodetic.altitudeM).toBeLessThan(
      nominal.finalState.geodetic.altitudeM
    );
  });

  it('solves default ASDS and RTLS mission-design pitch kicks + RTLS reserve and maps What-If profile defaults', () => {
    const asds = solveMissionPitchKickDeg(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION);
    expect(asds.feasible).toBe(true);
    expect(asds.orbitAchieved).toBe(true);
    expect(asds.boosterOutcome).toBe('LANDED');
    expect(asds.pitchKickAngleDeg).toBeCloseTo(
      DEFAULT_LEO_ASDS_MISSION.guidance.pitchKickAngleDeg,
      2
    );

    const rtls = solveMissionPitchKickDeg(FALCON9_BLOCK5, DEFAULT_LEO_RTLS_MISSION);
    expect(rtls.feasible).toBe(true);
    expect(rtls.orbitAchieved).toBe(true);
    expect(rtls.boosterOutcome).toBe('LANDED');
    expect(rtls.pitchKickAngleDeg).toBeCloseTo(
      DEFAULT_LEO_RTLS_MISSION.guidance.pitchKickAngleDeg,
      2
    );
    expect(rtls.mecoPropellantReserveFraction).toBeCloseTo(
      DEFAULT_LEO_RTLS_MISSION.guidance.mecoPropellantReserveFraction,
      3
    );

    const exp = solveMissionPitchKickDeg(FALCON9_BLOCK5, {
      ...DEFAULT_LEO_ASDS_MISSION,
      landingMode: 'EXPENDABLE',
    });
    expect(exp.pitchKickAngleDeg).toBeCloseTo(1.3, 2);
    expect(exp.mecoPropellantReserveFraction).toBeCloseTo(0.005, 4);

    expect(defaultWhatIfPitchKickDeg(200_000)).toBeCloseTo(1.3, 2);
    expect(defaultWhatIfPitchKickDeg(625_000)).toBeCloseTo(1.7, 2);
    expect(defaultWhatIfPitchKickDeg(200_000, true)).toBeCloseTo(2.45, 2);

    expect(selectMissionClassSchedule(200_000)).toEqual(MISSION_CLASS_SCHEDULES.LEO);
    expect(selectMissionClassSchedule(625_000)).toEqual(MISSION_CLASS_SCHEDULES.LEO);
    expect(selectMissionClassSchedule(35_786_000)).toEqual(MISSION_CLASS_SCHEDULES.GTO);
    expect(selectMissionClassSchedule(200_000, true)).toEqual(MISSION_CLASS_SCHEDULES.GTO);
  }, 60_000);

  it('executes T-60 s pre-launch countdown, T-3 s hold-down clamp ignition spool-up, and full-thrust clamp release at T=0', () => {
    const res = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 0.5);
    expect(res.samples[0]!.timeS).toBeCloseTo(-60, 6);
    expect(res.samples[0]!.phase).toBe('PAD');
    expect(res.samples[0]!.thrustN).toBe(0);
    expect(res.samples[0]!.axialAccelG).toBe(0);

    const ignEv = res.events.find((e) => e.type === 'IGNITION');
    const liftEv = res.events.find((e) => e.type === 'LIFTOFF');
    expect(ignEv).toBeDefined();
    expect(ignEv!.timeS).toBeCloseTo(-3.0, 2);
    expect(liftEv).toBeDefined();
    expect(liftEv!.timeS).toBe(0);

    // At T-0.5 s (full-thrust hold-down check): thrust at 100%, vehicle still clamped (0 g, 0 speed)
    const holdDown = res.samples.find((s) => Math.abs(s.timeS - -0.5) < 0.05);
    expect(holdDown).toBeDefined();
    expect(holdDown!.phase).toBe('IGNITION');
    expect(holdDown!.throttle).toBeCloseTo(1.0, 3);
    expect(holdDown!.thrustN).toBeGreaterThan(7_000_000);
    expect(holdDown!.axialAccelG).toBe(0);
    expect(holdDown!.speedAirRelMs).toBeLessThan(0.1);

    // At T=0 clamp release: full propellant load and 100% thrust, positive axial acceleration
    const t0 = res.samples.find((s) => s.timeS === 0);
    expect(t0).toBeDefined();
    expect(t0!.dynamic.stage1PropellantKg).toBeCloseTo(
      FALCON9_BLOCK5.stage1.propellantMassKg,
      0
    );
    expect(t0!.throttle).toBe(1.0);
    expect(t0!.axialAccelG).toBeGreaterThan(1.2);
  });
});
