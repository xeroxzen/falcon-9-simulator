# Contributing to Falcon 9 Simulator

Thank you for your interest in contributing! This project prioritizes **physics fidelity, honesty about assumptions, and deterministic verifiability** over visual spectacle.

## Core Principles

1. **No invented numbers.** Every vehicle specification, site coordinate, or flight parameter must cite a public source or be explicitly labeled `ASSUMED` / `EMPIRICAL` in config and documented in `docs/ASSUMPTIONS.md`.
2. **Decoupled physics core.** Code in `src/sim/` must remain pure TypeScript with **zero** Three.js or DOM imports so it runs headless in Node.js for unit tests, validation, and Monte Carlo campaigns.
3. **Deterministic integration.** All physics changes must preserve deterministic fixed-timestep RK4 replay (`tests/determinism.test.ts`).
4. **Never loosen test thresholds silently.** If a test threshold needs adjustment, put it in its own commit with a clear physical explanation.

## Development Workflow

```bash
pnpm install
pnpm dev              # Start local Vite dev server (http://localhost:5173)
pnpm typecheck        # Strict TypeScript check
pnpm test             # Run all Vitest physics, validation, schema & store tests
pnpm sim:mission      # Run headless CLI mission summary
pnpm sim:montecarlo   # Run N=200 Monte Carlo dispersion campaign
pnpm build            # Validate component JSON schemas + production bundle
pnpm e2e              # Run Playwright E2E suite in headed Chromium (HEADLESS=1 for CI)
```

## Pull Request Checklist

- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` pass cleanly.
- [ ] Any new or modified component specs in `src/content/components/*.json` include sources and pass schema validation.
- [ ] Any physics assumptions or simplifications are documented in `docs/ASSUMPTIONS.md`.
- [ ] UI live telemetry rows are honestly tagged `SIM` or `DERIVED` (never `COSMETIC`).
