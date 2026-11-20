import fs from 'node:fs';
import path from 'node:path';
import { G0 } from '../sim/config/constants.js';

export interface RawTelemetryJson {
  readonly time: readonly number[];
  readonly velocity: readonly number[];
  readonly altitude: readonly number[];
}

export interface TelemetryEventsJson {
  readonly maxq?: number | null;
  readonly throttle_down_start?: number | null;
  readonly throttle_down_end?: number | null;
  readonly meco?: number | null;
  readonly boostback_start?: number | null;
  readonly boostback_end?: number | null;
  readonly apogee?: number | null;
  readonly entry_start?: number | null;
  readonly entry_end?: number | null;
  readonly landing_start?: number | null;
  readonly landing_end?: number | null;
  readonly ses1?: number | null;
  readonly seco1?: number | null;
  readonly ses2?: number | null;
  readonly seco2?: number | null;
}

/** Normalized SI telemetry point (m, m/s, s). */
export interface TelemetryPointSI {
  readonly timeS: number;
  readonly velocityMs: number;
  readonly altitudeM: number;
}

export interface CleanedSeries {
  readonly rawCount: number;
  readonly droppedOutliers: number;
  readonly samples1Hz: readonly TelemetryPointSI[];
}

export interface LoadedMissionTelemetry {
  readonly missionName: string;
  readonly missionDir: string;
  readonly stage1: CleanedSeries | null;
  readonly stage2: CleanedSeries | null;
  readonly events: TelemetryEventsJson | null;
}

/**
 * Clean 30 fps OCR webcast telemetry and resample to 1 Hz in SI units:
 *  - Converts altitude from km to m (velocity is already m/s, time is s).
 *  - Drops non-finite values and physically impossible OCR jumps:
 *      |dv| > max(25 m/s, 15 * g0 * dt)
 *      |dh| > max(5,000 m, 15,000 m/s * dt)
 *    Floor thresholds (25 m/s, 5 km) prevent false rejection of integer
 *    webcast display rounding steps (1 km/h or 1 km at 30 fps).
 *  - Resamples the cleaned monotonic series to exact 1 Hz via linear interpolation.
 */
export function cleanAndResampleTelemetry(
  raw: RawTelemetryJson,
  maxAccelG = 15.0
): CleanedSeries {
  const n = Math.min(raw.time.length, raw.velocity.length, raw.altitude.length);
  const maxDvPerSec = maxAccelG * G0; // ~147.1 m/s^2
  const maxDhPerSec = 15_000.0; // generous upper bound for orbital/reentry vertical rate

  const cleaned: TelemetryPointSI[] = [];
  let droppedOutliers = 0;

  // Build initial list of finite, in-bounds points in SI
  const candidates: TelemetryPointSI[] = [];
  for (let i = 0; i < n; i++) {
    const t = raw.time[i];
    const v = raw.velocity[i];
    const altKm = raw.altitude[i];
    if (
      t === undefined ||
      v === undefined ||
      altKm === undefined ||
      !Number.isFinite(t) ||
      !Number.isFinite(v) ||
      !Number.isFinite(altKm) ||
      t < 0 ||
      v < 0 ||
      v > 12_000 ||
      altKm < -0.5 ||
      altKm > 2_000
    ) {
      droppedOutliers++;
      continue;
    }
    candidates.push({
      timeS: t,
      velocityMs: v,
      altitudeM: Math.max(0, altKm * 1000.0),
    });
  }

  // Sort by time in case of out-of-order frames
  candidates.sort((a, b) => a.timeS - b.timeS);

  // Robust jump filter with consecutive-rejection recovery (handles real gaps)
  let consecutiveRejects = 0;
  for (let i = 0; i < candidates.length; i++) {
    const cur = candidates[i]!;
    if (cleaned.length === 0) {
      cleaned.push(cur);
      continue;
    }
    const prev = cleaned[cleaned.length - 1]!;
    const dt = cur.timeS - prev.timeS;
    if (dt <= 0) {
      // Duplicate timestamp: skip
      continue;
    }

    const maxAllowedDv = Math.max(25.0, maxDvPerSec * dt);
    const maxAllowedDh = Math.max(5_000.0, maxDhPerSec * dt);
    const dv = Math.abs(cur.velocityMs - prev.velocityMs);
    const dh = Math.abs(cur.altitudeM - prev.altitudeM);

    if (dv > maxAllowedDv || dh > maxAllowedDh) {
      consecutiveRejects++;
      // If 20+ consecutive frames agree on a new level (e.g. after a webcast cut),
      // accept the transition instead of dropping the rest of the flight.
      if (consecutiveRejects >= 20) {
        cleaned.push(cur);
        consecutiveRejects = 0;
      } else {
        droppedOutliers++;
      }
      continue;
    }

    consecutiveRejects = 0;
    cleaned.push(cur);
  }

  if (cleaned.length < 2) {
    return { rawCount: n, droppedOutliers, samples1Hz: cleaned };
  }

  // Resample to exact 1 Hz integer seconds using linear interpolation
  const tStart = Math.ceil(cleaned[0]!.timeS);
  const tEnd = Math.floor(cleaned[cleaned.length - 1]!.timeS);
  const samples1Hz: TelemetryPointSI[] = [];

  let idx = 0;
  for (let t = tStart; t <= tEnd; t++) {
    while (idx < cleaned.length - 2 && cleaned[idx + 1]!.timeS < t) {
      idx++;
    }
    const p0 = cleaned[idx]!;
    const p1 = cleaned[idx + 1]!;
    if (t < p0.timeS || t > p1.timeS) continue;

    // Skip interpolating across large telemetry blackout gaps (>10 s)
    const span = p1.timeS - p0.timeS;
    if (span > 10.0) continue;

    const alpha = span > 1e-9 ? (t - p0.timeS) / span : 0;
    samples1Hz.push({
      timeS: t,
      velocityMs: p0.velocityMs + alpha * (p1.velocityMs - p0.velocityMs),
      altitudeM: p0.altitudeM + alpha * (p1.altitudeM - p0.altitudeM),
    });
  }

  return {
    rawCount: n,
    droppedOutliers,
    samples1Hz,
  };
}

/**
 * Load and normalize a mission from a shahar603/Telemetry-Data directory.
 */
export function loadMissionTelemetry(
  telemetryRootDir: string,
  missionName: string
): LoadedMissionTelemetry {
  const missionDir = path.join(telemetryRootDir, missionName);
  const jsonDir = path.join(missionDir, 'JSON');

  if (!fs.existsSync(jsonDir)) {
    throw new Error(`Telemetry JSON directory not found: ${jsonDir}`);
  }

  const readJsonIfExists = <T>(fileName: string): T | null => {
    const full = path.join(jsonDir, fileName);
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
  };

  const s1Raw = readJsonIfExists<RawTelemetryJson>('stage1 raw.json');
  const s2Raw = readJsonIfExists<RawTelemetryJson>('stage2 raw.json');
  const events = readJsonIfExists<TelemetryEventsJson>('events.json');

  return {
    missionName,
    missionDir,
    stage1: s1Raw ? cleanAndResampleTelemetry(s1Raw) : null,
    stage2: s2Raw ? cleanAndResampleTelemetry(s2Raw) : null,
    events,
  };
}
