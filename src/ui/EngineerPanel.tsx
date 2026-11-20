import { sampleFrameAt, useSimStore } from '../store/simStore.js';
import { fmtFixed } from './format.js';

export function EngineerPanel() {
  const show = useSimStore((s) => s.showEngineerPanel);
  const trajectory = useSimStore((s) => s.trajectory);
  const timeS = useSimStore((s) => s.timeS);
  const focusStage = useSimStore((s) => s.focusStage);

  if (!show || !trajectory) return null;
  const frame = sampleFrameAt(trajectory, timeS);
  if (!frame) return null;

  const snap = focusStage === 'stage1' || !frame.separated ? frame.stage1 : frame.stage2;
  const stageTitle =
    focusStage === 'stage2' && frame.separated ? 'STAGE 2 (MVac)' : 'STAGE 1 (9× Merlin 1D)';

  return (
    <aside className="engineer-panel">
      <div className="eng-header">
        <span>ENGINEER TELEMETRY</span>
        <span className="eng-stage-tag">{stageTitle}</span>
      </div>

      <div className="eng-grid">
        <div className="eng-row">
          <span>Dynamic Pressure (q)</span>
          <strong>{fmtFixed(snap.dynamicPressurePa / 1000, 2)} kPa</strong>
        </div>
        <div className="eng-row">
          <span>Mach Number</span>
          <strong data-testid="eng-mach">
            {snap.ambientDensityKgM3 < 1e-6 ? '—' : `M ${fmtFixed(snap.mach, 2)}`}
          </strong>
        </div>
        <div className="eng-row">
          <span>Axial Accel</span>
          <strong>{fmtFixed(snap.axialAccelG, 2)} g</strong>
        </div>
        <div className="eng-row">
          <span>Total Mass</span>
          <strong>{fmtFixed(snap.totalMassKg / 1000, 1)} t</strong>
        </div>
        <div className="eng-row">
          <span>Throttle</span>
          <strong>{fmtFixed(snap.throttle * 100, 0)} %</strong>
        </div>
        <div className="eng-row">
          <span>Thrust</span>
          <strong>{fmtFixed(snap.thrustN / 1000, 0)} kN</strong>
        </div>
        <div className="eng-row">
          <span>Active Engines</span>
          <strong>{snap.activeEngineCount}</strong>
        </div>
        <div className="eng-row">
          <span>Propellant</span>
          <strong>
            {fmtFixed(snap.propellantFraction * 100, 1)}% ({fmtFixed(snap.propellantKg / 1000, 1)} t)
          </strong>
        </div>
        <div className="eng-row">
          <span>Downrange</span>
          <strong>{fmtFixed(snap.downrangeM / 1000, 2)} km</strong>
        </div>
        <div className="eng-row">
          <span>Vert / Horiz Speed</span>
          <strong>
            {fmtFixed(snap.verticalSpeedMs, 0)} / {fmtFixed(snap.horizontalSpeedMs, 0)} m/s
          </strong>
        </div>
        {focusStage === 'stage1' && frame.separated && (
          <>
            <div className="eng-row">
              <span>Dist to Landing Pad</span>
              <strong>
                {snap.distanceToTargetM > 1000
                  ? `${fmtFixed(snap.distanceToTargetM / 1000, 2)} km`
                  : `${fmtFixed(snap.distanceToTargetM, 1)} m`}
              </strong>
            </div>
            <div className="eng-row">
              <span>Grid Fin Deflection</span>
              <strong>{fmtFixed(snap.gridFinDeflectionDeg, 1)}°</strong>
            </div>
          </>
        )}
      </div>

      {/* Propellant bar */}
      <div className="prop-bar-wrap">
        <div
          className="prop-bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, snap.propellantFraction * 100))}%` }}
        />
      </div>
    </aside>
  );
}
