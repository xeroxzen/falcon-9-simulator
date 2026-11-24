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

## Real Webcast Telemetry Validation (v1.7.0 — Solved Boostback Geometry, Close-In ASDS Partial Boostback & Physical Max-Q, `tOff = 0`)

Validated at `dt = 0.01 s` with **`WEBCAST_LIFTOFF_OFFSET_S = 0.0 s` fixed** (hold-down clamp release at `T = 0` modeled directly; `T+0..30 s` fits best at `0 s` with `~39 m / 2.9 m/s` RMS) against 10 pure Falcon 9 Block 5 flights from [shahar603/Telemetry-Data](https://github.com/shahar603/Telemetry-Data) (30 fps OCR resampled to 1 Hz, Earth-relative ECEF speed frame). Primary Max-Q comparisons use the **physical telemetry `q` peak (`0.5 · ρ_US76(alt) · v²`)** rather than the webcast announcer callout (retained in parentheses). The two classes (`Class 0 LEO-like`, `Class 1 GTO-like`) keep the shared v1 `FALCON9_BLOCK5` vehicle & throttle bucket (`22 kPa / Mach 1.02–1.38 / 72%`) with **`EMPIRICAL` effective late-S1 axial acceleration limits** (`2.90 g` LEO / `3.60 g` GTO). Historical missions use their telemetry-fitted ascent pitch kick while `solveMissionAscentDesign` solves recovery variables `(mecoPropellantReserveFraction, boostbackPitchDeg)` over `-4°..-46°` subject to unified `7,500 kg` boostback-class fuel margin, `<= 15%` grid-fin saturation, and Sutton-Graves entry heating proxy (`<= 0.085 MW/m²`); far-ASDS GTO flights remain pure ballistic.

#### Per-Class Holdout Summary (`Fair Baseline → v1.6.0 → v1.7.0`)

| Holdout Class (`dt = 0.01 s`, per-flight kick) | `|Phys Max-Q Δ|` (callout) | `|MECO Δ|` | S1 Alt RMS | S1 Vel RMS | S2 Vel RMS |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Class 0 — LEO-like** (`SAOCOM 1A`, `SSO-A`; S1-only) | `3.05 → 0.59 → 0.59 s` (`0.09 s`) | `4.86 → 1.65 → 0.55 s` | `2.47 → 0.41 → 0.41 km` | `137.9 → 48.9 → 48.9 m/s` | S1-only |
| **Class 1 — GTO-like** (`TelStar v19`, `Iridium 7`, `Eshail 2`, `GPS III`) | `8.78 → 6.18 → 6.18 s` (`7.18 s`) | `8.75 → 2.69 → 2.69 s` | `2.10 → 1.07 → 1.07 km` | `135.2 → 65.8 → 65.8 m/s` | `190.8 → 258.8 → 258.8 m/s` |

*Booster recovery highlights (physics-based predictive Sutton-Graves `0.022 MW/m² / 3.6 g` entry controller + `CALIBRATED (n=2 Block 5)` `Cd(M)` + closed-loop MECO, zero per-flight tuning): across all 8 boostback flights (`2` B5 + `6` independent B3/4) at telemetry-inferred `31 t` aero mass, mean entry ignition-altitude bias is **`+0.06 km`** (`Iridium 8` `46.9/45.6 km` to `NROL-76` `64.6/64.9 km`; LOO `-1.93 / +0.97 km`); end-to-end `Iridium NEXT 8` (`1.63° / 7.5% CL / -34°`) achieves **`2.35 km / 32 m/s`** Entry EA, **`0.81 km / 69 m/s`** Aero EA, and **`0.19 km / 29 m/s`** Landing EA.*

#### Per-Flight Validation Breakdown (`Fair Baseline → v1.6.0 → v1.7.0`)

| Flight | Class | Role | Fitted Kick | Phys Max-Q Δt (B → v1.6 → v1.7) | MECO Δt (B → v1.6 → v1.7) | S1 Alt RMS (B → v1.6 → v1.7) | S1 Vel RMS (B → v1.6 → v1.7) | Reconstructed Peak `a_axial` |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Crew Dragon DM-1** | C0 LEO | Fit | `1.56°` | `-1.2 → +1.5 → +1.5 s` | `-9.7 → -3.6 → -3.6 s` | `3.19 → 1.68 → 1.03 km` | `180 → 108 → 108 m/s` | `3.29 g` |
| **SpaceX CRS-16** | C0 LEO | Fit | `1.61°` | `+2.9 → +5.5 → +5.5 s` | `-12.6 → -3.3 → -3.3 s` | `3.56 → 1.72 → 1.72 km` | `188 → 111 → 111 m/s` | `3.46 g` |
| **Iridium NEXT 8** (`244 km` BB) | C0 LEO | Fit | `1.63°` | `-5.3 → -2.6 → -2.6 s` | `-7.0 → -0.2 → -0.2 s` | `3.05 → 0.78 → 0.78 km` | `173 → 68 → 68 m/s` | `3.67 g` |
| **Bangabandhu-1** (`610 km` bal.) | C1 GTO | Fit | `2.62°` | `-12.9 → -10.4 → -10.4 s` | `-9.0 → -1.6 → -1.6 s` | `2.23 → 0.66 → 0.66 km` | `128 → 49 → 49 m/s` | `3.86 g` |
| **SAOCOM 1A** (`LZ-4` RTLS) | C0 LEO | Holdout | `1.10°` | `-3.6 → -1.0 → -1.0 s` | `-9.6 → 0.0 → 0.0 s` | `2.10 → 0.41 → 0.41 km` | `122 → 46 → 46 m/s` | `3.56 g` |
| **SSO-A** (`50 km` BB) | C0 LEO | Holdout | `1.10°` | `-2.5 → +0.1 → +0.1 s` | `+0.2 → +3.3 → +1.1 s` | `2.85 → 0.42 → 0.42 km` | `153 → 52 → 52 m/s` | `3.52 g` |
| **TelStar v19** (`630 km` bal.) | C1 GTO | Holdout | `2.48°` | `-13.3 → -10.7 → -10.7 s` | `-10.0 → -2.9 → -2.9 s` | `2.08 → 0.60 → 0.60 km` | `126 → 49 → 49 m/s` | `3.83 g` |
| **Iridium NEXT 7** | C1 GTO | Holdout | `1.71°` | `-10.3 → -7.6 → -7.6 s` | `-3.0 → +4.0 → +4.0 s` | `2.62 → 0.77 → 0.77 km` | `136 → 60 → 60 m/s` | `3.82 g` |
| **Eshail 2** (`620 km` bal.) | C1 GTO | Holdout | `2.52°` | `-2.7 → -0.1 → -0.1 s` | `-9.0 → -1.7 → -1.7 s` | `1.35 → 1.98 → 1.98 km` | `67 → 57 → 57 m/s` | `3.83 g` |
| **GPS III SV01** | C1 GTO | Holdout | `2.30°` | `-8.9 → -6.3 → -6.3 s` | `-13.0 → -2.2 → -2.2 s` | `2.37 → 0.91 → 0.91 km` | `211 → 97 → 97 m/s` | `3.86 g` |

### Monte Carlo Dispersion Robustness (`N = 1,000` per Unseen Holdout Seed)

All robustness numbers below are measured on **unseen holdout seeds** (zero tuning on these seeds); complete append-only history (including superseded configs) is in [docs/MONTE_CARLO_LOG.md](docs/MONTE_CARLO_LOG.md).

#### v1.9.0 Full Realistic Dispersion Set (Predictive Sutton-Graves Entry Controller + Closed-Loop MECO + Variance-Derived `3.5 t / 2.5 t` Floors + Anti-Hover Flare)
Dispersions: Thrust `±1%`, Isp `±0.5%`, `Cd ±5%`, propellant load `±0.5%`, dry mass `±1%`, base wind `±12 m/s` + gusts `±10 m/s`, ASDS droneship offset `±10 m`, ASDS deck heave `0–1.5 m` & roll `0–2.5°`, throttle/actuator lag `40–120 ms`, **first-order Gauss-Markov (`τ = 45 s`, `ASSUMED`) time-correlated navigation biases** (horizontal `σ = 0.5–2.0 m`, altitude `3σ = ±5 m`, velocity `3σ = ±0.3 m/s`), plus **terminal-phase radar altimeter aiding** below `3,000 m` AGL (`0.2%` AGL scale + `0.15 m` residual floor, inverse-variance fusion, `τ_min = 2.0 s`, `ASSUMED`; horizontal & velocity channels unaided). Touchdown criteria and miss distances are **always evaluated on the TRUE vehicle position**.

| Profile | Seed (`N=1000`) | Landing Success | Orbit Achieved | True Miss (p50 / p95) | S1 Fuel (p5) | S2 Orbit Margin (p5) | Peak `q·α` (p95) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **ASDS Ballistic** (`1.90° / 7.5%`) | `496045` | **999/1000 (99.9%)** | 100.0% | `1.56 m` / `3.63 m` | `5,762 kg` (`1.36%`) | `5,126 kg` | `99.7 kPa·deg` (`0` exceed) |
| **ASDS Ballistic** (`1.90° / 7.5%`) | `507046` | **999/1000 (99.9%)** | 100.0% | `1.52 m` / `3.63 m` | `5,760 kg` (`1.36%`) | `5,087 kg` | `97.4 kPa·deg` (`0` exceed) |
| **RTLS LZ-40** (`1.10° / 12.5% CL / -19°`) | `496045` | **993/1000 (99.3%)** | 100.0% | `1.41 m` / `3.70 m` | `2,533 kg` (`0.60%`) | `7,443 kg` | `99.1 kPa·deg` (`0` exceed) |
| **RTLS LZ-40** (`1.10° / 12.5% CL / -19°`) | `507046` | **991/1000 (99.1%)** | 100.0% | `1.42 m` / `3.75 m` | `2,466 kg` (`0.58%`) | `7,403 kg` | `98.6 kPa·deg` (`0` exceed) |
| **ASDS Partial Boostback** (`Iridium 8`, `1.63° / 7.5% CL / -34°`) | `496045` | **1000/1000 (100.0%)** | 100.0% | `1.47 m` / `3.79 m` | `4,403 kg` (`1.04%`) | `3,017 kg` | `99.8 kPa·deg` (`0` exceed) |
| **ASDS Partial Boostback** (`Iridium 8`, `1.63° / 7.5% CL / -34°`) | `507046` | **1000/1000 (100.0%)** | 100.0% | `1.51 m` / `3.85 m` | `4,338 kg` (`1.03%`) | `3,005 kg` | `97.9 kPa·deg` (`0` exceed) |

*Combined across unseen seeds (`6,000` trials total): **ASDS Ballistic `1,998/2,000 (99.90%)`**, **RTLS `LZ-40` `1,984/2,000 (99.20%)`**, and **ASDS Partial Boostback `2,000/2,000 (100.00%)`** — **5,982/6,000 (99.70%)** landed, `100.0%` orbit, and `0/6,000` `q·α` exceedances.*

---

## Model Fidelity & Limitations

This simulator is a **3-DOF (point-mass translational + rate-limited attitude vector)** flight dynamics model, **not** a full 6-DOF rigid-body or CFD simulation. Every public specification, empirical correction, and modeling assumption is explicitly documented in **[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)**.

Key simplifications and assumptions:
- **3-DOF Attitude:** Vehicle orientation is represented as a unit thrust/longitudinal axis vector with finite slew-rate limits rather than full rigid-body Euler/quaternion rotational inertia, TVC gimbal torque dynamics, or propellant slosh.
- **Aerodynamics (`ASSUMED`):** Uses piecewise-linear Mach-dependent `Cd(M)` tables for ascent and tail-first booster descent, plus a simplified linear lift slope (`C_L = 0.8 / rad`) for the titanium grid fins. Transonic buffeting, aeroelastic bending, and individual fin hinge moments are not modeled.
- **Stage 2 Multi-Burn:** Supports sourced single-burn direct insertion (`DIRECT`, e.g., `DM-1`, `SAOCOM 1A`) and two-burn Hohmann transfer (`TWO_BURN`, e.g., `Iridium NEXT 8`: `SES-1` → `185 km` parking transfer orbit → ballistic coast → `SES-2` circularization at apoapsis). Multi-restart GTO/MEO profiles beyond two burns are not modeled separately.
- **Hold-Down Clamp Release & Webcast Alignment:** Terminal countdown ignites the 9× Merlin 1D engines at `T-3.0 s` under hold-down clamps (burning `~5.1 t` of propellant during spool-up) and releases at `T = 0.0 s` at `100%` thrust (`WEBCAST_LIFTOFF_OFFSET_S = 0`).
- **Cosmetic Visuals:** Per-fin differential tilt, landing-leg hinge swing animation, strongback throw-back, and post-entry soot are visual representations of underlying sim states (never presented as measured telemetry).

---

## License

[MIT](LICENSE)
