import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefCallback, RefObject } from "react";

const SCROLL_BOTTOM_THRESHOLD_PX = 64;

export interface AgentScrollState {
  scrollRef: RefObject<HTMLDivElement>;
  contentRef: RefCallback<HTMLDivElement>;
  composerDockRef: RefObject<HTMLDivElement>;
  timelineBottomInset: number;
  isFollowingOutput: boolean;
  scrollToBottom: (behavior: ScrollBehavior) => void;
}

export function useAgentScrollState(threadId: string, followSignal: string): AgentScrollState {
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  const userScrollIntentTimerRef = useRef(0);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [timelineBottomInset, setTimelineBottomInset] = useState(224);
  const [isFollowingOutput, setIsFollowingOutput] = useState(true);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContentNode(node);
  }, []);

  useEffect(() => {
    followOutputRef.current = true;
    setIsFollowingOutput(true);
    const frame = window.requestAnimationFrame(() => scrollTimelineToBottom(scrollRef.current, "auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [threadId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateFollowState = () => {
      const following = isNearScrollBottom(node);
      if (!following && followOutputRef.current && !userScrollIntentRef.current) return;
      followOutputRef.current = following;
      setIsFollowingOutput((current) => current === following ? current : following);
    };
    const markUserScrollIntent = () => {
      userScrollIntentRef.current = true;
      if (userScrollIntentTimerRef.current) window.clearTimeout(userScrollIntentTimerRef.current);
      userScrollIntentTimerRef.current = window.setTimeout(() => {
        userScrollIntentRef.current = false;
        userScrollIntentTimerRef.current = 0;
      }, 180);
    };
    const markKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (!isScrollKey(event.key)) return;
      markUserScrollIntent();
    };
    const markScrollbarDragIntent = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (event.clientX < rect.right - 18) return;
      markUserScrollIntent();
    };
    updateFollowState();
    node.addEventListener("wheel", markUserScrollIntent, { passive: true });
    node.addEventListener("touchmove", markUserScrollIntent, { passive: true });
    node.addEventListener("pointerdown", markScrollbarDragIntent, { passive: true });
    node.addEventListener("scroll", updateFollowState, { passive: true });
    window.addEventListener("keydown", markKeyboardScrollIntent, { passive: true });
    return () => {
      node.removeEventListener("wheel", markUserScrollIntent);
      node.removeEventListener("touchmove", markUserScrollIntent);
      node.removeEventListener("pointerdown", markScrollbarDragIntent);
      node.removeEventListener("scroll", updateFollowState);
      window.removeEventListener("keydown", markKeyboardScrollIntent);
      if (userScrollIntentTimerRef.current) {
        window.clearTimeout(userScrollIntentTimerRef.current);
        userScrollIntentTimerRef.current = 0;
      }
    };
  }, [threadId]);

  useEffect(() => {
    if (!followOutputRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollTimelineToBottom(scrollRef.current, "auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [followSignal, threadId]);

  useLayoutEffect(() => {
    const scrollNode = scrollRef.current;
    if (!scrollNode || !contentNode) return;

    let raf = 0;
    let lastHeight = contentNode.getBoundingClientRect().height;
    const followContentGrowth = () => {
      const nextHeight = contentNode.getBoundingClientRect().height;
      if (nextHeight === lastHeight && scrollNode.scrollHeight === scrollNode.clientHeight) return;
      lastHeight = nextHeight;
      if (!followOutputRef.current) return;
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (followOutputRef.current) scrollTimelineToBottom(scrollRef.current, "auto");
      });
    };

    followContentGrowth();
    const resizeObserver = new ResizeObserver(followContentGrowth);
    resizeObserver.observe(contentNode);
    const mutationObserver = new MutationObserver(followContentGrowth);
    mutationObserver.observe(contentNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [contentNode, threadId]);

  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock) return;

    const updateInset = () => {
      const nextInset = Math.ceil(dock.getBoundingClientRect().height + 80);
      setTimelineBottomInset(nextInset);
      window.requestAnimationFrame(() => {
        if (followOutputRef.current) scrollTimelineToBottom(scrollRef.current, "auto");
      });
    };

    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [threadId]);

  function scrollToBottom(behavior: ScrollBehavior) {
    userScrollIntentRef.current = false;
    followOutputRef.current = true;
    setIsFollowingOutput(true);
    scrollTimelineToBottom(scrollRef.current, behavior);
  }

  return {
    scrollRef,
    contentRef,
    composerDockRef,
    timelineBottomInset,
    isFollowingOutput,
    scrollToBottom,
  };
}

function isNearScrollBottom(node: HTMLDivElement): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollTimelineToBottom(node: HTMLDivElement | null, behavior: ScrollBehavior): void {
  if (!node) return;
  node.scrollTo({ top: node.scrollHeight, behavior });
}

function isScrollKey(key: string): boolean {
  return key === "ArrowUp"
    || key === "ArrowDown"
    || key === "PageUp"
    || key === "PageDown"
    || key === "Home"
    || key === "End"
    || key === " ";
}
