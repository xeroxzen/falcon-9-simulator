import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { liveSimClock, type QualityTier } from '../store/simStore.js';
import { InteractableHitbox } from './InteractableHitbox.js';

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

const DELUGE_COUNTS: Record<QualityTier, number> = {
  low: 16,
  med: 32,
  high: 48,
};

/**
 * Water deluge & flame-trench steam plume (T-5 s to T+9 s).
 * Instanced translucent puffs erupting out of the trench sides, zero per-frame allocations.
 */
function WaterDelugeEffect({ qualityTier }: { readonly qualityTier: QualityTier }) {
  const count = DELUGE_COUNTS[qualityTier];
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const seeds = useMemo(() => {
    const arr: Array<{
      angle: number;
      speed: number;
      phase: number;
      rise: number;
      baseScale: number;
    }> = [];
    for (let i = 0; i < count; i++) {
      // Concentrate jets along the 2 main flame-trench exits (+X/-X) and secondary +/-Z
      const sector = i % 4;
      const baseAngle = sector * (Math.PI / 2);
      const jitter = (((i * 73) % 100) / 100 - 0.5) * 0.55;
      arr.push({
        angle: baseAngle + jitter,
        speed: 14 + ((i * 37) % 18),
        phase: (i / count) * 2.4,
        rise: 2.5 + ((i * 29) % 10) * 0.65,
        baseScale: 2.0 + ((i * 19) % 10) * 0.25,
      });
    }
    return arr;
  }, [count]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = liveSimClock.timeS;

    // Active from T-5 s (water deluge start) through T+9 s (pad clear)
    if (t < -5.0 || t > 9.0) {
      mesh.visible = false;
      return;
    }

    // Pre-ignition deluge spray (T-5..-3s: 0->0.35), ignition surge (T-3..+3s: 0.35->1.0), fade (+3..+9s)
    let intensity: number;
    if (t < -3.0) {
      intensity = 0.35 * Math.min(1, Math.max(0, (t + 5.0) / 2.0));
    } else if (t <= 3.0) {
      const surge = Math.min(1, Math.max(0, (t + 3.0) / 1.8));
      intensity = 0.35 + 0.65 * surge;
    } else {
      intensity = Math.max(0, 1.0 - (t - 3.0) / 6.0);
    }

    mesh.visible = intensity > 0.01;
    if (!mesh.visible) return;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.42 * intensity;

    const cycleLen = 2.4;
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const age = (((t + 10.0) + s.phase) % cycleLen) / cycleLen; // 0..1
      const dist = 4.5 + age * s.speed * (0.65 + 0.7 * intensity);
      const y = 1.6 + age * age * s.rise * (0.7 + 1.2 * intensity);
      const scale = s.baseScale * (0.45 + 1.55 * age) * (0.55 + 0.65 * intensity) * (1 - 0.3 * age);

      dummy.position.set(
        Math.cos(s.angle) * dist,
        y,
        Math.sin(s.angle) * dist
      );
      dummy.scale.set(scale * 1.15, scale * 0.85, scale * 1.15);
      dummy.rotation.set(age * 1.2, s.angle, age * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      visible={false}
      raycast={NO_RAYCAST}
      frustumCulled={false}
    >
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        color="#eef4fb"
        emissive="#a8bed6"
        emissiveIntensity={0.22}
        roughness={0.95}
        transparent
        opacity={0.38}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * Launch Pad (LC-39A / SLC-40 / SLC-4E concrete pad, flame trench, 4x hold-down clamps,
 * strongback tower, and water deluge system) rendered at local origin (0, 0, 0).
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
  // Strongback retracts smoothly from ~18 deg pre-ignition to ~20 deg at T-0,
  // then throws back to ~40 deg during T+0..3 s — never intersects the vehicle.
  const preRetract = Math.min(1, Math.max(0, (timeS + 3.0) / 3.0));
  const throwFrac = Math.min(1, Math.max(0, timeS / 3.0));
  const retractAngleRad = 0.22 + 0.13 * preRetract + 0.33 * throwFrac;

  // 4x hold-down clamps: engaged inward for t < 0, swing open rapidly at T+0..0.4 s
  const clampOpenFrac = Math.min(1, Math.max(0, timeS / 0.4));
  const clampAngleRad = 0.15 - 1.05 * clampOpenFrac;

  return (
    <group position={[0, 0, 0]}>
      {/* Ground plane around pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow raycast={NO_RAYCAST}>
        <circleGeometry args={[1200, 36]} />
        <meshStandardMaterial color="#2a332b" roughness={0.95} />
      </mesh>
      {/* Concrete pad apron */}
      <mesh position={[0, 0.25, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[46, 0.5, 46]} />
        <meshStandardMaterial color="#595e66" roughness={0.88} />
      </mesh>
      {/* Launch mount / flame trench */}
      <mesh position={[0, 1.6, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[12, 3.2, 12]} />
        <meshStandardMaterial color="#3c4047" roughness={0.8} />
      </mesh>
      {/* 4x Hold-down clamps around Stage 1 base (release at T = 0) */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((az, idx) => (
        <group key={idx} rotation={[0, az, 0]}>
          <group position={[2.35, 3.1, 0]} rotation={[0, 0, clampAngleRad]}>
            <mesh position={[0, 0.65, 0]} raycast={NO_RAYCAST}>
              <boxGeometry args={[0.45, 1.5, 0.55]} />
              <meshStandardMaterial color="#8f98a6" metalness={0.75} roughness={0.35} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Water deluge & trench steam plume (T-5 s .. T+9 s) */}
      <WaterDelugeEffect qualityTier={qualityTier} />
      {/* Transporter/Erector strongback tower — hinged at base, retracted away in -X */}
      <group position={[-7.5, 2.0, 0]} rotation={[0, 0, retractAngleRad]}>
        <mesh position={[0, 31, 0]} castShadow raycast={NO_RAYCAST}>
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
        <mesh key={i} position={[x!, 42, z!]} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.35, 0.8, 84, 8]} />
          <meshStandardMaterial color="#70757d" metalness={0.5} />
        </mesh>
      ))}
      {/* Subtle site marker */}
      <mesh position={[0, 0.55, 18]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[1.2, 1.8, 20]} />
        <meshBasicMaterial color={siteId === 'LC-39A' ? '#4ea1ff' : '#ffd166'} />
      </mesh>
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
          label="Landing Zone (LZ-1)"
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
