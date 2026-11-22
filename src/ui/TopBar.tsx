import { ALL_COMPONENTS } from '../content/registry.js';
import {
  AVAILABLE_MISSIONS,
  useSimStore,
  type CameraMode,
  type QualityTier,
} from '../store/simStore.js';
import { useViewport } from './useViewport.js';

const CAMERA_MODES: readonly { id: CameraMode; label: string; short: string }[] = [
  { id: 'chase', label: 'Chase', short: 'Chase' },
  { id: 'orbit', label: 'Free Orbit', short: 'Orbit' },
  { id: 'pad', label: 'Pad', short: 'Pad' },
  { id: 'pad-fixed', label: 'Pad (Fixed)', short: 'PadFix' },
  { id: 'droneship', label: 'LZ / ASDS', short: 'ASDS' },
  { id: 'onboard-s1', label: 'Onboard S1', short: 'S1 Cam' },
  { id: 'onboard-s2', label: 'Onboard S2', short: 'S2 Cam' },
  { id: 'split', label: 'Split View', short: 'Split' },
];

const QUALITY_TIERS: readonly { id: QualityTier; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'med', label: 'Med' },
  { id: 'high', label: 'High' },
];

export function TopBar() {
  const { isPhone, isPhoneLandscape } = useViewport();
  const baseMission = useSimStore((s) => s.baseMission);
  const mission = useSimStore((s) => s.mission);
  const trajectory = useSimStore((s) => s.trajectory);
  const loading = useSimStore((s) => s.loading);
  const cameraMode = useSimStore((s) => s.cameraMode);
  const focusStage = useSimStore((s) => s.focusStage);
  const qualityTier = useSimStore((s) => s.qualityTier);
  const soundMuted = useSimStore((s) => s.soundMuted);
  const mobileControlsHidden = useSimStore((s) => s.mobileControlsHidden);
  const showEngineerPanel = useSimStore((s) => s.showEngineerPanel);
  const showWhatIfPanel = useSimStore((s) => s.showWhatIfPanel);
  const isWhatIfActive = useSimStore((s) => s.isWhatIfActive);
  const showHotspots = useSimStore((s) => s.showHotspots);
  const selectedComponent = useSimStore((s) => s.selectedComponent);
  const runMission = useSimStore((s) => s.runMission);
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  const setFocusStage = useSimStore((s) => s.setFocusStage);
  const setQualityTier = useSimStore((s) => s.setQualityTier);
  const toggleSoundMute = useSimStore((s) => s.toggleSoundMute);
  const toggleEngineerPanel = useSimStore((s) => s.toggleEngineerPanel);
  const toggleWhatIfPanel = useSimStore((s) => s.toggleWhatIfPanel);
  const toggleHotspots = useSimStore((s) => s.toggleHotspots);
  const selectComponent = useSimStore((s) => s.selectComponent);

  const cycleCamera = () => {
    const idx = CAMERA_MODES.findIndex((c) => c.id === cameraMode);
    const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length]!;
    setCameraMode(next.id);
  };

  const cycleQuality = () => {
    const idx = QUALITY_TIERS.findIndex((q) => q.id === qualityTier);
    const next = QUALITY_TIERS[(idx + 1) % QUALITY_TIERS.length]!;
    setQualityTier(next.id);
  };

  if (isPhone) {
    const currentCam = CAMERA_MODES.find((c) => c.id === cameraMode) ?? CAMERA_MODES[0]!;
    const currentQ = QUALITY_TIERS.find((q) => q.id === qualityTier) ?? QUALITY_TIERS[0]!;
    const hiddenCls = mobileControlsHidden ? 'immersive-hidden' : '';
    if (isPhoneLandscape) {
      return (
        <header
          className={`top-bar mobile-top-bar mobile-landscape-bar ${hiddenCls}`}
          data-testid="top-bar"
        >
          <button
            className="mobile-tap-btn active"
            onClick={cycleCamera}
            data-testid="mobile-camera-cycle"
            aria-label={`Cycle camera (current: ${currentCam.label})`}
            title={`Camera: ${currentCam.label}`}
          >
            Cam
          </button>
          <button
            className={`mobile-tap-btn ${showEngineerPanel ? 'active' : ''}`}
            onClick={toggleEngineerPanel}
            data-testid="mobile-eng-btn"
            aria-label="Toggle engineer telemetry drawer"
            title="Engineer telemetry"
          >
            Eng
          </button>
          <button
            className={`mobile-tap-btn ${showWhatIfPanel || isWhatIfActive ? 'active' : ''}`}
            onClick={toggleWhatIfPanel}
            data-testid="whatif-toggle-btn"
            aria-label="Toggle What-If scenarios and mission picker"
            title="What-If & Mission"
          >
            Lab
          </button>
          <button
            className={`mobile-tap-btn ${!soundMuted ? 'active' : ''}`}
            onClick={toggleSoundMute}
            data-testid="sound-toggle-btn"
            aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
            title={soundMuted ? 'Unmute sound' : 'Mute sound'}
          >
            {soundMuted ? '🔇' : '🔊'}
          </button>
          <button
            className="mobile-tap-btn"
            onClick={cycleQuality}
            data-testid="quality-cycle-btn"
            aria-label={`Cycle graphics quality (current: ${currentQ.label})`}
            title={`Quality: ${currentQ.label}`}
          >
            {currentQ.label}
          </button>
        </header>
      );
    }
    return (
      <header className={`top-bar mobile-top-bar ${hiddenCls}`} data-testid="top-bar">
        <button
          className="mobile-tap-btn active"
          onClick={cycleCamera}
          data-testid="mobile-camera-cycle"
          aria-label={`Cycle camera (${currentCam.label})`}
        >
          Cam: {currentCam.short}
        </button>
        <button
          className={`mobile-tap-btn ${showEngineerPanel ? 'active' : ''}`}
          onClick={toggleEngineerPanel}
          data-testid="mobile-eng-btn"
        >
          Eng
        </button>
        <button
          className={`mobile-tap-btn ${showWhatIfPanel || isWhatIfActive ? 'active' : ''}`}
          onClick={toggleWhatIfPanel}
          data-testid="whatif-toggle-btn"
        >
          What-If
        </button>
        <button
          className={`mobile-tap-btn ${!soundMuted ? 'active' : ''}`}
          onClick={toggleSoundMute}
          data-testid="sound-toggle-btn"
          aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
        <button
          className="mobile-tap-btn"
          onClick={cycleQuality}
          data-testid="quality-cycle-btn"
          aria-label={`Quality tier: ${currentQ.label}`}
        >
          Q: {currentQ.label}
        </button>
      </header>
    );
  }

  return (
    <header className="top-bar" data-testid="top-bar">
      <div className="top-bar-group">
        <span className="brand-title">FALCON 9 SIM</span>
        <select
          className="mission-select"
          value={isWhatIfActive ? '__whatif__' : baseMission.id}
          disabled={loading}
          onChange={(e) => {
            const next = AVAILABLE_MISSIONS.find((m) => m.id === e.target.value);
            if (next) runMission(next, false);
          }}
        >
          {isWhatIfActive && (
            <option value="__whatif__">{mission.name}</option>
          )}
          {AVAILABLE_MISSIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {trajectory && !loading && (
          <span className="compute-badge">
            RK4 {trajectory.computeTimeMs.toFixed(0)} ms
          </span>
        )}
      </div>

      <div className="top-bar-group camera-group">
        {CAMERA_MODES.map((c) => (
          <button
            key={c.id}
            className={`pill-btn ${cameraMode === c.id ? 'active' : ''}`}
            onClick={() => setCameraMode(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="top-bar-group">
        <div className="segmented">
          <button
            className={focusStage === 'stage1' ? 'active' : ''}
            onClick={() => setFocusStage('stage1')}
          >
            S1
          </button>
          <button
            className={focusStage === 'stage2' ? 'active' : ''}
            onClick={() => setFocusStage('stage2')}
          >
            S2
          </button>
        </div>
        <select
          className="mission-select inspect-select"
          aria-label="Inspect component"
          value={selectedComponent?.componentId ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            selectComponent(
              val
                ? {
                    componentId: val,
                    engineIndex: val === 'merlin-1d' ? 0 : undefined,
                  }
                : null
            );
          }}
        >
          <option value="">Inspect component…</option>
          {ALL_COMPONENTS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className={`pill-btn ${showWhatIfPanel || isWhatIfActive ? 'active' : ''}`}
          onClick={toggleWhatIfPanel}
          data-testid="whatif-toggle-btn"
        >
          What-If{isWhatIfActive ? ' •' : ''}
        </button>
        <button
          className={`pill-btn ${showHotspots ? 'active' : ''}`}
          onClick={toggleHotspots}
        >
          Hotspots
        </button>
        <button
          className={`pill-btn ${showEngineerPanel ? 'active' : ''}`}
          onClick={toggleEngineerPanel}
        >
          Engineer HUD
        </button>
        <button
          className={`pill-btn ${!soundMuted ? 'active' : ''}`}
          onClick={toggleSoundMute}
          data-testid="sound-toggle-btn"
          aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
          title={soundMuted ? 'Unmute physically-based audio (muted by default)' : 'Mute audio'}
        >
          {soundMuted ? '🔇 Muted' : '🔊 Sound'}
        </button>
        <select
          className="mission-select quality-select"
          aria-label="Graphics quality"
          value={qualityTier}
          onChange={(e) => setQualityTier(e.target.value as QualityTier)}
          data-testid="quality-select"
        >
          {QUALITY_TIERS.map((q) => (
            <option key={q.id} value={q.id}>
              Q: {q.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
