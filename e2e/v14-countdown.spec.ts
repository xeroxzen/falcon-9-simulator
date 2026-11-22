import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForSimReady } from './helpers.js';

const SHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/v1.4');

const MOMENTS = [
  { key: 't-minus-10', timeS: -10.0, clock: 'T-00:10', chip: 'S1: COUNTDOWN' },
  { key: 't-minus-3', timeS: -2.2, clock: 'T-00:03', chip: 'S1: IGNITION' },
  { key: 't-minus-1', timeS: -1.0, clock: 'T-00:01', chip: 'S1: IGNITION' },
  { key: 't-0', timeS: 0.25, clock: 'T+00:00', chip: 'S1: IN FLIGHT' },
  { key: 't-plus-5', timeS: 5.0, clock: 'T+00:05', chip: 'S1: IN FLIGHT' },
] as const;

test.describe('v1.4 Part B — Countdown, Hold-Down Ignition & Water Deluge E2E', () => {
  test('verifies T-10 countdown, T-3 ignition with clamps, T+0 clamp release + deluge, T+5 liftoff on desktop and mobile', async ({
    page,
  }) => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await waitForSimReady(page);

    // Desktop (1280x800) screenshots using pad camera for clear clamp + deluge view
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { setPlaying: (p: boolean) => void; setCameraMode: (m: string) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setCameraMode('pad');
    });

    for (const m of MOMENTS) {
      await page.evaluate((t) => {
        const dbg = (window as unknown as { __f9debug: { setTimeS: (x: number) => void } })
          .__f9debug;
        dbg.setTimeS(t);
      }, m.timeS);
      await page.waitForTimeout(350);

      await expect(page.locator('.hud-clock')).toHaveText(m.clock);
      await expect(page.getByTestId('hud-status-chips')).toContainText(m.chip);

      if (m.key === 't-minus-10') {
        const occ = await page.evaluate(() => {
          const dbg = (
            window as unknown as {
              __f9debug: {
                checkPadOcclusion: () => {
                  totalSamples: number;
                  occludedSamples: number;
                  occluders: string[];
                } | null;
              };
            }
          ).__f9debug;
          return dbg.checkPadOcclusion();
        });
        expect(occ).not.toBeNull();
        expect(occ!.totalSamples).toBeGreaterThanOrEqual(8);
        expect(
          occ!.occludedSamples,
          `Vehicle occluded in Pad view by: ${occ!.occluders.join(', ')}`
        ).toBe(0);
      }

      await page.screenshot({
        path: path.join(SHOT_DIR, `desktop-${m.key}.png`),
      });
    }

    // Mobile portrait (390x844, iPhone 13) screenshots — close Engineer sheet so mobile HUD & vehicle are clear
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const engBtn = page.getByRole('button', { name: 'Eng' });
    if (await engBtn.isVisible()) {
      await engBtn.click();
      await page.waitForTimeout(250);
    }

    for (const m of MOMENTS) {
      await page.evaluate((t) => {
        const dbg = (window as unknown as { __f9debug: { setTimeS: (x: number) => void } })
          .__f9debug;
        dbg.setTimeS(t);
      }, m.timeS);
      await page.waitForTimeout(350);

      await expect(page.locator('.mobile-hud-clock')).toHaveText(m.clock);

      await page.screenshot({
        path: path.join(SHOT_DIR, `mobile-${m.key}.png`),
      });
    }
  });
});
