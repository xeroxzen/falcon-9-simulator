import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
  DM1_MISSION,
} from '../sim/config/missions.js';
import { runFullMission } from '../sim/mission.js';
import { RAD_TO_DEG } from '../sim/config/constants.js';

const arg = (process.argv[2] ?? 'asds').toLowerCase();
const mission =
  arg === 'rtls'
    ? DEFAULT_LEO_RTLS_MISSION
    : arg === 'dm1' || arg === 'dm-1'
      ? DM1_MISSION
      : DEFAULT_LEO_ASDS_MISSION;

const t0 = performance.now();
const res = runFullMission(FALCON9_BLOCK5, mission, 1.0);
const elapsedMs = performance.now() - t0;

console.log('================================================================================');
console.log(`Falcon 9 Block 5 — Full Mission Simulation (${mission.name})`);
console.log(`Landing Mode: ${mission.landingMode} | dt = ${mission.dtS} s | Computed in ${elapsedMs.toFixed(1)} ms`);
console.log('================================================================================\n');

console.log('Mission Timeline:');
for (const ev of res.events) {
  console.log(
    `  T+${ev.timeS.toFixed(2).padStart(6)} s | ${ev.type.padEnd(19)} | Alt ${(ev.altitudeM / 1000).toFixed(2).padStart(6)} km | Vel ${(ev.speedMs * 3.6).toFixed(0).padStart(5)} km/h | DR ${(ev.downrangeM / 1000).toFixed(1).padStart(6)} km | ${ev.detail}`
  );
}

console.log('\nStage 2 Final Orbit:');
console.log(`  Orbit Achieved: ${res.orbitAchieved ? 'YES' : 'NO'}`);
console.log(`  Perigee x Apogee: ${(res.orbit.perigeeAltitudeM / 1000).toFixed(2)} km x ${(res.orbit.apogeeAltitudeM / 1000).toFixed(2)} km`);
console.log(`  Eccentricity:     ${res.orbit.eccentricity.toFixed(5)}`);
console.log(`  Inclination:      ${res.orbit.inclinationDeg.toFixed(2)}° (target ${mission.targetInclinationDeg}°)`);
console.log(`  S2 Prop Left:     ${res.stage2Final.dynamic.propellantKg.toFixed(0)} kg (${((res.stage2Final.dynamic.propellantKg / FALCON9_BLOCK5.stage2.propellantMassKg) * 100).toFixed(1)}%)`);

console.log('\nStage 1 Booster Recovery:');
console.log(`  Outcome:          ${res.boosterOutcome}`);
console.log(`  Target Coords:    ${(res.landingTarget.latRad * RAD_TO_DEG).toFixed(4)}°N, ${(res.landingTarget.lonRad * RAD_TO_DEG).toFixed(4)}°E`);
console.log(`  Touchdown Time:   T+${res.boosterFinal.timeS.toFixed(2)} s`);
console.log(`  Touchdown Speed:  v_z = ${res.boosterFinal.verticalSpeedMs.toFixed(2)} m/s, v_h = ${res.boosterFinal.horizontalSpeedMs.toFixed(2)} m/s`);
console.log(`  Lateral Miss:     ${res.boosterFinal.distanceToTargetM.toFixed(1)} m`);
console.log(`  S1 Prop Left:     ${res.boosterFinal.dynamic.propellantKg.toFixed(0)} kg (${((res.boosterFinal.dynamic.propellantKg / FALCON9_BLOCK5.stage1.propellantMassKg) * 100).toFixed(2)}%)`);
