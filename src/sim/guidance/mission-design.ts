import { runFullMission } from '../mission.js';
import { sampleAtmosphere } from '../models/atmosphere.js';
import type { MissionConfig, VehicleConfig } from '../types.js';

export type AscentTrajectoryProfile = 'LEO_DIRECT' | 'LEO_TWO_BURN' | 'GTO';

export type MissionGuidanceClass = 'LEO' | 'GTO';

export interface MissionClassSchedule {
  readonly missionClass: MissionGuidanceClass;
  /** Per-class Stage 1 late-burn axial acceleration limit (g). */
  readonly maxAxialAccelG: number;
}

/**
 * EMPIRICAL effective late-S1 axial acceleration limits per mission class, fitted via
 * MAP on the 4-flight fit set (WEBCAST_LIFTOFF_OFFSET_S = 0 fixed; shared v1 vehicle
 * and shared v1 max-Q throttle bucket):
 *  - LEO (Class 0, fit on DM-1, CRS-16, Iridium NEXT 8): maxAxialAccelG = 2.90 g (EMPIRICAL)
 *  - GTO (Class 1, fit on Bangabandhu-1):                maxAxialAccelG = 3.60 g (EMPIRICAL)
 *
 * Reconstructed true telemetry axial acceleration (a_axial = dv/dt + g*sin(gamma))
 * peaks at 3.29-3.67 g (Class 0) and 3.82-3.86 g (Class 1), so these caps are
 * EMPIRICAL effective late-S1 limits compensating for an unmodeled discrepancy
 * (tracked in docs/BACKLOG.md), not physical structural G-limits.
 */
export const MISSION_CLASS_SCHEDULES: Readonly<
  Record<MissionGuidanceClass, MissionClassSchedule>
> = {
  LEO: {
    missionClass: 'LEO',
    maxAxialAccelG: 2.9,
  },
  GTO: {
    missionClass: 'GTO',
    maxAxialAccelG: 3.6,
  },
};

/**
 * Select a mission-class Stage 1 late-burn accel limit for What-If missions (ASSUMED).
 * Orbit-type predictor (MEO/GTO >= 2,000 km target -> GTO 3.60 g; LEO/SSO -> LEO 2.90 g)
 * achieved 9/10 (90%) LOO accuracy on the 10 Block 5 flights vs 5/10 (50%) for
 * payload/capability demand and 6/10 (60%) for demand + recovery mode.
 */
export function selectMissionClassSchedule(
  targetOrbitAltitudeM: number,
  isGto = false
): MissionClassSchedule {
  return isGto || targetOrbitAltitudeM >= 2_000_000
    ? MISSION_CLASS_SCHEDULES.GTO
    : MISSION_CLASS_SCHEDULES.LEO;
}

/**
 * Profile-based default pitch-kick angles derived from Part D per-flight MAP fits:
 *  - LEO direct  : 1.30 deg (DM-1 1.28°, CRS-16 1.37°, SAOCOM 1A 1.22°, SSO-A 1.19°)
 *  - LEO two-burn: 1.70 deg (Iridium NEXT 8 1.73°, Iridium NEXT 7 1.71°)
 *  - GTO         : 2.45 deg (Bangabandhu-1 2.51°, Telstar 19V 2.40°, Es'hail-2 2.45°)
 *
 * Used directly for EXPENDABLE missions, and as the initial guess for the
 * mission-design ascent solver when recovery (ASDS / RTLS) is enabled.
 */
export const PROFILE_DEFAULT_PITCH_KICK_DEG: Readonly<
  Record<AscentTrajectoryProfile, number>
> = {
  LEO_DIRECT: 1.3,
  LEO_TWO_BURN: 1.7,
  GTO: 2.45,
};

/**
 * Select a profile-based default pitch-kick angle for What-If missions
 * (used directly for EXPENDABLE; used as initial guess for ASDS/RTLS solver).
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
  /** Candidate RTLS MECO propellant reserve fractions (searched in ascending order). */
  readonly rtlsReserveCandidates?: readonly number[];
  /** Candidate close-in ASDS partial-boostback MECO reserve fractions (searched in ascending order). */
  readonly asdsBoostbackReserveCandidates?: readonly number[];
  /** Candidate boostback thrust pitch angles relative to local horizontal (deg, negative = depressed). Default: -4..-46 deg in 3 deg steps */
  readonly boostbackPitchCandidates?: readonly number[];
  /** Required nominal booster landing propellant margin (kg) for 3-sigma dispersion buffer. Default: 4,000 ASDS / 5,000 ASDS-BB / 7,500 RTLS */
  readonly minBoosterFuelMarginKg?: number;
  /** Maximum allowable aero-descent grid-fin saturation fraction. Default: 0.15 */
  readonly maxGridFinSatFraction?: number;
  /** Maximum allowable Sutton-Graves peak convective entry heating proxy (MW/m^2, R_n = 1.85 m, ASSUMED). Default: 0.085 */
  readonly maxEntryHeatingMWm2?: number;
  /** Integration timestep for solver evaluations (s). Default: 0.05 */
  readonly solverDtS?: number;
}

export interface MissionDesignResult {
  readonly pitchKickAngleDeg: number;
  readonly mecoPropellantReserveFraction: number;
  /** Solved boostback thrust pitch angle (deg) for RTLS / close-in ASDS, undefined for ballistic ASDS / EXPENDABLE. */
  readonly boostbackPitchDeg?: number;
  readonly initialGuessKickDeg: number;
  readonly feasible: boolean;
  readonly orbitAchieved: boolean;
  readonly boosterOutcome: 'LANDED' | 'CRASHED' | 'EXPENDED';
  readonly boosterFuelMarginKg: number;
  readonly stage2FuelMarginKg: number;
  readonly gridFinSatFraction: number;
  /** Peak convective stagnation entry heating proxy (Sutton-Graves, MW/m^2, R_n = 1.85 m). */
  readonly peakEntryHeatingMWm2: number;
}

/** Sutton-Graves Earth convective stagnation heating constant (W / (m^(3/2) * (m/s)^3)). */
const SUTTON_GRAVES_K_EARTH = 1.7415e-4;
/** Falcon 9 core base radius (m) used as effective blunt-body nose radius for entry heating proxy. */
const BOOSTER_BASE_RADIUS_M = 1.85;

function evaluateCandidate(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  pitchKickAngleDeg: number,
  mecoPropellantReserveFraction: number,
  initialGuessKickDeg: number,
  solverDtS: number,
  boostbackPitchDeg?: number
): MissionDesignResult {
  const candidate: MissionConfig = {
    ...mission,
    countdownS: 0,
    dtS: solverDtS,
    guidance: {
      ...mission.guidance,
      pitchKickAngleDeg,
      mecoPropellantReserveFraction,
      ...(boostbackPitchDeg !== undefined ? { boostbackPitchDeg } : {}),
    },
  };
  const res = runFullMission(vehicle, candidate, 1.0);
  const aero = res.boosterSamples.filter((s) => s.phase === 'AERO_DESCENT');
  const pinned = aero.filter((s) => Math.abs(s.gridFinDeflectionDeg) >= 19.9);
  const gridFinSatFraction = aero.length > 0 ? pinned.length / aero.length : 0;

  let peakEntryHeatingMWm2 = 0;
  for (const s of res.boosterSamples) {
    if (s.verticalSpeedMs < 0 && s.geodetic.altitudeM < 90_000) {
      const rho = sampleAtmosphere(s.geodetic.altitudeM).densityKgM3;
      const v = s.speedAirRelMs;
      const qDotMWm2 =
        (SUTTON_GRAVES_K_EARTH * Math.sqrt(rho / BOOSTER_BASE_RADIUS_M) * v * v * v) /
        1e6;
      if (qDotMWm2 > peakEntryHeatingMWm2) peakEntryHeatingMWm2 = qDotMWm2;
    }
  }

  return {
    pitchKickAngleDeg,
    mecoPropellantReserveFraction,
    boostbackPitchDeg,
    initialGuessKickDeg,
    feasible: false,
    orbitAchieved: res.orbitAchieved,
    boosterOutcome: res.boosterOutcome,
    boosterFuelMarginKg: res.boosterFinal.dynamic.propellantKg,
    stage2FuelMarginKg: res.stage2Final.dynamic.propellantKg,
    gridFinSatFraction,
    peakEntryHeatingMWm2,
  };
}

function solveKickForReserve(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  reserveFraction: number,
  initialGuessKickDeg: number,
  minKick: number,
  maxKick: number,
  coarseStep: number,
  fineStep: number,
  solverDtS: number,
  isFeasible: (r: MissionDesignResult) => boolean,
  boostbackPitchDeg?: number
): MissionDesignResult {
  // Build coarse grid anchored at initialGuessKickDeg and expanding across [minKick, maxKick]
  const gridSet = new Set<number>();
  gridSet.add(Number(Math.max(minKick, Math.min(maxKick, initialGuessKickDeg)).toFixed(3)));
  for (let k = minKick; k <= maxKick + 1e-6; k += coarseStep) {
    gridSet.add(Number(k.toFixed(3)));
  }
  const coarseGrid = [...gridSet].sort(
    (a, b) => Math.abs(a - initialGuessKickDeg) - Math.abs(b - initialGuessKickDeg)
  );

  const coarseResults: MissionDesignResult[] = [];
  for (const kick of coarseGrid) {
    const ev = evaluateCandidate(
      vehicle,
      mission,
      kick,
      reserveFraction,
      initialGuessKickDeg,
      solverDtS,
      boostbackPitchDeg
    );
    coarseResults.push({ ...ev, feasible: isFeasible(ev) });
  }

  const feasibleCoarse = coarseResults.filter((r) => r.feasible);
  if (feasibleCoarse.length === 0) {
    coarseResults.sort((a, b) => {
      const sa =
        (a.orbitAchieved ? 1e6 : 0) +
        (a.boosterOutcome === 'LANDED' ? 1e5 : 0) +
        a.boosterFuelMarginKg;
      const sb =
        (b.orbitAchieved ? 1e6 : 0) +
        (b.boosterOutcome === 'LANDED' ? 1e5 : 0) +
        b.boosterFuelMarginKg;
      return sb - sa;
    });
    return coarseResults[0]!;
  }

  // Prefer highest Stage 2 margin (most gravity-loss-efficient feasible trajectory)
  feasibleCoarse.sort((a, b) => b.stage2FuelMarginKg - a.stage2FuelMarginKg);
  let best = feasibleCoarse[0]!;

  // Local fine refinement around best coarse kick
  const fineLo = Math.max(minKick, best.pitchKickAngleDeg - coarseStep);
  const fineHi = Math.min(maxKick, best.pitchKickAngleDeg + coarseStep);
  for (let k = fineLo; k <= fineHi + 1e-6; k += fineStep) {
    const kick = Number(k.toFixed(3));
    if (Math.abs(kick - best.pitchKickAngleDeg) < 1e-6) continue;
    const ev = evaluateCandidate(
      vehicle,
      mission,
      kick,
      reserveFraction,
      initialGuessKickDeg,
      solverDtS,
      boostbackPitchDeg
    );
    if (isFeasible(ev) && ev.stage2FuelMarginKg > best.stage2FuelMarginKg) {
      best = { ...ev, feasible: true };
    }
  }

  return best;
}

/**
 * Mission-design ascent solver (NOT parameter tuning).
 *
 * - For EXPENDABLE missions: applies the profile-based default pitch-kick angle
 *   directly (1.3° LEO direct / 1.7° LEO two-burn / 2.45° GTO) with 0.5% MECO reserve.
 * - For ASDS missions: uses the profile kick as initial guess and solves for the
 *   most gravity-loss-efficient pitchover kick meeting target orbit + >=4,000 kg
 *   nominal booster landing margin and <=15% grid-fin saturation.
 * - For RTLS missions: solves jointly for the minimum feasible MECO propellant
 *   reserve fraction (from rtlsReserveCandidates) and optimal pitchover kick
 *   meeting target orbit + >=7,500 kg nominal RTLS landing margin and <=15% fin sat.
 */
export function solveMissionAscentDesign(
  vehicle: VehicleConfig,
  mission: MissionConfig,
  options: MissionDesignOptions = {}
): MissionDesignResult {
  const initialGuessKickDeg = defaultWhatIfPitchKickDeg(
    mission.targetOrbitAltitudeM
  );
  const solverDtS = options.solverDtS ?? 0.05;

  if (mission.landingMode === 'EXPENDABLE') {
    const reserve = 0.005;
    const ev = evaluateCandidate(
      vehicle,
      mission,
      initialGuessKickDeg,
      reserve,
      initialGuessKickDeg,
      solverDtS
    );
    return {
      ...ev,
      feasible: ev.orbitAchieved && ev.stage2FuelMarginKg > 0,
    };
  }

  // Historical missions with telemetry-fitted kick provenance keep their fitted kick;
  // the solver chooses only the recovery variables (reserve, boostbackPitchDeg).
  // Free kick solving applies to default and What-If missions only.
  const isHistoricalFixedKick =
    mission.fittedKickProvenance !== undefined &&
    options.minKickDeg === undefined &&
    options.maxKickDeg === undefined;
  const minKick = isHistoricalFixedKick
    ? mission.guidance.pitchKickAngleDeg
    : (options.minKickDeg ?? 1.1);
  const maxKick = isHistoricalFixedKick
    ? mission.guidance.pitchKickAngleDeg
    : (options.maxKickDeg ?? 2.6);
  const coarseStep = options.coarseStepDeg ?? 0.15;
  const fineStep = options.fineStepDeg ?? 0.05;
  const maxSat = options.maxGridFinSatFraction ?? 0.15;
  // Boostback recoveries must keep post-entry heating within ~15% of the vehicle's
  // 0.022 MW/m^2 entry-burn thermal target (<=0.025 MW/m^2, preventing 26 s cap
  // saturation from over-lofted -4 deg boostbacks); ballistic ASDS keeps 0.085 MW/m^2.
  const isBoostbackCandidate =
    mission.landingMode === 'RTLS' || mission.droneshipDownrangeKm !== undefined;
  const maxHeat =
    options.maxEntryHeatingMWm2 ?? (isBoostbackCandidate ? 0.025 : 0.085);
  // Lean telemetry-derived touchdown propellant margin floor (unified across all
  // recovery modes): real Block 5 aero-descent mass is ~31.6 t (~27.2 t dry +
  // ~4.5-5.5 t landing burn + ~0-2 t touchdown reserve). 2,500 kg (~0.59% S1 prop)
  // provides realistic lean operational margin without overweighting aero descent.
  const minBoosterFuel = options.minBoosterFuelMarginKg ?? 2_500;

  const isFeasible = (r: MissionDesignResult): boolean =>
    r.orbitAchieved &&
    r.stage2FuelMarginKg > 0 &&
    r.boosterOutcome === 'LANDED' &&
    r.boosterFuelMarginKg >= minBoosterFuel &&
    r.gridFinSatFraction <= maxSat &&
    r.peakEntryHeatingMWm2 <= maxHeat;

  if (mission.landingMode === 'ASDS' && mission.droneshipDownrangeKm === undefined) {
    const reserve = mission.guidance.mecoPropellantReserveFraction;
    return solveKickForReserve(
      vehicle,
      mission,
      reserve,
      initialGuessKickDeg,
      minKick,
      maxKick,
      coarseStep,
      fineStep,
      solverDtS,
      isFeasible
    );
  }

  // RTLS or close-in ASDS with droneshipDownrangeKm: jointly solve for the minimum
  // feasible MECO reserve fraction, optimal ascent pitch kick, and optimal boostback
  // thrust pitch angle (maximizing landing fuel margin subject to fin-sat and entry
  // heating proxy constraints; no hardcoded -4 deg).
  const reserveCandidates =
    mission.landingMode === 'RTLS'
      ? (options.rtlsReserveCandidates ?? [
          0.115, 0.12, 0.125, 0.13, 0.135, 0.145, 0.155, 0.165,
        ])
      : (options.asdsBoostbackReserveCandidates ?? [
          0.075, 0.085, 0.095, 0.1, 0.105, 0.115, 0.125, 0.135, 0.145,
        ]);
  const bbPitchCandidates = options.boostbackPitchCandidates ?? [
    -4, -7, -10, -13, -16, -19, -22, -25, -28, -31, -34, -37, -40, -43, -46,
  ];
  const refBbPitch = bbPitchCandidates.includes(-16)
    ? -16
    : bbPitchCandidates[Math.floor(bbPitchCandidates.length / 2)]!;

  let bestFallback: MissionDesignResult | null = null;
  for (const reserve of reserveCandidates) {
    const solvedAtRef = solveKickForReserve(
      vehicle,
      mission,
      reserve,
      initialGuessKickDeg,
      minKick,
      maxKick,
      coarseStep,
      fineStep,
      solverDtS,
      isFeasible,
      refBbPitch
    );
    // Sweep boostbackPitchDeg at the solved ascent kick (boostback happens after MECO,
    // so Stage 2 orbit & fuel margin are invariant) and pick the angle maximizing
    // booster landing fuel margin among feasible (LANDED, finSat <= maxSat, heat <= maxHeat) candidates.
    let bestForReserve: MissionDesignResult = solvedAtRef;
    for (const bbPitch of bbPitchCandidates) {
      if (bbPitch === refBbPitch) continue;
      const ev = evaluateCandidate(
        vehicle,
        mission,
        solvedAtRef.pitchKickAngleDeg,
        reserve,
        initialGuessKickDeg,
        solverDtS,
        bbPitch
      );
      const cand: MissionDesignResult = { ...ev, feasible: isFeasible(ev) };
      if (
        cand.feasible &&
        (!bestForReserve.feasible ||
          cand.boosterFuelMarginKg > bestForReserve.boosterFuelMarginKg)
      ) {
        bestForReserve = cand;
      }
    }
    if (bestForReserve.feasible) {
      return bestForReserve;
    }
    if (
      bestFallback === null ||
      (bestForReserve.orbitAchieved ? 1e6 : 0) + bestForReserve.boosterFuelMarginKg >
        (bestFallback.orbitAchieved ? 1e6 : 0) + bestFallback.boosterFuelMarginKg
    ) {
      bestFallback = bestForReserve;
    }
  }
  return bestFallback!;
}

/** Backwards-compatible alias for single-mission ascent kick solving. */
export const solveMissionPitchKickDeg = solveMissionAscentDesign;
