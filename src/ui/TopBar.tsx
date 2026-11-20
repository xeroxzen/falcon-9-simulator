import {
  AVAILABLE_MISSIONS,
  useSimStore,
  type CameraMode,
} from '../store/simStore.js';

const CAMERA_MODES: readonly { id: CameraMode; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'orbit', label: 'Free Orbit' },
  { id: 'pad', label: 'Pad' },
  { id: 'droneship', label: 'LZ / ASDS' },
  { id: 'onboard-s1', label: 'Onboard S1' },
  { id: 'onboard-s2', label: 'Onboard S2' },
  { id: 'split', label: 'Split View' },
];

export function TopBar() {
  const mission = useSimStore((s) => s.mission);
  const trajectory = useSimStore((s) => s.trajectory);
  const loading = useSimStore((s) => s.loading);
  const cameraMode = useSimStore((s) => s.cameraMode);
  const focusStage = useSimStore((s) => s.focusStage);
  const showEngineerPanel = useSimStore((s) => s.showEngineerPanel);
  const runMission = useSimStore((s) => s.runMission);
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  const setFocusStage = useSimStore((s) => s.setFocusStage);
  const toggleEngineerPanel = useSimStore((s) => s.toggleEngineerPanel);

  return (
    <header className="top-bar">
      <div className="top-bar-group">
        <span className="brand-title">FALCON 9 SIM</span>
        <select
          className="mission-select"
          value={mission.id}
          disabled={loading}
          onChange={(e) => {
            const next = AVAILABLE_MISSIONS.find((m) => m.id === e.target.value);
            if (next) runMission(next);
          }}
        >
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
        <button
          className={`pill-btn ${showEngineerPanel ? 'active' : ''}`}
          onClick={toggleEngineerPanel}
        >
          Engineer HUD
        </button>
      </div>
    </header>
  );
}
