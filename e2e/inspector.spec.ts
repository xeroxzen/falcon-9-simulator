import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertCanvasRendered,
  clickComponentHitbox,
  getDebugState,
  waitForSimReady,
  waitFrames,
} from './helpers.js';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/phase4');

interface ComponentCaptureSpec {
  readonly id: string;
  readonly expectedName: string;
  readonly engineIndex?: number;
  readonly setup: (events: Map<string, number>, durationS: number) => {
    timeS: number;
    cameraMode: string;
    focusStage: 'stage1' | 'stage2';
  };
}

const COMPONENT_CASES: readonly ComponentCaptureSpec[] = [
  {
    id: 'launch-pad',
    expectedName: 'Launch Pad & Strongback Tower',
    setup: () => ({ timeS: 0, cameraMode: 'pad', focusStage: 'stage1' }),
  },
  {
    id: 'falcon9-stack',
    expectedName: 'Falcon 9 Block 5 Vehicle',
    setup: () => ({ timeS: 5, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'stage1',
    expectedName: 'First Stage Booster (Core)',
    setup: () => ({ timeS: 25, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'merlin-1d',
    expectedName: 'Merlin 1D Sea-Level Engine #1',
    engineIndex: 0,
    setup: () => ({ timeS: 25, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'interstage',
    expectedName: 'Carbon-Fiber Interstage',
    setup: () => ({ timeS: 25, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'cold-gas-thrusters',
    expectedName: 'Nitrogen Cold-Gas RCS Thrusters',
    setup: () => ({ timeS: 25, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'stage2',
    expectedName: 'Second Stage',
    setup: (ev) => ({
      timeS: (ev.get('SES_1') ?? 160) + 15,
      cameraMode: 'chase',
      focusStage: 'stage2',
    }),
  },
  {
    id: 'fairing',
    expectedName: 'Payload Fairing Halves',
    setup: () => ({ timeS: 25, cameraMode: 'chase', focusStage: 'stage1' }),
  },
  {
    id: 'mvac',
    expectedName: 'Merlin 1D Vacuum (MVac)',
    setup: (ev) => ({
      timeS: (ev.get('SES_1') ?? 160) + 20,
      cameraMode: 'chase',
      focusStage: 'stage2',
    }),
  },
  {
    id: 'payload',
    expectedName: 'Payload / Spacecraft',
    setup: (ev) => ({
      timeS: (ev.get('FAIRING_SEP') ?? 200) + 15,
      cameraMode: 'chase',
      focusStage: 'stage2',
    }),
  },
  {
    id: 'grid-fins',
    expectedName: 'Hypersonic Titanium Grid Fins',
    setup: (ev) => ({
      timeS: (ev.get('ENTRY_BURN_END') ?? 430) + 20,
      cameraMode: 'chase',
      focusStage: 'stage1',
    }),
  },
  {
    id: 'landing-legs',
    expectedName: 'Carbon-Fiber Landing Legs',
    setup: (_ev, dur) => ({
      timeS: dur,
      cameraMode: 'droneship',
      focusStage: 'stage1',
    }),
  },
  {
    id: 'droneship',
    expectedName: 'ASDS Droneship / Landing Zone',
    setup: (_ev, dur) => ({
      timeS: dur,
      cameraMode: 'droneship',
      focusStage: 'stage1',
    }),
  },
];

test.describe('Phase 4 Component Inspector E2E', () => {
  test('clicks every component proxy hitbox, verifies honest telemetry badges, and saves 13 screenshots', async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const initial = await waitForSimReady(page);
    const eventMap = new Map<string, number>();
    for (const ev of initial.events) {
      eventMap.set(ev.type, ev.timeS);
    }
    const durationS = initial.durationS ?? 540;

    for (const c of COMPONENT_CASES) {
      const cfg = c.setup(eventMap, durationS);
      await page.evaluate(
        ({ timeS, cameraMode, focusStage }) => {
          const dbg = (
            window as unknown as {
              __f9debug: {
                setPlaying: (p: boolean) => void;
                setFocusStage: (s: 'stage1' | 'stage2') => void;
                setCameraMode: (m: string) => void;
                setTimeS: (t: number) => void;
                clearSelection: () => void;
              };
            }
          ).__f9debug;
          dbg.clearSelection();
          dbg.setPlaying(false);
          dbg.setFocusStage(focusStage);
          dbg.setCameraMode(cameraMode);
          dbg.setTimeS(timeS);
        },
        cfg
      );

      await clickComponentHitbox(page, c.id, c.engineIndex);

      const panel = page.locator(
        `[data-testid="inspector-panel"][data-component-id="${c.id}"]`
      );
      await expect(panel, `Inspector panel did not open for ${c.id}`).toBeVisible();
      await expect(panel.locator('.insp-title')).toHaveText(c.expectedName);

      // Assert EVERY live telemetry row carries a SIM or DERIVED badge (never COSMETIC)
      const liveRows = panel.locator('.insp-live-row');
      const rowCount = await liveRows.count();
      for (let i = 0; i < rowCount; i++) {
        const badge = liveRows.nth(i).locator('.origin-badge');
        await expect(badge).toBeVisible();
        const text = (await badge.innerText()).trim();
        expect(['SIM', 'DERIVED']).toContain(text);
      }

      // Verify canvas actually rendered before capturing screenshot
      await assertCanvasRendered(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${c.id}.png`),
      });
    }

    // Verify persistent selection across stage separation:
    // Select Stage 1 before separation, scrub past stage sep -> Stage 1 stays selected.
    const sepT = initial.stageSepTimeS ?? 150;
    await page.evaluate((tBefore) => {
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
      dbg.setCameraMode('chase');
      dbg.setTimeS(tBefore);
    }, sepT - 20);
    await clickComponentHitbox(page, 'stage1');

    await page.evaluate((tAfter) => {
      const dbg = (
        window as unknown as { __f9debug: { setTimeS: (t: number) => void } }
      ).__f9debug;
      dbg.setTimeS(tAfter);
    }, sepT + 30);
    await waitFrames(page, 10);

    const afterSep = await getDebugState(page);
    expect(afterSep.separated).toBe(true);
    expect(afterSep.selectedComponent?.componentId).toBe('stage1');
    await expect(
      page.locator('[data-testid="inspector-panel"][data-component-id="stage1"]')
    ).toBeVisible();
  });
});
