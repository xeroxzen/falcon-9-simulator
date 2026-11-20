import { expect, test } from '@playwright/test';
import { waitForSimReady } from './helpers.js';

test.describe('Chase Camera Jitter Regression Test', () => {
  test('keeps vehicle screen-space jitter (second difference) below 2 px p95 over 5 s at 1x during ascent', async ({
    page,
  }) => {
    await waitForSimReady(page);

    // Position at T+45 s (~300 m/s ascent) in chase mode at 1x playback
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
      dbg.setTimeS(45);
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
    });

    // Let camera settle for 300 ms before recording
    await page.waitForTimeout(300);

    // Record screen-space vehicle position every animation frame for 5 seconds
    const samples = await page.evaluate(async () => {
      const pts: { t: number; x: number; y: number }[] = [];
      const start = performance.now();
      return await new Promise<typeof pts>((resolve) => {
        function tick() {
          const now = performance.now();
          const dbg = (
            window as unknown as {
              __f9debug: {
                projectHitboxToScreen: (
                  id: string
                ) => { x: number; y: number; visible: boolean } | null;
              };
            }
          ).__f9debug;
          const p = dbg.projectHitboxToScreen('stage1');
          if (p && p.visible) {
            pts.push({ t: now - start, x: p.x, y: p.y });
          }
          if (now - start >= 5000) resolve(pts);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    });

    expect(samples.length).toBeGreaterThan(20);

    const secondDiffs: number[] = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const ddx = samples[i + 1]!.x - 2 * samples[i]!.x + samples[i - 1]!.x;
      const ddy = samples[i + 1]!.y - 2 * samples[i]!.y + samples[i - 1]!.y;
      secondDiffs.push(Math.hypot(ddx, ddy));
    }
    secondDiffs.sort((a, b) => a - b);

    const p50 = secondDiffs[Math.floor(secondDiffs.length * 0.5)] ?? 0;
    const p95 = secondDiffs[Math.floor(secondDiffs.length * 0.95)] ?? 0;
    const max = secondDiffs[secondDiffs.length - 1] ?? 0;

    console.log(
      `[Jitter QA] 5 s @ 1x (~300 m/s ascent, ${samples.length} frames) — p50=${p50.toFixed(3)} px | p95=${p95.toFixed(3)} px | max=${max.toFixed(3)} px`
    );

    expect(p95).toBeLessThan(2.0);
  });
});
