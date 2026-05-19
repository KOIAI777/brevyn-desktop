import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefCallback, RefObject } from "react";
import { useStickToBottom } from "use-stick-to-bottom";

export interface AgentScrollState {
  scrollRef: RefCallback<HTMLDivElement>;
  contentRef: RefCallback<HTMLDivElement>;
  composerDockRef: RefObject<HTMLDivElement>;
  timelineBottomInset: number;
  isFollowingOutput: boolean;
  scrollToBottom: (behavior: ScrollBehavior) => void;
}

const scrollPositionByThread = new Map<string, number>();

export function useAgentScrollState(threadId: string, followSignal: string): AgentScrollState {
  const sticky = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  });
  const composerDockRef = useRef<HTMLDivElement>(null);
  const restoredThreadRef = useRef("");
  const [timelineBottomInset, setTimelineBottomInset] = useState(224);

  useLayoutEffect(() => {
    const node = sticky.scrollRef.current as HTMLDivElement | null;
    if (!node) return;
    if (restoredThreadRef.current === threadId) return;
    restoredThreadRef.current = threadId;

    const savedDistance = scrollPositionByThread.get(threadId);
    if (typeof savedDistance === "number" && savedDistance > 5) {
      sticky.stopScroll();
      const restore = () => {
        const nextTop = node.scrollHeight - node.clientHeight - savedDistance;
        node.scrollTop = Math.max(0, nextTop);
      };
      restore();
      const frame = window.requestAnimationFrame(restore);
      return () => window.cancelAnimationFrame(frame);
    }

    void sticky.scrollToBottom({ animation: "instant", ignoreEscapes: true });
  }, [sticky, threadId]);

  useEffect(() => {
    const node = sticky.scrollRef.current as HTMLDivElement | null;
    if (!node) return;
    let frame = 0;
    const savePosition = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
        scrollPositionByThread.set(threadId, Math.max(0, distance));
      });
    };

    node.addEventListener("scroll", savePosition, { passive: true });
    return () => {
      node.removeEventListener("scroll", savePosition);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sticky.scrollRef, threadId]);

  useEffect(() => {
    if (!sticky.isAtBottom && !sticky.isNearBottom) return;
    void sticky.scrollToBottom({
      animation: "instant",
      preserveScrollPosition: true,
      ignoreEscapes: false,
    });
  }, [followSignal, sticky]);

  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock) return;

    const updateInset = () => {
      const nextInset = Math.ceil(dock.getBoundingClientRect().height + 80);
      setTimelineBottomInset((current) => current === nextInset ? current : nextInset);
      if (sticky.isAtBottom || sticky.isNearBottom) {
        void sticky.scrollToBottom({
          animation: "instant",
          preserveScrollPosition: true,
        });
      }
    };

    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [sticky, threadId]);

  function scrollToBottom(behavior: ScrollBehavior) {
    void sticky.scrollToBottom({
      animation: behavior === "smooth" ? "smooth" : "instant",
      ignoreEscapes: true,
    });
  }

  return {
    scrollRef: sticky.scrollRef as RefCallback<HTMLDivElement>,
    contentRef: sticky.contentRef as RefCallback<HTMLDivElement>,
    composerDockRef,
    timelineBottomInset,
    isFollowingOutput: sticky.isAtBottom,
    scrollToBottom,
  };
}
