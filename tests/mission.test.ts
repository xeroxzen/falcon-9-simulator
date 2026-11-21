import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
  IRIDIUM_NEXT_8_MISSION,
  SAOCOM_1A_MISSION,
} from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';

describe('Full Falcon 9 mission (Stage 2 to orbit + Booster recovery)', () => {
  it('inserts Stage 2 into ~200 km LEO (incl < 0.05 deg) and lands booster within 10 m on ASDS', () => {
    const res = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 5.0);

    expect(res.orbitAchieved).toBe(true);
    expect(Math.abs(res.orbit.perigeeAltitudeM - 200_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(res.orbit.apogeeAltitudeM - 200_000)).toBeLessThanOrEqual(5_000);
    expect(res.orbit.eccentricity).toBeLessThan(0.002);
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
    expect(Math.abs(res.orbit.perigeeAltitudeM - 200_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(res.orbit.apogeeAltitudeM - 200_000)).toBeLessThanOrEqual(5_000);
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
    expect(Math.abs(res.orbit.perigeeAltitudeM - 198_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(res.orbit.apogeeAltitudeM - 198_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(res.orbit.inclinationDeg - 51.66)).toBeLessThan(0.05);
    expect(res.stage2Final.fairingAttached).toBe(false);
    expect(res.boosterOutcome).toBe('LANDED');
    expect(Math.abs(res.boosterFinal.verticalSpeedMs)).toBeLessThan(2.0);
    expect(res.boosterFinal.horizontalSpeedMs).toBeLessThan(1.0);
    expect(res.boosterFinal.tiltFromVerticalDeg).toBeLessThan(5.0);
    expect(res.boosterFinal.distanceToTargetM).toBeLessThan(10.0);
    expect(res.events.some((e) => e.type === 'SES_2')).toBe(false);
  });

  it('executes sourced TWO_BURN Hohmann on Iridium NEXT 8 (625 km polar) and DIRECT lofted insertion on SAOCOM 1A (620 km SSO)', () => {
    const ir = runFullMission(FALCON9_BLOCK5, IRIDIUM_NEXT_8_MISSION, 5.0);
    expect(ir.orbitAchieved).toBe(true);
    expect(ir.events.some((e) => e.type === 'SECO_1')).toBe(true);
    expect(ir.events.some((e) => e.type === 'SES_2')).toBe(true);
    expect(ir.events.some((e) => e.type === 'SECO_2')).toBe(true);
    expect(Math.abs(ir.orbit.perigeeAltitudeM - 625_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(ir.orbit.apogeeAltitudeM - 625_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(ir.orbit.inclinationDeg - 86.6)).toBeLessThan(0.05);

    const sa = runFullMission(FALCON9_BLOCK5, SAOCOM_1A_MISSION, 5.0);
    expect(sa.orbitAchieved).toBe(true);
    expect(sa.events.some((e) => e.type === 'SECO_1')).toBe(true);
    expect(sa.events.some((e) => e.type === 'SES_2')).toBe(false);
    expect(sa.events.some((e) => e.type === 'SECO_2')).toBe(false);
    expect(Math.abs(sa.orbit.perigeeAltitudeM - 620_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(sa.orbit.apogeeAltitudeM - 620_000)).toBeLessThanOrEqual(5_000);
    expect(Math.abs(sa.orbit.inclinationDeg - 97.89)).toBeLessThan(0.05);
    expect(sa.boosterOutcome).toBe('LANDED');
  });
});
