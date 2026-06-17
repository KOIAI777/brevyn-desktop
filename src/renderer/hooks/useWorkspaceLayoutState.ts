import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";

const CHAT_MIN_WIDTH = 520;
const RESPONSIVE_SIDEBAR_COLLAPSE_WIDTH = 1180;
const RESPONSIVE_RAILS_COLLAPSE_WIDTH = 1320;
const SIDEBAR_WIDTH_STORAGE_KEY = "brevyn.sidebar.width";
const SIDEBAR_WIDTH = { min: 240, default: 340, max: 520 } as const;
const RAIL_WIDTHS = {
  files: { min: 260, renderMin: 220, default: 320 },
  preview: { min: 320, renderMin: 240, default: 440 },
  sources: { min: 260, renderMin: 220, default: 300 },
} as const;

export type ResizableRail = "files" | "preview" | "sources";

interface UseWorkspaceLayoutStateArgs {
  contentGridRef: React.RefObject<HTMLDivElement | null>;
}

export function useWorkspaceLayoutState({ contentGridRef }: UseWorkspaceLayoutStateArgs) {
  const initialResponsiveModeRef = useRef(readResponsiveMode());
  const preferredSidebarCollapsedRef = useRef(false);
  const preferredRailCollapsedRef = useRef({ files: true, preview: true, sources: true });
  const responsiveModeRef = useRef(initialResponsiveModeRef.current);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => initialResponsiveModeRef.current.sidebar ? true : preferredSidebarCollapsedRef.current);
  const [fileRailCollapsed, setFileRailCollapsedState] = useState(() => initialResponsiveModeRef.current.rails ? true : preferredRailCollapsedRef.current.files);
  const [previewRailCollapsed, setPreviewRailCollapsedState] = useState(() => initialResponsiveModeRef.current.rails ? true : preferredRailCollapsedRef.current.preview);
  const [sourcesRailCollapsed, setSourcesRailCollapsedState] = useState(() => initialResponsiveModeRef.current.rails ? true : preferredRailCollapsedRef.current.sources);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readStoredSidebarWidth());
  const [fileRailWidth, setFileRailWidth] = useState<number>(RAIL_WIDTHS.files.default);
  const [previewRailWidth, setPreviewRailWidth] = useState<number>(RAIL_WIDTHS.preview.default);
  const [sourcesRailWidth, setSourcesRailWidth] = useState<number>(RAIL_WIDTHS.sources.default);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [resizingRail, setResizingRail] = useState<ResizableRail | null>(null);
  const [windowResizing, setWindowResizing] = useState(false);

  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number; element: HTMLElement } | null>(null);
  const sidebarResizeFrameRef = useRef<number | null>(null);
  const sidebarResizePointerXRef = useRef(0);
  const resizeStateRef = useRef<{ rail: ResizableRail; startX: number; startWidth: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizePointerXRef = useRef(0);
  const railWidthsRef = useRef<Record<ResizableRail, number>>({ files: RAIL_WIDTHS.files.default, preview: RAIL_WIDTHS.preview.default, sources: RAIL_WIDTHS.sources.default });

  railWidthsRef.current = { files: fileRailWidth, preview: previewRailWidth, sources: sourcesRailWidth };

  useEffect(() => {
    let timeout = 0;
    function handleResize() {
      setWindowResizing(true);
      const previousMode = responsiveModeRef.current;
      const nextMode = readResponsiveMode();
      responsiveModeRef.current = nextMode;
      if (nextMode.sidebar !== previousMode.sidebar) {
        setSidebarCollapsedState(nextMode.sidebar ? true : preferredSidebarCollapsedRef.current);
      }
      if (nextMode.rails !== previousMode.rails) {
        setFileRailCollapsedState(nextMode.rails ? true : preferredRailCollapsedRef.current.files);
        setPreviewRailCollapsedState(nextMode.rails ? true : preferredRailCollapsedRef.current.preview);
        setSourcesRailCollapsedState(nextMode.rails ? true : preferredRailCollapsedRef.current.sources);
      }
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        setWindowResizing(false);
        timeout = 0;
      }, 140);
    }
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!resizingRail) return;
    function applyResize(clientX: number) {
      const state = resizeStateRef.current;
      if (!state) return;
      const config = RAIL_WIDTHS[state.rail];
      const gridWidth = contentGridRef.current?.getBoundingClientRect().width || window.innerWidth;
      const otherRailWidth = (state.rail === "files" || fileRailCollapsed ? 0 : railWidthsRef.current.files)
        + (state.rail === "preview" || previewRailCollapsed ? 0 : railWidthsRef.current.preview)
        + (state.rail === "sources" || sourcesRailCollapsed ? 0 : railWidthsRef.current.sources);
      const availableMax = gridWidth - otherRailWidth - CHAT_MIN_WIDTH;
      const maxWidth = Math.max(config.min, availableMax);
      const nextWidth = clamp(state.startWidth - (clientX - state.startX), config.min, maxWidth);
      railWidthsRef.current = { ...railWidthsRef.current, [state.rail]: nextWidth };
      if (contentGridRef.current) {
        contentGridRef.current.style.gridTemplateColumns = gridColumnsForWidths(
          fileRailCollapsed,
          previewRailCollapsed,
          sourcesRailCollapsed,
          state.rail === "files" ? nextWidth : railWidthsRef.current.files,
          state.rail === "preview" ? nextWidth : railWidthsRef.current.preview,
          state.rail === "sources" ? nextWidth : railWidthsRef.current.sources,
        );
      }
      return nextWidth;
    }
    function handlePointerMove(event: PointerEvent) {
      resizePointerXRef.current = event.clientX;
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applyResize(resizePointerXRef.current);
      });
    }
    function handlePointerUp() {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      const nextWidth = applyResize(resizePointerXRef.current);
      if (resizeStateRef.current?.rail === "files" && typeof nextWidth === "number") setFileRailWidth(nextWidth);
      if (resizeStateRef.current?.rail === "preview" && typeof nextWidth === "number") setPreviewRailWidth(nextWidth);
      if (resizeStateRef.current?.rail === "sources" && typeof nextWidth === "number") setSourcesRailWidth(nextWidth);
      resizeStateRef.current = null;
      setResizingRail(null);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [contentGridRef, fileRailCollapsed, previewRailCollapsed, resizingRail, sourcesRailCollapsed]);

  useEffect(() => {
    if (!sidebarResizing) return;
    function applyResize(clientX: number) {
      const state = sidebarResizeStateRef.current;
      if (!state) return;
      const availableMax = window.innerWidth - CHAT_MIN_WIDTH - 48;
      const maxWidth = Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, availableMax));
      const nextWidth = clamp(state.startWidth + clientX - state.startX, SIDEBAR_WIDTH.min, maxWidth);
      state.element.style.width = `${nextWidth}px`;
      return nextWidth;
    }
    function handlePointerMove(event: PointerEvent) {
      sidebarResizePointerXRef.current = event.clientX;
      if (sidebarResizeFrameRef.current !== null) return;
      sidebarResizeFrameRef.current = window.requestAnimationFrame(() => {
        sidebarResizeFrameRef.current = null;
        applyResize(sidebarResizePointerXRef.current);
      });
    }
    function handlePointerUp() {
      if (sidebarResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(sidebarResizeFrameRef.current);
        sidebarResizeFrameRef.current = null;
      }
      const nextWidth = applyResize(sidebarResizePointerXRef.current);
      if (typeof nextWidth === "number") {
        setSidebarWidth(nextWidth);
        storeSidebarWidth(nextWidth);
      }
      sidebarResizeStateRef.current = null;
      setSidebarResizing(false);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (sidebarResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(sidebarResizeFrameRef.current);
        sidebarResizeFrameRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [sidebarResizing]);

  const setSidebarCollapsed: Dispatch<SetStateAction<boolean>> = (value) => {
    setSidebarCollapsedState((current) => {
      const next = resolveSetState(value, current);
      preferredSidebarCollapsedRef.current = next;
      return next;
    });
  };

  const setFileRailCollapsed: Dispatch<SetStateAction<boolean>> = (value) => {
    setFileRailCollapsedState((current) => {
      const next = resolveSetState(value, current);
      preferredRailCollapsedRef.current = { ...preferredRailCollapsedRef.current, files: next };
      return next;
    });
  };

  const setPreviewRailCollapsed: Dispatch<SetStateAction<boolean>> = (value) => {
    setPreviewRailCollapsedState((current) => {
      const next = resolveSetState(value, current);
      preferredRailCollapsedRef.current = { ...preferredRailCollapsedRef.current, preview: next };
      return next;
    });
  };

  const setSourcesRailCollapsed: Dispatch<SetStateAction<boolean>> = (value) => {
    setSourcesRailCollapsedState((current) => {
      const next = resolveSetState(value, current);
      preferredRailCollapsedRef.current = { ...preferredRailCollapsedRef.current, sources: next };
      return next;
    });
  };

  const contentGridColumns = useMemo(
    () => gridColumnsForWidths(fileRailCollapsed, previewRailCollapsed, sourcesRailCollapsed, fileRailWidth, previewRailWidth, sourcesRailWidth),
    [fileRailCollapsed, fileRailWidth, previewRailCollapsed, previewRailWidth, sourcesRailCollapsed, sourcesRailWidth],
  );

  function startRailResize(rail: ResizableRail, event: ReactPointerEvent) {
    const startWidth = rail === "files" ? fileRailWidth : rail === "preview" ? previewRailWidth : sourcesRailWidth;
    resizeStateRef.current = { rail, startX: event.clientX, startWidth };
    resizePointerXRef.current = event.clientX;
    setResizingRail(rail);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function startSidebarResize(event: ReactPointerEvent) {
    if (sidebarCollapsed) return;
    const element = event.currentTarget.closest("[data-workspace-sidebar]");
    if (!(element instanceof HTMLElement)) return;
    sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth, element };
    sidebarResizePointerXRef.current = event.clientX;
    setSidebarResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    sidebarResizing,
    fileRailCollapsed,
    setFileRailCollapsed,
    previewRailCollapsed,
    setPreviewRailCollapsed,
    sourcesRailCollapsed,
    setSourcesRailCollapsed,
    fileRailWidth,
    previewRailWidth,
    sourcesRailWidth,
    resizingRail,
    windowResizing,
    contentGridColumns,
    startRailResize,
    startSidebarResize,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readResponsiveMode(): { sidebar: boolean; rails: boolean } {
  if (typeof window === "undefined") return { sidebar: false, rails: false };
  return {
    sidebar: window.innerWidth < RESPONSIVE_SIDEBAR_COLLAPSE_WIDTH,
    rails: window.innerWidth < RESPONSIVE_RAILS_COLLAPSE_WIDTH,
  };
}

function resolveSetState<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

function readStoredSidebarWidth(): number {
  try {
    const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) ? clamp(value, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max) : SIDEBAR_WIDTH.default;
  } catch {
    return SIDEBAR_WIDTH.default;
  }
}

function storeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // preference storage may fail in locked environments
  }
}

function gridColumnsForWidths(
  fileRailCollapsed: boolean,
  previewRailCollapsed: boolean,
  sourcesRailCollapsed: boolean,
  fileRailWidth: number,
  previewRailWidth: number,
  sourcesRailWidth: number,
): string {
  return [
    "minmax(0, 1fr)",
    railColumn(sourcesRailCollapsed, sourcesRailWidth, RAIL_WIDTHS.sources.renderMin),
    railColumn(previewRailCollapsed, previewRailWidth, RAIL_WIDTHS.preview.renderMin),
    railColumn(fileRailCollapsed, fileRailWidth, RAIL_WIDTHS.files.renderMin),
  ].join(" ");
}

function railColumn(collapsed: boolean, width: number, renderMin: number): string {
  if (collapsed) return "0px";
  return `minmax(${Math.min(renderMin, width)}px, ${width}px)`;
}
