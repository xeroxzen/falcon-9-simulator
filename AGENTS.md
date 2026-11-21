# Agent Instructions — Falcon 9 Block 5 Simulator

## Non-Negotiable Engineering Principles
1. **Physics fidelity over spectacle.** Cite every vehicle/mission specification or mark it `ASSUMED` in config and `docs/ASSUMPTIONS.md`. Never fabricate values.
2. **Physics core decoupled from rendering.** `src/sim/` is pure TypeScript with zero Three.js imports and must run headless in Node.
3. **Deterministic fixed-timestep integration.** RK4 at `dt = 0.01 s` (configurable). Never loosen test thresholds to make tests pass; any threshold change requires its own commit with rationale.
4. **Honest telemetry.** Every live UI value is labeled `SIM` or `DERIVED`; never present cosmetic animations as physical data.

## Command Hygiene (Non-Negotiable)
- **No hanging or interactive commands:** Never run commands that wait for interactive input or run forever unless they are explicitly background servers.
- **Playwright:** Always use `--reporter=list` (or `['html', { open: 'never' }]` if HTML reporting is ever enabled). Never serve or auto-open the Playwright HTML report.
- **Vitest:** Always run `vitest run` (`pnpm test`), never watch mode.
- **Dev servers:** Start dev servers only via Playwright's `webServer` config (auto-shutdown), or explicitly kill them in the same task when done.
- **Long jobs (Monte Carlo, git bisect, multi-mission sweeps):** Wrap in a timeout (`timeout` / `perl -e 'alarm N; exec @ARGV'`) with a sensible limit and log progress to a file.
- **Cleanup before finishing:** Before reporting a task done, list (`manage_task`) and kill any background processes or temporary git worktrees you started.
