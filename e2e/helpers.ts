import { expect, type Page } from '@playwright/test';

export interface DebugState {
  loading: boolean;
  error: string | null;
  timeS: number;
  playing: boolean;
  playbackSpeed: number;
  cameraMode: string;
  focusStage: string;
  showHotspots: boolean;
  selectedComponent: { componentId: string; engineIndex?: number } | null;
  separated: boolean;
  stageSepTimeS: number | null;
  durationS: number | null;
  events: Array<{
    id: string;
    type: string;
    label: string;
    timeS: number;
    altitudeM: number;
    speedMs: number;
  }>;
  frame: {
    timeS: number;
    separated: boolean;
    stage1: {
      altitudeM: number;
      speedEarthRelMs: number;
      phase: string;
      gridFinDeflectionDeg: number;
      landingLegsDeployed: boolean;
      distanceToTargetM: number;
    };
    stage2: {
      altitudeM: number;
      speedEarthRelMs: number;
      phase: string;
      fairingAttached: boolean;
    };
  } | null;
  boosterFootHeightAboveDeckM: number | null;
  registeredHitboxes: string[];
}

export async function waitForSimReady(page: Page): Promise<DebugState> {
  await page.goto('/');
  await page.waitForFunction(
    () => {
      const dbg = (window as unknown as { __f9debug?: { getState: () => DebugState } }).__f9debug;
      if (!dbg) return false;
      const st = dbg.getState();
      return !st.loading && st.frame !== null && st.durationS !== null;
    },
    { timeout: 30_000 }
  );
  // Pause at a predictable state once ready and let camera settle a few frames
  await page.evaluate(() => {
    const dbg = (window as unknown as { __f9debug: { setPlaying: (p: boolean) => void } }).__f9debug;
    dbg.setPlaying(false);
  });
  await waitFrames(page, 6);
  return getDebugState(page);
}

export async function getDebugState(page: Page): Promise<DebugState> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __f9debug: { getState: () => DebugState } }).__f9debug;
    return dbg.getState();
  });
}

export async function waitFrames(page: Page, count = 8): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const step = () => {
          if (++i >= n) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count
  );
}

/**
 * Sample pixels from every visible WebGL <canvas> on the page.
 * Fails if any canvas is blank (zero alpha) or a single flat color.
 */
export async function assertCanvasRendered(page: Page): Promise<void> {
  const results = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return canvases.map((canvas, index) => {
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) {
        return { index, ok: false, reason: 'zero-size canvas', uniqueColors: 0 };
      }
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 64;
      const ctx = sample.getContext('2d');
      if (!ctx) {
        return { index, ok: false, reason: 'no 2d ctx', uniqueColors: 0 };
      }
      ctx.drawImage(canvas, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const colors = new Set<number>();
      let nonTransparent = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]!;
        if (a > 0) {
          nonTransparent++;
          // Quantize slightly to avoid 1-bit dither noise counting as "rendered"
          const r = data[i]! >> 3;
          const g = data[i + 1]! >> 3;
          const b = data[i + 2]! >> 3;
          colors.add((r << 10) | (g << 5) | b);
        }
      }
      return {
        index,
        ok: nonTransparent > 100 && colors.size >= 4,
        reason:
          nonTransparent <= 100
            ? 'blank/transparent canvas'
            : colors.size < 4
              ? `flat single-color canvas (${colors.size} quantized colors)`
              : 'ok',
        uniqueColors: colors.size,
      };
    });
  });

  expect(results.length, 'Expected at least one WebGL canvas').toBeGreaterThan(0);
  for (const r of results) {
    expect(r.ok, `Canvas #${r.index} failed render check: ${r.reason}`).toBe(true);
  }
}

/**
 * Click a 3D component proxy hitbox via real mouse click on its projected screen coordinates.
 */
export async function clickComponentHitbox(
  page: Page,
  componentId: string,
  engineIndex?: number
): Promise<void> {
  // Camera snaps directly to target; 4 frames is plenty to render and update matrices
  await waitFrames(page, 4);

  const proj = await page.evaluate(
    ({ id, idx }) => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            projectHitboxToScreen: (
              id: string,
              idx?: number
            ) => { x: number; y: number; visible: boolean } | null;
          };
        }
      ).__f9debug;
      return dbg.projectHitboxToScreen(id, idx);
    },
    { id: componentId, idx: engineIndex }
  );

  expect(
    proj,
    `Hitbox "${componentId}" (engine=${engineIndex}) not registered in scene`
  ).not.toBeNull();
  expect(
    proj!.visible,
    `Hitbox "${componentId}" projected off-screen at (${proj!.x.toFixed(0)}, ${proj!.y.toFixed(0)})`
  ).toBe(true);

  // Move mouse to trigger hover outline, then click
  await page.mouse.move(proj!.x, proj!.y);
  await waitFrames(page, 2);
  await page.mouse.click(proj!.x, proj!.y);
  await waitFrames(page, 3);
}
