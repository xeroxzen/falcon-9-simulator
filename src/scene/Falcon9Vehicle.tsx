import { useMemo } from 'react';
import type { StageFrameSnapshot } from '../worker/protocol.js';
import { InteractableHitbox } from './InteractableHitbox.js';
import { PlumeEffect } from './PlumeEffect.js';

interface Stage1MeshProps {
  readonly snapshot: StageFrameSnapshot;
  readonly separated: boolean;
}

const NO_RAYCAST = () => null;

/**
 * Geometrically accurate procedural Falcon 9 Block 5 Stage 1 Booster with
 * simplified proxy hitboxes for every inspectable component (raycasting disabled
 * on render meshes so picking is fast and reliable even at 100x playback).
 */
export function Stage1Mesh({ snapshot, separated }: Stage1MeshProps) {
  const outerEngineAngles = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8),
    []
  );
  const finAngles = useMemo(
    () => [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2],
    []
  );

  const finsDeployed =
    separated &&
    snapshot.phase !== 'MECO_COAST' &&
    snapshot.phase !== 'ASCENT';
  const finDeflRad = (snapshot.gridFinDeflectionDeg * Math.PI) / 180;
  const legDeployAngle = snapshot.landingLegsDeployed ? 1.89 : 0.08;

  const reentryIntensity =
    separated && snapshot.mach > 2.2 && snapshot.dynamicPressurePa > 2_000
      ? Math.min(1, (snapshot.mach - 2.2) / 3.5)
      : 0;

  return (
    <group>
      {/* --- Visual Render Meshes (raycast disabled; y=0 is ground/deck contact datum) --- */}
      <mesh position={[0, 2.4, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.86, 1.86, 1.8, 28]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.65} metalness={0.45} />
      </mesh>

      <mesh position={[0, 19.65, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.85, 1.85, 32.7, 28]} />
        <meshStandardMaterial color="#e8ecf0" roughness={0.38} metalness={0.12} />
      </mesh>

      <mesh position={[0, 11.2, 0]} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.858, 1.858, 13.5, 28]} />
        <meshStandardMaterial
          color="#2c3038"
          transparent
          opacity={separated ? 0.35 : 0.08}
          roughness={0.8}
        />
      </mesh>

      <mesh position={[1.87, 19.65, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[0.16, 32.5, 0.24]} />
        <meshStandardMaterial color="#252930" roughness={0.6} />
      </mesh>

      <mesh position={[0, 39.3, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.86, 1.86, 6.6, 28]} />
        <meshStandardMaterial color="#181b20" roughness={0.55} metalness={0.25} />
      </mesh>

      {/* Cold-gas nitrogen RCS thruster pods */}
      <mesh position={[1.95, 37.2, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[0.35, 0.65, 0.5]} />
        <meshStandardMaterial color="#8a93a2" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-1.95, 37.2, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[0.35, 0.65, 0.5]} />
        <meshStandardMaterial color="#8a93a2" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* 9x Merlin 1D Engine Bells (bottom at y=0.30 m above ground datum) */}
      <group position={[0, 0.95, 0]}>
        <mesh position={[0, 0, 0]} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.28, 0.46, 1.3, 16, 1, true]} />
          <meshStandardMaterial
            color="#353942"
            roughness={0.4}
            metalness={0.8}
            emissive={snapshot.engines[0]?.active ? '#ff6a22' : '#000000'}
            emissiveIntensity={snapshot.engines[0]?.active ? 1.2 : 0}
          />
        </mesh>
        <InteractableHitbox
          componentId="merlin-1d"
          engineIndex={0}
          label="Merlin 1D #1"
          position={[0, -0.5, 0]}
          shape="cylinder"
          args={[1.95, 1.95, 1.8]}
          labelOffset={[0, -1.8, 0]}
        />

        {outerEngineAngles.map((ang, idx) => {
          const eng = snapshot.engines[idx + 1];
          const active = eng?.active ?? false;
          const failed = eng?.failed ?? false;
          const ex = Math.cos(ang) * 1.25;
          const ez = Math.sin(ang) * 1.25;
          return (
            <group key={idx} position={[ex, 0, ez]}>
              <mesh raycast={NO_RAYCAST}>
                <cylinderGeometry args={[0.26, 0.44, 1.25, 14, 1, true]} />
                <meshStandardMaterial
                  color={failed ? '#5a2222' : '#353942'}
                  roughness={0.4}
                  metalness={0.8}
                  emissive={active ? '#ff6a22' : '#000000'}
                  emissiveIntensity={active ? 1.1 : 0}
                />
              </mesh>
              <InteractableHitbox
                componentId="merlin-1d"
                engineIndex={idx + 1}
                label={`M1D #${idx + 2}`}
                shape="cylinder"
                args={[0.52, 0.52, 1.4]}
              />
            </group>
          );
        })}
      </group>

      {/* 4x Titanium Grid Fins */}
      {finAngles.map((ang, i) => (
        <group
          key={i}
          position={[Math.cos(ang) * 1.92, 39.4, Math.sin(ang) * 1.92]}
          rotation={[0, -ang, 0]}
        >
          <group
            rotation={[
              finDeflRad * (i % 2 === 0 ? 1 : -1) * 0.5,
              0,
              finsDeployed ? 0 : Math.PI * 0.48,
            ]}
          >
            <mesh position={[0.95, 0, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[1.65, 0.22, 1.25]} />
              <meshStandardMaterial
                color="#4d525c"
                roughness={0.45}
                metalness={0.75}
              />
            </mesh>
          </group>
        </group>
      ))}

      {/* 4x Carbon-Fiber Landing Legs (hinged at y=2.6 m -> deployed feet rest at y=+0.03 m) */}
      {finAngles.map((ang, i) => (
        <group
          key={i}
          position={[Math.cos(ang) * 1.88, 2.6, Math.sin(ang) * 1.88]}
          rotation={[0, -ang + Math.PI / 4, 0]}
        >
          <group rotation={[0, 0, -legDeployAngle]}>
            <mesh position={[0.22, 4.1, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.38, 8.2, 0.72]} />
              <meshStandardMaterial color="#1a1d24" roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        </group>
      ))}

      {/* --- Non-overlapping Simplified Proxy Hitboxes --- */}
      <InteractableHitbox
        componentId="landing-legs"
        label="Landing Legs"
        position={[0, 6.2, 0]}
        shape="cylinder"
        args={[snapshot.landingLegsDeployed ? 7.2 : 2.35, snapshot.landingLegsDeployed ? 8.8 : 2.35, 6.8]}
        labelOffset={[-3.6, 0, 0]}
      />
      <InteractableHitbox
        componentId="stage1"
        label="Stage 1 Booster"
        position={[0, 20.0, 0]}
        shape="cylinder"
        args={[2.15, 2.15, 19.0]}
        labelOffset={[3.2, 0, 0]}
      />
      {!separated && (
        <InteractableHitbox
          componentId="falcon9-stack"
          label="Falcon 9 Stack"
          position={[0, 32.8, 0]}
          shape="cylinder"
          args={[2.2, 2.2, 5.2]}
          labelOffset={[3.5, 0, 0]}
        />
      )}
      <InteractableHitbox
        componentId="interstage"
        label="Interstage"
        position={[0, 37.8, 0]}
        shape="cylinder"
        args={[2.15, 2.15, 3.2]}
        labelOffset={[-3.4, 0, 0]}
      />
      <InteractableHitbox
        componentId="grid-fins"
        label="Grid Fins"
        position={[0, 40.6, 0]}
        shape="cylinder"
        args={[3.6, 3.6, 2.2]}
        labelOffset={[4.2, 1.2, 0]}
      />
      <InteractableHitbox
        componentId="cold-gas-thrusters"
        label="Cold-Gas RCS"
        position={[3.0, 37.2, 0]}
        shape="box"
        args={[1.6, 2.0, 2.0]}
        labelOffset={[2.4, 0, 0]}
      />

      <PlumeEffect
        throttle={snapshot.throttle}
        activeEngineCount={snapshot.activeEngineCount}
        ambientPressurePa={snapshot.ambientPressurePa}
        reentryIntensity={reentryIntensity}
      />
    </group>
  );
}

interface Stage2MeshProps {
  readonly snapshot: StageFrameSnapshot;
  readonly hasFairing: boolean;
  readonly separated: boolean;
}

/**
 * Geometrically accurate procedural Falcon 9 Stage 2 + MVac + Fairing / Payload
 * with simplified proxy hitboxes.
 */
export function Stage2Mesh({ snapshot, hasFairing, separated }: Stage2MeshProps) {
  const mvacActive = snapshot.activeEngineCount > 0 && snapshot.throttle > 0.01;

  return (
    <group>
      {/* MVac radiatively-cooled nozzle bell (visible after separation) */}
      {separated && (
        <>
          <mesh position={[0, -1.6, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.45, 1.55, 3.1, 24, 1, true]} />
            <meshStandardMaterial
              color="#2b2d34"
              roughness={0.45}
              metalness={0.75}
              emissive={mvacActive ? '#ff4d1a' : '#000000'}
              emissiveIntensity={mvacActive ? 1.4 : 0}
            />
          </mesh>
          <InteractableHitbox
            componentId="mvac"
            label="MVac Engine"
            position={[0, -1.6, 0]}
            shape="cylinder"
            args={[1.65, 1.8, 3.4]}
            labelOffset={[3.0, -0.5, 0]}
          />
        </>
      )}

      {/* Stage 2 white propellant tank (0..12.6 m) */}
      <mesh position={[0, 6.3, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.85, 1.85, 12.6, 28]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.35} metalness={0.12} />
      </mesh>
      <InteractableHitbox
        componentId="stage2"
        label="Stage 2"
        position={[0, 6.3, 0]}
        shape="cylinder"
        args={[2.15, 2.15, 12.0]}
        labelOffset={[3.2, 0, 0]}
      />

      {/* Payload adapter + satellite bus (visible once fairing separates) */}
      {hasFairing && !snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          <mesh position={[0, 0.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.1, 1.75, 1.8, 20]} />
            <meshStandardMaterial color="#2a2f3a" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.8, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[2.2, 4.2, 2.2]} />
            <meshStandardMaterial color="#d4a74a" metalness={0.75} roughness={0.3} />
          </mesh>
          <InteractableHitbox
            componentId="payload"
            label="Payload"
            position={[0, 3.4, 0]}
            shape="box"
            args={[2.8, 5.2, 2.8]}
            labelOffset={[2.8, 1.0, 0]}
          />
        </group>
      )}

      {/* 5.2 m x 13.1 m Payload Fairing */}
      {hasFairing && snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          <mesh position={[0, 0.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[2.6, 1.85, 1.8, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          <mesh position={[0, 4.8, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[2.6, 2.6, 6.0, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          <mesh position={[0, 10.45, 0]} raycast={NO_RAYCAST}>
            <coneGeometry args={[2.6, 5.3, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          <InteractableHitbox
            componentId="fairing"
            label="Payload Fairing"
            position={[0, 6.5, 0]}
            shape="cylinder"
            args={[2.85, 2.85, 13.0]}
            labelOffset={[3.6, 1.0, 0]}
          />
        </group>
      )}

      {/* Crew Dragon Capsule + Trunk (when hasFairing=false, e.g., DM-1) */}
      {!hasFairing && (
        <group position={[0, 12.6, 0]}>
          <mesh position={[0, 1.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.85, 1.85, 3.8, 28]} />
            <meshStandardMaterial color="#eceff3" roughness={0.35} />
          </mesh>
          <mesh position={[0, 5.8, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.95, 1.95, 4.1, 28]} />
            <meshStandardMaterial color="#f5f7fa" roughness={0.25} />
          </mesh>
          <mesh position={[0, 8.2, 0]} raycast={NO_RAYCAST}>
            <sphereGeometry args={[0.95, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#1f232b" roughness={0.4} />
          </mesh>
          <InteractableHitbox
            componentId="payload"
            label="Crew Dragon"
            position={[0, 4.6, 0]}
            shape="cylinder"
            args={[2.1, 2.1, 9.0]}
            labelOffset={[3.2, 1.0, 0]}
          />
        </group>
      )}

      {separated && (
        <PlumeEffect
          throttle={snapshot.throttle}
          activeEngineCount={snapshot.activeEngineCount}
          ambientPressurePa={snapshot.ambientPressurePa}
          isVacuumEngine
        />
      )}
    </group>
  );
}
