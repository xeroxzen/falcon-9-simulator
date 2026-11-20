import type {
  EngineOutConfig,
  EngineSpec,
  EngineState,
  StageSpec,
} from '../types.js';
import { G0 } from '../config/constants.js';
import { clamp } from '../math.js';

export interface PropulsionOutput {
  readonly totalThrustN: number;
  readonly totalMassFlowKgS: number;
  readonly effectiveIspS: number;
  readonly activeEngineCount: number;
  readonly engines: readonly EngineState[];
}

/**
 * Evaluate a single engine at commanded throttle and ambient pressure.
 *
 * Physics model:
 *   - Choked nozzle mass flow scales linearly with throttle (chamber pressure):
 *       mdot = (throttle * T_vac) / (Isp_vac * g0)
 *   - Thrust includes ambient back-pressure loss across the nozzle exit area:
 *       T = max(0, throttle * T_vac - p_amb * A_exit)
 *   - Effective Isp = T / (mdot * g0), smoothly interpolating between SL and vac.
 */
export function evaluateEngine(
  index: number,
  spec: EngineSpec,
  commandedThrottle: number,
  ambientPressurePa: number,
  failed: boolean,
  hasPropellant: boolean
): EngineState {
  if (failed || !hasPropellant || commandedThrottle <= 0) {
    return {
      index,
      active: false,
      failed,
      throttle: 0,
      thrustN: 0,
      massFlowKgS: 0,
    };
  }

  const throttle = clamp(commandedThrottle, spec.minThrottle, spec.maxThrottle);
  const thrustN = Math.max(
    0,
    throttle * spec.thrustVacuumN - ambientPressurePa * spec.exitAreaM2
  );
  const massFlowKgS = (throttle * spec.thrustVacuumN) / (spec.ispVacuumS * G0);

  return {
    index,
    active: true,
    failed: false,
    throttle,
    thrustN,
    massFlowKgS,
  };
}

/**
 * Evaluate all engines on a stage given commanded throttle, ambient pressure,
 * current mission time, and configured engine-out events.
 */
export function evaluateStagePropulsion(
  stage: StageSpec,
  commandedThrottle: number,
  ambientPressurePa: number,
  timeS: number,
  propellantRemainingKg: number,
  engineOuts: readonly EngineOutConfig[]
): PropulsionOutput {
  const hasPropellant = propellantRemainingKg > 0;
  const engines: EngineState[] = [];
  let totalThrustN = 0;
  let totalMassFlowKgS = 0;
  let activeEngineCount = 0;

  for (let i = 0; i < stage.engineCount; i++) {
    const failed = engineOuts.some(
      (eo) => eo.engineIndex === i && timeS >= eo.timeS
    );
    const st = evaluateEngine(
      i,
      stage.engine,
      commandedThrottle,
      ambientPressurePa,
      failed,
      hasPropellant
    );
    engines.push(st);
    totalThrustN += st.thrustN;
    totalMassFlowKgS += st.massFlowKgS;
    if (st.active) activeEngineCount++;
  }

  const effectiveIspS =
    totalMassFlowKgS > 0 ? totalThrustN / (totalMassFlowKgS * G0) : 0;

  return {
    totalThrustN,
    totalMassFlowKgS,
    effectiveIspS,
    activeEngineCount,
    engines,
  };
}
