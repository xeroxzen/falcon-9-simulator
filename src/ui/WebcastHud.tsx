import { sampleFrameAt, useSimStore } from '../store/simStore.js';
import { fmtFixed } from './format.js';
import { useViewport } from './useViewport.js';

function formatMissionClock(timeS: number): string {
  if (timeS < 0) {
    const total = Math.ceil(-timeS);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `T-${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const total = Math.floor(timeS);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function WebcastHud() {
  const { isPhone } = useViewport();
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);
  const focusStage = useSimStore((s) => s.focusStage);
  const mobileControlsHidden = useSimStore((s) => s.mobileControlsHidden);
  const rightDrawerWidthPx = useSimStore((s) => s.rightDrawerWidthPx);
  const frame = sampleFrameAt(trajectory, timeS);

  if (!frame || !trajectory) return null;

  // Webcast altitude: AGL above launch pad during ascent (so SLC-4E 114 m AMSL reads 0.0 km on pad),
  // AGL above landing target during S1 recovery, and MSL for S2 in orbit. (Engineer panel shows MSL.)
  const s1AltRefM = !frame.separated
    ? trajectory.launchSiteElevationM
    : trajectory.landingTarget.altitudeM;
  const s2AltRefM = !frame.separated ? trajectory.launchSiteElevationM : 0;

  const s1Kmh = Math.round(Math.max(0, frame.stage1.speedEarthRelMs * 3.6));
  const s1Km = fmtFixed(Math.max(0, frame.stage1.altitudeM - s1AltRefM) / 1000, 1);
  const s2Kmh = Math.round(Math.max(0, frame.stage2.speedEarthRelMs * 3.6));
  const s2Km = fmtFixed(Math.max(0, frame.stage2.altitudeM - s2AltRefM) / 1000, 1);

  if (isPhone) {
    const activeKmh = focusStage === 'stage2' && frame.separated ? s2Kmh : s1Kmh;
    const activeKm = focusStage === 'stage2' && frame.separated ? s2Km : s1Km;
    return (
      <div
        className={`webcast-hud mobile-hud ${mobileControlsHidden ? 'immersive-hidden' : ''} ${rightDrawerWidthPx > 0 ? 'drawer-shifted' : ''}`}
        data-testid="webcast-hud"
        style={
          rightDrawerWidthPx > 0
            ? { right: `${Math.round(rightDrawerWidthPx) + 8}px` }
            : undefined
        }
      >
        <div className="mobile-hud-item">
          <span className="hud-key">SPEED</span>
          <span className="mobile-hud-val">{activeKmh.toLocaleString()}</span>
          <span className="hud-unit">KM/H</span>
        </div>
        <div className="mobile-hud-clock">{formatMissionClock(timeS)}</div>
        <div className="mobile-hud-item">
          <span className="hud-key">ALT</span>
          <span className="mobile-hud-val">{activeKm}</span>
          <span className="hud-unit">KM</span>
        </div>
      </div>
    );
  }

  const s1Phase = frame.stage1.phase;
  const s2Phase = frame.stage2.phase;
  const secoReached = s2Phase === 'SECO' || s2Phase === 'ORBIT';

  let s1ChipLabel = 'S1: IN FLIGHT';
  let s1ChipClass = 'neutral';
  if (s1Phase === 'LANDED') {
    s1ChipLabel = 'S1: LANDED';
    s1ChipClass = 'ok';
  } else if (s1Phase === 'CRASHED') {
    s1ChipLabel = 'S1: CRASHED';
    s1ChipClass = 'err';
  } else if (trajectory.landingMode === 'EXPENDABLE' && frame.separated) {
    s1ChipLabel = 'S1: EXPENDED';
    s1ChipClass = 'warn';
  } else if (s1Phase === 'IGNITION') {
    s1ChipLabel = 'S1: IGNITION';
    s1ChipClass = 'warn';
  } else if (timeS < 0) {
    s1ChipLabel = 'S1: COUNTDOWN';
    s1ChipClass = 'neutral';
  } else if (timeS <= 0.1) {
    s1ChipLabel = 'S1: ON PAD';
    s1ChipClass = 'neutral';
  }

  return (
    <div className="webcast-hud">
      {/* Stage 1 Block */}
      <div className="hud-stage">
        <div className="hud-stage-label">
          STAGE 1 <span className="hud-phase">{s1Phase.replace(/_/g, ' ')}</span>
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
        <div className="hud-mission-sub" data-testid="hud-mission-label">
          {trajectory.launchSiteId} • {trajectory.targetInclinationDeg.toFixed(1)}° •{' '}
          {trajectory.landingMode === 'RTLS' && trajectory.landingSiteId
            ? `RTLS (${trajectory.landingSiteId})`
            : trajectory.landingMode}
        </div>
        <div className="hud-outcomes" data-testid="hud-status-chips">
          {secoReached && (
            <span className={`outcome-tag ${trajectory.orbitAchieved ? 'ok' : 'err'}`}>
              {trajectory.orbitAchieved
                ? `ORBIT ${(trajectory.orbit.perigeeAltitudeM / 1000).toFixed(0)}×${(trajectory.orbit.apogeeAltitudeM / 1000).toFixed(0)} km`
                : 'SUBORBITAL'}
            </span>
          )}
          <span className={`outcome-tag ${s1ChipClass}`}>
            {s1ChipLabel}
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
