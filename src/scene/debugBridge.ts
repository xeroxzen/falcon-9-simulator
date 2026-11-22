import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine.js';
import {
  liveSimClock,
  sampleFrameAt,
  useSimStore,
  type CameraMode,
  type FocusStage,
  type QualityTier,
} from '../store/simStore.js';

interface RegisteredHitbox {
  readonly componentId: string;
  readonly engineIndex?: number;
  readonly mesh: THREE.Object3D;
  readonly boundsMesh: THREE.Object3D;
}

const hitboxes = new Map<string, RegisteredHitbox>();
const SCRATCH_BOX3 = new THREE.Box3();
const SCRATCH_CORNER = new THREE.Vector3();
let activeCamera: THREE.Camera | null = null;
let activeCanvas: HTMLCanvasElement | null = null;
let activeScene: THREE.Scene | null = null;
let activeEarthGroup: THREE.Object3D | null = null;
let boosterFootHeightAboveDeckM: number | null = null;

// Pre-allocated ring buffer & scratch vectors (zero per-frame heap allocations)
const MAX_FRAME_SAMPLES = 600;
const frameTimesBuf = new Float64Array(MAX_FRAME_SAMPLES);
let frameTimesCount = 0;
let frameTimesHead = 0;
let fpsFrames = 0;
let fpsStartMs = performance.now();
let lastMeasuredFps = 0;
let lastFrameStampMs = 0;
let lastDrawCalls = 0;
let lastTriangles = 0;
const SCRATCH_WORLD_POS = new THREE.Vector3();
const SCRATCH_NDC = new THREE.Vector3();

function hitboxKey(componentId: string, engineIndex?: number): string {
  return engineIndex !== undefined ? `${componentId}:${engineIndex}` : componentId;
}

export function registerDebugHitbox(
  componentId: string,
  engineIndex: number | undefined,
  mesh: THREE.Object3D | null,
  boundsMesh?: THREE.Object3D | null
): void {
  if (!import.meta.env.DEV) return;
  const key = hitboxKey(componentId, engineIndex);
  if (mesh) {
    hitboxes.set(key, {
      componentId,
      engineIndex,
      mesh,
      boundsMesh: boundsMesh ?? mesh,
    });
  } else {
    hitboxes.delete(key);
  }
}

export function updateDebugFrame(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  footHeightAboveDeckM: number | null,
  renderInfo?: { readonly calls: number; readonly triangles: number },
  earthGroup?: THREE.Object3D | null,
  scene?: THREE.Scene | null
): void {
  if (!import.meta.env.DEV) return;
  activeCamera = camera;
  activeCanvas = canvas;
  if (earthGroup !== undefined) {
    activeEarthGroup = earthGroup;
  }
  if (scene !== undefined) {
    activeScene = scene;
  }
  boosterFootHeightAboveDeckM = footHeightAboveDeckM;
  if (renderInfo) {
    lastDrawCalls = renderInfo.calls;
    lastTriangles = renderInfo.triangles;
  }

  const now = performance.now();
  if (lastFrameStampMs > 0) {
    const dtMs = now - lastFrameStampMs;
    if (dtMs > 0 && dtMs < 2000) {
      frameTimesBuf[frameTimesHead] = dtMs;
      frameTimesHead = (frameTimesHead + 1) % MAX_FRAME_SAMPLES;
      if (frameTimesCount < MAX_FRAME_SAMPLES) frameTimesCount++;
    }
  }
  lastFrameStampMs = now;

  fpsFrames++;
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
      lastFrameStampMs = 0;
      frameTimesCount = 0;
      frameTimesHead = 0;
    },
    getFps() {
      const elapsed = performance.now() - fpsStartMs;
      if (elapsed > 100 && fpsFrames > 0) {
        return (fpsFrames * 1000) / elapsed;
      }
      return lastMeasuredFps;
    },
    getPerfMetrics() {
      const sorted = Array.from(frameTimesBuf.subarray(0, frameTimesCount)).sort(
        (a, b) => a - b
      );
      const p50 =
        sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)]! : 0;
      const p95 =
        sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)]! : 0;
      const elapsed = performance.now() - fpsStartMs;
      const fps =
        elapsed > 100 && fpsFrames > 0
          ? (fpsFrames * 1000) / elapsed
          : lastMeasuredFps;
      return {
        fps,
        p50FrameMs: p50,
        p95FrameMs: p95,
        drawCalls: lastDrawCalls,
        triangles: lastTriangles,
        samples: sorted.length,
      };
    },
    getState() {
      const s = useSimStore.getState();
      const frame = sampleFrameAt(s.trajectory, liveSimClock.timeS);
      return {
        loading: s.loading,
        error: s.error,
        timeS: liveSimClock.timeS,
        playing: s.playing,
        playbackSpeed: s.playbackSpeed,
        cameraMode: s.cameraMode,
        focusStage: s.focusStage,
        qualityTier: s.qualityTier,
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
    setQualityTier(tier: QualityTier) {
      useSimStore.getState().setQualityTier(tier);
    },
    setSoundMuted(muted: boolean) {
      useSimStore.getState().setSoundMuted(muted);
    },
    getAudioState() {
      return soundEngine.getDebugState();
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
      entry.mesh.getWorldPosition(SCRATCH_WORLD_POS);
      SCRATCH_NDC.copy(SCRATCH_WORLD_POS).project(activeCamera);
      const rect = activeCanvas.getBoundingClientRect();
      const x = rect.left + ((SCRATCH_NDC.x + 1) / 2) * rect.width;
      const y = rect.top + ((-SCRATCH_NDC.y + 1) / 2) * rect.height;
      const visible =
        SCRATCH_NDC.z >= -1 &&
        SCRATCH_NDC.z <= 1 &&
        x >= rect.left + 4 &&
        x <= rect.right - 4 &&
        y >= rect.top + 4 &&
        y <= rect.bottom - 4;
      return { x, y, visible };
    },
    /**
     * Project the 8 corners of the component's outline/geometry bounding box to viewport CSS pixels.
     */
    projectHitboxBoundsToScreen(
      componentId: string,
      engineIndex?: number
    ): {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      width: number;
      height: number;
    } | null {
      if (!activeCamera || !activeCanvas) return null;
      const entry = hitboxes.get(hitboxKey(componentId, engineIndex));
      if (!entry) return null;
      activeCamera.updateMatrixWorld();
      entry.boundsMesh.updateWorldMatrix(true, false);
      SCRATCH_BOX3.setFromObject(entry.boundsMesh);
      if (SCRATCH_BOX3.isEmpty()) return null;

      const rect = activeCanvas.getBoundingClientRect();
      const { min, max } = SCRATCH_BOX3;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
          for (let iz = 0; iz < 2; iz++) {
            SCRATCH_CORNER.set(
              ix === 0 ? min.x : max.x,
              iy === 0 ? min.y : max.y,
              iz === 0 ? min.z : max.z
            );
            SCRATCH_NDC.copy(SCRATCH_CORNER).project(activeCamera);
            const sx = rect.left + ((SCRATCH_NDC.x + 1) / 2) * rect.width;
            const sy = rect.top + ((-SCRATCH_NDC.y + 1) / 2) * rect.height;
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
          }
        }
      }
      return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      };
    },
    /**
     * Project an arbitrary world-space point (e.g., launch pad origin (0, 0, 0))
     * through the active Three.js camera to viewport CSS pixel coordinates (x, y).
     * Used to measure world-fixed reference motion smoothness during chase-mode flight.
     */
    projectWorldPointToScreen(
      wx: number,
      wy: number,
      wz: number
    ): { x: number; y: number; inFront: boolean; visible: boolean } | null {
      if (!activeCamera || !activeCanvas) return null;
      activeCamera.updateMatrixWorld();
      SCRATCH_WORLD_POS.set(wx, wy, wz);
      SCRATCH_NDC.copy(SCRATCH_WORLD_POS).project(activeCamera);
      const rect = activeCanvas.getBoundingClientRect();
      const x = rect.left + ((SCRATCH_NDC.x + 1) / 2) * rect.width;
      const y = rect.top + ((-SCRATCH_NDC.y + 1) / 2) * rect.height;
      const inFront = SCRATCH_NDC.z >= -1 && SCRATCH_NDC.z <= 1;
      const visible =
        inFront &&
        x >= rect.left + 4 &&
        x <= rect.right - 4 &&
        y >= rect.top + 4 &&
        y <= rect.bottom - 4;
      return { x, y, inFront, visible };
    },
    /**
     * Project a point on the curved Earth surface mesh (in earthGroup local space,
     * centered at radius 6,371 km) to viewport CSS pixel coordinates.
     * Valid across the nearPad -> highAlt floating-origin switch and above 100 km.
     */
    projectEarthPointToScreen(
      localX = 0,
      localY = 6_371,
      localZ = 0
    ): { x: number; y: number; inFront: boolean; visible: boolean } | null {
      if (!activeCamera || !activeCanvas || !activeEarthGroup) return null;
      activeCamera.updateMatrixWorld();
      activeEarthGroup.updateMatrixWorld();
      SCRATCH_WORLD_POS.set(localX, localY, localZ).applyMatrix4(
        activeEarthGroup.matrixWorld
      );
      SCRATCH_NDC.copy(SCRATCH_WORLD_POS).project(activeCamera);
      const rect = activeCanvas.getBoundingClientRect();
      const x = rect.left + ((SCRATCH_NDC.x + 1) / 2) * rect.width;
      const y = rect.top + ((-SCRATCH_NDC.y + 1) / 2) * rect.height;
      const inFront = SCRATCH_NDC.z >= -1 && SCRATCH_NDC.z <= 1;
      const visible =
        inFront &&
        x >= rect.left + 4 &&
        x <= rect.right - 4 &&
        y >= rect.top + 4 &&
        y <= rect.bottom - 4;
      return { x, y, inFront, visible };
    },
    /**
     * Raycast from the active camera to sample points on the vehicle & launch mount
     * against all pad structures tagged `userData.padStructure = true` (lightning towers,
     * strongback). Returns how many vehicle sample rays are occluded by pad structures.
     */
    checkPadOcclusion(): {
      totalSamples: number;
      occludedSamples: number;
      occluders: string[];
    } | null {
      if (!activeCamera || !activeScene) return null;
      activeCamera.updateMatrixWorld();
      activeScene.updateMatrixWorld(true);

      const padMeshes: THREE.Mesh[] = [];
      activeScene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.userData?.padStructure === true) {
          padMeshes.push(obj as THREE.Mesh);
        }
      });

      const samplePts: Array<[number, number, number]> = [
        [0, 3, 0],
        [0, 12, 0],
        [0, 24, 0],
        [0, 36, 0],
        [0, 48, 0],
        [0, 60, 0],
        [0, 68, 0],
        [-1.8, 12, 0],
        [1.8, 12, 0],
        [-1.8, 42, 0],
        [1.8, 42, 0],
      ];

      const raycaster = new THREE.Raycaster();
      const origin = activeCamera.position.clone();
      const target = new THREE.Vector3();
      const dir = new THREE.Vector3();
      const hits: THREE.Intersection[] = [];
      const occluderSet = new Set<string>();
      let occludedSamples = 0;

      for (const [px, py, pz] of samplePts) {
        target.set(px, py, pz);
        dir.copy(target).sub(origin);
        const distToVehicle = dir.length();
        dir.normalize();
        raycaster.set(origin, dir);
        raycaster.near = 0.1;
        raycaster.far = Math.max(0.2, distToVehicle - 1.5);

        hits.length = 0;
        for (const m of padMeshes) {
          THREE.Mesh.prototype.raycast.call(m, raycaster, hits);
        }
        if (hits.length > 0) {
          occludedSamples++;
          for (const h of hits) {
            occluderSet.add(String(h.object.userData?.padPart ?? 'pad-structure'));
          }
        }
      }

      return {
        totalSamples: samplePts.length,
        occludedSamples,
        occluders: Array.from(occluderSet),
      };
    },
  };
}
