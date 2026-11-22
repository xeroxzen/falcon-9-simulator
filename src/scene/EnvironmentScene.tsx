import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import {
  liveSimClock,
  sampleFrameAt,
  useSimStore,
  type QualityTier,
} from '../store/simStore.js';
import { InteractableHitbox } from './InteractableHitbox.js';
import {
  SoftParticleEmitter,
  type SoftParticleEmitterConfig,
  type SoftParticleSpec,
  type SoftParticleUpdateArgs,
} from './SoftParticles.js';

const NO_RAYCAST = () => null;

const EARTH_RADIUS_M = 6_371_000;

/**
 * Custom GLSL Fresnel Rayleigh-scattering atmosphere halo around Earth.
 */
const ATMO_VERT = `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
  float glow = pow(rim, 3.2);
  vec3 color = mix(vec3(0.18, 0.52, 0.98), vec3(0.55, 0.82, 1.0), glow);
  gl_FragColor = vec4(color, glow * 0.82);
}
`;

const DELUGE_SPRAY_COUNTS: Record<QualityTier, number> = {
  low: 32,
  med: 64,
  high: 96,
};

const STEAM_PLUME_COUNTS: Record<QualityTier, number> = {
  low: 56,
  med: 112,
  high: 180,
};

const LOX_VENT_COUNTS: Record<QualityTier, number> = {
  low: 28,
  med: 56,
  high: 96,
};

const TRENCH_PLUME_VERT = `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const TRENCH_PLUME_FRAG = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  if (uIntensity <= 0.005) discard;
  float axial = vUv.y; // 1.0 at root (deflector), 0.0 at outer tip
  float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float edgeFade = pow(smoothstep(0.05, 0.78, ndotv), 1.5);
  float tailFade = smoothstep(0.0, 0.62, axial);
  float rootFade = smoothstep(1.0, 0.90, axial);
  float flicker = 0.85 + 0.15 * sin(axial * 24.0 + uTime * 38.0);
  float shock = pow(max(0.0, sin((1.0 - axial) * 18.0 - uTime * 16.0)), 3.0);

  vec3 outerCol = vec3(1.0, 0.44, 0.10);
  vec3 coreCol = vec3(1.0, 0.94, 0.78);
  vec3 col = mix(outerCol, coreCol, pow(axial, 1.2) * 0.72 + ndotv * 0.35 + shock * 0.3);

  float alpha = edgeFade * tailFade * rootFade * flicker * uIntensity * 0.92;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Deflected Merlin 1D exhaust plume inside the open flame trench (T-3 s through lift-off).
 * Scales with live simulated throttle and transitions smoothly to the vertical ascent
 * plume as the booster climbs from 0 -> 14 m AGL.
 */
function TrenchExhaustPlume() {
  const groupRef = useRef<THREE.Group>(null);
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  const jetGeo = useMemo(
    () => new THREE.CylinderGeometry(0.95, 2.35, 1, 20, 1, true),
    []
  );
  const coreGeo = useMemo(
    () => new THREE.CylinderGeometry(1.45, 1.85, 1, 20, 1, true),
    []
  );
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: TRENCH_PLUME_VERT,
        fragmentShader: TRENCH_PLUME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
        },
      }),
    []
  );

  useEffect(() => {
    return () => {
      jetGeo.dispose();
      coreGeo.dispose();
      mat.dispose();
    };
  }, [jetGeo, coreGeo, mat]);

  useFrame(() => {
    const grp = groupRef.current;
    if (!grp) return;
    const store = useSimStore.getState();
    const t = liveSimClock.timeS;
    const frame = sampleFrameAt(store.trajectory, t);
    const thr = frame ? frame.stage1.throttle : 0;
    const aglM = frame ? Math.max(0, frame.stage1.padEnuM.z) : 0;

    // Active from ignition (T-3 s) while throttle > 0 and booster is within 14 m of pad
    const altFade = 1.0 - Math.min(1, Math.max(0, aglM / 14.0));
    const intensity = t >= -3.05 && thr > 0.01 ? thr * altFade : 0;

    grp.visible = intensity > 0.008;
    if (!grp.visible) return;

    mat.uniforms.uTime!.value = t;
    mat.uniforms.uIntensity!.value = Math.min(1, Math.pow(intensity, 0.72));

    const jetLen = 9.0 + 21.0 * intensity;
    const jetRad = 0.85 + 0.7 * intensity;
    if (leftRef.current) {
      leftRef.current.scale.set(jetRad, jetLen, jetRad);
      leftRef.current.position.set(-1.0 - jetLen * 0.5, 2.05, 0);
    }
    if (rightRef.current) {
      rightRef.current.scale.set(jetRad, jetLen, jetRad);
      rightRef.current.position.set(1.0 + jetLen * 0.5, 2.05, 0);
    }
    if (coreRef.current) {
      const coreH = 3.2 + Math.min(10, aglM);
      coreRef.current.scale.set(0.8 + 0.35 * intensity, coreH, 0.8 + 0.35 * intensity);
      coreRef.current.position.set(0, 1.3 + coreH * 0.5, 0);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Vertical core from nozzles down onto the flame deflector */}
      <mesh ref={coreRef} geometry={coreGeo} material={mat} raycast={NO_RAYCAST} />
      {/* Horizontal deflected plume exiting -X trench */}
      <mesh
        ref={leftRef}
        geometry={jetGeo}
        material={mat}
        rotation={[0, 0, -Math.PI / 2]}
        raycast={NO_RAYCAST}
      />
      {/* Horizontal deflected plume exiting +X trench */}
      <mesh
        ref={rightRef}
        geometry={jetGeo}
        material={mat}
        rotation={[0, 0, Math.PI / 2]}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

/**
 * Physically sequenced Water Deluge spray (T-5 s) + Ignition-driven Steam Plume (T-3 s+).
 * Reuses the shared GPU-billboarded SoftParticleEmitter with zero per-frame allocations.
 */
function PadDelugeAndSteam({ qualityTier }: { readonly qualityTier: QualityTier }) {
  const sprayCount = DELUGE_SPRAY_COUNTS[qualityTier];
  const steamCount = STEAM_PLUME_COUNTS[qualityTier];

  const sprayStateRef = useRef<SoftParticleUpdateArgs>({
    timeS: 0,
    intensity: 0,
    windX: 0,
    windZ: 0,
  });
  const steamStateRef = useRef<SoftParticleUpdateArgs>({
    timeS: 0,
    intensity: 0,
    windX: 0,
    windZ: 0,
  });

  const sprayConfig = useMemo<SoftParticleEmitterConfig>(
    () => ({
      count: sprayCount,
      color: '#d9ecff',
      glowColor: '#ffd6a8',
      glowStrength: 0.25,
      lifeS: 1.5,
      startRadiusM: 0.9,
      endRadiusM: 3.0,
      maxOpacity: 0.34,
      softGroundFadeM: 1.2,
    }),
    [sprayCount]
  );

  const steamConfig = useMemo<SoftParticleEmitterConfig>(
    () => ({
      count: steamCount,
      color: '#f2f6fb',
      glowColor: '#ffae5c',
      glowStrength: 0.65,
      lifeS: 10.5,
      startRadiusM: 3.4,
      endRadiusM: 20.0,
      maxOpacity: 0.48,
      softGroundFadeM: 1.4,
    }),
    [steamCount]
  );

  const spraySeeds = useMemo<SoftParticleSpec[]>(() => {
    const arr: SoftParticleSpec[] = [];
    for (let i = 0; i < sprayCount; i++) {
      const ang = (i / sprayCount) * Math.PI * 2 + ((i * 37) % 100) * 0.005;
      const r0 = 2.0 + ((i * 19) % 10) * 0.35;
      arr.push({
        originX: Math.cos(ang) * r0,
        originY: 1.2 + ((i * 13) % 10) * 0.22,
        originZ: Math.sin(ang) * r0,
        dirX: Math.cos(ang) * 0.85,
        dirY: 0.25 + ((i * 23) % 10) * 0.04,
        dirZ: Math.sin(ang) * 0.85,
        speed: 4.5 + ((i * 29) % 10) * 0.45,
        buoyancy: -0.6, // water spray stays tight near the mount & trench
        phase: i / sprayCount,
        radiusJitter: 0.75 + ((i * 41) % 10) * 0.06,
        spin: 0.3,
      });
    }
    return arr;
  }, [sprayCount]);

  const steamSeeds = useMemo<SoftParticleSpec[]>(() => {
    const arr: SoftParticleSpec[] = [];
    for (let i = 0; i < steamCount; i++) {
      // Exhaust-driven steam shoots out both ends of the X-axis flame trench (+X and -X)
      const signX = i % 2 === 0 ? 1 : -1;
      const spreadZ = (((i * 73) % 100) / 100 - 0.5) * 0.55;
      const len = Math.hypot(1, spreadZ);
      arr.push({
        originX: signX * (5.0 + ((i * 17) % 10) * 0.7),
        originY: 1.4 + ((i * 11) % 10) * 0.22,
        originZ: (((i * 31) % 100) / 100 - 0.5) * 4.6,
        dirX: (signX * 1.0) / len,
        dirY: 0.04 + ((i * 19) % 10) * 0.008, // ground-hugging lateral trench outflow
        dirZ: spreadZ / len,
        speed: 18.0 + ((i * 43) % 12) * 1.4,
        buoyancy: 0.14 + ((i * 29) % 10) * 0.016, // gentle buoyant rise, stays grounded through T+10 s
        phase: i / steamCount,
        radiusJitter: 0.72 + ((i * 53) % 10) * 0.07,
        spin: 0.12,
      });
    }
    return arr;
  }, [steamCount]);

  const getSprayState = useMemo(
    () => (): SoftParticleUpdateArgs => {
      const store = useSimStore.getState();
      const t = liveSimClock.timeS;
      const wind = store.mission.wind;
      // Three.js world: X = East, Z = -North
      const wx = Math.abs(wind.eastMs) > 0.1 ? wind.eastMs : 2.2;
      const wz = Math.abs(wind.northMs) > 0.1 ? -wind.northMs : -0.8;

      let intensity = 0;
      if (t >= -5.0 && t <= 7.0) {
        if (t < -3.5) {
          intensity = Math.min(1, (t + 5.0) / 1.5);
        } else if (t <= 3.0) {
          intensity = 1.0;
        } else {
          intensity = Math.max(0, 1.0 - (t - 3.0) / 4.0);
        }
      }
      const out = sprayStateRef.current as {
        timeS: number;
        intensity: number;
        windX: number;
        windZ: number;
      };
      out.timeS = t;
      out.intensity = intensity;
      out.windX = wx * 0.35;
      out.windZ = wz * 0.35;
      return out;
    },
    []
  );

  const getSteamState = useMemo(
    () => (): SoftParticleUpdateArgs => {
      const store = useSimStore.getState();
      const t = liveSimClock.timeS;
      const frame = sampleFrameAt(store.trajectory, t);
      const thr = frame ? frame.stage1.throttle : 0;
      const aglM = frame ? Math.max(0, frame.stage1.padEnuM.z) : 0;
      const wind = store.mission.wind;
      const wx = Math.abs(wind.eastMs) > 0.1 ? wind.eastMs : 2.5;
      const wz = Math.abs(wind.northMs) > 0.1 ? -wind.northMs : -1.0;

      // Steam appears ONLY after ignition (T >= -3.0 s), scales with exhaust thrust,
      // and grows into huge buoyant tens-of-meters clouds through ~T+10 s before dissipating.
      let intensity = 0;
      if (t >= -3.0 && t <= 16.0) {
        const thrustDrive = Math.min(1, thr * 1.15);
        const postLiftHold =
          t <= 6.5 ? 1.0 : Math.max(0, 1.0 - (t - 6.5) / 9.5);
        const aglFade =
          aglM <= 25 ? 1.0 : Math.max(0.35, 1.0 - (aglM - 25) / 180.0);
        intensity = Math.max(thrustDrive * aglFade, t >= 0 ? postLiftHold * 0.92 : 0) * postLiftHold;
      }

      const out = steamStateRef.current as {
        timeS: number;
        intensity: number;
        windX: number;
        windZ: number;
      };
      out.timeS = t;
      out.intensity = intensity;
      out.windX = wx;
      out.windZ = wz;
      return out;
    },
    []
  );

  return (
    <>
      <SoftParticleEmitter
        config={sprayConfig}
        seeds={spraySeeds}
        getState={getSprayState}
      />
      <SoftParticleEmitter
        config={steamConfig}
        seeds={steamSeeds}
        getState={getSteamState}
      />
    </>
  );
}

/**
 * Pre-launch cryogenic LOX boil-off venting (Part C, T-60 s -> T-0).
 * Reuses the shared GPU-billboarded SoftParticleEmitter with per-tier budgets
 * and zero per-frame allocations:
 *  - Stage 1 LOX tank vent (~y = 31.5 m)
 *  - Stage 2 LOX tank vent (~y = 51.0 m)
 *  - Strongback umbilical chilldown/purge vents (~x = -4.5 m, y = 44 m & 16 m)
 * Cold cryo vapor drifts gently with mission wind and tapers as flight pressurization
 * closes boil-off valves prior to ignition.
 */
function PreLaunchLoxVenting({ qualityTier }: { readonly qualityTier: QualityTier }) {
  const count = LOX_VENT_COUNTS[qualityTier];
  const stateRef = useRef<SoftParticleUpdateArgs>({
    timeS: 0,
    intensity: 0,
    windX: 0,
    windZ: 0,
  });

  const ventConfig = useMemo<SoftParticleEmitterConfig>(
    () => ({
      count,
      color: '#eaf4ff',
      glowColor: '#ffffff',
      glowStrength: 0,
      lifeS: 3.6,
      startRadiusM: 1.25,
      endRadiusM: 4.8,
      maxOpacity: 0.36,
      softGroundFadeM: 1.5,
    }),
    [count]
  );

  const ventSeeds = useMemo<SoftParticleSpec[]>(() => {
    const arr: SoftParticleSpec[] = [];
    for (let i = 0; i < count; i++) {
      // Distribute sprites across S1 LOX vent (40%), S2 LOX vent (35%), and Strongback umbilical purge (25%)
      const slot = i % 20;
      let ox: number;
      let oy: number;
      let oz: number;
      let dx: number;
      let dy: number;
      let dz: number;
      let speed: number;

      if (slot < 8) {
        // Stage 1 LOX tank boil-off vent near interstage base (y ~ 31.5 m)
        ox = 1.95;
        oy = 31.5 + ((i * 7) % 5) * 0.12;
        oz = (((i * 17) % 10) / 10 - 0.5) * 0.4;
        dx = 0.94;
        dy = -0.18 + ((i * 11) % 10) * 0.02;
        dz = (((i * 23) % 10) / 10 - 0.5) * 0.25;
        speed = 1.6 + ((i * 19) % 10) * 0.12;
      } else if (slot < 15) {
        // Stage 2 LOX tank boil-off vent (y ~ 51.0 m)
        ox = 1.92;
        oy = 51.0 + ((i * 13) % 5) * 0.12;
        oz = (((i * 29) % 10) / 10 - 0.5) * 0.4;
        dx = 0.95;
        dy = -0.14 + ((i * 17) % 10) * 0.02;
        dz = (((i * 31) % 10) / 10 - 0.5) * 0.25;
        speed = 1.8 + ((i * 23) % 10) * 0.12;
      } else {
        // Strongback umbilical chilldown/purge vents (upper y ~ 44 m and lower y ~ 16 m)
        const upper = slot % 2 === 0;
        ox = upper ? -4.8 : -5.4;
        oy = upper ? 44.0 : 16.0;
        oz = (((i * 37) % 10) / 10 - 0.5) * 0.5;
        dx = -0.35 + ((i * 13) % 10) * 0.08;
        dy = -0.22;
        dz = (((i * 41) % 10) / 10 - 0.5) * 0.35;
        speed = 1.8 + ((i * 29) % 10) * 0.14;
      }

      const len = Math.hypot(dx, dy, dz) || 1;
      arr.push({
        originX: ox,
        originY: oy,
        originZ: oz,
        dirX: dx / len,
        dirY: dy / len,
        dirZ: dz / len,
        speed,
        buoyancy: -0.22, // dense cold cryo LOX vapor gently sinks while drifting downwind
        phase: i / count,
        radiusJitter: 0.72 + ((i * 47) % 10) * 0.06,
        spin: 0.22,
      });
    }
    return arr;
  }, [count]);

  const getVentState = useMemo(
    () => (): SoftParticleUpdateArgs => {
      const store = useSimStore.getState();
      const t = liveSimClock.timeS;
      const wind = store.mission.wind;
      // Gentle coastal breeze default if mission wind is 0 so venting drifts realistically
      const wx = Math.abs(wind.eastMs) > 0.1 ? wind.eastMs : 2.8;
      const wz = Math.abs(wind.northMs) > 0.1 ? -wind.northMs : -0.6;

      // Active T-60..T-0: full boil-off venting T-60..-12 s, tapers as flight pressurization
      // closes boil-off valves (-12..-2 s), closes cleanly by T+0.2 s clamp release.
      let intensity = 0;
      if (t >= -65.0 && t <= 0.4) {
        if (t <= -12.0) {
          // Subtle natural pulsing of cryo boil-off valves
          intensity = 0.88 + 0.12 * Math.sin(t * 0.55);
        } else if (t <= -2.0) {
          const frac = (t + 12.0) / 10.0; // 0..1
          intensity = 0.92 * (1 - 0.62 * frac);
        } else {
          intensity = 0.35 * Math.max(0, 1 - (t + 2.0) / 2.4);
        }
      }

      const out = stateRef.current as {
        timeS: number;
        intensity: number;
        windX: number;
        windZ: number;
      };
      out.timeS = t;
      out.intensity = intensity;
      out.windX = wx;
      out.windZ = wz;
      return out;
    },
    []
  );

  return (
    <SoftParticleEmitter
      config={ventConfig}
      seeds={ventSeeds}
      getState={getVentState}
    />
  );
}

/**
 * Launch Pad (LC-39A / SLC-40 / SLC-4E concrete pad, open flame trench with deflector,
 * 4x visible hold-down clamps, strongback tower, deflected ignition plume, pre-launch LOX
 * venting, and physically sequenced water deluge + steam) rendered at local origin (0, 0, 0).
 */
export function LaunchPadMesh({
  siteId,
  timeS = 0,
  qualityTier = 'high',
}: {
  readonly siteId: string;
  readonly timeS?: number;
  readonly qualityTier?: QualityTier;
}) {
  // Strongback retracts smoothly from ~13 deg pre-ignition to ~20 deg at T-0,
  // then throws back to ~40 deg during T+0..3 s — never intersects the vehicle.
  const preRetract = Math.min(1, Math.max(0, (timeS + 3.0) / 3.0));
  const throwFrac = Math.min(1, Math.max(0, timeS / 3.0));
  const retractAngleRad = 0.22 + 0.13 * preRetract + 0.33 * throwFrac;

  // 4x hold-down clamps: engaged inward gripping Stage 1 base for t < 0,
  // swing visibly open outward over T+0..0.5 s at clamp release.
  const clampOpenFrac = Math.min(1, Math.max(0, timeS / 0.5));
  const clampAngleRad = 0.22 - 1.18 * clampOpenFrac;

  const isLC39A = siteId === 'LC-39A';
  const isSLC4E = siteId === 'SLC-4E';
  // Site-specific terrain tint: California coastal bluff ochre-olive at Vandenberg SLC-4E vs Florida scrub
  const groundColor = isSLC4E ? '#4a4a36' : '#2a332b';

  return (
    <group position={[0, 0, 0]}>
      {/* Ground plane around pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow raycast={NO_RAYCAST}>
        <circleGeometry args={[1200, 36]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} />
      </mesh>
      {/* Concrete pad apron */}
      <mesh position={[0, 0.25, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[48, 0.5, 48]} />
        <meshStandardMaterial color="#595e66" roughness={0.88} />
      </mesh>

      {/* Open Flame Trench & Concrete Launch Mount (channel open along +X / -X) */}
      {/* Dark recessed flame trench floor */}
      <mesh position={[0, 0.52, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[22, 0.12, 6.2]} />
        <meshStandardMaterial color="#1b1e23" roughness={0.95} />
      </mesh>
      {/* Sloped steel flame deflector wedge inside trench */}
      <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.2, 2.5, 1.25, 4]} />
        <meshStandardMaterial color="#2b3038" metalness={0.65} roughness={0.5} />
      </mesh>
      {/* North (+Z) & South (-Z) concrete launch mount piers framing the open trench */}
      <mesh position={[0, 2.1, 4.6]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[15, 3.3, 3.2]} />
        <meshStandardMaterial color="#464b54" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.1, -4.6]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[15, 3.3, 3.2]} />
        <meshStandardMaterial color="#464b54" roughness={0.85} />
      </mesh>
      {/* Steel launch mount hold-down ring collar (open center for exhaust) */}
      <mesh position={[0, 3.55, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <torusGeometry args={[2.55, 0.34, 10, 24]} />
        <meshStandardMaterial color="#383d46" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* 4x Visible Hold-Down Clamps around Stage 1 base (release at T = 0) */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((az, idx) => (
        <group key={idx} rotation={[0, az, 0]}>
          {/* Clamp pedestal */}
          <mesh position={[2.65, 3.7, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.75, 0.7, 0.75]} />
            <meshStandardMaterial color="#4d5460" metalness={0.6} roughness={0.45} />
          </mesh>
          {/* Pivoting clamp arm (inward for t < 0, swings open at T = 0) */}
          <group position={[2.45, 3.85, 0]} rotation={[0, 0, clampAngleRad]}>
            <mesh position={[0, 1.05, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.48, 2.1, 0.56]} />
              <meshStandardMaterial color="#a6b0bf" metalness={0.75} roughness={0.3} />
            </mesh>
            {/* High-contrast amber clamp jaw tip */}
            <mesh position={[-0.22, 1.95, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.52, 0.42, 0.62]} />
              <meshStandardMaterial color="#e09f3e" metalness={0.5} roughness={0.35} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Deflected Merlin ignition exhaust plume inside open flame trench */}
      <TrenchExhaustPlume />

      {/* Physically sequenced water deluge spray (T-5 s) + ignition steam (T-3 s+) */}
      <PadDelugeAndSteam qualityTier={qualityTier} />

      {/* Pre-launch cryogenic LOX boil-off venting (T-60 s -> T-0, Part C) */}
      <PreLaunchLoxVenting qualityTier={qualityTier} />

      {/* Transporter/Erector strongback tower — hinged at base, retracted away in -X */}
      <group position={[-7.5, 2.0, 0]} rotation={[0, 0, retractAngleRad]}>
        <mesh
          position={[0, 31, 0]}
          castShadow
          raycast={NO_RAYCAST}
          userData={{ padStructure: true, padPart: 'strongback' }}
        >
          <boxGeometry args={[3.2, 62, 3.2]} />
          <meshStandardMaterial color="#4a505a" roughness={0.6} metalness={0.5} />
        </mesh>
        <InteractableHitbox
          componentId="launch-pad"
          label={`Launch Pad (${siteId})`}
          position={[0, 31, 0]}
          shape="box"
          args={[6.5, 62, 6.5]}
          outlineArgs={[3.8, 62, 3.8]}
          labelOffset={[-6, 12, 0]}
        />
      </group>
      {/* 4x Lightning protection towers */}
      {[
        [36, 36],
        [-36, 36],
        [36, -36],
        [-36, -36],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          position={[x!, 42, z!]}
          raycast={NO_RAYCAST}
          userData={{ padStructure: true, padPart: `lightning-tower-${i}` }}
        >
          <cylinderGeometry args={[0.35, 0.8, 84, 8]} />
          <meshStandardMaterial color="#70757d" metalness={0.5} />
        </mesh>
      ))}
      {/* Subtle site marker */}
      <mesh position={[0, 0.55, 18]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[1.2, 1.8, 20]} />
        <meshBasicMaterial
          color={isLC39A ? '#4ea1ff' : isSLC4E ? '#4fd1a5' : '#ffd166'}
        />
      </mesh>

      {/* =====================================================================
          Clickable Low-Poly Pad Infrastructure (Part E, positioned cleanly
          outside the Pad camera-to-vehicle ray cone for zero occlusion)
          ===================================================================== */}

      {/* 1. LC-39A Fixed Service Structure (FSS) & Crew Access Arm (LC-39A only) */}
      {isLC39A && (
        <group position={[-25, 0, -24]}>
          {/* Main steel FSS tower */}
          <mesh
            position={[0, 39, 0]}
            castShadow
            raycast={NO_RAYCAST}
            userData={{ padStructure: true, padPart: 'fss-tower' }}
          >
            <boxGeometry args={[11, 78, 11]} />
            <meshStandardMaterial color="#3c434d" roughness={0.7} metalness={0.45} />
          </mesh>
          {/* Clad upper weather panels */}
          <mesh
            position={[0, 56, 0]}
            raycast={NO_RAYCAST}
            userData={{ padStructure: true, padPart: 'fss-cladding' }}
          >
            <boxGeometry args={[11.6, 26, 11.6]} />
            <meshStandardMaterial color="#272c34" roughness={0.65} metalness={0.5} />
          </mesh>
          {/* Retracted Crew Access Arm + White Room at y = 54 m (swung away along -Z, well clear of vehicle) */}
          <group position={[5.5, 54, -4.5]} rotation={[0, 1.48, 0]}>
            <mesh
              position={[9.5, 0, 0]}
              raycast={NO_RAYCAST}
              userData={{ padStructure: true, padPart: 'crew-access-arm' }}
            >
              <boxGeometry args={[19, 3.2, 2.8]} />
              <meshStandardMaterial color="#dde4ee" roughness={0.45} metalness={0.3} />
            </mesh>
            <mesh
              position={[19.2, 0, 0]}
              raycast={NO_RAYCAST}
              userData={{ padStructure: true, padPart: 'white-room' }}
            >
              <boxGeometry args={[3.2, 3.8, 3.4]} />
              <meshStandardMaterial color="#f5f8fc" roughness={0.35} />
            </mesh>
          </group>
          <InteractableHitbox
            componentId="fss-tower"
            label="LC-39A FSS & Crew Access Arm"
            position={[0, 39, 0]}
            shape="box"
            args={[14, 78, 14]}
            outlineArgs={[12, 78, 12]}
            labelOffset={[-8, 18, 0]}
          />
        </group>
      )}

      {/* 2. Horizontal Integration Facility (HIF) Hangar (all 3 sites) */}
      <group position={[-54, 0, -48]}>
        <mesh
          position={[0, 7, 0]}
          receiveShadow
          raycast={NO_RAYCAST}
          userData={{ padStructure: true, padPart: 'hif-hangar' }}
        >
          <boxGeometry args={[36, 14, 18]} />
          <meshStandardMaterial color="#cfd6df" roughness={0.75} metalness={0.25} />
        </mesh>
        {/* Dark roof fascia & hangar bay door */}
        <mesh position={[0, 14.3, 0]} raycast={NO_RAYCAST}>
          <boxGeometry args={[36.8, 0.8, 18.8]} />
          <meshStandardMaterial color="#3c434d" roughness={0.7} />
        </mesh>
        <mesh position={[18.1, 5.5, 0]} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.3, 11, 10]} />
          <meshStandardMaterial color="#2a3038" roughness={0.6} />
        </mesh>
        <InteractableHitbox
          componentId="hif-hangar"
          label="Horizontal Integration Facility (HIF)"
          position={[0, 7, 0]}
          shape="box"
          args={[38, 16, 20]}
          outlineArgs={[37, 15, 19]}
          labelOffset={[0, 11, 0]}
        />
      </group>

      {/* 3. Cryogenic LOX Sphere & Subcooled RP-1 Tank Farm (all 3 sites) */}
      <group position={[46, 0, -28]}>
        {/* Spherical white LOX storage tank on 4 support legs */}
        <mesh
          position={[0, 8.5, 0]}
          castShadow
          raycast={NO_RAYCAST}
          userData={{ padStructure: true, padPart: 'propellant-farm' }}
        >
          <sphereGeometry args={[6.2, 20, 16]} />
          <meshStandardMaterial color="#eef3f8" roughness={0.38} metalness={0.25} />
        </mesh>
        {[
          [3.6, 3.6],
          [-3.6, 3.6],
          [3.6, -3.6],
          [-3.6, -3.6],
        ].map(([lx, lz], idx) => (
          <mesh key={idx} position={[lx!, 3.0, lz!]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.35, 0.45, 6.0, 8]} />
            <meshStandardMaterial color="#7d8694" metalness={0.5} />
          </mesh>
        ))}
        {/* Horizontal RP-1 / LN2 subcooler tanks */}
        <mesh position={[12, 2.2, 8]} rotation={[0, 0, Math.PI / 2]} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[1.6, 1.6, 12, 14]} />
          <meshStandardMaterial color="#d8e0e8" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[12, 2.2, 12.5]} rotation={[0, 0, Math.PI / 2]} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[1.6, 1.6, 12, 14]} />
          <meshStandardMaterial color="#d8e0e8" roughness={0.45} metalness={0.3} />
        </mesh>
        <InteractableHitbox
          componentId="propellant-farm"
          label="LOX Sphere & RP-1 Tank Farm"
          position={[4, 7, 4]}
          shape="box"
          args={[22, 16, 22]}
          outlineArgs={[20, 15, 20]}
          labelOffset={[0, 11, 0]}
        />
      </group>

      {/* 4. Water Deluge Sound Suppression Tower (elevated tank at LC-39A; lower tank at SLC-40/4E) */}
      <group position={[40, 0, -52]}>
        {isLC39A ? (
          <>
            <mesh
              position={[0, 44, 0]}
              castShadow
              raycast={NO_RAYCAST}
              userData={{ padStructure: true, padPart: 'water-deluge-tower' }}
            >
              <cylinderGeometry args={[4.4, 4.4, 9.5, 16]} />
              <meshStandardMaterial color="#d9e2ec" roughness={0.45} metalness={0.3} />
            </mesh>
            {[
              [2.8, 2.8],
              [-2.8, 2.8],
              [2.8, -2.8],
              [-2.8, -2.8],
            ].map(([wx, wz], idx) => (
              <mesh key={idx} position={[wx!, 20, wz!]} raycast={NO_RAYCAST}>
                <cylinderGeometry args={[0.35, 0.5, 40, 8]} />
                <meshStandardMaterial color="#67707d" metalness={0.55} />
              </mesh>
            ))}
          </>
        ) : (
          <mesh position={[0, 5.5, 0]} castShadow raycast={NO_RAYCAST}>
            <cylinderGeometry args={[5.2, 5.2, 11, 16]} />
            <meshStandardMaterial color="#cfd8e2" roughness={0.5} metalness={0.3} />
          </mesh>
        )}
        <InteractableHitbox
          componentId="water-deluge-tower"
          label="Water Deluge System"
          position={[0, isLC39A ? 25 : 6, 0]}
          shape="box"
          args={[12, isLC39A ? 52 : 13, 12]}
          outlineArgs={[11, isLC39A ? 50 : 12, 11]}
          labelOffset={[0, isLC39A ? 28 : 9, 0]}
        />
      </group>
    </group>
  );
}

/**
 * ASDS Droneship (91 m x 52 m deck) or RTLS Landing Zone concrete pad at (0, 0, 0).
 */
export function LandingPadMesh({
  mode,
}: {
  readonly mode: 'ASDS' | 'RTLS' | 'EXPENDABLE';
}) {
  const landingSiteId = useSimStore((s) => s.trajectory?.landingSiteId ?? 'LZ-40');

  if (mode === 'RTLS') {
    return (
      <group position={[0, 0, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow raycast={NO_RAYCAST}>
          <circleGeometry args={[1500, 48]} />
          <meshStandardMaterial color="#2a352c" roughness={0.95} />
        </mesh>
        {/* 86 m diameter concrete LZ-1 pad (top surface flush at y=0.00 m) */}
        <mesh position={[0, -0.15, 0]} receiveShadow raycast={NO_RAYCAST}>
          <cylinderGeometry args={[43, 44, 0.3, 48]} />
          <meshStandardMaterial color="#676d75" roughness={0.9} />
        </mesh>
        {/* Target X ring */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
          <ringGeometry args={[14, 15.8, 40]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} raycast={NO_RAYCAST}>
          <planeGeometry args={[22, 1.8]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]} raycast={NO_RAYCAST}>
          <planeGeometry args={[22, 1.8]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
        <InteractableHitbox
          componentId="droneship"
          label={`Landing Zone (${landingSiteId})`}
          position={[18, -0.2, 0]}
          shape="cylinder"
          args={[24, 24, 1.4]}
          outlineArgs={[44, 44, 0.8]}
          outlineOffset={[-18, 0.05, 0]}
          labelOffset={[12, 4, 0]}
        />
      </group>
    );
  }

  return (
    <group position={[0, 0, 0]}>
      {/* Atlantic Ocean plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.0, 0]} receiveShadow raycast={NO_RAYCAST}>
        <circleGeometry args={[3500, 64]} />
        <meshStandardMaterial color="#0b2844" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* ASDS Barge hull (91 m x 52 m, top deck surface flush at y=0.00 m) */}
      <mesh position={[0, -1.1, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[91, 2.2, 52]} />
        <meshStandardMaterial color="#20252d" roughness={0.7} metalness={0.35} />
      </mesh>
      {/* Yellow X-circle deck target */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[15, 16.5, 48]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} raycast={NO_RAYCAST}>
        <planeGeometry args={[24, 1.8]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]} raycast={NO_RAYCAST}>
        <planeGeometry args={[24, 1.8]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
      <InteractableHitbox
        componentId="droneship"
        label="ASDS Droneship"
        position={[24, -0.2, 0]}
        shape="box"
        args={[38, 2.2, 44]}
        outlineArgs={[91, 2.4, 52]}
        outlineOffset={[-24, -0.9, 0]}
        labelOffset={[8, 4, 0]}
      />
    </group>
  );
}

/**
 * Curved Earth sphere + Rayleigh atmosphere halo + altitude-faded starfield.
 * Positioned dynamically below the active floating-origin vehicle.
 */
const SKY_LOW = new THREE.Color('#4a86c8');
const SKY_MID = new THREE.Color('#0c2142');
const SKY_HIGH = new THREE.Color('#02040a');
const SKY_SCRATCH = new THREE.Color();

export function EarthAndSky({
  altitudeM,
  earthGroupRef,
  starsGroupRef,
  starCount = 2200,
}: {
  readonly altitudeM: number;
  readonly earthGroupRef?: React.RefObject<THREE.Group>;
  readonly starsGroupRef?: React.RefObject<THREE.Group>;
  readonly starCount?: number;
}) {
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    []
  );

  // Smoothly transition sky background from bright launch-day blue -> deep space black
  // Reuses pre-allocated Color constants (zero per-frame allocations)
  const spaceFactor = Math.min(1, Math.max(0, (altitudeM - 8_000) / 70_000));
  if (spaceFactor < 0.45) {
    SKY_SCRATCH.copy(SKY_LOW).lerp(SKY_MID, spaceFactor / 0.45);
  } else {
    SKY_SCRATCH.copy(SKY_MID).lerp(SKY_HIGH, (spaceFactor - 0.45) / 0.55);
  }
  const skyHex = SKY_SCRATCH.getHex();

  // Scale Earth sphere cleanly when at high altitude so depth buffer stays crisp
  const showCurvedEarth = altitudeM > 6_000;
  const visualScale = 1 / 1000; // 1 unit = 1 km for giant background Earth
  const earthVisualR = EARTH_RADIUS_M * visualScale; // 6,371 units
  const earthCenterY = -(EARTH_RADIUS_M + altitudeM) * visualScale;

  return (
    <>
      <color attach="background" args={[skyHex]} />

      {/* Star field fades in cleanly above ~35 km (full above 100 km), anchored to camera/origin */}
      <group ref={starsGroupRef}>
        {altitudeM > 25_000 && (
          <Stars
            radius={22_000}
            depth={8_000}
            count={starCount}
            factor={180}
            saturation={0.2}
            fade
            speed={0}
          />
        )}
      </group>

      {showCurvedEarth && (
        <group ref={earthGroupRef} position={[0, earthCenterY, 0]}>
          <mesh raycast={NO_RAYCAST}>
            <sphereGeometry args={[earthVisualR, 48, 32]} />
            <meshStandardMaterial
              color="#153e73"
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
          <mesh material={atmoMat} raycast={NO_RAYCAST}>
            <sphereGeometry args={[earthVisualR * 1.018, 40, 28]} />
          </mesh>
        </group>
      )}
    </>
  );
}
