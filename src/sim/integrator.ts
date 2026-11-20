/**
 * Generic deterministic fixed-timestep 4th-order Runge-Kutta (RK4) integrator.
 * Operates on flat numeric arrays or structured states via caller-supplied
 * derivative and linear-combination callbacks.
 */

export interface Rk4Space<S, D> {
  /** Compute state derivative dS/dt at time t and state s */
  derivative(t: number, s: S): D;
  /** Return s + scale * d */
  addScaled(s: S, d: D, scale: number): S;
  /** Combine k1..k4 into final step: s + (dt/6) * (k1 + 2*k2 + 2*k3 + k4) */
  combine(s: S, k1: D, k2: D, k3: D, k4: D, dt: number): S;
}

export function rk4Step<S, D>(
  t: number,
  state: S,
  dt: number,
  space: Rk4Space<S, D>
): S {
  const halfDt = 0.5 * dt;
  const k1 = space.derivative(t, state);
  const k2 = space.derivative(t + halfDt, space.addScaled(state, k1, halfDt));
  const k3 = space.derivative(t + halfDt, space.addScaled(state, k2, halfDt));
  const k4 = space.derivative(t + dt, space.addScaled(state, k3, dt));
  return space.combine(state, k1, k2, k3, k4, dt);
}
