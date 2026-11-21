import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSimStore } from '../store/simStore.js';

interface BottomSheetProps {
  readonly title: string;
  readonly kicker?: string;
  readonly onClose: () => void;
  readonly testId?: string;
  readonly dataComponentId?: string;
  readonly children: ReactNode;
}

/**
 * Mobile swipe-up bottom sheet for Engineer telemetry, Component Inspector,
 * and What-If scenarios. Reports its rendered height to simStore so the 3D
 * camera applies `setViewOffset` to center the vehicle above the sheet.
 */
export function BottomSheet({
  title,
  kicker,
  onClose,
  testId,
  dataComponentId,
  children,
}: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const setBottomSheetHeightPx = useSimStore((s) => s.setBottomSheetHeightPx);

  useEffect(() => {
    const updateHeight = () => {
      if (sheetRef.current) {
        setBottomSheetHeightPx(sheetRef.current.getBoundingClientRect().height);
      }
    };
    updateHeight();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateHeight)
        : null;
    if (ro && sheetRef.current) ro.observe(sheetRef.current);
    return () => {
      ro?.disconnect();
      setBottomSheetHeightPx(0);
    };
  }, [expanded, setBottomSheetHeightPx]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
      className={`bottom-sheet ${expanded ? 'expanded' : ''}`}
      data-testid={testId}
      data-component-id={dataComponentId}
      style={
        dragOffsetY !== 0
          ? { transform: `translateY(${Math.max(0, dragOffsetY)}px)`, transition: 'none' }
          : undefined
      }
    >
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

      <div className="sheet-header">
        <div>
          {kicker && <div className="insp-kicker">{kicker}</div>}
          <h2 className="insp-title">{title}</h2>
        </div>
        <div className="sheet-header-actions">
          <button
            className="sheet-icon-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse sheet' : 'Expand sheet'}
          >
            {expanded ? '⌄' : '⌃'}
          </button>
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
