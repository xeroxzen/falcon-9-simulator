import type { AtmosphereSample } from '../types.js';
import {
  AIR_GAMMA,
  AIR_GAS_CONSTANT,
  G0,
  SEA_LEVEL_PRESSURE_PA,
  US76_R0_M,
} from '../config/constants.js';
import { CONSTANTS_REGISTRY as R } from '../config/registry.js';

/**
 * US Standard Atmosphere 1976 (NOAA-S/T 76-1562) up to 86 km geometric altitude,
 * followed by an ASSUMED piecewise exponential tail from 86 km to 200 km.
 *
 * Layer definitions in geopotential altitude H (m):
 *   0:  0 m      -> 11,000 m  (Troposphere,  L = -0.0065 K/m)
 *   1: 11,000 m  -> 20,000 m  (Tropopause,   L =  0.0    K/m)
 *   2: 20,000 m  -> 32,000 m  (Stratosphere, L = +0.0010 K/m)
 *   3: 32,000 m  -> 47,000 m  (Stratosphere, L = +0.0028 K/m)
 *   4: 47,000 m  -> 51,000 m  (Stratopause,  L =  0.0    K/m)
 *   5: 51,000 m  -> 71,000 m  (Mesosphere,   L = -0.0028 K/m)
 *   6: 71,000 m  -> 84,852 m  (Mesosphere,   L = -0.0020 K/m, h = 86 km)
 */

interface Us76Layer {
  readonly baseGeopotentialM: number;
  readonly baseTempK: number;
  readonly lapseRateKPerM: number;
  readonly basePressurePa: number;
}

const RAW_LAYERS: readonly {
  readonly baseGeopotentialM: number;
  readonly baseTempK: number;
  readonly lapseRateKPerM: number;
}[] = R.US76_LAYERS_TABLE.value.map(([baseGeopotentialM, baseTempK, lapseRateKPerM]) => ({
  baseGeopotentialM,
  baseTempK,
  lapseRateKPerM,
}));

function computeLayerPressure(
  pBase: number,
  tBase: number,
  lapse: number,
  dH: number
): number {
  if (Math.abs(lapse) < 1e-12) {
    return pBase * Math.exp((-G0 * dH) / (AIR_GAS_CONSTANT * tBase));
  }
  const t = tBase + lapse * dH;
  const exponent = -G0 / (AIR_GAS_CONSTANT * lapse);
  return pBase * Math.pow(t / tBase, exponent);
}

// Precompute exact base pressures at each layer boundary for continuity
const US76_LAYERS: readonly Us76Layer[] = (() => {
  const layers: Us76Layer[] = [];
  let p = SEA_LEVEL_PRESSURE_PA;
  for (let i = 0; i < RAW_LAYERS.length; i++) {
    const cur = RAW_LAYERS[i]!;
    if (i > 0) {
      const prev = RAW_LAYERS[i - 1]!;
      const dH = cur.baseGeopotentialM - prev.baseGeopotentialM;
      p = computeLayerPressure(p, prev.baseTempK, prev.lapseRateKPerM, dH);
    }
    layers.push({
      baseGeopotentialM: cur.baseGeopotentialM,
      baseTempK: cur.baseTempK,
      lapseRateKPerM: cur.lapseRateKPerM,
      basePressurePa: p,
    });
  }
  return layers;
})();

const TOP_GEOMETRIC_M = R.US76_TOP_GEOMETRIC_M.value;
const TOP_GEOPOTENTIAL_M =
  (US76_R0_M * TOP_GEOMETRIC_M) / (US76_R0_M + TOP_GEOMETRIC_M);

// Precompute reference values at 86 km geometric altitude
const TOP_LAYER = US76_LAYERS[US76_LAYERS.length - 1]!;
const TOP_DH = TOP_GEOPOTENTIAL_M - TOP_LAYER.baseGeopotentialM;
const TEMP_86KM_K = TOP_LAYER.baseTempK + TOP_LAYER.lapseRateKPerM * TOP_DH;
const PRESSURE_86KM_PA = computeLayerPressure(
  TOP_LAYER.basePressurePa,
  TOP_LAYER.baseTempK,
  TOP_LAYER.lapseRateKPerM,
  TOP_DH
);
const DENSITY_86KM = PRESSURE_86KM_PA / (AIR_GAS_CONSTANT * TEMP_86KM_K);

/**
 * ASSUMED exponential scale height above 86 km (approx. 5.8 km in lower thermosphere).
 * Above 200 km, atmospheric density and pressure are treated as vacuum (0).
 */
const UPPER_SCALE_HEIGHT_M = R.ATMO_UPPER_SCALE_HEIGHT_M.value;
const VACUUM_CUTOFF_M = R.ATMO_VACUUM_CUTOFF_M.value;

/**
 * Sample US Standard Atmosphere 1976 at geometric altitude `altitudeM` (meters).
 */
export function sampleAtmosphere(altitudeM: number): AtmosphereSample {
  if (altitudeM >= VACUUM_CUTOFF_M) {
    return {
      temperatureK: TEMP_86KM_K,
      pressurePa: 0,
      densityKgM3: 0,
      speedOfSoundMs: Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * TEMP_86KM_K),
    };
  }

  // Clamp below sea level to 0 m for numerical safety near pad elevation
  const h = Math.max(0, altitudeM);

  if (h > TOP_GEOMETRIC_M) {
    // Exponential continuation above 86 km
    const dh = h - TOP_GEOMETRIC_M;
    const decay = Math.exp(-dh / UPPER_SCALE_HEIGHT_M);
    const pressurePa = PRESSURE_86KM_PA * decay;
    const densityKgM3 = DENSITY_86KM * decay;
    return {
      temperatureK: TEMP_86KM_K,
      pressurePa,
      densityKgM3,
      speedOfSoundMs: Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * TEMP_86KM_K),
    };
  }

  // Geometric to geopotential altitude
  const H = (US76_R0_M * h) / (US76_R0_M + h);

  let layer = US76_LAYERS[0]!;
  for (let i = US76_LAYERS.length - 1; i >= 0; i--) {
    if (H >= US76_LAYERS[i]!.baseGeopotentialM) {
      layer = US76_LAYERS[i]!;
      break;
    }
  }

  const dH = H - layer.baseGeopotentialM;
  const temperatureK = layer.baseTempK + layer.lapseRateKPerM * dH;
  const pressurePa = computeLayerPressure(
    layer.basePressurePa,
    layer.baseTempK,
    layer.lapseRateKPerM,
    dH
  );
  const densityKgM3 = pressurePa / (AIR_GAS_CONSTANT * temperatureK);
  const speedOfSoundMs = Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * temperatureK);

  return {
    temperatureK,
    pressurePa,
    densityKgM3,
    speedOfSoundMs,
  };
}
