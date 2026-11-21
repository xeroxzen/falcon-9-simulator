import { useRef, useState, type ReactNode } from 'react';

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
 * and What-If scenarios. Supports swipe-down to dismiss, swipe-up to expand,
 * and >= 44px touch targets.
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
