import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface SoftParticleEmitterConfig {
  /** Number of billboard sprites (quality-tier scaled). */
  readonly count: number;
  /** RGB tint color (hex or CSS color). */
  readonly color: string;
  /** Subtle emissive/warm bounce tint (e.g. orange glow on steam near exhaust). */
  readonly glowColor?: string;
  /** Glow strength [0..1] mixed in near emitter origin. */
  readonly glowStrength?: number;
  /** Base particle lifetime in seconds. */
  readonly lifeS: number;
  /** Base sprite radius at birth (m). */
  readonly startRadiusM: number;
  /** Base sprite radius at end of life (m). */
  readonly endRadiusM: number;
  /** Peak per-sprite opacity [0..1]. */
  readonly maxOpacity: number;
  /** Soft fade height above ground/pad (m) to avoid hard floor clipping. */
  readonly softGroundFadeM?: number;
}

export interface SoftParticleUpdateArgs {
  /** Current simulation time (s). */
  readonly timeS: number;
  /** Normalized emission intensity [0..1]; <= 0 hides emitter cleanly. */
  readonly intensity: number;
  /** Horizontal drift velocity in Three.js world (X=East, Z=-North) m/s. */
  readonly windX: number;
  readonly windZ: number;
}

export interface SoftParticleSpec {
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly dirZ: number;
  readonly speed: number;
  readonly buoyancy: number;
  readonly phase: number;
  readonly radiusJitter: number;
  readonly spin: number;
}

const SOFT_PARTICLE_VERT = `
attribute vec3 aOffset;
attribute float aScale;
attribute float aAlpha;
attribute float aSeed;

uniform float uTime;

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying float vWorldY;
varying float vDistOrigin;

void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vSeed = aSeed;

  // Camera-facing view-space billboarding with per-sprite slow rotation
  float ang = aSeed * 6.2831853 + uTime * 0.18 * (mod(aSeed * 17.0, 2.0) - 1.0);
  float c = cos(ang);
  float s = sin(ang);
  vec2 rotPos = vec2(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  ) * aScale;

  vec4 worldCenter = modelMatrix * vec4(aOffset, 1.0);
  vWorldY = worldCenter.y + rotPos.y * 0.5;
  vDistOrigin = length(aOffset.xz);

  vec4 mvCenter = viewMatrix * worldCenter;
  mvCenter.xy += rotPos;
  gl_Position = projectionMatrix * mvCenter;
}
`;

const SOFT_PARTICLE_FRAG = `
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uGlowStrength;
uniform float uSoftGroundFade;

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying float vWorldY;
varying float vDistOrigin;

// Lightweight deterministic 2D wispy cloud modulation (zero texture lookups)
float wisp(vec2 p, float seed) {
  float a = sin(p.x * 5.2 + seed * 11.3) * cos(p.y * 4.7 - seed * 7.1);
  float b = sin((p.x + p.y) * 8.1 - seed * 5.7) * 0.5;
  return 0.78 + 0.22 * (a * 0.65 + b * 0.35);
}

void main() {
  if (vAlpha <= 0.002) discard;

  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r >= 1.0) discard;

  // Smooth Gaussian-like radial falloff — zero visible hard quad or sphere edges
  float radial = pow(1.0 - smoothstep(0.0, 1.0, r), 2.35);
  float cloud = wisp(centered, vSeed);

  // Soft-depth fade near ground/pad deck (y ~ 0.25..softGroundFade) so sprites never hard-clip
  float groundFade = smoothstep(-0.2, max(0.5, uSoftGroundFade), vWorldY);

  float alpha = vAlpha * radial * cloud * groundFade;
  if (alpha < 0.003) discard;

  // Warm exhaust bounce near trench origin + subtle top-to-bottom lighting gradient
  float warmMask = uGlowStrength * exp(-vDistOrigin * 0.065) * (1.0 - smoothstep(0.0, 14.0, vWorldY));
  float shade = 0.84 + 0.16 * clamp(vUv.y, 0.0, 1.0);
  vec3 col = mix(uColor * shade, uGlowColor, clamp(warmMask, 0.0, 0.75));

  gl_FragColor = vec4(col, alpha);
}
`;

const NO_RAYCAST = () => null;

/**
 * Shared GPU-billboarded soft-particle system for water deluge spray,
 * ignition steam plumes, and pre-launch LOX venting (Part C).
 *
 * Zero per-frame heap allocations: pre-allocated Float32Array instance
 * attributes updated in place inside useFrame.
 */
export function SoftParticleEmitter({
  config,
  seeds,
  getState,
}: {
  readonly config: SoftParticleEmitterConfig;
  readonly seeds: readonly SoftParticleSpec[];
  readonly getState: () => SoftParticleUpdateArgs;
}) {
  const count = Math.min(config.count, seeds.length);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const buffers = useMemo(() => {
    const offsets = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const alphas = new Float32Array(count);
    const seedAttr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seedAttr[i] = ((i * 0.61803398875) % 1);
    }
    return { offsets, scales, alphas, seedAttr };
  }, [count]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(buffers.offsets, 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(buffers.scales, 1));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(buffers.alphas, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(buffers.seedAttr, 1));
    return geo;
  }, [buffers]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SOFT_PARTICLE_VERT,
        fragmentShader: SOFT_PARTICLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(config.color) },
          uGlowColor: { value: new THREE.Color(config.glowColor ?? '#ffbe78') },
          uGlowStrength: { value: config.glowStrength ?? 0 },
          uSoftGroundFade: { value: config.softGroundFadeM ?? 2.5 },
        },
      }),
    [config.color, config.glowColor, config.glowStrength, config.softGroundFadeM]
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { timeS, intensity, windX, windZ } = getState();

    if (intensity <= 0.005) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    material.uniforms.uTime!.value = timeS;

    const life = config.lifeS;
    const offsets = buffers.offsets;
    const scales = buffers.scales;
    const alphas = buffers.alphas;

    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      // Positive deterministic cycle age in [0, 1)
      const rawT = timeS + 100.0 + s.phase * life;
      const age = ((rawT % life) + life) % life / life;
      const tAge = age * life;

      // Decelerating horizontal jet + buoyant vertical rise + wind drift
      const dragFactor = 1.0 - Math.exp(-tAge * 0.55);
      const travel = s.speed * (0.45 + 0.55 * intensity) * dragFactor * 2.2;
      const rise = s.dirY * travel + 0.5 * s.buoyancy * (0.5 + 0.8 * intensity) * tAge * tAge;

      const x = s.originX + s.dirX * travel + windX * tAge * (0.35 + 0.65 * age);
      const y = Math.max(0.3, s.originY + rise);
      const z = s.originZ + s.dirZ * travel + windZ * tAge * (0.35 + 0.65 * age);

      const i3 = i * 3;
      offsets[i3] = x;
      offsets[i3 + 1] = y;
      offsets[i3 + 2] = z;

      // Smooth slow expansion over lifetime
      const rLerp = config.startRadiusM + (config.endRadiusM - config.startRadiusM) * Math.pow(age, 0.78);
      scales[i] = rLerp * s.radiusJitter * (0.65 + 0.45 * intensity);

      // Smooth fade-in and long gentle fade-out
      const fadeIn = Math.min(1, age / 0.14);
      const fadeOut = Math.pow(Math.max(0, 1 - age), 1.35);
      alphas[i] = config.maxOpacity * intensity * fadeIn * fadeOut;
    }

    (geometry.getAttribute('aOffset') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aScale') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute).needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      visible={false}
      raycast={NO_RAYCAST}
      frustumCulled={false}
    />
  );
}
