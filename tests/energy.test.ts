import { describe, expect, it } from 'vitest';
import {
  EARTH_MU,
  EARTH_RADIUS_EQUATORIAL_M,
} from '../src/sim/config/constants.js';
import { rk4Step, type Rk4Space } from '../src/sim/integrator.js';
import { addScaled, normSq } from '../src/sim/math.js';
import {
  gravitationalAccelerationEci,
  specificGravitationalPotential,
} from '../src/sim/models/gravity.js';
import type { Vec3 } from '../src/sim/types.js';

interface OrbitState {
  readonly r: Vec3;
  readonly v: Vec3;
}

function integrateOrbit(
  initial: OrbitState,
  durationS: number,
  dt: number,
  enableJ2: boolean
): OrbitState {
  const space: Rk4Space<OrbitState, { dr: Vec3; dv: Vec3 }> = {
    derivative(_t, s) {
      return {
        dr: s.v,
        dv: gravitationalAccelerationEci(s.r, enableJ2),
      };
    },
    addScaled(s, d, sc) {
      return {
        r: addScaled(s.r, d.dr, sc),
        v: addScaled(s.v, d.dv, sc),
      };
    },
    combine(s, k1, k2, k3, k4, h) {
      const c = h / 6;
      return {
        r: {
          x: s.r.x + c * (k1.dr.x + 2 * k2.dr.x + 2 * k3.dr.x + k4.dr.x),
          y: s.r.y + c * (k1.dr.y + 2 * k2.dr.y + 2 * k3.dr.y + k4.dr.y),
          z: s.r.z + c * (k1.dr.z + 2 * k2.dr.z + 2 * k3.dr.z + k4.dr.z),
        },
        v: {
          x: s.v.x + c * (k1.dv.x + 2 * k2.dv.x + 2 * k3.dv.x + k4.dv.x),
          y: s.v.y + c * (k1.dv.y + 2 * k2.dv.y + 2 * k3.dv.y + k4.dv.y),
          z: s.v.z + c * (k1.dv.z + 2 * k2.dv.z + 2 * k3.dv.z + k4.dv.z),
        },
      };
    },
  };

  let state = initial;
  const steps = Math.round(durationS / dt);
  for (let i = 0; i < steps; i++) {
    state = rk4Step(i * dt, state, dt, space);
  }
  return state;
}

describe('Orbital energy conservation (thrust = 0, drag = 0)', () => {
  it('conserves two-body specific orbital energy over a full inclined elliptical orbit', () => {
    const rPeri = EARTH_RADIUS_EQUATORIAL_M + 200_000;
    const vPeri = 8_100; // slightly elliptical LEO
    const incRad = (51.6 * Math.PI) / 180;

    const initial: OrbitState = {
      r: { x: rPeri, y: 0, z: 0 },
      v: { x: 0, y: vPeri * Math.cos(incRad), z: vPeri * Math.sin(incRad) },
    };

    const e0 =
      0.5 * normSq(initial.v) + specificGravitationalPotential(initial.r, false);

    // One full orbit (~5,500 s) with dt = 0.5 s
    const finalState = integrateOrbit(initial, 5_500, 0.5, false);
    const e1 =
      0.5 * normSq(finalState.v) +
      specificGravitationalPotential(finalState.r, false);

    const relDrift = Math.abs(e1 - e0) / Math.abs(e0);
    expect(relDrift).toBeLessThan(1e-9);
  });

  it('conserves total specific energy with J2 perturbation enabled', () => {
    const r0 = EARTH_RADIUS_EQUATORIAL_M + 250_000;
    const vCirc = Math.sqrt(EARTH_MU / r0);
    const incRad = (51.6 * Math.PI) / 180;

    const initial: OrbitState = {
      r: { x: r0, y: 0, z: 0 },
      v: { x: 0, y: vCirc * Math.cos(incRad), z: vCirc * Math.sin(incRad) },
    };

    const e0 =
      0.5 * normSq(initial.v) + specificGravitationalPotential(initial.r, true);
    const finalState = integrateOrbit(initial, 5_400, 0.5, true);
    const e1 =
      0.5 * normSq(finalState.v) +
      specificGravitationalPotential(finalState.r, true);

    const relDrift = Math.abs(e1 - e0) / Math.abs(e0);
    expect(relDrift).toBeLessThan(1e-9);
  });
});
