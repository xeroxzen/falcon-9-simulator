import { useEffect, useState } from 'react';
import {
  FALCON9_BLOCK5,
  getAvailableRecoveryAssets,
  LAUNCH_SITES,
  validateLaunchSiteInclination,
} from '../sim/config/falcon9.js';
import { defaultWhatIfPitchKickDeg } from '../sim/guidance/mission-design.js';
import type { LandingMode, LaunchSiteConfig, MissionConfig } from '../sim/types.js';
import { AVAILABLE_MISSIONS, useSimStore } from '../store/simStore.js';
import { BottomSheet } from './BottomSheet.js';
import { fmtSignedDelta } from './format.js';
import { useViewport } from './useViewport.js';

function formatDelta(val: number, unit: string, digits = 1): string {
  return fmtSignedDelta(val, unit, digits);
}

export function WhatIfPanel() {
  const { isPhone } = useViewport();
  const show = useSimStore((s) => s.showWhatIfPanel);
  const baseMission = useSimStore((s) => s.baseMission);
  const mission = useSimStore((s) => s.mission);
  const trajectory = useSimStore((s) => s.trajectory);
  const nominal = useSimStore((s) => s.nominalTrajectory);
  const isWhatIfActive = useSimStore((s) => s.isWhatIfActive);
  const loading = useSimStore((s) => s.loading);
  const loadingProgress = useSimStore((s) => s.loadingProgress);
  const loadingStage = useSimStore((s) => s.loadingStage);
  const runMission = useSimStore((s) => s.runMission);
  const resetToNominal = useSimStore((s) => s.resetToNominal);
  const toggleWhatIfPanel = useSimStore((s) => s.toggleWhatIfPanel);

  // Local form state synced whenever baseMission changes
  const [engineOutEnabled, setEngineOutEnabled] = useState(
    mission.engineOuts.length > 0
  );
  const [engineOutIndex, setEngineOutIndex] = useState(
    mission.engineOuts[0]?.engineIndex ?? 2
  );
  const [engineOutTimeS, setEngineOutTimeS] = useState(
    mission.engineOuts[0]?.timeS ?? 65
  );
  const [launchSiteId, setLaunchSiteId] = useState<LaunchSiteConfig['id']>(
    mission.launchSite.id
  );
  const [payloadMassKg, setPayloadMassKg] = useState(mission.payloadMassKg);
  const [landingMode, setLandingMode] = useState<LandingMode>(
    mission.landingMode
  );
  const [windEastMs, setWindEastMs] = useState(mission.wind.eastMs);
  const [windNorthMs, setWindNorthMs] = useState(mission.wind.northMs);
  const [targetAltKm, setTargetAltKm] = useState(
    Math.round(mission.targetOrbitAltitudeM / 1000)
  );
  const [targetInclDeg, setTargetInclDeg] = useState(
    Number(mission.targetInclinationDeg.toFixed(1))
  );

  useEffect(() => {
    setEngineOutEnabled(baseMission.engineOuts.length > 0);
    setEngineOutIndex(baseMission.engineOuts[0]?.engineIndex ?? 2);
    setEngineOutTimeS(baseMission.engineOuts[0]?.timeS ?? 65);
    setLaunchSiteId(baseMission.launchSite.id);
    setPayloadMassKg(baseMission.payloadMassKg);
    setLandingMode(baseMission.landingMode);
    setWindEastMs(baseMission.wind.eastMs);
    setWindNorthMs(baseMission.wind.northMs);
    setTargetAltKm(Math.round(baseMission.targetOrbitAltitudeM / 1000));
    setTargetInclDeg(Number(baseMission.targetInclinationDeg.toFixed(1)));
  }, [baseMission]);

  if (!show) return null;

  const corridorCheck = validateLaunchSiteInclination(launchSiteId, targetInclDeg);
  const recoveryAssets = getAvailableRecoveryAssets(launchSiteId, baseMission.missionDate);

  const handleRun = () => {
    if (!corridorCheck.valid) return;
    const initialReserveFraction =
      landingMode === 'EXPENDABLE'
        ? 0.005
        : landingMode === 'RTLS'
          ? 0.145
          : baseMission.landingMode === 'ASDS'
            ? baseMission.guidance.mecoPropellantReserveFraction
            : 0.075;

    const selectedSite = LAUNCH_SITES[launchSiteId];
    const isVandenberg = launchSiteId === 'SLC-4E';
    const isTwoBurnTarget = targetAltKm > 250;
    const profilePitchKickDeg = defaultWhatIfPitchKickDeg(targetAltKm * 1000);
    const resolvedLandingSiteId =
      landingMode === 'RTLS' ? recoveryAssets.defaultLandingSiteId : undefined;
    const modeLabel =
      landingMode === 'RTLS' && resolvedLandingSiteId
        ? `RTLS (${resolvedLandingSiteId})`
        : landingMode;

    const customMission: MissionConfig = {
      ...baseMission,
      name: `What-If: LEO ${targetAltKm} km (${targetInclDeg.toFixed(1)}° incl.) — ${modeLabel} from ${launchSiteId}`,
      launchSite: selectedSite,
      launchDirection: isVandenberg ? 'DESCENDING' : 'ASCENDING',
      ascentProfile: undefined, // What-If falls back to >250 km two-burn default
      payloadMassKg,
      landingMode,
      landingSiteId: resolvedLandingSiteId,
      targetOrbitAltitudeM: targetAltKm * 1000,
      targetInclinationDeg: targetInclDeg,
      maxSimTimeS: isTwoBurnTarget
        ? Math.max(baseMission.maxSimTimeS, 4_200)
        : baseMission.maxSimTimeS,
      wind: { eastMs: windEastMs, northMs: windNorthMs, upMs: 0 },
      engineOuts: engineOutEnabled
        ? [{ engineIndex: engineOutIndex, timeS: engineOutTimeS }]
        : [],
      guidance: {
        ...baseMission.guidance,
        pitchKickAngleDeg: profilePitchKickDeg,
        twoBurn: undefined,
        mecoPropellantReserveFraction: initialReserveFraction,
        autoDesignAscent: true,
      },
    };
    runMission(customMission, true);
  };

  const s1PropPct = trajectory
    ? (trajectory.boosterPropRemainingKg /
        FALCON9_BLOCK5.stage1.propellantMassKg) *
      100
    : 0;
  const s2PropPct = trajectory
    ? (trajectory.stage2PropRemainingKg /
        FALCON9_BLOCK5.stage2.propellantMassKg) *
      100
    : 0;

  const body = (
    <>
      {/* Mission Picker on Phones */}
      {isPhone && (
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Mission Preset</span>
          </div>
          <select
            className="whatif-input mobile-mission-select"
            value={baseMission.id}
            disabled={loading}
            aria-label="Select mission"
            data-testid="mobile-mission-select"
            onChange={(e) => {
              const next = AVAILABLE_MISSIONS.find((m) => m.id === e.target.value);
              if (next) runMission(next, false);
            }}
          >
            {AVAILABLE_MISSIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Controls */}
      <div className="whatif-controls">
        {/* Launch Site Picker (LC-39A, SLC-40, SLC-4E) */}
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Launch Site</span>
            <strong>
              {launchSiteId} ({LAUNCH_SITES[launchSiteId].elevationM} m AMSL)
            </strong>
          </div>
          <select
            className="whatif-input"
            value={launchSiteId}
            aria-label="Launch site"
            data-testid="launch-site-select"
            onChange={(e) => {
              const nextId = e.target.value as LaunchSiteConfig['id'];
              setLaunchSiteId(nextId);
              if (!validateLaunchSiteInclination(nextId, targetInclDeg).valid) {
                setTargetInclDeg(LAUNCH_SITES[nextId].defaultInclinationDeg);
              }
            }}
          >
            <option value="LC-39A">LC-39A — Kennedy Space Center (28.61°N)</option>
            <option value="SLC-40">SLC-40 — Cape Canaveral SFS (28.56°N)</option>
            <option value="SLC-4E">SLC-4E — Vandenberg SFB (34.63°N, Polar/SSO)</option>
          </select>
          <div style={{ fontSize: '11px', opacity: 0.78, marginTop: '4px' }}>
            Corridor: {LAUNCH_SITES[launchSiteId].azimuthCorridorDeg[0]}°–
            {LAUNCH_SITES[launchSiteId].azimuthCorridorDeg[1]}° az (
            {LAUNCH_SITES[launchSiteId].inclinationRangeDeg[0].toFixed(1)}°–
            {LAUNCH_SITES[launchSiteId].inclinationRangeDeg[1].toFixed(1)}° incl.) · Recovery:{' '}
            {recoveryAssets.landingZones.map((lz) => lz.id).join('/') || '—'} /{' '}
            {recoveryAssets.droneships.map((ds) => ds.id).join('/') || '—'}
          </div>
        </div>

        {/* Engine Out */}
        <div className="whatif-group">
          <label className="whatif-check">
            <input
              type="checkbox"
              checked={engineOutEnabled}
              onChange={(e) => setEngineOutEnabled(e.target.checked)}
              data-testid="whatif-engine-out-toggle"
            />
            <span>Stage 1 Engine-Out Failure</span>
          </label>
          {engineOutEnabled && (
            <div className="whatif-row-2">
              <label>
                <span>Engine</span>
                <select
                  className="whatif-input"
                  value={engineOutIndex}
                  onChange={(e) => setEngineOutIndex(Number(e.target.value))}
                >
                  {Array.from({ length: 9 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? 'M1D #1 (Center)' : `M1D #${i + 1} (Outer)`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fail @ T+ (s)</span>
                <input
                  type="number"
                  className="whatif-input"
                  min={5}
                  max={145}
                  step={5}
                  value={engineOutTimeS}
                  onChange={(e) => setEngineOutTimeS(Number(e.target.value))}
                  data-testid="whatif-engine-out-time"
                />
              </label>
            </div>
          )}
        </div>

        {/* Payload Mass */}
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Payload Mass</span>
            <strong>{payloadMassKg.toLocaleString()} kg</strong>
          </div>
          <input
            type="range"
            min={0}
            max={22800}
            step={500}
            value={payloadMassKg}
            onChange={(e) => setPayloadMassKg(Number(e.target.value))}
            data-testid="whatif-payload-slider"
          />
        </div>

        {/* Landing Mode */}
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Booster Recovery Mode</span>
            <strong>{landingMode}</strong>
          </div>
          <div className="segmented whatif-seg">
            {(['ASDS', 'RTLS', 'EXPENDABLE'] as const).map((m) => (
              <button
                key={m}
                className={landingMode === m ? 'active' : ''}
                onClick={() => setLandingMode(m)}
                data-testid={`whatif-mode-${m.toLowerCase()}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Wind Profile */}
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Wind (E / N)</span>
            <strong>
              {windEastMs >= 0 ? `+${windEastMs}` : windEastMs} /{' '}
              {windNorthMs >= 0 ? `+${windNorthMs}` : windNorthMs} m/s
            </strong>
          </div>
          <div className="whatif-wind-presets">
            <button
              className="pill-btn"
              onClick={() => {
                setWindEastMs(0);
                setWindNorthMs(0);
              }}
            >
              Calm
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                setWindEastMs(-18);
                setWindNorthMs(0);
              }}
            >
              Head 18
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                setWindEastMs(0);
                setWindNorthMs(25);
              }}
            >
              Cross 25
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                setWindEastMs(-30);
                setWindNorthMs(30);
              }}
            >
              Storm 42
            </button>
          </div>
          <div className="whatif-row-2">
            <label>
              <span>East (m/s)</span>
              <input
                type="range"
                min={-50}
                max={50}
                step={2}
                value={windEastMs}
                onChange={(e) => setWindEastMs(Number(e.target.value))}
              />
            </label>
            <label>
              <span>North (m/s)</span>
              <input
                type="range"
                min={-50}
                max={50}
                step={2}
                value={windNorthMs}
                onChange={(e) => setWindNorthMs(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        {/* Target Orbit */}
        <div className="whatif-group">
          <div className="whatif-label-row">
            <span>Target Orbit</span>
            <strong>
              {targetAltKm} km • {targetInclDeg.toFixed(1)}°
            </strong>
          </div>
          <div className="whatif-row-2">
            <label>
              <span>Altitude (km)</span>
              <input
                type="range"
                min={160}
                max={650}
                step={10}
                value={targetAltKm}
                onChange={(e) => setTargetAltKm(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Inclination (°)</span>
              <input
                type="range"
                min={28.5}
                max={104.0}
                step={0.1}
                value={targetInclDeg}
                onChange={(e) => setTargetInclDeg(Number(e.target.value))}
                data-testid="whatif-inclination-slider"
              />
            </label>
          </div>
          {!corridorCheck.valid && (
            <div
              data-testid="whatif-corridor-error"
              role="alert"
              style={{
                marginTop: '6px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.16)',
                border: '1px solid rgba(239, 68, 68, 0.55)',
                color: '#fecaca',
                fontSize: '11px',
                lineHeight: 1.35,
              }}
            >
              {corridorCheck.message}
            </div>
          )}
        </div>

        <div className="whatif-actions">
          <button
            className="pill-btn active whatif-run-btn"
            disabled={loading || !corridorCheck.valid}
            onClick={handleRun}
            data-testid="whatif-run-btn"
          >
            {loading ? 'Running RK4…' : 'Run Scenario'}
          </button>
          <button
            className="pill-btn"
            disabled={loading || !isWhatIfActive}
            onClick={resetToNominal}
            data-testid="whatif-reset-btn"
          >
            Reset Nominal
          </button>
        </div>

        {loading && (
          <div className="whatif-progress" data-testid="whatif-progress">
            <div className="whatif-progress-bar">
              <div
                className="whatif-progress-fill"
                style={{ width: `${Math.round(loadingProgress * 100)}%` }}
              />
            </div>
            <span>{loadingStage || 'Integrating…'}</span>
          </div>
        )}
      </div>

      {/* Honest Outcomes */}
      {trajectory && (
        <section className="insp-section" data-testid="whatif-outcomes">
          <div className="insp-sec-title">MISSION OUTCOMES (HONEST)</div>
          <div className="whatif-outcome-badges">
            <span
              className={`outcome-tag ${trajectory.orbitAchieved ? 'ok' : 'err'}`}
            >
              {trajectory.orbitAchieved
                ? `ORBIT ${(trajectory.orbit.perigeeAltitudeM / 1000).toFixed(0)}×${(trajectory.orbit.apogeeAltitudeM / 1000).toFixed(0)} km`
                : `NO ORBIT (${(trajectory.orbit.perigeeAltitudeM / 1000).toFixed(0)}×${(trajectory.orbit.apogeeAltitudeM / 1000).toFixed(0)} km)`}
            </span>
            <span
              className={`outcome-tag ${
                trajectory.boosterOutcome === 'LANDED'
                  ? 'ok'
                  : trajectory.boosterOutcome === 'EXPENDED'
                    ? 'warn'
                    : 'err'
              }`}
            >
              S1 {trajectory.boosterOutcome}
            </span>
          </div>
          {trajectory.boosterFailureReason && (
            <p className="whatif-failure-reason" data-testid="whatif-failure-reason">
              Failure reason: {trajectory.boosterFailureReason}
            </p>
          )}
          <div className="insp-live-grid">
            <div className="insp-live-row">
              <span>S1 Fuel Margin</span>
              <strong>
                {trajectory.boosterPropRemainingKg.toFixed(0)} kg ({s1PropPct.toFixed(1)}%)
              </strong>
            </div>
            <div className="insp-live-row">
              <span>S2 Fuel Margin</span>
              <strong>
                {trajectory.stage2PropRemainingKg.toFixed(0)} kg ({s2PropPct.toFixed(1)}%)
              </strong>
            </div>
            <div className="insp-live-row">
              <span>Final Inclination</span>
              <strong>{trajectory.orbit.inclinationDeg.toFixed(2)}°</strong>
            </div>
          </div>
        </section>
      )}

      {/* Diff vs Nominal */}
      {trajectory && nominal && (
        <section className="insp-section" data-testid="whatif-diff">
          <div className="insp-sec-title">
            DIFF VS NOMINAL{' '}
            {loading ? '(COMPUTING…)' : isWhatIfActive ? '(ACTIVE)' : '(BASELINE)'}
          </div>
          <div className="insp-live-grid">
            <div className="insp-live-row">
              <span>MECO Time</span>
              <strong>
                {trajectory.mecoTimeS.toFixed(1)} s{' '}
                <span className="diff-delta">
                  ({formatDelta(trajectory.mecoTimeS - nominal.mecoTimeS, 's')})
                </span>
              </strong>
            </div>
            <div className="insp-live-row">
              <span>Booster Apogee</span>
              <strong>
                {(trajectory.boosterApogeeM / 1000).toFixed(1)} km{' '}
                <span className="diff-delta">
                  (
                  {formatDelta(
                    (trajectory.boosterApogeeM - nominal.boosterApogeeM) / 1000,
                    'km'
                  )}
                  )
                </span>
              </strong>
            </div>
            <div className="insp-live-row">
              <span>S1 Prop Left</span>
              <strong>
                {trajectory.boosterPropRemainingKg.toFixed(0)} kg{' '}
                <span className="diff-delta">
                  (
                  {formatDelta(
                    trajectory.boosterPropRemainingKg -
                      nominal.boosterPropRemainingKg,
                    'kg',
                    0
                  )}
                  )
                </span>
              </strong>
            </div>
            <div className="insp-live-row">
              <span>Landing Miss</span>
              <strong>
                {trajectory.landingMode === 'EXPENDABLE'
                  ? '—'
                  : `${trajectory.boosterTouchdownMissM.toFixed(2)} m`}{' '}
                {trajectory.landingMode !== 'EXPENDABLE' && (
                  <span className="diff-delta">
                    (
                    {formatDelta(
                      trajectory.boosterTouchdownMissM -
                        nominal.boosterTouchdownMissM,
                      'm',
                      2
                    )}
                    )
                  </span>
                )}
              </strong>
            </div>
          </div>
        </section>
      )}
    </>
  );

  if (isPhone) {
    return (
      <BottomSheet
        kicker="SCENARIO LAB"
        title="What-If Scenarios"
        onClose={toggleWhatIfPanel}
        testId="whatif-panel"
      >
        {body}
      </BottomSheet>
    );
  }

  return (
    <aside className="whatif-panel" data-testid="whatif-panel">
      <div className="insp-header">
        <div>
          <div className="insp-kicker">SCENARIO LAB</div>
          <h2 className="insp-title">What-If Scenarios</h2>
        </div>
        <button
          className="insp-close"
          onClick={toggleWhatIfPanel}
          aria-label="Close what-if panel"
        >
          ✕
        </button>
      </div>
      {body}
    </aside>
  );
}
