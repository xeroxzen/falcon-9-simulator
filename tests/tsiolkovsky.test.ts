import { describe, expect, it } from 'vitest';
import { G0 } from '../src/sim/config/constants.js';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import { rk4Step, type Rk4Space } from '../src/sim/integrator.js';
import { evaluateStagePropulsion } from '../src/sim/models/propulsion.js';

interface VacuumBurnState {
  readonly v: number;
  readonly propKg: number;
}

describe('Tsiolkovsky rocket equation validation', () => {
  it('matches analytic vacuum delta-v via RK4 integration of Stage 1 propulsion', () => {
    const stage = FALCON9_BLOCK5.stage1;
    const dryMassKg = 140_000; // stage + upper stack
    const initialPropKg = 350_000;
    const m0 = dryMassKg + initialPropKg;

    const dt = 0.01;
    let state: VacuumBurnState = { v: 0, propKg: initialPropKg };
    let t = 0;

    // Burn for 100 s (well before propellant exhaustion)
    const steps = 10_000;
    const space: Rk4Space<VacuumBurnState, { dv: number; dProp: number }> = {
      derivative(time, s) {
        const prop = evaluateStagePropulsion(
          stage,
          1.0,
          0, // vacuum
          time,
          s.propKg,
          []
        );
        const mass = dryMassKg + s.propKg;
        return {
          dv: prop.totalThrustN / mass,
          dProp: -prop.totalMassFlowKgS,
        };
      },
      addScaled(s, d, sc) {
        return {
          v: s.v + d.dv * sc,
          propKg: s.propKg + d.dProp * sc,
        };
      },
      combine(s, k1, k2, k3, k4, h) {
        const c = h / 6;
        return {
          v: s.v + c * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv),
          propKg: s.propKg + c * (k1.dProp + 2 * k2.dProp + 2 * k3.dProp + k4.dProp),
        };
      },
    };

    for (let i = 0; i < steps; i++) {
      state = rk4Step(t, state, dt, space);
      t += dt;
    }

    const mf = dryMassKg + state.propKg;
    const expectedDeltaV = stage.engine.ispVacuumS * G0 * Math.log(m0 / mf);
    const relError = Math.abs(state.v - expectedDeltaV) / expectedDeltaV;

    expect(mf).toBeGreaterThan(dryMassKg);
    expect(relError).toBeLessThan(1e-7);
  });

  it('produces exact sea-level and vacuum thrust totals and handles engine-out', () => {
    const stage = FALCON9_BLOCK5.stage1;

    const sl = evaluateStagePropulsion(stage, 1.0, 101_325, 0, 100_000, []);
    expect(sl.totalThrustN).toBeCloseTo(7_607_000, -1);
    expect(sl.activeEngineCount).toBe(9);

    const vac = evaluateStagePropulsion(stage, 1.0, 0, 0, 100_000, []);
    expect(vac.totalThrustN).toBeCloseTo(8_227_000, -1);
    expect(vac.effectiveIspS).toBeCloseTo(311.0, 6);

    const eo = evaluateStagePropulsion(stage, 1.0, 0, 50, 100_000, [
      { timeS: 40, engineIndex: 3 },
    ]);
    expect(eo.activeEngineCount).toBe(8);
    expect(eo.totalThrustN).toBeCloseTo((8 / 9) * 8_227_000, -1);
  });
});
