import { useEffect } from 'react';
import { MissionCanvas } from './scene/MissionCanvas.js';
import { useSimStore } from './store/simStore.js';
import { EngineerPanel } from './ui/EngineerPanel.js';
import { InspectorPanel } from './ui/InspectorPanel.js';
import { TimelineBar } from './ui/TimelineBar.js';
import { TopBar } from './ui/TopBar.js';
import { WebcastHud } from './ui/WebcastHud.js';
import { WhatIfPanel } from './ui/WhatIfPanel.js';

export function App() {
  const mission = useSimStore((s) => s.mission);
  const loading = useSimStore((s) => s.loading);
  const loadingProgress = useSimStore((s) => s.loadingProgress);
  const loadingStage = useSimStore((s) => s.loadingStage);
  const error = useSimStore((s) => s.error);
  const trajectory = useSimStore((s) => s.trajectory);
  const runMission = useSimStore((s) => s.runMission);

  useEffect(() => {
    if (!trajectory && !loading) {
      runMission(mission, false);
    }
  }, [mission, trajectory, loading, runMission]);

  return (
    <div className="app-shell">
      <MissionCanvas />
      <TopBar />
      <WhatIfPanel />
      <InspectorPanel />
      <EngineerPanel />
      <WebcastHud />
      <TimelineBar />

      {loading && (
        <div className="worker-progress-banner" data-testid="worker-progress-banner">
          <div className="worker-progress-text">
            {loadingStage || 'Running deterministic RK4 physics in Web Worker…'}
          </div>
          <div className="worker-progress-track">
            <div
              className="worker-progress-fill"
              style={{ width: `${Math.max(10, Math.round(loadingProgress * 100))}%` }}
            />
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
