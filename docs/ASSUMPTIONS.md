# Physics Model Assumptions & Simplifications

This document tracks every `ASSUMED` parameter, modeling simplification, and empirical finding where the simulator diverges from a full 6-DOF flight dynamics simulation of a real Falcon 9 Block 5 mission.

---

<!-- BEGIN GENERATED: CONSTANTS_REGISTRY -->
<!-- Auto-generated from src/sim/config/registry.ts via `pnpm docs:assumptions`. Do not edit by hand. -->

## Constants Registry (Single Source of Truth)

Every `SOURCED`, `CALIBRATED`, `EMPIRICAL`, `ASSUMED`, and `HEURISTIC` constant in `src/sim/` (208 entries) is defined in `src/sim/config/registry.ts` and rendered here automatically.

### Planetary & Atmosphere

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `G0` | `9.80665 m/s^2` | `SOURCED` | — | `v1.0.0` | CGPM 1901 / ISO 80000-3 standard gravity |
| `EARTH_MU` | `3.9860e+14 m^3/s^2` | `SOURCED` | — | `v1.0.0` | WGS-84 (NIMA TR8350.2) geocentric gravitational constant |
| `EARTH_RADIUS_EQUATORIAL_M` | `6.3781e+6 m` | `SOURCED` | — | `v1.0.0` | WGS-84 (NIMA TR8350.2) equatorial semi-major axis a |
| `EARTH_FLATTENING` | `0.0033528106647474805` | `SOURCED` | — | `v1.0.0` | WGS-84 (NIMA TR8350.2) flattening f = 1 / 298.257223563 |
| `EARTH_RADIUS_MEAN_M` | `6.3710e+6 m` | `SOURCED` | — | `v1.0.0` | WGS-84 mean Earth radius for great-circle downrange |
| `EARTH_OMEGA_RAD_S` | `7.2921e-5 rad/s` | `SOURCED` | — | `v1.0.0` | WGS-84 (NIMA TR8350.2) Earth sidereal rotation rate |
| `EARTH_J2` | `0.00108262668` | `SOURCED` | — | `v1.0.0` | EGM96 / WGS-84 second zonal harmonic J2 |
| `US76_R0_M` | `6.3568e+6 m` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 (NOAA-S/T 76-1562) effective radius r0 |
| `SEA_LEVEL_PRESSURE_PA` | `101,325 Pa` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 sea-level pressure p0 |
| `SEA_LEVEL_TEMP_K` | `288.15 K` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 sea-level temperature T0 |
| `AIR_GAS_CONSTANT` | `287.05287 J/(kg*K)` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 specific gas constant for dry air |
| `AIR_GAMMA` | `1.4` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 ratio of specific heats for dry air |
| `US76_TOP_GEOMETRIC_M` | `86,000 m` | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 top of 7-layer geopotential model |
| `US76_LAYERS_TABLE` | `[7 layers]` ([H(m), T(K), L(K/m)]) | `SOURCED` | — | `v1.0.0` | US Standard Atmosphere 1976 (NOAA-S/T 76-1562) 7-layer geopotential temperature/lapse table |
| `ATMO_UPPER_SCALE_HEIGHT_M` | `5,800 m` | `ASSUMED` | — | `v1.0.0` | Exponential scale height continuation above 86 km in lower thermosphere |
| `ATMO_VACUUM_CUTOFF_M` | `200,000 m` | `ASSUMED` | — | `v1.0.0` | Altitude above which atmospheric density and pressure are treated as vacuum (0) |
| `ASSUMED_MAX_Q_ALPHA_PA_DEG` | `200,000 Pa*deg` | `ASSUMED` | — | `v1.1.0` | Representative orbital launch vehicle structural bending-moment envelope (~3.49 kPa*rad) |

### Vehicle & Propulsion

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `MERLIN_1D_THRUST_VAC_N` | `908,722 N` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 914.11 +/- 6.00 kN SpaceX spec = 8,227 kN / 9) *(post: 908.72 +/- 5.63 kN/engine)* |
| `MERLIN_1D_EXIT_AREA_M2` | `0.68 m^2` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 0.680 +/- 0.015 m^2 from SpaceX (T_vac - T_sl) / p0, d_exit = 0.931 m) *(post: 0.680 +/- 0.015 m^2)* |
| `MERLIN_1D_ISP_VAC_S` | `311.04 s` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 311.0 +/- 2.0 s SpaceX spec) *(post: 311.04 +/- 1.91 s)* |
| `MERLIN_1D_MIN_THROTTLE` | `0.4` | `ASSUMED` | — | `v1.0.0` | Publicly cited Merlin 1D Block 5 deep-throttle floor (~40%) |
| `MVAC_THRUST_VAC_N` | `983,169 N` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 981.0 +/- 10.0 kN SpaceX spec) *(post: 983.17 +/- 9.26 kN)* |
| `MVAC_ISP_VAC_S` | `347.9 s` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 348.0 +/- 2.0 s SpaceX spec) *(post: 347.90 +/- 1.98 s)* |
| `MVAC_NOZZLE_RADIUS_M` | `1.65 m` | `ASSUMED` | — | `v1.0.0` | Approximate 3.3 m diameter MVac radiatively cooled nozzle extension |
| `MVAC_MIN_THROTTLE` | `0.39` | `ASSUMED` | — | `v1.0.0` | Publicly cited MVac minimum throttle (~39-40%) |
| `F9_TOTAL_HEIGHT_M` | `70 m` | `SOURCED` | — | `v1.0.0` | SpaceX Falcon User's Guide (70 m overall vehicle height) |
| `F9_CORE_DIAMETER_M` | `3.7 m` | `SOURCED` | — | `v1.0.0` | SpaceX Falcon User's Guide (3.7 m core diameter) |
| `F9_FAIRING_DIAMETER_M` | `5.2 m` | `SOURCED` | — | `v1.0.0` | SpaceX Falcon User's Guide (5.2 m fairing diameter) |
| `F9_FAIRING_LENGTH_M` | `13.1 m` | `SOURCED` | — | `v1.0.0` | SpaceX Falcon User's Guide (13.1 m fairing length) |
| `F9_FAIRING_MASS_KG` | `1,900 kg` | `SOURCED` | — | `v1.0.0` | Public SpaceX / Wikipedia F9 Block 5 fairing mass (~1,900 kg both halves) |
| `F9_S1_DRY_MASS_KG` | `26,955 kg` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (MAP ~ 27.0 +/- 1.9 t, prior 25.6 +/- 2.0 t; prior-dominated, see BACKLOG) *(post: 26,955 +/- 1,857 kg (prior 25,600 +/- 2,000 kg))* |
| `F9_S1_PROPELLANT_MASS_KG` | `422,671 kg` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 411,000 +/- 8,000 kg Spaceflight101 / Wikipedia F9 FT-B5) *(post: 422,671 +/- 6,148 kg)* |
| `F9_S1_LENGTH_M` | `42.6 m` | `SOURCED` | — | `v1.0.0` | Public Falcon 9 Block 5 Stage 1 + interstage geometry (~42.6 m) |
| `F9_S2_DRY_MASS_KG` | `4,234 kg` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 4,200 +/- 400 kg public F9 Stage 2 estimates) *(post: 4,234 +/- 398 kg)* |
| `F9_S2_PROPELLANT_MASS_KG` | `111,310 kg` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A fit (prior 109,500 +/- 3,000 kg Spaceflight101 / Wikipedia F9 FT-B5) *(post: 111,310 +/- 1,668 kg)* |
| `F9_S2_LENGTH_M` | `12.6 m` | `SOURCED` | — | `v1.0.0` | Public Falcon 9 Block 5 Stage 2 geometry (~12.6 m) |
| `F9_S1_MAX_AXIAL_ACCEL_G` | `3.69 g` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A vehicle-level Stage 1 axial G cap (prior 4.00 +/- 0.50 g) *(post: 3.69 +/- 0.45 g)* |
| `F9_S2_MAX_AXIAL_ACCEL_G` | `3.52 g` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `c1adfc1` | MAP Stage 2-only fit with widened prior (3.50 +/- 0.40 g, MLE 3.52 g) *(post: 3.52 +/- 0.31 g)* |
| `ASCENT_ATTITUDE_SLEW_RATE_DEG_S` | `5 deg/s` | `ASSUMED` | — | `v1.0.0` | Simplified 3-DOF ascent attitude slew rate cap |
| `BOOSTER_FLIP_SLEW_RATE_DEG_S` | `12 deg/s` | `ASSUMED` | — | `v1.0.0` | Simplified cold-gas RCS booster flip slew rate (~15 s for 180 deg flip) |

### Aerodynamics

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `ASCENT_CD_MAP_SCALE` | `1.041` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `cda728a` | MAP Variant A ascent drag multiplier (prior 1.00 +/- 0.15; prior-dominated) *(post: 1.041 +/- 0.149)* |
| `ASCENT_CD_MACH_BASE_TABLE` | `[12 pts]` (0:0.48, 0.5:0.48, 0.8:0.56, 0.95:0.76, 1.05:0.88, 1.2:0.8, 1.5:0.66, 2:0.52, 3:0.42, 4:0.36, 6:0.32, 10:0.3) | `ASSUMED` | — | `v1.0.0` | Core-area-referenced (10.7521 m^2) slender launch-vehicle Cd(M), scaled by 1.975x fairing/core area ratio |
| `BOOSTER_DESCENT_CD_MACH_TABLE` | `[9 pts]` (0:1.15, 0.5:1.2, 0.85:1.3, 1.05:1.42, 1.5:1.68, 2.2:1.68, 2.9:1.65, 4:1.58, 8:1.5) | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `99843f1` | Tail-first octaweb + titanium grid-fin Cd(M) reconstructed from stage1 telemetry (incl. M < 1.2); LOO validated & cross-checked on 6 B3/4 flights |
| `BOOSTER_GRID_FIN_CL_PER_RAD` | `0.8 rad^-1` | `ASSUMED` | — | `v1.0.0` | Simplified grid-fin + booster-body lateral lift slope (max +/-20 deg -> L/D ~ 0.25-0.30) |
| `BOOSTER_GRID_FIN_MAX_DEFL_DEG` | `20 deg` | `ASSUMED` | — | `v1.0.0` | Maximum titanium grid-fin aerodynamic deflection authority (+/-20 deg) |

### Ascent & Stage 2 Guidance

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `IGNITION_START_S` | `-3 s` | `SOURCED` | — | `558b5c7` | SpaceX Falcon User's Guide / webcast Merlin 1D TEA-TEB ignition command at T-3 s |
| `WATER_DELUGE_START_S` | `-5 s` | `ASSUMED` | — | `558b5c7` | Pad Niagara acoustic water deluge start prior to T-3 s ignition (exact valve timings unpublished) |
| `IGNITION_SPOOL_UP_DURATION_S` | `2.2 s` | `ASSUMED` | — | `558b5c7` | Smoothstep thrust spool-up 0->100% (T-3.0 to T-0.8 s) before 0.8 s hold-down health verification |
| `WEBCAST_LIFTOFF_OFFSET_S` | `0 s` | `CALIBRATED` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `04d3799` | Hold-down clamp release at T=0 fits early webcast ascent (T+0..30 s) best at 0.0 s (38-40 m RMS) |
| `ASCENT_PITCH_KICK_ALTITUDE_M` | `150 m` | `ASSUMED` | — | `v1.0.0` | Tower-clearance altitude AGL above launch pad before initiating pitchover kick |
| `ASCENT_PITCH_KICK_DURATION_S` | `8 s` | `ASSUMED` | — | `v1.0.0` | Smooth pitchover ramp duration from vertical rise into gravity turn |
| `ASCENT_MAX_Q_THROTTLE_START_PA` | `22,000 Pa` | `ASSUMED` | — | `v1.0.0` | Shared v1 transonic max-Q throttle bucket entry dynamic pressure |
| `ASCENT_MAX_Q_THROTTLE_END_MACH` | `1.38 Mach` | `ASSUMED` | — | `v1.0.0` | Shared v1 transonic max-Q throttle bucket exit Mach number |
| `ASCENT_MAX_Q_MIN_THROTTLE` | `0.72` | `ASSUMED` | — | `v1.0.0` | Shared v1 transonic max-Q throttle bucket minimum throttle setting |
| `STAGE_SEP_DELAY_S` | `3.5 s` | `SOURCED` | — | `v1.0.0` | Typical MECO-to-stage-separation delay in SpaceX press kits and webcasts (~3-4 s) |
| `SES1_DELAY_FROM_MECO_S` | `8 s` | `SOURCED` | — | `v1.0.0` | Typical MECO-to-SES-1 ignition delay in SpaceX press kits (DM-1 overrides with 11.0 s from events.json) |
| `FAIRING_SEP_ALTITUDE_M` | `115,000 m` | `ASSUMED` | — | `v1.0.0` | Free-molecular aerodynamic heating threshold (~115 km) for payload fairing jettison |
| `CLASS_LEO_MAX_AXIAL_ACCEL_G` | `2.9 g` | `EMPIRICAL` | DM-1, SpaceX CRS-16, Iridium NEXT 8 | `df229f4` | Effective late-S1 accel cap for Class 0 LEO (sits 0.39-0.77 g below reconstructed true axial accel 3.29-3.67 g; BACKLOG #10) |
| `CLASS_GTO_MAX_AXIAL_ACCEL_G` | `3.6 g` | `EMPIRICAL` | Bangabandhu-1 | `df229f4` | Effective late-S1 accel cap for Class 1 GTO (sits 0.22-0.26 g below reconstructed true axial accel 3.82-3.86 g; BACKLOG #10) |
| `CLASS_GTO_ALTITUDE_THRESHOLD_M` | `2.0000e+6 m` | `ASSUMED` | — | `d7e22aa` | What-If orbit-type mission-class predictor threshold (9/10 LOO accuracy on 10 Block 5 flights) |
| `CLOSED_LOOP_LEAN_FLOOR_KG` | `2,500 kg` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `388a1cd` | Closed-loop MECO absolute touchdown propellant floor above ~4.5-5.5 t landing burn (8-flight aero mass ~30.5-31.6 t) |
| `DEFAULT_TRANSFER_PERIGEE_ALT_M` | `185,000 m` | `ASSUMED` | — | `v1.3.1` | Two-burn Hohmann transfer parking perigee altitude (matching ~183 km Iridium-8 transfer perigee) |
| `AUTO_TWO_BURN_ALTITUDE_M` | `250,000 m` | `HEURISTIC` | — | `v1.3.1` | What-If default altitude threshold to enable two-burn Hohmann transfer when ascentProfile is omitted |
| `IRIDIUM_8_DRONESHIP_DOWNRANGE_KM` | `244 km` | `ASSUMED` | — | `e87a77e` | Estimated from Pacific NOTMAR hazard zone & observed 33 s partial boostback burn (exact km unpublished in press kit) |
| `CLOSED_LOOP_MECO_TRIGGER_RATIO` | `1.45` | `HEURISTIC` | — | `388a1cd` | Activate real-time closed-loop MECO reserve estimator when S1 prop drops below 1.45x nominal reserve |
| `BOOSTBACK_LOCAL_G_MS2` | `9.55 m/s^2` | `ASSUMED` | — | `v1.0.0` | Effective local gravity at ~60-100 km boostback altitude for analytic ballistic impact predictor |
| `BOOSTBACK_FLIP_COAST_S` | `15 s` | `ASSUMED` | — | `388a1cd` | Cold-gas RCS 180 deg flip duration (~180 deg / 12 deg/s) added to stageSepDelayS in closed-loop MECO predictor |
| `BOOSTBACK_DRAG_FACTOR_RTLS` | `0.92` | `ASSUMED` | — | `v1.0.0` | Ballistic time-of-flight drag shortening factor (~8% loss) for steeper RTLS descent |
| `BOOSTBACK_DRAG_FACTOR_ASDS_BB` | `0.965` | `ASSUMED` | — | `5a610c4` | Ballistic time-of-flight drag shortening factor (~3.5% loss) for shallower close-in ASDS partial boostback |
| `BOOSTBACK_DEFAULT_PITCH_DEG` | `-4 deg` | `ASSUMED` | — | `v1.0.0` | Fallback boostback thrust depression angle when boostbackPitchDeg is omitted |
| `CLOSED_LOOP_BB_PITCH_TOF_COEFF` | `0.28` | `HEURISTIC` | — | `388a1cd` | Linear approximation of downward boostback pitch apogee/time-of-flight shortening in MECO reserve estimator |
| `CLOSED_LOOP_MIN_TFLIGHT_S` | `10 s` | `HEURISTIC` | — | `388a1cd` | Numerical floor on predicted boostback time-of-flight in closed-loop MECO reserve estimator |
| `CLOSED_LOOP_LANDING_DV_MS` | `720 m/s` | `ASSUMED` | — | `388a1cd` | Budgeted landing-burn delta-v in closed-loop MECO propellant reserve estimator |
| `CLOSED_LOOP_ENTRY_DV_MIN_MS` | `550 m/s` | `ASSUMED` | — | `388a1cd` | Minimum budgeted entry-burn delta-v in closed-loop MECO propellant reserve estimator |
| `CLOSED_LOOP_ENTRY_DV_MAX_MS` | `920 m/s` | `ASSUMED` | — | `388a1cd` | Maximum budgeted entry-burn delta-v in closed-loop MECO propellant reserve estimator |
| `CLOSED_LOOP_ENTRY_DV_VFALL_FRAC` | `0.54` | `ASSUMED` | — | `388a1cd` | Fraction of estimated ballistic fall speed budgeted for entry burn in closed-loop MECO estimator |
| `CLOSED_LOOP_BB_DV_MARGIN_MULT` | `1.05` | `ASSUMED` | — | `388a1cd` | 5% finite-burn / gravity-loss margin on boostback delta-v in closed-loop MECO estimator |
| `ASCENT_MAX_Q_ALT_CEILING_M` | `28,000 m` | `ASSUMED` | — | `v1.0.0` | Altitude ceiling below which transonic max-Q throttle bucket can engage |
| `ASCENT_BUCKET_RAMP_FRAC` | `0.2` | `ASSUMED` | — | `04d3799` | Trapezoidal max-Q throttle bucket ramp-in/out fraction of total duration |
| `ASCENT_BUCKET_MAX_RAMP_S` | `5 s` | `ASSUMED` | — | `04d3799` | Maximum trapezoidal max-Q throttle bucket ramp duration |
| `ASCENT_MAX_Q_RAMP_DOWN_START_MACH` | `1.02 Mach` | `ASSUMED` | — | `v1.0.0` | Shared v1 max-Q throttle bucket ramp-down start Mach |
| `ASCENT_MAX_Q_RAMP_DOWN_WIDTH_MACH` | `0.2 Mach` | `ASSUMED` | — | `v1.0.0` | Shared v1 max-Q throttle bucket ramp-down Mach span (1.02..1.22) |
| `ASCENT_MAX_Q_RAMP_UP_START_MACH` | `1.24 Mach` | `ASSUMED` | — | `v1.0.0` | Shared v1 max-Q throttle bucket ramp-up start Mach |
| `ASCENT_MAX_Q_RAMP_UP_MIN_WIDTH_MACH` | `0.05 Mach` | `HEURISTIC` | — | `v1.0.0` | Minimum denominator Mach span guard during max-Q throttle bucket ramp-up |
| `STAGE2_COAST_PRE_PITCH_RAD` | `0.25 rad` | `ASSUMED` | — | `v1.0.0` | Stage 2 pre-SES-1 coast attitude pitch (~14 deg above horizontal) |
| `STAGE2_DV_HORIZ_FLOOR_FRAC` | `0.98` | `HEURISTIC` | — | `0e1d762` | Horizontal delta-v floor multiplier in direct-insertion PEG t_go estimate |
| `STAGE2_GLIMIT_MASS_MARGIN` | `1.001` | `HEURISTIC` | — | `0e1d762` | 0.1% mass tolerance for detecting Stage 2 axial G-limited burn phase |
| `STAGE2_MIN_ATHRUST_GUARD_MS2` | `0.1 m/s^2` | `HEURISTIC` | — | `v1.0.0` | Numerical floor on Stage 2 thrust acceleration in guidance divisions |
| `STAGE2_PEG_MIN_TGO_S` | `3 s` | `ASSUMED` | — | `0e1d762` | Minimum PEG time-to-go clamp during direct insertion |
| `STAGE2_PEG_MAX_TAU_FRAC` | `0.96` | `HEURISTIC` | — | `0e1d762` | Maximum fraction of propellant exhaustion time tau in PEG t_go clamp |
| `STAGE2_PEG_LOFT_MIN_TGO_S` | `15 s` | `ASSUMED` | — | `0e1d762` | Minimum t_go to use exact variable-mass PEG integrals during high-altitude direct loft |
| `STAGE2_DIRECT_LOFT_MIN_SIN_THETA` | `-0.8` | `ASSUMED` | — | `0e1d762` | Minimum sin(pitch) clamp for high-altitude (>250 km) direct-insertion loft |
| `STAGE2_DIRECT_LOFT_MAX_SIN_THETA` | `0.9` | `ASSUMED` | — | `0e1d762` | Maximum sin(pitch) clamp for high-altitude (>250 km) direct-insertion loft |
| `STAGE2_DIRECT_MIN_SIN_THETA` | `-0.55` | `ASSUMED` | — | `v1.0.0` | Minimum sin(pitch) clamp for standard LEO direct insertion |
| `STAGE2_DIRECT_MAX_SIN_THETA` | `0.72` | `ASSUMED` | — | `v1.0.0` | Maximum sin(pitch) clamp for standard LEO direct insertion & SES-1 |
| `STAGE2_YAW_GAIN_SES1` | `26` | `ASSUMED` | — | `v1.0.0` | Cross-track orbital inclination steering proportional gain during SES-1 / direct burn |
| `STAGE2_MAX_SIN_YAW_SES1` | `0.35` | `ASSUMED` | — | `v1.0.0` | Maximum sin(yaw) steering authority (~20.5 deg) during SES-1 / direct burn |
| `STAGE2_SECO1_MIN_PERIGEE_M` | `120,000 m` | `ASSUMED` | — | `v1.3.1` | Minimum transfer-orbit perigee altitude required before two-burn SECO-1 cutoff |
| `STAGE2_SES1_MIN_DV_REM_MS` | `20 m/s` | `HEURISTIC` | — | `v1.3.1` | Minimum remaining delta-v floor in two-burn SES-1 t_go estimate |
| `STAGE2_SES1_MIN_TGO_S` | `25 s` | `ASSUMED` | — | `v1.3.1` | Minimum t_go clamp for two-burn SES-1 radial BVP guidance |
| `STAGE2_SES1_MIN_SIN_THETA` | `-0.45` | `ASSUMED` | — | `v1.3.1` | Minimum sin(pitch) clamp during two-burn SES-1 transfer orbit insertion |
| `STAGE2_KEPLER_MAX_ECC` | `0.99` | `HEURISTIC` | — | `v1.3.1` | Upper eccentricity guard for elliptic Keplerian time-to-apoapsis solver |
| `STAGE2_COAST_DESCENDING_GUARD_S` | `120 s` | `HEURISTIC` | — | `v1.3.1` | Early post-SECO-1 coast window before treating v_radial < 0 as past apoapsis |
| `STAGE2_COAST_MIN_DURATION_S` | `60 s` | `ASSUMED` | — | `v1.3.1` | Minimum ballistic transfer coast duration before allowing SES-2 ignition |
| `STAGE2_COAST_APOAPSIS_FALLBACK_S` | `300 s` | `ASSUMED` | — | `v1.3.1` | Coast elapsed time after which v_radial <= 0 triggers SES-2 apoapsis ignition fallback |
| `STAGE2_YAW_GAIN_SES2` | `12` | `ASSUMED` | — | `v1.3.1` | Gentle cross-track inclination trim gain during SES-2 circularization |
| `STAGE2_MAX_SIN_YAW_SES2` | `0.15` | `ASSUMED` | — | `v1.3.1` | Maximum sin(yaw) trim authority (~8.6 deg) during SES-2 circularization |
| `STAGE2_SECO2_PERIGEE_TOL_M` | `1,500 m` | `ASSUMED` | — | `v1.3.1` | Perigee altitude tolerance for SECO-2 circularization cutoff |

### Booster Recovery & Entry

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `SUTTON_GRAVES_K_EARTH` | `1.7415e-4 W/(m^(3/2)*(m/s)^3)` | `SOURCED` | — | `70826b1` | Sutton & Graves (1971) NASA TR R-376 Earth convective stagnation heating constant |
| `BOOSTER_BASE_RADIUS_M` | `1.85 m` | `SOURCED` | — | `70826b1` | Falcon 9 core base radius (3.7 m / 2) used as blunt-body effective nose radius in Sutton-Graves proxy |
| `ENTRY_BURN_HEATING_LIMIT_MW_M2` | `0.022 MW/m^2` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Predictive Sutton-Graves entry-burn thermal envelope target (+0.06 km 8-flight ignition-altitude bias; LOO -1.93 / +0.97 km) |
| `ENTRY_BURN_AERO_LEAD_S` | `14 s` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Predictive entry-burn aerodynamic lead time before unburned peak stagnation heating |
| `ENTRY_BURN_TARGET_ACCEL_G` | `3.6 g` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Mass-invariant 3-engine throttled / 1-3-1 average entry deceleration (matches 3.4-4.2 g across 11 telemetry flights) |
| `ENTRY_BURN_MAX_DURATION_S` | `26 s` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Maximum 3-engine entry-burn duration cap |
| `TERMINAL_FLARE_TARGET_VTD_MS` | `0.55 m/s` | `ASSUMED` | — | `e87a77e` | Nominal terminal touchdown vertical speed keeping 0.55 + 1.35 m/s max ASDS deck heave < 2.0 m/s |
| `TERMINAL_FLARE_HEIGHT_M` | `1.85 m` | `ASSUMED` | — | `e87a77e` | Terminal flare transition altitude AGL above 1.5 m peak ASDS ocean heave |
| `ANTI_HOVER_FLARE_GATE_ALT_M` | `2.5 m` | `HEURISTIC` | — | `a6e7a2f` | Altitude gate below which anti-hover timer starts to mitigate unaided INS negative v_z bias (tracked in BACKLOG for radar velocity estimation) |
| `ANTI_HOVER_FLARE_DELAY_S` | `3.5 s` | `HEURISTIC` | — | `a6e7a2f` | Terminal flare dwell time before ramping vTd to break unaided INS velocity-bias hover-hang |
| `ANTI_HOVER_FLARE_RAMP_MS_PER_S` | `0.15 m/s^2` | `HEURISTIC` | — | `a6e7a2f` | Smooth vTd ramp rate after flare dwell delay so descent resumes without hard free-fall |
| `ANTI_HOVER_FLARE_MAX_ADD_MS` | `0.65 m/s` | `HEURISTIC` | — | `a6e7a2f` | Maximum additional descent speed commanded by anti-hover ramp (caps vTd at 1.20 m/s) |
| `ENTRY_PRED_MAX_TIME_S` | `120 s` | `ASSUMED` | — | `99843f1` | Ballistic entry heating lookahead integration horizon |
| `ENTRY_PRED_MIN_ALT_M` | `4,000 m` | `ASSUMED` | — | `99843f1` | Ballistic entry heating lookahead altitude floor |
| `ENTRY_PRED_EARTH_RADIUS_M` | `6.3710e+6 m` | `ASSUMED` | — | `99843f1` | Rounded mean Earth radius used in 2D ballistic entry lookahead gravity scaling |
| `ENTRY_PRED_CACHE_INTERVAL_S` | `0.49 s` | `HEURISTIC` | — | `99843f1` | Ballistic entry lookahead cache refresh interval (~2 Hz) |
| `ASDS_DECK_HEAVE_PERIOD_S` | `7 s` | `ASSUMED` | — | `v1.1.0` | Simplified ocean swell heave period for ASDS barge deck motion |
| `ASDS_DECK_ROLL_PERIOD_S` | `8 s` | `ASSUMED` | — | `v1.1.0` | Simplified ocean swell roll period for ASDS barge deck motion |
| `ASDS_DECK_ROLL_PHASE_MULT` | `1.3` | `ASSUMED` | — | `v1.1.0` | Phase offset multiplier decorrelating ASDS barge roll from heave |
| `TOUCHDOWN_CHECK_DELAY_S` | `10 s` | `HEURISTIC` | — | `v1.0.0` | Post-stage-separation guard delay before enabling ground/deck touchdown detection |
| `TOUCHDOWN_MAX_MISS_RTLS_M` | `15 m` | `ASSUMED` | — | `v1.1.0` | Strict RTLS lateral touchdown miss criterion (< 15 m on concrete pad) |
| `TOUCHDOWN_MAX_MISS_ASDS_M` | `10 m` | `ASSUMED` | — | `v1.1.0` | Strict ASDS lateral touchdown miss criterion (< 10 m on barge deck) |
| `TOUCHDOWN_MAX_TILT_DEG` | `5 deg` | `ASSUMED` | — | `v1.1.0` | Strict touchdown tilt criterion (< 5 deg including ASDS deck roll) |
| `BOOSTER_SEP_COAST_S` | `3 s` | `ASSUMED` | — | `v1.0.0` | Post-stage-separation coast duration before initiating cold-gas RCS flip |
| `BOOSTER_MIN_DRY_MASS_FLOOR_KG` | `10,000 kg` | `HEURISTIC` | — | `388a1cd` | Numerical safety floor on instantaneous booster dry mass |
| `BOOSTER_LANDING_RESERVE_DV_MS` | `650 m/s` | `ASSUMED` | — | `388a1cd` | Tsiolkovsky landing-burn delta-v reserve used for actual-mass entry cutoff |
| `BOOSTER_ENTRY_IGN_EXTRA_PROP_KG` | `1,500 kg` | `ASSUMED` | — | `388a1cd` | Minimum extra propellant above landing reserve required to ignite entry burn |
| `BOOSTER_ENTRY_RESERVE_DV_MS` | `650 m/s` | `ASSUMED` | — | `388a1cd` | Tsiolkovsky entry-burn delta-v reserve used for actual-mass boostback cutoff |
| `BOOSTER_FLIP_TARGET_MIN_DIST_M` | `100 m` | `HEURISTIC` | — | `v1.0.0` | Minimum horizontal distance to target for boostback flip vector calculation |
| `BOOSTER_FLIP_COMPLETE_RAD` | `0.14 rad` | `ASSUMED` | — | `v1.0.0` | Attitude alignment tolerance (~8 deg) to finish cold-gas RCS flip |
| `BOOSTBACK_CUTOFF_MISS_RTLS_M` | `1,500 m` | `ASSUMED` | — | `v1.0.0` | RTLS boostback ballistic impact miss cutoff threshold (grid fins close remaining miss) |
| `BOOSTBACK_CUTOFF_MISS_ASDS_BB_M` | `500 m` | `ASSUMED` | — | `5a610c4` | Close-in ASDS partial-boostback ballistic impact miss cutoff threshold |
| `BOOSTER_THREE_ENGINE_INDICES` | `[0, 1, 5] idx` | `SOURCED` | — | `v1.0.0` | Falcon 9 3-engine burn configuration (center engine 0 + opposite outer engines 1 & 5) |
| `ENTRY_IGN_MIN_DESCENT_RATE_MS` | `-50 m/s` | `ASSUMED` | — | `99843f1` | Minimum downward speed to evaluate predictive entry-burn ignition |
| `ENTRY_IGN_MAX_ALT_M` | `95,000 m` | `ASSUMED` | — | `99843f1` | Maximum altitude to begin predictive entry-burn heating lookahead |
| `ENTRY_AERO_FALLBACK_ALT_M` | `35,000 m` | `ASSUMED` | — | `99843f1` | Altitude below which ballistic coast transitions to aero descent if no entry burn was needed |
| `ENTRY_CUTOFF_MIN_ALT_M` | `28,000 m` | `ASSUMED` | — | `99843f1` | Minimum altitude safety cutoff floor for 3-engine entry burn |
| `LANDING_NOM_THROTTLE_FRAC` | `0.88` | `ASSUMED` | — | `e87a77e` | Nominal 1-engine throttle fraction (88%) used for suicide-burn ignition altitude sizing |
| `LANDING_3ENG_THROTTLE_SUM` | `2.4` | `ASSUMED` | — | `e87a77e` | 3-engine emergency stopping thrust multiplier (80% x 3 engines) for hStop3 envelope |
| `LANDING_3ENG_MIN_ANET_MS2` | `4 m/s^2` | `HEURISTIC` | — | `e87a77e` | Minimum net 3-engine deceleration floor in hStop3 calculation |
| `LANDING_IGN_ALT_BIAS_M` | `35 m` | `ASSUMED` | — | `e87a77e` | Ignition altitude safety bias above analytic zero-altitude stopping height |
| `LANDING_MAX_IGN_ALT_CEILING_M` | `6,000 m` | `ASSUMED` | — | `e87a77e` | Upper cap on landing-burn ignition altitude |
| `LANDING_MAX_IGN_ALT_FLOOR_M` | `4,500 m` | `ASSUMED` | — | `e87a77e` | Nominal landing-burn ignition ceiling allowing free aerodynamic drag braking |
| `LANDING_HSTOP3_MARGIN_MULT` | `1.15` | `ASSUMED` | — | `e87a77e` | 15% margin on 3-engine stopping altitude when raising landing ignition ceiling |
| `LANDING_IGN_MIN_VUP_MS` | `-5 m/s` | `ASSUMED` | — | `v1.0.0` | Minimum downward speed required to ignite landing burn |
| `AERO_GLIDE_TOF_FACTOR` | `0.92` | `ASSUMED` | — | `v1.1.0` | Gravity-steepening factor on unpowered aero glide-slope time-to-go |
| `AERO_GLIDE_MIN_VDOWN_MS` | `40 m/s` | `HEURISTIC` | — | `v1.1.0` | Numerical floor on downward speed in aero glide-slope predictor |
| `AERO_GLIDE_MIN_ALT_REF_M` | `600 m` | `HEURISTIC` | — | `v1.1.0` | Minimum altitude denominator in aero glide-slope angular error calculation |
| `AERO_GRID_FIN_GAIN` | `1.15` | `ASSUMED` | — | `v1.1.0` | Proportional gain mapping aero glide-slope angular error (deg) to grid-fin deflection (deg) |
| `LANDING_LEGS_DEPLOY_ALT_M` | `120 m` | `ASSUMED` | — | `v1.0.0` | Altitude AGL at which Falcon 9 Block 5 landing legs deploy |
| `TERMINAL_FLARE_TRANSITION_MARGIN_M` | `0.25 m` | `HEURISTIC` | — | `e87a77e` | Height margin above hFlare for switching from quadratic hoverslam to proportional flare |
| `TERMINAL_FLARE_DENOM_FLOOR_M` | `0.35 m` | `HEURISTIC` | — | `e87a77e` | Minimum denominator in quadratic hoverslam vertical braking law near hFlare |
| `TERMINAL_FLARE_VEL_GAIN` | `2.4 s^-1` | `ASSUMED` | — | `e87a77e` | Proportional vertical velocity damping gain in terminal flare |
| `LANDING_TGO_MIN_VDEN_MS` | `1.5 m/s` | `HEURISTIC` | — | `v1.1.0` | Minimum velocity denominator in constant-deceleration t_go calculation |
| `LANDING_ZEM_GATE_LEAD_S` | `1.8 s` | `ASSUMED` | — | `v1.1.0` | Terminal vertical alignment gate lead time prior to touchdown |
| `LANDING_ZEM_GATE_MIN_TGO_S` | `0.8 s` | `HEURISTIC` | — | `v1.1.0` | Minimum t_go floor for ZEM/ZEV lateral guidance |
| `LANDING_ZEM_MIN_ALT_M` | `12 m` | `ASSUMED` | — | `v1.1.0` | Altitude AGL below which ZEM/ZEV transitions to terminal vertical lateral damping |
| `LANDING_ZEM_MIN_TGO_S` | `2.4 s` | `ASSUMED` | — | `v1.1.0` | Minimum total t_go required to keep ZEM/ZEV lateral targeting active |
| `LANDING_TERM_POS_CUTOFF_ALT_M` | `3 m` | `ASSUMED` | — | `v1.1.0` | Altitude AGL below which terminal lateral position weight fades to zero |
| `LANDING_TERM_POS_FADE_SPAN_M` | `9 m` | `ASSUMED` | — | `v1.1.0` | Altitude span (3..12 m AGL) over which terminal lateral position weight fades |
| `LANDING_TERM_POS_GAIN` | `0.8 s^-2` | `ASSUMED` | — | `v1.1.0` | Terminal vertical descent lateral position gain |
| `LANDING_TERM_VEL_GAIN` | `3.2 s^-1` | `ASSUMED` | — | `v1.1.0` | Terminal vertical descent lateral velocity damping gain |
| `LANDING_UPRIGHT_FLARE_ALT_M` | `2.6 m` | `ASSUMED` | — | `v1.1.0` | Altitude AGL below which max tilt linearly flares to 0 deg by 0.5 m AGL |
| `LANDING_UPRIGHT_FLARE_SPAN_M` | `2.1 m` | `ASSUMED` | — | `v1.1.0` | Altitude span (0.5..2.6 m AGL) for final upright alignment flare |
| `LANDING_MAX_TILT_FLARE_RAD` | `0.12 rad` | `ASSUMED` | — | `v1.1.0` | Max tilt limit (~6.9 deg) entering final upright alignment flare |
| `LANDING_MAX_TILT_LOW_ALT_M` | `30 m` | `ASSUMED` | — | `v1.1.0` | Altitude threshold for intermediate terminal tilt cap |
| `LANDING_MAX_TILT_LOW_RAD` | `0.35 rad` | `ASSUMED` | — | `v1.1.0` | Max tilt limit (~20 deg) below 30 m AGL |
| `LANDING_MAX_TILT_HIGH_RAD` | `0.65 rad` | `ASSUMED` | — | `v1.1.0` | Max tilt limit (~37 deg) during upper landing burn |
| `LANDING_3TO1_MIN_VDOWN_MS` | `15 m/s` | `ASSUMED` | — | `e87a77e` | Minimum downward speed for unified 3-to-1 landing-burn engine handoff |
| `LANDING_3TO1_MIN_ALT_M` | `30 m` | `ASSUMED` | — | `e87a77e` | Minimum altitude AGL for unified 3-to-1 landing-burn engine handoff |
| `LANDING_3TO1_THRUST_FRAC` | `0.9` | `ASSUMED` | — | `e87a77e` | Single-engine thrust utilization threshold (90%) for unified 3-to-1 landing-burn handoff |

### Mission Design & Solver

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `PROFILE_KICK_LEO_DIRECT_DEG` | `1.3 deg` | `CALIBRATED` | DM-1, SpaceX CRS-16, SAOCOM 1A, SSO-A | `cda728a` | Median Part D per-flight fitted pitch kick for LEO direct profiles (1.19-1.37 deg) |
| `PROFILE_KICK_LEO_TWO_BURN_DEG` | `1.7 deg` | `CALIBRATED` | Iridium NEXT 8, Iridium NEXT 7 | `cda728a` | Median Part D per-flight fitted pitch kick for LEO two-burn profiles (1.71-1.73 deg) |
| `PROFILE_KICK_GTO_DEG` | `2.45 deg` | `CALIBRATED` | Bangabandhu-1, TelStar v19, Eshail 2 | `cda728a` | Median Part D per-flight fitted pitch kick for GTO profiles (2.40-2.51 deg) |
| `SOLVER_S2_TIE_BAND_KG` | `500 kg` | `HEURISTIC` | — | `a6e7a2f` | Stage 2 fuel-margin tie-breaker band (~0.45% S2 prop) within which solver prefers kick closest to profile median |
| `SOLVER_BOOSTBACK_HEAT_CEILING_MW_M2` | `0.025 MW/m^2` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Boostback-class solver entry-heating ceiling (~15% above 0.022 target; real 8 boostback flights 0.013-0.033 MW/m^2) |
| `SOLVER_BALLISTIC_HEAT_CEILING_MW_M2` | `0.085 MW/m^2` | `CALIBRATED` | KoreaSat 5A, SES-11, BulgariaSat-1 | `388a1cd` | Ballistic ASDS solver entry-heating ceiling inside real GTO ASDS envelope (0.068-0.126 MW/m^2, mean 0.099) |
| `SOLVER_BOOSTBACK_FUEL_FLOOR_KG` | `3,500 kg` | `CALIBRATED` | DEFAULT_RTLS (MC N=300x9) | `a6e7a2f` | Boostback-class nominal landing fuel floor from measured skewed left-tail 3-sigma post-MECO RSS = 3,465 kg (9 MC drivers) |
| `SOLVER_BALLISTIC_FUEL_FLOOR_KG` | `2,500 kg` | `CALIBRATED` | Iridium NEXT 8, SAOCOM 1A | `d5a054e` | Ballistic ASDS lean touchdown propellant margin floor derived from 8-flight aero-descent mass inference (~30.5-31.6 t) |
| `SOLVER_MAX_GRID_FIN_SAT_FRACTION` | `0.15` | `ASSUMED` | — | `v1.3.0` | Maximum allowable aero-descent grid-fin saturation fraction for mission-design feasibility |
| `WHATIF_GTO_ALTITUDE_THRESHOLD_M` | `1.0000e+7 m` | `HEURISTIC` | — | `v1.3.0` | Target altitude threshold selecting GTO default pitchover kick in What-If |
| `SOLVER_GRID_FIN_PINNED_DEG` | `19.9 deg` | `ASSUMED` | — | `v1.3.0` | Grid-fin deflection threshold counting as saturated against +/-20 deg limit |
| `SOLVER_ENTRY_HEAT_ALT_CEILING_M` | `90,000 m` | `ASSUMED` | — | `70826b1` | Altitude ceiling for evaluating peak descent convective heating in mission-design solver |
| `SOLVER_INFEASIBLE_ORBIT_WEIGHT` | `1.0000e+6` | `HEURISTIC` | — | `v1.3.0` | Fallback ranking score weight prioritizing orbit achievement when no candidate is feasible |
| `SOLVER_INFEASIBLE_LANDED_WEIGHT` | `100,000` | `HEURISTIC` | — | `v1.3.0` | Fallback ranking score weight prioritizing booster landing when no candidate is feasible |
| `SOLVER_DEFAULT_DT_S` | `0.05 s` | `ASSUMED` | — | `v1.3.0` | Coarse integration timestep for mission-design solver candidate sweeps (winners verified at 0.01 s) |
| `SOLVER_EXPENDABLE_RESERVE_FRAC` | `0.005` | `ASSUMED` | — | `v1.3.0` | Stage 1 MECO propellant reserve fraction for expendable missions (0.5%) |
| `SOLVER_MIN_KICK_DEG` | `1.1 deg` | `ASSUMED` | — | `v1.3.0` | Default lower pitchover kick search bound for mission-design solver |
| `SOLVER_MAX_KICK_DEG` | `2.6 deg` | `ASSUMED` | — | `v1.3.0` | Default upper pitchover kick search bound for mission-design solver |
| `SOLVER_COARSE_KICK_STEP_DEG` | `0.15 deg` | `ASSUMED` | — | `v1.3.0` | Coarse pitchover kick search grid step |
| `SOLVER_FINE_KICK_STEP_DEG` | `0.05 deg` | `ASSUMED` | — | `v1.3.0` | Fine pitchover kick local refinement step |
| `SOLVER_RTLS_RESERVE_CANDIDATES` | `[0.115, 0.12, 0.125, 0.13, 0.135, 0.145, 0.155, 0.165]` | `ASSUMED` | — | `d5a054e` | Candidate RTLS MECO propellant reserve search grid (ascending) |
| `SOLVER_ASDS_BB_RESERVE_CANDIDATES` | `[0.075, 0.085, 0.095, 0.1, 0.105, 0.115, 0.125, 0.135, 0.145]` | `ASSUMED` | — | `d5a054e` | Candidate close-in ASDS partial-boostback MECO propellant reserve search grid (ascending) |
| `SOLVER_BOOSTBACK_PITCH_CANDIDATES_DEG` | `[-4, -7, -10, -13, -16, -19, -22, -25, -28, -31, -34, -37, -40, -43, -46] deg` | `ASSUMED` | — | `5418ae4` | Candidate boostback thrust depression angle search grid (-4..-46 deg in 3 deg steps) |
| `SOLVER_REF_BOOSTBACK_PITCH_DEG` | `-16 deg` | `HEURISTIC` | — | `70826b1` | Reference boostback thrust pitch angle used during initial ascent-kick sweep |

### Monte Carlo & Navigation

| Constant | Value | Label | Calibrated On | Commit | Source / Derivation |
| --- | --- | --- | --- | --- | --- |
| `NAV_CORR_TIME_S` | `45 s` | `ASSUMED` | — | `v1.2.0` | First-order Gauss-Markov INS/GPS navigation bias correlation time constant |
| `NAV_ALT_AID_ACQ_M` | `3,000 m` | `ASSUMED` | — | `v1.2.0` | Downward-looking landing radar altimeter acquisition altitude AGL |
| `NAV_ALT_RADAR_FLOOR_M` | `0.15 m` | `ASSUMED` | — | `v1.2.0` | Landing radar altimeter residual multipath/clutter floor sigma |
| `NAV_ALT_RADAR_SCALE` | `0.002` | `ASSUMED` | — | `v1.2.0` | Landing radar altimeter range-proportional error scale (0.2% of AGL) |
| `NAV_ALT_AID_MIN_TAU_S` | `2 s` | `ASSUMED` | — | `v1.2.0` | Minimum closed-loop radar/INS vertical filter correlation time near touchdown |

<!-- END GENERATED: CONSTANTS_REGISTRY -->

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

### Landing Zones & Droneships (Primary-Sourced History + UNVERIFIED 2026 Fleet Notes)
Recovery asset availability is resolved by coast and mission date (`getAvailableRecoveryAssets(siteId, missionDate)` in `src/sim/config/falcon9.ts`):
- **LZ-1 (`28.4858°N, 80.5429°W`, CCSFS former LC-13):** Routine Falcon 9/Heavy service `2015-12-21` through `2025-08-01` (Crew-11 was planned as the final routine Falcon 9 landing ahead of LC-13 reallocation; SpaceX / Spaceflight Now), **reused on `2026-10-01`** for Falcon Heavy `NROL-97` side booster `B1104` (SpaceX / Spaceflight Now). Modeled with explicit date windows (`2015-12-21..2025-08-01` and `2026-10-01`).
- **LZ-2 (`28.4856°N, 80.5444°W`, CCSFS former LC-13):** Retired from routine Falcon 9 service after **`NROL-77` on `2025-12-09`** (`B1096`, final scheduled Falcon 9 landing ahead of LC-13 lease expiry; SpaceX / Spaceflight Now); reused on `2026-10-01` for Falcon Heavy `NROL-97` side booster `B1072`. Modeled as `RETIRED` with explicit windows (`2018-02-06..2025-12-09` and `2026-10-01`).
- **LZ-40 (`28.5631°N, 80.5743°W`, CCSFS adjacent to SLC-40):** **Active** East Coast RTLS pad (`activeFrom: 2025-08-01`), primary pad for current Cape Falcon 9 RTLS missions.
- **LZ-4 (`34.6342°N, 120.6150°W`, VSFB former SLC-4W):** **Active** West Coast RTLS pad (`activeFrom: 2018-10-08`, first used on SAOCOM 1A; SpaceX SAOCOM 1A Press Kit).
- **ASDS Droneships (`ASOG`, `OCISLY`, `JRTI`):**
  - **JRTI (`RETIRED`):** Served West Coast `2016-01-17`–`2019-08-01` (incl. `Iridium NEXT 8`, Jan 2019) and East Coast `2020-05-30`–`2026-04-21`; retired from Falcon 9 ASDS service after its final F9 landing on **April 21, 2026** and repurposed for Starship transport (primary SpaceX mission records).
  - **OCISLY & ASOG (`ACTIVE`; 2026 coast assignments `UNVERIFIED`):** `OCISLY` served East Coast `2015-06-28`–`2021-06-14` (incl. `DM-1`, March 2019) before transiting the Panama Canal to Long Beach in June 2021; `ASOG` entered East Coast service in Aug 2021. Because secondary trackers (`ASOG` East / `OCISLY` West) conflict with an April 2026 report (`OCISLY` off the Cape / `ASOG` West Coast) and primary 2026 `spacex.com` mission pages did not resolve the discrepancy, 2026 `OCISLY`/`ASOG` coast assignments are explicitly marked `UNVERIFIED`.

### Sonic Boom Acoustic Arrival Approximation (v1.4 Part D)
- `sonicBoomArrivalTimeS` in `src/scene/MissionCanvas.tsx` uses a **single-point transonic-cutoff approximation**: it finds the last supersonic booster descent sample (`Mach >= 1.02`, `vz < -20 m/s`, `alt < 15 km`) and computes `t_arrival = t_emit + slantDist / c_path_avg` using the US76 harmonic-mean path speed of sound (`ASSUMED` approximation). In reality, a sonic boom Mach cone is generated continuously along the entire supersonic descent path, with the ground-level double N-wave envelope shaped by ray refraction through atmospheric temperature and wind gradients.


---

## System-ID v2 Findings (`feat/system-id-v2`, `WEBCAST_LIFTOFF_OFFSET_S = 0` Fixed)

- **Protocol:** Joint MAP Levenberg-Marquardt + Laplace Hessian on the exact 3-flight fit set (`DM-1`, `SpaceX CRS-16`, `Iridium NEXT 8`) with `WEBCAST_LIFTOFF_OFFSET_S = 0` fixed and 17 parameters (`10` vehicle + `maxQMinThrottle`, `maxQThrottleStartMach`, `maxQThrottleDurationS`, `s1MaxAxialAccelG`, + 3 fit-set pitch kicks), evaluated at `dt = 0.01 s` on the 7 pure Block 5 holdouts with fair-baseline per-flight kick fitting.
- **Fitted v2 posteriors (fit set only):** `maxQMinThrottle = 0.713 ± 0.045`, `maxQThrottleStartMach = 0.963 ± 0.076`, `maxQThrottleDurationS = 30.69 ± 3.81 s`, `s1MaxAxialAccelG = 3.156 ± 0.133 g`, `s1PropKg = 419,246 ± 3,991 kg`, `m1dThrustVac = 906.65 ± 4.56 kN`.
- **Holdout verdict (v1 retained):** While v2 cut fit-set S1 Vel RMS from `105.2 → 28.8 m/s` and improved LEO holdouts (`Iridium NEXT 7`, `SAOCOM 1A`, `SSO-A`, `GPS III`), it degraded every 7-flight holdout aggregate metric vs v1 (`tOff = 0`) because the 3-flight fit set consists exclusively of gently throttled LEO missions (`peak late-S1 dv/dt = 2.58–3.14 g`, `20–27 s` buckets), whereas GTO holdouts (`Bangabandhu-1`, `TelStar v19`, `Eshail 2`) fly shorter buckets (`12–18 s`, creating a post-bucket second `q` peak at `T+67–70 s` plus `2–5 s` webcast callout lag) and higher late-S1 acceleration (`peak dv/dt = 3.38–3.43 g`, true axial `~3.7–3.8 g`).
- **Decision:** Keep v1 `FALCON9_BLOCK5` parameters (`maxAxialAccelG = 3.69 g`) as the holdout-superior single shared vehicle model, while retaining the parameterized trapezoidal throttle bucket (`maxQThrottleStartMach`, `maxQThrottleDurationS`) in `src/sim/guidance/ascent.ts` for mission-class guidance.


---

## Mission-Class Ascent Guidance Schedules (`feat/mission-class-schedules`)

### Physical Max-Q Validation Metric
- Primary Max-Q timing comparisons in `src/validation/compare.ts` now compare simulated peak dynamic pressure time against the **physical `q` peak computed from 1 Hz telemetry (`q(t) = 0.5 · ρ_US76(alt) · v²`)** across `T+30..100 s`, rather than the webcast announcer callout (`events.maxq`, retained as secondary `maxQCalloutTimeDelta`). On heavy GTO/polar flights (`Bangabandhu-1`, `TelStar v19`, `Iridium NEXT 7`), the webcast callout trails the physical telemetry `q` peak by `2–5 s`.

### Data-Driven Flight Clustering (10 Pure Block 5 Flights)
Standardized `k = 2` clustering on `(bucketDurS, v140Ms, peakLateS1AccelG)` partitions the 10 pure Block 5 flights without assuming orbit labels:
- **Class 0 (`LEO-like`, 5 flights):** `DM-1` (`27 s`, `1,489 m/s`, `2.58 g`), `SpaceX CRS-16` (`20 s`, `1,516 m/s`, `2.78 g`), `Iridium NEXT 8` (`21 s`, `1,621 m/s`, `3.14 g`), `SAOCOM 1A` (`27 s`, `1,611 m/s`, `2.71 g`), `SSO-A` (`22 s`, `1,591 m/s`, `2.69 g`).
- **Class 1 (`GTO-like`, 5 flights):** `Bangabandhu-1` (`18 s`, `1,901 m/s`, `3.38 g`), `TelStar v19` (`12 s`, `1,868 m/s`, `3.41 g`), `Iridium NEXT 7` (`15 s`, `1,740 m/s`, `3.28 g`), `Eshail 2` (`46 s`, `1,990 m/s`, `3.43 g`), `GPS III SV01` (`35 s`, `1,763 m/s`, `3.45 g`).
- *Boundary note:* `GPS III SV01` (expendable MEO) exhibits a LEO-like long bucket (`35 s`) and moderate `v140` (`1,763 m/s`), while its late-burn peak `dv/dt` (`3.45 g` right before expendable MECO) places it in Class 1; conversely `Iridium NEXT 7` (polar LEO) flew a short `15 s` bucket (`phys Max-Q = 67 s`) and clusters into Class 1.

### Simplified Per-Class Model (Shared v1 Bucket + `EMPIRICAL` Per-Class Late-S1 Accel Limit)
- **Why the 30.2 s LEO bucket was dropped:** Diagnostic time-series on `SAOCOM 1A` and `SSO-A` showed the `30.2 s` bucket caused `-78` to `-87 m/s` velocity deficits at `T+80 s`, causing gravity to turn the trajectory downward (`AltΔ = -3.0` to `-6.9 km` by `T+100–140 s`, regressing Class 0 holdout Alt RMS from `0.44 → 2.98 km`). Moreover, bucket duration does not separate the clusters (`C1` spans `12–46 s`).
- **Adopted simplified schedules (`EMPIRICAL` effective late-S1 limit)** (shared v1 `FALCON9_BLOCK5` vehicle + shared v1 bucket `22 kPa / Mach 1.02–1.38 / 72%`, fitted strictly on the 4-flight fit set at `tOff = 0`):
  - **Class 0 (`LEO`):** `maxAxialAccelG = 2.90 g` (`EMPIRICAL` effective late-S1 limit; Class 0 holdouts vs v1: `|PhysMaxQ|` `0.59 → 0.59 s`, `S1 Alt` `0.82 → 0.40 km`, `S1 Vel` `69.8 → 47.1 m/s`, `SAOCOM 1A MECO` `-4.7 → 0.0 s`, `SSO-A MECO` `+7.1 → +15.2 s` due to generic `7.5%` ASDS reserve on a 4.0 t payload).
  - **Class 1 (`GTO`):** `maxAxialAccelG = 3.60 g` (`EMPIRICAL` effective late-S1 limit; Class 1 holdouts vs v1: `|PhysMaxQ|` `6.18 → 6.18 s`, `|MECO Δ|` `3.04 → 2.69 s`, `S1 Alt` `1.10 → 1.07 km`, `S1 Vel` `66.4 → 64.4 m/s`).
- **Physicality Check — Reconstructed True Telemetry Axial Acceleration (`a_axial ≈ dv/dt + g(h)·sin(γ)`, 5 s central diff over `T+100..MECO-3 s`):**
  - Reconstructing axial acceleration from 1 Hz telemetry (`sin(γ) = (dh/dt)/v`, `g(h) = μ/(R_E + h)²`) across all 10 flights shows that **every flight's true peak axial acceleration exceeds the fitted caps**:
    - **Class 0 (`LEO-like`):** `DM-1` `3.29 g` (fit, last-10 s mean `3.17 g`), `CRS-16` `3.46 g` (fit, `3.29 g`), `Iridium NEXT 8` `3.67 g` (fit, `3.54 g`), `SAOCOM 1A` `3.56 g` (hold, `3.39 g`), `SSO-A` `3.52 g` (hold, `3.40 g`) — fitted `2.90 g` sits **`0.39–0.77 g` below** reconstructed axial acceleration.
    - **Class 1 (`GTO-like`):** `Bangabandhu-1` `3.86 g` (fit, last-10 s mean `3.75 g`), `TelStar v19` `3.83 g` (hold, `3.78 g`), `Iridium NEXT 7` `3.82 g` (hold, `3.69 g`), `Eshail 2` `3.83 g` (hold, `3.72 g`), `GPS III SV01` `3.86 g` (hold, `3.75 g`) — fitted `3.60 g` sits **`0.22–0.26 g` below** reconstructed axial acceleration.
  - **Labeling & Backlog:** Because `2.90 g` and `3.60 g` sit below reconstructed true axial acceleration on all fit-set flights, both are explicitly labeled **`EMPIRICAL` ("effective late-S1 limit", compensating for an unmodeled physical discrepancy — e.g. thrust/Isp, S1 dry/propellant mass, or flight-path gravity-loss `sin(γ)` bias)** rather than physical structural G-limits. Root-cause investigation is tracked in `docs/BACKLOG.md`.
- **Falsification of MECO-Reserve Proxy Hypothesis (`feat/meco-reserve-unification`):**
  - Tested removing the `EMPIRICAL` per-class caps (setting `maxAxialAccelG = 4.0 g` physical upper bound on the shared v1 vehicle & bucket, `tOff = 0`) and fitting per-flight `(pitchKickAngleDeg, mecoPropellantReserveFraction)` with recovery-mode priors (`RTLS 14.5 ± 4%`, `ASDS 7.5 ± 4%`, `EXP 0.5 ± 1.5%`) and unregularized MLE across all 10 flights.
  - **Result — FALSIFIED on all three criteria:**
    1. *Peak `a_axial` not explained:* Uncapped `T_vac / m_MECO` reaches `4.15–5.44 g` across all 10 flights (`4.15 g` even on `11.7%`-reserve RTLS `SAOCOM 1A`), so all 10 flights saturate at `4.00 g` — overshooting reconstructed telemetry by `+0.33..+0.71 g` (Class 0) and `+0.14..+0.18 g` (Class 1). MECO reserve alone cannot cap late-S1 axial acceleration to `3.29–3.86 g`.
    2. *No clean recovery-mode separation:* `CRS-16` (RTLS, `10.3%` MAP / `9.7%` MLE) falls below `SSO-A` (ASDS, `10.6%` / `10.9%`), and `DM-1` (ASDS) drains to an unrecoverable `3.5%` (`2.5%` MLE) to reach `158 s` MECO, degrading `DM-1` S1 Vel RMS `105 → 180 m/s` and S2 Vel RMS `97 → 480 m/s`.
    3. *`Iridium NEXT 7` vs `8` inverted:* `Iridium 7` (MECO `146 s`) fits at `9.0%` vs `Iridium 8` (`150 s`, partial boostback) at `6.7%`, degrading S1 Vel RMS on both (`Iridium 8: 65 → 113 m/s`, `Iridium 7: 59 → 70 m/s`).
  - **Holdout verdict:** Regresses S1 Vel RMS on both classes vs `v1.5.0` (Class 0 holdouts: `47.1 → 76.1 m/s`, S1 Alt `0.40 → 0.59 km`; Class 1 holdouts: `64.4 → 79.5 m/s`), while confirming separately that `SSO-A`'s `+15.2 s` MECO over-burn is a light-payload ASDS reserve effect (`10.6%` → `MECO Δ = +0.4 s`). Retained `v1.5.0` schedules unchanged.
- **Flight-Path Angle $\gamma(t)$ & Gravity-Loss Diagnostic (`T+100 s .. min(MECO) − 2 s`, no model changes):**
  - Comparing simulated vs 1 Hz telemetry $\gamma(t) = \arcsin((dh/dt)/v)$ and integrated gravity loss $\int g(h)\sin\gamma\,dt$ across all 10 flights shows the simulator flies **flatter on 9 of 10 flights**, with a clear LEO vs GTO asymmetry:
    - **Class 0 (`LEO-like`, 5/5 flatter):** Mean $\Delta\gamma = -5.03^\circ$ (`DM-1: -9.2°`, `CRS-16: -5.4°`, `SSO-A: -4.7°`, `SAOCOM 1A: -4.6°`, `Iridium 8: -1.3°`), losing `-21.8 m/s` less gravity loss (`DM-1: -48 m/s`, `CRS-16: -22 m/s`, `SSO-A: -17 m/s`, `SAOCOM 1A: -15 m/s`, `Iridium 8: -7 m/s`).
    - **Class 1 (`GTO-like`, 4/5 flatter):** Mean $\Delta\gamma = -0.50^\circ$ (`-1.0°` to `-1.5°` on 4 flights, `+2.5°` on `Eshail 2`), losing `-3.7 m/s` less gravity loss.
  - Because `-21.8 m/s` over `~45 s` is `~0.05 g` (`DM-1: -48 m/s / 52 s ≈ 0.09 g`), flying `~5°` flatter on LEO accounts for **~15–20%** of the `0.39–0.77 g` gap between the `2.90 g` `EMPIRICAL` cap and reconstructed `3.29–3.67 g` axial acceleration; a two-parameter ascent pitch program (kick + late-S1 pitch-rate term) is tracked in `docs/BACKLOG.md`.
- **Close-In ASDS Partial Boostback (`droneshipDownrangeKm`, `feat/asds-partial-boostback`) & Unified Landing-Burn Handoff (`BACKLOG #7`):**
  - `MissionConfig.droneshipDownrangeKm` specifies the ASDS droneship distance from the launch site along the downrange trajectory azimuth:
    - **`SSO-A`: `50 km` (`SOURCED`)** — Spaceflight Now (Dec 3, 2018, "about 30 miles (50 kilometers) off the coast of Vandenberg": https://spaceflightnow.com/2018/12/03/spacex-launches-swarm-of-satellites-re-flies-rocket-for-third-time/).
    - **`Iridium NEXT 8`: `244 km` (`ASSUMED`)** — exact km downrange is not published in the official SpaceX press kit; estimated from the Pacific NOTMAR recovery hazard zone ~244 km south of SLC-4E and consistent with the observed `T+166..199 s` partial boostback burn.
  - When `droneshipDownrangeKm < ballisticRangeKm − 15 km`, `runFullMission` places the droneship at `droneshipDownrangeKm` and triggers a 3-engine **partial boostback burn** (reusing the closed-loop RTLS boostback law with `dragFactor = 0.965`, `cutoffMiss = 500 m`, and boostback-entry trigger `60 km / 1,050 m/s`), while `solveMissionAscentDesign` sizes `mecoPropellantReserveFraction` from boostback + entry + landing needs (`>= 5,000 kg` nominal booster margin, zero reserve fitting). Far-ASDS flights (or missions with `droneshipDownrangeKm` omitted) continue flying pure ballistic entry (`7.5%` reserve).
  - **Unified mode-free landing-burn law (`BACKLOG #7`):** Removed all `landingMode === 'RTLS'` branches from the landing burn in `src/sim/guidance/booster.ts`: ignition ceiling uses pure 3-engine stopping kinematics `maxIgnitionAltM = min(6_000, max(4_500, 1.15 * hStop3))` (waiting until `4.5 km` so drag brakes for free unless mass & downward speed require higher altitude), 3-to-1 engine handoff uses `vDown > 15 && heightAboveTarget > 30 && reqThrustN > 0.90 * maxThrust1`, and terminal flare uses unified `vTd = 0.55 m/s`, `hFlare = 1.85 m` (above `±1.5 m` max ocean heave).
  - **Validation (zero fitted reserve):**
    - `SSO-A` (`50 km`, `SOURCED`) solves to `12.5%` reserve → `MECO Δ = +3.3 s` (down from `+15.2 s`), `BB = T+163..192 s` (`29 s`), `LANDED (0.01 m)`.
    - `Iridium NEXT 8` (`244 km`, `ASSUMED`) solves to `10.5%` reserve (`1.70°` kick) → `MECO Δ = -0.2 s` (down from `+6.9 s`), `BB = T+168..192 s` (`23.5 s` 3-eng vs real `T+166..199 s` `33 s`), `apogee = 122.3 km @ T+253 s` (real `105.0 km @ T+213–225 s`), `touchdown = T+457 s` (real `~T+426 s`), `LANDED (0.0 m)`.
    - **Booster-phase telemetry RMS on `Iridium NEXT 8` (`stage1 raw.json`, time-aligned):** Boostback (`166..199 s`): `3.41 km / 30.2 m/s` (`mean VelΔ = -1.7 m/s`); Ballistic Coast (`199..337 s`): `27.37 km / 221.5 m/s`; Entry Burn (`337..353 s`): `45.00 km / 194.3 m/s`; Aero + Landing (`353..426 s`): `32.10 km / 588.3 m/s` (`Landing 404..426 s`: `15.83 km / 814.2 m/s`).
    - **Why apogee is `122.3 km` vs `105.0 km` and touchdown is `+31 s` late:** Real `Iridium 8` MECO (`68.5 km`, `vz = 1,000 m/s`) would reach `121.1 km @ T+255 s` under pure horizontal boostback — matching our `-4°`-depressed sim (`122.3 km @ T+253 s`) to `1.2 km` and `2 s`. Real `Iridium 8` depressed its boostback thrust more steeply downward to suppress apogee by `~16 km` and shorten free-fall coast by `~31–42 s` (which drives the time-aligned coast/entry/landing RMS). No primary SpaceX source confirms a `3 → 1` engine step-down during boostback (only during landing burns), so the `23.5 s` vs `33 s` burn duration gap is documented rather than modeled without a source.
    - Class 0 holdout `|MECO Δ|` drops `7.60 → 1.65 s` while all far-ASDS GTO flights remain ballistic with zero regression.
- **Solved Boostback Thrust Pitch Geometry & Entry Heating Proxy (`feat/boostback-geometry`):**
  - Replaced the hardcoded `-4°` boostback depression in `src/sim/guidance/booster.ts` with `AscentGuidanceConfig.boostbackPitchDeg`, solved jointly with MECO reserve (and ascent pitchover kick for default/What-If missions) in `solveMissionAscentDesign` over `-4°..-46°` in `3°` steps (all four missions converge to genuine interior optima, zero boundary artifacts).
  - **Historical vs Default/What-If Mission Rule:** Historical missions (`DM-1`: `1.41°`, `Iridium NEXT 8`: `1.63°`, `SAOCOM 1A`: `1.10°`, `SSO-A`: `1.10°`) use their **telemetry-fitted ascent pitch kick**, and `solveMissionAscentDesign` chooses only the recovery variables `(mecoPropellantReserveFraction, boostbackPitchDeg)`. Free kick solving applies to default and What-If missions only.
  - **Constraints:** `orbitAchieved`, `LANDED`, unified `7,500 kg` boostback-class nominal fuel margin (shared across RTLS and close-in ASDS-BB; `4,000 kg` for ballistic ASDS), `gridFinSat <= 15%`, and Sutton-Graves convective stagnation entry heating proxy `qDot = 1.7415e-4 · sqrt(ρ / 1.85 m) · v³ <= 0.085 MW/m²` (`ASSUMED` proxy ceiling, vs `0.078 MW/m²` ballistic ASDS reference). Among feasible angles for the minimum feasible reserve, the solver selects the `boostbackPitchDeg` maximizing landing fuel margin.
  - **Solved mission designs (interior optima on `-4°..-46°`, zero boostback tuning):**
    - `DEFAULT_LEO_RTLS_MISSION` (`LZ-40`, free kick): `1.20° / 13.5% / -22°` (saves `1.0%` S1 propellant vs `v1.6.0` `14.5%`, `2,000/2,000 = 100.0%` MC on seeds `318027`/`329028`).
    - `SAOCOM_1A_MISSION` (`LZ-4`, telemetry-fitted kick `1.10°`): `1.10° / 14.5% / -19°` → `619.5 × 621.7 km, 97.89°`, `MECO = 142.0 s` (real `142 s`), `apogee = 133.2 km` (real `134.0 km`), `TD = T+449 s` (real `~463 s`), `LANDED (0.02 m)`.
    - `IRIDIUM_NEXT_8_MISSION` (`244 km`, telemetry-fitted kick `1.63°`): `1.63° / 10.5% / -37°` → `MECO = 149.8 s` (real `150 s`), **`apogee = 102.8 km @ T+200 s`** (real `105.0 km @ T+213–225 s`; apogee match holds after extending past `-28°`), `TD = T+397.0 s` (real `~426 s`), `LANDED (0.02 m)`. Booster RMS vs `stage1 raw.json`: Boostback TA `3.35 km / 34.7 m/s` (EA `5.67 km / 159.4 m/s`), Coast TA `15.23 km / 171.4 m/s` (EA `11.50 km / 164.1 m/s`), Entry TA `19.04 km / 106.8 m/s` (EA `16.02 km / 164.7 m/s`, tracked in BACKLOG #13), Aero+Landing TA `14.79 km / 406.6 m/s` (EA `16.40 km / 438.6 m/s`), Landing Burn EA `0.51 km / 103.5 m/s`.
    - `SSO-A` (`50 km`, `SOURCED`, telemetry-fitted kick `1.10°`): `1.10° / 13.5% / -25°` → **`MECO Δ = +1.1 s`** (`144.1 s` vs real `143 s`, cutting Class 0 holdout `|MECO Δ|` to `0.55 s`).
- **Telemetry-Calibrated Tail-First Booster Descent `Cd(M)`, Boostback Entry Trigger, & Historical Kick Provenance (`feat/descent-timing`, `BACKLOG #13` & `#6`):**
  - **Root cause of early post-apogee timing:** Reconstructing tail-first aerodynamic drag during free aero descent (`a_drag · m / (q · A)`) from `stage1 raw.json` showed `Iridium NEXT 8` (`M = 1.01..2.88`) has `Cd = 1.47–1.76` and `SAOCOM 1A` (`M = 1.57..2.26`) has `Cd = 1.61–1.83` (bluff octaweb + deployed grid fins), ~50% higher than the earlier `1.00–1.35` supersonic table. Meanwhile, real boostback entry burns ignited at `45.6 km / 1,268 m/s` (`Iridium NEXT 8`, `T+337 s`) and `55.7 km / 1,254 m/s` (`SAOCOM 1A`, `T+361 s`), lower/faster than the earlier `60 km / 1,050 m/s` trigger.
  - **Universal physical updates (zero per-flight tuning, `CALIBRATED (n=2 flights)`):**
    - `BOOSTER_DESCENT_CD_MACH_TABLE` (`src/sim/config/falcon9.ts`, **`CALIBRATED (n=2 flights)`** from `Iridium NEXT 8` & `SAOCOM 1A` descent telemetry): `[[0.0, 1.15], [0.5, 1.20], [0.85, 1.38], [1.05, 1.55], [1.5, 1.75], [2.2, 1.72], [2.9, 1.70], [4.0, 1.60], [8.0, 1.50]]`.
    - Boostback entry-burn trigger (`src/sim/guidance/booster.ts`, **`CALIBRATED (n=2 flights)`**): `entryAltTrigger = 52_000 m`, `entrySpeedTrigger = 1_200 m/s`, `aeroFallbackAlt = 44_000 m` (ballistic ASDS unchanged at `70 km / 1,300 m/s / 52 km`).
  - **Leave-One-Out (LOO) & Unseen-Flight Holdout Validation:**
    - *Fold A (calibrated on `Iridium NEXT 8` only: `46 km / 1,260 m/s`, `Cd_sup ~ 1.65` → held-out `SAOCOM 1A`, `1.10° / 14.5% / -19°`, `LANDED 0.06 m`):* EA RMS — Boostback `2.11 km / 121.1 m/s`, Coast `6.69 km / 74.1 m/s`, Entry `8.94 km / 167.1 m/s`, Aero `2.75 km / 189.0 m/s`, Landing `0.41 km / 33.2 m/s`.
    - *Fold B (calibrated on `SAOCOM 1A` only: `56 km / 1,250 m/s`, `Cd_sup ~ 1.72` → held-out `Iridium NEXT 8`, `1.63° / 10.5% / -22°`, `LANDED 0.03 m`, Entry `T+337.2` vs `337 s`):* EA RMS — Boostback `6.35 km / 171.4 m/s`, Coast `8.78 km / 56.0 m/s`, Entry `7.06 km / 142.3 m/s`, Aero `9.72 km / 274.5 m/s`, Landing `0.14 km / 48.3 m/s`.
    - *LOO vs in-sample (`n=2`) 5-phase mean EA:* Alt `5.30` vs `4.57 km` (`+16.0%`, within `20%`), Vel `127.7` vs `134.2 m/s` (`-4.8%`, improved).
    - *Unseen `Telemetry-Data` flight (`Iridium NEXT 3`, Block 4 ASDS-BB, `1.80° / 11.5% / -25°`, `LANDED 0.08 m`):* EA RMS — Boostback `2.20 km / 14.0 m/s`, Coast `23.37 km / 180.4 m/s`, Entry `2.85 km / 110.8 m/s`, Aero `6.75 km / 220.2 m/s`, Landing `0.12 km / 58.6 m/s`. Independent telemetry reconstruction across all 6 unseen Block 3/4 boostback flights (`Iridium NEXT 3`, `CRS-12`, `CRS-11`, `NROL-76`, `X-37B OTV-5`, `ZUMA`) confirms `Cd_sup = 1.56–1.66` (at `28.5 t`) and entry ignition `47.5–54.3 km / 1,225–1,291 m/s` on 5/6 flights (`NROL-76` high-loft `64.9 km / 1,407 m/s`).
  - **Validated booster RMS (`dt = 0.01 s`, zero per-flight tuning):**
    - **`Iridium NEXT 8` (`1.63° / 10.5% / -25°`):** `Apogee = 108.1 km @ T+221 s` (real `105.0 km @ 213–225 s`), `Entry = T+330.3..338.3 s` (real `337..353 s`, `-6.7 s` vs `-41.2 s`), `Landing = T+391.3..434.4 s` (real `404..~426 s`, `v_ign = 410 m/s` vs `573 m/s`), `LANDED (0.05 m)`. Phase RMS (`TA` | `EA`): Boostback `4.04 km / 40.0 m/s` | `6.35 km / 181.6 m/s`, Coast `1.97 km / 50.1 m/s` | `4.66 km / 18.6 m/s`, Entry `2.04 km / 248.3 m/s` | `7.26 km / 141.4 m/s`, Aero `2.28 km / 106.6 m/s` | `10.02 km / 281.4 m/s`, Landing `1.66 km / 117.3 m/s` | `0.14 km / 43.9 m/s`.
    - **`SAOCOM 1A` (`1.10° / 14.5% / -19°`):** `Apogee = 133.2 km @ T+236 s` (real `134 km @ 232 s`), `Entry = T+367.5..377.0 s` (real `361..387 s`), `Landing = T+422.5..460.6 s` (real `436..467 s`, `v_ign = 429 m/s` vs `704 m/s`), `LANDED (0.00 m)`. Phase RMS (`TA` | `EA`): Boostback `1.72 km / 42.4 m/s` | `2.11 km / 121.1 m/s`, Coast `2.03 km / 34.6 m/s` | `6.69 km / 74.1 m/s`, Entry `3.56 km / 147.8 m/s` | `2.98 km / 193.0 m/s`, Aero `4.09 km / 223.0 m/s` | `5.53 km / 269.3 m/s`, Landing `2.12 km / 141.5 m/s` | `0.50 km / 34.6 m/s`.
  - **Historical Kick Provenance & Drift Guard:** Added `MissionConfig.fittedKickProvenance` (`{ modelVersion, commit, sourceTelemetry }`) to `DM1_MISSION` (re-fitted `1.41° → 1.56°` under `v1.7.0 / 7e71b8c`, cutting DM-1 S1 Alt RMS `1.68 → 1.03 km`), `IRIDIUM_NEXT_8_MISSION` (`1.63°`), and `SAOCOM_1A_MISSION` (`1.10°`). `solveMissionAscentDesign` automatically locks `pitchKickAngleDeg` whenever `fittedKickProvenance` is present (unit-tested in `tests/ascent.test.ts`), and `tests/validation.test.ts` re-fits all three kicks against `FALCON9_BLOCK5` and fails if any drifts `> 0.10°`.
  - **Default Mission Re-Solve (`BACKLOG #6` closed):** Higher realistic descent drag cuts landing-burn propellant demand, moving `DEFAULT_LEO_ASDS_MISSION` from `1.75° / 7.5%` to **`1.10° / 7.5%`** and `DEFAULT_LEO_RTLS_MISSION` from `1.20° / 13.5% / -22°` to **`1.25° / 13.5% / -19°`**.
- **Physics-Based Predictive Sutton-Graves Entry-Burn Controller, Lean Telemetry-Derived Margins & `M < 1.2` Descent `Cd(M)` (`feat/entry-physics`, `BACKLOG #14`):**
  - **Inferred real aero-descent mass from telemetry (`m = (q · Cd(M) · A) / (-(dv/dt + g·sinγ))` across all 8 boostback flights):**
    - Block 5 (`n=2`): `Iridium NEXT 8` `31.6 t` (`m_ign = 30.8 t`, `EstLndProp = 4.46 t`, `ImpliedDry+Res = 27.1 t`); `SAOCOM 1A` `31.6 t` (`m_ign = 32.1 t`, `EstLndProp = 5.49 t`, `ImpliedDry+Res = 26.1 t`) — mean **`31.6 t`**.
    - Block 3/4 (`n=6` independent): `Iridium NEXT 3` `31.3 t`, `SpaceX CRS-12` `29.8 t`, `SpaceX CRS-11` `30.3 t`, `NROL-76` `30.6 t`, `X-37B OTV-5` `29.3 t`, `ZUMA` `29.1 t` — mean **`30.1 t`** (`30.5 t` across all 8 flights).
    - Compared to our fitted Block 5 S1 dry mass (`MAP ≈ 27.0 ± 1.9 t`, prior `25.6 ± 2.0 t`; `26,955 ± 1,857 kg`), real operational touchdown reserve is inferred at `~0–2.0 t` above the `~4.5–5.5 t` landing burn (note: this `0–2 t` touchdown-reserve inference lies within the `±1.9 t` S1 dry-mass MAP uncertainty, so exact real touchdown reserve cannot be separated from dry-mass uncertainty below `~2 t`; see `docs/BACKLOG.md` for S1 dry-mass identification).
  - **Lean Landing-Margin Policy, Variance Attribution, Closed-Loop MECO Cutoff & Shipped `dt = 0.01 s` Verification (`src/sim/guidance/ascent.ts`, `booster.ts`, `mission-design.ts`):**
    - **One-at-a-time variance attribution (`N = 300` per driver across all 9 MC dispersions):**
      - Exposed a dominant terminal-flare hover-hang bug in `navErrors` on `DEFAULT_RTLS` (`14/300` propellant-depleted crashes, `σ = 635 kg`, `3σ = 1,904 kg`) when negative unaided INS vertical velocity bias exceeded `vTd = 0.55 m/s`. Mitigated via a smooth **`HEURISTIC`** anti-hover-hang ramp (`vTd = 0.55 + min(0.65, 0.15 * max(0, flareTimeS - 3.5))` below `2.5 m` AGL) that preserves `0.55 m/s` nominal touchdown speed (keeping `0.55 + 1.35 m/s` ocean heave below `2.0 m/s` on ASDS) while overcoming negative velocity bias on rare flare hangs (`navErrors` `σ` collapsed from `635 → ~43 kg`; tracked in `docs/BACKLOG.md` to be replaced by radar-based terminal vertical velocity estimation).
      - Remaining `DEFAULT_RTLS` per-driver `σ` (`p50 - p5` left tail): `thrustScale` `515 kg` (`-1,267`), `baseWind` `431 kg` (`-1,137`), `propLoad` `340 kg` (`-794`), `ispScale` `177 kg` (`-128`), `windGusts` `106 kg` (`-134`), `cdScale` `92 kg` (`-168`), `dryMass` `71 kg` (`-127`), `navErrors` `43 kg` (`-76`), `actuatorLag` `35 kg` (`-59`) — RSS `1σ = 791 kg` (`3σ = 2,372 kg`), skewed left-tail `3σ ≈ (3/1.645) × RSS(p50 - p5) = 3,465 kg`. On `Iridium NEXT 8`, all 9 drivers are small (`RSS 1σ = 385 kg`, `3σ = 1,155 kg`, `300/300` on every driver).
    - **Derived landing-margin floors (`solveMissionAscentDesign`, verified at shipped `dt = 0.01 s`):** **`3,500 kg`** for boostback-class recoveries (`RTLS` & close-in `ASDS-BB`, set directly from the measured `3,465 kg` left-tail `3σ` post-MECO cost — less than half the legacy `7,500 kg` floor) and **`2,500 kg`** for ballistic `ASDS`.
    - **Kick stability tie-breaker (`solveMissionAscentDesign`):** Among feasible kicks within `500 kg` (`~0.45%` of S2 prop) of the maximum Stage 2 fuel margin, the solver prefers the kick closest to the class-fitted profile median (`~1.3°` for LEO direct).
    - **Closed-loop MECO cutoff (`computeClosedLoopMecoReserveKg`):** MECO triggers on the absolute measured S1 propellant required for the actual recovery profile (propagated through the `stageSepDelayS + 15 s` sep+flip coast to compute real-time boostback `Δv_bb` + entry `Δv_ent` + landing `Δv_lnd` + `2,500 kg` lean floor using actual dry mass and Isp), so propellant-load, dry-mass, thrust, and wind dispersions are absorbed by MECO time and Stage 2 orbit margin rather than starving booster landing fuel.
    - **Actual-state booster burn cutoffs (`booster.ts`):** Removed all nominal-load fractions (`s1PropTotal * 0.042 / 0.026 / 0.020`); boostback cutoff, entry ignition minimum, and entry cutoff landing reserve are computed via Tsiolkovsky from actual instantaneous dry mass (`totalMassKg - dynamic.propellantKg`), actual Isp, and navigation state.
    - **Reconciling `0.085 MW/m²` ballistic ASDS ceiling with `0.022 MW/m²` entry-burn cutoff limit (`CALIBRATED` from 11 flights):** Across the 8 real boostback flights, post-entry peak Sutton-Graves heating is `0.013–0.033 MW/m²` (directly grounding the `0.022 MW/m²` cutoff target and `0.025 MW/m²` boostback solver ceiling). Across the 3 real ballistic GTO ASDS flights in `Telemetry-Data`, post-entry peak heating is **`0.068–0.126 MW/m²`** (`KoreaSat 5A: 0.068`, `SES-11: 0.102`, `BulgariaSat-1: 0.126 MW/m²`, mean `0.099 MW/m²`) because ballistic entries arrive at `2,300–2,390 m/s` and saturate the entry burn duration cap, entering dense air at `1,450–1,836 m/s`. Thus `0.085 MW/m²` sits squarely inside the observed SpaceX ballistic-ASDS thermal envelope (`CALIBRATED (n=3 GTO flights)`).
  - **Re-solved `dt = 0.01 s`-verified configs:** `DEFAULT_LEO_ASDS_MISSION` (`1.90° / 7.5%`, `6,366 kg` nom.), `DEFAULT_LEO_RTLS_MISSION` (`1.10° / 12.5% closed-loop / -19°`, `4,046 kg` nom., `apo = 157.6 km`, `td = 521.7 s`), `IRIDIUM_NEXT_8_MISSION` (`1.63° / 7.5% closed-loop / -34°`, `5,520 kg` nom., `Aero EA = 0.81 km / 69 m/s`), `SAOCOM_1A_MISSION` (`1.10° / 13.5% / -10°`, `3,787 kg` nom., `Aero EA = 1.73 km / 101 m/s`).
  - **Replaced fixed entry triggers (`52 km / 1,200 m/s` boostback, `70 km / 1,300 m/s` ballistic) and fixed `850 m/s` cutoff** with a single vehicle-level predictive thermal-envelope controller (`predictBallisticEntryPeak` in `src/sim/guidance/booster.ts`, synced in `predictAsdsTargetCoord` in `src/sim/mission.ts`):
    - **Parameters (`CALIBRATED (n=2 Block 5 flights)` at realistic `31 t` aero mass — `Iridium NEXT 8` & `SAOCOM 1A` only):** `ENTRY_BURN_HEATING_LIMIT_MW_M2 = 0.022 MW/m²`, `ENTRY_BURN_AERO_LEAD_S = 14.0 s`, `ENTRY_BURN_TARGET_ACCEL_G = 3.6 g` (`35.3 m/s²`, mass-invariant throttled / 1-3-1 entry deceleration matching reconstructed `3.4–4.2 g` across all 11 telemetry flights), `ENTRY_BURN_MAX_DURATION_S = 26.0 s`.
    - **8-Flight Ignition-Altitude Bias Gate (`±2.0 km`):** At realistic `m_init = 37.5 t → ~31 t` aero mass, mean `IgnH` bias across all 8 flights is **`+0.06 km`** (`Iridium 8 +1.3`, `SAOCOM 1A -2.2`, `Iridium 3 -1.1`, `CRS-12 -0.7`, `CRS-11 +2.5`, **`NROL-76 -0.3`**, **`X-37B 0.0`**, `ZUMA +1.1 km`), and both single-flight Block 5 LOO folds also pass within `±2.0 km` on the held-out 7 flights (`Fold A Iridium 8 only: -1.93 km`; `Fold B SAOCOM 1A only: +0.97 km`).
  - **Reconstructed `M < 1.2` tail-first `Cd(M)` across all 8 boostback flights (`CALIBRATED (n=2 Block 5 flights)`, 6 Block 3/4 flights independent):**
    - Block 5 (`m = 29.5 t`): `M = 0.85–1.00`: `1.31`; `M = 1.00–1.20`: `1.35–1.40`; `M = 1.20–3.20`: `1.53–1.63`. Independent Block 3/4 (`m = 27.5 t`, 6 flights): `M = 1.00–1.20`: `1.03–1.30`, `M = 1.20–3.20`: `1.40–1.69`.
    - Updated `BOOSTER_DESCENT_CD_MACH_TABLE`: `[[0.0, 1.15], [0.5, 1.20], [0.85, 1.30], [1.05, 1.42], [1.5, 1.68], [2.2, 1.68], [2.9, 1.65], [4.0, 1.58], [8.0, 1.50]]`.
  - **Re-solved lean-margin mission configs:** `DEFAULT_LEO_ASDS_MISSION` (`1.95° / 7.5%` — bound by `0.085 MW/m²` ballistic entry heating rather than fuel floor), `DEFAULT_LEO_RTLS_MISSION` (`1.10° / 12.0% / -22°`), `IRIDIUM_NEXT_8_MISSION` (`1.63° / 10.0% / -28°`, `v_ign = 361 m/s`, `Aero EA = 0.89 km / 63 m/s`), `SAOCOM_1A_MISSION` (`1.10° / 13.0% / -10°`, `v_ign = 376 m/s`, `Aero EA = 2.30 km / 116 m/s`).
- **What-If Class Predictor (Leave-One-Out Evaluation on 10 Flights, `ASSUMED`):**
  - Tested against Falcon 9 Block 5 capability ratios (`payload / capability`; SpaceX Falcon User's Guide: `22.8 t` LEO exp., `8.3 t` GTO exp., `5.5 t` GTO ASDS; operational/ASSUMED `17.5 t` LEO ASDS, `10.0 t` LEO RTLS, `11.5 t` polar ASDS, `6.0 t` polar RTLS, `5.0 t` MEO exp.):
    - Orbit type (`MEO/GTO >= 2,000 km → GTO 3.60 g`, else `LEO 2.90 g`): **`9/10 (90%)`** LOO accuracy (theoretical ceiling: `Iridium NEXT 7` and `Iridium NEXT 8` have identical payload `9,600 kg`, orbit `625 km 86.6°`, and recovery mode `ASDS`).
    - Performance demand (`payload / capability`): `5/10 (50%)` LOO accuracy.
    - Demand + recovery mode: `6/10 (60%)` LOO accuracy.
  - Adopted the LOO-winning orbit-type rule in `selectMissionClassSchedule()`.
