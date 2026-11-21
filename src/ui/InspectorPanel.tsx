import { getComponentContent } from '../content/registry.js';
import { sampleFrameAt, useSimStore } from '../store/simStore.js';
import type { PlaybackFrame } from '../worker/protocol.js';
import { BottomSheet } from './BottomSheet.js';
import { fmtFixed } from './format.js';
import { useViewport } from './useViewport.js';

type TelemetryOrigin = 'SIM' | 'DERIVED';

interface LiveTelemetryRow {
  readonly label: string;
  readonly value: string;
  readonly origin: TelemetryOrigin;
}

/**
 * Compute strictly honest live telemetry for the selected component.
 * Every row is explicitly tagged SIM (directly integrated state) or DERIVED
 * (computed from sim state). COSMETIC animation values are NEVER presented as data.
 * Components with no real 3-DOF telemetry return an empty array.
 */
function buildHonestTelemetry(
  componentId: string,
  engineIndex: number | undefined,
  frame: PlaybackFrame,
  payloadMassKg: number
): { rows: readonly LiveTelemetryRow[]; note?: string } {
  const s1 = frame.stage1;
  const s2 = frame.stage2;

  switch (componentId) {
    case 'falcon9-stack':
      return {
        rows: [
          { label: 'Mission Phase', value: s1.phase.replace(/_/g, ' '), origin: 'SIM' },
          { label: 'Altitude', value: `${(s1.altitudeM / 1000).toFixed(2)} km`, origin: 'SIM' },
          { label: 'Speed (ECEF)', value: `${Math.round(s1.speedEarthRelMs * 3.6).toLocaleString()} km/h`, origin: 'SIM' },
          { label: 'Total Stack Mass', value: `${(s1.totalMassKg / 1000).toFixed(1)} t`, origin: 'SIM' },
          { label: 'Dynamic Pressure (q)', value: `${(s1.dynamicPressurePa / 1000).toFixed(2)} kPa`, origin: 'DERIVED' },
        ],
      };

    case 'stage1':
      return {
        rows: [
          { label: 'Phase', value: s1.phase.replace(/_/g, ' '), origin: 'SIM' },
          { label: 'Altitude', value: `${(s1.altitudeM / 1000).toFixed(2)} km`, origin: 'SIM' },
          { label: 'Speed (ECEF)', value: `${Math.round(s1.speedEarthRelMs * 3.6).toLocaleString()} km/h`, origin: 'SIM' },
          { label: 'Propellant Remaining', value: `${(s1.propellantFraction * 100).toFixed(1)}% (${(s1.propellantKg / 1000).toFixed(1)} t)`, origin: 'SIM' },
          { label: 'Total Mass', value: `${(s1.totalMassKg / 1000).toFixed(1)} t`, origin: 'SIM' },
          { label: 'Dynamic Pressure (q)', value: `${(s1.dynamicPressurePa / 1000).toFixed(2)} kPa`, origin: 'DERIVED' },
          { label: 'Mach Number', value: s1.ambientDensityKgM3 < 1e-6 ? '—' : `M ${s1.mach.toFixed(2)}`, origin: 'DERIVED' },
          { label: 'Axial Acceleration', value: `${s1.axialAccelG.toFixed(2)} g`, origin: 'DERIVED' },
        ],
      };

    case 'stage2':
      return {
        rows: [
          { label: 'Phase', value: frame.separated ? s2.phase.replace(/_/g, ' ') : 'ATTACHED TO S1', origin: 'SIM' },
          { label: 'Altitude', value: `${(s2.altitudeM / 1000).toFixed(2)} km`, origin: 'SIM' },
          { label: 'Speed (ECEF)', value: `${Math.round(s2.speedEarthRelMs * 3.6).toLocaleString()} km/h`, origin: 'SIM' },
          { label: 'Inertial Speed', value: `${Math.round(s2.speedInertialMs * 3.6).toLocaleString()} km/h`, origin: 'SIM' },
          { label: 'Propellant Remaining', value: `${(s2.propellantFraction * 100).toFixed(1)}% (${(s2.propellantKg / 1000).toFixed(1)} t)`, origin: 'SIM' },
          { label: 'Total Mass', value: `${(s2.totalMassKg / 1000).toFixed(1)} t`, origin: 'SIM' },
          { label: 'Axial Acceleration', value: `${s2.axialAccelG.toFixed(2)} g`, origin: 'DERIVED' },
        ],
      };

    case 'merlin-1d': {
      const idx = engineIndex ?? 0;
      const eng = s1.engines[idx];
      if (!eng) {
        return { rows: [], note: 'Engine state unavailable at this timestamp.' };
      }
      const chamberState = eng.failed
        ? 'FAILED (ENGINE OUT)'
        : eng.active
          ? 'FIRING'
          : 'SHUTDOWN';
      return {
        rows: [
          { label: 'Engine Position', value: idx === 0 ? 'M1D #1 (Center)' : `M1D #${idx + 1} (Outer Ring)`, origin: 'SIM' },
          { label: 'Chamber State', value: chamberState, origin: 'SIM' },
          { label: 'Throttle', value: `${(eng.throttle * 100).toFixed(0)} %`, origin: 'SIM' },
          { label: 'Thrust', value: `${(eng.thrustN / 1000).toFixed(1)} kN`, origin: 'DERIVED' },
          { label: 'Mass Flow Rate', value: `${eng.massFlowKgS.toFixed(1)} kg/s`, origin: 'DERIVED' },
        ],
      };
    }

    case 'mvac': {
      const mvac = s2.engines[0];
      const active = frame.separated && (mvac?.active ?? false);
      return {
        rows: [
          { label: 'Chamber State', value: active ? 'FIRING' : 'SHUTDOWN', origin: 'SIM' },
          { label: 'Throttle', value: `${((mvac?.throttle ?? 0) * 100).toFixed(0)} %`, origin: 'SIM' },
          { label: 'Vacuum Thrust', value: `${((mvac?.thrustN ?? 0) / 1000).toFixed(1)} kN`, origin: 'DERIVED' },
          { label: 'Mass Flow Rate', value: `${(mvac?.massFlowKgS ?? 0).toFixed(1)} kg/s`, origin: 'DERIVED' },
        ],
      };
    }

    case 'grid-fins':
      return {
        rows: [
          { label: 'Commanded Deflection (3-DOF)', value: `${s1.gridFinDeflectionDeg.toFixed(1)}°`, origin: 'DERIVED' },
          { label: 'Dynamic Pressure (q)', value: `${(s1.dynamicPressurePa / 1000).toFixed(2)} kPa`, origin: 'DERIVED' },
          { label: 'Mach Number', value: s1.ambientDensityKgM3 < 1e-6 ? '—' : `M ${s1.mach.toFixed(2)}`, origin: 'DERIVED' },
        ],
        note: '3-DOF simplified lateral lift command (C_L = 0.8/rad); individual fin hinge torques are not modeled.',
      };

    case 'landing-legs':
      return {
        rows: [
          { label: 'Deployment State', value: s1.landingLegsDeployed ? 'DEPLOYED' : 'STOWED', origin: 'SIM' },
          { label: 'Altitude AGL', value: `${fmtFixed(Math.max(0, s1.altitudeM), 1)} m`, origin: 'SIM' },
        ],
      };

    case 'fairing':
      return {
        rows: [
          { label: 'Attachment State', value: s2.fairingAttached ? 'ATTACHED' : 'SEPARATED / NONE', origin: 'SIM' },
          { label: 'Stage 2 Altitude', value: `${(s2.altitudeM / 1000).toFixed(1)} km`, origin: 'SIM' },
        ],
      };

    case 'payload':
      return {
        rows: [
          { label: 'Configured Mass', value: `${payloadMassKg.toLocaleString()} kg`, origin: 'SIM' },
          { label: 'Altitude', value: `${(s2.altitudeM / 1000).toFixed(2)} km`, origin: 'SIM' },
          { label: 'Inertial Speed', value: `${Math.round(s2.speedInertialMs * 3.6).toLocaleString()} km/h`, origin: 'SIM' },
        ],
      };

    case 'droneship':
      return {
        rows: frame.separated
          ? [
              {
                label: 'Booster Distance to Deck',
                value:
                  s1.distanceToTargetM > 1000
                    ? `${(s1.distanceToTargetM / 1000).toFixed(2)} km`
                    : `${s1.distanceToTargetM.toFixed(2)} m`,
                origin: 'SIM',
              },
              { label: 'Booster Altitude', value: `${(s1.altitudeM / 1000).toFixed(2)} km`, origin: 'SIM' },
            ]
          : [],
        note: frame.separated
          ? undefined
          : 'No live deck telemetry until Stage 1 separates for recovery.',
      };

    case 'interstage':
    case 'cold-gas-thrusters':
    case 'launch-pad':
    default:
      return {
        rows: [],
        note: 'No live component-level telemetry modeled in 3-DOF physics.',
      };
  }
}

export function InspectorPanel() {
  const { isPhone } = useViewport();
  const selected = useSimStore((s) => s.selectedComponent);
  const selectComponent = useSimStore((s) => s.selectComponent);
  const trajectory = useSimStore((s) => s.trajectory);
  const mission = useSimStore((s) => s.mission);
  const timeS = useSimStore((s) => s.timeS);

  if (!selected) return null;
  const content = getComponentContent(selected.componentId);
  if (!content) return null;

  const frame = sampleFrameAt(trajectory, timeS);
  const live = frame
    ? buildHonestTelemetry(
        selected.componentId,
        selected.engineIndex,
        frame,
        mission.payloadMassKg
      )
    : { rows: [], note: 'Waiting for physics data…' };

  const titleSuffix =
    selected.componentId === 'merlin-1d' && selected.engineIndex !== undefined
      ? ` #${selected.engineIndex + 1}`
      : '';

  const body = (
    <>
      <p className="insp-summary">{content.summary}</p>

      {/* Honest Live Telemetry */}
      <section className="insp-section">
        <div className="insp-sec-title">LIVE TELEMETRY</div>
        {live.rows.length > 0 ? (
          <div className="insp-live-grid">
            {live.rows.map((r) => (
              <div key={r.label} className="insp-live-row">
                <span className="insp-live-label">
                  {r.label}
                  <span className={`origin-badge origin-${r.origin.toLowerCase()}`}>
                    {r.origin}
                  </span>
                </span>
                <strong>{r.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {live.note && <p className="insp-note">{live.note}</p>}
      </section>

      {/* Function & Materials */}
      <section className="insp-section">
        <div className="insp-sec-title">FUNCTION</div>
        <p className="insp-body">{content.function}</p>
      </section>

      <section className="insp-section">
        <div className="insp-sec-title">MATERIALS</div>
        <p className="insp-body">{content.materials}</p>
      </section>

      {/* Cited Specs */}
      <section className="insp-section">
        <div className="insp-sec-title">SPECIFICATIONS</div>
        <div className="insp-specs">
          {content.specs.map((sp) => (
            <div key={sp.label} className="insp-spec-row" title={`Source: ${sp.source}`}>
              <span className="insp-spec-label">
                {sp.label}
                <span className={`status-badge status-${sp.status.toLowerCase()}`}>
                  {sp.status}
                </span>
              </span>
              <strong>
                {sp.value}
                {sp.unit ? ` ${sp.unit}` : ''}
              </strong>
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      <section className="insp-section">
        <div className="insp-sec-title">HISTORY & EVOLUTION</div>
        <p className="insp-body">{content.history}</p>
      </section>

      {/* Sources */}
      <section className="insp-section">
        <div className="insp-sec-title">SOURCES</div>
        <ul className="insp-sources">
          {content.sources.map((src) => (
            <li key={src}>{src}</li>
          ))}
        </ul>
      </section>
    </>
  );

  if (isPhone) {
    return (
      <BottomSheet
        kicker="COMPONENT INSPECTOR"
        title={`${content.name}${titleSuffix}`}
        onClose={() => selectComponent(null)}
        testId="inspector-panel"
        dataComponentId={content.id}
      >
        {body}
      </BottomSheet>
    );
  }

  return (
    <aside className="inspector-panel" data-testid="inspector-panel" data-component-id={content.id}>
      <div className="insp-header">
        <div>
          <div className="insp-kicker">COMPONENT INSPECTOR</div>
          <h2 className="insp-title">
            {content.name}
            {titleSuffix}
          </h2>
        </div>
        <button
          className="insp-close"
          onClick={() => selectComponent(null)}
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>
      {body}
    </aside>
  );
}
