import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from '../src/store/simStore.js';
import { computeViewportInfo } from '../src/ui/useViewport.js';

describe('v1.4 Part A: responsive breakpoints and quality tiers', () => {
  it('classifies phone portrait, phone landscape, tablet, and desktop breakpoints accurately', () => {
    const iphonePortrait = computeViewportInfo(390, 844);
    expect(iphonePortrait.isPhone).toBe(true);
    expect(iphonePortrait.isPhonePortrait).toBe(true);
    expect(iphonePortrait.isPhoneLandscape).toBe(false);
    expect(iphonePortrait.isTablet).toBe(false);
    expect(iphonePortrait.isDesktop).toBe(false);

    const pixelPortrait = computeViewportInfo(412, 915);
    expect(pixelPortrait.isPhone).toBe(true);
    expect(pixelPortrait.isPhonePortrait).toBe(true);

    const phoneLandscape = computeViewportInfo(844, 390);
    expect(phoneLandscape.isPhone).toBe(true);
    expect(phoneLandscape.isPhoneLandscape).toBe(true);
    expect(phoneLandscape.isPhonePortrait).toBe(false);

    const tablet = computeViewportInfo(820, 1180);
    expect(tablet.isTablet).toBe(true);
    expect(tablet.isPhone).toBe(false);
    expect(tablet.isDesktop).toBe(false);

    const desktop = computeViewportInfo(1280, 800);
    expect(desktop.isDesktop).toBe(true);
    expect(desktop.isPhone).toBe(false);
    expect(desktop.isTablet).toBe(false);
  });

  it('defines Low, Med, and High quality presets with monotonically increasing budgets', () => {
    expect(QUALITY_PRESETS.low.dpr).toBe(1);
    expect(QUALITY_PRESETS.low.bloom).toBe(false);
    expect(QUALITY_PRESETS.low.shadows).toBe(false);
    expect(QUALITY_PRESETS.low.starCount).toBeLessThan(QUALITY_PRESETS.med.starCount);
    expect(QUALITY_PRESETS.med.starCount).toBeLessThan(QUALITY_PRESETS.high.starCount);
    expect(QUALITY_PRESETS.high.bloom).toBe(true);
    expect(QUALITY_PRESETS.high.shadows).toBe(true);
  });
});
