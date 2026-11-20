import { runFullMission } from './mission.js';
import type { DispersionConfig, MissionConfig, VehicleConfig } from './types.js';

export interface MonteCarloTrialResult {
  readonly trial: number;
  readonly landed: boolean;
  readonly orbitAchieved: boolean;
  readonly missM: number;
  readonly propRemainingKg: number;
  readonly vzMs: number;
  readonly vhMs: number;
  readonly tiltDeg: number;
  readonly failureReason?: string;
}

export interface MonteCarloSummary {
  readonly missionId: string;
  readonly landingMode: MissionConfig['landingMode'];
  readonly seed: number;
  readonly trials: number;
  readonly landedCount: number;
  readonly successRatePct: number;
  readonly orbitSuccessRatePct: number;
  readonly missP50M: number;
  readonly missP95M: number;
  readonly fuelMarginP5Kg: number;
  readonly fuelMarginP5Pct: number;
  readonly failureBreakdown: Readonly<Record<string, number>>;
  readonly elapsedMs: number;
}

/** Deterministic Mulberry32 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx]!;
}

/**
 * Run a seeded N-trial Monte Carlo dispersion campaign with:
 *   - Thrust ±1.0%
 *   - Isp ±0.5%
 *   - Drag coefficient Cd ±5.0%
 *   - Base wind ±12 m/s + altitude-varying wind gusts ±10 m/s
 *   - Horizontal navigation noise 0.5–2.0 m (1-sigma)
 *   - First-order actuator lag 0.04–0.12 s
 */
export function runMonteCarlo(
  vehicle: VehicleConfig,
  baseMission: MissionConfig,
  trials = 200,
  seed = 42
): MonteCarloSummary {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const results: MonteCarloTrialResult[] = [];
  const failureBreakdown: Record<string, number> = {};

  for (let i = 0; i < trials; i++) {
    const dispersions: DispersionConfig = {
      thrustScale: 1 + uniform(rng, -0.01, 0.01),
      ispScale: 1 + uniform(rng, -0.005, 0.005),
      cdScale: 1 + uniform(rng, -0.05, 0.05),
      windGustEastMs: uniform(rng, -10, 10),
      windGustNorthMs: uniform(rng, -10, 10),
      windGustPhaseRad: uniform(rng, 0, Math.PI * 2),
      navNoiseM: uniform(rng, 0.5, 2.0),
      actuatorLagS: uniform(rng, 0.04, 0.12),
      seed: Math.floor(rng() * 1e9),
    };

    const trialMission: MissionConfig = {
      ...baseMission,
      // Use dt = 0.02 s for fast N=200 batch runs (still RK4) if base dt is 0.01 s
      dtS: 0.02,
      wind: {
        eastMs: baseMission.wind.eastMs + uniform(rng, -12, 12),
        northMs: baseMission.wind.northMs + uniform(rng, -12, 12),
        upMs: baseMission.wind.upMs,
      },
      dispersions,
    };

    const res = runFullMission(vehicle, trialMission, 10.0);
    const landed = res.boosterOutcome === 'LANDED';
    if (!landed) {
      const reason = res.boosterFailureReason ?? 'Unknown';
      const key = reason.split(';')[0]!.replace(/\d+(\.\d+)?/g, 'X').trim();
      failureBreakdown[key] = (failureBreakdown[key] ?? 0) + 1;
    }

    results.push({
      trial: i + 1,
      landed,
      orbitAchieved: res.orbitAchieved,
      missM: res.boosterFinal.distanceToTargetM,
      propRemainingKg: res.boosterFinal.dynamic.propellantKg,
      vzMs: res.boosterFinal.verticalSpeedMs,
      vhMs: res.boosterFinal.horizontalSpeedMs,
      tiltDeg: res.boosterFinal.tiltFromVerticalDeg,
      failureReason: res.boosterFailureReason,
    });
  }

  const landedCount = results.filter((r) => r.landed).length;
  const orbitCount = results.filter((r) => r.orbitAchieved).length;
  const misses = results.map((r) => r.missM).sort((a, b) => a - b);
  const props = results.map((r) => r.propRemainingKg).sort((a, b) => a - b);
  const fuelMarginP5Kg = percentile(props, 5);

  return {
    missionId: baseMission.id,
    landingMode: baseMission.landingMode,
    seed,
    trials,
    landedCount,
    successRatePct: (landedCount / trials) * 100,
    orbitSuccessRatePct: (orbitCount / trials) * 100,
    missP50M: percentile(misses, 50),
    missP95M: percentile(misses, 95),
    fuelMarginP5Kg,
    fuelMarginP5Pct: (fuelMarginP5Kg / vehicle.stage1.propellantMassKg) * 100,
    failureBreakdown,
    elapsedMs: performance.now() - t0,
  };
}
