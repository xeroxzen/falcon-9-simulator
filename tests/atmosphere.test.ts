import { describe, expect, it } from 'vitest';
import { sampleAtmosphere } from '../src/sim/models/atmosphere.js';

/**
 * Spot checks against US Standard Atmosphere 1976 (NOAA-S/T 76-1562) tables.
 * Reference values at geometric altitudes (m).
 */
const US76_SPOT_CHECKS: readonly {
  readonly altM: number;
  readonly tempK: number;
  readonly pressurePa: number;
  readonly densityKgM3: number;
  readonly speedOfSoundMs: number;
}[] = [
  { altM: 0, tempK: 288.15, pressurePa: 101_325, densityKgM3: 1.225, speedOfSoundMs: 340.29 },
  { altM: 11_000, tempK: 216.77, pressurePa: 22_699, densityKgM3: 0.3648, speedOfSoundMs: 295.15 },
  { altM: 20_000, tempK: 216.65, pressurePa: 5_529.3, densityKgM3: 0.08891, speedOfSoundMs: 295.07 },
  { altM: 32_000, tempK: 228.49, pressurePa: 889.06, densityKgM3: 0.013555, speedOfSoundMs: 303.03 },
  { altM: 47_000, tempK: 269.68, pressurePa: 115.97, densityKgM3: 0.0014975, speedOfSoundMs: 329.21 },
  { altM: 51_000, tempK: 270.65, pressurePa: 70.656, densityKgM3: 0.0009095, speedOfSoundMs: 329.80 },
  { altM: 71_000, tempK: 216.85, pressurePa: 4.480, densityKgM3: 0.00007197, speedOfSoundMs: 295.21 },
  { altM: 86_000, tempK: 186.95, pressurePa: 0.37338, densityKgM3: 6.958e-6, speedOfSoundMs: 274.10 },
];

describe('US Standard Atmosphere 1976', () => {
  for (const ref of US76_SPOT_CHECKS) {
    it(`matches US76 table at ${(ref.altM / 1000).toFixed(0)} km`, () => {
      const s = sampleAtmosphere(ref.altM);
      expect(Math.abs(s.temperatureK - ref.tempK) / ref.tempK).toBeLessThan(0.005);
      expect(Math.abs(s.pressurePa - ref.pressurePa) / ref.pressurePa).toBeLessThan(0.015);
      expect(Math.abs(s.densityKgM3 - ref.densityKgM3) / ref.densityKgM3).toBeLessThan(0.015);
      expect(Math.abs(s.speedOfSoundMs - ref.speedOfSoundMs) / ref.speedOfSoundMs).toBeLessThan(0.005);
    });
  }

  it('decays monotonically above 86 km and reaches vacuum at 200 km', () => {
    const s86 = sampleAtmosphere(86_000);
    const s100 = sampleAtmosphere(100_000);
    const s150 = sampleAtmosphere(150_000);
    const s200 = sampleAtmosphere(200_000);

    expect(s100.densityKgM3).toBeLessThan(s86.densityKgM3);
    expect(s150.densityKgM3).toBeLessThan(s100.densityKgM3);
    expect(s150.densityKgM3).toBeGreaterThan(0);
    expect(s200.densityKgM3).toBe(0);
    expect(s200.pressurePa).toBe(0);
  });
});
