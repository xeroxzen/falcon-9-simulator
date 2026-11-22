import {
  computePathAtmosphere,
  evaluateAcoustics,
  type AcousticInputs,
  type AcousticOutputs,
} from './acoustics.js';

export interface SoundDebugState {
  readonly hasAudioContext: boolean;
  readonly contextState: string;
  readonly muted: boolean;
  readonly continuousMuted: boolean;
  readonly graphNodesBuilt: number;
  readonly oneShotsFired: number;
  readonly lastOutputs: AcousticOutputs | null;
}

export interface SoundEventTriggers {
  readonly simTimeS: number;
  readonly playing: boolean;
  readonly playbackSpeed: number;
  readonly mecoTimeS: number;
  readonly stageSepTimeS: number;
  /** True when booster is descending supersonically toward listener (Mach > 1.05, alt < 12 km). */
  readonly boosterSupersonicDescent: boolean;
  /** Current booster altitude (m) & distance to listener (m) for sonic boom arrival. */
  readonly boosterAltM: number;
  readonly distanceToListenerM: number;
  readonly airTransmission: number;
}

function createNoiseBuffer(
  ctx: AudioContext,
  seconds: number,
  kind: 'brown' | 'pink' | 'crackle' | 'white'
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  // Deterministic LCG PRNG for reproducible, zero-allocation synthesis
  let seed = kind === 'brown' ? 101 : kind === 'pink' ? 202 : kind === 'crackle' ? 303 : 404;
  const nextRand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.035 * nextRand()) / 1.035;
      data[i] = Math.max(-1, Math.min(1, last * 4.2));
    }
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = nextRand();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11));
      b6 = w * 0.115926;
    }
  } else if (kind === 'crackle') {
    // High-crest-factor supersonic exhaust shock-cell crackle (asymmetrical impulses)
    for (let i = 0; i < len; i++) {
      const r = nextRand();
      const abs = Math.abs(r);
      data[i] = abs > 0.92 ? Math.sign(r) * Math.pow((abs - 0.92) / 0.08, 1.4) : r * 0.06;
    }
  } else {
    for (let i = 0; i < len; i++) {
      data[i] = nextRand() * 0.65;
    }
  }

  // Crossfade last 2048 samples into first 2048 samples for click-free looping
  const fade = Math.min(2048, Math.floor(len / 8));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    data[i] = data[i]! * a + data[len - fade + i]! * (1 - a);
  }
  return buf;
}

class Falcon9SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = true;
  private graphNodesBuilt = 0;
  private oneShotsFired = 0;
  private lastOutputs: AcousticOutputs | null = null;

  // Persistent audio graph nodes (built ONCE on first unmute, zero per-frame allocation)
  private masterGain: GainNode | null = null;
  private distFilter: BiquadFilterNode | null = null;
  private rumbleSrc: AudioBufferSourceNode | null = null;
  private rumbleGain: GainNode | null = null;
  private roarSrc: AudioBufferSourceNode | null = null;
  private roarFilter: BiquadFilterNode | null = null;
  private roarGain: GainNode | null = null;
  private crackleSrc: AudioBufferSourceNode | null = null;
  private crackleGain: GainNode | null = null;
  private onboardOsc: OscillatorNode | null = null;
  private onboardGain: GainNode | null = null;
  private aeroGain: GainNode | null = null;

  // Persistent one-shot impulse bus (envelope-modulated persistent noise + sub-osc, zero node creation!)
  private oneShotNoiseGain: GainNode | null = null;
  private oneShotFilter: BiquadFilterNode | null = null;
  private boomOsc: OscillatorNode | null = null;
  private boomGain: GainNode | null = null;

  // Real-time event crossing tracker (prevents firing one-shots on scrub/seek)
  private prevSimTimeS: number | null = null;
  private boomArmed = false;
  private boomFired = false;
  private lifecycleBound = false;

  // Dev-only live Web Audio capture destination (used by __f9debug in E2E recording)
  private captureDest: MediaStreamAudioDestinationNode | null = null;

  /**
   * Dev-only: tap the live masterGain bus into a MediaStreamAudioDestinationNode
   * so MediaRecorder can capture authentic Web Audio output from the running app.
   */
  public getCaptureAudioStream(): MediaStream | null {
    if (!this.ctx || !this.masterGain) return null;
    if (!this.captureDest) {
      this.captureDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.captureDest);
    }
    return this.captureDest.stream;
  }

  /**
   * Called synchronously from the user's Unmute / Mute button click or tap.
   * Creates and resumes AudioContext strictly on first unmute (iOS/Safari compliant).
   */
  public setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;

    if (!nextMuted) {
      if (!this.ctx) {
        this.initGraph();
      }
      if (this.ctx) {
        const st = this.ctx.state as string;
        if (st === 'suspended' || st === 'interrupted') {
          void this.ctx.resume().catch(() => {});
        }
      }
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(nextMuted ? 0 : 0.82, now, 0.03);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private initGraph(): void {
    if (typeof window === 'undefined' || this.ctx) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.muted ? 0 : 0.82;
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    // Shared atmospheric distance absorption LPF
    const distFilter = ctx.createBiquadFilter();
    distFilter.type = 'lowpass';
    distFilter.frequency.value = 3_500;
    distFilter.Q.value = 0.7;
    distFilter.connect(masterGain);
    this.distFilter = distFilter;

    // 1. Deep sub-bass rumble (brown noise -> 140 Hz LPF)
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = createNoiseBuffer(ctx, 4.0, 'brown');
    rumbleSrc.loop = true;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 160;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(distFilter);
    rumbleSrc.start();
    this.rumbleSrc = rumbleSrc;
    this.rumbleGain = rumbleGain;

    // 2. Broadband rocket jet roar (pink noise -> 480 Hz bandpass)
    const roarSrc = ctx.createBufferSource();
    roarSrc.buffer = createNoiseBuffer(ctx, 4.0, 'pink');
    roarSrc.loop = true;
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.value = 460;
    roarFilter.Q.value = 0.65;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0;
    roarSrc.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(distFilter);
    roarSrc.start();
    this.roarSrc = roarSrc;
    this.roarFilter = roarFilter;
    this.roarGain = roarGain;

    // 3. Supersonic shock-cell crackle (high-crest impulses -> 1800 Hz bandpass)
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = createNoiseBuffer(ctx, 4.0, 'crackle');
    crackleSrc.loop = true;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1_850;
    crackleFilter.Q.value = 0.8;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0;
    crackleSrc.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(distFilter);
    crackleSrc.start();
    this.crackleSrc = crackleSrc;
    this.crackleGain = crackleGain;

    // 4. Onboard muffled structure-borne vibration (55 Hz triangle -> 220 Hz LPF)
    const onboardOsc = ctx.createOscillator();
    onboardOsc.type = 'triangle';
    onboardOsc.frequency.value = 54;
    const onboardFilter = ctx.createBiquadFilter();
    onboardFilter.type = 'lowpass';
    onboardFilter.frequency.value = 210;
    const onboardGain = ctx.createGain();
    onboardGain.gain.value = 0;
    onboardOsc.connect(onboardFilter);
    onboardFilter.connect(onboardGain);
    onboardGain.connect(masterGain);
    onboardOsc.start();
    this.onboardOsc = onboardOsc;
    this.onboardGain = onboardGain;

    // 5. Aerodynamic buffeting & pad water deluge spray hiss (routed through distance LPF)
    const aeroSrc = ctx.createBufferSource();
    aeroSrc.buffer = createNoiseBuffer(ctx, 4.0, 'white');
    aeroSrc.loop = true;
    const aeroFilter = ctx.createBiquadFilter();
    aeroFilter.type = 'bandpass';
    aeroFilter.frequency.value = 1_450;
    aeroFilter.Q.value = 0.55;
    const aeroGain = ctx.createGain();
    aeroGain.gain.value = 0;
    aeroSrc.connect(aeroFilter);
    aeroFilter.connect(aeroGain);
    aeroGain.connect(distFilter);
    aeroSrc.start();
    this.aeroGain = aeroGain;

    // 6. Persistent one-shot impulse & N-wave sonic boom channel (zero per-event node creation)
    const oneShotSrc = ctx.createBufferSource();
    oneShotSrc.buffer = createNoiseBuffer(ctx, 2.0, 'pink');
    oneShotSrc.loop = true;
    const oneShotFilter = ctx.createBiquadFilter();
    oneShotFilter.type = 'lowpass';
    oneShotFilter.frequency.value = 220;
    const oneShotNoiseGain = ctx.createGain();
    oneShotNoiseGain.gain.value = 0;
    oneShotSrc.connect(oneShotFilter);
    oneShotFilter.connect(oneShotNoiseGain);
    oneShotNoiseGain.connect(masterGain);
    oneShotSrc.start();
    this.oneShotFilter = oneShotFilter;
    this.oneShotNoiseGain = oneShotNoiseGain;

    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.value = 46;
    const boomGain = ctx.createGain();
    boomGain.gain.value = 0;
    boomOsc.connect(boomGain);
    boomGain.connect(masterGain);
    boomOsc.start();
    this.boomOsc = boomOsc;
    this.boomGain = boomGain;

    // Fixed node count (built once, never incremented per frame)
    this.graphNodesBuilt = 22;

    // iOS/Safari interrupted/suspended lifecycle handling
    if (!this.lifecycleBound && typeof document !== 'undefined') {
      this.lifecycleBound = true;
      const resumeIfUnmuted = () => {
        if (!this.muted && this.ctx) {
          const st = this.ctx.state as string;
          if (st === 'suspended' || st === 'interrupted') {
            void this.ctx.resume().catch(() => {});
          }
        }
      };
      ctx.addEventListener('statechange', () => {
        if (!this.muted && (ctx.state as string) === 'interrupted') {
          // Will resume automatically on next visibility return or pointer gesture
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeIfUnmuted();
      });
      window.addEventListener('pointerdown', resumeIfUnmuted, { passive: true });
    }
  }

  /**
   * Update continuous acoustic parameters in-place (zero node allocations) and
   * fire one-shot events ONLY on real-time playback crossings (never on scrub/seek).
   */
  public update(inputs: AcousticInputs, events: SoundEventTriggers): AcousticOutputs {
    const out = evaluateAcoustics(inputs);
    this.lastOutputs = out;

    const prevT = this.prevSimTimeS;
    this.prevSimTimeS = events.simTimeS;

    // Reset sonic boom arming if scrubbed before descent
    if (prevT !== null && Math.abs(events.simTimeS - prevT) > 1.5) {
      this.boomArmed = false;
      this.boomFired = false;
    }

    if (!this.ctx || this.muted) {
      return out;
    }

    const now = this.ctx.currentTime;
    const tau = 0.04;

    this.distFilter!.frequency.setTargetAtTime(out.lpfCutoffHz, now, tau);
    this.rumbleGain!.gain.setTargetAtTime(out.rumbleGain, now, tau);
    this.roarGain!.gain.setTargetAtTime(out.roarGain, now, tau);
    this.crackleGain!.gain.setTargetAtTime(out.crackleGain, now, tau);
    this.onboardGain!.gain.setTargetAtTime(out.onboardGain, now, tau);
    this.aeroGain!.gain.setTargetAtTime(out.aeroGain, now, tau);

    // Doppler shift on noise playback rates & roar center frequency
    const dop = out.dopplerRatio;
    this.rumbleSrc!.playbackRate.setTargetAtTime(Math.max(0.5, Math.min(1.6, dop)), now, tau);
    this.roarSrc!.playbackRate.setTargetAtTime(Math.max(0.55, Math.min(1.8, dop)), now, tau);
    this.roarFilter!.frequency.setTargetAtTime(460 * dop, now, tau);
    this.crackleSrc!.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(1.7, dop)), now, tau);
    this.onboardOsc!.frequency.setTargetAtTime(48 + inputs.throttle * 18, now, tau);

    // One-shot events: fire ONLY during real-time forward playback (<= 2x), NEVER on scrub/seek
    const dtSim = prevT !== null ? events.simTimeS - prevT : 0;
    const isRealtimeStep =
      events.playing && events.playbackSpeed <= 2.0 && dtSim > 0 && dtSim < 0.35;

    if (isRealtimeStep && prevT !== null) {
      const crossed = (tEv: number) => prevT < tEv && events.simTimeS >= tEv;
      const delay = out.delayS;

      if (crossed(-3.0) && out.airTransmission > 0.05) {
        this.triggerThump(now + delay, 0.55 * out.airTransmission, 160, 0.28);
      }
      if (crossed(0.0) && out.airTransmission > 0.05) {
        // Hold-down clamp release metallic thump
        this.triggerThump(now + delay, 0.45 * out.airTransmission, 520, 0.14);
      }
      if (crossed(events.mecoTimeS)) {
        // MECO structural thump (audible onboard even in vacuum, or close external)
        const lvl = inputs.isOnboard ? 0.35 : 0.3 * out.airTransmission;
        if (lvl > 0.02) this.triggerThump(now + delay, lvl, 140, 0.22);
      }
      if (crossed(events.stageSepTimeS)) {
        const lvl = inputs.isOnboard ? 0.3 : 0.25 * out.airTransmission;
        if (lvl > 0.02) this.triggerThump(now + delay, lvl, 280, 0.16);
      }

      // RTLS / ASDS Double Sonic Boom (arm during supersonic descent, fire on acoustic arrival)
      if (events.boosterSupersonicDescent && events.boosterAltM < 12_000) {
        this.boomArmed = true;
      }
      if (
        this.boomArmed &&
        !this.boomFired &&
        !inputs.isOnboard &&
        events.boosterAltM < 4_200 &&
        events.airTransmission > 0.2
      ) {
        this.boomFired = true;
        const { speedOfSoundMs } = computePathAtmosphere(events.boosterAltM, inputs.listenerAltM);
        const boomDelay = Math.min(2.5, events.distanceToListenerM / speedOfSoundMs);
        const boomLevel = Math.min(0.88, (1 / (1 + events.distanceToListenerM / 2_800)) * 0.9);
        this.triggerDoubleSonicBoom(now + boomDelay * 0.25, boomLevel);
      }
    }

    return out;
  }

  private triggerThump(when: number, level: number, cutoffHz: number, decayS: number): void {
    if (!this.oneShotNoiseGain || !this.oneShotFilter) return;
    this.oneShotFilter.frequency.setValueAtTime(cutoffHz, when);
    this.oneShotNoiseGain.gain.cancelScheduledValues(when);
    this.oneShotNoiseGain.gain.setValueAtTime(0.0001, when);
    this.oneShotNoiseGain.gain.linearRampToValueAtTime(level, when + 0.015);
    this.oneShotNoiseGain.gain.exponentialRampToValueAtTime(0.0001, when + decayS);
    this.oneShotsFired++;
  }

  private triggerDoubleSonicBoom(when: number, level: number): void {
    if (!this.boomGain || !this.boomOsc || !this.oneShotNoiseGain || !this.oneShotFilter) return;
    // Iconic Falcon 9 double N-wave sonic boom (aft octaweb + forward nose/grid-fins, ~120 ms apart)
    for (const offset of [0, 0.125]) {
      const t0 = when + offset;
      this.boomOsc.frequency.setValueAtTime(62, t0);
      this.boomOsc.frequency.exponentialRampToValueAtTime(28, t0 + 0.16);
      this.boomGain.gain.setValueAtTime(0.0001, t0);
      this.boomGain.gain.linearRampToValueAtTime(level, t0 + 0.008);
      this.boomGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);

      this.oneShotFilter.frequency.setValueAtTime(190, t0);
      this.oneShotNoiseGain.gain.setValueAtTime(0.0001, t0);
      this.oneShotNoiseGain.gain.linearRampToValueAtTime(level * 0.72, t0 + 0.01);
      this.oneShotNoiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    }
    this.oneShotsFired++;
  }

  public getDebugState(): SoundDebugState {
    return {
      hasAudioContext: this.ctx !== null,
      contextState: this.ctx ? (this.ctx.state as string) : 'none',
      muted: this.muted,
      continuousMuted: this.lastOutputs?.continuousMuted ?? true,
      graphNodesBuilt: this.graphNodesBuilt,
      oneShotsFired: this.oneShotsFired,
      lastOutputs: this.lastOutputs,
    };
  }
}

export const soundEngine = new Falcon9SoundEngine();
