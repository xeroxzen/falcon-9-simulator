# Physics Model Assumptions & Simplifications

This document tracks every `ASSUMED` parameter, modeling simplification, and empirical finding where the simulator diverges from a full 6-DOF flight dynamics simulation of a real Falcon 9 Block 5 mission.

---

## 1. Dynamics & Attitude

- **3-DOF translation + rate-limited commanded attitude:** Rotational inertia, TVC gimbal dynamics, slosh, structural bending, and aerodynamic pitching moments are not modeled. The thrust vector slews smoothly toward the guidance command at a capped rate (`maxAttitudeSlewRateRadS = 5 deg/s` during ascent, `boosterFlipSlewRateRadS = 12 deg/s` during RCS flip, and `35 deg/s` TVC gimbal authority during powered descent, `ASSUMED`).
- **Zero aerodynamic lift during ascent:** Because the gravity turn aligns the vehicle with the air-relative velocity vector ($\alpha \approx 0$), lift and normal forces during ascent are neglected.
- **Constant wind model:** Wind is modeled as a configurable constant vector in local ENU rather than an altitude-varying wind shear profile.
- **No Earth nutation/precession:** ECI is aligned with ECEF at $T=0$ and rotates at constant WGS-84 sidereal rate $\omega_\oplus = 7.292115\times 10^{-5}\ \text{rad/s}$.

## 2. Atmosphere

- **US Standard Atmosphere 1976 (0–86 km):** Exact 7-layer geopotential model.
- **Above 86 km (`ASSUMED`):** Exponential density/pressure decay with constant scale height $H_s = 5{,}800\ \text{m}$ up to $200\ \text{km}$, treated as vacuum above $200\ \text{km}$.

## 3. Propulsion & Mass Budget

- **Choked-nozzle $I_{sp}$ consistency:** SpaceX publicly lists Falcon 9 Block 5 total sea-level thrust as $7{,}607\ \text{kN}$ and vacuum thrust as $8{,}227\ \text{kN}$, with vacuum $I_{sp} = 311\ \text{s}$ ($A_{\text{exit}} = 0.680\ \text{m}^2$, $d_e \approx 0.930\ \text{m}$). Using the Part D Variant (a) joint MAP estimates below ($T_{\text{vac}} = 908.72\ \text{kN/engine}$, $A_{\text{exit}} = 0.680\ \text{m}^2 \Rightarrow d_e = 0.931\ \text{m}$, $I_{sp,\text{vac}} = 311.04\ \text{s}$), choked-flow consistency algebraically enforces $T_{\text{sl}} = T_{\text{vac}} - p_0 A_{\text{exit}} = 839.82\ \text{kN/engine}$ ($9\times = 7{,}558\ \text{kN}$, $-0.6\%$ from spec) and $I_{sp,\text{sl}} = I_{sp,\text{vac}}(T_{\text{sl}}/T_{\text{vac}}) = 287.46\ \text{s}$.
- **Liftoff clock model (Variant (a) selected by holdout performance):** The former `EMPIRICAL` $2.0\ \text{s}$ liftoff throttle ramp has been **deleted** from `src/sim/guidance/ascent.ts`; Stage 1 now commands full $100\%$ thrust from clamp release ($t = 0$). Instead, a single fitted webcast-clock offset (`WEBCAST_LIFTOFF_OFFSET_S = +1.92 ± 1.31 s`) is applied consistently in `src/validation/compare.ts` for all telemetry comparisons, capturing the webcast display smoothing / $T+0$ clock-sync offset observed across SpaceX broadcasts. (In v1.4 Part B, negative-time hold-down ignition from $T-3\ \text{s}$ will replace the $t = 0$ release step.)
- **Throttle range (`ASSUMED`):** Merlin 1D throttle is clamped to $40\%\text{–}100\%$ (MVac $39\%\text{–}100\%$). Instantaneous throttle response is assumed in nominal runs (`40–120 ms` first-order lag in Monte Carlo).
- **Liftoff mass budget vs. SpaceX's sourced `549,054 kg` figure:**
  SpaceX's Falcon 9 spec page lists a single headline liftoff mass of `549,054 kg` (originally published for Full Thrust v1.2, without breaking down per-stage wet/dry masses or payload). Our Part D MAP-fitted Block 5 subcooled mass budget sums to:
  - Stage 1 dry (`MAP fit`, prior `25,600 ± 2,000 kg`): `26,955 kg`
  - Stage 1 propellant (`MAP fit`, prior `411,000 ± 8,000 kg`): `422,671 kg`
  - Stage 2 dry (`MAP fit`, prior `4,200 ± 400 kg`): `4,234 kg`
  - Stage 2 propellant (`MAP fit`, prior `109,500 ± 3,000 kg`): `111,310 kg`
  - Fairing (`Sourced`, both halves): `1,900 kg` (`0 kg` for Crew Dragon DM-1)
  - **Vehicle subtotal (no payload):** `567,070 kg` (`565,170 kg` without fairing) — **+3.3% (+18,016 kg)** above the legacy v1.2 `549,054 kg` headline figure, reflecting Block 5's heavier reusable hardware and densified subcooled propellant loads.

### Fitted Parameters (Part D MAP System Identification — Leak-Free)

Shared vehicle parameters (including `maxAxialAccelG`, fitted on the fit set only with zero holdout leakage) and per-flight pitch-kick nuisance parameters (`kick_DM1`, `kick_CRS16`, `kick_Iridium8`) were estimated jointly via RMS-normalized Levenberg-Marquardt MAP minimization through SECO-1 across the 3-flight **fit set** (`DM-1`, `SpaceX CRS-16`, `Iridium NEXT 8`) with Gaussian prior penalties anchored to published specs. Posterior marginal uncertainties ($\sigma_{\text{post}}$) come from the full Laplace covariance $\Sigma_{\text{post}} = (J^T J + \Sigma_{\text{prior}}^{-1})^{-1}$.

Two liftoff-alignment variants were compared on the 7-flight holdout set:
- **Variant (a) (Selected for parsimony):** Delete the `EMPIRICAL` 2 s liftoff ramp; fit `liftoffOffsetS` (`+1.92 ± 1.31 s`) applied consistently in all validation comparisons. Holdouts: `|Max-Q Δ| = 6.03 s`, `|MECO Δ| = 2.88 s`, `S1 Alt RMS = 1.16 km`, `S1 Vel RMS = 46.7 m/s`, 5-flight matching-profile `S2 Vel RMS = 221.6 m/s`.
- **Variant (b):** Keep the `EMPIRICAL` 2 s liftoff ramp; drop `liftoffOffsetS` (`0 s`). Holdouts: `|Max-Q Δ| = 6.12 s`, `|MECO Δ| = 2.96 s`, `S1 Alt RMS = 1.00 km`, `S1 Vel RMS = 50.9 m/s`, 5-flight matching-profile `S2 Vel RMS = 231.4 m/s`.
- **Selection rationale:** Variants (a) and (b) are **within noise** on the 7-flight holdout set (`0.08–0.09 s` timing difference, `0.16 km` alt, `4.2 m/s` S1 vel, `9.8 m/s` S2 vel). **Variant (a) was chosen for parsimony** because it eliminates the unphysical `EMPIRICAL` 2 s thrust ramp from the flight dynamics model and places the webcast-clock alignment cleanly in the validation comparison layer.

| Parameter | Prior ($\mu \pm \sigma$) | Prior Source | MAP Fit ($\hat\theta \pm \sigma_{\text{post}}$) | Shift | $\sigma_{\text{post}}/\sigma_{\text{prior}}$ | Identifiability |
|---|---|---|---|---|---|---|
| `s1PropKg` | `411,000 ± 8,000 kg` | Spaceflight101 / Wikipedia F9 FT–B5 | **`422,671 ± 6,148 kg`** | `+1.46σ` | `0.77` | Moderately constrained |
| `s1DryKg` | `25,600 ± 2,000 kg` | Public reusable B5 estimates (~22.2–27.2 t) | **`26,955 ± 1,857 kg`** | `+0.68σ` | `0.93` | Poorly constrained (prior-dominated) |
| `s2PropKg` | `109,500 ± 3,000 kg` | Spaceflight101 / Wikipedia F9 FT–B5 (~107.5–111.5 t) | **`111,310 ± 1,668 kg`** | `+0.60σ` | `0.56` | Moderately constrained |
| `s2DryKg` | `4,200 ± 400 kg` | Public F9 S2 estimates (~3.9–4.5 t) | **`4,234 ± 398 kg`** | `+0.08σ` | `0.99` | Poorly constrained (prior-dominated) |
| `m1dThrustVacN` | `914.11 ± 6.00 kN` | SpaceX spec (`8,227 kN / 9`) | **`908.72 ± 5.63 kN`** | `-0.90σ` | `0.94` | Poorly constrained (prior-dominated) |
| `m1dNozzleAreaM2` | `0.680 ± 0.015 m²` | SpaceX spec `(T_vac − T_sl)/p0` (`d ≈ 0.93 m`) | **`0.680 ± 0.015 m²`** | `+0.03σ` | `0.99` | Poorly constrained (prior-dominated) |
| `m1dIspVacS` | `311.0 ± 2.0 s` | SpaceX spec (`311 s`) | **`311.04 ± 1.91 s`** | `+0.02σ` | `0.96` | Poorly constrained (prior-dominated) |
| `mvacThrustVacN` | `981.0 ± 10.0 kN` | SpaceX spec (`981 kN`) | **`983.17 ± 9.26 kN`** | `+0.22σ` | `0.93` | Poorly constrained (prior-dominated) |
| `mvacIspVacS` | `348.0 ± 2.0 s` | SpaceX spec (`348 s`) | **`347.90 ± 1.98 s`** | `-0.05σ` | `0.99` | Poorly constrained (prior-dominated) |
| `cdScale` | `1.00 ± 0.15` | `ASSUMED` `ASCENT_CD_MACH_TABLE` multiplier | **`1.041 ± 0.149`** | `+0.27σ` | `1.00` | Poorly constrained (prior-dominated) |
| `maxAxialAccelG` | `4.00 ± 0.50 g` | Public unmanned F9 S1 axial load limit (~3.5–4.5 g) | **`3.69 ± 0.45 g`** | `-0.63σ` | `0.91` | Poorly constrained (fit set only) |
| `stage2MaxAccelG` | `3.50 ± 0.40 g` | Widened prior consistent with late-burn MVac webcast `dv/dt` (`3.55–3.73 g`) | **`3.52 ± 0.31 g`** | `+0.05σ` | `0.78` | Weakly constrained (S2-only fit set; MLE `3.52 g`) |
| `liftoffOffsetS` | `0.00 s` (fixed) | Webcast $T+0$ = hold-down clamp release (modeled directly) | **`0.00 s` (fixed)** | — | — | Former `v1.3` `+1.92 s` offset was a compensating error hiding excess late-S1 acceleration (see `docs/BACKLOG.md` System-ID v2) |
| `kick_DM1` (nuisance) | `2.00 ± 0.80°` | Per-flight trajectory shaping | **`1.28 ± 0.16°`** | `-0.90σ` | `0.19` | Well constrained |
| `kick_CRS16` (nuisance) | `2.00 ± 0.80°` | Per-flight trajectory shaping | **`1.37 ± 0.20°`** | `-0.78σ` | `0.25` | Well constrained |
| `kick_Iridium8` (nuisance) | `2.00 ± 0.80°` | Per-flight trajectory shaping | **`1.73 ± 0.42°`** | `-0.34σ` | `0.52` | Moderately constrained |

- **Strongest physical degeneracies:** `s1PropKg ↔ m1dThrustVacN` ($r \approx +0.92$, T/W & burn-time ridge) and `s2PropKg ↔ mvacThrustVacN` ($r \approx +0.86$). With realistic RMS-normalized weighting, most individual engine/mass specs remain prior-dominated; only the combined S1/S2 propellant budgets and per-flight pitch kicks are tightened substantially by webcast telemetry.
- **Early-MECO bias mechanism:** Pre-fit MECO occurred `−7` to `−12.6 s` early across Block 5 flights due to (1) under-estimated Block 5 subcooled Stage 1 propellant (`411 t` vs `422.7 t`), (2) an `ASSUMED` `4.5 g` Stage 1 axial cap vs `3.69 g` fitted on the fit set, and (3) the `+1.92 s` webcast clock offset. Together these cut mean 7-flight holdout `|MECO Δ|` from `7.42 → 2.88 s` (`GPS III SV01`: `−12.6 → −1.0 s`; `Bangabandhu-1`: `−8.6 → −0.1 s`; `Eshail 2`: `−8.7 → −0.3 s`).
- **DM-1-specific guidance audit:** The former hard-coded `pitchKickAngleDeg: 1.25°` was **`ASSUMED`** (replaced by the MAP per-flight nuisance fit `1.28°`, cutting DM-1 S1 alt RMS from `5.32 → 0.31 km`). The former DM-1-specific `stage2MaxAccelG: 3.2` override has been **removed**; Stage 2 now uses its own shared vehicle parameter `stage2MaxAccelG = 3.52 ± 0.31 g` (fitted on fit-set S2 telemetry only with widened prior `3.50 ± 0.40 g`, MLE `3.52 g`, separate from Stage 1's `maxAxialAccelG = 3.69 g`). Note that Stage 2 is near-horizontal late in the burn, so observed webcast `dv/dt` (`3.55 / 3.73 / 3.63 g` on DM-1 / CRS-16 / Iridium 8) is approximately a lower bound on actual thrust acceleration $T/m$.

#### Per-Flight Validation Tables (`dt = 0.01 s`, Variant (a) vs v1.2 Baseline)

Vehicle parameters and `liftoffOffsetS = +1.92 s` are frozen from the 3-flight fit set; on holdout flights only the 1-DOF per-flight `pitchKickAngleDeg` nuisance parameter is fitted (real Falcon 9 trajectories are shaped per mission). Stage 2 RMS is reported **only** for flights where the simulator flies the same ascent profile through SECO-1.

| Flight | Group | Real Profile | Fitted Kick | Max-Q $\Delta t$ (B → A) | MECO $\Delta t$ (B → A) | S1 Alt RMS (B → A) | S1 Vel RMS (B → A) | S2 Vel RMS (B → A) | SECO-1 (Real / B / A) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| **DM-1** | FIT | LEO direct | `1.28°` | `-2.3 → +1.7 s` | `-7.6 → -1.7 s` | `5.32 → 0.31 km` | `95 → 55 m/s` | `327 → 106 m/s` | `549 / 558 / 550` |
| **SpaceX CRS-16** | FIT | LEO direct | `1.37°` | `+2.6 → +6.4 s` | `-12.3 → -5.8 s` | `3.47 → 2.13 km` | `178 → 91 m/s` | `295 → 112 m/s` | `538 / 509 / 522` |
| **Iridium NEXT 8** | FIT | LEO two-burn | `1.73°` | `-3.6 → +0.3 s` | `-6.7 → +1.5 s` | `2.51 → 1.16 km` | `168 → 83 m/s` | `125 → 83 m/s` | `526 / 522 / 531` |
| **Bangabandhu-1** | HOLDOUT | GTO | `2.52°` | `-17.6 → -13.5 s` | `-8.6 → -0.1 s` | `8.53 → 0.57 km` | `56 → 16 m/s` | `263 → 47 m/s` | `495 / 500 / 500` |
| **TelStar v19** | HOLDOUT | GTO | `2.41°` | `-15.0 → -10.8 s` | `-9.7 → -1.4 s` | `7.96 → 0.39 km` | `62 → 17 m/s` | `402 → 298 m/s` | `499 / 509 / 511` |
| **Iridium NEXT 7** | HOLDOUT | LEO two-burn | `1.71°` | `-13.6 → -9.7 s` | `-2.7 → +5.5 s` | `2.63 → 0.60 km` | `124 → 31 m/s` | `189 → 237 m/s` | `524 / 525 / 534` |
| **Eshail 2** | HOLDOUT | GTO | `2.44°` | `-2.3 → +1.8 s` | `-8.7 → -0.3 s` | `6.72 → 2.49 km` | `60 → 87 m/s` | `490 → 324 m/s` | `495 / 503 / 504` |
| **GPS III SV01** | HOLDOUT | MEO two-burn | `2.23°` | `-6.5 → -2.4 s` | `-12.6 → -1.0 s` | `10.02 → 1.23 km` | `136 → 62 m/s` | `416 → 202 m/s` | `520 / 505 / 503` |
| **SAOCOM 1A** | HOLDOUT | LEO direct | `1.21°` | `-1.8 → +1.9 s` | `-9.4 → -2.8 s` | `0.43 → 1.56 km` | `143 → 53 m/s` | S1 only *(real 620 km direct vs sim two-burn)* | `607 / n/a` |
| **SSO-A** | HOLDOUT | LEO direct | `1.19°` | `-1.6 → +2.1 s` | `+0.3 → +9.1 s` | `0.37 → 1.28 km` | `184 → 62 m/s` | S1 only *(real 575 km direct vs sim two-burn)* | `600 / n/a` |

- **Holdout S1 averages (all 7 holdouts):** `|Max-Q Δ|`: `8.33 → 6.03 s`, `|MECO Δ|`: `7.42 → 2.88 s`, `S1 Alt RMS`: `5.24 → 1.16 km`, `S1 Vel RMS`: `109.3 → 46.7 m/s`.
- **Holdout S2 average (5 matching-profile holdouts only — excludes `SAOCOM 1A` & `SSO-A`):** `S2 Vel RMS`: `352.0 → 221.6 m/s` (`-37%`).

#### Fair Baseline Decomposition (Kick-Fitting vs. Vehicle-Model Improvement, Holdout Set)

Giving the pre-Part-D baseline vehicle the **same** 1-DOF per-flight pitch-kick fit separates trajectory shaping from vehicle-model improvement:

| Configuration (Holdout Set, `dt = 0.01 s`) | 7-flt `|Max-Q Δ|` | 7-flt `|MECO Δ|` | 7-flt S1 Alt RMS | 7-flt S1 Vel RMS | 5-flt Matching S2 Vel RMS |
|---|---:|---:|---:|---:|---:|
| **[1] Baseline + fixed kick** | `9.02 s` | `7.62 s` | `5.16 km` | `118.7 m/s` | `310.4 m/s` |
| **[2] Baseline + per-flight kick** | `8.92 s` | `7.67 s` | `2.80 km` | `129.5 m/s` | `152.5 m/s` |
| **[3] MAP Variant (a) + per-flight kick** | `6.03 s` | `2.89 s` | `1.17 km` | `46.8 m/s` | `220.9 m/s` |
| **Kick-fitting delta (`[2] − [1]`)** | `-0.10 s` | `+0.04 s` | **`-2.36 km`** | `+10.9 m/s` | **`-158.0 m/s`** |
| **Pure vehicle-model delta (`[3] − [2]`)** | **`-2.89 s`** | **`-4.78 s`** | **`-1.63 km`** | **`-82.8 m/s`** | `+68.5 m/s`* |

*\*Note:* The `+68.5 m/s` S2 velocity delta on the 5 matching-profile holdouts comes from GTO/MEO flights (`TelStar v19`, `Eshail 2`, `GPS III SV01`) where the longer MAP Stage 1 burn + `+1.92 s` webcast offset shifts SES-1 later relative to real GTO/MEO parking-orbit ignition timing; on `Bangabandhu-1` (`70 → 46 m/s`) and all 3 fit flights (`DM-1: 129 → 106`, `CRS-16: 295 → 111`, `Iridium-8: 113 → 82 m/s`), the vehicle model improves Stage 2 as well.

#### Default Mission Ascent Design & What-If Profile Rule (Mission Design, Not Tuning)

- **Default mission ascent solver (`src/sim/guidance/mission-design.ts`):** `solveMissionAscentDesign` replaces hand-picked ascent pitch kicks and RTLS MECO reserves for default missions (`DEFAULT_LEO_ASDS_MISSION` → `1.90°` at `7.5%` reserve; `DEFAULT_LEO_RTLS_MISSION` → `1.40°` at `14.5%` reserve). Given the vehicle and mission spec (payload, target orbit, landing mode), it starts from the profile default kick as initial guess and solves for the most gravity-loss-efficient pitchover angle (and minimum feasible RTLS MECO reserve) that achieves the target orbit while meeting 3-sigma booster recovery fuel-margin (`>= 4,000 kg` ASDS / `>= 7,500 kg` RTLS) and grid-fin saturation (`<= 15%`) constraints. This is **mission design**, not vehicle parameter tuning.
- **What-If profile-based default kick rule (`defaultWhatIfPitchKickDeg`):** Derived from the Part D per-flight fitted kicks: `LEO direct` (`<= 250 km`) = **`1.30°`**, `LEO two-burn` (`> 250 km`) = **`1.70°`**, `GTO` = **`2.45°`**. Applied **directly for `EXPENDABLE`** missions (`0.5%` reserve), and used as the **initial guess** for `solveMissionAscentDesign` inside the Web Worker whenever recovery (`ASDS` or `RTLS`) is enabled.

#### Post-Fit Monte Carlo (`N = 1,000 × 3` Fresh Unseen Seeds, Post-RTLS Fix & Mission-Design Solver)

| Mode | Seed | Landed | Orbit | Miss p50 / p95 | Fuel Margin p5 | Peak $q\cdot\alpha$ p95 (`>200` exceed) |
|---|---:|---:|---:|---:|---:|---:|
| **ASDS** | `117007` | `999/1000 (99.9%)` | `100.0%` | `1.69 / 4.13 m` | `3,041 kg (0.72%)` | `98.8 kPa·deg (0/1000)` |
| **ASDS** | `128008` | `999/1000 (99.9%)` | `100.0%` | `1.71 / 4.20 m` | `3,081 kg (0.73%)` | `99.5 kPa·deg (0/1000)` |
| **ASDS** | `139009` | `1000/1000 (100.0%)` | `100.0%` | `1.66 / 4.05 m` | `3,138 kg (0.74%)` | `98.2 kPa·deg (0/1000)` |
| **ASDS Combined** | `3 seeds` | **`2,998/3,000 (99.93%)`** | **`100.0%`** | — | — | **`0/3,000`** |
| **RTLS** | `141010` | `1000/1000 (100.0%)` | `100.0%` | `1.46 / 3.67 m` | `6,561 kg (1.55%)` | `98.7 kPa·deg (0/1000)` |
| **RTLS** | `152011` | `1000/1000 (100.0%)` | `100.0%` | `1.39 / 3.48 m` | `6,559 kg (1.55%)` | `100.2 kPa·deg (0/1000)` |
| **RTLS** | `163012` | `1000/1000 (100.0%)` | `100.0%` | `1.43 / 3.87 m` | `6,556 kg (1.55%)` | `99.5 kPa·deg (0/1000)` |
| **RTLS Combined** | `3 seeds` | **`3,000/3,000 (100.00%)`** | **`100.0%`** | — | — | **`0/3,000`** |

*Failure breakdown across all 3,000 RTLS trials (`141010`, `152011`, `163012`, solver `1.40° / 14.5%`): `v_z: 0`, `v_h: 0`, `miss: 0`, `propellant: 0`, `tilt: 0`. Across all 3,000 ASDS trials (`117007`, `128008`, `139009`, solver `1.90° / 7.5%`): `v_z: 1`, `v_h: 1`, `miss: 0`, `propellant: 0`, `tilt: 0`.*

## 4. Aerodynamics

- **Ascent $C_d(M)$ (`ASSUMED`):** SpaceX does not publish Falcon 9 drag data. Our curve is referenced to the `3.7 m` core cross-sectional area ($10.7521\ \text{m}^2$), **not** the `5.2 m` payload fairing area ($21.237\ \text{m}^2 = 1.975\times$ core area). Typical slender launch-vehicle drag coefficients referenced to maximum frontal (fairing) area are $C_{d,\text{fairing}} \approx 0.22\text{–}0.26$ subsonic and $0.42\text{–}0.48$ transonic peak (e.g., Sutton & Biblarz / NASA launch vehicle references). Scaling by the $1.975\times$ area ratio (plus folded legs and stowed grid fins) yields `ASSUMED` core-referenced values of **$0.48$ subsonic** ($\approx 0.24$ on fairing area), **$0.88$ transonic peak at $M = 1.05$** ($\approx 0.45$ on fairing area), and **$0.36$ supersonic at $M \ge 4.0$**.
- **Booster descent $C_d(M)$ & grid-fin lift (`ASSUMED`):** Tail-first blunt base + titanium grid fins modeled with $C_d(M)$ from $0.85$ (subsonic) to $1.45$ (transonic peak at $M = 1.1$) to $1.00$ (hypersonic). Simplified lateral grid-fin + body lift uses $C_L = 0.8\ \text{rad}^{-1} \cdot |\delta|$ with deflection $|\delta| \le 20^\circ$ (max $L/D \approx 0.25\text{–}0.30$), projected perpendicular to air-relative velocity toward the landing target.

## 5. Ascent & Stage 2 Guidance

- **Physically-based procedural Web Audio API sound (`v1.4 Part D`, `ASSUMED` synthesis parameters):**
  - Muted by default (`soundMuted: true`, persisted across mission switches); zero `AudioContext` is instantiated until the user explicitly taps/clicks Unmute.
  - **Listener:** Active camera position & velocity (primary left pane in Split View).
  - **Propagation & atmosphere:** Uses harmonic-mean path-averaged **US76 speed of sound** ($c_{\text{avg}}$ from `sampleAtmosphere`, not a fixed `343 m/s`) for retarded acoustic delay $\tau = d / c_{\text{avg}}$, Doppler shift, inverse-distance spreading, distance-dependent atmospheric absorption LPF, and air-density vacuum cutoff (completely silent in vacuum for external cameras; muffled `~220 Hz` structure-borne engine vibration for `onboard-s1`/`onboard-s2` cameras).
  - **Playback & scrub hygiene:** Continuous engine/aero audio renders only at `<= 2×` speed (muted above `2×` to prevent chipmunk distortion). One-shot events (ignition thump, clamp release, MECO/stage-sep thumps, and RTLS/ASDS double N-wave sonic boom) fire only during real-time forward playback crossing the event timestamp — never on scrub or seek.
  - **Performance & iOS/Safari:** Entire audio graph (22 persistent nodes) is built once on first unmute with zero per-frame node creation; `suspended`/`interrupted` states resume on visibility return / next gesture. *Note:* On iOS/iPadOS, the hardware silent switch mutes Web Audio API output regardless of in-app unmute state.
- **Pre-launch LOX venting & liftoff steam (`v1.4 Part C`, `ASSUMED` visual-only):**
  - Pre-launch timeline extends to `T-60 s` (`countdownS: 60`, default playback starts at `T-10 s` while `T-60 s` is scrubbable on the timeline).
  - Reuses the shared GPU-billboarded `SoftParticles` system (`Low / Med / High` budgets: LOX venting `28 / 56 / 96`, deluge spray `32 / 64 / 96`, liftoff steam `56 / 112 / 180`; zero per-frame allocations) for Stage 1 LOX boil-off (`y ≈ 31.5 m`), Stage 2 LOX boil-off (`y ≈ 51.0 m`), and strongback umbilical purge vents (`T-60..0 s`, tapering as flight pressurization closes boil-off valves prior to ignition, cold dense vapor drifting downwind).
  - Liftoff steam clouds expand buoyantly to tens of meters (`3.6 → 28 m` radius, `9.5 s` lifetime) through `~T+10 s`, viewable from both tracking `"Pad"` and fixed `"Pad (Fixed)"` cameras.
- **Pre-launch countdown, hold-down clamp ignition & water deluge (`v1.4 Part B`):**
  - Terminal countdown runs `T-10 s` → `T-0` (`countdownS: 10`), with 9× Merlin 1D TEA-TEB ignition at **`T-3.0 s`** (SpaceX Falcon User's Guide / webcast sequence).
  - **Hold-down propellant burn (`~5.1 t`, `ASSUMED`):** `ASSUMED` smoothstep engine spool-up `0 → 100%` over `2.2 s` (`T-3.0 s` → `T-0.8 s`) followed by `0.8 s` full-thrust chamber-pressure verification against the 4 hold-down clamps (`axialAccelG = 0 g` and `0 m/s` ground speed while clamped). During this 3 s hold-down window, the 9 Merlins physically burn **`~5.09 t` (`~5,090 kg`)** of RP-1/LOX; therefore, total **loaded Stage 1 propellant at `T-10 s` = fitted `T = 0` liftoff propellant (`422,671 kg`) + `~5.1 t` (`~427.8 t` loaded)**, releasing the hold-down clamps at **`T = 0.0 s`** at `100%` thrust and exact `422,671 kg` flight propellant mass (keeping all `t >= 0` trajectories bit-identical).
  - **Water deluge timing per site (`ASSUMED`):** Acoustic water deluge activates at `T-5.0 s` (`WATER_DELUGE_START_S = -5.0`) and tapers out by `T+9.0 s` across `LC-39A`, `SLC-40`, and `SLC-4E`. While public SpaceX webcasts show Niagara water deluge initiating a few seconds before `T-3 s` ignition at all three pads, exact per-site valve open/close timings vary by pad and mission and are not published in the Falcon User's Guide, so `T-5.0 s` is explicitly marked **`ASSUMED`** for all sites.
  - **Webcast liftoff offset removed (`WEBCAST_LIFTOFF_OFFSET_S = 0`):** With hold-down clamp release modeled at `T = 0`, early ascent (`T+0..30 s`) fits webcast telemetry best at **`0.0 s`** (`38–40 m / 2.8–3.0 m/s` RMS vs `123–153 m / 9.5–10.2 m/s` at `+2.00 s`), proving that `v1.3`'s `+1.92 s` offset was a **compensating error hiding excess late-S1 acceleration**, not a webcast clock artifact. `WEBCAST_LIFTOFF_OFFSET_S` is therefore fixed at **`0.0 s`**; the resulting honest full-S1 RMS (`DM-1`: `1.12 km / 80.0 m/s`, `CRS-16`: `3.13 km / 112.3 m/s`, `Iridium NEXT 8`: `0.67 km / 111.6 m/s`) is tracked for **System-ID v2** in `docs/BACKLOG.md`.
- **Stage 1 pitchover & gravity turn (`ASSUMED`):** Smooth pitchover kick at $150\ \text{m}$ height **above the launch pad** (accounting for pad elevation such as Vandenberg SLC-4E at $114\ \text{m}$ AMSL) over $8\ \text{s}$ toward the Earth-rotation-compensated launch azimuth (supporting both ascending northeast Cape launches and descending southward Vandenberg launches), followed by zero-AoA gravity turn, smooth transonic max-Q throttle bucket ($M \in [0.92, 1.38]$), and axial G-limit ($3.69\ g$ MAP-fitted on the fit set for unmanned flights, $3.0\ g$ `ASSUMED` for human-rated DM-1).
- **Stage 2 closed-loop guidance (`ASSUMED`):**
  - **Single-burn direct insertion (`ascentProfile: 'DIRECT'`):** Uses a closed-form piecewise constant-thrust / G-limited **Powered Explicit Guidance (PEG)** radial BVP law on spherical radius error $\Delta r = r_{\text{target}} - r$ (eliminating the up-to-$21.4\ \text{km}$ WGS84 oblateness mismatch at high inclinations) with linear gravity decay $g_{\text{eff}}(t) = g_{\text{eff}}(1 - t/t_{\text{go}})$ and cross-track yaw plane steering (`< 0.05°` inclination error). Achieves `±0.70–0.98 km` apogee/perigee on 200 km LEO (`DEFAULT_LEO_ASDS`, `DEFAULT_LEO_RTLS`, `DM-1`) and `618.8 × 621.9 km, 97.89°` (`±1.88 km`) on `SAOCOM 1A` / `573.9 × 577.0 km, 97.70°` (`±2.04 km`) on `SSO-A` with zero per-flight tuning.
- **Burn profile selection (`ascentProfile: 'DIRECT' | 'TWO_BURN'`):** Burn profile is **sourced mission data** from SpaceX press kits (`DM-1`: `DIRECT`; `Iridium NEXT 8`: `TWO_BURN`; `SAOCOM 1A`: `DIRECT`). The `targetOrbitAltitudeM > 250 km` automatic two-burn heuristic is retained **only** as the What-If default when `ascentProfile` is omitted.
- **Two-burn Hohmann transfer (`ascentProfile: 'TWO_BURN'`):**
  1. **SES-1 → SECO-1 (Transfer Orbit Insertion):** Targets a parking perigee altitude $h_{\text{park}} = 185\ \text{km}$ (`ASSUMED`, matching typical Falcon 9 LEO transfer perigees such as Iridium-8's `~183 km`), cutting off when perigee exceeds `120 km` and osculating apogee reaches `targetOrbitAltitudeM`. Cross-track yaw steering corrects inclination during SES-1.
  2. **`COAST_TO_SES2` (Ballistic Coast to Apoapsis):** Zero-thrust coast with attitude aligned prograde horizontal. Analytic Keplerian time-to-apoapsis $t_{\text{to\_apo}} = (\pi - M)/n$ centers `SES-2` ignition on apoapsis ($t_{\text{to\_apo}} \le \frac{1}{2} t_{\text{burn2}}$). *Orbital-mechanics note on `Iridium NEXT 8` SES-2 (`+152.9 s` vs published `3,108 s`):* The half-period of a `183 × 625 km` transfer orbit is $T/2 = 2{,}779.3\ \text{s}$. Real SpaceX `SECO-1` (`526 s`) cuts off climbing past perigee ($M \approx 12.8^\circ$), yielding a `2,582 s` coast (`197 s` shorter than $T/2$). Our SES-1 BVP law drives $(h \to 185\ \text{km}, v_r \to 0)$ right at perigee ($M = 4.0^\circ, \gamma = +0.14^\circ$), yielding a `2,732 s` coast (`+150 s` coast + `+3.2 s` SECO-1 = `+152.9 s`). Because the Hohmann transfer mechanics are physically sound, we do not artificially hack SES-2 timing.
  3. **SES-2 → SECO-2 (Circularization):** Prograde horizontal burn at apoapsis until specific orbital energy reaches $-\mu/(2 r_{\text{target}})$ or perigee comes within `1.5 km` of target.

## 6. Booster Recovery Guidance

- **Flip maneuver (`ASSUMED`):** Simplified cold-gas RCS rate-limited slew at $12^\circ/\text{s}$ starting $3\ \text{s}$ after stage separation.
- **Boostback burn (RTLS only, `ASSUMED`):** 3-engine burn (engines 0, 1, 5) aimed nearly horizontally ($-4^\circ$ depression) opposite the predicted drag-shortened ballistic impact miss relative to LZ-1 / LZ-4, keeping RTLS apogee realistic (~125–140 km) and landing time ~T+465–485 s. Note: real ASDS flights with close-in droneships (e.g., `Iridium NEXT 8`) sometimes perform a short partial boostback burn; our ASDS mode assumes pure downrange ballistic entry with no boostback.
- **Entry burn (`ASSUMED`):** 3-engine retrograde burn starting at $70\ \text{km}$ ($60\ \text{km}$ RTLS) if air-relative speed exceeds $1{,}300\ \text{m/s}$ ($1{,}050\ \text{m/s}$ RTLS), terminating when $v_{\text{rel}} \le 850\ \text{m/s}$, burn duration reaches $21\ \text{s}$, or propellant hits $2.5\%$ reserve.
- **Hoverslam landing burn (`ASSUMED`):** Analytic suicide-burn ignition solver + closed-loop **ZEM/ZEV optimal powered descent** horizontal guidance:
  $$a_{\text{up,cmd}} = g_0 + \frac{v_{\text{down}}^2 - v_{\text{td}}^2}{2 h}, \qquad \mathbf{a}_{\text{horiz,cmd}} = \frac{6\,\Delta\mathbf{r}_{\text{horiz}}}{t_{\text{go}}^2} - \frac{4\,\mathbf{v}_{\text{horiz}}}{t_{\text{go}}}$$
  with 3-to-1 engine transition for fast entries and upright alignment below $6\ \text{m}$. **Strict touchdown criteria:** ASDS miss $< 10\ \text{m}$, RTLS miss $< 15\ \text{m}$, $|v_z| < 2.0\ \text{m/s}$, $|v_h| < 1.0\ \text{m/s}$, tilt $< 5.0^\circ$, propellant $> 0$. Horizontal velocity is never clamped or zeroed.

## 7. SpaceX Webcast Telemetry Velocity Reference Frame (Empirical Finding)

**Finding:** SpaceX launch webcast telemetry displays **Earth-relative (ECEF) speed**, NOT Earth-centered inertial (ECI) speed.

**Evidence from `shahar603/Telemetry-Data`:**
1. **At liftoff ($T+0\ \text{s}$):** `DM-1/JSON/stage2 raw.json` reads $v = 0.28\ \text{m/s}$ ($1\ \text{km/h}$), not the $\approx 408.2\ \text{m/s}$ inertial speed of LC-39A ($28.61^\circ\text{N}$) due to Earth's rotation.
2. **At orbital insertion (SECO-1, prograde inclined LEO):** At $T+548.9\ \text{s}$ ($h = 198\ \text{km}$, $i = 51.66^\circ$ ISS orbit), `DM-1` reads **$7{,}547.2\ \text{m/s}$** ($27{,}170\ \text{km/h}$), vs inertial circular velocity $7{,}785.6\ \text{m/s}$ ($238\ \text{m/s}$ higher). Subtracting Earth's eastward rotation component ($\omega_\oplus r \cos i \approx 297.9\ \text{m/s}$) yields $7{,}495\text{–}7{,}550\ \text{m/s}$, matching the webcast. (`SpaceX CRS-16` at $207\ \text{km}$, $51.6^\circ$ similarly reads $7{,}538.6\ \text{m/s}$.)
3. **Near-polar cross-check (`Iridium NEXT 8`, $86.4^\circ$ incl., $632\ \text{km}$):** With Earth's rotation nearly perpendicular ($\cos 86.4^\circ = 0.063$), $v_{\text{ECEF}} \approx 7{,}520\ \text{m/s}$ vs $v_{\text{ECI}} \approx 7{,}542\ \text{m/s}$ — and `Iridium NEXT 8` reads **$7{,}522.2\ \text{m/s}$**.

## Aerodynamic Structural Load Limit (`q·α`) — `ASSUMED`

- **Limit (`ASSUMED_MAX_Q_ALPHA_PA_DEG`):** `200 kPa·deg` (`~3.49 kPa·rad`), representative of public orbital launch-vehicle structural bending-moment envelopes near Max-Q.
- **Ascent wind steering:** Stage 1 flies a ground-relative gravity turn after pitchover while winds apply physical aerodynamic drag and side-force loads (`v_air = v_ground − v_wind`). Under `±12 m/s` base winds + `±10 m/s` altitude gusts, p95 peak `q·α` remains `~98–100 kPa·deg` (well below the `200 kPa·deg` ASSUMED structural envelope, `0%` exceedances).

## Monte Carlo Dispersions (`v1.1`) — `ASSUMED`

- Thrust `±1.0%`, Isp `±0.5%`, `Cd ±5.0%`, propellant load `±0.5%`, dry mass `±1.0%`.
- Base wind `±12 m/s` (East/North) + altitude-varying gusts `±10 m/s`.
- Navigation errors fed into booster guidance are modeled as a **first-order Gauss-Markov time-correlated bias process** (`ASSUMED` correlation time `τ = 45 s`, initialized from its stationary distribution `N(0, σ²)`): horizontal `σ = 0.5–2.0 m`, altitude `3σ = ±5.0 m` (`σ_INS ≤ 1.67 m`), velocity `3σ = ±0.3 m/s` (`σ ≤ 0.10 m/s`) per axis. Touchdown detection, impact criteria, and reported miss distances are **always evaluated on the TRUE physical vehicle state**.
- **Terminal-phase radar altimeter aiding (`ASSUMED` sensor-fusion model):** Below `h_acq = 3,000 m` AGL, a downward-looking landing radar altimeter with range-dependent accuracy $\sigma_{\text{rad}}(h) = \sqrt{\sigma_{\text{floor}}^2 + (\epsilon_{\text{scale}}\, h)^2}$ ($\sigma_{\text{floor}} = 0.15\ \text{m}$ residual multipath/clutter floor, $\epsilon_{\text{scale}} = 0.002 = 0.2\%$ of AGL) fuses continuously with INS/GPS via inverse-variance weighting:
  $$\sigma_{\text{eff}}(h) = \frac{1}{\sqrt{\sigma_{\text{INS}}^{-2} + \sigma_{\text{rad}}(h)^{-2}}}, \qquad \tau_{\text{eff}}(h) = \max\!\left(2.0\ \text{s},\ \tau_{\text{INS}} \cdot \frac{\sigma_{\text{eff}}(h)^2}{\sigma_{\text{INS}}^2}\right)$$
  This smoothly tightens vertical AGL knowledge during terminal descent while preserving a non-zero time-correlated residual (`σ_eff ≈ 0.15 m`, `τ_eff = 2.0 s`) all the way to touchdown. Horizontal position and velocity biases are **unaided** by the radar altimeter and remain at full `τ = 45 s` INS/GPS levels.
- ASDS station-keeping offset `±10 m` + simplified ocean deck motion: heave `0–1.5 m` (`7 s` swell period) and roll `0–2.5°` (`8 s` period), enforced against relative vertical touchdown speed (`|v_z − v_heave| < 2.0 m/s`) and combined tilt (`tilt + |roll| < 5.0°`).
- First-order actuator and throttle response lag: `40–120 ms`.


---

## Launch Site Range-Safety Corridors & Recovery Asset Status (v1.4 Part E)

### Launch Azimuth & Inclination Corridors
- **Eastern Range (`LC-39A`, `SLC-40` — USSF Space Launch Delta 45 / FAA):**
  - Primary eastward ocean corridor: **35°–120° azimuth** (`28.5°–57.0°` direct orbital inclination), plus SSE polar dogleg corridor up to **98.0°** (clearing Florida/Bahamas populated land). Inclinations below pad latitude (`< 28.5°`) are blocked in What-If.
- **Western Range (`SLC-4E`, Vandenberg SFB — USSF Space Launch Delta 30 / FAA):**
  - Southward Pacific corridor: **140°–201° azimuth** (`53.0°–104.0°` polar / Sun-Synchronous inclinations). Low-inclination eastward launches (e.g. `28.6°`) are blocked in What-If because they overfly populated Southern California and the U.S. mainland.

### Webcast vs Engineer Altitude Reference
- **Webcast HUD:** Displays altitude **AGL above the launch pad** during ascent (`altitudeM - launchSite.elevationM`, so `SLC-4E` at `114 m AMSL` reads `0.0 km` on the pad) and AGL above the landing target during Stage 1 recovery.
- **Engineer Panel:** Explicitly displays geodetic **`Altitude (MSL)`** (`114 m` on the pad at `SLC-4E`).

### Landing Zones & Droneships (Current 2026 Status + Historical Availability)
Recovery asset availability is resolved by coast and mission date (`getAvailableRecoveryAssets(siteId, missionDate)` in `src/sim/config/falcon9.ts`):
- **LZ-1 (`28.4858°N, 80.5429°W`, CCSFS former LC-13):** **Retired August 1, 2025** after Crew-11 (55 landing attempts, 54 successes; LC-13 reallocated by USSF to Vaya Space / Phantom Space). Available only for historical missions `2015-12-21` through `2025-08-01`.
- **LZ-2 (`28.4856°N, 80.5444°W`, CCSFS former LC-13):** Dual-booster Falcon Heavy pad (`activeFrom: 2018-02-06`), phasing out alongside LC-13 transition.
- **LZ-40 (`28.5631°N, 80.5743°W`, CCSFS adjacent to SLC-40):** **Active** East Coast RTLS pad (`activeFrom: 2025-08-01`), replacing retired LZ-1 for current Cape RTLS missions.
- **LZ-4 (`34.6342°N, 120.6150°W`, VSFB former SLC-4W):** **Active** West Coast RTLS pad (`activeFrom: 2018-10-08`, first used on SAOCOM 1A).
- **ASOG (*A Shortfall of Gravitas*, Port Canaveral):** **Active** East Coast ASDS (`activeFrom: 2021-08-29`).
- **OCISLY (*Of Course I Still Love You*, Port of Long Beach):** **Active** West Coast ASDS (`2021-06-15`–present; served East Coast `2015-06-28`–`2021-06-14`, including DM-1).
- **JRTI (*Just Read the Instructions*):** **Retired / Repurposed** from Falcon 9 ASDS service in early 2026 for Starship transport (served West Coast `2016-01-17`–`2019-08-01` incl. Iridium NEXT-8; East Coast `2020-05-30`–`2026-02-01`).
