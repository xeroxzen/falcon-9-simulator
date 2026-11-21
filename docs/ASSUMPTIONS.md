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

- **Choked-nozzle $I_{sp}$ consistency:** SpaceX publicly lists Falcon 9 Block 5 total sea-level thrust as $7{,}607\ \text{kN}$ and vacuum thrust as $8{,}227\ \text{kN}$, with vacuum $I_{sp} = 311\ \text{s}$. From $T(p) = T_{\text{vac}} - p_{\text{amb}} A_{\text{exit}}$, the derived nozzle exit area is $0.6799\ \text{m}^2$ ($d_e \approx 0.93\ \text{m}$), and choked-flow consistency gives sea-level $I_{sp} = 287.56\ \text{s}$.
- **Liftoff 2.0 s throttle ramp (`EMPIRICAL`):** Across `DM-1`, `SpaceX CRS-16`, and `Iridium NEXT 8` webcast telemetry, $v(2\ \text{s}) \approx 3.1\text{–}3.3\ \text{m/s}$ (vs $\approx 7.5\ \text{m/s}$ for full liftoff thrust from $T+0$). In reality, Falcon 9 ignites at T-3 s and releases its hold-down clamps at full thrust; the slow early speed is most likely a webcast display smoothing / T+0 clock-sync artifact rather than a physical engine ramp. We keep a linear $72\% \to 100\%$ ramp over $t \in [0, 2.0]\ \text{s}$ as an `EMPIRICAL` alignment term.
- **Throttle range (`ASSUMED`):** Merlin 1D throttle is clamped to $40\%\text{–}100\%$ (MVac $39\%\text{–}100\%$). Instantaneous throttle response is assumed (no turbopump spool lag).
- **Liftoff mass budget vs. SpaceX's sourced `549,054 kg` figure:**
  SpaceX's Falcon 9 spec page lists a single headline liftoff mass of `549,054 kg` (originally published for Full Thrust v1.2, without breaking down per-stage wet/dry masses or payload). Our Block 5 subcooled mass budget sums to:
  - Stage 1 dry (`ASSUMED`, reusable Block 5 w/ Ti grid fins, legs, octaweb shield): `27,200 kg`
  - Stage 1 propellant (`ASSUMED/est.`, Block 5 densified LOX/RP-1): `411,000 kg`
  - Stage 2 dry (`ASSUMED/est.`): `4,500 kg`
  - Stage 2 propellant (`ASSUMED/est.`, Block 5 densified LOX/RP-1): `111,500 kg`
  - Fairing (`Sourced`, both halves): `1,900 kg` (`0 kg` for Crew Dragon DM-1)
  - **Vehicle subtotal (no payload):** `556,100 kg` (`554,200 kg` without fairing) — **+1.28% (+7,046 kg)** above the headline `549,054 kg` spec, reflecting Block 5's heavier reusable hardware and higher subcooled propellant load. With a `12,000 kg` LEO payload, liftoff mass is `568,100 kg` (`566,255 kg` for DM-1).

## 4. Aerodynamics

- **Ascent $C_d(M)$ (`ASSUMED`):** SpaceX does not publish Falcon 9 drag data. Our curve is referenced to the `3.7 m` core cross-sectional area ($10.7521\ \text{m}^2$), **not** the `5.2 m` payload fairing area ($21.237\ \text{m}^2 = 1.975\times$ core area). Typical slender launch-vehicle drag coefficients referenced to maximum frontal (fairing) area are $C_{d,\text{fairing}} \approx 0.22\text{–}0.26$ subsonic and $0.42\text{–}0.48$ transonic peak (e.g., Sutton & Biblarz / NASA launch vehicle references). Scaling by the $1.975\times$ area ratio (plus folded legs and stowed grid fins) yields `ASSUMED` core-referenced values of **$0.48$ subsonic** ($\approx 0.24$ on fairing area), **$0.88$ transonic peak at $M = 1.05$** ($\approx 0.45$ on fairing area), and **$0.36$ supersonic at $M \ge 4.0$**.
- **Booster descent $C_d(M)$ & grid-fin lift (`ASSUMED`):** Tail-first blunt base + titanium grid fins modeled with $C_d(M)$ from $0.85$ (subsonic) to $1.45$ (transonic peak at $M = 1.1$) to $1.00$ (hypersonic). Simplified lateral grid-fin + body lift uses $C_L = 0.8\ \text{rad}^{-1} \cdot |\delta|$ with deflection $|\delta| \le 20^\circ$ (max $L/D \approx 0.25\text{–}0.30$), projected perpendicular to air-relative velocity toward the landing target.

## 5. Ascent & Stage 2 Guidance

- **Stage 1 pitchover & gravity turn (`ASSUMED`):** Smooth pitchover kick at $150\ \text{m}$ height **above the launch pad** (accounting for pad elevation such as Vandenberg SLC-4E at $114\ \text{m}$ AMSL) over $8\ \text{s}$ toward the Earth-rotation-compensated launch azimuth (supporting both ascending northeast Cape launches and descending southward Vandenberg launches), followed by zero-AoA gravity turn, smooth transonic max-Q throttle bucket ($M \in [0.92, 1.38]$), and axial G-limit ($4.5\ g$ nominal, $3.0\ g$ `ASSUMED` for human-rated DM-1).
- **Stage 2 closed-loop guidance (`ASSUMED`):** Optimal radial boundary-value / linear-tangent steering in the orbital plane with cross-track yaw plane steering:
  $$a_{r,\text{cmd}} = \left(\frac{\mu}{r^2} - \frac{v_h^2}{r}\right) + \frac{6(h_{\text{target}} - h)}{t_{\text{go}}^2} - \frac{4 v_r}{t_{\text{go}}}, \qquad \sin\theta = \text{clamp}\left(\frac{a_{r,\text{cmd}}}{a_T},\ -0.45,\ 0.72\right)$$
  plus cross-track yaw along $\pm\hat{\mathbf{n}} = \mathbf{h}/|\mathbf{h}|$ to drive final inclination within $<0.05^\circ$ of target.
- **Single-burn LEO insertion limit:** Stage 2 currently models a single continuous burn (SES-1 $\to$ SECO-1) to circular LEO (~200 km). High-altitude polar/SSO missions (`Iridium NEXT 8` 625 km, `SAOCOM 1A` 620 km) perform a 2-burn Hohmann transfer (SES-1 into parking/transfer orbit + coast + SES-2 circularization), so single-burn insertion does not circularize 600+ km orbits accurately.

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
