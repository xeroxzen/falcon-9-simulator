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

  // Falcon 9 Block 5 real deployed landing leg span = 18.0 m tip-to-tip (9.0 m radius)
  // Source: SpaceX Falcon 9 specifications / public disclosures.
  // Hinge at r_h = 1.88 m, y_h = 3.0 m; telescoping leg length L = 7.715 m:
  //   deployed angle = 1.9660 rad (112.64 deg from +Y)
  //   -> r_foot = 1.88 + 7.715 * sin(1.9660) = 9.000 m (18.0 m span)
  //   -> y_foot = 3.00 + 7.715 * cos(1.9660) = +0.030 m (flush on y=0 deck)
  const legLengthM = 7.715;
  const legDeployAngle = snapshot.landingLegsDeployed ? 1.966 : 0.06;

  // Post-entry-burn RP-1 exhaust soot builds up during ENTRY_BURN and persists
  // through AERO_DESCENT, LANDING_BURN, LANDED, and CRASHED.
  const postEntrySoot =
    snapshot.phase === 'ENTRY_BURN'
      ? 0.42
      : snapshot.phase === 'AERO_DESCENT' ||
          snapshot.phase === 'LANDING_BURN' ||
          snapshot.phase === 'LANDED' ||
          snapshot.phase === 'CRASHED'
        ? 0.62
        : 0.0;

  const reentryIntensity =
    separated && snapshot.mach > 2.2 && snapshot.dynamicPressurePa > 2_000
      ? Math.min(1, (snapshot.mach - 2.2) / 3.5)
      : 0;

  return (
    <group>
      {/* --- Visual Render Meshes (raycast disabled; y=0 is ground/deck contact datum) --- */}
      <mesh position={[0, 2.4, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.86, 1.86, 1.8, 22]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.65} metalness={0.45} />
      </mesh>

      <mesh position={[0, 19.65, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[1.85, 1.85, 32.7, 22]} />
        <meshStandardMaterial color="#e8ecf0" roughness={0.38} metalness={0.12} />
      </mesh>

      {/* Post-entry-burn RP-1 coking soot bands (absent during ascent, builds after entry burn) */}
      {postEntrySoot > 0.01 && (
        <>
          <mesh position={[0, 12.2, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.86, 1.86, 16.5, 22]} />
            <meshStandardMaterial
              color="#1e2025"
              transparent
              opacity={postEntrySoot}
              roughness={0.92}
            />
          </mesh>
          <mesh position={[0, 24.5, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.858, 1.858, 10.0, 22]} />
            <meshStandardMaterial
              color="#2b2e35"
              transparent
              opacity={postEntrySoot * 0.45}
              roughness={0.88}
            />
          </mesh>
        </>
      )}

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

      {/* 4x Carbon-Fiber Landing Legs (18.0 m deployed span; feet rest at y=+0.03 m) */}
      {finAngles.map((ang, i) => (
        <group
          key={i}
          position={[Math.cos(ang) * 1.88, 3.0, Math.sin(ang) * 1.88]}
          rotation={[0, -ang + Math.PI / 4, 0]}
        >
          <group rotation={[0, 0, -legDeployAngle]}>
            <mesh position={[0.16, legLengthM * 0.5, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.36, legLengthM, 0.72]} />
              <meshStandardMaterial color="#1a1d24" roughness={0.5} metalness={0.3} />
            </mesh>
            {/* Foot pad at tip */}
            <mesh position={[0.16, legLengthM, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.45, 0.14, 0.82]} />
              <meshStandardMaterial color="#303540" roughness={0.6} metalness={0.5} />
            </mesh>
          </group>
          {/* Telescoping A-frame upper support strut when deployed */}
          {snapshot.landingLegsDeployed && (
            <mesh
              position={[2.45, 2.3, 0]}
              rotation={[0, 0, 0.62]}
              raycast={NO_RAYCAST}
            >
              <cylinderGeometry args={[0.12, 0.14, 8.3, 8]} />
              <meshStandardMaterial color="#2a2f38" roughness={0.45} metalness={0.55} />
            </mesh>
          )}
        </group>
      ))}

      {/* --- Non-overlapping Simplified Proxy Hitboxes --- */}
      <InteractableHitbox
        componentId="landing-legs"
        label="Landing Legs"
        position={[0, 6.2, 0]}
        shape="cylinder"
        args={[
          snapshot.landingLegsDeployed ? 7.6 : 2.35,
          snapshot.landingLegsDeployed ? 9.2 : 2.35,
          6.8,
        ]}
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
          outlineArgs={[2.85, 2.85, 68.0]}
          outlineOffset={[0, 1.5, 0]}
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

      {/* Payload adapter + detailed satellite bus (visible once fairing separates) */}
      {hasFairing && !snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          {/* Payload Attach Fitting (PAF) cone */}
          <mesh position={[0, 0.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.05, 1.75, 1.8, 18]} />
            <meshStandardMaterial color="#2a2f3a" metalness={0.65} roughness={0.38} />
          </mesh>
          {/* Gold MLI thermal-blanketed satellite bus */}
          <mesh position={[0, 3.6, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[2.1, 3.6, 2.1]} />
            <meshStandardMaterial color="#d4a74a" metalness={0.78} roughness={0.28} />
          </mesh>
          {/* Stowed dark-blue photovoltaic solar array wings */}
          <mesh position={[1.22, 3.6, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.16, 3.3, 1.85]} />
            <meshStandardMaterial color="#18325e" metalness={0.5} roughness={0.25} />
          </mesh>
          <mesh position={[-1.22, 3.6, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.16, 3.3, 1.85]} />
            <meshStandardMaterial color="#18325e" metalness={0.5} roughness={0.25} />
          </mesh>
          {/* High-gain Ka-band dish antenna */}
          <mesh position={[0, 5.75, 0.25]} rotation={[0.35, 0, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.85, 0.18, 0.35, 18]} />
            <meshStandardMaterial color="#dce3ed" metalness={0.4} roughness={0.3} />
          </mesh>
          <InteractableHitbox
            componentId="payload"
            label="Payload"
            position={[0, 3.4, 0]}
            shape="box"
            args={[2.8, 5.4, 2.8]}
            labelOffset={[2.8, 1.0, 0]}
          />
        </group>
      )}

      {/* 5.2 m x 13.1 m Payload Fairing */}
      {hasFairing && snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          <mesh position={[0, 0.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[2.6, 1.85, 1.8, 22]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          <mesh position={[0, 4.8, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[2.6, 2.6, 6.0, 22]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          <mesh position={[0, 10.45, 0]} raycast={NO_RAYCAST}>
            <coneGeometry args={[2.6, 5.3, 22]} />
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

      {/* Detailed Crew Dragon Capsule + Trunk (when hasFairing=false, e.g., DM-1) */}
      {!hasFairing && (
        <group position={[0, 12.6, 0]}>
          {/* Trunk cylindrical shell (white radiator side) */}
          <mesh position={[0, 1.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.85, 1.85, 3.8, 22]} />
            <meshStandardMaterial color="#eceff3" roughness={0.35} />
          </mesh>
          {/* Trunk solar-cell array wrap (half-cylinder) */}
          <mesh position={[0, 1.9, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.87, 1.87, 3.4, 16, 1, true, 0, Math.PI]} />
            <meshStandardMaterial color="#162847" metalness={0.55} roughness={0.25} />
          </mesh>
          {/* 4x Trunk aerodynamic stabilizing fins */}
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, idx) => (
            <mesh
              key={idx}
              position={[Math.cos(a) * 2.02, 1.4, Math.sin(a) * 2.02]}
              rotation={[0, -a, 0]}
              raycast={NO_RAYCAST}
            >
              <boxGeometry args={[0.42, 2.4, 0.1]} />
              <meshStandardMaterial color="#dce2ea" roughness={0.4} />
            </mesh>
          ))}
          {/* Heatshield dark ring */}
          <mesh position={[0, 3.95, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[1.95, 1.88, 0.35, 22]} />
            <meshStandardMaterial color="#232730" roughness={0.7} />
          </mesh>
          {/* Gumdrop pressure vessel */}
          <mesh position={[0, 5.95, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.98, 1.96, 3.7, 22]} />
            <meshStandardMaterial color="#f5f7fa" roughness={0.25} />
          </mesh>
          {/* 4x SuperDraco abort thruster nacelles */}
          {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map(
            (a, idx) => (
              <mesh
                key={idx}
                position={[Math.cos(a) * 1.62, 5.1, Math.sin(a) * 1.62]}
                rotation={[0, -a, 0]}
                raycast={NO_RAYCAST}
              >
                <boxGeometry args={[0.52, 1.35, 0.45]} />
                <meshStandardMaterial color="#e2e7ee" roughness={0.32} />
              </mesh>
            )
          )}
          {/* Tinted crew windows */}
          <mesh position={[0, 6.2, 1.42]} rotation={[-0.25, 0, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.48, 0.32, 0.08]} />
            <meshStandardMaterial color="#0b1220" metalness={0.85} roughness={0.15} />
          </mesh>
          {/* Hinged nosecone cap */}
          <mesh position={[0, 7.8, 0]} raycast={NO_RAYCAST}>
            <sphereGeometry args={[0.98, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
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
