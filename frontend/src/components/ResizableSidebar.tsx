'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  side: 'left' | 'right';
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  collapsedWidth?: number;
  responsive?: boolean;
  /** When false, the sidebar is hidden on small screens (<lg). Desktop is unaffected. */
  mobileVisible?: boolean;
  /**
   * Largest share of the viewport this rail may claim on first paint. Without
   * it a fixed defaultWidth squeezes the middle pane on smaller desktops —
   * two 300px rails leave a 1024px window barely 380px to work in.
   */
  viewportShare?: number;
}

export default function ResizableSidebar({
  children,
  side,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  className = '',
  collapsedWidth = 0,
  responsive = false,
  mobileVisible = true,
  viewportShare,
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(defaultWidth);

  // Trim the starting width to fit the window. Runs once so it never fights a
  // width the user has dragged to.
  useEffect(() => {
    if (!viewportShare) return;
    const cap = Math.round(window.innerWidth * viewportShare);
    setWidth((current) => Math.max(minWidth, Math.min(current, cap)));
  }, [viewportShare, minWidth]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.clientX - startXRef.current;
      const newWidth =
        side === 'left'
          ? startWidthRef.current + delta
          : startWidthRef.current - delta;
      setWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, side, minWidth, maxWidth]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const currentWidth = isCollapsed ? collapsedWidth : width;
  const showEdgeHighlight = isResizing || isHandleHovered;

  const sidebarStyle: React.CSSProperties = responsive
    ? ({ ['--sb-w' as string]: `${currentWidth}px` } as React.CSSProperties)
    : { width: currentWidth };

  return (
    <div
      ref={sidebarRef}
      className={`relative transition-[width] ${isResizing ? 'duration-0' : 'duration-300'} ease-in-out ${
        responsive
          ? `w-full lg:flex-shrink-0 lg:w-[var(--sb-w)] lg:flex-none ${mobileVisible ? 'flex-1 min-h-0 flex flex-col' : 'hidden lg:block'}`
          : 'flex-shrink-0'
      } ${className}`}
      style={sidebarStyle}
    >
      {/* Sidebar content */}
      <div
        className={`h-full overflow-hidden transition-opacity ${isResizing ? 'duration-0' : 'duration-300'} ${
          isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {children}
      </div>

      {/* Transparent border highlight on sidebar edge during hover/resize */}
      {!isCollapsed && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '2px',
            [side === 'left' ? 'right' : 'left']: 0,
            backgroundColor: showEdgeHighlight ? 'rgba(11,59,145,0.08)' : 'transparent',
            transition: 'background-color 0.2s ease',
            pointerEvents: 'none',
            zIndex: 19,
          }}
        />
      )}

      {/* Resize handle */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHandleHovered(true)}
          onMouseLeave={() => setIsHandleHovered(false)}
          className={`absolute top-0 ${side === 'left' ? '-right-1' : '-left-1'} w-3 h-full cursor-col-resize z-20 ${responsive ? 'hidden lg:flex' : 'flex'} items-center justify-center`}
        >
          <div
            style={{
              width: '3px',
              height: '32px',
              borderRadius: '9999px',
              backgroundColor: showEdgeHighlight ? 'rgba(11,59,145,0.12)' : 'transparent',
              transition: 'background-color 0.2s ease',
            }}
          />
        </div>
      )}

      {/* Collapse/Expand toggle button (desktop only when responsive) */}
      <button
        onClick={toggleCollapse}
        aria-hidden={responsive ? undefined : false}
        className={`absolute top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-[var(--color-surface-white)] border transition-all ${responsive ? 'hidden lg:flex' : 'flex'} items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-ivory)] shadow-sm rounded-[12px] ${
          side === 'left'
            ? isCollapsed
              ? 'left-0'
              : '-right-2.5'
            : isCollapsed
              ? 'right-0'
              : '-left-2.5'
        }`}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {side === 'left' ? (
          isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          isCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
