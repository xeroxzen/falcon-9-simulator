import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSimStore } from '../store/simStore.js';
import { useViewport } from './useViewport.js';

interface BottomSheetProps {
  readonly title: string;
  readonly kicker?: string;
  readonly onClose: () => void;
  readonly testId?: string;
  readonly dataComponentId?: string;
  readonly children: ReactNode;
}

/**
 * Responsive mobile panel:
 *  - Phone portrait: swipe-up bottom sheet (reports height to simStore for camera framing).
 *  - Phone landscape: right-side drawer (~40% width, full height; reports width to simStore).
 */
export function BottomSheet({
  title,
  kicker,
  onClose,
  testId,
  dataComponentId,
  children,
}: BottomSheetProps) {
  const { isPhoneLandscape } = useViewport();
  const [expanded, setExpanded] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const setBottomSheetHeightPx = useSimStore((s) => s.setBottomSheetHeightPx);
  const setRightDrawerWidthPx = useSimStore((s) => s.setRightDrawerWidthPx);

  useEffect(() => {
    const updateDims = () => {
      if (!sheetRef.current) return;
      const rect = sheetRef.current.getBoundingClientRect();
      if (isPhoneLandscape) {
        setBottomSheetHeightPx(0);
        setRightDrawerWidthPx(rect.width);
      } else {
        setRightDrawerWidthPx(0);
        setBottomSheetHeightPx(rect.height);
      }
    };
    updateDims();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateDims)
        : null;
    if (ro && sheetRef.current) ro.observe(sheetRef.current);
    return () => {
      ro?.disconnect();
      setBottomSheetHeightPx(0);
      setRightDrawerWidthPx(0);
    };
  }, [isPhoneLandscape, expanded, setBottomSheetHeightPx, setRightDrawerWidthPx]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPhoneLandscape) return;
    startYRef.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const dy = e.clientY - startYRef.current;
    setDragOffsetY(Math.max(-120, Math.min(260, dy)));
  };

  const handlePointerUp = () => {
    if (startYRef.current === null) return;
    if (dragOffsetY > 65) {
      onClose();
    } else if (dragOffsetY < -45) {
      setExpanded(true);
    } else if (dragOffsetY > 25 && expanded) {
      setExpanded(false);
    }
    startYRef.current = null;
    setDragOffsetY(0);
  };

  return (
    <aside
      ref={sheetRef}
      className={
        isPhoneLandscape
          ? 'right-drawer'
          : `bottom-sheet ${expanded ? 'expanded' : ''}`
      }
      data-testid={testId}
      data-component-id={dataComponentId}
      style={
        !isPhoneLandscape && dragOffsetY !== 0
          ? { transform: `translateY(${Math.max(0, dragOffsetY)}px)`, transition: 'none' }
          : undefined
      }
    >
      {!isPhoneLandscape && (
        <div
          className="sheet-handle-bar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Drag to resize or dismiss sheet"
        >
          <div className="sheet-pill" />
        </div>
      )}

      <div className="sheet-header">
        <div>
          {kicker && <div className="insp-kicker">{kicker}</div>}
          <h2 className="insp-title">{title}</h2>
        </div>
        <div className="sheet-header-actions">
          {!isPhoneLandscape && (
            <button
              className="sheet-icon-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse sheet' : 'Expand sheet'}
            >
              {expanded ? '⌄' : '⌃'}
            </button>
          )}
          <button
            className="sheet-icon-btn"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="sheet-body">{children}</div>
    </aside>
  );
}
