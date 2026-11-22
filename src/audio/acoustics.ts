import { sampleAtmosphere } from '../sim/models/atmosphere.js';
import type { Vec3 } from '../sim/types.js';

export interface AcousticInputs {
  /** Source position in local ENU meters (x=E, y=N, z=U). */
  readonly sourcePosEnuM: Vec3;
  /** Source velocity in local ENU m/s. */
  readonly sourceVelEnuMs: Vec3;
  /** Listener (active camera) position in local ENU meters. */
  readonly listenerPosEnuM: Vec3;
  /** Listener velocity in local ENU m/s. */
  readonly listenerVelEnuMs: Vec3;
  /** Source altitude above sea level (m). */
  readonly sourceAltM: number;
  /** Listener altitude above sea level (m). */
  readonly listenerAltM: number;
  /** True when camera is mounted directly on the vehicle (structure-borne sound). */
  readonly isOnboard: boolean;
  /** Current playback speed multiplier (continuous audio muted when > 2). */
  readonly playbackSpeed: number;
  /** Whether playback is currently advancing. */
  readonly playing: boolean;
  /** Engine throttle [0..1] (at retarded time for external cameras). */
  readonly throttle: number;
  /** Active engine count (e.g. 9 for S1 ascent, 3 for entry, 1 for landing/MVac). */
  readonly activeEngineCount: number;
  /** Dynamic pressure q (Pa) for aerodynamic buffeting roar. */
  readonly dynamicPressurePa: number;
  /** Pre-launch deluge spray intensity [0..1] at pad. */
  readonly delugeIntensity: number;
}

export interface AcousticOutputs {
  /** Path-averaged US76 speed of sound (m/s). */
  readonly speedOfSoundMs: number;
  /** Acoustic propagation delay d / c_avg (s). */
  readonly delayS: number;
  /** Straight-line source-to-listener distance (m). */
  readonly distanceM: number;
  /** Doppler frequency ratio [0.55..1.85]. */
  readonly dopplerRatio: number;
  /** Air-density transmission factor [0..1] (0 in vacuum for external cameras). */
  readonly airTransmission: number;
  /** Atmospheric absorption low-pass cutoff frequency (Hz). */
  readonly lpfCutoffHz: number;
  /** Continuous gains [0..1] for each persistent audio bus. */
  readonly rumbleGain: number;
  readonly roarGain: number;
  readonly crackleGain: number;
  readonly onboardGain: number;
  readonly aeroGain: number;
  /** True when continuous engine audio is suppressed (paused or speed > 2x). */
  readonly continuousMuted: boolean;
}

const SEA_LEVEL_DENSITY = 1.225;

/**
 * Compute harmonic-mean US76 speed of sound and average air density along the
 * 3-point vertical acoustic path between source and listener.
 */
export function computePathAtmosphere(
  sourceAltM: number,
  listenerAltM: number
): { speedOfSoundMs: number; avgDensityKgM3: number } {
  const h0 = Math.max(0, sourceAltM);
  const h1 = Math.max(0, listenerAltM);
  const hMid = 0.5 * (h0 + h1);

  const a0 = sampleAtmosphere(h0);
  const aMid = sampleAtmosphere(hMid);
  const a1 = sampleAtmosphere(h1);

  // Harmonic mean speed of sound (exact for 1D travel time integral dz / c(z))
  const c0 = Math.max(240, a0.speedOfSoundMs);
  const cMid = Math.max(240, aMid.speedOfSoundMs);
  const c1 = Math.max(240, a1.speedOfSoundMs);
  const speedOfSoundMs = 3 / (1 / c0 + 1 / cMid + 1 / c1);

  // Geometric-weighted density so vacuum at either endpoint cuts off airborne sound
  const minRho = Math.min(a0.densityKgM3, a1.densityKgM3);
  const meanRho = (a0.densityKgM3 + aMid.densityKgM3 + a1.densityKgM3) / 3;
  const avgDensityKgM3 = Math.sqrt(Math.max(0, minRho * meanRho));

  return { speedOfSoundMs, avgDensityKgM3 };
}

/**
 * Pure physically-based acoustic synthesis parameters for Falcon 9 launch & landing.
 *
 * - Listener = active camera (primary pane in Split View)
 * - Speed of sound from US76 atmosphere model along the path (never hardcoded 343 m/s)
 * - Continuous engine audio rendered ONLY at playbackSpeed <= 2 (muted above 2x)
 * - Silent in vacuum for external cameras; muffled structure-borne vibration for onboard cameras
 */
export function evaluateAcoustics(inp: AcousticInputs): AcousticOutputs {
  const dx = inp.listenerPosEnuM.x - inp.sourcePosEnuM.x;
  const dy = inp.listenerPosEnuM.y - inp.sourcePosEnuM.y;
  const dz = inp.listenerPosEnuM.z - inp.sourcePosEnuM.z;
  const distanceM = Math.hypot(dx, dy, dz);

  const { speedOfSoundMs, avgDensityKgM3 } = computePathAtmosphere(
    inp.sourceAltM,
    inp.listenerAltM
  );
  const delayS = inp.isOnboard ? 0 : distanceM / speedOfSoundMs;

  // Radial approach velocity (positive when source moves toward listener)
  let dopplerRatio = 1.0;
  if (!inp.isOnboard && distanceM > 1.0) {
    const ux = dx / distanceM;
    const uy = dy / distanceM;
    const uz = dz / distanceM;
    const vr =
      (inp.sourceVelEnuMs.x - inp.listenerVelEnuMs.x) * ux +
      (inp.sourceVelEnuMs.y - inp.listenerVelEnuMs.y) * uy +
      (inp.sourceVelEnuMs.z - inp.listenerVelEnuMs.z) * uz;
    const denom = Math.max(80, speedOfSoundMs - vr);
    dopplerRatio = Math.min(1.85, Math.max(0.55, speedOfSoundMs / denom));
  }

  // Air-density transmission (drops cleanly to 0 in vacuum above ~75-85 km)
  const densityRatio = Math.min(1, Math.max(0, avgDensityKgM3 / SEA_LEVEL_DENSITY));
  const airTransmission =
    densityRatio < 1e-4 ? 0 : Math.pow(densityRatio, 0.55);

  // Atmospheric high-frequency absorption LPF: crisp close-up, deep bassy rumble far away
  const lpfCutoffHz = inp.isOnboard
    ? 240
    : Math.max(110, Math.min(8_500, 7_200 / (1 + Math.pow(distanceM / 360, 1.25))));

  const continuousMuted = !inp.playing || inp.playbackSpeed > 2.0;
  if (continuousMuted) {
    return {
      speedOfSoundMs,
      delayS,
      distanceM,
      dopplerRatio,
      airTransmission,
      lpfCutoffHz,
      rumbleGain: 0,
      roarGain: 0,
      crackleGain: 0,
      onboardGain: 0,
      aeroGain: 0,
      continuousMuted: true,
    };
  }

  // Engine acoustic power scales smoothly with active engine count (log-like) & throttle
  const engineFactor =
    inp.activeEngineCount > 0 && inp.throttle > 0.01
      ? Math.min(1.0, (0.38 + 0.62 * Math.sqrt(inp.activeEngineCount / 9)) * Math.pow(inp.throttle, 0.7))
      : 0;

  if (inp.isOnboard) {
    // Structure-borne muffled vibration (audible even in vacuum for MVac / S1)
    const onboardGain = engineFactor * 0.42;
    const aeroQ = Math.min(1, inp.dynamicPressurePa / 32_000);
    const aeroGain = aeroQ * airTransmission * 0.25;
    return {
      speedOfSoundMs,
      delayS: 0,
      distanceM: 0,
      dopplerRatio: 1.0,
      airTransmission,
      lpfCutoffHz,
      rumbleGain: onboardGain * 0.45,
      roarGain: 0,
      crackleGain: 0,
      onboardGain,
      aeroGain,
      continuousMuted: false,
    };
  }

  // External camera: inverse-distance spreading + air-density vacuum cutoff
  const distAtten = 1 / (1 + distanceM / 95);
  const externalLevel = engineFactor * distAtten * airTransmission;

  // Signature Falcon 9 rocket crackle is strongest at sea level & close-to-mid distance
  const crackleDist = 1 / (1 + Math.pow(distanceM / 650, 1.4));
  const rumbleGain = Math.min(0.85, externalLevel * 0.85);
  const roarGain = Math.min(0.75, externalLevel * 0.72);
  const crackleGain = Math.min(0.65, engineFactor * crackleDist * airTransmission * 0.58);

  // Aero buffeting (Max-Q / reentry) + pad water deluge spray hiss
  const aeroQ = Math.min(1, inp.dynamicPressurePa / 32_000);
  const delugeAtten = 1 / (1 + distanceM / 120);
  const aeroGain = Math.min(
    0.45,
    (aeroQ * distAtten * airTransmission * 0.35) +
      (inp.delugeIntensity * delugeAtten * airTransmission * 0.22)
  );

  return {
    speedOfSoundMs,
    delayS,
    distanceM,
    dopplerRatio,
    airTransmission,
    lpfCutoffHz,
    rumbleGain,
    roarGain,
    crackleGain,
    onboardGain: 0,
    aeroGain,
    continuousMuted: false,
  };
}
