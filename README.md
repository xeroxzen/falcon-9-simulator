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

Validated against OCR-cleaned SpaceX webcast telemetry ([shahar603/Telemetry-Data](https://github.com/shahar603/Telemetry-Data)) in the **Earth-relative (ECEF)** speed frame (`WEBCAST_LIFTOFF_OFFSET_S = +1.92 s` webcast-clock alignment; see [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)). Shared vehicle parameters (including `maxAxialAccelG = 3.69 g`) were MAP-estimated on the 3-flight fit set only and frozen across all 7 pure Block 5 holdout flights; per-flight pitchover kick (`Kick°`) is treated as a 1-DOF mission trajectory-shaping nuisance parameter. Stage 2 RMS is reported **only** where the simulator flies the same ascent profile through SECO-1.

| Flight | Role | Real Profile | Fitted Kick | Max-Q Δt (B → A) | MECO Δt (B → A) | S1 Alt RMS (B → A) | S1 Vel RMS (B → A) | S2 Vel RMS (B → A) | SECO-1 (Real / B / A) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Crew Dragon DM-1** | Fit | LEO direct | `1.28°` | `-2.3 → +1.7 s` | `-7.6 → -1.7 s` | `5.32 → 0.31 km` | `95 → 55 m/s` | `327 → 106 m/s` | `549 / 558 / 550` |
| **SpaceX CRS-16** | Fit | LEO direct | `1.37°` | `+2.6 → +6.4 s` | `-12.3 → -5.8 s` | `3.47 → 2.13 km` | `178 → 91 m/s` | `295 → 112 m/s` | `538 / 509 / 522` |
| **Iridium NEXT 8** | Fit | LEO two-burn | `1.73°` | `-3.6 → +0.3 s` | `-6.7 → +1.5 s` | `2.51 → 1.16 km` | `168 → 83 m/s` | `125 → 83 m/s` | `526 / 522 / 531` |
| **Bangabandhu-1** | Holdout | GTO | `2.52°` | `-17.6 → -13.5 s` | `-8.6 → -0.1 s` | `8.53 → 0.57 km` | `56 → 16 m/s` | `263 → 47 m/s` | `495 / 500 / 500` |
| **TelStar v19** | Holdout | GTO | `2.41°` | `-15.0 → -10.8 s` | `-9.7 → -1.4 s` | `7.96 → 0.39 km` | `62 → 17 m/s` | `402 → 298 m/s` | `499 / 509 / 511` |
| **Iridium NEXT 7** | Holdout | LEO two-burn | `1.71°` | `-13.6 → -9.7 s` | `-2.7 → +5.5 s` | `2.63 → 0.60 km` | `124 → 31 m/s` | `189 → 237 m/s` | `524 / 525 / 534` |
| **Eshail 2** | Holdout | GTO | `2.44°` | `-2.3 → +1.8 s` | `-8.7 → -0.3 s` | `6.72 → 2.49 km` | `60 → 87 m/s` | `490 → 324 m/s` | `495 / 503 / 504` |
| **GPS III SV01** | Holdout | MEO two-burn | `2.23°` | `-6.5 → -2.4 s` | `-12.6 → -1.0 s` | `10.02 → 1.23 km` | `136 → 62 m/s` | `416 → 202 m/s` | `520 / 505 / 503` |
| **SAOCOM 1A** | Holdout | LEO direct | `1.21°` | `-1.8 → +1.9 s` | `-9.4 → -2.8 s` | `0.43 → 1.56 km` | `143 → 53 m/s` | S1 only *(real 620 km direct vs sim two-burn)* | `607 / n/a` |
| **SSO-A** | Holdout | LEO direct | `1.19°` | `-1.6 → +2.1 s` | `+0.3 → +9.1 s` | `0.37 → 1.28 km` | `184 → 62 m/s` | S1 only *(real 575 km direct vs sim two-burn)* | `600 / n/a` |

*Fair-baseline decomposition (7 holdouts S1; 5 matching-profile holdouts S2): the **vehicle-model fit alone worsens holdout S2 velocity RMS by `+68.5 m/s`** (`152.5 → 220.9 m/s`, driven by later SES-1 timing on GTO/MEO flights); the **net S2 improvement comes from per-flight pitch kicks (`-158.0 m/s`)**. On Stage 1, the MAP vehicle model itself delivers `-2.89 s` Max-Q, `-4.78 s` MECO, `-1.63 km` S1 alt, and `-82.8 m/s` S1 vel (see [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)).*

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

#### 2. v1.3.0 Post-MAP Full Realistic Dispersion Set with Gauss-Markov Nav + Terminal Radar Altimeter Aiding (Unseen Holdout Seeds `117007`, `128008`, `139009`)
Dispersions: Thrust `±1%`, Isp `±0.5%`, `Cd ±5%`, propellant load `±0.5%`, dry mass `±1%`, base wind `±12 m/s` + gusts `±10 m/s`, ASDS droneship offset `±10 m`, ASDS deck heave `0–1.5 m` & roll `0–2.5°`, throttle/actuator lag `40–120 ms`, **first-order Gauss-Markov (`τ = 45 s`, `ASSUMED`) time-correlated navigation biases** (horizontal `σ = 0.5–2.0 m`, altitude `3σ = ±5 m`, velocity `3σ = ±0.3 m/s`), plus **terminal-phase radar altimeter aiding** below `3,000 m` AGL (`0.2%` AGL scale + `0.15 m` residual floor, inverse-variance fusion, `τ_min = 2.0 s`, `ASSUMED`; horizontal & velocity channels unaided). Touchdown criteria and miss distances are **always evaluated on the TRUE vehicle position**.

| Profile | Seed (`N=1000`) | Landing Success | Orbit Achieved | True Miss (p50 / p95) | S1 Fuel (p5) | Peak `q·α` (p95) |
| --- | --- | --- | --- | --- | --- | --- |
| **ASDS** | `117007` | **999/1000 (99.9%)** | 100.0% | `1.69 m` / `4.13 m` | `3,041 kg` (`0.72%`) | `98.8 kPa·deg` (`0` exceed) |
| **ASDS** | `128008` | **999/1000 (99.9%)** | 100.0% | `1.71 m` / `4.20 m` | `3,081 kg` (`0.73%`) | `99.5 kPa·deg` (`0` exceed) |
| **ASDS** | `139009` | **1000/1000 (100.0%)** | 100.0% | `1.66 m` / `4.05 m` | `3,138 kg` (`0.74%`) | `98.2 kPa·deg` (`0` exceed) |
| **RTLS** | `141010` | **1000/1000 (100.0%)** | 100.0% | `1.46 m` / `3.67 m` | `6,561 kg` (`1.55%`) | `98.7 kPa·deg` (`0` exceed) |
| **RTLS** | `152011` | **1000/1000 (100.0%)** | 100.0% | `1.39 m` / `3.48 m` | `6,559 kg` (`1.55%`) | `100.2 kPa·deg` (`0` exceed) |
| **RTLS** | `163012` | **1000/1000 (100.0%)** | 100.0% | `1.43 m` / `3.87 m` | `6,556 kg` (`1.55%`) | `99.5 kPa·deg` (`0` exceed) |

*Note: Seed `42` was the v1.0.0 development seed and is excluded from all holdout tables. Without radar altimeter aiding (v1.2.0, full `±5 m` INS/GPS vertical bias at touchdown), unseen holdout seeds `6001`, `7002`, and `8003` achieved `92.6–94.4%` ASDS and `98.7–99.1%` RTLS (`1.38–1.47 m` true median miss). Adding physically motivated terminal radar altimeter sensor fusion below `3,000 m` AGL with zero guidance changes raises ASDS to `99.6–99.9%` (remaining `1–4/1000` failures are ocean heave + residual vertical velocity/altimeter bias `>= 2 m/s`) and RTLS to `100.0%`, while true horizontal median miss (`1.37–1.52 m`) remains physically consistent with the unaided `0.5–2.0 m` 1-sigma horizontal nav bias.*

---

## Model Fidelity & Limitations

This simulator is a **3-DOF (point-mass translational + rate-limited attitude vector)** flight dynamics model, **not** a full 6-DOF rigid-body or CFD simulation. Every public specification, empirical correction, and modeling assumption is explicitly documented in **[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)**.

Key simplifications and assumptions:
- **3-DOF Attitude:** Vehicle orientation is represented as a unit thrust/longitudinal axis vector with finite slew-rate limits rather than full rigid-body Euler/quaternion rotational inertia, TVC gimbal torque dynamics, or propellant slosh.
- **Aerodynamics (`ASSUMED`):** Uses piecewise-linear Mach-dependent `Cd(M)` tables for ascent and tail-first booster descent, plus a simplified linear lift slope (`C_L = 0.8 / rad`) for the titanium grid fins. Transonic buffeting, aeroelastic bending, and individual fin hinge moments are not modeled.
- **Stage 2 Multi-Burn:** Supports single-burn direct LEO insertion (`<= 250 km`) and automatic two-burn Hohmann transfer (`> 250 km`: `SES-1` → `185 km` parking transfer orbit → ballistic coast → `SES-2` circularization at apoapsis). Direct-ascent >250 km single-burn profiles (such as SAOCOM 1A's lightweight direct SSO loft) and multi-restart GTO/MEO profiles beyond two burns are not modeled separately.
- **Webcast Clock Alignment:** The simulation releases hold-down clamps at full `100%` thrust (`t = 0`), with a single fitted webcast-clock offset (`+1.92 s`) applied only in validation comparisons to align with SpaceX webcast display smoothing / clock-zero sync.
- **Cosmetic Visuals:** Per-fin differential tilt, landing-leg hinge swing animation, strongback throw-back, and post-entry soot are visual representations of underlying sim states (never presented as measured telemetry).

---

## License

[MIT](LICENSE)
