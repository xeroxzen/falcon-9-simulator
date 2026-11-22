# Physics & Guidance Backlog

Known model gaps identified during Phase 2.5 validation and holdout testing, tracked for future physics iterations:

1. **[COMPLETED — FALSIFIED ON HOLDOUTS (`feat/system-id-v2`)] System-ID v2 (`WEBCAST_LIFTOFF_OFFSET_S = 0` fixed):**
   - Fitted 17 parameters (`10` vehicle + `maxQMinThrottle = 0.713 ± 0.045`, `maxQThrottleStartMach = 0.963 ± 0.076`, `maxQThrottleDurationS = 30.7 ± 3.8 s`, `s1MaxAxialAccelG = 3.16 ± 0.13 g`, + 3 fit-set kicks) on the exact 3-flight fit set (`DM-1`, `CRS-16`, `Iridium NEXT 8`) with `tOff = 0` fixed.
   - **Result:** Slashed fit-set S1 Velocity RMS (`105.2 → 28.8 m/s`) and improved LEO holdouts (`Iridium 7`, `SAOCOM 1A`, `SSO-A`, `GPS III`), but **overfit the LEO fit set and degraded all 7-flight holdout aggregate metrics vs v1 (`tOff = 0`)**: `|MaxQ(phys)| 5.19 → 8.38 s`, `|MECO Δ| 3.71 → 8.45 s`, `S1 Alt 0.96 → 2.39 km`, `S1 Vel 67.1 → 72.5 m/s`, `5-flt S2 Vel 202.6 → 302.5 m/s`.
   - **Hypothesis falsified:** The `10–13 s` early GTO Max-Q (`Bangabandhu-1`, `TelStar v19`, `Iridium NEXT 7`) and LEO late-S1 excess do **not** share a single universal cause — real flights use mission-class throttle schedules (`20–27 s` buckets + `~3.0–3.2 g` late-S1 accel on LEO Dragon/SSO vs `12–18 s` buckets + `~3.7–3.8 g` late-S1 accel + `2–5 s` webcast callout lag on GTO). Retained v1 `FALCON9_BLOCK5` parameters as the holdout winner; kept parameterized bucket support (`maxQThrottleStartMach`, `maxQThrottleDurationS`) in `src/sim/guidance/ascent.ts` for future mission-class scheduling.

2. **Two-burn Stage 2 orbital insertion (SES-1 → coast → SES-2):**
   - Current Stage 2 guidance performs a single continuous burn to circular LEO (~200 km).
   - High-altitude polar/SSO/GTO flights (`Iridium NEXT 8` 625 km, `SAOCOM 1A` 620 km) perform a 2-burn Hohmann transfer (SES-1 to parking/transfer orbit, coast to apogee, SES-2 circularization).
   - The worker protocol and timeline/event model are designed to support arbitrary burn/coast sequences per stage so this can be added without UI changes.

2. **ASDS partial boostback burn:**
   - Current ASDS mode assumes pure downrange ballistic entry with no boostback burn.
   - Real ASDS missions with close-in droneship positioning (e.g., `Iridium NEXT 8`, which executed a 33 s boostback `T+166..199 s` to target JRTI with a 105 km apogee) perform a partial boostback.

3. **Consistent `-4.5%` to `-6.6%` early-MECO bias:**
   - Across `DM-1` (`-4.82%`), `Iridium NEXT 8` (`-4.46%`), and `SAOCOM 1A` (`-6.59%`), simulated MECO occurs ~6–9 s earlier than real webcast telemetry.
   - Likely caused by a combination of: (a) slightly lower average real-flight S1 mass flow / operational throttle margin below 100% rated thrust, (b) longer real max-Q throttle bucket duration (`T+44..71 s` on DM-1, `T+52..79 s` on SAOCOM 1A), and/or (c) slightly higher actual Block 5 subcooled S1 propellant load or lower MECO reserve on specific missions.

4. **Booster boostback tracking error (holdout `SAOCOM 1A`):**
   - On zero-tuning `SAOCOM 1A`, the booster ran short of LZ-4 (`miss = 8.2 km`) because MECO occurred 9.4 s early and our baseline 14.5% RTLS propellant reserve capped the boostback burn before the ballistic impact point reached LZ-4.
   - Needs closed-loop boostback targeting that accounts for atmospheric drag and Coriolis drift during descent, plus mission-appropriate RTLS propellant reserve sizing.

5. **Heavy GTO / polar Max-Q timing gap (`-10` to `-13.5 s` early):**
   - Across Part D holdouts, heavy GTO/polar flights (`Bangabandhu-1: -13.5 s`, `TelStar v19: -10.8 s`, `Iridium NEXT 7: -9.7 s`) peak at Max-Q ~10–13.5 s earlier in the sim than in webcast events, while LEO flights (`DM-1: +1.7 s`, `Iridium NEXT 8: +0.3 s`, `SAOCOM 1A: +1.9 s`, `Eshail 2: +1.8 s`) align within ~2 s.
   - **Throttle-bucket hypothesis:** Our ascent guidance uses a single fixed transonic throttle bucket (`22 kPa`, `Mach 1.02–1.38`, `72%` min throttle). Real GTO and high-dynamic-pressure launches tailor throttle-bucket entry/depth/duration (and sometimes fly flatter/slower transonic profiles or different weather/upper-level wind profiles), shifting real Max-Q to `T+70–75 s`. Modeling mission-class throttle buckets (or upper-level wind shear) should close this gap.

6. **Recovery efficiency gap (solver `~1.9–2.05°` vs real fitted `~1.3°` LEO pitch kick):**
   - For comparable recoverable LEO missions, our mission-design solver requires `~1.90°` (ASDS) / `~1.40°` (RTLS) pitch kicks to preserve 3-sigma landing fuel margins, whereas real recoverable LEO flights (`DM-1: 1.28°`, `CRS-16: 1.37°`, `SAOCOM 1A: 1.22°`) fly steeper/more efficient profiles.
   - Investigate our entry-burn (3-engine fixed `850 m/s / 21 s` cutoff) and landing-burn propellant consumption vs real telemetry to close the recovery propellant-efficiency gap.

7. **Unify 3-to-1 landing-burn engine handoff logic (remove mode-specific branch):**
   - In `src/sim/guidance/booster.ts`, the landing-burn ignition altitude ceiling (`6,000 m` RTLS vs `4,500 m` ASDS) and 3-to-1 engine handoff thresholds (`30 m / 15 m/s / 0.78×` RTLS vs `150 m / 45 m/s / 0.92×` ASDS) currently use a mode-specific branch.
   - Replace with a single unified physical thrust-margin / deceleration-envelope handoff law shared across ASDS and RTLS.

8. **Direct high-orbit insertion early SECO-1 (`~25 s` early) & altitude shape error (`14–20 km` time-aligned):**
   - Both direct high-altitude SSO holdouts reach SECO-1 ~25–30 s early (`SAOCOM 1A`: `-27.6` to `-30 s`, `SSO-A`: `-24.3` to `-27 s`, plus fit-set `SpaceX CRS-16` at `-13.8` to `-16 s`), accompanied by a `14–20 km` time-aligned Stage 2 altitude shape error.
   - Hypotheses to test in order:
     1. **Payload masses:** verify and cite exact wet payload + dispenser/adapter stack masses (especially `SSO-A` rideshare total with SHERPA free-flyers/dispensers and `CRS-16` Dragon + trunk + cargo).
     2. **PEG loft / terminal constraints vs real lofted profiles:** compare our single-phase linear-gravity PEG pitch steering against real SpaceX high-orbit direct-insertion lofting/coasting/throttling profiles.
     3. **Stage 2 propellant load:** test sensitivity to Block 5 Stage 2 subcooled propellant load (`111.3 t` fitted vs published range).

9. **Visual polish items from v1.4 Part B review (implemented during v1.4 Part C):**
   - Liftoff steam scale: larger, longer-lived, buoyant clouds growing with thrust through `~T+10 s` (reusing `SoftParticles`).
   - Pad camera: `"Pad (Fixed)"` camera mode keeping the launch mount and billowing steam in frame through `~T+10 s`, alongside tracking `"Pad"` mode.
   - Regenerated `docs/demo.gif` from the `T-10 → T+10` countdown/ignition/liftoff sequence.

10. **Root-cause investigation of `EMPIRICAL` late-S1 accel caps (`2.90 g` LEO / `3.60 g` GTO) vs reconstructed telemetry axial acceleration:**
   - Reconstructing true late-S1 axial acceleration `a_axial ≈ dv/dt + g(h)·sin(γ)` from 1 Hz telemetry across all 10 pure Block 5 flights shows every flight exceeds the fitted caps: Class 0 LEO peaks at `3.29–3.67 g` (`DM-1: 3.29 g`, `CRS-16: 3.46 g`, `Iridium NEXT 8: 3.67 g`, `SAOCOM 1A: 3.56 g`, `SSO-A: 3.52 g`) vs fitted `2.90 g`; Class 1 GTO peaks at `3.82–3.86 g` (`Bangabandhu-1: 3.86 g`, `TelStar v19: 3.83 g`, `Iridium NEXT 7: 3.82 g`, `Eshail 2: 3.83 g`, `GPS III SV01: 3.86 g`) vs fitted `3.60 g`.
   - **MECO-reserve proxy hypothesis falsified (`feat/meco-reserve-unification`):** Removing the per-class caps (`4.0 g` physical bound) and fitting per-flight MECO propellant reserve fails all three tests — uncapped `T_vac/m_MECO` reaches `4.15–5.44 g` so all 10 flights saturate at `4.00 g`, fitted reserves do not separate by recovery mode (`CRS-16` RTLS `10.3%` < `SSO-A` ASDS `10.6%`; `DM-1` drains to `3.5%`), `Iridium 7/8` invert (`9.0%` vs `6.7%`), and S1 Vel RMS regresses on both holdout classes (`C0: 47.1 → 76.1 m/s`, `C1: 64.4 → 79.5 m/s`).
   - Remaining physical causes to test: (1) real Falcon 9 late-S1 throttle-down / Merlin 1D thrust profile below 100% rated thrust, (2) flight-path angle `sin(γ)` gravity-loss discrepancy during gravity turn (sim flying shallower than real LEO flights), or (3) S1/S2 dry & propellant mass budget.

11. **Payload-aware ASDS/RTLS recovery propellant reserve sizing:**
   - On light ASDS payloads (e.g., `SSO-A` at 4.0 t), the generic `7.5%` ASDS MECO reserve over-burns by `+7.1 s` even under v1 (`3.69 g`) and `+15.2 s` under the `2.90 g` LEO schedule.
   - Extend `solveMissionAscentDesign` to solve the recovery propellant reserve per mission (as a function of payload mass, orbit energy, and landing target distance) rather than applying a fixed `7.5%` ASDS constant.

12. **Stretch goals from original spec:**
   - Convex-optimization (G-FOLD-style) powered descent guidance.
   - 6-DOF rigid-body rotational dynamics (inertia tensor, TVC gimbal torque, RCS cold-gas thrusters, aerodynamic center-of-pressure / center-of-mass pitching moments).
