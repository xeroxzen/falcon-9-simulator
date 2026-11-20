import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
} from '../src/sim/config/missions.js';
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
});
