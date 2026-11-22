import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForSimReady } from './helpers.js';

interface AudioDebugSnapshot {
  hasAudioContext: boolean;
  contextState: string;
  muted: boolean;
  continuousMuted: boolean;
  graphNodesBuilt: number;
  oneShotsFired: number;
  lastOutputs: {
    airTransmission: number;
    rumbleGain: number;
    onboardGain: number;
    continuousMuted: boolean;
  } | null;
}

test.describe('v1.4 Part D — Procedural Physically-Based Web Audio E2E', () => {
  test('creates no AudioContext before unmute, persists mute across mission switches, gates >2x speed, and suppresses one-shots on scrub', async ({
    page,
  }) => {
    await waitForSimReady(page);

    const getAudio = () =>
      page.evaluate(() => {
        const dbg = (
          window as unknown as { __f9debug: { getAudioState: () => AudioDebugSnapshot } }
        ).__f9debug;
        return dbg.getAudioState();
      });

    // 1. No AudioContext exists before the user unmutes
    const before = await getAudio();
    expect(before.muted).toBe(true);
    expect(before.hasAudioContext).toBe(false);

    // 2. Mute persists across mission changes (switch ASDS -> RTLS -> DM-1)
    const missionSelect = page.locator('select.mission-select').first();
    await missionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(600);
    const afterSwitch1 = await getAudio();
    expect(afterSwitch1.muted).toBe(true);
    expect(afterSwitch1.hasAudioContext).toBe(false);

    await missionSelect.selectOption({ index: 0 });
    await page.waitForTimeout(600);
    const afterSwitch2 = await getAudio();
    expect(afterSwitch2.muted).toBe(true);
    expect(afterSwitch2.hasAudioContext).toBe(false);

    // 3. Unmute button creates persistent AudioContext graph ONCE (zero per-frame node creation)
    const soundBtn = page.getByTestId('sound-toggle-btn');
    await soundBtn.click();
    await page.waitForTimeout(250);
    const unmuted = await getAudio();
    expect(unmuted.muted).toBe(false);
    expect(unmuted.hasAudioContext).toBe(true);
    const initialNodes = unmuted.graphNodesBuilt;
    expect(initialNodes).toBeGreaterThan(0);

    // 4. Scrubbing across T-3, T=0, MECO must NEVER fire one-shots
    const oneShotsBeforeScrub = unmuted.oneShotsFired;
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: { setPlaying: (p: boolean) => void; setTimeS: (t: number) => void };
        }
      ).__f9debug;
      dbg.setPlaying(false);
      dbg.setTimeS(-5);
      dbg.setTimeS(2);
      dbg.setTimeS(165);
      dbg.setTimeS(5);
    });
    await page.waitForTimeout(250);
    const afterScrub = await getAudio();
    expect(afterScrub.oneShotsFired).toBe(oneShotsBeforeScrub);
    expect(afterScrub.graphNodesBuilt).toBe(initialNodes);

    // 5. Playback speed > 2x mutes continuous engine sound (no chipmunk audio)
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setTimeS: (t: number) => void;
            setPlaybackSpeed: (s: number) => void;
            setPlaying: (p: boolean) => void;
          };
        }
      ).__f9debug;
      dbg.setTimeS(5);
      dbg.setPlaybackSpeed(10);
      dbg.setPlaying(true);
    });
    await page.waitForTimeout(250);
    const fast = await getAudio();
    expect(fast.continuousMuted).toBe(true);
    expect(fast.lastOutputs?.rumbleGain ?? 0).toBe(0);

    // 6. External camera in vacuum (>100 km) is silent; onboard-s2 is muffled structure-borne
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setPlaybackSpeed: (s: number) => void;
            setCameraMode: (m: string) => void;
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setTimeS: (t: number) => void;
            setPlaying: (p: boolean) => void;
          };
        }
      ).__f9debug;
      dbg.setPlaybackSpeed(1);
      dbg.setFocusStage('stage2');
      dbg.setCameraMode('chase');
      dbg.setTimeS(240);
      dbg.setPlaying(true);
    });
    await page.waitForTimeout(250);
    const extVac = await getAudio();
    expect(extVac.lastOutputs?.airTransmission).toBe(0);
    expect(extVac.lastOutputs?.rumbleGain).toBe(0);

    await page.evaluate(() => {
      const dbg = (window as unknown as { __f9debug: { setCameraMode: (m: string) => void } })
        .__f9debug;
      dbg.setCameraMode('onboard-s2');
    });
    await page.waitForTimeout(250);
    const onbVac = await getAudio();
    expect(onbVac.lastOutputs?.onboardGain ?? 0).toBeGreaterThan(0.1);
    expect(onbVac.graphNodesBuilt).toBe(initialNodes);

    // Optional 27 s sound-demo video+telemetry capture (15 s Pad Fixed liftoff + 12 s RTLS sonic boom)
    if (process.env.CAPTURE_SOUND_DEMO === '1' && process.env.SOUND_DEMO_DIR) {
      const outDir = process.env.SOUND_DEMO_DIR;
      fs.mkdirSync(outDir, { recursive: true });
      await page.setViewportSize({ width: 960, height: 600 });

      const framesMeta: Array<{
        idx: number;
        segment: 'liftoff' | 'rtls';
        timeS: number;
        outputs: AudioDebugSnapshot['lastOutputs'];
      }> = [];
      let idx = 0;

      // Segment 1: 15 s liftoff from Pad (Fixed) (T-5.0 -> T+10.0 @ 10 fps = 150 frames)
      await page.evaluate(() => {
        const dbg = (
          window as unknown as {
            __f9debug: {
              setFocusStage: (s: 'stage1' | 'stage2') => void;
              setCameraMode: (m: string) => void;
              setPlaybackSpeed: (v: number) => void;
              setPlaying: (p: boolean) => void;
            };
          }
        ).__f9debug;
        dbg.setFocusStage('stage1');
        dbg.setCameraMode('pad-fixed');
        dbg.setPlaybackSpeed(1);
        dbg.setPlaying(true);
      });
      for (let k = 0; k < 150; k++) {
        const t = Number((-5.0 + k * 0.1).toFixed(2));
        await page.evaluate((ts) => {
          const dbg = (window as unknown as { __f9debug: { setTimeS: (x: number) => void } })
            .__f9debug;
          dbg.setTimeS(ts);
        }, t);
        await page.waitForTimeout(30);
        const a = await getAudio();
        framesMeta.push({ idx, segment: 'liftoff', timeS: t, outputs: a.lastOutputs });
        await page.screenshot({
          path: path.join(outDir, `frame_${String(idx++).padStart(4, '0')}.png`),
        });
      }

      // Segment 2: 12 s RTLS booster descent, double sonic boom & LZ-1 touchdown (120 frames @ 10 fps)
      await missionSelect.selectOption({ index: 1 }); // RTLS mission
      await page.waitForTimeout(800);
      const rtlsDur = await page.evaluate(() => {
        const dbg = (
          window as unknown as {
            __f9debug: {
              getState: () => { events: Array<{ type: string; timeS: number }> };
              setFocusStage: (s: 'stage1' | 'stage2') => void;
              setCameraMode: (m: string) => void;
              setPlaybackSpeed: (v: number) => void;
              setPlaying: (p: boolean) => void;
            };
          }
        ).__f9debug;
        dbg.setFocusStage('stage1');
        dbg.setCameraMode('droneship');
        dbg.setPlaybackSpeed(1);
        dbg.setPlaying(true);
        const td = dbg.getState().events.find((e) => e.type === 'TOUCHDOWN');
        return td ? td.timeS : 472;
      });
      const tStartRtls = Math.max(400, rtlsDur - 11.5);
      for (let k = 0; k < 120; k++) {
        const t = Number((tStartRtls + k * 0.1).toFixed(2));
        await page.evaluate((ts) => {
          const dbg = (window as unknown as { __f9debug: { setTimeS: (x: number) => void } })
            .__f9debug;
          dbg.setTimeS(ts);
        }, t);
        await page.waitForTimeout(30);
        const a = await getAudio();
        framesMeta.push({ idx, segment: 'rtls', timeS: t, outputs: a.lastOutputs });
        await page.screenshot({
          path: path.join(outDir, `frame_${String(idx++).padStart(4, '0')}.png`),
        });
      }

      fs.writeFileSync(path.join(outDir, 'audio_meta.json'), JSON.stringify(framesMeta, null, 2));
    }
  });
});
