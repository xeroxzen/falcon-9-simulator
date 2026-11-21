import { useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';
import { useSimStore } from '../store/simStore.js';
import { registerDebugHitbox } from './debugBridge.js';

interface InteractableHitboxProps {
  readonly componentId: string;
  readonly engineIndex?: number;
  readonly label: string;
  readonly position?: readonly [number, number, number];
  readonly shape: 'cylinder' | 'box';
  /** Cylinder: [radiusTop, radiusBottom, height]; Box: [width, height, depth] */
  readonly args: readonly [number, number, number];
  /** Optional custom outline dimensions (e.g. full-stack outline wrapping entire vehicle) */
  readonly outlineArgs?: readonly [number, number, number];
  readonly outlineOffset?: readonly [number, number, number];
  readonly labelOffset?: readonly [number, number, number];
}

/**
 * Simplified invisible proxy hitbox for reliable raycasting even at 100x playback
 * and in Split View. Renders a glowing hover/selection outline and optional
 * toggleable 3D hotspot label pin.
 */
export function InteractableHitbox({
  componentId,
  engineIndex,
  label,
  position = [0, 0, 0],
  shape,
  args,
  outlineArgs,
  outlineOffset = [0, 0, 0],
  labelOffset = [0, 0, 0],
}: InteractableHitboxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const outlineRef = useRef<THREE.Mesh>(null);
  const selected = useSimStore((s) => s.selectedComponent);
  const hovered = useSimStore((s) => s.hoveredComponent);
  const showHotspots = useSimStore((s) => s.showHotspots);
  const selectComponent = useSimStore((s) => s.selectComponent);
  const hoverComponent = useSimStore((s) => s.hoverComponent);

  useEffect(() => {
    registerDebugHitbox(componentId, engineIndex, meshRef.current, outlineRef.current);
    return () => registerDebugHitbox(componentId, engineIndex, null, null);
  }, [componentId, engineIndex]);

  const isSelected =
    selected?.componentId === componentId &&
    selected?.engineIndex === engineIndex;
  const isCoarseOrPhone =
    typeof window !== 'undefined' &&
    (window.innerWidth <= 600 ||
      (window.innerHeight <= 500 && window.innerWidth <= 950) ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches));
  const isHovered =
    !isCoarseOrPhone &&
    hovered?.componentId === componentId &&
    hovered?.engineIndex === engineIndex;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectComponent({ componentId, engineIndex });
  };

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    if (isCoarseOrPhone || e.pointerType !== 'mouse') return;
    e.stopPropagation();
    hoverComponent({ componentId, engineIndex });
    document.body.style.cursor = 'pointer';
  };

  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    if (isCoarseOrPhone || e.pointerType !== 'mouse') return;
    e.stopPropagation();
    hoverComponent(null);
    document.body.style.cursor = 'auto';
  };

  return (
    <group position={[position[0], position[1], position[2]]}>
      {/* Invisible proxy hitbox */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        {shape === 'cylinder' ? (
          <cylinderGeometry args={[args[0], args[1], args[2], 14]} />
        ) : (
          <boxGeometry args={[args[0], args[1], args[2]]} />
        )}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Hover / Selection Outline (always mounted with visible toggle so bounds can be queried) */}
      <mesh
        ref={outlineRef}
        visible={isHovered || isSelected}
        raycast={() => null}
        position={[outlineOffset[0], outlineOffset[1], outlineOffset[2]]}
        scale={[1.04, 1.01, 1.04]}
      >
        {shape === 'cylinder' ? (
          <cylinderGeometry
            args={[
              (outlineArgs ?? args)[0],
              (outlineArgs ?? args)[1],
              (outlineArgs ?? args)[2],
              16,
            ]}
          />
        ) : (
          <boxGeometry
            args={[
              (outlineArgs ?? args)[0],
              (outlineArgs ?? args)[1],
              (outlineArgs ?? args)[2],
            ]}
          />
        )}
        <meshBasicMaterial
          color={isSelected ? '#38bdf8' : '#7dd3fc'}
          wireframe
          transparent
          opacity={isSelected ? 0.85 : 0.55}
          depthWrite={false}
        />
      </mesh>

      {/* Toggleable 3D Hotspot Label Pin */}
      {showHotspots && (
        <Html
          position={[labelOffset[0], labelOffset[1], labelOffset[2]]}
          center
          distanceFactor={95}
          style={{ pointerEvents: 'auto' }}
        >
          <button
            className={`hotspot-pin ${isSelected ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              selectComponent({ componentId, engineIndex });
            }}
          >
            {label}
          </button>
        </Html>
      )}
    </group>
  );
}
