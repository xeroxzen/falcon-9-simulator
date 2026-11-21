import { runFullMission } from '../mission.js';
import type { MissionConfig, VehicleConfig } from '../types.js';

export type AscentTrajectoryProfile = 'LEO_DIRECT' | 'LEO_TWO_BURN' | 'GTO';

/**
 * Profile-based default pitch-kick angles derived from Part D per-flight MAP fits:
 *  - LEO direct  : 1.30 deg (DM-1 1.28°, CRS-16 1.37°, SAOCOM 1A 1.22°, SSO-A 1.19°)
 *  - LEO two-burn: 1.70 deg (Iridium NEXT 8 1.73°, Iridium NEXT 7 1.71°)
 *  - GTO         : 2.45 deg (Bangabandhu-1 2.51°, Telstar 19V 2.40°, Es'hail-2 2.45°)
 */
export const PROFILE_DEFAULT_PITCH_KICK_DEG: Readonly<
  Record<AscentTrajectoryProfile, number>
> = {
  LEO_DIRECT: 1.3,
  LEO_TWO_BURN: 1.7,
  GTO: 2.45,
};

/**
 * Select a profile-based default pitch-kick angle for What-If missions.
 */
export function defaultWhatIfPitchKickDeg(
  targetOrbitAltitudeM: number,
  isGto = false
): number {
  if (isGto || targetOrbitAltitudeM >= 10_000_000) {
    return PROFILE_DEFAULT_PITCH_KICK_DEG.GTO;
  }
  if (targetOrbitAltitudeM > 250_000) {
    return PROFILE_DEFAULT_PITCH_KICK_DEG.LEO_TWO_BURN;
  }
  return PROFILE_DEFAULT_PITCH_KICK_DEG.LEO_DIRECT;
}

export interface MissionDesignOptions {
  /** Minimum search bound for pitch-kick angle (deg). Default: 1.1 */
  readonly minKickDeg?: number;
  /** Maximum search bound for pitch-kick angle (deg). Default: 2.6 */
  readonly maxKickDeg?: number;
  /** Coarse search step (deg). Default: 0.15 */
  readonly coarseStepDeg?: number;
  /** Fine search step (deg). Default: 0.05 */
  readonly fineStepDeg?: number;
  /** Required nominal booster landing propellant margin (kg) for 3-sigma dispersion buffer. Default: 4,000 ASDS / 7,500 RTLS */
  readonly minBoosterFuelMarginKg?: number;
  /** Maximum allowable aero-descent grid-fin saturation fraction. Default: 0.15 */
  readonly maxGridFinSatFraction?: number;
  /** Integration timestep for solver evaluations (s). Default: 0.05 */
  readonly solverDtS?: number;
}

export interface MissionDesignResult {
  readonly pitchKickAngleDeg: number;
  readonly feasible: boolean;
  readonly orbitAchieved: boolean;
  readonly boosterOutcome: 'LANDED' | 'CRASHED' | 'EXPENDED';
  readonly boosterFuelMarginKg: number;
  readonly stage2FuelMarginKg: number;
  readonly gridFinSatFraction: number;
}

function evaluateCandidate(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  pitchKickAngleDeg: number,
  solverDtS: number
): MissionDesignResult {
  const candidate: MissionConfig = {
    ...mission,
    dtS: solverDtS,
    guidance: {
      ...mission.guidance,
      pitchKickAngleDeg,
    },
  };
  const res = runFullMission(vehicle, candidate, 1.0);
  const aero = res.boosterSamples.filter((s) => s.phase === 'AERO_DESCENT');
  const pinned = aero.filter((s) => Math.abs(s.gridFinDeflectionDeg) >= 19.9);
  const gridFinSatFraction = aero.length > 0 ? pinned.length / aero.length : 0;

  return {
    pitchKickAngleDeg,
    feasible: false,
    orbitAchieved: res.orbitAchieved,
    boosterOutcome: res.boosterOutcome,
    boosterFuelMarginKg: res.boosterFinal.dynamic.propellantKg,
    stage2FuelMarginKg: res.stage2Final.dynamic.propellantKg,
    gridFinSatFraction,
  };
}

/**
 * Mission-design ascent pitch-kick solver (NOT parameter tuning).
 *
 * Given a vehicle and mission specification (payload, target orbit, launch site,
 * landing mode, and required MECO propellant reserve), solves for the pitchover
 * kick angle that achieves the target orbit while satisfying booster recovery
 * fuel margin and grid-fin authority constraints. Among feasible kicks, prefers
 * the flattest (most gravity-loss-efficient, highest Stage 2 propellant margin)
 * trajectory that still meets the booster recovery envelope.
 */
export function solveMissionPitchKickDeg(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  options: MissionDesignOptions = {}
): MissionDesignResult {
  const minKick = options.minKickDeg ?? 1.1;
  const maxKick = options.maxKickDeg ?? 2.6;
  const coarseStep = options.coarseStepDeg ?? 0.15;
  const fineStep = options.fineStepDeg ?? 0.05;
  const solverDtS = options.solverDtS ?? 0.05;
  const maxSat = options.maxGridFinSatFraction ?? 0.15;
  const minBoosterFuel =
    options.minBoosterFuelMarginKg ??
    (mission.landingMode === 'RTLS' ? 7_500 : mission.landingMode === 'ASDS' ? 4_000 : 0);

  const isFeasible = (r: MissionDesignResult): boolean => {
    if (!r.orbitAchieved || r.stage2FuelMarginKg <= 0) return false;
    if (mission.landingMode === 'EXPENDABLE') return true;
    return (
      r.boosterOutcome === 'LANDED' &&
      r.boosterFuelMarginKg >= minBoosterFuel &&
      r.gridFinSatFraction <= maxSat
    );
  };

  // 1. Coarse scan over [minKick, maxKick]
  const coarseResults: MissionDesignResult[] = [];
  for (let k = minKick; k <= maxKick + 1e-6; k += coarseStep) {
    const kick = Number(k.toFixed(3));
    const ev = evaluateCandidate(vehicle, mission, kick, solverDtS);
    coarseResults.push({ ...ev, feasible: isFeasible(ev) });
  }

  const feasibleCoarse = coarseResults.filter((r) => r.feasible);
  if (feasibleCoarse.length === 0) {
    // Fallback: pick best candidate by orbit + booster fuel margin
    coarseResults.sort((a, b) => {
      const sa = (a.orbitAchieved ? 1e6 : 0) + (a.boosterOutcome === 'LANDED' ? 1e5 : 0) + a.boosterFuelMarginKg;
      const sb = (b.orbitAchieved ? 1e6 : 0) + (b.boosterOutcome === 'LANDED' ? 1e5 : 0) + b.boosterFuelMarginKg;
      return sb - sa;
    });
    return coarseResults[0]!;
  }

  // Prefer highest Stage 2 margin (most gravity-loss-efficient feasible trajectory)
  feasibleCoarse.sort((a, b) => b.stage2FuelMarginKg - a.stage2FuelMarginKg);
  const bestCoarse = feasibleCoarse[0]!;

  // 2. Local fine refinement around bestCoarse
  let best = bestCoarse;
  const fineLo = Math.max(minKick, bestCoarse.pitchKickAngleDeg - coarseStep);
  const fineHi = Math.min(maxKick, bestCoarse.pitchKickAngleDeg + coarseStep);
  for (let k = fineLo; k <= fineHi + 1e-6; k += fineStep) {
    const kick = Number(k.toFixed(3));
    if (Math.abs(kick - bestCoarse.pitchKickAngleDeg) < 1e-6) continue;
    const ev = evaluateCandidate(vehicle, mission, kick, solverDtS);
    const feas = isFeasible(ev);
    if (feas && ev.stage2FuelMarginKg > best.stage2FuelMarginKg) {
      best = { ...ev, feasible: true };
    }
  }

  return best;
}
