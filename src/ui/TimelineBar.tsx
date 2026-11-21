import { useSimStore } from '../store/simStore.js';
import { useViewport } from './useViewport.js';

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100] as const;

export function TimelineBar() {
  const { isPhone } = useViewport();
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);
  const playing = useSimStore((s) => s.playing);
  const playbackSpeed = useSimStore((s) => s.playbackSpeed);
  const mobileControlsHidden = useSimStore((s) => s.mobileControlsHidden);
  const setTimeS = useSimStore((s) => s.setTimeS);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const setPlaybackSpeed = useSimStore((s) => s.setPlaybackSpeed);

  if (!trajectory) return null;

  const duration = Math.max(1, trajectory.durationS);

  if (isPhone) {
    return (
      <div
        className={`timeline-bar mobile-timeline ${mobileControlsHidden ? 'immersive-hidden' : ''}`}
        data-testid="timeline-bar"
      >
        <button
          className="mobile-play-btn"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          data-testid="mobile-play-btn"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          className="scrubber-input mobile-scrubber"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={timeS}
          aria-label="Mission timeline scrubber"
          onChange={(e) => setTimeS(Number(e.target.value))}
          data-testid="mobile-scrubber"
        />
      </div>
    );
  }

  const s1Segments = trajectory.segments.filter((seg) => seg.stage === 'STAGE1');
  const s2Segments = trajectory.segments.filter((seg) => seg.stage === 'STAGE2');

  return (
    <div className="timeline-bar" data-testid="timeline-bar">
      {/* Controls row */}
      <div className="timeline-controls">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>

        <div className="speed-group">
          {SPEED_OPTIONS.map((sp) => (
            <button
              key={sp}
              className={`speed-btn ${playbackSpeed === sp ? 'active' : ''}`}
              onClick={() => setPlaybackSpeed(sp)}
            >
              {sp}×
            </button>
          ))}
        </div>

        {/* Dynamic event jump pills (driven purely by worker events[], zero hard-coding) */}
        <div className="event-pills">
          {trajectory.events.map((ev) => (
            <button
              key={ev.id}
              className={`event-pill ${Math.abs(timeS - ev.timeS) < 2.5 ? 'current' : ''}`}
              title={`${ev.label} @ T+${ev.timeS.toFixed(1)}s — ${ev.detail}`}
              onClick={() => setTimeS(ev.timeS)}
            >
              {ev.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic per-stage burn/coast tracks */}
      <div className="segment-tracks">
        <div className="segment-track" title="Stage 1 burn/coast segments">
          <span className="track-label">S1</span>
          <div className="track-rail">
            {s1Segments.map((seg) => {
              const left = (seg.startTimeS / duration) * 100;
              const width = Math.max(0.4, ((seg.endTimeS - seg.startTimeS) / duration) * 100);
              return (
                <div
                  key={seg.id}
                  className={`seg-block seg-${seg.kind.toLowerCase()}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${seg.label} (T+${seg.startTimeS.toFixed(0)}s..${seg.endTimeS.toFixed(0)}s)`}
                />
              );
            })}
          </div>
        </div>

        <div className="segment-track" title="Stage 2 burn/coast segments">
          <span className="track-label">S2</span>
          <div className="track-rail">
            {s2Segments.map((seg) => {
              const left = (seg.startTimeS / duration) * 100;
              const width = Math.max(0.4, ((seg.endTimeS - seg.startTimeS) / duration) * 100);
              return (
                <div
                  key={seg.id}
                  className={`seg-block seg-${seg.kind.toLowerCase()}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${seg.label} (T+${seg.startTimeS.toFixed(0)}s..${seg.endTimeS.toFixed(0)}s)`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive scrubber + event ticks */}
      <div className="scrubber-wrap">
        <div className="event-ticks">
          {trajectory.events.map((ev) => (
            <button
              key={ev.id}
              className="event-tick"
              style={{ left: `${(ev.timeS / duration) * 100}%` }}
              title={`${ev.label} @ T+${ev.timeS.toFixed(1)}s`}
              onClick={() => setTimeS(ev.timeS)}
            />
          ))}
        </div>
        <input
          className="scrubber-input"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={timeS}
          onChange={(e) => setTimeS(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
