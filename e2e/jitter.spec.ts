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

    // Let camera and RAF loop settle for 500 ms before recording
    await page.waitForTimeout(500);

    // Record world-fixed pad marker (0, 0, 0) screen-space coordinates + frame timestamps for 5 s
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

    // Confirm the world-fixed reference genuinely moves in screen space (non-trivial test)
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const totalTravelPx = Math.hypot(last.x - first.x, last.y - first.y);
    expect(totalTravelPx).toBeGreaterThan(5.0);

    // 1. World-fixed reference screen-space motion smoothness (second difference)
    const secondDiffs: number[] = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const ddx = samples[i + 1]!.x - 2 * samples[i]!.x + samples[i - 1]!.x;
      const ddy = samples[i + 1]!.y - 2 * samples[i]!.y + samples[i - 1]!.y;
      secondDiffs.push(Math.hypot(ddx, ddy));
    }
    secondDiffs.sort((a, b) => a - b);

    const refP50 = quantile(secondDiffs, 0.5);
    const refP95 = quantile(secondDiffs, 0.95);
    const refMax = secondDiffs[secondDiffs.length - 1] ?? 0;

    // 2. Frame pacing (frame-interval p95 / p50 ratio)
    const intervalsMs: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const dt = samples[i]!.t - samples[i - 1]!.t;
      if (dt > 0) intervalsMs.push(dt);
    }
    intervalsMs.sort((a, b) => a - b);

    const dtP50 = quantile(intervalsMs, 0.5);
    const dtP95 = quantile(intervalsMs, 0.95);
    const dtMax = intervalsMs[intervalsMs.length - 1] ?? 0;
    const pacingRatio = dtP50 > 0 ? dtP95 / dtP50 : Infinity;

    console.log(
      `[Smoothness QA] 5 s @ 1x ascent (${samples.length} frames, pad travel=${totalTravelPx.toFixed(1)} px) — ` +
        `world-ref 2nd-diff p50=${refP50.toFixed(3)} px | p95=${refP95.toFixed(3)} px | max=${refMax.toFixed(3)} px | ` +
        `frame dt p50=${dtP50.toFixed(2)} ms | p95=${dtP95.toFixed(2)} ms | max=${dtMax.toFixed(2)} ms | p95/p50=${pacingRatio.toFixed(2)}x`
    );

    expect(refP95).toBeLessThan(2.0);
    expect(pacingRatio).toBeLessThan(2.0);
  });
});
