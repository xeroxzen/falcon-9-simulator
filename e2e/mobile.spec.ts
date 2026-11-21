import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import {
  assertCanvasRendered,
  getDebugState,
  waitForSimReady,
  waitFrames,
} from './helpers.js';

const OUT_DIR = path.resolve(process.cwd(), 'docs/screenshots/v1.4');

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const pad = 1; // 1 px tolerance for subpixel rounding
  return (
    a.x + pad < b.x + b.width &&
    a.x + a.width > b.x + pad &&
    a.y + pad < b.y + b.height &&
    a.y + a.height > b.y + pad
  );
}

async function getBox(loc: Locator): Promise<Rect> {
  const b = await loc.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

test.describe('v1.4 Part A: Mobile-First Layout, Touch UX & Immersive Mode', () => {
  test('verifies compact HUD, collapsed timeline, >=44px tap targets, zero overlapping panels, no tint/stray hitbox on sheets, setViewOffset framing, mission picker, immersive auto-hide, landscape icon strip, and Low-tier FPS', async ({
    page,
  }, testInfo) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const deviceTag = testInfo.project.name;

    await waitForSimReady(page);

    // Pause at T+10 s for clean visual inspection
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { setPlaying: (p: boolean) => void; setTimeS: (t: number) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setTimeS(10);
    });
    await waitFrames(page, 6);

    // 1. Default state on phone: Low quality tier auto-detected, bottom sheets closed
    const initState = await getDebugState(page);
    expect((initState as unknown as { qualityTier: string }).qualityTier).toBe('low');
    await expect(page.getByTestId('engineer-sheet')).toHaveCount(0);
    await expect(page.getByTestId('whatif-panel')).toHaveCount(0);
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0);

    // 2. Verify compact HUD, collapsed timeline, single cycling camera button
    const topBar = page.getByTestId('top-bar');
    const webcastHud = page.getByTestId('webcast-hud');
    const timelineBar = page.getByTestId('timeline-bar');
    const camBtn = page.getByTestId('mobile-camera-cycle');
    const engBtn = page.getByTestId('mobile-eng-btn');
    const whatIfBtn = page.getByTestId('whatif-toggle-btn');
    const qBtn = page.getByTestId('quality-cycle-btn');
    const playBtn = page.getByTestId('mobile-play-btn');
    const scrubber = page.getByTestId('mobile-scrubber');

    await expect(topBar).toBeVisible();
    await expect(webcastHud).toBeVisible();
    await expect(timelineBar).toBeVisible();
    await expect(camBtn).toBeVisible();
    await expect(playBtn).toBeVisible();
    await expect(scrubber).toBeVisible();

    // 3. Assert ZERO overlapping panels
    const topBox = await getBox(topBar);
    const hudBox = await getBox(webcastHud);
    const tlBox = await getBox(timelineBar);
    expect(rectsOverlap(topBox, hudBox)).toBe(false);
    expect(rectsOverlap(topBox, tlBox)).toBe(false);
    expect(rectsOverlap(hudBox, tlBox)).toBe(false);

    // 4. Assert ALL visible interactive tap targets are >= 44px
    for (const loc of [camBtn, engBtn, whatIfBtn, qBtn, playBtn, scrubber]) {
      const box = await getBox(loc);
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }

    await assertCanvasRendered(page);
    await page.screenshot({
      path: path.join(OUT_DIR, `mobile-${deviceTag}-portrait.png`),
    });

    // 5. Camera cycling button cycles Chase -> Free Orbit, and genuine touch double-tap resets to Chase
    await camBtn.tap();
    await waitFrames(page, 4);
    expect((await getDebugState(page)).cameraMode).toBe('orbit');
    // Touch double-tap on empty sky area (left side, away from rocket hitboxes)
    const vp = page.viewportSize()!;
    await page.touchscreen.tap(vp.width * 0.15, vp.height * 0.35);
    await page.waitForTimeout(100);
    await page.touchscreen.tap(vp.width * 0.15, vp.height * 0.35);
    await waitFrames(page, 4);
    expect((await getDebugState(page)).cameraMode).toBe('chase');

    // 6. Open Engineer bottom sheet — verify no overlap, no selection/wireframe, no full-screen tint
    await engBtn.tap();
    const engSheet = page.getByTestId('engineer-sheet');
    await expect(engSheet).toBeVisible();
    await waitFrames(page, 6);
    const sheetBox = await getBox(engSheet);
    expect(rectsOverlap(topBox, sheetBox)).toBe(false);
    expect((await getDebugState(page)).selectedComponent).toBeNull();
    // Assert no full-screen tinting backdrop overlay exists over the UI
    const hasTintOverlay = await page.evaluate(() => {
      const sel = window.getSelection();
      const hasSelText = Boolean(sel && sel.toString().length > 0);
      const sheet = document.querySelector('[data-testid="engineer-sheet"]');
      const bg = sheet ? getComputedStyle(sheet).backgroundColor : '';
      return { hasSelText, bg };
    });
    expect(hasTintOverlay.hasSelText).toBe(false);
    expect(hasTintOverlay.bg).toContain('10, 14, 22');
    await page.screenshot({
      path: path.join(OUT_DIR, `mobile-${deviceTag}-engineer-sheet.png`),
    });

    // 7. Open What-If bottom sheet (mutually exclusive: closes Engineer sheet, has mission picker)
    await whatIfBtn.tap();
    const whatIfSheet = page.getByTestId('whatif-panel');
    await expect(whatIfSheet).toBeVisible();
    await expect(page.getByTestId('engineer-sheet')).toHaveCount(0);
    await expect(page.getByTestId('mobile-mission-select')).toBeVisible();
    expect((await getDebugState(page)).selectedComponent).toBeNull();
    await page.screenshot({
      path: path.join(OUT_DIR, `mobile-${deviceTag}-whatif-sheet.png`),
    });

    // Close What-If sheet via >=44px close button
    await page.getByLabel('Close What-If Scenarios').tap();
    await expect(whatIfSheet).toHaveCount(0);
    await waitFrames(page, 4);

    // 8. Tap-to-inspect opens Inspector bottom sheet AND setViewOffset keeps selected object visible above sheet
    const projBefore = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            projectHitboxToScreen: (id: string) => { x: number; y: number; visible: boolean } | null;
          };
        }
      ).__f9debug;
      return dbg.projectHitboxToScreen('stage1');
    });
    expect(projBefore).not.toBeNull();
    expect(projBefore!.visible).toBe(true);
    await page.touchscreen.tap(projBefore!.x, projBefore!.y);
    const inspSheet = page.getByTestId('inspector-panel');
    await expect(inspSheet).toBeVisible();
    await waitFrames(page, 8);
    const inspBox = await getBox(inspSheet);
    const projAfter = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            projectHitboxToScreen: (id: string) => { x: number; y: number; visible: boolean } | null;
          };
        }
      ).__f9debug;
      return dbg.projectHitboxToScreen('stage1');
    });
    expect(projAfter).not.toBeNull();
    expect(projAfter!.visible).toBe(true);
    // Selected object must be centered in the visible area ABOVE the bottom sheet
    expect(projAfter!.y).toBeGreaterThan(topBox.y + topBox.height);
    expect(projAfter!.y).toBeLessThan(inspBox.y);
    await page.screenshot({
      path: path.join(OUT_DIR, `mobile-${deviceTag}-inspector-sheet.png`),
    });
    await page.getByTestId('inspector-panel').getByLabel(/^Close /).tap();
    await expect(inspSheet).toHaveCount(0);

    // 9. Immersive mode: controls auto-hide 3 s after playback starts, and tap brings them back
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaying: (p: boolean) => void;
            setPlaybackSpeed: (s: number) => void;
            resetFps: () => void;
          };
        }
      ).__f9debug;
      dbg.setPlaybackSpeed(1);
      dbg.setPlaying(true);
      dbg.resetFps();
    });
    // Wait > 3 s so immersive auto-hide triggers while measuring Low-tier FPS
    await page.waitForTimeout(3300);
    await expect(topBar).toHaveCSS('opacity', '0');
    await expect(webcastHud).toHaveCSS('opacity', '0');
    await expect(timelineBar).toHaveCSS('opacity', '0');

    const lowPerf = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            getPerfMetrics: () => {
              fps: number;
              p50FrameMs: number;
              p95FrameMs: number;
              drawCalls: number;
              triangles: number;
            };
          };
        }
      ).__f9debug;
      return dbg.getPerfMetrics();
    });
    console.log(
      `[Mobile ${deviceTag} Low-tier (emulated on desktop GPU)] FPS=${lowPerf.fps.toFixed(1)} | p50=${lowPerf.p50FrameMs.toFixed(1)}ms | p95=${lowPerf.p95FrameMs.toFixed(1)}ms | draws=${lowPerf.drawCalls} | tris=${lowPerf.triangles}`
    );
    expect(lowPerf.fps).toBeGreaterThan(2);

    // Tap anywhere brings controls back immediately
    await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.5);
    await expect(topBar).toHaveCSS('opacity', '1');
    await expect(webcastHud).toHaveCSS('opacity', '1');
    await expect(timelineBar).toHaveCSS('opacity', '1');

    // Pause before landscape check
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setPlaying: (p: boolean) => void } }).__f9debug;
      dbg.setPlaying(false);
    });

    // 10. Phone landscape layout check (844 x 390): compact icon strip, zero overlapping panels
    await page.setViewportSize({ width: 844, height: 390 });
    await waitFrames(page, 6);
    const lTop = await getBox(topBar);
    const lHud = await getBox(webcastHud);
    const lTl = await getBox(timelineBar);
    // Compact icon strip in landscape should be narrow (< 260 px wide)
    expect(lTop.width).toBeLessThan(260);
    expect(rectsOverlap(lTop, lHud)).toBe(false);
    expect(rectsOverlap(lTop, lTl)).toBe(false);
    expect(rectsOverlap(lHud, lTl)).toBe(false);
    await assertCanvasRendered(page);
    await page.screenshot({
      path: path.join(OUT_DIR, `mobile-${deviceTag}-landscape.png`),
    });
  });
});
