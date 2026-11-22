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
    const occ39a = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { checkPadOcclusion: () => { occludedSamples: number } | null };
        }
      ).__f9debug;
      return dbg.checkPadOcclusion();
    });
    expect(occ39a?.occludedSamples).toBe(0);
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-lc39a.png') });

    // Click each of the 4 new clickable pad infrastructure hitboxes on LC-39A
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
      const badges = panel.locator('.insp-live-row .origin-badge');
      const count = await badges.count();
      expect(count).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < count; i++) {
        expect(['SIM', 'DERIVED']).toContain((await badges.nth(i).innerText()).trim());
      }
    }
    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { clearSelection: () => void } }).__f9debug;
      dbg.clearSelection();
    });

    // 2. Switch to SLC-40 (RTLS mission) and verify FSS tower is absent
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
    await expect(page.locator('.hud-mission-sub')).toContainText('SLC-40');
    const hitboxes40 = await page.evaluate(() => {
      const dbg = (
        window as unknown as { __f9debug: { getState: () => { registeredHitboxes: string[] } } }
      ).__f9debug;
      return dbg.getState().registeredHitboxes;
    });
    expect(hitboxes40).not.toContain('fss-tower');
    expect(hitboxes40).toContain('propellant-farm');
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-slc40.png') });

    // 3. Switch to SLC-4E (Vandenberg) via What-If Site Picker
    await page.getByTestId('whatif-toggle-btn').click();
    const siteSelect = page.getByTestId('launch-site-select');
    await expect(siteSelect).toBeVisible();
    await siteSelect.selectOption('SLC-4E');
    await page.getByTestId('whatif-run-btn').click();
    await expect(page.locator('.hud-mission-sub')).toContainText('SLC-4E', { timeout: 25_000 });
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
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-slc4e.png') });
  });
});
