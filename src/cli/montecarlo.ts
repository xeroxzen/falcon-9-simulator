import { ASSUMED_MAX_Q_ALPHA_PA_DEG } from '../sim/config/constants.js';
import { FALCON9_BLOCK5 } from '../sim/config/falcon9.js';
import {
  DEFAULT_LEO_ASDS_MISSION,
  DEFAULT_LEO_RTLS_MISSION,
} from '../sim/config/missions.js';
import { runMonteCarlo } from '../sim/montecarlo.js';

const trials = Number(process.argv[2] ?? 200);
const seed = Number(process.argv[3] ?? 1337);

console.log(
  `\nFalcon 9 Block 5 Monte Carlo Dispersion Campaign (N=${trials}, seed=${seed})`
);
console.log(
  'Dispersions: Thrust ±1%, Isp ±0.5%, Cd ±5%, Prop ±0.5%, DryMass ±1%, Wind ±12 m/s + Gusts ±10 m/s, Nav ±2m/±5m/±0.3m/s, ASDS ±10m + Heave/Roll, Lag 40-120 ms\n'
);

for (const mission of [DEFAULT_LEO_ASDS_MISSION, DEFAULT_LEO_RTLS_MISSION]) {
  const s = runMonteCarlo(FALCON9_BLOCK5, mission, trials, seed);
  console.log(`=== ${s.landingMode} (${s.missionId}) ===`);
  console.log(
    `  Landing success : ${s.landedCount}/${s.trials} (${s.successRatePct.toFixed(1)}%)`
  );
  console.log(`  Orbit achieved  : ${s.orbitSuccessRatePct.toFixed(1)}%`);
  console.log(
    `  Miss distance   : p50 = ${s.missP50M.toFixed(2)} m | p95 = ${s.missP95M.toFixed(2)} m`
  );
  console.log(
    `  S1 fuel margin  : p5  = ${s.fuelMarginP5Kg.toFixed(0)} kg (${s.fuelMarginP5Pct.toFixed(2)}%)`
  );
  console.log(
    `  Peak q·alpha    : p95 = ${s.peakQAlphaP95KpaDeg.toFixed(1)} kPa·deg (limit ${(ASSUMED_MAX_Q_ALPHA_PA_DEG / 1000).toFixed(0)} kPa·deg, exceed=${s.qAlphaExceedCount}/${s.trials})`
  );
  if (Object.keys(s.failureBreakdown).length > 0) {
    console.log('  Failure modes   :', s.failureBreakdown);
  }
  console.log(`  Runtime         : ${(s.elapsedMs / 1000).toFixed(1)} s\n`);
}
