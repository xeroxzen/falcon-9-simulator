import type {
  DroneshipConfig,
  EngineSpec,
  LandingSiteConfig,
  LandingSiteId,
  LaunchSiteConfig,
  VehicleConfig,
} from '../types.js';
import { SEA_LEVEL_PRESSURE_PA } from './constants.js';

/**
 * Falcon 9 Block 5 vehicle and propulsion configuration.
 *
 * Every value includes its public source or is explicitly marked ASSUMED
 * with rationale. See docs/ASSUMPTIONS.md for full discussion.
 */

// ---------------------------------------------------------------------------
// Merlin 1D (Stage 1, sea-level variant)
// ---------------------------------------------------------------------------
// Prior sources: SpaceX Falcon User's Guide & SpaceX Falcon 9 spec page:
//   - 9x Merlin 1D total sea-level thrust = 7,607 kN -> 845.222 kN/engine
//   - 9x Merlin 1D total vacuum thrust   = 8,227 kN -> 914.111 kN/engine
//   - Nozzle exit area A_exit = (T_vac - T_sl) / p0 = 0.680 m^2 (d ~ 0.930 m)
//   - Vacuum Isp = 311 s
//
// Values below are the joint MAP system-identification estimates (Part D, fit
// on DM-1, CRS-16, and Iridium NEXT 8 with Gaussian priors on published specs;
// validated on 7 holdout Block 5 flights). See docs/ASSUMPTIONS.md.
//
// Physics consistency:
//   For a choked nozzle at fixed chamber pressure, mass flow mdot is
//   independent of ambient pressure: mdot = T_vac / (Isp_vac * g0).
//   T_sl = T_vac - p0 * A_exit and Isp_sl = Isp_vac * (T_sl / T_vac) are
//   enforced algebraically (d_exit = 0.921 m, matching ~0.92 m Merlin 1D).
const MERLIN_1D_THRUST_VAC_N = 908_722; // MAP Variant A: 908.72 ± 5.63 kN/engine (9x = 8,178 kN)
const MERLIN_1D_EXIT_AREA_M2 = 0.680; // MAP Variant A: 0.680 ± 0.015 m^2 (d_exit = 0.931 m)
const MERLIN_1D_THRUST_SL_N =
  MERLIN_1D_THRUST_VAC_N - SEA_LEVEL_PRESSURE_PA * MERLIN_1D_EXIT_AREA_M2; // 839.82 kN/engine (9x = 7,558 kN)
const MERLIN_1D_ISP_VAC_S = 311.04; // MAP Variant A: 311.04 ± 1.91 s
const MERLIN_1D_ISP_SL_S =
  MERLIN_1D_ISP_VAC_S * (MERLIN_1D_THRUST_SL_N / MERLIN_1D_THRUST_VAC_N); // 287.46 s

export const MERLIN_1D_SPEC: EngineSpec = {
  name: 'Merlin 1D (Block 5)',
  thrustSeaLevelN: MERLIN_1D_THRUST_SL_N,
  thrustVacuumN: MERLIN_1D_THRUST_VAC_N,
  ispSeaLevelS: MERLIN_1D_ISP_SL_S,
  ispVacuumS: MERLIN_1D_ISP_VAC_S,
  exitAreaM2: MERLIN_1D_EXIT_AREA_M2,
  /** ASSUMED: Publicly cited Merlin 1D deep-throttle capability is ~40% */
  minThrottle: 0.4,
  maxThrottle: 1.0,
};

// ---------------------------------------------------------------------------
// Merlin 1D Vacuum (Stage 2, MVac)
// ---------------------------------------------------------------------------
// Prior source: SpaceX Falcon 9 spec page (981 kN vac thrust, 348 s vac Isp).
// Values below are Part D MAP estimates (see docs/ASSUMPTIONS.md).
export const MVAC_SPEC: EngineSpec = {
  name: 'Merlin 1D Vacuum (MVac)',
  thrustSeaLevelN: 0,
  thrustVacuumN: 983_169, // MAP Variant A: 983.17 ± 9.26 kN
  ispSeaLevelS: 0,
  ispVacuumS: 347.90, // MAP Variant A: 347.90 ± 1.98 s
  /** ASSUMED: ~3.3 m MVac radiatively cooled nozzle extension */
  exitAreaM2: Math.PI * 1.65 * 1.65,
  /** ASSUMED: MVac minimum throttle ~39-40% */
  minThrottle: 0.39,
  maxThrottle: 1.0,
};

const CORE_DIAMETER_M = 3.7;

export const FALCON9_BLOCK5: VehicleConfig = {
  name: 'Falcon 9 Block 5',
  /** Source: SpaceX Falcon User's Guide (70 m) */
  totalHeightM: 70.0,
  /** Source: SpaceX Falcon User's Guide (3.7 m) */
  coreDiameterM: CORE_DIAMETER_M,
  /** Source: SpaceX Falcon User's Guide (5.2 m) */
  fairingDiameterM: 5.2,
  /** Source: SpaceX Falcon User's Guide (13.1 m) */
  fairingLengthM: 13.1,
  /** Source: Public SpaceX / Wikipedia F9 Block 5 specs (~1,900 kg both halves) */
  fairingMassKg: 1_900,
  /** Core cross-sectional reference area pi*(3.7/2)^2 = 10.7521 m^2 */
  referenceAreaM2: Math.PI * (CORE_DIAMETER_M / 2) * (CORE_DIAMETER_M / 2),
  stage1: {
    name: 'Falcon 9 Stage 1 (Booster)',
    /** MAP Variant A (prior 25,600 ± 2,000 kg): Block 5 reusable dry mass with legs, octaweb shield & Ti grid fins */
    dryMassKg: 26_955,
    /** MAP Variant A (prior 411,000 ± 8,000 kg): Subcooled LOX/RP-1 Block 5 propellant load */
    propellantMassKg: 422_671,
    diameterM: CORE_DIAMETER_M,
    /** Source: Public Falcon 9 Block 5 geometry (~42.6 m incl. interstage) */
    lengthM: 42.6,
    engineCount: 9,
    engine: MERLIN_1D_SPEC,
  },
  stage2: {
    name: 'Falcon 9 Stage 2',
    /** MAP Variant A (prior 4,200 ± 400 kg): Stage 2 dry mass */
    dryMassKg: 4_234,
    /** MAP Variant A (prior 109,500 ± 3,000 kg): Subcooled LOX/RP-1 Block 5 Stage 2 propellant load */
    propellantMassKg: 111_310,
    diameterM: CORE_DIAMETER_M,
    /** Source: Public Falcon 9 Block 5 geometry (~12.6 m) */
    lengthM: 12.6,
    engineCount: 1,
    engine: MVAC_SPEC,
  },
  /** MAP Variant A (prior 4.0 ± 0.5 g, fit set only): Stage 1 axial acceleration limit */
  maxAxialAccelG: 3.69,
  /** MAP S2-only fit (prior 3.50 ± 0.40 g, fit set only): Stage 2 MVac late-burn axial acceleration limit */
  stage2MaxAccelG: 3.52,
  /** ASSUMED: Simplified 3-DOF ascent attitude slew rate limit (5 deg/s) */
  maxAttitudeSlewRateRadS: (5.0 * Math.PI) / 180.0,
  /** ASSUMED: Simplified cold-gas RCS booster flip slew rate (12 deg/s -> ~15 s for 180 deg flip) */
  boosterFlipSlewRateRadS: (12.0 * Math.PI) / 180.0,
};

// ---------------------------------------------------------------------------
// Launch & Landing Sites (WGS-84)
// ---------------------------------------------------------------------------
export const LAUNCH_SITES: Record<'LC-39A' | 'SLC-40' | 'SLC-4E', LaunchSiteConfig> = {
  'LC-39A': {
    id: 'LC-39A',
    name: 'Kennedy Space Center LC-39A',
    coast: 'EAST',
    latDeg: 28.60833,
    lonDeg: -80.60444,
    elevationM: 15.0,
    azimuthCorridorDeg: [35, 120],
    inclinationRangeDeg: [28.5, 98.0],
    defaultInclinationDeg: 51.6,
    corridorSource:
      'USSF Space Launch Delta 45 Eastern Range safety corridor (35°–120° primary eastward azimuth → 28.5°–57° direct, up to 98° via SSE polar corridor)',
    source: 'KSC / WGS-84 geodetic coordinates (28°36\'30"N, 80°36\'16"W, ~15 m AMSL)',
  },
  'SLC-40': {
    id: 'SLC-40',
    name: 'Cape Canaveral Space Force Station SLC-40',
    coast: 'EAST',
    latDeg: 28.5619,
    lonDeg: -80.5772,
    elevationM: 4.0,
    azimuthCorridorDeg: [35, 120],
    inclinationRangeDeg: [28.5, 98.0],
    defaultInclinationDeg: 28.6,
    corridorSource:
      'USSF Space Launch Delta 45 Eastern Range safety corridor (35°–120° primary eastward azimuth → 28.5°–57° direct, up to 98° via SSE polar corridor)',
    source: 'CCSFS / WGS-84 geodetic coordinates (28°33\'43"N, 80°34\'38"W, ~4 m AMSL)',
  },
  'SLC-4E': {
    id: 'SLC-4E',
    name: 'Vandenberg Space Force Base SLC-4E',
    coast: 'WEST',
    latDeg: 34.6320,
    lonDeg: -120.6107,
    elevationM: 114.0,
    azimuthCorridorDeg: [140, 201],
    inclinationRangeDeg: [53.0, 104.0],
    defaultInclinationDeg: 97.5,
    corridorSource:
      'USSF Space Launch Delta 30 Western Range safety corridor (140°–201° southward Pacific azimuth → 53°–104° polar/SSO; eastward/low-inclination launches overfly California mainland)',
    source: 'VSFB / WGS-84 geodetic coordinates (34°37\'55"N, 120°36\'38"W, ~114 m AMSL)',
  },
};

export interface LaunchCorridorCheck {
  readonly valid: boolean;
  readonly message?: string;
}

/**
 * Validate whether an orbital inclination is permitted by the selected launch site's
 * range-safety azimuth corridor (Eastern Range SLD 45 vs Western Range SLD 30).
 */
export function validateLaunchSiteInclination(
  siteId: LaunchSiteConfig['id'],
  inclinationDeg: number
): LaunchCorridorCheck {
  const site = LAUNCH_SITES[siteId];
  const [minI, maxI] = site.inclinationRangeDeg;
  const [azMin, azMax] = site.azimuthCorridorDeg;
  if (inclinationDeg < minI || inclinationDeg > maxI) {
    const reason =
      siteId === 'SLC-4E'
        ? 'lower inclinations overfly populated California mainland'
        : inclinationDeg < minI
          ? `inclination cannot be below pad latitude (${site.latDeg.toFixed(1)}°N) without a large plane-change dogleg`
          : 'exceeds Eastern Range polar corridor limit';
    return {
      valid: false,
      message: `${siteId} cannot launch to ${inclinationDeg.toFixed(1)}° (range-safety azimuth ${azMin}°–${azMax}° supports ${minI.toFixed(1)}°–${maxI.toFixed(1)}°; ${reason}).`,
    };
  }
  return { valid: true };
}

export const LANDING_SITES: Record<LandingSiteId, LandingSiteConfig> = {
  'LZ-40': {
    id: 'LZ-40',
    name: 'Cape Canaveral Landing Zone 40 (LZ-40)',
    coast: 'EAST',
    latDeg: 28.5631,
    lonDeg: -80.5743,
    elevationM: 4.0,
    status: 'ACTIVE',
    activeWindows: [{ from: '2025-08-01', note: 'Active East Coast RTLS pad adjacent to SLC-40' }],
    statusNote: 'Active East Coast RTLS pad adjacent to SLC-40 for current Cape Falcon 9 landings.',
    source: 'CCSFS SLC-40 / LZ-40 WGS-84 coordinates (28°33\'47"N, 80°34\'28"W, ~4 m AMSL)',
  },
  'LZ-1': {
    id: 'LZ-1',
    name: 'Cape Canaveral Landing Zone 1 (LZ-1)',
    coast: 'EAST',
    latDeg: 28.48575,
    lonDeg: -80.54294,
    elevationM: 3.0,
    status: 'RETIRED',
    activeWindows: [
      {
        from: '2015-12-21',
        until: '2025-08-01',
        note: 'Routine Falcon 9/Heavy RTLS through Crew-11 (planned final F9 landing, Aug 1, 2025)',
      },
      {
        from: '2026-10-01',
        until: '2026-10-01',
        note: 'Reused for Falcon Heavy NROL-97 side booster B1104 (Oct 1, 2026; SpaceX / Spaceflight Now)',
      },
    ],
    statusNote:
      'Crew-11 (Aug 1, 2025) was planned as final routine F9 landing before LC-13 lease expiry, but LZ-1 was reused on Oct 1, 2026 for Falcon Heavy NROL-97 (B1104).',
    source: 'SpaceX / Spaceflight Now (Crew-11 Aug 1, 2025; NROL-97 Oct 1, 2026); CCSFS LC-13 WGS-84',
  },
  'LZ-2': {
    id: 'LZ-2',
    name: 'Cape Canaveral Landing Zone 2 (LZ-2)',
    coast: 'EAST',
    latDeg: 28.48556,
    lonDeg: -80.54444,
    elevationM: 3.0,
    status: 'RETIRED',
    activeWindows: [
      {
        from: '2018-02-06',
        until: '2025-12-09',
        note: 'Final scheduled Falcon 9 landing on NROL-77 (Dec 9, 2025; SpaceX / Spaceflight Now)',
      },
      {
        from: '2026-10-01',
        until: '2026-10-01',
        note: 'Reused for Falcon Heavy NROL-97 side booster B1072 (Oct 1, 2026; SpaceX / Spaceflight Now)',
      },
    ],
    statusNote:
      'Retired from routine Falcon 9 service after NROL-77 on Dec 9, 2025 (B1096); later reused on Oct 1, 2026 for Falcon Heavy NROL-97 (B1072).',
    source: 'SpaceX / Spaceflight Now (NROL-77 Dec 9, 2025; NROL-97 Oct 1, 2026); CCSFS LC-13 WGS-84',
  },
  'LZ-4': {
    id: 'LZ-4',
    name: 'Vandenberg Landing Zone 4 (LZ-4)',
    coast: 'WEST',
    latDeg: 34.6342,
    lonDeg: -120.6150,
    elevationM: 114.0,
    status: 'ACTIVE',
    activeWindows: [{ from: '2018-10-08', note: 'Active West Coast RTLS pad since SAOCOM 1A' }],
    statusNote: 'Active West Coast RTLS pad at Vandenberg SFB (first used on SAOCOM 1A, Oct 8, 2018).',
    source: 'SpaceX SAOCOM 1A Press Kit; VSFB former SLC-4W WGS-84 (34°38\'03"N, 120°36\'54"W, ~114 m AMSL)',
  },
};

export const DRONESHIPS: Record<'ASOG' | 'OCISLY' | 'JRTI', DroneshipConfig> = {
  ASOG: {
    id: 'ASOG',
    name: 'A Shortfall of Gravitas (ASOG)',
    status: 'ACTIVE',
    currentCoast: 'EAST',
    homePort: 'Port Canaveral, FL (2026 coast assignment UNVERIFIED)',
    serviceHistory: [{ coast: 'EAST', from: '2021-08-29' }],
    statusNote:
      'Entered East Coast service Aug 2021 (Port Canaveral). 2026 coast assignment UNVERIFIED against primary SpaceX mission pages (conflicting April 2026 reports of West Coast operation).',
    source: 'SpaceX fleet records (2021 commissioning); 2026 coast UNVERIFIED',
  },
  OCISLY: {
    id: 'OCISLY',
    name: 'Of Course I Still Love You (OCISLY)',
    status: 'ACTIVE',
    currentCoast: 'WEST',
    homePort: 'Port of Long Beach, CA (2026 coast assignment UNVERIFIED)',
    serviceHistory: [
      { coast: 'EAST', from: '2015-06-28', until: '2021-06-14' },
      { coast: 'WEST', from: '2021-06-15' },
    ],
    statusNote:
      'Served East Coast 2015–2021 (incl. DM-1) and transited Panama Canal to West Coast in June 2021. 2026 coast assignment UNVERIFIED against primary SpaceX mission pages (conflicting April 2026 reports of Cape operation).',
    source: 'SpaceX DM-1 Press Kit; Spaceflight Now (2021 Panama Canal transit); 2026 coast UNVERIFIED',
  },
  JRTI: {
    id: 'JRTI',
    name: 'Just Read the Instructions (JRTI)',
    status: 'REPURPOSED',
    currentCoast: null,
    homePort: 'Port Canaveral, FL (2026 status UNVERIFIED)',
    serviceHistory: [
      { coast: 'WEST', from: '2016-01-17', until: '2019-08-01' },
      { coast: 'EAST', from: '2020-05-30', until: '2026-02-01' },
    ],
    statusNote:
      'Served West Coast 2016–2019 (incl. Iridium NEXT-8) and East Coast from 2020. Early-2026 retirement/repurposing for Starship transport is UNVERIFIED against primary SpaceX mission pages.',
    source: 'SpaceX Iridium-8 Press Kit; 2026 status UNVERIFIED',
  },
};

/**
 * Return RTLS landing zones and ASDS droneships historically available on a given
 * coast/launch site on `missionDateIso` (defaults to current 2026 status when omitted).
 */
export function getAvailableRecoveryAssets(
  siteId: LaunchSiteConfig['id'],
  missionDateIso = '2026-06-01'
): {
  readonly landingZones: readonly LandingSiteConfig[];
  readonly droneships: readonly DroneshipConfig[];
  readonly defaultLandingSiteId: LandingSiteId;
} {
  const coast = LAUNCH_SITES[siteId].coast;
  const landingZones = Object.values(LANDING_SITES).filter((lz) => {
    if (lz.coast !== coast) return false;
    return lz.activeWindows.some(
      (w) => missionDateIso >= w.from && (!w.until || missionDateIso <= w.until)
    );
  });
  const droneships = Object.values(DRONESHIPS).filter((ds) =>
    ds.serviceHistory.some(
      (h) =>
        h.coast === coast &&
        missionDateIso >= h.from &&
        (!h.until || missionDateIso <= h.until)
    )
  );
  const preferred =
    landingZones.find((lz) => lz.status === 'ACTIVE') ??
    landingZones[0] ??
    (coast === 'WEST' ? LANDING_SITES['LZ-4'] : LANDING_SITES['LZ-40']);

  return {
    landingZones,
    droneships,
    defaultLandingSiteId: preferred.id,
  };
}

/**
 * ASSUMED Mach-dependent drag coefficient Cd(M) for Falcon 9 ascent stack
 * referenced to core cross-sectional area (10.7521 m^2), scaled by the
 * Part D MAP drag scale factor (1.149 ± 0.146; poorly constrained / prior-dominated).
 */
const ASCENT_CD_MAP_SCALE = 1.041;

export const ASCENT_CD_MACH_TABLE: readonly (readonly [number, number])[] = (
  [
    [0.0, 0.48],
    [0.5, 0.48],
    [0.8, 0.56],
    [0.95, 0.76],
    [1.05, 0.88],
    [1.2, 0.80],
    [1.5, 0.66],
    [2.0, 0.52],
    [3.0, 0.42],
    [4.0, 0.36],
    [6.0, 0.32],
    [10.0, 0.30],
  ] as const
).map(([m, cd]) => [m, Number((cd * ASCENT_CD_MAP_SCALE).toFixed(4))] as const);

/**
 * ASSUMED Mach-dependent drag coefficient Cd(M) for tail-first descending
 * Stage 1 booster (blunt octaweb base + deployed titanium grid fins),
 * referenced to core cross-sectional area (10.7521 m^2).
 */
export const BOOSTER_DESCENT_CD_MACH_TABLE: readonly (readonly [number, number])[] = [
  [0.0, 0.85],
  [0.5, 0.90],
  [0.85, 1.15],
  [1.1, 1.45],
  [1.5, 1.35],
  [2.5, 1.15],
  [4.0, 1.05],
  [8.0, 1.00],
];
