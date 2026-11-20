import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
} from '../sim/config/missions.js';
import { runAscentToMeco } from '../sim/simulation.js';

const modeArg = process.argv[2]?.toLowerCase() ?? 'asds';
const mission =
  modeArg === 'rtls' ? DEFAULT_LEO_RTLS_MISSION : DEFAULT_LEO_ASDS_MISSION;

const t0 = performance.now();
const result = runAscentToMeco(FALCON9_BLOCK5, mission, 10.0);
const elapsedMs = performance.now() - t0;

console.log('================================================================================');
console.log(`Falcon 9 Block 5 — Headless Stage 1 Ascent Simulation (${mission.name})`);
console.log(`dt = ${mission.dtS} s | J2 = ${mission.enableJ2 ? 'ON' : 'OFF'} | Payload = ${mission.payloadMassKg.toLocaleString()} kg | Azimuth = ${result.launchAzimuthDeg.toFixed(2)}°`);
console.log(`Computed in ${elapsedMs.toFixed(1)} ms`);
console.log('================================================================================\n');

console.log('Mission Events:');
for (const ev of result.events) {
  console.log(
    `  T+${ev.timeS.toFixed(2).padStart(6)} s | ${ev.type.padEnd(10)} | Alt ${(ev.altitudeM / 1000).toFixed(2).padStart(6)} km | Vel ${(ev.speedMs * 3.6).toFixed(0).padStart(5)} km/h | DR ${(ev.downrangeM / 1000).toFixed(1).padStart(6)} km | ${ev.detail}`
  );
}

console.log('\nTrajectory Samples (every 10 s + MECO):');
console.log(
  '  T+s   | Phase          | Alt(km) | Vel(km/h) | DR(km) | Mach | q(kPa) | Acc(g) | Thr(%) | Mass(t) | Pitch(°)'
);
console.log(
  '  ------+----------------+---------+-----------+--------+------+--------+--------+--------+---------+---------'
);

for (const s of result.samples) {
  console.log(
    `  ${s.timeS.toFixed(1).padStart(5)} | ${s.phase.padEnd(14)} | ${(s.geodetic.altitudeM / 1000).toFixed(2).padStart(7)} | ${(s.speedAirRelMs * 3.6).toFixed(0).padStart(9)} | ${(s.downrangeM / 1000).toFixed(1).padStart(6)} | ${s.mach.toFixed(2).padStart(4)} | ${(s.dynamicPressurePa / 1000).toFixed(2).padStart(6)} | ${s.axialAccelG.toFixed(2).padStart(6)} | ${(s.throttle * 100).toFixed(0).padStart(6)} | ${(s.totalMassKg / 1000).toFixed(1).padStart(7)} | ${s.pitchFromVerticalDeg.toFixed(1).padStart(8)}`
  );
}

const f = result.finalState;
console.log('\nSummary at MECO:');
console.log(`  MECO Time:         T+${f.timeS.toFixed(2)} s`);
console.log(`  Altitude:          ${(f.geodetic.altitudeM / 1000).toFixed(2)} km`);
console.log(`  Air-rel Velocity:  ${(f.speedAirRelMs * 3.6).toFixed(0)} km/h (${f.speedAirRelMs.toFixed(1)} m/s)`);
console.log(`  Inertial Velocity: ${(f.speedInertialMs * 3.6).toFixed(0)} km/h (${f.speedInertialMs.toFixed(1)} m/s)`);
console.log(`  Downrange:         ${(f.downrangeM / 1000).toFixed(2)} km`);
console.log(`  Max-Q:             ${(result.peakDynamicPressurePa / 1000).toFixed(2)} kPa at T+${result.peakDynamicPressureTimeS.toFixed(2)} s`);
console.log(`  Peak Axial Accel:  ${result.peakAxialAccelG.toFixed(2)} g`);
console.log(`  S1 Prop Remaining: ${f.dynamic.stage1PropellantKg.toFixed(0)} kg (${((f.dynamic.stage1PropellantKg / FALCON9_BLOCK5.stage1.propellantMassKg) * 100).toFixed(1)}%)`);
