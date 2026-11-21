import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DM1_MISSION,
  IRIDIUM_NEXT_8_MISSION,
  SAOCOM_1A_MISSION,
} from '../sim/config/missions.js';
import { runFullMission } from '../sim/mission.js';
import { loadMissionTelemetry } from '../validation/load-telemetry.js';
import {
  compareBoosterToTelemetry,
  compareMissionToTelemetry,
  type EventDelta,
} from '../validation/compare.js';
import type { MissionConfig } from '../sim/types.js';

const telemetryRoot =
  process.argv[2] ?? '/Users/andilejaden/Developer/OpenSource/Telemetry-Data';

function fmtDelta(label: string, d: EventDelta | null, unit: string, scale = 1) {
  if (!d) return;
  console.log(
    `  ${label.padEnd(18)} | Real: ${(d.real * scale).toFixed(2).padStart(8)} ${unit} | Sim: ${(d.sim * scale).toFixed(2).padStart(8)} ${unit} | Delta: ${(d.delta >= 0 ? '+' : '') + (d.delta * scale).toFixed(2).padStart(7)} ${unit} (${(d.relErrorPct >= 0 ? '+' : '') + d.relErrorPct.toFixed(2)}%)`
  );
}

function runAndPrintMission(
  telemetryDirName: string,
  mission: MissionConfig,
  tag: string,
  showBooster: boolean
) {
  const real = loadMissionTelemetry(telemetryRoot, telemetryDirName);
  const sim = runFullMission(FALCON9_BLOCK5, mission, 1.0);
  const report = compareMissionToTelemetry(sim, real);

  console.log('\n================================================================================');
  console.log(`[${tag}] ${telemetryDirName} (Sim vs SpaceX Webcast — ${report.velocityFrame})`);
  console.log('================================================================================');

  console.log('\nKey Event Deltas:');
  fmtDelta('Max-Q Time', report.maxQTimeDelta, 's');
  fmtDelta('MECO Time', report.mecoTimeDelta, 's');
  fmtDelta('MECO Altitude', report.mecoAltDelta, 'km', 0.001);
  fmtDelta('MECO Velocity', report.mecoVelDelta, 'm/s');

  console.log('\nAscent / Stage 2 Phase RMS Errors:');
  console.log('  Phase              | Window (s)   | N   | Alt RMS (km) | Vel RMS (m/s)');
  console.log('  -------------------+--------------+-----+--------------+--------------');
  for (const p of report.phaseErrors) {
    console.log(
      `  ${p.phaseName.padEnd(18)} | ${p.startTimeS.toFixed(0).padStart(4)} .. ${p.endTimeS.toFixed(0).padStart(4)} | ${String(p.sampleCount).padStart(3)} | ${(p.altitudeRmsM / 1000).toFixed(2).padStart(12)} | ${p.velocityRmsMs.toFixed(1).padStart(13)}`
    );
  }

  const seco1Ev = sim.events.find((e) => e.type === 'SECO_1');
  const ses2Ev = sim.events.find((e) => e.type === 'SES_2');
  const seco2Ev = sim.events.find((e) => e.type === 'SECO_2');
  if (seco1Ev) {
    console.log(`\nStage 2 Events:`);
    console.log(`  SECO-1 @ T+${seco1Ev.timeS.toFixed(1)} s (${seco1Ev.detail})`);
    if (ses2Ev && seco2Ev) {
      console.log(
        `  SES-2  @ T+${ses2Ev.timeS.toFixed(1)} s -> SECO-2 @ T+${seco2Ev.timeS.toFixed(1)} s (burn ${(seco2Ev.timeS - ses2Ev.timeS).toFixed(1)} s, coast ${(ses2Ev.timeS - seco1Ev.timeS).toFixed(0)} s)`
      );
    }
  }

  console.log(
    `\nSim Orbit: ${(sim.orbit.perigeeAltitudeM / 1000).toFixed(1)} x ${(sim.orbit.apogeeAltitudeM / 1000).toFixed(1)} km, incl ${sim.orbit.inclinationDeg.toFixed(3)}° (target ${mission.targetInclinationDeg}°)`
  );
  console.log(
    `Sim Booster: ${sim.boosterOutcome} @ T+${sim.boosterFinal.timeS.toFixed(1)}s | v_z=${sim.boosterFinal.verticalSpeedMs.toFixed(2)} m/s, v_h=${sim.boosterFinal.horizontalSpeedMs.toFixed(2)} m/s, tilt=${sim.boosterFinal.tiltFromVerticalDeg.toFixed(2)}°, miss=${sim.boosterFinal.distanceToTargetM.toFixed(2)} m`
  );

  if (showBooster) {
    const bRep = compareBoosterToTelemetry(sim, real);
    if (bRep) {
      console.log('\n--- Stage 1 Booster Recovery Telemetry Comparison ---');
      fmtDelta('Booster Apogee Alt', bRep.apogeeAltDelta, 'km', 0.001);
      fmtDelta('Booster Apogee T', bRep.apogeeTimeDelta, 's');
      fmtDelta('Touchdown Time', bRep.landingTimeDelta, 's');
      console.log('\nBooster Phase RMS Errors:');
      console.log('  Phase              | Window (s)   | N   | Alt RMS (km) | Vel RMS (m/s)');
      console.log('  -------------------+--------------+-----+--------------+--------------');
      for (const p of bRep.phaseErrors) {
        console.log(
          `  ${p.phaseName.padEnd(18)} | ${p.startTimeS.toFixed(0).padStart(4)} .. ${p.endTimeS.toFixed(0).padStart(4)} | ${String(p.sampleCount).padStart(3)} | ${(p.altitudeRmsM / 1000).toFixed(2).padStart(12)} | ${p.velocityRmsMs.toFixed(1).padStart(13)}`
        );
      }
      console.log('\nBooster Overlay (post-MECO):');
      console.log('  T+s   | Real Alt(km) | Sim Alt(km) | Real Vel(m/s) | Sim Vel(m/s)');
      console.log('  ------+--------------+-------------+---------------+-------------');
      for (const r of bRep.overlayRows) {
        console.log(
          `  ${String(r.timeS).padStart(5)} | ${(r.realAltM / 1000).toFixed(1).padStart(12)} | ${(r.simAltM / 1000).toFixed(1).padStart(11)} | ${r.realVelMs.toFixed(0).padStart(13)} | ${r.simVelMs.toFixed(0).padStart(12)}`
        );
      }
    }
  }
}

runAndPrintMission('DM-1', DM1_MISSION, 'PRIMARY', false);
runAndPrintMission('Iridium NEXT 8', IRIDIUM_NEXT_8_MISSION, 'HOLDOUT #1 — ASDS, ZERO RETUNING', true);
runAndPrintMission('SAOCOM 1A', SAOCOM_1A_MISSION, 'HOLDOUT #2 — RTLS, ZERO RETUNING', true);
