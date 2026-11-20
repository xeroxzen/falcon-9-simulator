import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PlumeEffectProps {
  readonly throttle: number;
  readonly activeEngineCount: number;
  readonly ambientPressurePa: number;
  readonly isVacuumEngine?: boolean;
  readonly reentryIntensity?: number;
}

const NO_RAYCAST = () => null;

const PLUME_VERT = `
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

/**
 * Soft volumetric rocket exhaust shader:
 * - Zero hard cone edges (smooth Fresnel radial falloff + soft axial tip/root fade)
 * - Animated Mach-diamond shock cells at sea level, fading smoothly into a wide
 *   translucent under-expanded bell at high altitude / vacuum.
 */
const PLUME_FRAG = `
uniform float uTime;
uniform float uVacFactor;
uniform float uOpacity;
uniform float uDiamonds;
uniform vec3 uColorCore;
uniform vec3 uColorOuter;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  // vUv.y = 1.0 at nozzle exit, 0.0 at exhaust tail
  float axial = vUv.y;

  // Soft edge falloff perpendicular to view direction (eliminates hard silhouette edges)
  float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float edgeFade = pow(smoothstep(0.04, 0.78, ndotv), 1.6);

  // Soft longitudinal fade at both nozzle lip and tail tip
  float tailFade = smoothstep(0.0, 0.55, axial);
  float rootFade = smoothstep(1.0, 0.90, axial);

  // Subtle high-frequency turbulence along the plume
  float flow = sin(axial * 28.0 + uTime * 42.0) * 0.5 + 0.5;
  float turb = 0.86 + 0.14 * flow * sin(vUv.x * 18.8495 - uTime * 19.0);

  // Mach shock diamonds (prominent near sea level, absent in vacuum)
  float shock = pow(max(0.0, sin((1.0 - axial) * 26.0 - uTime * 14.0)), 4.0);
  float diamondBoost = shock * uDiamonds * (1.0 - uVacFactor) * smoothstep(0.15, 0.92, axial);

  vec3 col = mix(uColorOuter, uColorCore, pow(axial, 1.3) * 0.75 + ndotv * 0.35);
  col += uColorCore * diamondBoost * 0.95;

  float alpha = edgeFade * tailFade * rootFade * turb * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

const REENTRY_FRAG = `
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float rim = pow(1.0 - ndotv, 1.5);
  float cap = smoothstep(0.0, 0.65, 1.0 - vUv.y);
  float pulse = 0.88 + 0.12 * sin(uTime * 22.0 + vUv.x * 12.0);
  vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.72, 0.32), cap * 0.6);
  float alpha = (0.35 + 0.65 * rim) * cap * pulse * uIntensity * 0.72;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Altitude-responsive soft volumetric GLSL rocket exhaust plume + reentry plasma glow.
 *  - Tight, bright Mach-diamond core at sea level (p ~ 101 kPa)
 *  - Wide, ballooning translucent under-expanded plume at high altitude / vacuum
 */
export function PlumeEffect({
  throttle,
  activeEngineCount,
  ambientPressurePa,
  isVacuumEngine = false,
  reentryIntensity = 0,
}: PlumeEffectProps) {
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const vacFactor = 1 - Math.min(1, ambientPressurePa / 101_325);
  const isFiring = throttle > 0.01 && activeEngineCount > 0;

  // Tapered open-ended cylinder (narrow at nozzle exit, wider at tail) so the
  // volumetric shader feathers smoothly with zero hard edges.
  const innerGeo = useMemo(
    () => new THREE.CylinderGeometry(0.42, 0.95, 1, 20, 1, true),
    []
  );
  const outerGeo = useMemo(
    () => new THREE.CylinderGeometry(0.55, 1.35, 1, 24, 1, true),
    []
  );

  const innerMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uVacFactor: { value: 0 },
          uOpacity: { value: 0.9 },
          uDiamonds: { value: isVacuumEngine ? 0.0 : 1.0 },
          uColorCore: {
            value: new THREE.Color(isVacuumEngine ? '#ffd4a3' : '#fff8e6'),
          },
          uColorOuter: {
            value: new THREE.Color(isVacuumEngine ? '#ff8b42' : '#ffaa38'),
          },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [isVacuumEngine]
  );

  const outerMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uVacFactor: { value: 0 },
          uOpacity: { value: 0.45 },
          uDiamonds: { value: 0.0 },
          uColorCore: {
            value: new THREE.Color(isVacuumEngine ? '#c490ff' : '#ff9944'),
          },
          uColorOuter: {
            value: new THREE.Color(isVacuumEngine ? '#6842d4' : '#e05818'),
          },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [isVacuumEngine]
  );

  const reentryMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLUME_VERT,
        fragmentShader: REENTRY_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 0.96 + 0.04 * Math.sin(t * 48) * Math.cos(t * 31);

    innerMat.uniforms['uTime']!.value = t;
    innerMat.uniforms['uVacFactor']!.value = vacFactor;
    innerMat.uniforms['uOpacity']!.value = Math.max(0.35, 0.95 - 0.52 * vacFactor);

    outerMat.uniforms['uTime']!.value = t;
    outerMat.uniforms['uVacFactor']!.value = vacFactor;
    outerMat.uniforms['uOpacity']!.value = Math.max(0.18, 0.48 - 0.24 * vacFactor);

    reentryMat.uniforms['uTime']!.value = t;
    reentryMat.uniforms['uIntensity']!.value = reentryIntensity;

    if (innerRef.current && isFiring) {
      const baseLen = isVacuumEngine
        ? 24
        : activeEngineCount >= 7
          ? 36
          : activeEngineCount >= 3
            ? 24
            : 16;
      const len =
        baseLen * (0.55 + 0.55 * throttle) * (1 + 0.65 * vacFactor) * flicker;
      const rad =
        (isVacuumEngine ? 1.85 : activeEngineCount >= 7 ? 2.1 : 1.15) *
        (1 + 2.4 * Math.pow(vacFactor, 1.4));
      innerRef.current.scale.set(rad, len, rad);
      innerRef.current.position.y = -len * 0.5 - (isVacuumEngine ? 2.6 : 0.7);
    }

    if (outerRef.current && isFiring) {
      const baseLen = isVacuumEngine
        ? 40
        : activeEngineCount >= 7
          ? 56
          : activeEngineCount >= 3
            ? 34
            : 24;
      const len =
        baseLen * (0.6 + 0.5 * throttle) * (1 + 1.1 * vacFactor) * flicker;
      const rad =
        (isVacuumEngine ? 2.8 : activeEngineCount >= 7 ? 3.1 : 1.65) *
        (1 + 4.4 * Math.pow(vacFactor, 1.5));
      outerRef.current.scale.set(rad, len, rad);
      outerRef.current.position.y = -len * 0.5 - (isVacuumEngine ? 2.4 : 0.6);
    }

    if (glowRef.current && reentryIntensity > 0.01) {
      const s = 1 + 0.05 * Math.sin(t * 25);
      glowRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group>
      {isFiring && (
        <>
          <mesh
            ref={innerRef}
            geometry={innerGeo}
            material={innerMat}
            raycast={NO_RAYCAST}
          />
          <mesh
            ref={outerRef}
            geometry={outerGeo}
            material={outerMat}
            raycast={NO_RAYCAST}
          />
          <pointLight
            position={[0, -5, 0]}
            color="#ffae52"
            intensity={isVacuumEngine ? 12 : activeEngineCount * 5 * throttle}
            distance={120}
            decay={2}
          />
        </>
      )}

      {reentryIntensity > 0.02 && (
        <mesh
          ref={glowRef}
          position={[0, -0.2, 0]}
          material={reentryMat}
          raycast={NO_RAYCAST}
        >
          <sphereGeometry
            args={[2.75, 20, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58]}
          />
        </mesh>
      )}
    </group>
  );
}
