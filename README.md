# Falcon 9 Block 5 Launch & Booster Landing Simulator

An interactive 3D browser simulation of a **Falcon 9 Block 5** orbital launch and autonomous first-stage booster recovery (liftoff → Max-Q → MECO → stage separation → Stage 2 ascent to orbit, in parallel with booster flip → boostback → entry burn → titanium grid-fin aerodynamic descent → hoverslam landing burn → touchdown on ASDS droneship or RTLS landing zone).

Built with **physics fidelity over spectacle**: a pure TypeScript, deterministic RK4 (`dt = 0.01 s`) simulation core decoupled from rendering, validated against real SpaceX webcast telemetry, stress-tested with a seeded Monte Carlo dispersion campaign, and paired with a React Three Fiber 3D viewer, click-to-inspect hardware panels, and a What-If scenario lab.

![Falcon 9 Simulator Demo](docs/demo.gif)

---

## Features

- **Pure TypeScript 3-DOF RK4 Physics Core** (`src/sim/`, zero Three.js/DOM imports):
  - Earth-centered inertial (ECI) integration with rotating WGS-84 Earth (`ω = 7.2921e-5 rad/s`), inverse-square gravity + optional J2 oblateness, and US Standard Atmosphere 1976 up to 86 km + exponential tail.
  - Pressure-dependent thrust (`T = T_vac − p_amb · A_exit`) and variable mass flow (`ṁ = T / (Isp · g₀)`) across 9× Merlin 1D (Stage 1) and 1× MVac (Stage 2).
  - Closed-loop Stage 2 linear-tangent orbital insertion with yaw plane steering (`< 0.05°` inclination error) and ZEM/ZEV optimal powered descent + terminal upright alignment gate for Stage 1 recovery.
- **Interactive 3D Viewer** (React Three Fiber + Three.js + Web Worker):
  - Floating-origin precision from pad liftoff to 200+ km LEO, soft volumetric GLSL exhaust plumes, post-entry-burn RP-1 soot, 18 m Block 5 landing legs, detailed Crew Dragon & satellite payload models.
  - 7 camera modes (Chase, Free Orbit, Pad, LZ/ASDS, Onboard S1, Onboard S2, and post-separation Split View) with critically damped camera smoothing.
  - Deterministic timeline scrubber with dynamic per-stage burn/coast segments and event markers (`0.25×` to `100×`).
- **Click-to-Inspect Component Panels**:
  - 13 sourced hardware components (`src/content/components/*.json`, validated at build time) with simplified proxy hitboxes, hover/selection outlines, toggleable 3D hotspots, and strictly honest live telemetry (`SIM` / `DERIVED` badges; no cosmetic values presented as data).
- **What-If Scenario Lab**:
  - Test Stage 1 engine-out (engine `#1..#9` at time `t`), payload mass (`0–22.8 t`), recovery mode (`ASDS` / `RTLS` / `EXPENDABLE`), wind profiles, and target orbit in the Web Worker with honest outcomes, fuel margins, failure reasons, and a live diff vs. the nominal baseline.

---

## Quick Start

```bash
pnpm install
pnpm dev              # Start interactive 3D app at http://localhost:5173
```

### CLI & Test Commands

```bash
pnpm typecheck        # Strict TypeScript check
pnpm test             # Vitest physics, schema, worker-store & hardening tests
pnpm build            # Build-time component schema validation + production bundle
pnpm preview          # Preview production static build locally
pnpm sim:ascent       # Headless Stage 1 ascent CLI
pnpm sim:mission      # Headless full mission CLI (Stage 2 + booster recovery)
pnpm sim:validate     # Compare sim against real SpaceX webcast telemetry
pnpm sim:montecarlo   # Run N=200 seeded Monte Carlo dispersion campaign (ASDS & RTLS)
pnpm e2e              # Playwright E2E suite in headed Chromium (HEADLESS=1 for SwiftShader)
```

---

## Real Webcast Telemetry Validation

Validated against OCR-cleaned SpaceX webcast telemetry ([shahar603/Telemetry-Data](https://github.com/shahar603/Telemetry-Data)) in the **Earth-relative (ECEF)** speed frame (empirically verified and documented in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)). Holdout missions use the exact baseline guidance with **zero per-mission retuning**.

| Mission | Role | Max-Q Δt | MECO Δt | Ascent→Max-Q Alt / Vel RMS | Max-Q→MECO Alt / Vel RMS | Booster Recovery |
| --- | --- | --- | --- | --- | --- | --- |
| **Crew Dragon DM-1** | Primary (ASDS) | `-2.25 s (-3.81%)` | `-7.62 s (-4.82%)` | `0.18 km` / `23.1 m/s` | `6.71 km` / `118.3 m/s` | LANDED (`0.24 m` miss, `0.00°` tilt) |
| **Iridium NEXT 8** | Holdout #1 (ASDS, 0 retuning) | `-3.56 s (-5.84%)` | `-6.69 s (-4.46%)` | `0.07 km` / `8.3 m/s` | `3.25 km` / `217.7 m/s` | LANDED (`2.63 m` miss, `0.00°` tilt) |
| **SAOCOM 1A** | Holdout #2 (RTLS, 0 retuning) | `-1.79 s (-3.09%)` | `-9.36 s (-6.59%)` | `0.09 km` / `3.6 m/s` | `0.55 km` / `185.7 m/s` | LANDED (`3.05 m` miss, apogee `-6.2%`, touchdown `-3.7%`) |

*Note on Stage 2 holdouts:* Real Iridium NEXT 8 and SAOCOM 1A fly a **two-burn** Stage 2 profile (park orbit + circularization burn), whereas the current simulator models a single continuous Stage 2 burn (tracked in [docs/BACKLOG.md](docs/BACKLOG.md)).

### Monte Carlo Dispersion Robustness (`N = 1,000` per Unseen Holdout Seed)

All robustness numbers below are measured on **unseen holdout seeds** (zero tuning on these seeds).

#### 1. v1.0.0 Dispersion Set (Unseen Holdout Seeds `1337`, `2024`, `7` — Zero Guidance Changes)
Dispersions: Thrust `±1%`, Isp `±0.5%`, `Cd ±5%`, base wind `±12 m/s` + gusts `±10 m/s`, horizontal nav noise `0.5–2.0 m`, actuator lag `40–120 ms`.

| Profile | Seed (`N=1000`) | Landing Success | Orbit Achieved | Miss (p50 / p95) | S1 Fuel Margin (p5) |
| --- | --- | --- | --- | --- | --- |
| **ASDS** | `1337` | **1000/1000 (100.0%)** | 100.0% | `0.97 m` / `1.81 m` | `2,378 kg` (`0.58%`) |
| **ASDS** | `2024` | **1000/1000 (100.0%)** | 100.0% | `0.98 m` / `1.87 m` | `2,345 kg` (`0.57%`) |
| **ASDS** | `7` | **1000/1000 (100.0%)** | 100.0% | `0.99 m` / `1.75 m` | `2,383 kg` (`0.58%`) |
| **RTLS** | `1337` | **1000/1000 (100.0%)** | 100.0% | `0.15 m` / `0.36 m` | `6,125 kg` (`1.49%`) |
| **RTLS** | `2024` | **1000/1000 (100.0%)** | 100.0% | `0.14 m` / `0.36 m` | `6,160 kg` (`1.50%`) |
| **RTLS** | `7` | **1000/1000 (100.0%)** | 100.0% | `0.14 m` / `0.38 m` | `6,192 kg` (`1.51%`) |

#### 2. v1.3.0-dev Full Realistic Dispersion Set with Gauss-Markov Nav + Terminal Radar Altimeter Aiding (Unseen Holdout Seeds `9001`, `9002`, `9003` — Zero Guidance Changes)
Dispersions: Thrust `±1%`, Isp `±0.5%`, `Cd ±5%`, propellant load `±0.5%`, dry mass `±1%`, base wind `±12 m/s` + gusts `±10 m/s`, ASDS droneship offset `±10 m`, ASDS deck heave `0–1.5 m` & roll `0–2.5°`, throttle/actuator lag `40–120 ms`, **first-order Gauss-Markov (`τ = 45 s`, `ASSUMED`) time-correlated navigation biases** (horizontal `σ = 0.5–2.0 m`, altitude `3σ = ±5 m`, velocity `3σ = ±0.3 m/s`), plus **terminal-phase radar altimeter aiding** below `3,000 m` AGL (`0.2%` AGL scale + `0.15 m` residual floor, inverse-variance fusion, `τ_min = 2.0 s`, `ASSUMED`; horizontal & velocity channels unaided). Touchdown criteria and miss distances are **always evaluated on the TRUE vehicle position**.

| Profile | Seed (`N=1000`) | Landing Success | Orbit Achieved | True Miss (p50 / p95) | S1 Fuel (p5) | Peak `q·α` (p95) |
| --- | --- | --- | --- | --- | --- | --- |
| **ASDS** | `9001` | **996/1000 (99.6%)** | 100.0% | `1.52 m` / `3.82 m` | `3,557 kg` (`0.87%`) | `102.1 kPa·deg` (`0` exceed) |
| **ASDS** | `9002` | **997/1000 (99.7%)** | 100.0% | `1.43 m` / `3.68 m` | `3,604 kg` (`0.88%`) | `103.9 kPa·deg` (`0` exceed) |
| **ASDS** | `9003` | **999/1000 (99.9%)** | 100.0% | `1.48 m` / `3.50 m` | `3,570 kg` (`0.87%`) | `101.7 kPa·deg` (`0` exceed) |
| **RTLS** | `9001` | **1000/1000 (100.0%)** | 100.0% | `1.39 m` / `3.67 m` | `5,616 kg` (`1.37%`) | `101.3 kPa·deg` (`0` exceed) |
| **RTLS** | `9002` | **1000/1000 (100.0%)** | 100.0% | `1.37 m` / `3.55 m` | `5,664 kg` (`1.38%`) | `102.5 kPa·deg` (`0` exceed) |
| **RTLS** | `9003` | **1000/1000 (100.0%)** | 100.0% | `1.39 m` / `3.57 m` | `5,628 kg` (`1.37%`) | `102.7 kPa·deg` (`0` exceed) |

*Note: Seed `42` was the v1.0.0 development seed and is excluded from all holdout tables. Without radar altimeter aiding (v1.2.0, full `±5 m` INS/GPS vertical bias at touchdown), unseen holdout seeds `6001`, `7002`, and `8003` achieved `92.6–94.4%` ASDS and `98.7–99.1%` RTLS (`1.38–1.47 m` true median miss). Adding physically motivated terminal radar altimeter sensor fusion below `3,000 m` AGL with zero guidance changes raises ASDS to `99.6–99.9%` (remaining `1–4/1000` failures are ocean heave + residual vertical velocity/altimeter bias `>= 2 m/s`) and RTLS to `100.0%`, while true horizontal median miss (`1.37–1.52 m`) remains physically consistent with the unaided `0.5–2.0 m` 1-sigma horizontal nav bias.*

---

## Model Fidelity & Limitations

This simulator is a **3-DOF (point-mass translational + rate-limited attitude vector)** flight dynamics model, **not** a full 6-DOF rigid-body or CFD simulation. Every public specification, empirical correction, and modeling assumption is explicitly documented in **[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)**.

Key simplifications and assumptions:
- **3-DOF Attitude:** Vehicle orientation is represented as a unit thrust/longitudinal axis vector with finite slew-rate limits rather than full rigid-body Euler/quaternion rotational inertia, TVC gimbal torque dynamics, or propellant slosh.
- **Aerodynamics (`ASSUMED`):** Uses piecewise-linear Mach-dependent `Cd(M)` tables for ascent and tail-first booster descent, plus a simplified linear lift slope (`C_L = 0.8 / rad`) for the titanium grid fins. Transonic buffeting, aeroelastic bending, and individual fin hinge moments are not modeled.
- **Single-Burn Stage 2:** Models one continuous MVac burn (`SES-1` → `SECO-1`) rather than multi-burn coast-and-circularize profiles (GTO / high-LEO).
- **Liftoff Ramp (`EMPIRICAL`):** Includes a 2.0 s empirical thrust ramp (`72% → 100%`) to align early `T+0..10 s` speed with webcast telemetry (real Falcon 9 releases hold-down clamps at full thrust; the early lag reflects webcast display smoothing / clock-zero offset).
- **Cosmetic Visuals:** Per-fin differential tilt, landing-leg hinge swing animation, strongback throw-back, and post-entry soot are visual representations of underlying sim states (never presented as measured telemetry).

---

## License

[MIT](LICENSE)
