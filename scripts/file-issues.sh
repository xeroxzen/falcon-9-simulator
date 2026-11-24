#!/usr/bin/env bash
# Bash 3.2-safe: bodies piped via --body-file -, no heredoc inside $( ).
set -euo pipefail
R=xeroxzen/falcon-9-simulator
issue() { gh issue create -R "$R" --title "$1" --label "$2" --milestone "v2.0 research" --body-file -; }

# Fix issue #1's body (#10 would autolink to GitHub issue #10)
gh issue edit 1 -R "$R" --body-file - <<'EOF'
**Why:** S1 dry mass is the least-constrained fitted parameter (MAP ≈ 27.0 ± 1.9 t, prior 25.6 t). That ±1.9 t spans the whole disputed real touchdown reserve (0–2 t vs 2–4 t), so it limits the landing-margin derivation (3,500 kg boostback floor) and the EMPIRICAL-cap question (B-10).
**Idea:** Use the descent force balance (validated Cd(M), 8 flights) plus the known landing-burn propellant to back out dry mass per flight; combine with the ascent MAP.
**Done when:** dry-mass σ ≤ 0.7 t; the floor re-derived; the registry entry relabeled with the new provenance; MC on new seeds logged.
**Start here:** this one first; it unblocks B-10.
EOF

issue "Root-cause the EMPIRICAL late-S1 accel caps (B-10)" research <<'EOF'
**Why:** The fitted caps (2.90 g LEO / 3.60 g GTO) sit 0.2–0.8 g below reconstructed real axial acceleration (3.29–3.86 g), so they compensate for an unmodeled error. About 15–20% is explained by the sim flying ~5° flatter late in S1 (γ diagnostic). The MECO-reserve hypothesis was falsified.
**Candidates:** late-S1 thrust/Isp at altitude; S1 prop load (fit pushed to ~420 t); remaining trajectory-shape error (see B-12).
**Done when:** caps replaced by physical parameters (or relabeled with an explained cause); per-class holdouts hold or improve vs v1.9.x.
**Depends on:** dry mass (B-16), pitch program (B-12).
EOF

issue "Two-parameter pitch program: kick + late-S1 pitch-rate term (B-12)" research <<'EOF'
**Why:** A single pitch kick can't match both h(t) and γ(t); the sim flies ~5° flatter late in S1 on LEO flights (−22 m/s gravity-loss gap), part of the EMPIRICAL-cap gap.
**Done when:** γ(t) error < 1.5° on the LEO fit flights; kicks re-fitted with provenance (drift test passes); caps revisited.
EOF

issue "Radar-based terminal vertical velocity; retire the HEURISTIC anti-hover ramp (B-15)" research <<'EOF'
**Why:** The terminal flare trusts a biased INS v_z; when the bias ≈ vTd (0.55 m/s) the booster hover-hangs. The current fix is a time-based HEURISTIC ramp (after 3.5 s below 2.5 m). A finite-difference radar filter was tried and dropped for lag.
**Idea:** A complementary filter fusing radar altimeter range rate with accelerometer-propagated v_z (no phase lag).
**Done when:** the ramp is removed; the navErrors one-at-a-time σ stays ≤ 50 kg; ASDS with deck heave stays ≥ 99.5%.
EOF

issue "Pin the list of /* math: */-annotated literals" tech-debt <<'EOF'
**Why:** The AST literal guard allows literals annotated `/* math: ... */` (Legendre P2, ZEM/ZEV 6/4, exact 1/3). Any future edit could use the annotation to silence the guard.
**Done when:** a test asserts the exact set of math-annotated literals; adding one requires updating the test (visible in review).
EOF

issue "README: constants-by-label counts in the fidelity table" tech-debt <<'EOF'
Generate "208 constants: N SOURCED / N CALIBRATED / N EMPIRICAL / N ASSUMED / N HEURISTIC" from CONSTANTS_REGISTRY into the README fidelity table (same byte-for-byte generation test as ASSUMPTIONS.md).
EOF

issue "Mobile landscape: HUD overlaps vehicle nose; replace wireframe selection outline" polish <<'EOF'
- The camera framing region excludes the top bar and drawer but not the HUD; in phone landscape the HUD covers the rocket's nose.
- The selection outline renders as a dense wireframe; replace it with a silhouette/edge outline (cleaner on small screens).
**Done when:** the e2e asserts the selected object's projected bounds don't intersect the HUD in landscape; screenshots updated.
EOF

issue "Real-device mobile test (iOS Safari + Android Chrome)" validation <<'EOF'
Mobile is validated only in Playwright emulation on a desktop GPU. Record ~20 s on real phones: playback, tap-to-inspect, What-If sheet, rotation, unmute.
**Watch for:** iOS Safari address-bar viewport resize, thermal throttling / FPS, AudioContext resume after unmute, the silent switch.
EOF

echo "Done."
