import { describe, expect, it } from 'vitest';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import { DEFAULT_LEO_ASDS_MISSION } from '../src/sim/config/missions.js';
import { runAscentToMeco } from '../src/sim/simulation.js';

describe('Deterministic replay', () => {
  it('produces bit-identical trajectories and events across repeated runs', () => {
    const run1 = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 5.0);
    const run2 = runAscentToMeco(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 5.0);

    expect(run1.events).toEqual(run2.events);
    expect(run1.samples.length).toBe(run2.samples.length);
    expect(run1.finalState.timeS).toBe(run2.finalState.timeS);
    expect(run1.finalState.dynamic.positionEci).toEqual(
      run2.finalState.dynamic.positionEci
    );
    expect(run1.finalState.dynamic.velocityEci).toEqual(
      run2.finalState.dynamic.velocityEci
    );
    expect(run1.finalState.dynamic.stage1PropellantKg).toBe(
      run2.finalState.dynamic.stage1PropellantKg
    );
    expect(run1.peakDynamicPressurePa).toBe(run2.peakDynamicPressurePa);
  });
});
