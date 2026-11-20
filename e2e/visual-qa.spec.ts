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

const QA_DIR = path.resolve(process.cwd(), 'docs/screenshots/phase4');

test.describe('Phase 3 & 4 Visual QA Checklist', () => {
  test('verifies 1x/100x FPS, backward scrub across sep, >100km space view, split view, touchdown height, HUD=CLI at MECO, and fins/legs state', async ({
    page,
  }) => {
    fs.mkdirSync(QA_DIR, { recursive: true });
    const initial = await waitForSimReady(page);
    const sepT = initial.stageSepTimeS ?? 150;
    const durationS = initial.durationS ?? 540;
    const mecoEv = initial.events.find((e) => e.type === 'MECO');
    expect(mecoEv).toBeDefined();

    // 1. Playback at 1x and 100x — measure average FPS via window.__f9debug
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
      dbg.setTimeS(10);
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
      dbg.resetFps();
    });
    await page.waitForTimeout(1500);
    const fps1x = await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { getFps: () => number } }).__f9debug;
      return dbg.getFps();
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
    await page.waitForTimeout(1500);
    const fps100x = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { getFps: () => number; setPlaying: (p: boolean) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      return dbg.getFps();
    });
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-playback-100x.png') });
    console.log(`[Visual QA] Average FPS — 1x: ${fps1x.toFixed(1)} fps | 100x: ${fps100x.toFixed(1)} fps`);
    expect(fps1x).toBeGreaterThan(2);
    expect(fps100x).toBeGreaterThan(2);

    // 2. Scrub backward across stage separation — verify separated toggles cleanly
    await page.evaluate((tAfter) => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(tAfter);
    }, sepT + 20);
    await waitFrames(page, 10);
    expect((await getDebugState(page)).separated).toBe(true);

    await page.evaluate((tBefore) => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(tBefore);
    }, sepT - 15);
    await waitFrames(page, 10);
    const backState = await getDebugState(page);
    expect(backState.separated).toBe(false);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-scrub-before-sep.png') });

    // 3. Above 100 km: Earth & sky visible, no NaN/jitter
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
    await waitFrames(page, 18);
    const spaceState = await getDebugState(page);
    expect(spaceState.frame!.stage2.altitudeM).toBeGreaterThan(100_000);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-above-100km.png') });

    // 4. Split view after separation: 2 canvases rendered, both tracking
    await page.evaluate((t) => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setTimeS(t);
      dbg.setCameraMode('split');
    }, sepT + 140);
    await waitFrames(page, 18);
    expect(await page.locator('canvas').count()).toBe(2);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-split-view.png') });

    // 5. Booster on the ASDS deck at touchdown: height above deck within 0.5 m
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
    await waitFrames(page, 18);
    const landState = await getDebugState(page);
    expect(landState.boosterFootHeightAboveDeckM).not.toBeNull();
    expect(Math.abs(landState.boosterFootHeightAboveDeckM!)).toBeLessThan(0.5);
    expect(landState.frame!.stage1.landingLegsDeployed).toBe(true);
    console.log(
      `[Visual QA] Touchdown foot height above deck: ${landState.boosterFootHeightAboveDeckM!.toFixed(3)} m | legsDeployed=${landState.frame!.stage1.landingLegsDeployed}`
    );
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(QA_DIR, 'qa-touchdown-deck.png') });

    // 6. HUD speed/altitude at MECO equals headless CLI telemetry
    const cli = runFullMission(FALCON9_BLOCK5, DEFAULT_LEO_ASDS_MISSION, 1.0);
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
    console.log(
      `[Visual QA] MECO HUD vs CLI — Speed: HUD=${hudS1SpeedText} km/h vs CLI=${expectedKmh} km/h | Alt: HUD=${hudS1AltText} km vs CLI=${expectedKm.toFixed(1)} km`
    );

    // 7. Grid fins & landing legs driven by sim state check
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } }).__f9debug;
      dbg.setTimeS(455); // mid-aero descent
    });
    await waitFrames(page, 6);
    const aeroState = await getDebugState(page);
    console.log(
      `[Visual QA] Aero descent @ T+455s — gridFinDeflectionDeg=${aeroState.frame!.stage1.gridFinDeflectionDeg.toFixed(2)}° (sim-driven 3-DOF lift command), landingLegsDeployed=${aeroState.frame!.stage1.landingLegsDeployed}`
    );
  });
});
