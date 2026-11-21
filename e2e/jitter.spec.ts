import { expect, test } from '@playwright/test';
import { waitForSimReady } from './helpers.js';

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * q))
  );
  return sorted[idx]!;
}

function analyzeSamples(samples: readonly { t: number; x: number; y: number }[]) {
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const totalTravelPx = Math.hypot(last.x - first.x, last.y - first.y);

  const secondDiffs: number[] = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const ddx = samples[i + 1]!.x - 2 * samples[i]!.x + samples[i - 1]!.x;
    const ddy = samples[i + 1]!.y - 2 * samples[i]!.y + samples[i - 1]!.y;
    secondDiffs.push(Math.hypot(ddx, ddy));
  }
  secondDiffs.sort((a, b) => a - b);

  const intervalsMs: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i]!.t - samples[i - 1]!.t;
    if (dt > 0) intervalsMs.push(dt);
  }
  intervalsMs.sort((a, b) => a - b);

  const refP50 = quantile(secondDiffs, 0.5);
  const refP95 = quantile(secondDiffs, 0.95);
  const refMax = secondDiffs[secondDiffs.length - 1] ?? 0;
  const dtP50 = quantile(intervalsMs, 0.5);
  const dtP95 = quantile(intervalsMs, 0.95);
  const dtMax = intervalsMs[intervalsMs.length - 1] ?? 0;
  const pacingRatio = dtP50 > 0 ? dtP95 / dtP50 : Infinity;

  return {
    frames: samples.length,
    totalTravelPx,
    refP50,
    refP95,
    refMax,
    dtP50,
    dtP95,
    dtMax,
    pacingRatio,
  };
}

test.describe('Chase Camera Smoothness & Frame Pacing QA', () => {
  test('maintains smooth screen-space motion of world-fixed pad marker and steady frame pacing during chase-mode ascent', async ({
    page,
  }) => {
    await waitForSimReady(page);

    // Position at T+25 s (~150–250 m/s ascent, nearPad floating origin active so
    // world-fixed launch pad marker (0, 0, 0) moves continuously in screen space).
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setCameraMode: (m: string) => void;
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (sp: number) => void;
            setPlaying: (p: boolean) => void;
          };
        }
      ).__f9debug;
      dbg.setCameraMode('chase');
      dbg.setFocusStage('stage1');
      dbg.setTimeS(25);
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
    });

    await page.waitForTimeout(500);

    const samples = await page.evaluate(async () => {
      const pts: { t: number; x: number; y: number }[] = [];
      const start = performance.now();
      return await new Promise<typeof pts>((resolve) => {
        function tick() {
          const now = performance.now();
          const dbg = (
            window as unknown as {
              __f9debug: {
                projectWorldPointToScreen: (
                  wx: number,
                  wy: number,
                  wz: number
                ) => {
                  x: number;
                  y: number;
                  inFront: boolean;
                  visible: boolean;
                } | null;
              };
            }
          ).__f9debug;
          const p = dbg.projectWorldPointToScreen(0, 0, 0);
          if (p && p.inFront) {
            pts.push({ t: now - start, x: p.x, y: p.y });
          }
          if (now - start >= 5000) resolve(pts);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    });

    expect(samples.length).toBeGreaterThan(20);
    const m = analyzeSamples(samples);
    expect(m.totalTravelPx).toBeGreaterThan(5.0);

    console.log(
      `[Smoothness QA — Pad Ascent] 5 s @ 1x (${m.frames} frames, pad travel=${m.totalTravelPx.toFixed(1)} px) — ` +
        `2nd-diff p50=${m.refP50.toFixed(3)} px | p95=${m.refP95.toFixed(3)} px | max=${m.refMax.toFixed(3)} px | ` +
        `dt p50=${m.dtP50.toFixed(2)} ms | p95=${m.dtP95.toFixed(2)} ms | p95/p50=${m.pacingRatio.toFixed(2)}x`
    );

    expect(m.refP95).toBeLessThan(2.0);
    expect(m.pacingRatio).toBeLessThan(2.0);
  });

  test('maintains smooth Earth-reference motion and steady frame pacing across floating-origin switch (nearPad -> highAlt) and above 100 km', async ({
    page,
  }) => {
    await waitForSimReady(page);

    // 1. Floating-origin switch window (nearPad -> highAlt at alt = 12 km, ~T+68..73 s)
    const switchRun = await page.evaluate(async () => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setCameraMode: (m: string) => void;
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (sp: number) => void;
            setPlaying: (p: boolean) => void;
            getState: () => {
              frame: { stage1: { altitudeM: number }; stage2: { altitudeM: number } } | null;
            };
            projectEarthPointToScreen: (
              lx?: number,
              ly?: number,
              lz?: number
            ) => { x: number; y: number; inFront: boolean; visible: boolean } | null;
          };
        }
      ).__f9debug;

      // Locate exact crossing time of 12 km (nearPad -> highAlt floating-origin switch)
      let tSwitch = 70;
      for (let t = 50; t <= 100; t += 0.5) {
        dbg.setTimeS(t);
        const alt = dbg.getState().frame?.stage1.altitudeM ?? 0;
        if (alt >= 12_000) {
          tSwitch = t;
          break;
        }
      }

      dbg.setCameraMode('chase');
      dbg.setFocusStage('stage1');
      dbg.setTimeS(Math.max(40, tSwitch - 2.5));
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);

      await new Promise((r) => setTimeout(r, 350));

      const pts: { t: number; x: number; y: number }[] = [];
      let minAltM = Infinity;
      let maxAltM = -Infinity;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function tick() {
          const now = performance.now();
          const alt = dbg.getState().frame?.stage1.altitudeM ?? 0;
          if (alt < minAltM) minAltM = alt;
          if (alt > maxAltM) maxAltM = alt;
          const p = dbg.projectEarthPointToScreen(0, 6_371, 0);
          if (p && p.inFront) {
            pts.push({ t: now - start, x: p.x, y: p.y });
          }
          if (now - start >= 5000) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return { pts, minAltM, maxAltM, tSwitch };
    });

    expect(switchRun.pts.length).toBeGreaterThan(20);
    // Confirm the window genuinely crossed the 12,000 m nearPad -> highAlt boundary
    expect(switchRun.minAltM).toBeLessThan(12_000);
    expect(switchRun.maxAltM).toBeGreaterThan(12_000);

    const mSwitch = analyzeSamples(switchRun.pts);
    expect(mSwitch.totalTravelPx).toBeGreaterThan(2.0);
    console.log(
      `[Smoothness QA — Origin Switch ${(switchRun.minAltM / 1000).toFixed(1)}->${(switchRun.maxAltM / 1000).toFixed(1)} km] ` +
        `5 s @ 1x (${mSwitch.frames} frames, Earth-pt travel=${mSwitch.totalTravelPx.toFixed(1)} px) — ` +
        `2nd-diff p50=${mSwitch.refP50.toFixed(3)} px | p95=${mSwitch.refP95.toFixed(3)} px | max=${mSwitch.refMax.toFixed(3)} px | ` +
        `dt p50=${mSwitch.dtP50.toFixed(2)} ms | p95=${mSwitch.dtP95.toFixed(2)} ms | p95/p50=${mSwitch.pacingRatio.toFixed(2)}x`
    );
    expect(mSwitch.refP95).toBeLessThan(2.0);
    expect(mSwitch.pacingRatio).toBeLessThan(2.0);

    // 2. High-altitude segment strictly above 100 km (Stage 2 orbital ascent)
    const highAltRun = await page.evaluate(async () => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setCameraMode: (m: string) => void;
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (sp: number) => void;
            setPlaying: (p: boolean) => void;
            getState: () => {
              frame: { stage2: { altitudeM: number } } | null;
            };
            projectEarthPointToScreen: (
              lx?: number,
              ly?: number,
              lz?: number
            ) => { x: number; y: number; inFront: boolean; visible: boolean } | null;
          };
        }
      ).__f9debug;

      dbg.setCameraMode('chase');
      dbg.setFocusStage('stage2');
      dbg.setTimeS(200);
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);

      await new Promise((r) => setTimeout(r, 350));

      const pts: { t: number; x: number; y: number }[] = [];
      let minAltM = Infinity;
      let maxAltM = -Infinity;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function tick() {
          const now = performance.now();
          const alt = dbg.getState().frame?.stage2.altitudeM ?? 0;
          if (alt < minAltM) minAltM = alt;
          if (alt > maxAltM) maxAltM = alt;
          const p = dbg.projectEarthPointToScreen(0, 6_371, 0);
          if (p && p.inFront) {
            pts.push({ t: now - start, x: p.x, y: p.y });
          }
          if (now - start >= 5000) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return { pts, minAltM, maxAltM };
    });

    expect(highAltRun.pts.length).toBeGreaterThan(20);
    expect(highAltRun.minAltM).toBeGreaterThan(100_000);

    const mHigh = analyzeSamples(highAltRun.pts);
    console.log(
      `[Smoothness QA — Above 100 km (${(highAltRun.minAltM / 1000).toFixed(1)}->${(highAltRun.maxAltM / 1000).toFixed(1)} km)] ` +
        `5 s @ 1x (${mHigh.frames} frames, Earth-pt travel=${mHigh.totalTravelPx.toFixed(1)} px) — ` +
        `2nd-diff p50=${mHigh.refP50.toFixed(3)} px | p95=${mHigh.refP95.toFixed(3)} px | max=${mHigh.refMax.toFixed(3)} px | ` +
        `dt p50=${mHigh.dtP50.toFixed(2)} ms | p95=${mHigh.dtP95.toFixed(2)} ms | p95/p50=${mHigh.pacingRatio.toFixed(2)}x`
    );
    expect(mHigh.refP95).toBeLessThan(2.0);
    expect(mHigh.pacingRatio).toBeLessThan(2.0);
  });
});
