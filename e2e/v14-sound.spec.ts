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
    aeroGain: number;
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

    // 7. Deluge water-spray hiss is active from T-5 s to ignition (T-3 s) at Pad (Fixed)
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __f9debug: {
            setFocusStage: (s: 'stage1' | 'stage2') => void;
            setCameraMode: (m: string) => void;
            setPlaybackSpeed: (v: number) => void;
            setTimeS: (t: number) => void;
            setPlaying: (p: boolean) => void;
          };
        }
      ).__f9debug;
      dbg.setFocusStage('stage1');
      dbg.setCameraMode('pad-fixed');
      dbg.setPlaybackSpeed(1);
      dbg.setTimeS(-3.4);
      dbg.setPlaying(true);
    });
    await page.waitForTimeout(200);
    const delugeCheck = await getAudio();
    expect(delugeCheck.lastOutputs?.aeroGain ?? 0).toBeGreaterThan(0.12);

    // Optional live 27 s MediaRecorder capture from the running app (WebGL canvas + live Web Audio master bus)
    if (process.env.CAPTURE_SOUND_DEMO === '1' && process.env.SOUND_DEMO_WEBM) {
      const webmPath = process.env.SOUND_DEMO_WEBM;
      fs.mkdirSync(path.dirname(webmPath), { recursive: true });
      await page.setViewportSize({ width: 960, height: 600 });

      // Segment 1: 15.5 s real-time 1x liftoff from Pad (Fixed) (T-5.5 -> T+10.0 s)
      await page.evaluate(() => {
        const dbg = (
          window as unknown as {
            __f9debug: {
              setFocusStage: (s: 'stage1' | 'stage2') => void;
              setCameraMode: (m: string) => void;
              setPlaybackSpeed: (v: number) => void;
              setTimeS: (t: number) => void;
              setPlaying: (p: boolean) => void;
              startLiveAvCapture: (fps: number) => boolean;
            };
          }
        ).__f9debug;
        dbg.setFocusStage('stage1');
        dbg.setCameraMode('pad-fixed');
        dbg.setPlaybackSpeed(1);
        dbg.setTimeS(-5.5);
        dbg.setPlaying(true);
        return dbg.startLiveAvCapture(25);
      });
      await page.waitForTimeout(15_500);

      // Segment 2: 11.5 s real-time 1x RTLS supersonic descent, double sonic boom & LZ-1 touchdown
      await page.evaluate(() => {
        const dbg = (window as unknown as { __f9debug: { setPlaying: (p: boolean) => void } })
          .__f9debug;
        dbg.setPlaying(false);
      });
      await missionSelect.selectOption({ index: 1 }); // RTLS mission
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        const dbg = (
          window as unknown as {
            __f9debug: {
              getState: () => { events: Array<{ type: string; timeS: number }> };
              setFocusStage: (s: 'stage1' | 'stage2') => void;
              setCameraMode: (m: string) => void;
              setPlaybackSpeed: (v: number) => void;
              setTimeS: (t: number) => void;
              setPlaying: (p: boolean) => void;
            };
          }
        ).__f9debug;
        const td = dbg.getState().events.find((e) => e.type === 'TOUCHDOWN');
        const tLand = td ? td.timeS : 472;
        dbg.setFocusStage('stage1');
        dbg.setCameraMode('droneship');
        dbg.setPlaybackSpeed(1);
        // Start slightly above 4,200 m supersonic so boom arms & fires in real-time playback
        dbg.setTimeS(Math.max(400, tLand - 20.0));
        dbg.setPlaying(true);
      });
      // Let booster cross supersonic descent -> double sonic boom -> landing burn -> touchdown
      await page.waitForTimeout(12_000);

      const b64 = await page.evaluate(async () => {
        const dbg = (
          window as unknown as { __f9debug: { stopLiveAvCapture: () => Promise<string> } }
        ).__f9debug;
        return await dbg.stopLiveAvCapture();
      });
      expect(b64.length).toBeGreaterThan(10_000);
      fs.writeFileSync(webmPath, Buffer.from(b64, 'base64'));
    }
  });
});
