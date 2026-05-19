import { memo, useContext, useState, type ReactNode } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Check, ChevronDown, Copy, ListTodo, Loader2 } from "lucide-react";
import { type AgentAttachment, type AgentPermissionMode, type BrevynAgentTimelineRecord, type ModelProviderConfig, type Thread, type WorkspaceFileNode } from "../../../types/domain";
import brevynLogoUrl from "@/assets/brevyn-marginal-mark.svg";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { AssistantTextBubble, CompactContextNote, MessageBubble, PromptTooLongCard, ProviderErrorCard, ResolvedRuntimeNote } from "@/components/agent/AgentMessageParts";
import { ProcessTimelinePanel as BaseProcessTimelinePanel } from "@/components/agent/AgentProcessTimeline";
import { FilePathPreviewProvider } from "@/components/chat/FilePathChip";
import { Markdownish } from "@/components/chat/Markdownish";
import type { ProcessEvent, RunSummary } from "@/components/agent/agentTimelineModel";
import {
  exitPlanSummary,
  isRuntimeRecord,
  recordKey,
  recordObject,
  stringValue,
  userText,
} from "@/components/agent/agentTimelineModel";
import { useAgentThreadPanelState } from "@/components/agent/useAgentThreadPanelState";
import type { AgentTimelineViewItem } from "@/components/agent/useAgentTimelineState";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import { ApprovalCard, AskUserCard, ExitPlanCard } from "@/components/agent/AgentRuntimeCards";
import { ChangedFilesSummary } from "@/components/agent/ChangedFilesSummary";
import { ToolGlyph, ToolTitle, ToolUseCard } from "@/components/agent/AgentToolRenderers";

interface AgentThreadPanelProps {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  loading: boolean;
  running: boolean;
  error?: string;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
  onStop: () => Promise<void>;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onSelectProvider: (providerId: string) => Promise<void>;
  files: WorkspaceFileNode[];
  onPreviewFilePath?: (filePath: string) => void | Promise<void>;
}

const CHAT_BODY_WIDTH_CLASS = "mx-auto w-full max-w-[58rem]";

export function AgentThreadPanel({
  thread,
  records,
  loading,
  running,
  error,
  onRun,
  onStop,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  agentProviders,
  activeProviderId,
  onSelectProvider,
  files,
  onPreviewFilePath,
}: AgentThreadPanelProps) {
  const {
    scrollRef,
    contentRef,
    composerDockRef,
    timelineBottomInset,
    isFollowingOutput,
    planMode,
    permissionMode,
    timelineRecords,
    timelineGroups,
    todos,
    contextUsage,
    effectiveRunning,
    effectiveCompacting,
    queuedMessages,
    sendingQueuedMessageIds,
    autoCompactThresholdPercent,
    setPlanMode,
    setPermissionMode,
    handleCompact,
    queueMessage,
    deleteQueuedMessage,
    sendQueuedMessage,
    toggleProcessCollapsed,
    scrollToBottom,
  } = useAgentThreadPanelState({
    thread,
    records,
    loading,
    running,
    error,
    agentProviders,
    activeProviderId,
    onRun,
  });

  return (
    <AgentThreadIdContext.Provider value={thread.id}>
    <FilePathPreviewProvider onPreviewFilePath={onPreviewFilePath}>
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,244,236,0.62))]">
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 [overflow-anchor:none] [scrollbar-gutter:stable]" style={{ paddingBottom: timelineBottomInset }}>
        <div ref={contentRef} className="min-h-full">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading session timeline
            </div>
          ) : timelineRecords.length === 0 ? (
            <EmptyThreadWelcome thread={thread} />
          ) : (
            <div className={`${CHAT_BODY_WIDTH_CLASS} flex min-w-0 flex-col gap-3`}>
              {timelineGroups.map((group) => (
                <div
                  key={group.key}
                  className="timeline-group min-w-0 [content-visibility:auto] [contain-intrinsic-size:320px]"
                >
                  <AgentTimelineGroup
                    group={group}
                    onToggleItemProcess={(item) => toggleProcessCollapsed(item.processKey, item.defaultCollapsed, item.processLockedOpen)}
                    onApprove={onApprove}
                    onReject={onReject}
                    onAnswerQuestion={onAnswerQuestion}
                    onResolveExitPlan={onResolveExitPlan}
                    onCompact={() => void handleCompact()}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isFollowingOutput && (
        <button
          type="button"
          className="absolute right-8 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-card/92 text-muted-foreground shadow-[0_12px_34px_rgba(64,55,38,0.16)] ring-1 ring-border/50 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-accent hover:text-foreground"
          style={{ bottom: timelineBottomInset + 10 }}
          onClick={() => scrollToBottom("smooth")}
          title="回到底部"
          aria-label="回到底部"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {error && <div className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">{error}</div>}

      <AgentComposer
        dockRef={composerDockRef}
        todos={todos}
        queuedMessages={queuedMessages}
        sendingQueuedMessageIds={sendingQueuedMessageIds}
        running={effectiveRunning}
        planMode={planMode}
        permissionMode={permissionMode}
        contextUsage={contextUsage}
        autoCompactThresholdPercent={autoCompactThresholdPercent}
        compacting={effectiveCompacting}
        threadId={thread.id}
        agentProviders={agentProviders}
        activeProviderId={activeProviderId}
        onSetPlanMode={setPlanMode}
        onSetPermissionMode={setPermissionMode}
        onRun={onRun}
        onQueueMessage={queueMessage}
        onSendQueuedMessage={sendQueuedMessage}
        onDeleteQueuedMessage={deleteQueuedMessage}
        onStop={onStop}
        onCompact={() => void handleCompact()}
        onSelectProvider={onSelectProvider}
        files={files}
      />
    </section>
    </FilePathPreviewProvider>
    </AgentThreadIdContext.Provider>
  );
}

function ProcessTimelinePanel({
  summary,
  expanded,
  lockedOpen,
  collapsible,
  onToggle,
}: {
  summary: RunSummary;
  expanded: boolean;
  lockedOpen: boolean;
  collapsible: boolean;
  onToggle: () => void;
}) {
  return (
    <BaseProcessTimelinePanel
      summary={summary}
      expanded={expanded}
      lockedOpen={lockedOpen}
      collapsible={collapsible}
      onToggle={onToggle}
      runSummaryTone={runSummaryTone}
    />
  );
}

function EmptyThreadWelcome({ thread }: { thread: Thread }) {
  const welcome = homeWelcomeCopy(thread);
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border bg-background shadow-sm">
        <img src={brevynLogoUrl} alt="Brevyn" className="h-full w-full object-cover" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{welcome.greeting}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{welcome.dateLabel}</p>
      <div className="mt-4 w-full rounded-2xl border border-white/60 bg-card/72 p-4 text-left shadow-[0_16px_44px_rgba(64,55,38,0.10)] ring-1 ring-border/35 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ListTodo className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{welcome.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{welcome.recommendation}</p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        可以直接在下面输入，例如“检查今天我该先做什么”或“总结当前 workspace”。
      </p>
    </div>
  );
}

function homeWelcomeCopy(thread: Thread): { greeting: string; dateLabel: string; title: string; recommendation: string } {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5
    ? "夜深了，Brevyn 还在。"
    : hour < 12
      ? "早上好，今天从一个清晰的小目标开始。"
      : hour < 18
        ? "下午好，我们把学习进度往前推一点。"
        : "晚上好，适合收束、复盘和整理下一步。";
  const dateLabel = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const isHome = thread.threadType === "semester_home" || !thread.taskId;
  return {
    greeting,
    dateLabel,
    title: isHome ? "Home TaskAgent 建议" : "TaskAgent 建议",
    recommendation: isHome
      ? "先让 Brevyn 扫一眼课程、文件和最近线程，再整理出今天最值得推进的一件事。"
      : "先让 Brevyn 阅读任务材料和评分要求，再拆出一个能在 25 分钟内完成的下一步。",
  };
}

function AgentTimelineGroup({
  group,
  onToggleItemProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  group: ReturnType<typeof useAgentThreadPanelState>["timelineGroups"][number];
  onToggleItemProcess: (item: AgentTimelineViewItem) => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  if (group.type === "user") {
    return <UserTimelineGroup item={group.item} />;
  }

  if (group.type === "system") {
    return <SystemTimelineGroup item={group.item} />;
  }

  if (group.type === "runtime") {
    return (
      <RuntimeTimelineGroup
        item={group.item}
        onApprove={onApprove}
        onReject={onReject}
        onAnswerQuestion={onAnswerQuestion}
        onResolveExitPlan={onResolveExitPlan}
      />
    );
  }

  return (
    <AssistantTurnTimelineGroup
      items={group.items}
      onToggleItemProcess={onToggleItemProcess}
      onApprove={onApprove}
      onReject={onReject}
      onAnswerQuestion={onAnswerQuestion}
      onResolveExitPlan={onResolveExitPlan}
      onCompact={onCompact}
    />
  );
}

function UserTimelineGroup({ item }: { item: AgentTimelineViewItem }) {
  const threadId = useContext(AgentThreadIdContext);
  if (item.displayKind !== "user-message") return null;
  const message = item.record as SDKMessage;
  return <MessageBubble role="user" content={userText(message)} threadId={threadId} attachments={messageAttachments(message)} />;
}

function SystemTimelineGroup({ item }: { item: AgentTimelineViewItem }) {
  if (item.displayKind === "compact-compacting") return <CompactContextNote state="compacting" />;
  if (item.displayKind === "compact-complete") return <CompactContextNote state="complete" />;
  return null;
}

function RuntimeTimelineGroup({
  item,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
}: {
  item: AgentTimelineViewItem;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
}) {
  const { record, displayKind, approvalDecision, questionAnswers, exitPlanDecision } = item;

  if (!isRuntimeRecord(record)) return null;
  if (displayKind === "approval-request" && record.event.type === "approval_requested") {
    return (
      <ApprovalCard
        request={record.event.request}
        decision={approvalDecision}
        onApprove={onApprove}
        onReject={onReject}
      />
    );
  }
  if (displayKind === "question-resolved" && record.event.type === "ask_user_requested") {
    return (
      <ResolvedRuntimeNote
        tone="approved"
        label="已回答问题"
        detail={record.event.request.questions[0]?.question || "Brevyn question"}
      />
    );
  }
  if (displayKind === "question-request" && record.event.type === "ask_user_requested") {
    return (
      <AskUserCard
        request={record.event.request}
        resolvedAnswers={questionAnswers}
        onAnswer={onAnswerQuestion}
      />
    );
  }
  if (displayKind === "exit-plan-resolved" && record.event.type === "exit_plan_requested") {
    return (
      <ResolvedRuntimeNote
        tone={exitPlanDecision === "approve" ? "approved" : "denied"}
        label={exitPlanDecision === "approve" ? "已批准计划" : "已要求修改计划"}
        detail={exitPlanSummary(record.event.request)}
      />
    );
  }
  if (displayKind === "exit-plan-request" && record.event.type === "exit_plan_requested") {
    return (
      <ExitPlanCard
        request={record.event.request}
        decision={exitPlanDecision}
        onResolve={onResolveExitPlan}
      />
    );
  }
  return null;
}

function AssistantTurnTimelineGroup({
  items,
  onToggleItemProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  items: AgentTimelineViewItem[];
  onToggleItemProcess: (item: AgentTimelineViewItem) => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  const processHeader = items.find((item) => item.displayKind === "process" && item.processHeader);
  const showTimelineItems = processHeader?.processExpanded ?? true;
  return (
    <div className="group/assistant-turn flex min-w-0 flex-col gap-3">
      {items.map((item) => {
        const timelineItem = isAssistantTurnTimelineItem(item);
        const entry = (
          <AssistantTurnEntry
            item={item}
            onToggleProcess={() => onToggleItemProcess(processHeader ?? item)}
            onApprove={onApprove}
            onReject={onReject}
            onAnswerQuestion={onAnswerQuestion}
            onResolveExitPlan={onResolveExitPlan}
            onCompact={onCompact}
          />
        );
        if (timelineItem) {
          return (
            <TimelineItemDrawer key={assistantTurnItemKey(item)} open={showTimelineItems}>
              {entry}
            </TimelineItemDrawer>
          );
        }
        return (
          <div key={assistantTurnItemKey(item)}>
            {entry}
          </div>
        );
      })}
      <AssistantTurnCopyAction items={items} />
    </div>
  );
}

function TimelineItemDrawer({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`${
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0"
      } grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={`${
            open ? "translate-y-0" : "-translate-y-1.5"
          } transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function assistantTurnItemKey(item: AgentTimelineViewItem): string {
  if (item.displayKind === "process") return `process-${item.processKey}`;
  if (item.contentBlockIndex !== undefined && (item.displayKind === "stream" || item.displayKind === "assistant-final" || item.displayKind === "thinking")) {
    return `${item.displayKind}-block-${item.contentBlockIndex}`;
  }
  const tool = item.processEvents.find((event): event is Extract<ProcessEvent, { kind: "tool_use" }> => event.kind === "tool_use");
  if (tool) return `tool-${tool.tool.id || tool.id}`;
  const blockKey = item.contentBlockIndex === undefined ? "" : `-block-${item.contentBlockIndex}`;
  return `${item.displayKind}-${recordKey(item.record)}${blockKey}`;
}

function isAssistantTurnTimelineItem(item: AgentTimelineViewItem): boolean {
  return item.displayKind === "thinking"
    || item.displayKind === "tool-use"
    || item.displayKind === "tool-group"
    || item.displayKind === "approval-request"
    || item.displayKind === "question-request"
    || item.displayKind === "question-resolved"
    || item.displayKind === "exit-plan-request"
    || item.displayKind === "exit-plan-resolved";
}

function AssistantTurnEntry({
  item,
  onToggleProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  item: AgentTimelineViewItem;
  onToggleProcess: () => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  const threadId = useContext(AgentThreadIdContext);
  const {
    record,
    displayKind,
    assistantContent,
    promptTooLongMessage,
    providerErrorMessage,
    processHeader,
    assistantCopyContent,
    stoppedByUser,
    processSummary,
    processEvents,
    changedFiles,
    processExpanded,
    processLockedOpen,
  } = item;

  if (displayKind === "hidden" || displayKind === "user-message") return null;

  if (displayKind === "compact-compacting" || displayKind === "compact-complete") {
    return <SystemTimelineGroup item={item} />;
  }

  if (isRuntimeRecord(record)) {
    return (
      <RuntimeTimelineGroup
        item={item}
        onApprove={onApprove}
        onReject={onReject}
        onAnswerQuestion={onAnswerQuestion}
        onResolveExitPlan={onResolveExitPlan}
      />
    );
  }

  if (displayKind === "stream") {
    return (
      <div>
        <AssistantTextBubble content={item.streamContent || ""} threadId={threadId} streaming animateReveal={false} initialContent="" copyable={false} />
      </div>
    );
  }

  if (displayKind === "process") {
    return <AttachedProcess item={item} onToggle={onToggleProcess} />;
  }

  if (displayKind === "thinking") {
    return (
      <div className="px-1 py-1 text-xs leading-5 text-foreground">
        <div className="brevyn-thinking-markdown opacity-95">
          <Markdownish content={assistantContent || ""} threadId={threadId} />
        </div>
      </div>
    );
  }

  if (displayKind === "tool-use") {
    const event = processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
    if (!event) return null;
    return <OrderedToolUseEntry event={event} />;
  }

  if (displayKind === "tool-group") {
    const events = processEvents.filter((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
    if (events.length === 0) return null;
    return <OrderedToolGroupEntry events={events} />;
  }

  if (displayKind === "prompt-too-long") {
    return (
      <div className="space-y-2">
        <AttachedProcess item={item} onToggle={onToggleProcess} />
        <PromptTooLongCard message={promptTooLongMessage || ""} onCompact={onCompact} />
      </div>
    );
  }

  if (displayKind === "provider-error") {
    return (
      <div className="space-y-2">
        <AttachedProcess item={item} onToggle={onToggleProcess} />
        <ProviderErrorCard message={providerErrorMessage || processSummary?.detail || "Provider request failed."} />
      </div>
    );
  }

  if (displayKind === "assistant-final") {
    return (
      <div className="space-y-2">
        <AttachedProcess item={item} onToggle={onToggleProcess} />
        <AssistantTextBubble
          content={assistantContent || ""}
          streaming={false}
          animateReveal={false}
          copyable={false}
          copyContent={assistantCopyContent}
          threadId={threadId}
          stoppedByUser={stoppedByUser}
        />
        {changedFiles.length > 0 && <ChangedFilesSummary changes={changedFiles} />}
      </div>
    );
  }

  return null;
}

function AssistantTurnCopyAction({ items }: { items: AgentTimelineViewItem[] }) {
  const [copied, setCopied] = useState(false);
  const running = items.some((item) => item.processSummary?.running);
  const content = items
    .filter((item) => item.displayKind === "assistant-final")
    .map((item) => item.assistantCopyContent || item.assistantContent || "")
    .filter((text) => text.trim())
    .join("\n\n")
    .trim();

  if (running || !content) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[AgentThreadPanel] Failed to copy assistant turn:", error);
    }
  }

  return (
    <div className="-mt-1 flex justify-start px-1">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/55 opacity-0 transition hover:bg-accent/65 hover:text-foreground hover:opacity-100 focus-visible:bg-accent focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/assistant-turn:opacity-100"
        aria-label={copied ? "Message copied" : "Copy assistant response"}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const OrderedToolUseEntry = memo(function OrderedToolUseEntry({ event }: { event: Extract<ProcessEvent, { kind: "tool_use" }> }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <ToolUseCard
      block={event.tool}
      result={event.result}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
    />
  );
}, areToolEventsEqual);

const OrderedToolGroupEntry = memo(function OrderedToolGroupEntry({ events }: { events: Extract<ProcessEvent, { kind: "tool_use" }>[] }) {
  const [collapsed, setCollapsed] = useState(true);
  const summary = summarizeToolGroup(events);
  return (
    <div className="px-1 py-0.5">
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-2 rounded-md px-0.5 py-1 text-left text-[13px] font-semibold text-muted-foreground/80 transition hover:text-foreground"
        onClick={() => setCollapsed((value) => !value)}
        title={collapsed ? "展开工具详情" : "折叠工具详情"}
      >
        <ToolGlyph toolName={summary.iconToolName} className={`h-4 w-4 shrink-0 opacity-80 ${summary.running ? "animate-pulse" : ""}`} />
        <span className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${summary.running ? "taskagent-sweep-text" : ""}`}>
          {summary.parts.map((part) => (
            <span key={part} className="truncate">{part}</span>
          ))}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <div className="ml-6 space-y-1.5">
            {events.map((event) => (
              <OrderedToolUseEntry key={event.tool.id || event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}, areToolEventListsEqual);

function summarizeToolGroup(events: Extract<ProcessEvent, { kind: "tool_use" }>[]): { iconToolName: string; parts: string[]; running: boolean } {
  const runningEvent = [...events].reverse().find((event) => !event.result);
  if (runningEvent) {
    return {
      iconToolName: runningEvent.tool.name,
      parts: [runningToolLabel(runningEvent)],
      running: true,
    };
  }

  const stats = {
    editedFiles: new Set<string>(),
    exploredFiles: new Set<string>(),
    exploredCount: 0,
    searches: 0,
    commands: 0,
    skills: 0,
    others: 0,
    failed: 0,
  };

  for (const event of events) {
    const toolName = event.tool.name;
    const input = recordObject(event.tool.input);
    if (event.result?.isError) stats.failed += 1;

    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
      const path = stringValue(input.file_path ?? input.filePath ?? input.path, event.tool.id);
      stats.editedFiles.add(path);
      continue;
    }

    if (toolName === "Read") {
      const path = stringValue(input.file_path ?? input.filePath ?? input.path, event.tool.id);
      stats.exploredFiles.add(path);
      continue;
    }

    if (toolName === "Glob" || toolName === "Grep") {
      stats.exploredCount += countResultLines(event.result?.content) || 1;
      continue;
    }

    if (toolName === "WebSearch" || toolName === "WebFetch" || toolName === "mcp__brevyn__rag_search") {
      stats.searches += 1;
      continue;
    }

    if (toolName === "Bash") {
      stats.commands += 1;
      continue;
    }

    if (toolName === "mcp__brevyn__load_skill" || toolName === "mcp__brevyn__read_skill_resource") {
      stats.skills += 1;
      continue;
    }

    stats.others += 1;
  }

  const exploredTotal = stats.exploredFiles.size + stats.exploredCount;
  const parts: string[] = [];
  if (stats.editedFiles.size > 0) parts.push(`已编辑 ${stats.editedFiles.size} 个文件`);
  if (exploredTotal > 0) parts.push(`已探索 ${exploredTotal} 个文件`);
  if (stats.searches > 0) parts.push(`已搜索 ${stats.searches} 次`);
  if (stats.commands > 0) parts.push(`已运行 ${stats.commands} 条命令`);
  if (stats.skills > 0) parts.push(`已加载 ${stats.skills} 个技能`);
  if (stats.others > 0) parts.push(`已使用 ${stats.others} 个工具`);
  if (stats.failed > 0) parts.push(`${stats.failed} 个失败`);

  return {
    iconToolName: stats.editedFiles.size > 0
      ? "Edit"
      : exploredTotal > 0
        ? "Read"
        : stats.searches > 0
          ? "WebSearch"
          : stats.commands > 0
            ? "Bash"
            : events[0]?.tool.name || "Tool",
    parts: parts.length > 0 ? parts : [`已使用 ${events.length} 个工具`],
    running: false,
  };
}

function runningToolLabel(event: Extract<ProcessEvent, { kind: "tool_use" }>): string {
  const toolName = event.tool.name;
  const input = recordObject(event.tool.input);
  if (toolName === "Read") {
    const path = shortPathLabel(stringValue(input.file_path ?? input.filePath ?? input.path, "文件"));
    return `正在读取 ${path}`;
  }
  if (toolName === "Glob") return `正在搜索 ${stringValue(input.pattern, "文件")}`;
  if (toolName === "Grep") return `正在搜索 ${stringValue(input.pattern, "内容")}`;
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    const path = shortPathLabel(stringValue(input.file_path ?? input.filePath ?? input.path, "文件"));
    return `正在编辑 ${path}`;
  }
  if (toolName === "Bash") return `正在运行 ${stringValue(input.command, "命令")}`;
  if (toolName === "WebSearch") return `正在搜索 ${webSearchLabel(input)}`;
  if (toolName === "WebFetch") return `正在打开 ${stringValue(input.url, "网页")}`;
  if (toolName === "mcp__brevyn__rag_search") return `正在检索 ${stringValue(input.query, "课程材料")}`;
  if (toolName === "mcp__brevyn__load_skill") return `正在加载技能 ${stringValue(input.skillId, "skill")}`;
  if (toolName === "mcp__brevyn__read_skill_resource") return `正在读取技能资源`;
  return `正在调用 ${toolName}`;
}

function shortPathLabel(value: string): string {
  const parts = value.split(/[\\/]/g).filter(Boolean);
  return parts.at(-1) || value;
}

function webSearchLabel(input: Record<string, unknown>): string {
  const query = stringValue(input.query, "");
  if (query) return query;
  const queries = Array.isArray(input.queries) ? input.queries : [];
  const first = queries[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  const object = recordObject(first);
  return stringValue(object.query ?? object.search_query ?? object.text, "网页");
}

function countResultLines(content: unknown): number {
  if (typeof content === "string") return content.split("\n").filter((line) => line.trim()).length;
  const data = recordObject(content);
  const text = stringValue(data.stdout ?? data.text ?? data.content, "");
  return text ? text.split("\n").filter((line) => line.trim()).length : 0;
}

function areToolEventsEqual(
  previous: { event: Extract<ProcessEvent, { kind: "tool_use" }> },
  next: { event: Extract<ProcessEvent, { kind: "tool_use" }> },
): boolean {
  return previous.event.tool === next.event.tool
    && previous.event.result === next.event.result
    && previous.event.approvalDecision === next.event.approvalDecision;
}

function areToolEventListsEqual(
  previous: { events: Extract<ProcessEvent, { kind: "tool_use" }>[] },
  next: { events: Extract<ProcessEvent, { kind: "tool_use" }>[] },
): boolean {
  if (previous.events.length !== next.events.length) return false;
  return previous.events.every((event, index) => {
    const nextEvent = next.events[index];
    return Boolean(nextEvent)
      && event.tool === nextEvent.tool
      && event.result === nextEvent.result
      && event.approvalDecision === nextEvent.approvalDecision;
  });
}

function AttachedProcess({
  item,
  onToggle,
}: {
  item: AgentTimelineViewItem;
  onToggle: () => void;
}) {
  const {
    processHeader,
    processSummary,
    processExpanded,
    processLockedOpen,
    processCollapsible,
  } = item;

  if (processHeader && processSummary) {
    return (
      <ProcessTimelinePanel
        summary={processSummary}
        expanded={processExpanded}
        lockedOpen={processLockedOpen}
        collapsible={processCollapsible}
        onToggle={onToggle}
      />
    );
  }

  return null;
}

function messageAttachments(message: SDKMessage): AgentAttachment[] {
  const attachments = (message as unknown as { _attachments?: unknown })._attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = item as Partial<AgentAttachment>;
    if (!value.path || !value.name) return [];
    return [{
      id: value.id || value.path,
      threadId: value.threadId || "",
      name: value.name,
      kind: value.kind || "unknown",
      mimeType: value.mimeType,
      size: typeof value.size === "number" ? value.size : 0,
      sizeLabel: value.sizeLabel || "",
      path: value.path,
      createdAt: value.createdAt || "",
    }];
  });
}

function runSummaryTone(status: RunSummary["status"]): { text: string; dot: string; detail: string } {
  if (status === "running") {
    return {
      text: "text-muted-foreground",
      dot: "bg-amber-500",
      detail: "border-amber-200 bg-amber-50/75 text-amber-900",
    };
  }
  if (status === "completed") {
    return {
      text: "text-muted-foreground",
      dot: "bg-emerald-500",
      detail: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    };
  }
  if (status === "stopped") {
    return {
      text: "text-muted-foreground",
      dot: "bg-stone-400",
      detail: "border-border bg-muted/45 text-muted-foreground",
    };
  }
  if (status === "interrupted") {
    return {
      text: "text-amber-800",
      dot: "bg-amber-600",
      detail: "border-amber-200 bg-amber-50/75 text-amber-900",
    };
  }
  return {
    text: "text-red-700",
    dot: "bg-red-500",
    detail: "border-red-200 bg-red-50/75 text-red-900",
  };
}
