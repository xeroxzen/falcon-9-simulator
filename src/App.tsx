import { useEffect, useRef } from 'react';
import { MissionCanvas } from './scene/MissionCanvas.js';
import { useSimStore } from './store/simStore.js';
import { EngineerPanel } from './ui/EngineerPanel.js';
import { InspectorPanel } from './ui/InspectorPanel.js';
import { TimelineBar } from './ui/TimelineBar.js';
import { TopBar } from './ui/TopBar.js';
import { useViewport } from './ui/useViewport.js';
import { WebcastHud } from './ui/WebcastHud.js';
import { WhatIfPanel } from './ui/WhatIfPanel.js';

export function App() {
  const { isPhone } = useViewport();
  const mission = useSimStore((s) => s.mission);
  const loading = useSimStore((s) => s.loading);
  const loadingProgress = useSimStore((s) => s.loadingProgress);
  const loadingStage = useSimStore((s) => s.loadingStage);
  const error = useSimStore((s) => s.error);
  const trajectory = useSimStore((s) => s.trajectory);
  const playing = useSimStore((s) => s.playing);
  const showEngineerPanel = useSimStore((s) => s.showEngineerPanel);
  const showWhatIfPanel = useSimStore((s) => s.showWhatIfPanel);
  const selectedComponent = useSimStore((s) => s.selectedComponent);
  const mobileControlsHidden = useSimStore((s) => s.mobileControlsHidden);
  const setMobileControlsHidden = useSimStore((s) => s.setMobileControlsHidden);
  const runMission = useSimStore((s) => s.runMission);

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasOpenSheet =
    isPhone && (showEngineerPanel || showWhatIfPanel || selectedComponent !== null);

  useEffect(() => {
    if (!trajectory && !loading) {
      runMission(mission, false);
    }
  }, [mission, trajectory, loading, runMission]);

  // Immersive mode on phones (both portrait and landscape):
  // auto-hide top bar, HUD and timeline 3 s after playback starts; any tap restores them.
  useEffect(() => {
    if (immersiveTimerRef.current) {
      clearTimeout(immersiveTimerRef.current);
      immersiveTimerRef.current = null;
    }
    if (!isPhone || !playing || hasOpenSheet) {
      if (mobileControlsHidden) setMobileControlsHidden(false);
      return;
    }
    if (!mobileControlsHidden) {
      immersiveTimerRef.current = setTimeout(() => {
        setMobileControlsHidden(true);
      }, 3000);
    }
    return () => {
      if (immersiveTimerRef.current) {
        clearTimeout(immersiveTimerRef.current);
        immersiveTimerRef.current = null;
      }
    };
  }, [isPhone, playing, hasOpenSheet, mobileControlsHidden, setMobileControlsHidden]);

  const handleUserInteraction = () => {
    if (isPhone && mobileControlsHidden) {
      setMobileControlsHidden(false);
    }
  };

  return (
    <div
      className="app-shell"
      onPointerDownCapture={handleUserInteraction}
    >
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
