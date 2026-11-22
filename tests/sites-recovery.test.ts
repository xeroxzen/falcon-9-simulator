import { describe, expect, it } from 'vitest';
import {
  getAvailableRecoveryAssets,
  validateLaunchSiteInclination,
} from '../src/sim/config/falcon9.js';

describe('Launch site range-safety corridors and historical recovery asset availability', () => {
  it('allows valid Eastern Range inclinations and rejects sub-latitude inclinations', () => {
    expect(validateLaunchSiteInclination('LC-39A', 51.6).valid).toBe(true);
    expect(validateLaunchSiteInclination('SLC-40', 28.6).valid).toBe(true);
    expect(validateLaunchSiteInclination('SLC-40', 97.5).valid).toBe(true);
    const low = validateLaunchSiteInclination('LC-39A', 20.0);
    expect(low.valid).toBe(false);
    expect(low.message).toContain('LC-39A');
  });

  it('blocks low-inclination launches from Vandenberg SLC-4E and allows polar/SSO', () => {
    expect(validateLaunchSiteInclination('SLC-4E', 97.5).valid).toBe(true);
    expect(validateLaunchSiteInclination('SLC-4E', 53.2).valid).toBe(true);
    const bad = validateLaunchSiteInclination('SLC-4E', 28.6);
    expect(bad.valid).toBe(false);
    expect(bad.message).toContain('SLC-4E');
    expect(bad.message).toContain('California');
  });

  it('resolves historical vs current landing zones and droneships by mission date', () => {
    // Historical DM-1 (March 2019, East Coast): LZ-1 + OCISLY
    const cape2019 = getAvailableRecoveryAssets('LC-39A', '2019-03-02');
    expect(cape2019.landingZones.map((z) => z.id)).toContain('LZ-1');
    expect(cape2019.landingZones.map((z) => z.id)).not.toContain('LZ-40');
    expect(cape2019.droneships.map((d) => d.id)).toContain('OCISLY');

    // Historical Iridium-8 (Jan 2019, West Coast): LZ-4 + JRTI
    const vandy2019 = getAvailableRecoveryAssets('SLC-4E', '2019-01-11');
    expect(vandy2019.landingZones.map((z) => z.id)).toEqual(['LZ-4']);
    expect(vandy2019.droneships.map((d) => d.id)).toEqual(['JRTI']);

    // LZ-2 final scheduled Falcon 9 landing on NROL-77 (Dec 9, 2025), retired Dec 10, 2025
    const capeNrol77 = getAvailableRecoveryAssets('SLC-40', '2025-12-09');
    expect(capeNrol77.landingZones.map((z) => z.id)).toContain('LZ-2');
    const capePostNrol77 = getAvailableRecoveryAssets('SLC-40', '2025-12-10');
    expect(capePostNrol77.landingZones.map((z) => z.id)).not.toContain('LZ-2');

    // Current 2026 East Coast (routine June 2026): LZ-40 active, LZ-1/LZ-2 retired
    const cape2026 = getAvailableRecoveryAssets('SLC-40', '2026-06-01');
    expect(cape2026.defaultLandingSiteId).toBe('LZ-40');
    expect(cape2026.landingZones.map((z) => z.id)).not.toContain('LZ-1');
    expect(cape2026.landingZones.map((z) => z.id)).not.toContain('LZ-2');

    // NROL-97 Falcon Heavy reuse of LZ-1 & LZ-2 on Oct 1, 2026
    const capeNrol97 = getAvailableRecoveryAssets('LC-39A', '2026-10-01');
    expect(capeNrol97.landingZones.map((z) => z.id)).toContain('LZ-1');
    expect(capeNrol97.landingZones.map((z) => z.id)).toContain('LZ-2');

    // Current 2026 West Coast: LZ-4 active
    const vandy2026 = getAvailableRecoveryAssets('SLC-4E', '2026-06-01');
    expect(vandy2026.defaultLandingSiteId).toBe('LZ-4');
  });
});
