import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForSimReady } from './helpers.js';

const SHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/v1.4');

const MOMENTS = [
  { key: 't-minus-60', timeS: -60.0, clock: 'T-01:00', chip: 'S1: COUNTDOWN' },
  { key: 't-minus-10', timeS: -10.0, clock: 'T-00:10', chip: 'S1: COUNTDOWN' },
  { key: 't-minus-3', timeS: -2.2, clock: 'T-00:03', chip: 'S1: IGNITION' },
  { key: 't-minus-1', timeS: -1.0, clock: 'T-00:01', chip: 'S1: IGNITION' },
  { key: 't-0', timeS: 0.25, clock: 'T+00:00', chip: 'S1: IN FLIGHT' },
  { key: 't-plus-5', timeS: 5.0, clock: 'T+00:05', chip: 'S1: IN FLIGHT' },
] as const;

test.describe('v1.4 Parts B & C — Pre-Launch LOX Venting, Countdown, Ignition & Water Deluge E2E', () => {
  test('verifies T-60 venting, T-10 countdown, T-3/-1 ignition with clamps, T+0 clamp release + deluge, T+5 liftoff & Pad (Fixed) on desktop and mobile', async ({
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

    // Verify Pad (Fixed) camera mode keeps mount & ground-hugging steam in frame at T+5 and T+10
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { setCameraMode: (m: string) => void; setTimeS: (t: number) => void };
        }
      ).__f9debug;
      dbg.setCameraMode('pad-fixed');
      dbg.setTimeS(5.0);
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.hud-clock')).toHaveText('T+00:05');
    await page.screenshot({
      path: path.join(SHOT_DIR, 'desktop-pad-fixed-t-plus-5.png'),
    });

    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (t: number) => void } })
        .__f9debug;
      dbg.setTimeS(10.0);
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.hud-clock')).toHaveText('T+00:10');
    await page.screenshot({
      path: path.join(SHOT_DIR, 'desktop-pad-fixed-t-plus-10.png'),
    });

    // Optional demo.gif frame capture (T-10 -> T+10 in Pad Fixed mode)
    if (process.env.CAPTURE_DEMO_GIF === '1' && process.env.DEMO_FRAMES_DIR) {
      const framesDir = process.env.DEMO_FRAMES_DIR;
      fs.mkdirSync(framesDir, { recursive: true });
      await page.setViewportSize({ width: 960, height: 600 });
      await page.waitForTimeout(200);
      let idx = 0;
      for (let t = -10.0; t <= 10.01; t += 0.25) {
        await page.evaluate((ts) => {
          const dbg = (window as unknown as { __f9debug: { setTimeS: (x: number) => void } })
            .__f9debug;
          dbg.setTimeS(ts);
        }, Number(t.toFixed(2)));
        await page.waitForTimeout(45);
        await page.screenshot({
          path: path.join(framesDir, `frame_${String(idx++).padStart(3, '0')}.png`),
        });
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    // Switch back to Pad tracking for mobile captures
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setCameraMode: (m: string) => void } })
        .__f9debug;
      dbg.setCameraMode('pad');
    });

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
