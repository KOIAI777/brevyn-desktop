import { memo, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Check, ChevronDown, Copy, ListTodo, Loader2, ShieldAlert } from "lucide-react";
import { type AgentAttachment, type AgentPermissionMode, type BrevynAgentTimelineRecord, type ModelProviderConfig, type SkillItem, type Thread, type WorkspaceFileNode } from "../../../types/domain";
import brevynAppIconUrl from "@/assets/brevyn-app-icon.png";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { AssistantTextBubble, CompactContextNote, PromptTooLongCard, ProviderErrorCard, ResolvedRuntimeNote, RetryRuntimeNote, StreamingMarkdownish, UserMessageBubble } from "@/components/agent/AgentMessageParts";
import { ProcessTimelinePanel as BaseProcessTimelinePanel } from "@/components/agent/AgentProcessTimeline";
import { FilePathPreviewProvider } from "@/components/chat/FilePathChip";
import type { ProcessEvent, RunSummary } from "@/components/agent/agentTimelineModel";
import {
  exitPlanSummary,
  isRuntimeRecord,
  userText,
} from "@/components/agent/agentTimelineModel";
import { useAgentThreadPanelState } from "@/components/agent/useAgentThreadPanelState";
import type { AgentTimelineTurnEntry, AgentTimelineViewItem } from "@/components/agent/useAgentTimelineState";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import { ApprovalCard, AskUserCard, ExitPlanCard } from "@/components/agent/AgentRuntimeCards";
import { ToolGlyph, ToolTitle, ToolUseCard } from "@/components/agent/AgentToolRenderers";
import { getModelLogoById, getProviderBaseUrlLogo } from "@/lib/model-provider-logo";

interface AgentThreadPanelProps {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  loading: boolean;
  running: boolean;
  error?: string;
  onRun: (prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<void>;
  onRunForThread: (threadId: string, prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<void>;
  onStop: () => Promise<void>;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onSelectProvider: (providerId: string) => Promise<void>;
  files: WorkspaceFileNode[];
  skills: SkillItem[];
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
  onRunForThread,
  onStop,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  agentProviders,
  activeProviderId,
  onSelectProvider,
  files,
  skills,
  onPreviewFilePath,
}: AgentThreadPanelProps) {
  const {
    scrollRef,
    contentRef,
    composerDockRef,
    timelineBottomInset,
    isFollowingOutput,
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
    onRunForThread,
  });

  async function handleRun(
    prompt: string,
    nextPermissionMode: AgentPermissionMode = "auto",
    attachments?: AgentAttachment[],
    providerSelection?: { providerId?: string; modelId?: string },
    mentionedSkills?: string[],
  ): Promise<void> {
    const shouldPushLayout = isFollowingOutput;
    const runPromise = onRun(prompt, nextPermissionMode, attachments, providerSelection, mentionedSkills);
    if (shouldPushLayout) {
      window.requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    await runPromise;
  }

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
                  className="timeline-group min-w-0"
                >
                  <AgentTimelineGroup
                    group={group}
                    agentProviders={agentProviders}
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
        permissionMode={permissionMode}
        contextUsage={contextUsage}
        autoCompactThresholdPercent={autoCompactThresholdPercent}
        compacting={effectiveCompacting}
        threadId={thread.id}
        agentProviders={agentProviders}
        activeProviderId={activeProviderId}
        onSetPermissionMode={setPermissionMode}
        onRun={handleRun}
        onQueueMessage={queueMessage}
        onSendQueuedMessage={sendQueuedMessage}
        onDeleteQueuedMessage={deleteQueuedMessage}
        onStop={onStop}
        onCompact={() => void handleCompact()}
        onSelectProvider={onSelectProvider}
        files={files}
        skills={skills}
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
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.35rem] bg-background shadow-sm ring-1 ring-border/35">
        <img src={brevynAppIconUrl} alt="Brevyn" className="h-full w-full object-cover" />
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
  agentProviders,
  onToggleItemProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  group: ReturnType<typeof useAgentThreadPanelState>["timelineGroups"][number];
  agentProviders: ModelProviderConfig[];
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
      entries={group.entries}
      collapsedVisibleEntryKeys={group.collapsedVisibleEntryKeys}
      processItem={group.processItem}
      model={group.model}
      createdAt={group.createdAt}
      agentProviders={agentProviders}
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
  return <UserMessageBubble content={userText(message)} threadId={threadId} attachments={messageAttachments(message)} />;
}

function SystemTimelineGroup({ item }: { item: AgentTimelineViewItem }) {
  if (item.displayKind === "compact-compacting") return <CompactContextNote state="compacting" />;
  if (item.displayKind === "compact-complete") return <CompactContextNote state="complete" />;
  if (item.displayKind === "permission-denied") return <PermissionDeniedNotice record={item.record as SDKMessage} />;
  return null;
}

function PermissionDeniedNotice({ record }: { record: SDKMessage }) {
  const data = record as unknown as {
    tool_name?: unknown;
    message?: unknown;
    decision_reason?: unknown;
    decision_reason_type?: unknown;
  };
  const toolName = typeof data.tool_name === "string" && data.tool_name.trim() ? data.tool_name.trim() : "工具";
  const message = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "SDK 自动审批拒绝了这个操作。";
  const reason = typeof data.decision_reason === "string" && data.decision_reason.trim() ? data.decision_reason.trim() : "";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/72 p-4 text-xs text-amber-950 shadow-sm ring-1 ring-white/45">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-background text-amber-700">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">自动审批已拒绝操作</p>
          <p className="mt-1 leading-5 text-muted-foreground">工具：{toolName}</p>
          <p className="mt-1 break-words leading-5">{message}</p>
          {reason && <p className="mt-1 break-words leading-5 text-muted-foreground">说明：{reason}</p>}
        </div>
      </div>
    </div>
  );
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
  if (displayKind === "run-retrying" && record.event.type === "run_retrying") {
    return (
      <RetryRuntimeNote
        attempt={record.event.retryAttempt}
        maxRetries={record.event.maxRetries}
        reason={record.event.reason}
        delayMs={record.event.delayMs}
      />
    );
  }
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
  entries,
  collapsedVisibleEntryKeys,
  processItem,
  model,
  createdAt,
  agentProviders,
  onToggleItemProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  items: AgentTimelineViewItem[];
  entries: AgentTimelineTurnEntry[];
  collapsedVisibleEntryKeys: string[];
  processItem?: AgentTimelineViewItem;
  model?: string;
  createdAt?: number;
  agentProviders: ModelProviderConfig[];
  onToggleItemProcess: (item: AgentTimelineViewItem) => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  const showTimelineItems = processItem?.processExpanded ?? true;
  const stableBodyTextKeys = new Set(collapsedVisibleEntryKeys);
  const summary = processItem?.processSummary ?? [...items].reverse().find((item) => item.processSummary)?.processSummary ?? null;
  return (
    <div className="group/assistant-turn flex min-w-0 flex-col gap-3">
      {(processItem || entries.length > 0) && (
        <div className="flex min-w-0 flex-col">
          <AssistantTurnHeader model={model} agentProviders={agentProviders} />
          {processItem && (
            <AttachedProcess item={processItem} onToggle={() => onToggleItemProcess(processItem)} />
          )}
          {entries.map((entry, index) => {
            const keepVisibleWhenCollapsed = stableBodyTextKeys.has(entry.key);
            return (
              <TimelineItemsDrawer
                key={entry.key}
                open={showTimelineItems || keepVisibleWhenCollapsed}
                insetTop={Boolean(processItem) || index > 0}
              >
              <AssistantTurnRenderEntryView
                entry={entry}
                processItem={processItem}
                onToggleItemProcess={onToggleItemProcess}
                onApprove={onApprove}
                onReject={onReject}
                onAnswerQuestion={onAnswerQuestion}
                onResolveExitPlan={onResolveExitPlan}
                onCompact={onCompact}
              />
              </TimelineItemsDrawer>
            );
          })}
        </div>
      )}
      <AssistantTurnCopyAction items={items} summary={summary} createdAt={createdAt} />
    </div>
  );
}

function AssistantTurnHeader({
  model,
  agentProviders,
}: {
  model?: string;
  agentProviders: ModelProviderConfig[];
}) {
  const modelId = (model || "").trim();
  if (!modelId) return null;
  const provider = modelId ? agentProviders.find((item) => item.models.some((candidate) => candidate.id === modelId)) : undefined;
  const providerModel = provider?.models.find((candidate) => candidate.id === modelId);
  const modelLabel = providerModel?.name || modelId;
  const logo = getModelLogoById(modelId) || (provider ? getProviderBaseUrlLogo(provider.baseUrl, provider.providerKind) : brevynAppIconUrl);

  return (
    <div className="mb-1 flex min-w-0 items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-[0.45rem] object-contain shadow-sm ring-1 ring-border/55" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-[12px] font-semibold text-foreground/70" title={modelLabel}>{modelLabel}</span>
      </div>
    </div>
  );
}

function formatHeaderTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AssistantTurnRenderEntryView({
  entry,
  processItem,
  onToggleItemProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  entry: AgentTimelineTurnEntry;
  processItem?: AgentTimelineViewItem;
  onToggleItemProcess: (item: AgentTimelineViewItem) => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  const firstItem = entry.type === "tool-group" ? entry.items[0] : entry.item;
  if (!firstItem) return null;

  const rendered = entry.type === "tool-group" ? (
    <OrderedToolGroupEntry entry={entry} />
  ) : (
    <AssistantTurnEntry
      item={entry.item}
      onToggleProcess={() => onToggleItemProcess(processItem ?? entry.item)}
      onApprove={onApprove}
      onReject={onReject}
      onAnswerQuestion={onAnswerQuestion}
      onResolveExitPlan={onResolveExitPlan}
      onCompact={onCompact}
    />
  );

  return (
    <div>
      {rendered}
    </div>
  );
}

function TimelineItemsDrawer({ open, insetTop = false, children }: { open: boolean; insetTop?: boolean; children: ReactNode }) {
  return (
    <div
      className={`${open ? "" : "pointer-events-none"} grid min-w-0 transition-all duration-200 ease-out`}
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
      }}
      aria-hidden={!open}
    >
      <div
        className={`${insetTop ? "pt-2" : ""} flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden`}
      >
        {children}
      </div>
    </div>
  );
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
    stoppedByUser,
    processSummary,
    processEvents,
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

  if (displayKind === "process") {
    return <AttachedProcess item={item} onToggle={onToggleProcess} />;
  }

  if (displayKind === "thinking") {
    return (
      <div className="px-1 py-1 text-xs leading-5 text-foreground">
        <div className="brevyn-thinking-markdown opacity-95">
          <StreamingMarkdownish content={assistantContent || ""} threadId={threadId} streaming={item.assistantStreaming === true} />
        </div>
      </div>
    );
  }

  if (displayKind === "tool-use") {
    const event = processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
    if (!event) return null;
    return <OrderedToolUseEntry event={event} />;
  }

  if (displayKind === "prompt-too-long") {
    return (
      <PromptTooLongCard message={assistantContent || ""} onCompact={onCompact} />
    );
  }

  if (displayKind === "provider-error") {
    return (
      <ProviderErrorCard message={assistantContent || processSummary?.detail || "Provider request failed."} />
    );
  }

  if (displayKind === "assistant-final") {
    return (
      <AssistantTextBubble
        content={assistantContent || ""}
        streaming={item.assistantStreaming === true}
        copyable={false}
        copyContent={assistantContent}
        threadId={threadId}
        stoppedByUser={stoppedByUser}
      />
    );
  }

  return null;
}

function AssistantTurnCopyAction({
  items,
  summary,
  createdAt,
}: {
  items: AgentTimelineViewItem[];
  summary: RunSummary | null;
  createdAt?: number;
}) {
  const [copied, setCopied] = useState(false);
  const running = items.some((item) => item.processSummary?.running);
  const durationLabel = assistantDurationLabel(summary);
  const timeLabel = createdAt ? formatHeaderTime(createdAt) : "";
  const content = items
    .filter((item) => item.displayKind === "assistant-final")
    .map((item) => item.assistantContent || "")
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
    <div className="-mt-1 flex items-center justify-start gap-1.5 px-1 text-[11px] text-muted-foreground/55 opacity-0 transition-opacity group-hover/assistant-turn:opacity-100 focus-within:opacity-100">
      {durationLabel && <span className="select-none">{durationLabel}</span>}
      {durationLabel && timeLabel && <span className="select-none text-muted-foreground/35">·</span>}
      {timeLabel && <span className="select-none">{timeLabel}</span>}
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/65 transition hover:bg-accent/65 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
        aria-label={copied ? "Message copied" : "Copy assistant response"}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function assistantDurationLabel(summary: RunSummary | null): string {
  const label = summary?.label.trim() || "";
  const match = label.match(/(\d+m\s+\d+s|\d+s)/);
  return match?.[1] || "";
}

const OrderedToolUseEntry = memo(function OrderedToolUseEntry({
  event,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
}: {
  event: Extract<ProcessEvent, { kind: "tool_use" }>;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const toggleCollapsed = onToggleCollapsed ?? (() => setInternalCollapsed((value) => !value));
  return (
    <ToolUseCard
      block={event.tool}
      result={event.result}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
    />
  );
}, areOrderedToolUseEntryPropsEqual);

const OrderedToolGroupEntry = memo(function OrderedToolGroupEntry({ entry }: { entry: Extract<AgentTimelineTurnEntry, { type: "tool-group" }> }) {
  const { collapsed, expandedToolIds, toggleCollapsed, toggleTool } = useToolGroupDisclosure(entry.key, entry.summary.running);

  return (
    <div className="px-1 py-0">
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-[13px] font-semibold text-muted-foreground/80 transition hover:text-foreground"
        onClick={toggleCollapsed}
        title={collapsed ? "展开工具详情" : "折叠工具详情"}
      >
        <ToolGlyph toolName={entry.summary.iconToolName} className={`h-4 w-4 shrink-0 opacity-80 ${entry.summary.running ? "animate-pulse" : ""}`} />
        <span className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${entry.summary.running ? "taskagent-sweep-text" : ""}`}>
          {entry.summary.parts.map((part) => (
            <span key={part} className="truncate">{part}</span>
          ))}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      <TimelineItemsDrawer open={!collapsed}>
        {entry.summary.running ? (
          <RunningToolGroupDetails events={entry.toolEvents} expandedToolIds={expandedToolIds} onToggleTool={toggleTool} />
        ) : (
          <div className="ml-6 flex flex-col gap-1">
            {entry.toolEvents.map((event) => (
              <OrderedToolUseEntry key={event.tool.id || event.id} event={event} collapsed={expandedToolIds[event.tool.id || event.id] !== true} onToggleCollapsed={() => toggleTool(event.tool.id || event.id)} />
            ))}
          </div>
        )}
      </TimelineItemsDrawer>
    </div>
  );
});

function useToolGroupDisclosure(groupKey: string, running: boolean): {
  collapsed: boolean;
  expandedToolIds: Record<string, boolean>;
  toggleCollapsed: () => void;
  toggleTool: (toolId: string) => void;
} {
  const [collapsed, setCollapsed] = useState(true);
  const [expandedToolIds, setExpandedToolIds] = useState<Record<string, boolean>>({});
  const [wasRunning, setWasRunning] = useState(running);

  useEffect(() => {
    setCollapsed(true);
    setExpandedToolIds({});
    setWasRunning(running);
  }, [groupKey]);

  useEffect(() => {
    if (wasRunning && !running) {
      setCollapsed(true);
      setExpandedToolIds({});
    }
    if (wasRunning !== running) setWasRunning(running);
  }, [running, wasRunning]);

  function toggleCollapsed() {
    setCollapsed((value) => !value);
  }

  function toggleTool(toolId: string) {
    setExpandedToolIds((current) => ({ ...current, [toolId]: !(current[toolId] === true) }));
  }

  return { collapsed, expandedToolIds, toggleCollapsed, toggleTool };
}

const RunningToolGroupDetails = memo(function RunningToolGroupDetails({
  events,
  expandedToolIds,
  onToggleTool,
}: {
  events: Extract<ProcessEvent, { kind: "tool_use" }>[];
  expandedToolIds: Record<string, boolean>;
  onToggleTool: (toolId: string) => void;
}) {
  return (
    <div className="ml-6 flex flex-col gap-1 rounded-lg border border-border/55 bg-muted/12 p-1">
      {events.map((event) => {
        const toolId = event.tool.id || event.id;
        const running = !event.result;
        const failed = event.result?.isError === true;
        const expanded = expandedToolIds[toolId] === true;
        return (
          <div key={toolId} className="overflow-hidden rounded-md">
            <div
              role="button"
              tabIndex={0}
              className="flex w-full min-w-0 items-start justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
              onClick={() => onToggleTool(toolId)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onToggleTool(toolId);
              }}
              title={expanded ? "折叠工具详情" : "展开工具详情"}
            >
              <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                <ToolGlyph toolName={event.tool.name} className={`h-3.5 w-3.5 shrink-0 ${running ? "animate-pulse" : "opacity-70"}`} />
                <span className="min-w-0">
                  <ToolTitle toolName={event.tool.name} input={event.tool.input} isError={failed} />
                </span>
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${running ? "taskagent-sweep-text" : failed ? "text-destructive" : "text-muted-foreground/75"}`}>
                {failed ? "失败" : running ? "运行中" : "完成"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
              </span>
            </div>
            <TimelineItemsDrawer open={expanded}>
              <div className="px-1 pb-1">
                <OrderedToolUseEntry event={event} collapsed={false} onToggleCollapsed={() => onToggleTool(toolId)} />
              </div>
            </TimelineItemsDrawer>
          </div>
        );
      })}
    </div>
  );
}, areRunningToolGroupDetailsPropsEqual);

function areToolEventsEqual(
  previous: { event: Extract<ProcessEvent, { kind: "tool_use" }> },
  next: { event: Extract<ProcessEvent, { kind: "tool_use" }> },
): boolean {
  return previous.event.tool === next.event.tool
    && previous.event.result === next.event.result
    && previous.event.approvalDecision === next.event.approvalDecision;
}

function areOrderedToolUseEntryPropsEqual(
  previous: {
    event: Extract<ProcessEvent, { kind: "tool_use" }>;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
  },
  next: {
    event: Extract<ProcessEvent, { kind: "tool_use" }>;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
  },
): boolean {
  return previous.collapsed === next.collapsed && areToolEventsEqual(previous, next);
}

function areRunningToolGroupDetailsPropsEqual(
  previous: {
    events: Extract<ProcessEvent, { kind: "tool_use" }>[];
    expandedToolIds: Record<string, boolean>;
  },
  next: {
    events: Extract<ProcessEvent, { kind: "tool_use" }>[];
    expandedToolIds: Record<string, boolean>;
  },
): boolean {
  if (previous.events.length !== next.events.length) return false;
  const sameEvents = previous.events.every((event, index) => {
    const nextEvent = next.events[index];
    return Boolean(nextEvent)
      && event.tool === nextEvent.tool
      && event.result === nextEvent.result
      && event.approvalDecision === nextEvent.approvalDecision;
  });
  if (!sameEvents) return false;
  const previousExpanded = Object.keys(previous.expandedToolIds);
  const nextExpanded = Object.keys(next.expandedToolIds);
  if (previousExpanded.length !== nextExpanded.length) return false;
  return previousExpanded.every((toolId) => previous.expandedToolIds[toolId] === next.expandedToolIds[toolId]);
}

function AttachedProcess({
  item,
  onToggle,
}: {
  item: AgentTimelineViewItem;
  onToggle: () => void;
}) {
  const { processSummary, processExpanded, processLockedOpen, processCollapsible } = item;

  if (item.displayKind === "process" && processSummary) {
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
