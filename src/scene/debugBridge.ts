import * as THREE from 'three';
import { sampleFrameAt, useSimStore, type CameraMode, type FocusStage } from '../store/simStore.js';

interface RegisteredHitbox {
  readonly componentId: string;
  readonly engineIndex?: number;
  readonly mesh: THREE.Object3D;
}

const hitboxes = new Map<string, RegisteredHitbox>();
let activeCamera: THREE.Camera | null = null;
let activeCanvas: HTMLCanvasElement | null = null;
let boosterFootHeightAboveDeckM: number | null = null;

// Rolling FPS counter updated inside useFrame
let fpsFrames = 0;
let fpsStartMs = performance.now();
let lastMeasuredFps = 0;

function hitboxKey(componentId: string, engineIndex?: number): string {
  return engineIndex !== undefined ? `${componentId}:${engineIndex}` : componentId;
}

export function registerDebugHitbox(
  componentId: string,
  engineIndex: number | undefined,
  mesh: THREE.Object3D | null
): void {
  if (!import.meta.env.DEV) return;
  const key = hitboxKey(componentId, engineIndex);
  if (mesh) {
    hitboxes.set(key, { componentId, engineIndex, mesh });
  } else {
    hitboxes.delete(key);
  }
}

export function updateDebugFrame(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  footHeightAboveDeckM: number | null
): void {
  if (!import.meta.env.DEV) return;
  activeCamera = camera;
  activeCanvas = canvas;
  boosterFootHeightAboveDeckM = footHeightAboveDeckM;

  fpsFrames++;
  const now = performance.now();
  const elapsed = now - fpsStartMs;
  if (elapsed >= 500) {
    lastMeasuredFps = (fpsFrames * 1000) / elapsed;
  }
}

export function installDebugHook(): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as Record<string, unknown>;
  if (w['__f9debug']) return;

  w['__f9debug'] = {
    resetFps() {
      fpsFrames = 0;
      fpsStartMs = performance.now();
      lastMeasuredFps = 0;
    },
    getFps() {
      const elapsed = performance.now() - fpsStartMs;
      if (elapsed > 100 && fpsFrames > 0) {
        return (fpsFrames * 1000) / elapsed;
      }
      return lastMeasuredFps;
    },
    getState() {
      const s = useSimStore.getState();
      const frame = sampleFrameAt(s.trajectory, s.timeS);
      return {
        loading: s.loading,
        error: s.error,
        timeS: s.timeS,
        playing: s.playing,
        playbackSpeed: s.playbackSpeed,
        cameraMode: s.cameraMode,
        focusStage: s.focusStage,
        showHotspots: s.showHotspots,
        selectedComponent: s.selectedComponent,
        separated: frame?.separated ?? false,
        stageSepTimeS: s.trajectory?.stageSepTimeS ?? null,
        durationS: s.trajectory?.durationS ?? null,
        events: s.trajectory?.events ?? [],
        frame,
        boosterFootHeightAboveDeckM,
        registeredHitboxes: Array.from(hitboxes.keys()),
      };
    },
    setTimeS(t: number) {
      useSimStore.getState().setTimeS(t);
    },
    setPlaying(p: boolean) {
      useSimStore.getState().setPlaying(p);
    },
    setPlaybackSpeed(sp: number) {
      useSimStore.getState().setPlaybackSpeed(sp);
    },
    setCameraMode(m: CameraMode) {
      useSimStore.getState().setCameraMode(m);
    },
    setFocusStage(st: FocusStage) {
      useSimStore.getState().setFocusStage(st);
    },
    setHotspots(v: boolean) {
      useSimStore.setState({ showHotspots: v });
    },
    clearSelection() {
      useSimStore.getState().selectComponent(null);
    },
    /**
     * Project a registered proxy hitbox's world center through the active Three.js
     * camera to viewport CSS pixel coordinates (x, y) for genuine mouse-click E2E picking.
     */
    projectHitboxToScreen(
      componentId: string,
      engineIndex?: number
    ): { x: number; y: number; visible: boolean } | null {
      if (!activeCamera || !activeCanvas) return null;
      const entry = hitboxes.get(hitboxKey(componentId, engineIndex));
      if (!entry) return null;

      entry.mesh.updateWorldMatrix(true, false);
      const worldPos = new THREE.Vector3();
      entry.mesh.getWorldPosition(worldPos);
      const ndc = worldPos.clone().project(activeCamera);
      const rect = activeCanvas.getBoundingClientRect();
      const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
      const y = rect.top + ((-ndc.y + 1) / 2) * rect.height;
      const visible =
        ndc.z >= -1 &&
        ndc.z <= 1 &&
        x >= rect.left + 4 &&
        x <= rect.right - 4 &&
        y >= rect.top + 4 &&
        y <= rect.bottom - 4;
      return { x, y, visible };
    },
  };
}
