import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const CHAT_MIN_WIDTH = 520;
const SIDEBAR_WIDTH_STORAGE_KEY = "brevyn.sidebar.width";
const SIDEBAR_WIDTH = { min: 240, default: 340, max: 520 } as const;
const RAIL_WIDTHS = {
  files: { min: 260, renderMin: 220, default: 320 },
  preview: { min: 320, renderMin: 240, default: 440 },
} as const;

export type ResizableRail = "files" | "preview";

interface UseWorkspaceLayoutStateArgs {
  contentGridRef: React.RefObject<HTMLDivElement | null>;
}

export function useWorkspaceLayoutState({ contentGridRef }: UseWorkspaceLayoutStateArgs) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileRailCollapsed, setFileRailCollapsed] = useState(false);
  const [previewRailCollapsed, setPreviewRailCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readStoredSidebarWidth());
  const [fileRailWidth, setFileRailWidth] = useState<number>(RAIL_WIDTHS.files.default);
  const [previewRailWidth, setPreviewRailWidth] = useState<number>(RAIL_WIDTHS.preview.default);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [resizingRail, setResizingRail] = useState<ResizableRail | null>(null);
  const [windowResizing, setWindowResizing] = useState(false);

  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number; element: HTMLElement } | null>(null);
  const sidebarResizeFrameRef = useRef<number | null>(null);
  const sidebarResizePointerXRef = useRef(0);
  const resizeStateRef = useRef<{ rail: ResizableRail; startX: number; startWidth: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizePointerXRef = useRef(0);
  const railWidthsRef = useRef<{ files: number; preview: number }>({ files: RAIL_WIDTHS.files.default, preview: RAIL_WIDTHS.preview.default });

  railWidthsRef.current = { files: fileRailWidth, preview: previewRailWidth };

  useEffect(() => {
    let timeout = 0;
    function handleResize() {
      setWindowResizing(true);
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
      const otherRailWidth = state.rail === "files"
        ? (previewRailCollapsed ? 0 : railWidthsRef.current.preview)
        : (fileRailCollapsed ? 0 : railWidthsRef.current.files);
      const availableMax = gridWidth - otherRailWidth - CHAT_MIN_WIDTH;
      const maxWidth = Math.max(config.min, availableMax);
      const nextWidth = clamp(state.startWidth - (clientX - state.startX), config.min, maxWidth);
      railWidthsRef.current = { ...railWidthsRef.current, [state.rail]: nextWidth };
      if (contentGridRef.current) {
        contentGridRef.current.style.gridTemplateColumns = gridColumnsForWidths(
          fileRailCollapsed,
          previewRailCollapsed,
          state.rail === "files" ? nextWidth : railWidthsRef.current.files,
          state.rail === "preview" ? nextWidth : railWidthsRef.current.preview,
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
  }, [contentGridRef, fileRailCollapsed, previewRailCollapsed, resizingRail]);

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

  const contentGridColumns = useMemo(
    () => gridColumnsForWidths(fileRailCollapsed, previewRailCollapsed, fileRailWidth, previewRailWidth),
    [fileRailCollapsed, fileRailWidth, previewRailCollapsed, previewRailWidth],
  );

  function startRailResize(rail: ResizableRail, event: ReactPointerEvent) {
    const startWidth = rail === "files" ? fileRailWidth : previewRailWidth;
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
    fileRailWidth,
    previewRailWidth,
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

function gridColumnsForWidths(fileRailCollapsed: boolean, previewRailCollapsed: boolean, fileRailWidth: number, previewRailWidth: number): string {
  return `minmax(${CHAT_MIN_WIDTH}px, 1fr) ${railColumn(previewRailCollapsed, previewRailWidth, RAIL_WIDTHS.preview.renderMin)} ${railColumn(fileRailCollapsed, fileRailWidth, RAIL_WIDTHS.files.renderMin)}`;
}

function railColumn(collapsed: boolean, width: number, renderMin: number): string {
  if (collapsed) return "0px";
  return `minmax(${Math.min(renderMin, width)}px, ${width}px)`;
}
