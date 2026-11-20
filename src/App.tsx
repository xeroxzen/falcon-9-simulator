import { useEffect } from 'react';
import { MissionCanvas } from './scene/MissionCanvas.js';
import { useSimStore } from './store/simStore.js';
import { EngineerPanel } from './ui/EngineerPanel.js';
import { TimelineBar } from './ui/TimelineBar.js';
import { TopBar } from './ui/TopBar.js';
import { WebcastHud } from './ui/WebcastHud.js';

export function App() {
  const mission = useSimStore((s) => s.mission);
  const loading = useSimStore((s) => s.loading);
  const error = useSimStore((s) => s.error);
  const trajectory = useSimStore((s) => s.trajectory);
  const runMission = useSimStore((s) => s.runMission);

  useEffect(() => {
    if (!trajectory && !loading) {
      runMission(mission);
    }
  }, [mission, trajectory, loading, runMission]);

  return (
    <div className="app-shell">
      <MissionCanvas />
      <TopBar />
      <EngineerPanel />
      <WebcastHud />
      <TimelineBar />

      {loading && (
        <div className="status-overlay">
          <div className="status-card">
            Running deterministic RK4 physics in Web Worker…
          </div>
        </div>
      )}

      {error && (
        <div className="status-overlay">
          <div className="status-card error">Simulation Error: {error}</div>
        </div>
      )}
    </div>
  );
}
