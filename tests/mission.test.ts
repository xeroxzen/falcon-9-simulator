import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
} from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';

describe('Full Falcon 9 mission (Stage 2 to orbit + Booster recovery)', () => {
  it('inserts Stage 2 into ~200 km LEO (incl < 0.05 deg) and lands booster within 10 m on ASDS', () => {
    const res = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 5.0);

    expect(res.orbitAchieved).toBe(true);
    expect(res.orbit.perigeeAltitudeM).toBeGreaterThan(170_000);
    expect(res.orbit.apogeeAltitudeM).toBeLessThan(240_000);
    expect(res.orbit.eccentricity).toBeLessThan(0.02);
    expect(Math.abs(res.orbit.inclinationDeg - 51.6)).toBeLessThan(0.05);

    expect(res.boosterOutcome).toBe('LANDED');
    expect(Math.abs(res.boosterFinal.verticalSpeedMs)).toBeLessThan(2.0);
    expect(res.boosterFinal.horizontalSpeedMs).toBeLessThan(1.0);
    expect(res.boosterFinal.tiltFromVerticalDeg).toBeLessThan(5.0);
    expect(res.boosterFinal.distanceToTargetM).toBeLessThan(10.0);
    expect(res.boosterFinal.dynamic.propellantKg).toBeGreaterThan(0);
  });

  it('inserts Stage 2 into LEO (incl < 0.05 deg) and lands booster within 15 m at LZ-1 with realistic RTLS profile', () => {
    const res = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_RTLS_MISSION, 5.0);

    expect(res.orbitAchieved).toBe(true);
    expect(Math.abs(res.orbit.inclinationDeg - 28.6)).toBeLessThan(0.05);
    expect(res.events.some((e) => e.type === 'BOOSTBACK_START')).toBe(true);
    expect(res.events.some((e) => e.type === 'ENTRY_BURN_START')).toBe(true);
    expect(res.events.some((e) => e.type === 'LANDING_BURN_START')).toBe(true);

    // Realistic RTLS profile check (compare SAOCOM 1A: apogee 134 km, land 467 s; CRS-12: 118 km, 466 s)
    const apogeeEv = res.events.find((e) => e.type === 'APOGEE');
    expect(apogeeEv).toBeDefined();
    expect(apogeeEv!.altitudeM).toBeLessThan(165_000);
    expect(res.boosterFinal.timeS).toBeLessThan(530);

    expect(res.boosterOutcome).toBe('LANDED');
    expect(Math.abs(res.boosterFinal.verticalSpeedMs)).toBeLessThan(2.0);
    expect(res.boosterFinal.horizontalSpeedMs).toBeLessThan(1.0);
    expect(res.boosterFinal.tiltFromVerticalDeg).toBeLessThan(5.0);
    expect(res.boosterFinal.distanceToTargetM).toBeLessThan(15.0);
  });

  it('completes DM-1 mission with accurate orbit inclination and pinpoint ASDS booster landing', () => {
    const res = runFullMission(FALCON9_BLOCK5, DM1_MISSION, 5.0);

    expect(res.orbitAchieved).toBe(true);
    expect(Math.abs(res.orbit.inclinationDeg - 51.66)).toBeLessThan(0.05);
    expect(res.stage2Final.fairingAttached).toBe(false);
    expect(res.boosterOutcome).toBe('LANDED');
    expect(Math.abs(res.boosterFinal.verticalSpeedMs)).toBeLessThan(2.0);
    expect(res.boosterFinal.horizontalSpeedMs).toBeLessThan(1.0);
    expect(res.boosterFinal.tiltFromVerticalDeg).toBeLessThan(5.0);
    expect(res.boosterFinal.distanceToTargetM).toBeLessThan(10.0);
  });
});
