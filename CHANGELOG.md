# Changelog

All notable changes to the Falcon 9 Launch & Booster Landing Simulator are documented in this file.

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
