import { describe, expect, it } from 'vitest';
import { computePathAtmosphere, evaluateAcoustics } from '../src/audio/acoustics.js';

describe('Physically-based acoustic model (US76 atmosphere)', () => {
  it('computes US76 path-averaged speed of sound (varies with altitude, not fixed 343 m/s)', () => {
    const sl = computePathAtmosphere(0, 0);
    const strat = computePathAtmosphere(15_000, 0);
    expect(sl.speedOfSoundMs).toBeGreaterThan(338);
    expect(sl.speedOfSoundMs).toBeLessThan(343);
    // Cold tropopause lowers path-averaged speed of sound significantly below sea level
    expect(strat.speedOfSoundMs).toBeLessThan(sl.speedOfSoundMs - 15);
  });

  it('produces realistic acoustic delay, attenuation, and Doppler shift at sea level', () => {
    const approaching = evaluateAcoustics({
      sourcePosEnuM: { x: 0, y: 0, z: 300 },
      sourceVelEnuMs: { x: 0, y: 0, z: -150 },
      listenerPosEnuM: { x: 0, y: 0, z: 0 },
      listenerVelEnuMs: { x: 0, y: 0, z: 0 },
      sourceAltM: 300,
      listenerAltM: 0,
      isOnboard: false,
      playbackSpeed: 1,
      playing: true,
      throttle: 1,
      activeEngineCount: 9,
      dynamicPressurePa: 5_000,
      delugeIntensity: 0,
    });
    const receding = evaluateAcoustics({
      sourcePosEnuM: { x: 0, y: 0, z: 300 },
      sourceVelEnuMs: { x: 0, y: 0, z: 150 },
      listenerPosEnuM: { x: 0, y: 0, z: 0 },
      listenerVelEnuMs: { x: 0, y: 0, z: 0 },
      sourceAltM: 300,
      listenerAltM: 0,
      isOnboard: false,
      playbackSpeed: 1,
      playing: true,
      throttle: 1,
      activeEngineCount: 9,
      dynamicPressurePa: 5_000,
      delugeIntensity: 0,
    });

    expect(approaching.delayS).toBeCloseTo(300 / approaching.speedOfSoundMs, 3);
    expect(approaching.dopplerRatio).toBeGreaterThan(1.3);
    expect(receding.dopplerRatio).toBeLessThan(0.75);
    expect(approaching.rumbleGain).toBeGreaterThan(0.1);
    expect(approaching.crackleGain).toBeGreaterThan(0.1);
  });

  it('is completely silent in vacuum for external cameras, but muffled structure-borne for onboard cameras', () => {
    const externalVac = evaluateAcoustics({
      sourcePosEnuM: { x: 0, y: 0, z: 0 },
      sourceVelEnuMs: { x: 0, y: 0, z: 0 },
      listenerPosEnuM: { x: 50, y: 50, z: 20 },
      listenerVelEnuMs: { x: 0, y: 0, z: 0 },
      sourceAltM: 120_000,
      listenerAltM: 120_020,
      isOnboard: false,
      playbackSpeed: 1,
      playing: true,
      throttle: 1,
      activeEngineCount: 1,
      dynamicPressurePa: 0,
      delugeIntensity: 0,
    });
    expect(externalVac.airTransmission).toBe(0);
    expect(externalVac.rumbleGain).toBe(0);
    expect(externalVac.roarGain).toBe(0);
    expect(externalVac.crackleGain).toBe(0);

    const onboardVac = evaluateAcoustics({
      sourcePosEnuM: { x: 0, y: 0, z: 0 },
      sourceVelEnuMs: { x: 0, y: 0, z: 0 },
      listenerPosEnuM: { x: 0, y: 0, z: 0 },
      listenerVelEnuMs: { x: 0, y: 0, z: 0 },
      sourceAltM: 120_000,
      listenerAltM: 120_000,
      isOnboard: true,
      playbackSpeed: 1,
      playing: true,
      throttle: 1,
      activeEngineCount: 1,
      dynamicPressurePa: 0,
      delugeIntensity: 0,
    });
    expect(onboardVac.onboardGain).toBeGreaterThan(0.15);
    expect(onboardVac.lpfCutoffHz).toBeLessThanOrEqual(250);
  });

  it('mutes continuous engine audio above 2x playback speed (no chipmunk audio)', () => {
    const fast = evaluateAcoustics({
      sourcePosEnuM: { x: 0, y: 0, z: 10 },
      sourceVelEnuMs: { x: 0, y: 0, z: 20 },
      listenerPosEnuM: { x: 0, y: 120, z: 15 },
      listenerVelEnuMs: { x: 0, y: 0, z: 0 },
      sourceAltM: 10,
      listenerAltM: 15,
      isOnboard: false,
      playbackSpeed: 5,
      playing: true,
      throttle: 1,
      activeEngineCount: 9,
      dynamicPressurePa: 1_000,
      delugeIntensity: 1,
    });
    expect(fast.continuousMuted).toBe(true);
    expect(fast.rumbleGain).toBe(0);
    expect(fast.roarGain).toBe(0);
    expect(fast.crackleGain).toBe(0);
    expect(fast.aeroGain).toBe(0);
  });
});
