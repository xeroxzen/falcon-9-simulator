import { useEffect, useState } from 'react';

export interface ViewportInfo {
  readonly width: number;
  readonly height: number;
  readonly isPhonePortrait: boolean;
  readonly isPhoneLandscape: boolean;
  readonly isPhone: boolean;
  readonly isTablet: boolean;
  readonly isDesktop: boolean;
}

export function computeViewportInfo(w: number, h: number): ViewportInfo {
  const isPhonePortrait = w <= 600;
  const isPhoneLandscape = !isPhonePortrait && h <= 500 && w <= 950;
  const isPhone = isPhonePortrait || isPhoneLandscape;
  const isTablet = !isPhone && w <= 1024;
  const isDesktop = !isPhone && !isTablet;
  return {
    width: w,
    height: h,
    isPhonePortrait,
    isPhoneLandscape,
    isPhone,
    isTablet,
    isDesktop,
  };
}

export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => {
    if (typeof window === 'undefined') {
      return computeViewportInfo(1280, 800);
    }
    return computeViewportInfo(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    const onResize = () => {
      setInfo(computeViewportInfo(window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return info;
}
