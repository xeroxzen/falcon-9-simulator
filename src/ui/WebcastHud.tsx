import { sampleFrameAt, useSimStore } from '../store/simStore.js';

function formatMissionClock(timeS: number): string {
  const total = Math.max(0, Math.floor(timeS));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function WebcastHud() {
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);
  const frame = sampleFrameAt(trajectory, timeS);

  if (!frame || !trajectory) return null;

  const s1Kmh = Math.round(frame.stage1.speedEarthRelMs * 3.6);
  const s1Km = (frame.stage1.altitudeM / 1000).toFixed(1);
  const s2Kmh = Math.round(frame.stage2.speedEarthRelMs * 3.6);
  const s2Km = (frame.stage2.altitudeM / 1000).toFixed(1);

  return (
    <div className="webcast-hud">
      {/* Stage 1 Block */}
      <div className="hud-stage">
        <div className="hud-stage-label">
          STAGE 1 <span className="hud-phase">{frame.stage1.phase.replace(/_/g, ' ')}</span>
        </div>
        <div className="hud-metrics">
          <div className="hud-metric">
            <span className="hud-key">SPEED</span>
            <span className="hud-val">{s1Kmh.toLocaleString()}</span>
            <span className="hud-unit">KM/H</span>
          </div>
          <div className="hud-metric">
            <span className="hud-key">ALTITUDE</span>
            <span className="hud-val">{s1Km}</span>
            <span className="hud-unit">KM</span>
          </div>
        </div>
      </div>

      {/* Center Mission Clock */}
      <div className="hud-center">
        <div className="hud-clock">{formatMissionClock(timeS)}</div>
        <div className="hud-mission-sub">
          {trajectory.launchSiteId} • {trajectory.landingMode}
        </div>
        <div className="hud-outcomes">
          <span className={`outcome-tag ${trajectory.orbitAchieved ? 'ok' : 'warn'}`}>
            ORBIT {(trajectory.orbit.perigeeAltitudeM / 1000).toFixed(0)}×
            {(trajectory.orbit.apogeeAltitudeM / 1000).toFixed(0)} km
          </span>
          <span
            className={`outcome-tag ${
              trajectory.boosterOutcome === 'LANDED' ? 'ok' : 'warn'
            }`}
          >
            S1 {trajectory.boosterOutcome}
          </span>
        </div>
      </div>

      {/* Stage 2 Block */}
      <div className={`hud-stage ${frame.separated ? '' : 'dimmed'}`}>
        <div className="hud-stage-label">
          STAGE 2{' '}
          <span className="hud-phase">
            {frame.separated ? frame.stage2.phase.replace(/_/g, ' ') : 'ATTACHED'}
          </span>
        </div>
        <div className="hud-metrics">
          <div className="hud-metric">
            <span className="hud-key">SPEED</span>
            <span className="hud-val">{s2Kmh.toLocaleString()}</span>
            <span className="hud-unit">KM/H</span>
          </div>
          <div className="hud-metric">
            <span className="hud-key">ALTITUDE</span>
            <span className="hud-val">{s2Km}</span>
            <span className="hud-unit">KM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
