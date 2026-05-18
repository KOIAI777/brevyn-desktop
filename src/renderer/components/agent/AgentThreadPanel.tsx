import { useContext } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ChevronDown, ListTodo, Loader2 } from "lucide-react";
import { type AgentAttachment, type AgentPermissionMode, type BrevynAgentTimelineRecord, type ModelProviderConfig, type Thread, type WorkspaceFileNode } from "../../../types/domain";
import brevynLogoUrl from "@/assets/brevyn-marginal-mark.svg";
import { AgentComposer, type QueuedAgentMessage } from "@/components/agent/AgentComposer";
import { CompactContextNote, MessageBubble, PromptTooLongCard, ProviderErrorCard, ResolvedRuntimeNote, RevealedAssistantBubble, StreamingMessageBubble } from "@/components/agent/AgentMessageParts";
import { InlineProcessTimeline as BaseInlineProcessTimeline, ProcessTimelinePanel as BaseProcessTimelinePanel } from "@/components/agent/AgentProcessTimeline";
import { FilePathPreviewProvider } from "@/components/chat/FilePathChip";
import type { ChangedFileSummary } from "@/components/agent/agentChangedFilesModel";
import type { AgentTimelineRecord, ProcessEvent, RunSummary } from "@/components/agent/agentTimelineModel";
import {
  exitPlanSummary,
  isRuntimeRecord,
  recordKey,
  toolResultSummary,
  toolTitle,
  userText,
} from "@/components/agent/agentTimelineModel";
import { useAgentThreadPanelState } from "@/components/agent/useAgentThreadPanelState";
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
    timelineItems,
    liveAssistantText,
    todos,
    contextUsage,
    compacting,
    effectiveRunning,
    effectiveCompacting,
    queuedMessages,
    sentQueuedMessages,
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
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-5" style={{ paddingBottom: timelineBottomInset }}>
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
              {timelineItems.map((item, index) => {
                return (
                  <AgentRecordItem
                    key={recordKey(item.record, index)}
                    record={item.record}
                    displayKind={item.displayKind}
                    assistantContent={item.assistantContent}
                    promptTooLongMessage={item.promptTooLongMessage}
                    providerErrorMessage={item.providerErrorMessage}
                    attachProcess={item.attachProcess}
                    processHeader={item.processHeader}
                    processNarration={item.processNarration}
                    assistantCopyContent={item.assistantCopyContent}
                    stoppedByUser={item.stoppedByUser}
                    approvalDecision={item.approvalDecision}
                    questionAnswers={item.questionAnswers}
                    exitPlanDecision={item.exitPlanDecision}
                    processSummary={item.processSummary}
                    processEvents={item.processEvents}
                    changedFiles={item.changedFiles}
                    processExpanded={item.processExpanded}
                    processLockedOpen={item.processLockedOpen}
                    onToggleProcess={() => toggleProcessCollapsed(item.processKey, item.defaultCollapsed, item.processLockedOpen)}
                    onApprove={onApprove}
                    onReject={onReject}
                    onAnswerQuestion={onAnswerQuestion}
                    onResolveExitPlan={onResolveExitPlan}
                    onCompact={() => void handleCompact()}
                  />
                );
              })}
              {sentQueuedMessages.map((message) => (
                <QueuedTimelineMessage key={message.id} message={message} />
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

function QueuedTimelineMessage({ message }: { message: QueuedAgentMessage }) {
  return (
    <div className="space-y-1">
      <MessageBubble role="user" content={message.prompt} copyable={false} />
      <div className="flex justify-end">
        <span className="rounded-full border border-border/65 bg-background/62 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
          发送中
        </span>
      </div>
    </div>
  );
}

function ProcessTimelinePanel({
  summary,
  events,
  expanded,
  lockedOpen,
  onToggle,
}: {
  summary: RunSummary;
  events: ProcessEvent[];
  expanded: boolean;
  lockedOpen: boolean;
  onToggle: () => void;
}) {
  const threadId = useContext(AgentThreadIdContext);
  return (
    <BaseProcessTimelinePanel
      summary={summary}
      events={events}
      expanded={expanded}
      lockedOpen={lockedOpen}
      onToggle={onToggle}
      threadId={threadId}
      toolTitle={toolTitle}
      renderToolTitle={(toolName, input, options) => <ToolTitle toolName={toolName} input={input} threadId={threadId} isError={options?.isError} />}
      toolResultSummary={toolResultSummary}
      runSummaryTone={runSummaryTone}
      renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
      renderToolUseCard={(event, toggle, collapsed) => (
        <ToolUseCard
          block={event.tool}
          result={event.result}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
        />
      )}
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

function InlineProcessTimeline({ events }: { events: ProcessEvent[] }) {
  const threadId = useContext(AgentThreadIdContext);
  return (
    <BaseInlineProcessTimeline
      events={events}
      threadId={threadId}
      toolTitle={toolTitle}
      renderToolTitle={(toolName, input, options) => <ToolTitle toolName={toolName} input={input} threadId={threadId} isError={options?.isError} />}
      toolResultSummary={toolResultSummary}
      runSummaryTone={runSummaryTone}
      renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
      renderToolUseCard={(event, toggle, collapsed) => (
        <ToolUseCard
          block={event.tool}
          result={event.result}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
        />
      )}
    />
  );
}

function AgentRecordItem({
  record,
  displayKind,
  assistantContent,
  promptTooLongMessage,
  providerErrorMessage,
  attachProcess,
  processHeader,
  processNarration,
  assistantCopyContent,
  stoppedByUser,
  approvalDecision,
  questionAnswers,
  exitPlanDecision,
  processSummary,
  processEvents,
  changedFiles,
  processExpanded,
  processLockedOpen,
  onToggleProcess,
  onApprove,
  onReject,
  onAnswerQuestion,
  onResolveExitPlan,
  onCompact,
}: {
  record: AgentTimelineRecord;
  displayKind: ReturnType<typeof useAgentThreadPanelState>["timelineItems"][number]["displayKind"];
  assistantContent?: string;
  promptTooLongMessage?: string;
  providerErrorMessage?: string;
  attachProcess: boolean;
  processHeader: boolean;
  processNarration: boolean;
  assistantCopyContent?: string;
  stoppedByUser: boolean;
  approvalDecision?: "allow" | "deny";
  questionAnswers?: Record<string, string>;
  exitPlanDecision?: "approve" | "deny";
  processSummary: RunSummary | null;
  processEvents: ProcessEvent[];
  changedFiles: ChangedFileSummary[];
  processExpanded: boolean;
  processLockedOpen: boolean;
  onToggleProcess: () => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string>) => Promise<void>;
  onResolveExitPlan: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
  onCompact: () => void;
}) {
  const threadId = useContext(AgentThreadIdContext);

  if (displayKind === "hidden") return null;

  if (displayKind === "stream") {
    const streamRecord = record as Extract<AgentTimelineRecord, { kind: "stream" }>;
    return (
      <div className="space-y-3">
        {attachProcess && processSummary && processHeader && (
          <ProcessTimelinePanel
            summary={processSummary}
            events={processEvents}
            expanded={processExpanded}
            lockedOpen={processLockedOpen}
            onToggle={onToggleProcess}
          />
        )}
        {attachProcess && processExpanded && (!processHeader || !processSummary) && <InlineProcessTimeline events={processEvents} />}
        <StreamingMessageBubble content={streamRecord.text} threadId={threadId} active={processSummary?.running ?? true} />
      </div>
    );
  }

  if (displayKind === "process") {
    if (!processSummary) return null;
    return processHeader ? (
      <ProcessTimelinePanel
        summary={processSummary}
        events={processEvents}
        expanded={processExpanded}
        lockedOpen={processLockedOpen}
        onToggle={onToggleProcess}
      />
    ) : processExpanded ? <InlineProcessTimeline events={processEvents} /> : null;
  }

  if (displayKind === "compact-compacting") {
    return <CompactContextNote state="compacting" />;
  }

  if (displayKind === "compact-complete") {
    return <CompactContextNote state="complete" />;
  }

  if (isRuntimeRecord(record)) {
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

  const message = record as SDKMessage;
  if (displayKind === "user-message") {
    return <MessageBubble role="user" content={userText(message)} threadId={threadId} attachments={messageAttachments(message)} />;
  }

  if (displayKind === "prompt-too-long") {
    return (
      <div className="space-y-2">
        {attachProcess && processSummary && processHeader && (
          <ProcessTimelinePanel
            summary={processSummary}
            events={processEvents}
            expanded={processExpanded}
            lockedOpen={processLockedOpen}
            onToggle={onToggleProcess}
          />
        )}
        {attachProcess && processExpanded && (!processHeader || !processSummary) && <InlineProcessTimeline events={processEvents} />}
        <PromptTooLongCard message={promptTooLongMessage || ""} onCompact={onCompact} />
      </div>
    );
  }

  if (displayKind === "provider-error") {
    return (
      <div className="space-y-2">
        {attachProcess && processSummary && processHeader && (
          <ProcessTimelinePanel
            summary={processSummary}
            events={processEvents}
            expanded={processExpanded}
            lockedOpen={processLockedOpen}
            onToggle={onToggleProcess}
          />
        )}
        {attachProcess && processExpanded && (!processHeader || !processSummary) && <InlineProcessTimeline events={processEvents} />}
        <ProviderErrorCard message={providerErrorMessage || processSummary?.detail || "Provider request failed."} />
      </div>
    );
  }

  if (displayKind === "assistant-process-only") {
    if (!processHeader || !processSummary) return processExpanded ? <InlineProcessTimeline events={processEvents} /> : null;
    return (
      <ProcessTimelinePanel
        summary={processSummary}
        events={processEvents}
        expanded={processExpanded}
        lockedOpen={processLockedOpen}
        onToggle={onToggleProcess}
      />
    );
  }

  if (displayKind === "assistant-narration") {
      const inline = processExpanded ? <InlineProcessTimeline events={processEvents} /> : null;
      if (!processHeader || !processSummary) return inline;
      return (
        <div className="space-y-2">
          <ProcessTimelinePanel
            summary={processSummary}
            events={processEvents}
            expanded={processExpanded}
            lockedOpen={processLockedOpen}
            onToggle={onToggleProcess}
          />
        </div>
      );
  }

  if (displayKind === "assistant-final") {
    return (
      <div className="space-y-2">
        {attachProcess && processSummary && processHeader && (
          <ProcessTimelinePanel
            summary={processSummary}
            events={processEvents}
            expanded={processExpanded}
            lockedOpen={processLockedOpen}
            onToggle={onToggleProcess}
          />
        )}
        {attachProcess && processExpanded && (!processHeader || !processSummary) && <InlineProcessTimeline events={processEvents} />}
        <RevealedAssistantBubble
          content={assistantContent || ""}
          copyable={Boolean(assistantCopyContent)}
          copyContent={assistantCopyContent}
          threadId={threadId}
          stoppedByUser={stoppedByUser}
          animateReveal={Boolean(processSummary?.running)}
        />
        {changedFiles.length > 0 && <ChangedFilesSummary changes={changedFiles} />}
      </div>
    );
  }

  if (displayKind === "result-process") {
    return processHeader ? (
      <ProcessTimelinePanel
        summary={processSummary as RunSummary}
        events={processEvents}
        expanded={processExpanded}
        lockedOpen={processLockedOpen}
        onToggle={onToggleProcess}
      />
    ) : processExpanded ? <InlineProcessTimeline events={processEvents} /> : null;
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
