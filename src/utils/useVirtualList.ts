import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 4,
}: UseVirtualListOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const rafIdRef = useRef<number | null>(null);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      setViewportHeight(containerRef.current.clientHeight || 600);
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateDimensions();

    const handleScroll = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        if (containerRef.current) {
          setScrollTop(containerRef.current.scrollTop);
        }
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    el.addEventListener('scroll', handleScroll, { passive: true });
    resizeObserver.observe(el);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  // Compute visible range
  const totalHeight = itemCount * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount - 1,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
  );

  const virtualItems: { index: number; offsetTop: number }[] = [];
  for (let i = startIndex; i <= endIndex && i < itemCount; i++) {
    virtualItems.push({
      index: i,
      offsetTop: i * itemHeight,
    });
  }

  const paddingTop = startIndex * itemHeight;
  const paddingBottom = Math.max(0, (itemCount - 1 - endIndex) * itemHeight);

  return {
    containerRef,
    virtualItems,
    startIndex,
    endIndex,
    totalHeight,
    paddingTop,
    paddingBottom,
  };
}
