import { useMemo } from 'react';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

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

/**
 * Launch Pad (LC-39A / SLC-40 concrete pad, flame trench, strongback tower)
 * rendered at local origin (0, 0, 0).
 */
export function LaunchPadMesh({ siteId }: { readonly siteId: string }) {
  return (
    <group position={[0, 0, 0]}>
      {/* Ground plane around pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <circleGeometry args={[1200, 48]} />
        <meshStandardMaterial color="#2a332b" roughness={0.95} />
      </mesh>
      {/* Concrete pad apron */}
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[46, 0.5, 46]} />
        <meshStandardMaterial color="#595e66" roughness={0.88} />
      </mesh>
      {/* Launch mount / flame trench */}
      <mesh position={[0, 1.6, 0]} receiveShadow>
        <boxGeometry args={[12, 3.2, 12]} />
        <meshStandardMaterial color="#3c4047" roughness={0.8} />
      </mesh>
      {/* Transporter/Erector strongback tower */}
      <mesh position={[-7.5, 32, 0]} castShadow>
        <boxGeometry args={[3.2, 64, 3.2]} />
        <meshStandardMaterial color="#4a505a" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* 4x Lightning protection towers */}
      {[
        [36, 36],
        [-36, 36],
        [36, -36],
        [-36, -36],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 42, z!]}>
          <cylinderGeometry args={[0.35, 0.8, 84, 8]} />
          <meshStandardMaterial color="#70757d" metalness={0.5} />
        </mesh>
      ))}
      {/* Subtle site marker */}
      <mesh position={[0, 0.55, 18]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.8, 24]} />
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
          <circleGeometry args={[1500, 48]} />
          <meshStandardMaterial color="#2a352c" roughness={0.95} />
        </mesh>
        {/* 86 m diameter concrete LZ-1 pad */}
        <mesh position={[0, 0.15, 0]} receiveShadow>
          <cylinderGeometry args={[43, 44, 0.3, 48]} />
          <meshStandardMaterial color="#676d75" roughness={0.9} />
        </mesh>
        {/* Target X ring */}
        <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[14, 15.8, 40]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
        <mesh position={[0, 0.36, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <planeGeometry args={[22, 1.8]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
        <mesh position={[0, 0.36, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
          <planeGeometry args={[22, 1.8]} />
          <meshBasicMaterial color="#e8eef5" />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[0, 0, 0]}>
      {/* Atlantic Ocean plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.8, 0]} receiveShadow>
        <circleGeometry args={[3500, 64]} />
        <meshStandardMaterial color="#0b2844" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* ASDS Barge hull (91 m x 52 m) */}
      <mesh position={[0, -0.9, 0]} receiveShadow>
        <boxGeometry args={[91, 2.2, 52]} />
        <meshStandardMaterial color="#20252d" roughness={0.7} metalness={0.35} />
      </mesh>
      {/* Yellow X-circle deck target */}
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[15, 16.5, 48]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[24, 1.8]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[24, 1.8]} />
        <meshBasicMaterial color="#f5c542" />
      </mesh>
    </group>
  );
}

/**
 * Curved Earth sphere + Rayleigh atmosphere halo + altitude-faded starfield.
 * Positioned dynamically below the active floating-origin vehicle.
 */
export function EarthAndSky({ altitudeM }: { readonly altitudeM: number }) {
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
  const spaceFactor = Math.min(1, Math.max(0, (altitudeM - 8_000) / 70_000));
  const skyColor = useMemo(() => {
    const low = new THREE.Color('#4a86c8');
    const mid = new THREE.Color('#0c2142');
    const high = new THREE.Color('#02040a');
    if (spaceFactor < 0.45) {
      return low.lerp(mid, spaceFactor / 0.45);
    }
    return mid.lerp(high, (spaceFactor - 0.45) / 0.55);
  }, [spaceFactor]);

  // Scale Earth sphere cleanly when at high altitude so depth buffer stays crisp
  const showCurvedEarth = altitudeM > 6_000;
  const visualScale = 1 / 1000; // 1 unit = 1 km for giant background Earth
  const earthVisualR = EARTH_RADIUS_M * visualScale; // 6,371 units
  const earthCenterY = -(EARTH_RADIUS_M + altitudeM) * visualScale;

  return (
    <>
      <color attach="background" args={[skyColor.getStyle()]} />

      {/* Star field fades in cleanly above ~35 km (full above 100 km) */}
      {altitudeM > 25_000 && (
        <Stars
          radius={22_000}
          depth={8_000}
          count={4500}
          factor={180}
          saturation={0.2}
          fade
          speed={0}
        />
      )}

      {showCurvedEarth && (
        <group position={[0, earthCenterY, 0]}>
          <mesh>
            <sphereGeometry args={[earthVisualR, 72, 48]} />
            <meshStandardMaterial
              color="#153e73"
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
          <mesh material={atmoMat}>
            <sphereGeometry args={[earthVisualR * 1.018, 64, 40]} />
          </mesh>
        </group>
      )}
    </>
  );
}
