import type { GeodeticCoord, OrbitalElements, Vec3 } from './types.js';
import {
  DEG_TO_RAD,
  EARTH_E2,
  EARTH_MU,
  EARTH_OMEGA_RAD_S,
  EARTH_RADIUS_EQUATORIAL_M,
  EARTH_RADIUS_MEAN_M,
  RAD_TO_DEG,
} from './config/constants.js';

// ---------------------------------------------------------------------------
// Pure deterministic Vec3 helpers
// ---------------------------------------------------------------------------

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function normSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function norm(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vec3): Vec3 {
  const n = norm(v);
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Angle between two vectors in radians, safe against floating-point overshoot.
 */
export function angleBetweenRad(a: Vec3, b: Vec3): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  const c = clamp(dot(a, b) / (na * nb), -1, 1);
  return Math.acos(c);
}

/**
 * Slew unit vector `current` toward unit vector `target` by at most `maxAngleRad`.
 */
export function slewUnitVector(
  current: Vec3,
  target: Vec3,
  maxAngleRad: number
): Vec3 {
  const uCur = normalize(current);
  const uTgt = normalize(target);
  const angle = angleBetweenRad(uCur, uTgt);
  if (angle <= maxAngleRad || angle < 1e-12) {
    return uTgt;
  }
  // Rodrigues / SLERP on unit sphere
  const sinAngle = Math.sin(angle);
  const w1 = Math.sin(angle - maxAngleRad) / sinAngle;
  const w2 = Math.sin(maxAngleRad) / sinAngle;
  return normalize({
    x: uCur.x * w1 + uTgt.x * w2,
    y: uCur.y * w1 + uTgt.y * w2,
    z: uCur.z * w1 + uTgt.z * w2,
  });
}

// ---------------------------------------------------------------------------
// WGS-84 Coordinate Transforms: Geodetic <-> ECEF <-> ECI <-> Local ENU
// ---------------------------------------------------------------------------

/**
 * Convert WGS-84 geodetic coordinates to ECEF position (meters).
 */
export function geodeticToEcef(coord: GeodeticCoord): Vec3 {
  const sinLat = Math.sin(coord.latRad);
  const cosLat = Math.cos(coord.latRad);
  const sinLon = Math.sin(coord.lonRad);
  const cosLon = Math.cos(coord.lonRad);
  const N =
    EARTH_RADIUS_EQUATORIAL_M / Math.sqrt(1.0 - EARTH_E2 * sinLat * sinLat);
  const rHoriz = (N + coord.altitudeM) * cosLat;
  return {
    x: rHoriz * cosLon,
    y: rHoriz * sinLon,
    z: (N * (1.0 - EARTH_E2) + coord.altitudeM) * sinLat,
  };
}

/**
 * Convert ECEF position (meters) to WGS-84 geodetic coordinates.
 * Iterative Bowring-initialized solver (converges to <1e-12 rad in 5 steps).
 */
export function ecefToGeodetic(rEcef: Vec3): GeodeticCoord {
  const p = Math.sqrt(rEcef.x * rEcef.x + rEcef.y * rEcef.y);
  const lonRad = Math.atan2(rEcef.y, rEcef.x);

  if (p < 1e-9) {
    const latRad = rEcef.z >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const polarR = EARTH_RADIUS_EQUATORIAL_M * Math.sqrt(1.0 - EARTH_E2);
    return { latRad, lonRad: 0, altitudeM: Math.abs(rEcef.z) - polarR };
  }

  let lat = Math.atan2(rEcef.z, p * (1.0 - EARTH_E2));
  let N = EARTH_RADIUS_EQUATORIAL_M;
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    N =
      EARTH_RADIUS_EQUATORIAL_M / Math.sqrt(1.0 - EARTH_E2 * sinLat * sinLat);
    const nextLat = Math.atan2(rEcef.z + EARTH_E2 * N * sinLat, p);
    if (Math.abs(nextLat - lat) < 1e-13) {
      lat = nextLat;
      break;
    }
    lat = nextLat;
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  N = EARTH_RADIUS_EQUATORIAL_M / Math.sqrt(1.0 - EARTH_E2 * sinLat * sinLat);
  const altitudeM =
    Math.abs(cosLat) > 1e-6
      ? p / cosLat - N
      : rEcef.z / sinLat - N * (1.0 - EARTH_E2);

  return { latRad: lat, lonRad, altitudeM };
}

/**
 * Rotate vector around +Z axis by angle theta (rad).
 */
export function rotateZ(v: Vec3, thetaRad: number): Vec3 {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return {
    x: c * v.x - s * v.y,
    y: s * v.x + c * v.y,
    z: v.z,
  };
}

/**
 * Convert ECEF vector to ECI at mission elapsed time `t` (with GMST=0 at t=0).
 */
export function ecefToEci(vEcef: Vec3, timeS: number): Vec3 {
  return rotateZ(vEcef, EARTH_OMEGA_RAD_S * timeS);
}

/**
 * Convert ECI vector to ECEF at mission elapsed time `t`.
 */
export function eciToEcef(vEci: Vec3, timeS: number): Vec3 {
  return rotateZ(vEci, -EARTH_OMEGA_RAD_S * timeS);
}

/**
 * Earth rotational velocity omega x r at an ECI position r (m/s).
 */
export function earthRotationVelocityEci(rEci: Vec3): Vec3 {
  return {
    x: -EARTH_OMEGA_RAD_S * rEci.y,
    y: EARTH_OMEGA_RAD_S * rEci.x,
    z: 0,
  };
}

export interface EnuBasis {
  readonly east: Vec3;
  readonly north: Vec3;
  readonly up: Vec3;
}

/**
 * Local ENU unit basis vectors in ECEF at geodetic (latRad, lonRad).
 */
export function localEnuBasisEcef(latRad: number, lonRad: number): EnuBasis {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  return {
    east: { x: -sinLon, y: cosLon, z: 0 },
    north: { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat },
    up: { x: cosLat * cosLon, y: cosLat * sinLon, z: sinLat },
  };
}

/**
 * Local ENU unit basis vectors in ECI at geodetic (latRad, lonRad) and time t.
 */
export function localEnuBasisEci(
  latRad: number,
  lonRad: number,
  timeS: number
): EnuBasis {
  const ecef = localEnuBasisEcef(latRad, lonRad);
  return {
    east: ecefToEci(ecef.east, timeS),
    north: ecefToEci(ecef.north, timeS),
    up: ecefToEci(ecef.up, timeS),
  };
}

/**
 * Convert a local ENU vector (east, north, up) to ECI using the given ECI ENU basis.
 */
export function enuToEci(
  east: number,
  north: number,
  up: number,
  basis: EnuBasis
): Vec3 {
  return {
    x: east * basis.east.x + north * basis.north.x + up * basis.up.x,
    y: east * basis.east.y + north * basis.north.y + up * basis.up.y,
    z: east * basis.east.z + north * basis.north.z + up * basis.up.z,
  };
}

/**
 * Compute Earth-rotation-compensated launch azimuth (degrees clockwise from North)
 * for an ascending (northeast) or descending (southward, e.g. Vandenberg) launch.
 */
export function computeLaunchAzimuthDeg(
  launchLatDeg: number,
  targetInclinationDeg: number,
  targetOrbitAltitudeM: number,
  descending = false
): number {
  const latRad = launchLatDeg * DEG_TO_RAD;
  const incRad = targetInclinationDeg * DEG_TO_RAD;
  const sinAzInertial = clamp(Math.cos(incRad) / Math.cos(latRad), -1, 1);
  const baseAz = Math.asin(sinAzInertial); // [-pi/2, +pi/2]
  const azInertial = descending ? Math.PI - baseAz : baseAz;

  const vOrb = Math.sqrt(
    EARTH_MU / (EARTH_RADIUS_EQUATORIAL_M + targetOrbitAltitudeM)
  );
  const vEarth =
    EARTH_OMEGA_RAD_S * EARTH_RADIUS_EQUATORIAL_M * Math.cos(latRad);

  const vEast = vOrb * Math.sin(azInertial) - vEarth;
  const vNorth = vOrb * Math.cos(azInertial);
  const azRad = Math.atan2(vEast, vNorth);
  return ((azRad * RAD_TO_DEG) + 360) % 360;
}

/**
 * Great-circle surface downrange distance (meters) between two geodetic points
 * on the mean Earth sphere.
 */
export function greatCircleDistanceM(
  lat1Rad: number,
  lon1Rad: number,
  lat2Rad: number,
  lon2Rad: number
): number {
  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_MEAN_M * c;
}

/**
 * Compute classical Keplerian orbital elements from ECI position and velocity.
 */
export function computeOrbitalElements(
  rEci: Vec3,
  vEci: Vec3
): OrbitalElements {
  const r = norm(rEci);
  const v2 = normSq(vEci);
  const specificEnergyJKg = 0.5 * v2 - EARTH_MU / r;
  const semiMajorAxisM = -EARTH_MU / (2 * specificEnergyJKg);

  const hVec = cross(rEci, vEci);
  const hMag = norm(hVec);
  const inclinationDeg =
    hMag > 1e-9 ? Math.acos(clamp(hVec.z / hMag, -1, 1)) * RAD_TO_DEG : 0;

  // Eccentricity vector: e = (v x h)/mu - r/|r|
  const vCrossH = cross(vEci, hVec);
  const eVec = sub(scale(vCrossH, 1 / EARTH_MU), scale(rEci, 1 / r));
  const eccentricity = norm(eVec);

  const rPerigee = semiMajorAxisM * (1 - eccentricity);
  const rApogee = semiMajorAxisM * (1 + eccentricity);

  return {
    semiMajorAxisM,
    eccentricity,
    inclinationDeg,
    perigeeAltitudeM: rPerigee - EARTH_RADIUS_EQUATORIAL_M,
    apogeeAltitudeM: rApogee - EARTH_RADIUS_EQUATORIAL_M,
    specificEnergyJKg,
  };
}

