import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cn";

export interface UserMessageNavItem {
  id: string;
  index: number;
  preview: string;
}

interface UserMessageNavigatorProps {
  items: UserMessageNavItem[];
  scrollContainer: HTMLElement | null;
  bottomOffset: number;
}

interface NavMarker extends UserMessageNavItem {
  offsetPx: number;
}

const MIN_ITEMS = 1;
const MARKER_STEP_PX = 14;
const MARKER_EDGE_PX = 12;

export function UserMessageNavigator({ items, scrollContainer, bottomOffset }: UserMessageNavigatorProps) {
  const [markers, setMarkers] = useState<NavMarker[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [hoveredId, setHoveredId] = useState("");
  const railRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const visibleItems = useMemo(() => items.filter((item) => item.preview.trim()), [items]);

  useEffect(() => {
    if (visibleItems.length < MIN_ITEMS) {
      setMarkers([]);
      setActiveIds(new Set());
      return;
    }

    const container = scrollContainer;
    if (!container) return;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateMarkers(container, railRef.current, visibleItems, setMarkers, setActiveIds);
      });
    };

    schedule();
    container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    if (railRef.current) observer.observe(railRef.current);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [scrollContainer, visibleItems]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (markers.length < MIN_ITEMS) return null;

  const hovered = markers.find((marker) => marker.id === hoveredId);

  function showPreview(id: string) {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setHoveredId(id);
  }

  function hidePreview() {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setHoveredId(""), 120);
  }

  function scrollToMessage(id: string) {
    const container = scrollContainer;
    if (!container) return;
    const target = findUserMessageNode(container, id);
    if (!target) return;
    const top = getOffsetTopRelativeTo(target, container) - 20;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  return (
    <div
      className="pointer-events-none absolute left-6 top-5 z-30 hidden w-16 md:block"
      style={{ bottom: bottomOffset }}
      aria-label="用户消息导航"
    >
      <div ref={railRef} className="relative h-full">
        {markers.map((marker) => {
          const isActive = activeIds.has(marker.id);
          const isHovered = marker.id === hoveredId;
          return (
            <button
              key={marker.id}
              type="button"
              className="pointer-events-auto absolute left-0 flex h-5 w-14 -translate-y-1/2 items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              style={{ top: `calc(50% + ${marker.offsetPx}px)` }}
              title={marker.preview}
              aria-label={`跳到第 ${marker.index} 条用户消息`}
              onMouseEnter={() => showPreview(marker.id)}
              onMouseLeave={hidePreview}
              onFocus={() => showPreview(marker.id)}
              onBlur={hidePreview}
              onClick={() => scrollToMessage(marker.id)}
            >
              <span
                className={cx(
                  "block h-[3px] rounded-full bg-[hsl(var(--foreground)/0.32)] transition-[width,background-color,opacity,transform] duration-150 ease-out",
                  isHovered
                    ? "w-8 bg-[hsl(var(--foreground)/0.9)] opacity-100"
                    : isActive
                      ? "w-3 bg-[hsl(var(--foreground)/0.62)] opacity-90"
                      : "w-3 opacity-60",
                  isHovered && "translate-x-0.5",
                )}
              />
            </button>
          );
        })}

        {hovered ? (
          <div
            className="pointer-events-auto absolute left-[58px] w-[min(420px,calc(100vw-160px))] -translate-y-1/2 rounded-[var(--radius-panel)] border border-border/55 bg-popover/96 px-4 py-3 text-popover-foreground shadow-[0_18px_48px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-150"
            style={{ top: `calc(50% + ${hovered.offsetPx}px)` }}
            onMouseEnter={() => showPreview(hovered.id)}
            onMouseLeave={hidePreview}
          >
            <p className="line-clamp-4 break-words text-sm leading-6 text-popover-foreground/86">{hovered.preview}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function updateMarkers(
  container: HTMLElement,
  rail: HTMLElement | null,
  items: UserMessageNavItem[],
  setMarkers: (markers: NavMarker[]) => void,
  setActiveIds: (ids: Set<string>) => void,
) {
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;

  const measuredItems = items.flatMap((item) => {
    const node = findUserMessageNode(container, item.id);
    if (!node) return [];
    const absoluteTop = getOffsetTopRelativeTo(node, container);
    const absoluteBottom = absoluteTop + node.offsetHeight;
    return [{
      ...item,
      absoluteTop,
      absoluteBottom,
    }];
  }).sort((previous, next) => previous.absoluteTop - next.absoluteTop);

  const railHeight = Math.max(1, rail?.clientHeight || container.clientHeight);
  const maxOffset = Math.max(0, railHeight / 2 - MARKER_EDGE_PX);
  const nextMarkers = measuredItems.flatMap((item, index) => {
    // Codex-style rail: center the whole mini directory, then preserve message order from top to bottom.
    const centerIndex = (measuredItems.length - 1) / 2;
    const offsetPx = (index - centerIndex) * MARKER_STEP_PX;
    if (Math.abs(offsetPx) > maxOffset) return [];
    return [{ ...item, offsetPx }];
  });

  const nextActiveIds = new Set(
    measuredItems
      .filter((item) => item.absoluteBottom >= viewportTop && item.absoluteTop <= viewportBottom)
      .map((item) => item.id),
  );
  setMarkers(nextMarkers);
  setActiveIds(nextActiveIds);
}

function findUserMessageNode(container: HTMLElement, id: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-user-message-id]")).find(
    (node) => node.getAttribute("data-user-message-id") === id,
  );
}

function getOffsetTopRelativeTo(node: HTMLElement, container: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current && current !== container) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}
