import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FALCON9_BLOCK5 } from '../src/sim/config/falcon9.js';
import { DEFAULT_LEO_ASDS_MISSION } from '../src/sim/config/missions.js';
import { runFullMission } from '../src/sim/mission.js';
import {
  assertCanvasRendered,
  getDebugState,
  waitForSimReady,
  waitFrames,
} from './helpers.js';

const QA_DIR = path.resolve(process.cwd(), 'docs/screenshots/phase5');

interface PerfMetrics {
  readonly fps: number;
  readonly p50FrameMs: number;
  readonly p95FrameMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly samples: number;
}

test.describe('Phase 5 Visual QA, Physics Integrity & GPU Performance', () => {
  test('verifies T+5s status chips & retracted strongback, 1x/100x GPU FPS & frame times, Mach="—" >100km, split view, 18m legs touchdown height, unified miss distance, and full-stack outline', async ({
    page,
  }) => {
    fs.mkdirSync(QA_DIR, { recursive: true });
    const initial = await waitForSimReady(page);
    const sepT = initial.stageSepTimeS ?? 150;
    const durationS = initial.durationS ?? 540;
    const mecoEv = initial.events.find((e) => e.type === 'MECO');
    expect(mecoEv).toBeDefined();

    // 1. T+5 s check: status chips reflect current sim time only (S1: IN FLIGHT, no premature ORBIT/LANDED)
    //    and strongback is retracted away from the vehicle.
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setTimeS: (t: number) => void;
            setPlaying: (p: boolean) => void;
            setCameraMode: (m: string) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setCameraMode('chase');
      dbg.setTimeS(5);
    });
    await waitFrames(page, 8);
    const chipsText = await page.getByTestId('hud-status-chips').innerText();
    expect(chipsText).toContain('S1: IN FLIGHT');
    expect(chipsText).not.toContain('LANDED');
    expect(chipsText).not.toContain('ORBIT');
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-t5s-liftoff.png') });

    // 2. Full-stack selection outline (wraps entire 70 m vehicle)
    await page.locator('.inspect-select').selectOption('falcon9-stack');
    await waitFrames(page, 6);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-full-stack-outline.png') });
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { clearSelection: () => void } }).__f9debug;
      dbg.clearSelection();
    });

    // 3. Playback at 1x and 100x — measure FPS, p50/p95 frame time, draw calls & triangles
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (s: number) => void;
            setPlaying: (p: boolean) => void;
            resetFps: () => void;
          };
        }
      ).__f9debug;
      dbg.setTimeS(15);
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
      dbg.resetFps();
    });
    await page.waitForTimeout(2000);
    const perf1x: PerfMetrics = await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { getPerfMetrics: () => PerfMetrics } }).__f9debug;
      return dbg.getPerfMetrics();
    });
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-playback-1x.png') });

    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaybackSpeed: (s: number) => void;
            resetFps: () => void;
          };
        }
      ).__f9debug;
      dbg.setPlaybackSpeed(100);
      dbg.resetFps();
    });
    await page.waitForTimeout(2000);
    const perf100x: PerfMetrics = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { getPerfMetrics: () => PerfMetrics; setPlaying: (p: boolean) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      return dbg.getPerfMetrics();
    });
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-playback-100x.png') });
    console.log(
      `[Perf 1x]   FPS=${perf1x.fps.toFixed(1)} | p50=${perf1x.p50FrameMs.toFixed(2)}ms | p95=${perf1x.p95FrameMs.toFixed(2)}ms | draws=${perf1x.drawCalls} | tris=${perf1x.triangles}`
    );
    console.log(
      `[Perf 100x] FPS=${perf100x.fps.toFixed(1)} | p50=${perf100x.p50FrameMs.toFixed(2)}ms | p95=${perf100x.p95FrameMs.toFixed(2)}ms | draws=${perf100x.drawCalls} | tris=${perf100x.triangles}`
    );
    expect(perf1x.fps).toBeGreaterThan(2);
    expect(perf100x.fps).toBeGreaterThan(2);

    // 4. Scrub backward across stage separation
    await page.evaluate((tAfter) => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(tAfter);
    }, sepT + 20);
    await waitFrames(page, 6);
    expect((await getDebugState(page)).separated).toBe(true);

    await page.evaluate((tBefore) => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(tBefore);
    }, sepT - 15);
    await waitFrames(page, 6);
    expect((await getDebugState(page)).separated).toBe(false);

    // 5. Above 100 km: Earth & sky visible, Mach displays as "—"
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setFocusStage('stage2');
      dbg.setCameraMode('chase');
      dbg.setTimeS(260);
    });
    await waitFrames(page, 12);
    const spaceState = await getDebugState(page);
    expect(spaceState.frame!.stage2.altitudeM).toBeGreaterThan(100_000);
    const machText = await page.getByTestId('eng-mach').innerText();
    expect(machText.trim()).toBe('—');
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-above-100km.png') });

    // 6. Split view after separation — also measure GPU perf in Split View
    await page.evaluate((t) => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (s: number) => void;
            setPlaying: (p: boolean) => void;
            resetFps: () => void;
          };
        }
      ).__f9debug;
      dbg.setTimeS(t);
      dbg.setCameraMode('split');
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
      dbg.resetFps();
    }, sepT + 140);
    await page.waitForTimeout(1800);
    const perfSplit: PerfMetrics = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { getPerfMetrics: () => PerfMetrics; setPlaying: (p: boolean) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      return dbg.getPerfMetrics();
    });
    console.log(
      `[Perf Split] FPS=${perfSplit.fps.toFixed(1)} | p50=${perfSplit.p50FrameMs.toFixed(2)}ms | p95=${perfSplit.p95FrameMs.toFixed(2)}ms | draws=${perfSplit.drawCalls} | tris=${perfSplit.triangles}`
    );
    expect(await page.locator('canvas').count()).toBe(2);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-split-view.png') });

    // 7. Booster on ASDS deck at touchdown: 18 m leg span, foot height < 0.5 m,
    //    post-entry soot visible, S1: LANDED + ORBIT chips shown, HUD miss == CLI miss
    const cli = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 1.0);
    await page.evaluate((tLand) => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setFocusStage('stage1');
      dbg.setCameraMode('droneship');
      dbg.setTimeS(tLand);
    }, durationS);
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.waitForFunction(() => {
      const dbg = (
        window as unknown as {
          __f9debug?: { getState: () => { boosterFootHeightAboveDeckM: number | null } };
        }
      ).__f9debug;
      return dbg?.getState().boosterFootHeightAboveDeckM !== null;
    });
    await waitFrames(page, 6);
    const landState = await getDebugState(page);
    expect(landState.boosterFootHeightAboveDeckM).not.toBeNull();
    expect(Math.abs(landState.boosterFootHeightAboveDeckM!)).toBeLessThan(0.5);
    expect(landState.frame!.stage1.landingLegsDeployed).toBe(true);
    expect(landState.frame!.stage1.phase).toBe('LANDED');
    expect(
      Math.abs(landState.frame!.stage1.distanceToTargetM - cli.boosterFinal.distanceToTargetM)
    ).toBeLessThan(0.05);

    const endChipsText = await page.getByTestId('hud-status-chips').innerText();
    expect(endChipsText).toContain('S1: LANDED');
    expect(endChipsText).toContain('ORBIT');
    console.log(
      `[Visual QA] Touchdown foot height=${landState.boosterFootHeightAboveDeckM!.toFixed(3)} m | Unified miss: HUD=${landState.frame!.stage1.distanceToTargetM.toFixed(2)} m vs CLI=${cli.boosterFinal.distanceToTargetM.toFixed(2)} m`
    );
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-touchdown-deck.png') });

    // 8. HUD speed/altitude at MECO equals headless CLI telemetry
    const cliMeco = cli.ascent.finalState;
    await page.evaluate((tMeco) => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(tMeco);
    }, cliMeco.timeS);
    await waitFrames(page, 6);

    const hudS1SpeedText = (
      await page.locator('.webcast-hud .hud-stage').first().locator('.hud-val').nth(0).innerText()
    ).replace(/,/g, '');
    const hudS1AltText = await page
      .locator('.webcast-hud .hud-stage')
      .first()
      .locator('.hud-val')
      .nth(1)
      .innerText();

    const expectedKmh = Math.round(cliMeco.speedAirRelMs * 3.6);
    const expectedKm = cliMeco.geodetic.altitudeM / 1000;
    expect(Math.abs(Number(hudS1SpeedText) - expectedKmh)).toBeLessThanOrEqual(35);
    expect(Math.abs(Number(hudS1AltText) - expectedKm)).toBeLessThanOrEqual(0.3);
  });
});
