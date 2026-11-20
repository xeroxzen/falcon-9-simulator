import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PlumeEffectProps {
  readonly throttle: number;
  readonly activeEngineCount: number;
  readonly ambientPressurePa: number;
  readonly isVacuumEngine?: boolean;
  readonly reentryIntensity?: number;
}

/**
 * Altitude-responsive rocket exhaust plume + reentry plasma glow.
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

  // 0 at sea level -> 1 in vacuum
  const vacFactor = 1 - Math.min(1, ambientPressurePa / 101_325);
  const isFiring = throttle > 0.01 && activeEngineCount > 0;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 0.94 + 0.06 * Math.sin(t * 48) * Math.cos(t * 31);

    if (innerRef.current && isFiring) {
      const baseLen = isVacuumEngine
        ? 22
        : activeEngineCount >= 7
          ? 34
          : activeEngineCount >= 3
            ? 22
            : 15;
      const len = baseLen * (0.55 + 0.55 * throttle) * (1 + 0.65 * vacFactor) * flicker;
      const rad =
        (isVacuumEngine ? 1.7 : activeEngineCount >= 7 ? 2.0 : 1.1) *
        (1 + 2.6 * Math.pow(vacFactor, 1.4));
      innerRef.current.scale.set(rad, len, rad);
      innerRef.current.position.y = -len * 0.5 - (isVacuumEngine ? 2.6 : 1.1);
    }

    if (outerRef.current && isFiring) {
      const baseLen = isVacuumEngine
        ? 36
        : activeEngineCount >= 7
          ? 52
          : activeEngineCount >= 3
            ? 32
            : 22;
      const len = baseLen * (0.6 + 0.5 * throttle) * (1 + 1.1 * vacFactor) * flicker;
      const rad =
        (isVacuumEngine ? 2.6 : activeEngineCount >= 7 ? 2.8 : 1.5) *
        (1 + 4.8 * Math.pow(vacFactor, 1.5));
      outerRef.current.scale.set(rad, len, rad);
      outerRef.current.position.y = -len * 0.5 - (isVacuumEngine ? 2.4 : 1.0);
    }

    if (glowRef.current && reentryIntensity > 0.01) {
      const s = 1 + 0.06 * Math.sin(t * 25);
      glowRef.current.scale.set(s, s, s);
    }
  });

  const innerColor = isVacuumEngine
    ? '#ffb470'
    : vacFactor > 0.7
      ? '#ffd7a8'
      : '#fff4d6';
  const outerColor = isVacuumEngine
    ? '#8c6bff'
    : vacFactor > 0.6
      ? '#ff8c42'
      : '#ff9d2e';

  return (
    <group>
      {isFiring && (
        <>
          <mesh ref={innerRef} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[1, 1, 16, 1, true]} />
            <meshBasicMaterial
              color={innerColor}
              transparent
              opacity={Math.max(0.28, 0.92 - 0.55 * vacFactor)}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={outerRef} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[1, 1, 20, 1, true]} />
            <meshBasicMaterial
              color={outerColor}
              transparent
              opacity={Math.max(0.14, 0.45 - 0.25 * vacFactor)}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            position={[0, -5, 0]}
            color="#ffae52"
            intensity={isVacuumEngine ? 12 : activeEngineCount * 6 * throttle}
            distance={120}
            decay={2}
          />
        </>
      )}

      {reentryIntensity > 0.02 && (
        <mesh ref={glowRef} position={[0, -0.4, 0]}>
          <sphereGeometry args={[2.55, 20, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55]} />
          <meshBasicMaterial
            color="#ff551a"
            transparent
            opacity={Math.min(0.75, reentryIntensity * 0.7)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
