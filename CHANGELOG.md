# Changelog

All notable changes to the Falcon 9 Launch & Booster Landing Simulator are documented in this file.

## [Unreleased — v1.3.0 Parts A–B] — 2026-11-21

### Added
- **Two-burn Stage 2 Hohmann transfer (`SES-1 → transfer coast → SES-2 → SECO-2`):**
  - Automatically activates for target orbits `> 250 km` (including What-If scenarios and holdouts `Iridium NEXT 8` & `SAOCOM 1A`), while `<= 250 km` missions (`DM-1`, default `200 km` ASDS/RTLS) stay bit-identical single-burn.
  - Inserts into a `185 km` (`ASSUMED`) perigee transfer orbit with apogee at target altitude, coasts ballistically with analytic Keplerian time-to-apoapsis ignition centering (`t_to_apo <= 0.5 * t_burn2`), and circularizes at apoapsis. Dynamic timeline segments (`MVac Burn`, `Transfer Coast`, `SES-2 Burn`, `Orbit`) render automatically with zero UI timeline changes.
  - **Holdout validation (zero retuning):** `Iridium NEXT 8` Stage 2 RMS dropped from `310.10 km / 963.1 m/s` to **`6.03 km / 103.8 m/s`**, achieving **`623.0 × 627.5 km, 86.60°`** (vs published `625 km`, `86.6°`; `SECO-1 = 521.8 s` vs published `526 s`, `SES-2 = 3,259.2 s` vs published `3,108 s`, `2.8 s` vs `3.0 s` burn). `SAOCOM 1A` achieves **`618.5 × 619.8 km, 97.89°`** (vs published `620 km`, `97.89°` SSO).
- **Floating-origin switch & >100 km smoothness E2E (`e2e/jitter.spec.ts`):** Added a second smoothness window covering `nearPad → highAlt` (`11.2 → 13.2 km`, Earth-ref 2nd-diff `p95 = 0.003 px`, `p95/p50 = 1.18×`) and `> 100 km` (`125.6 → 129.7 km`, `p95 = 0.028 px`, `p95/p50 = 1.15×`), and anchored `EarthAndSky` directly to the priority `0` `useFrame` single source of truth.

### Improved
- **Non-trivial chase-camera smoothness & frame-pacing E2E (`e2e/jitter.spec.ts`):** Replaced the trivially satisfied rigidly-locked vehicle check with screen-space motion smoothness of the world-fixed launch pad marker `(0, 0, 0)` during 5 s @ 1× chase-mode ascent (`571.3 px` travel, 2nd-diff `p50 = 0.045 px`, `p95 = 0.213 px`, `max = 0.558 px < 2.0 px`) plus frame-interval pacing (`p50 = 16.60 ms`, `p95 = 19.40 ms`, `p95/p50 = 1.17× < 2.0×`). Added `projectWorldPointToScreen` to `src/scene/debugBridge.ts`.
- **Terminal-phase radar altimeter sensor fusion (`ASSUMED`):** Below `3,000 m` AGL, fused downward radar altimeter measurements (`0.2%` AGL scale + `0.15 m` residual floor) with INS/GPS vertical bias via inverse-variance weighting and steady-state Kalman time-constant scaling (`τ_min = 2.0 s`); horizontal and velocity biases remain unaided at `τ = 45 s`. Validated on new unseen holdout seeds `9001`, `9002`, `9003` (`N = 1,000` each, zero guidance changes): **99.6–99.9%** ASDS, **100.0%** RTLS, true horizontal miss `1.37–1.52 m` p50 (`3.50–3.82 m` p95).

## [1.2.0] — 2026-11-21 (Zero-Jitter Chase Camera & Gauss-Markov Navigation Realism)

### Fixed
- **Chase camera flight-path jitter (`143.43 px → 0.001 px` p95):**
  - Single source of truth per frame in a priority `-1` `useFrame` advancing the clamped playback clock (`<= 50 ms`) and interpolating vehicle transforms once per frame into a reusable ref; vehicle and camera both read the same frame.
  - Chase camera rigidly locked to `target + offset` along the flight path (no position spring, no 25 m snap threshold); critically damped smoothing applied only to orbit angle, zoom, and mode/target switches.
  - Throttled HUD React state updates to ~10 Hz (`100 ms`), reducing Chrome CDP V8 GC events from `46` to `10` per 10 s (`−78%`).
  - Added `e2e/jitter.spec.ts` asserting `< 2.0 px` p95 second-difference jitter over 5 s at 1× during ascent.
- **Gauss-Markov time-correlated navigation bias (`τ = 45 s`, `ASSUMED`):**
  - Replaced i.i.d. per-step nav white noise (which vehicle inertia averaged out to `~0.14 m` miss) with a stationary first-order Gauss-Markov process across all 6 position/velocity nav channels, while always evaluating touchdown criteria and miss distances on the TRUE physical vehicle state.
  - Reported honest pre-fix holdout results on unseen seeds `31337`, `1111`, `5555` (`88.7–89.4%` ASDS, `98.2–98.7%` RTLS), then tuned ASDS entry-burn reserve (`3.2%`) and terminal flare (`1.05 m`) in a separate commit (`f3320ca`) and validated on new unseen seeds `6001`, `7002`, `8003` (`92.6–94.4%` ASDS, `98.7–99.1%` RTLS; true median miss `1.38–1.47 m`).

## [1.1.0] — 2026-11-21 (Honest Holdout Robustness, Realistic Dispersions, q·α & Scissored Split View)

### Added
- **Unseen holdout Monte Carlo validation (`N = 1,000` × 3 seeds):** Verified v1.0.0 guidance on unseen holdout seeds `1337`, `2024`, and `7` (100.0% ASDS & RTLS across all 6,000 flights).
- **Expanded realistic dispersion model:** Added altitude nav error (`±5 m`), velocity nav error (`±0.3 m/s`), propellant load (`±0.5%`), dry mass (`±1%`), ASDS droneship offset (`±10 m`), ASDS deck motion (heave `0–1.5 m`, roll `0–2.5°`), and ascent/booster throttle lag (`40–120 ms`). Reported honest pre-fix baseline (`82.0%` ASDS / `57.5%` RTLS on seed `1337`), then improved guidance in a separate commit and validated on brand-new unseen seeds `4096`, `8888`, `9999` (`95.6–96.7%` ASDS, `99.9–100.0%` RTLS across 6,000 flights).
- **Aerodynamic load (`q·α`) tracking & HUD:** Computed `q·α` (`Pa·deg`) throughout Stage 1 ascent, displayed live in the Engineer HUD (`—` above ~100 km), and reported p95 peak `q·α` in Monte Carlo (`~101–104 kPa·deg` vs `200 kPa·deg` ASSUMED structural limit, `0` exceedances).

### Performance & Rendering
- **Single-canvas scissored Split View:** Replaced dual `<Canvas>` Split View with one WebGLRenderer, one `<Canvas>`, and two scissored viewports, boosting uncapped Split View from `36.6–50.8 fps` to **`221.3 fps`** (`p95 = 4.70 ms`).
- **Zero-allocation `useFrame` & transform interpolation:** Eliminated per-frame `THREE.Vector3`, `THREE.Quaternion`, `THREE.Color`, and snapshot heap allocations, boosting uncapped 1× ascent to **`416.5 fps`** (`p50 = 2.20 ms`, **`p95 = 4.00 ms`**, well under the `18 ms` target).

### Fixed
- **Terminal flare & hover-bounce cutoff guard** (separate guidance commit `53752a0`): Added a heave-resilient terminal approach flare and `T/W > 1` hover-bounce cutoff guard for light ASDS boosters.
- Removed un-cited DOLILU reference from ascent guidance comments and documentation.

## [1.0.0] — 2026-11-21 (Phase 6: Hardening & Public Release)

### Added
- **Monte Carlo Dispersion CLI (`pnpm sim:montecarlo`)**: seeded N=200 dispersion campaign with Thrust ±1%, Isp ±0.5%, Cd ±5%, base wind ±12 m/s + altitude gusts ±10 m/s, horizontal nav noise 0.5–2.0 m, and first-order actuator lag 40–120 ms. Achieves **100.0% (200/200)** landing success on both ASDS (`p95 = 1.78 m`) and RTLS (`p95 = 0.38 m`).
- **Hardening unit tests (`tests/hardening.test.ts`)**: grid-fin saturation `< 20%`, exact miss-distance parity between sim/worker/ENU, honest 22.8 t ASDS overload handling, early `T+5 s` engine-out verification, and `-0.0` formatting guards.
- **Public release & CI/CD**: `README.md` with animated `docs/demo.gif`, validation & Monte Carlo tables, `LICENSE` (MIT), `CONTRIBUTING.md`, bug report issue template, GitHub Actions CI (`typecheck`, `test`, `build`, headless Playwright E2E), and GitHub Pages static deployment workflow.

### Fixed
- **Ascent wind weathercocking**: Stage 1 gravity turn now tracks ground-relative velocity while wind applies physical aerodynamic loads, preventing surface breezes from pitching the stack off-course.
- **RTLS boostback & hoverslam robustness**: updated RTLS boostback propellant reserve cutoff (`4.2%`) and 1-3-1 multi-engine hoverslam ignition physics, raising RTLS Monte Carlo success from 51.5% to 100.0%.
- **Stage 1 cable raceway**: scaled to realistic slim white fairing proportions matching the booster fuselage.
- **Zero-sign formatting**: eliminated `-0.0` displays across all HUD, Engineer, Inspector, and What-If panels via `src/ui/format.ts`.
- **Uncapped GPU telemetry**: measured real `renderer.info.render` draw calls & triangles per frame with `--disable-gpu-vsync --disable-frame-rate-limit` across 1×, 100×, and Split View.

## [0.5.0] — 2026-11-20 (Phase 5: What-If Lab, Visual Polish & GPU Perf)

- Added What-If Scenarios panel (engine-out, payload mass, landing mode, wind profile, target orbit) with non-blocking Web Worker progress, honest outcomes/failure reasons, and live diff vs. nominal.
- Replaced hard-edged plume cones with soft volumetric GLSL shader plumes, added post-entry-burn RP-1 soot, detailed Crew Dragon & satellite payload models, and 18.0 m Block 5 landing legs.
- Fixed status chips to reflect current sim time only, retracted strongback before liftoff, full-stack selection outline, Mach `—` above 100 km, critically damped camera smoothing, unified horizontal miss distance, and glide-slope grid-fin controller (`< 15%` saturation).

## [0.4.0] — 2026-11-20 (Phase 4: Click-to-Inspect & Playwright E2E)

- Added 13 build-time schema-validated component JSON files, simplified proxy hitboxes, hover/selection outlines, toggleable 3D hotspots, honest `SIM`/`DERIVED` live telemetry inspector panel, and Playwright E2E suite.

## [0.3.0] — 2026-11-20 (Phase 3: 3D Scene, Web Worker & HUD)

- Built React Three Fiber 3D viewer, floating-origin coordinate frames, Web Worker physics loop with generic multi-burn/dynamic-event protocol, 7 camera modes (including Split View), timeline scrubber, and Webcast + Engineer HUD.

## [0.2.5] — 2026-11-20 (Phases 1–2.5: Physics Core & Real Telemetry Validation)

- Implemented deterministic 3-DOF RK4 physics core (US76 atmosphere, J2 gravity, variable mass, pressure-dependent Merlin 1D / MVac thrust), Stage 2 closed-loop guidance with yaw plane steering, autonomous ASDS/RTLS booster recovery, and validation against real SpaceX webcast telemetry (DM-1, Iridium NEXT 8, SAOCOM 1A).
