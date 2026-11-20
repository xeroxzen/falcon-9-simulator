import { sampleFrameAt, useSimStore } from '../store/simStore.js';

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
          <strong>{(snap.dynamicPressurePa / 1000).toFixed(2)} kPa</strong>
        </div>
        <div className="eng-row">
          <span>Mach Number</span>
          <strong data-testid="eng-mach">
            {snap.ambientDensityKgM3 < 1e-6 ? '—' : `M ${snap.mach.toFixed(2)}`}
          </strong>
        </div>
        <div className="eng-row">
          <span>Axial Accel</span>
          <strong>{snap.axialAccelG.toFixed(2)} g</strong>
        </div>
        <div className="eng-row">
          <span>Total Mass</span>
          <strong>{(snap.totalMassKg / 1000).toFixed(1)} t</strong>
        </div>
        <div className="eng-row">
          <span>Throttle</span>
          <strong>{(snap.throttle * 100).toFixed(0)} %</strong>
        </div>
        <div className="eng-row">
          <span>Thrust</span>
          <strong>{(snap.thrustN / 1000).toFixed(0)} kN</strong>
        </div>
        <div className="eng-row">
          <span>Active Engines</span>
          <strong>{snap.activeEngineCount}</strong>
        </div>
        <div className="eng-row">
          <span>Propellant</span>
          <strong>
            {(snap.propellantFraction * 100).toFixed(1)}% ({(snap.propellantKg / 1000).toFixed(1)} t)
          </strong>
        </div>
        <div className="eng-row">
          <span>Downrange</span>
          <strong>{(snap.downrangeM / 1000).toFixed(2)} km</strong>
        </div>
        <div className="eng-row">
          <span>Vert / Horiz Speed</span>
          <strong>
            {snap.verticalSpeedMs.toFixed(0)} / {snap.horizontalSpeedMs.toFixed(0)} m/s
          </strong>
        </div>
        {focusStage === 'stage1' && frame.separated && (
          <>
            <div className="eng-row">
              <span>Dist to Landing Pad</span>
              <strong>
                {snap.distanceToTargetM > 1000
                  ? `${(snap.distanceToTargetM / 1000).toFixed(2)} km`
                  : `${snap.distanceToTargetM.toFixed(1)} m`}
              </strong>
            </div>
            <div className="eng-row">
              <span>Grid Fin Deflection</span>
              <strong>{snap.gridFinDeflectionDeg.toFixed(1)}°</strong>
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
