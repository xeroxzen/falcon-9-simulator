import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickComponentHitbox, waitForSimReady } from './helpers.js';

const SHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/v1.4');

test.describe('v1.4 Part E — Launch Sites (LC-39A, SLC-40, SLC-4E) & Clickable Pad Infrastructure', () => {
  test('renders distinct pad infrastructure per site, supports clicking new pad components, and switches sites cleanly', async ({
    page,
  }) => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await waitForSimReady(page);

    // 1. LC-39A (default ASDS): FSS tower + HIF + Propellant Farm + Elevated Deluge Tower
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaying: (p: boolean) => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setCameraMode('pad');
      dbg.setTimeS(-10);
    });
    await page.waitForTimeout(350);

    await expect(page.locator('.hud-mission-sub')).toContainText('LC-39A');
    // Check zero camera occlusion AND zero vehicle-envelope collision across T-10, T-3, T=0, T+2
    for (const tCheck of [-10, -3, 0, 2]) {
      await page.evaluate((t: number) => {
        const dbg = (window as unknown as { __f9debug: { setTimeS: (v: number) => void } })
          .__f9debug;
        dbg.setTimeS(t);
      }, tCheck);
      await page.waitForTimeout(100);
      const occ = await page.evaluate(() => {
        const dbg = (
          window as unknown as {
            __f9debug: {
              checkPadOcclusion: () => {
                occludedSamples: number;
                intersectingParts: string[];
              } | null;
            };
          }
        ).__f9debug;
        return dbg.checkPadOcclusion();
      });
      expect(occ?.occludedSamples).toBe(0);
      expect(occ?.intersectingParts ?? []).toEqual([]);
    }
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setTimeS: (v: number) => void } }).__f9debug;
      dbg.setTimeS(-10);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-lc39a.png') });

    // Click each of the 4 new clickable pad infrastructure hitboxes on LC-39A;
    // verify honest telemetry (zero fabricated live rows for non-simulated ground structures)
    for (const [id, expectedTitle] of [
      ['fss-tower', 'LC-39A Fixed Service Structure & Crew Access Arm'],
      ['propellant-farm', 'Cryogenic LOX Sphere & RP-1 Tank Farm'],
      ['water-deluge-tower', 'Water Deluge Sound Suppression System'],
      ['hif-hangar', 'Horizontal Integration Facility (HIF)'],
    ] as const) {
      await clickComponentHitbox(page, id);
      const panel = page.locator(
        `[data-testid="inspector-panel"][data-component-id="${id}"]`
      );
      await expect(panel, `Inspector did not open for ${id}`).toBeVisible();
      await expect(panel.locator('.insp-title')).toHaveText(expectedTitle);
      await expect(panel.locator('.insp-live-row')).toHaveCount(0);
      await expect(panel).toContainText('No live');
    }
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { clearSelection: () => void } }).__f9debug;
      dbg.clearSelection();
    });

    // 2. Switch to SLC-40 (RTLS mission -> active LZ-40) and verify FSS tower is absent
    const missionSelect = page.locator('select.mission-select').first();
    await missionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaying: (p: boolean) => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setCameraMode('pad');
      dbg.setTimeS(-10);
    });
    await page.waitForTimeout(350);
    await expect(page.getByTestId('hud-mission-label')).toContainText('SLC-40');
    await expect(page.getByTestId('hud-mission-label')).toContainText('LZ-40');
    const hitboxes40 = await page.evaluate(() => {
      const dbg = (
        window as unknown as { __f9debug: { getState: () => { registeredHitboxes: string[] } } }
      ).__f9debug;
      return dbg.getState().registeredHitboxes;
    });
    expect(hitboxes40).not.toContain('fss-tower');
    expect(hitboxes40).toContain('propellant-farm');
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-slc40.png') });

    // 3. Switch to SLC-4E (Vandenberg) via What-If Site Picker + test corridor blocking
    await page.getByTestId('whatif-toggle-btn').click();
    const siteSelect = page.getByTestId('launch-site-select');
    await expect(siteSelect).toBeVisible();
    await siteSelect.selectOption('SLC-4E');

    // Picking SLC-4E auto-snaps inclination to 97.5 deg (valid)
    const inclSlider = page.getByTestId('whatif-inclination-slider');
    await expect(inclSlider).toHaveValue('97.5');
    await expect(page.getByTestId('whatif-run-btn')).toBeEnabled();

    // Setting an invalid inclination (28.6 deg) at SLC-4E must be blocked with a clear message
    await inclSlider.fill('28.6');
    await expect(page.getByTestId('whatif-corridor-error')).toBeVisible();
    await expect(page.getByTestId('whatif-corridor-error')).toContainText('SLC-4E');
    await expect(page.getByTestId('whatif-run-btn')).toBeDisabled();

    // Restoring 97.5 deg clears error and runs cleanly
    await inclSlider.fill('97.5');
    await expect(page.getByTestId('whatif-corridor-error')).toHaveCount(0);
    await expect(page.getByTestId('whatif-run-btn')).toBeEnabled();
    await page.getByTestId('whatif-run-btn').click();

    await expect(page.getByTestId('hud-mission-label')).toContainText('SLC-4E • 97.5°', {
      timeout: 25_000,
    });
    await page.getByTestId('whatif-toggle-btn').click();
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaying: (p: boolean) => void;
            setCameraMode: (m: string) => void;
            setTimeS: (t: number) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setCameraMode('pad');
      dbg.setTimeS(-10);
    });
    await page.waitForTimeout(350);

    // Webcast HUD altitude must read 0.0 km on SLC-4E pad (AGL above 114 m pad);
    // Engineer panel (open by default on desktop) must show 114 m labeled Altitude (MSL).
    const s1AltVal = page.locator('.hud-stage').first().locator('.hud-metric').nth(1).locator('.hud-val');
    await expect(s1AltVal).toHaveText('0.0');
    await expect(page.getByTestId('eng-altitude-msl')).toHaveText('114 m');
    await expect(page.locator('select.mission-select').first()).toContainText('SLC-4E');

    await page.screenshot({ path: path.join(SHOT_DIR, 'site-slc4e.png') });
  });
});
