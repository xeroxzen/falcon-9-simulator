import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertCanvasRendered,
  waitForSimReady,
  waitFrames,
} from './helpers.js';

const OUT_DIR = path.resolve(process.cwd(), 'docs/screenshots/phase5');

test.describe('Phase 5 What-If Scenarios Panel', () => {
  test('runs engine-out scenario in worker with nominal diff, tests Crew Dragon visual, and resets to nominal', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await waitForSimReady(page);

    // Open What-If panel
    await page.getByTestId('whatif-toggle-btn').click();
    await expect(page.getByTestId('whatif-panel')).toBeVisible();

    // Enable Stage 1 Engine-Out at T+65 s
    await page.getByTestId('whatif-engine-out-toggle').check();
    await page.getByTestId('whatif-engine-out-time').fill('65');
    await page.getByTestId('whatif-run-btn').click();

    // Wait for worker completion (banner disappears & diff becomes ACTIVE)
    await expect(page.getByTestId('worker-progress-banner')).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByTestId('whatif-diff')).toContainText('(ACTIVE)', {
      timeout: 30_000,
    });
    const diffText = await page.getByTestId('whatif-diff').innerText();
    // Engine-out extends MECO time (+delta s)
    expect(diffText).toMatch(/\+\d+\.\d s/);

    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { setPlaying: (p: boolean) => void; setTimeS: (t: number) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setTimeS(75);
    });
    await waitFrames(page, 6);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(OUT_DIR, 'whatif-engine-out.png') });

    // Reset back to nominal
    await page.getByTestId('whatif-reset-btn').click();
    await expect(page.getByTestId('whatif-diff')).toContainText('(BASELINE)');

    // Switch to DM-1 (Crew Dragon) to capture the detailed Crew Dragon model
    await page.getByTestId('whatif-toggle-btn').click();
    await page.locator('.mission-select').first().selectOption('dm-1');
    await expect(page.getByTestId('worker-progress-banner')).toBeHidden({
      timeout: 30_000,
    });
    await page.waitForFunction(() => {
      const dbg = (
        window as unknown as {
          __f9debug?: { getState: () => { loading: boolean; frame: unknown } };
        }
      ).__f9debug;
      const st = dbg?.getState();
      return Boolean(st && !st.loading && st.frame);
    });
    await waitFrames(page, 6);
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaying: (p: boolean) => void;
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setFocusStage('stage2');
      dbg.setCameraMode('chase');
      dbg.setTimeS(220);
    });
    await waitFrames(page, 10);
    await assertCanvasRendered(page);
    await page.screenshot({ path: path.join(OUT_DIR, 'qa-crew-dragon-s2.png') });
  });
});
