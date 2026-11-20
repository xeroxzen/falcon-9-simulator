import { useMemo } from 'react';
import type { StageFrameSnapshot } from '../worker/protocol.js';
import { PlumeEffect } from './PlumeEffect.js';

interface Stage1MeshProps {
  readonly snapshot: StageFrameSnapshot;
  readonly separated: boolean;
}

/**
 * Geometrically accurate procedural Falcon 9 Block 5 Stage 1 Booster:
 *  - Core diameter: 3.7 m (radius 1.85 m), height: 42.6 m (incl. interstage)
 *  - 9x Merlin 1D Octaweb cluster
 *  - 4x Titanium grid fins (deploy after MECO/sep, deflect during aero descent)
 *  - 4x Carbon-fiber landing legs (deploy below 120 m)
 */
export function Stage1Mesh({ snapshot, separated }: Stage1MeshProps) {
  const outerEngineAngles = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8),
    []
  );
  const finAngles = useMemo(() => [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], []);

  const finsDeployed =
    separated &&
    snapshot.phase !== 'MECO_COAST' &&
    snapshot.phase !== 'ASCENT';
  const finDeflRad = (snapshot.gridFinDeflectionDeg * Math.PI) / 180;
  const legDeployAngle = snapshot.landingLegsDeployed ? 1.92 : 0.08;

  // Reentry heating glow during supersonic entry burn / high-Mach aero descent
  const reentryIntensity =
    separated && snapshot.mach > 2.2 && snapshot.dynamicPressurePa > 2_000
      ? Math.min(1, (snapshot.mach - 2.2) / 3.5)
      : 0;

  return (
    <group>
      {/* Octaweb dark thermal base (0..2.2 m) */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[1.86, 1.86, 2.2, 28]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.65} metalness={0.45} />
      </mesh>

      {/* Main white Stage 1 tank (2.2..36.0 m) */}
      <mesh position={[0, 19.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.85, 1.85, 33.8, 28]} />
        <meshStandardMaterial color="#e8ecf0" roughness={0.38} metalness={0.12} />
      </mesh>

      {/* Subtle reentry soot band on lower tank */}
      <mesh position={[0, 10.5, 0]}>
        <cylinderGeometry args={[1.858, 1.858, 14.0, 28]} />
        <meshStandardMaterial
          color="#2c3038"
          transparent
          opacity={separated ? 0.35 : 0.08}
          roughness={0.8}
        />
      </mesh>

      {/* LOX cable raceway */}
      <mesh position={[1.87, 19.1, 0]}>
        <boxGeometry args={[0.16, 33.5, 0.24]} />
        <meshStandardMaterial color="#252930" roughness={0.6} />
      </mesh>

      {/* Black carbon-fiber interstage (36.0..42.6 m) */}
      <mesh position={[0, 39.3, 0]} castShadow>
        <cylinderGeometry args={[1.86, 1.86, 6.6, 28]} />
        <meshStandardMaterial color="#181b20" roughness={0.55} metalness={0.25} />
      </mesh>

      {/* 9x Merlin 1D Engine Bells (center + 8 outer ring) */}
      <group position={[0, -0.35, 0]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.46, 1.35, 16, 1, true]} />
          <meshStandardMaterial
            color="#353942"
            roughness={0.4}
            metalness={0.8}
            emissive={snapshot.engines[0]?.active ? '#ff6a22' : '#000000'}
            emissiveIntensity={snapshot.engines[0]?.active ? 1.2 : 0}
          />
        </mesh>
        {outerEngineAngles.map((ang, idx) => {
          const eng = snapshot.engines[idx + 1];
          const active = eng?.active ?? false;
          const failed = eng?.failed ?? false;
          return (
            <mesh
              key={idx}
              position={[Math.cos(ang) * 1.25, 0, Math.sin(ang) * 1.25]}
            >
              <cylinderGeometry args={[0.26, 0.44, 1.3, 14, 1, true]} />
              <meshStandardMaterial
                color={failed ? '#5a2222' : '#353942'}
                roughness={0.4}
                metalness={0.8}
                emissive={active ? '#ff6a22' : '#000000'}
                emissiveIntensity={active ? 1.1 : 0}
              />
            </mesh>
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
            <mesh position={[0.95, 0, 0]}>
              <boxGeometry args={[1.65, 0.22, 1.25]} />
              <meshStandardMaterial
                color="#4d525c"
                roughness={0.45}
                metalness={0.75}
                wireframe={false}
              />
            </mesh>
          </group>
        </group>
      ))}

      {/* 4x Carbon-Fiber Landing Legs */}
      {finAngles.map((ang, i) => (
        <group
          key={i}
          position={[Math.cos(ang) * 1.88, 1.4, Math.sin(ang) * 1.88]}
          rotation={[0, -ang + Math.PI / 4, 0]}
        >
          <group rotation={[0, 0, -legDeployAngle]}>
            <mesh position={[0.22, 4.1, 0]}>
              <boxGeometry args={[0.38, 8.2, 0.72]} />
              <meshStandardMaterial color="#1a1d24" roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        </group>
      ))}

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
 * Geometrically accurate procedural Falcon 9 Stage 2 + MVac + Fairing / Crew Dragon:
 *  - Stage 2 core: 3.7 m diameter, 12.6 m height
 *  - MVac radiatively-cooled niobium bell nozzle
 *  - 5.2 m x 13.1 m composite payload fairing (or Crew Dragon capsule + trunk when hasFairing=false)
 */
export function Stage2Mesh({ snapshot, hasFairing, separated }: Stage2MeshProps) {
  const mvacActive = snapshot.activeEngineCount > 0 && snapshot.throttle > 0.01;

  return (
    <group>
      {/* MVac radiatively-cooled nozzle bell (visible after separation) */}
      {separated && (
        <mesh position={[0, -1.6, 0]}>
          <cylinderGeometry args={[0.45, 1.55, 3.1, 24, 1, true]} />
          <meshStandardMaterial
            color="#2b2d34"
            roughness={0.45}
            metalness={0.75}
            emissive={mvacActive ? '#ff4d1a' : '#000000'}
            emissiveIntensity={mvacActive ? 1.4 : 0}
          />
        </mesh>
      )}

      {/* Stage 2 white propellant tank (0..12.6 m) */}
      <mesh position={[0, 6.3, 0]} castShadow>
        <cylinderGeometry args={[1.85, 1.85, 12.6, 28]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.35} metalness={0.12} />
      </mesh>

      {/* Payload adapter + satellite bus (visible once fairing separates) */}
      {hasFairing && !snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[1.1, 1.75, 1.8, 20]} />
            <meshStandardMaterial color="#2a2f3a" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.8, 0]}>
            <boxGeometry args={[2.2, 4.2, 2.2]} />
            <meshStandardMaterial color="#d4a74a" metalness={0.75} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* 5.2 m x 13.1 m Payload Fairing */}
      {hasFairing && snapshot.fairingAttached && (
        <group position={[0, 12.6, 0]}>
          {/* Tapered boat-tail adapter */}
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[2.6, 1.85, 1.8, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          {/* Cylindrical barrel */}
          <mesh position={[0, 4.8, 0]}>
            <cylinderGeometry args={[2.6, 2.6, 6.0, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
          {/* Ogive nosecone */}
          <mesh position={[0, 10.45, 0]}>
            <coneGeometry args={[2.6, 5.3, 28]} />
            <meshStandardMaterial color="#f2f4f8" roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Crew Dragon Capsule + Trunk (when hasFairing=false, e.g., DM-1) */}
      {!hasFairing && (
        <group position={[0, 12.6, 0]}>
          {/* Trunk */}
          <mesh position={[0, 1.9, 0]}>
            <cylinderGeometry args={[1.85, 1.85, 3.8, 28]} />
            <meshStandardMaterial color="#eceff3" roughness={0.35} />
          </mesh>
          {/* Capsule gumdrop */}
          <mesh position={[0, 5.8, 0]}>
            <cylinderGeometry args={[0.95, 1.95, 4.1, 28]} />
            <meshStandardMaterial color="#f5f7fa" roughness={0.25} />
          </mesh>
          {/* Nosecone cap */}
          <mesh position={[0, 8.2, 0]}>
            <sphereGeometry args={[0.95, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#1f232b" roughness={0.4} />
          </mesh>
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
