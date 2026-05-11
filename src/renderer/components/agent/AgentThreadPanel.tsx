import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Check, FileText, FolderOpen, Globe, HelpCircle, ListTodo, Loader2, MessageCircleQuestion, Pencil, Search, Send, ShieldAlert, ShieldCheck, TerminalSquare, X } from "lucide-react";
import type { AgentApprovalRequest, AgentAskUserRequest, AgentExitPlanRequest, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread, WorkspaceFileNode } from "@/types/domain";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { CompactContextNote, MessageBubble, PromptTooLongCard, ResolvedRuntimeNote, RevealedAssistantBubble, StreamingMessageBubble } from "@/components/agent/AgentMessageParts";
import { InlineProcessTimeline as BaseInlineProcessTimeline, ProcessTimelinePanel as BaseProcessTimelinePanel } from "@/components/agent/AgentProcessTimeline";
import { ToolInputPreview, ToolUseCard as BaseToolUseCard } from "@/components/agent/AgentToolCards";
import { FilePathChip, FilePathPreviewProvider } from "@/components/chat/FilePathChip";
import type { AgentTimelineRecord, AgentTodoItem, ContextUsage, ProcessEvent, RunSummary, ToolResultBlock, ToolUseBlock } from "@/components/agent/agentTimelineModel";
import {
  agentErrorMessage,
  answerKey,
  approvalDecision,
  approvalResolutionMap,
  assistantBlocks,
  assistantText,
  buildTimelineRenderMeta,
  defaultQuestionAnswers,
  exitPlanDecision,
  exitPlanResolutionMap,
  exitPlanSummary,
  formatDiffStats,
  formatToolResultContent,
  formatUnknown,
  isBoundaryRecord,
  isCompactCommandMessage,
  isCompactPlaceholderRecord,
  isProcessPlaceholderRecord,
  isPromptTooLongMessage,
  isRuntimeRecord,
  isStreamRecord,
  nextQuestionAnswer,
  questionAnswers,
  questionResolutionMap,
  recordKey,
  recordObject,
  latestTurnBounds,
  singleLine,
  stringValue,
  toolDiffStats,
  toolResultBlocks,
  toolResultSummary,
  toolTitle,
  truncatePreview,
  userText,
} from "@/components/agent/agentTimelineModel";

interface AgentThreadPanelProps {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  loading: boolean;
  running: boolean;
  error?: string;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode) => Promise<void>;
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

const CHAT_BODY_WIDTH_CLASS = "mx-auto w-full max-w-[54rem]";
const AgentThreadIdContext = createContext<string | undefined>(undefined);
const AGENT_PERMISSION_STORAGE_PREFIX = "brevyn.agent.permissionMode.";

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const [timelineBottomInset, setTimelineBottomInset] = useState(224);
  const [processCollapsed, setProcessCollapsed] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>("review");
  const [compactInFlightAfterCount, setCompactInFlightAfterCount] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const resolvedApprovals = useMemo(() => approvalResolutionMap(records), [records]);
  const resolvedQuestions = useMemo(() => questionResolutionMap(records), [records]);
  const resolvedExitPlans = useMemo(() => exitPlanResolutionMap(records), [records]);
  const rawRunSummary = useMemo(() => latestRunSummary(records, nowMs, running), [nowMs, records, running]);
  const effectiveRunning = running && (!rawRunSummary || rawRunSummary.status === "running");
  const compactInFlight = compactInFlightAfterCount !== null;
  const timelineRecords = useMemo(() => normalizeTimelineRecords(records, effectiveRunning, compactInFlight), [compactInFlight, effectiveRunning, records]);
  const renderMeta = useMemo(() => buildTimelineRenderMeta(timelineRecords), [timelineRecords]);
  const liveAssistantText = renderMeta.hasLiveAssistantText;
  const forceProcessOpen = effectiveRunning && !liveAssistantText;
  const runSummary = useMemo(() => latestRunSummary(records, nowMs, effectiveRunning), [effectiveRunning, nowMs, records]);
  const stoppedAssistantIndex = useMemo(() => runSummary?.status === "stopped" ? latestCopyableAssistantIndex(renderMeta) : undefined, [renderMeta, runSummary?.status]);
  const todos = useMemo(() => latestTodoList(records), [records]);
  const activeProvider = useMemo(() => agentProviders.find((provider) => provider.id === activeProviderId), [activeProviderId, agentProviders]);
  const contextUsage = useMemo(() => latestContextUsage(records) ?? defaultContextUsage(activeProvider?.selectedModel), [activeProvider?.selectedModel, records]);
  const compacting = useMemo(() => isCompactingContext(records), [records]);
  const effectiveCompacting = compacting || compactInFlight;

  useEffect(() => {
    setPermissionMode(readStoredPermissionMode(thread.id));
  }, [thread.id]);

  function handleSetPermissionMode(mode: AgentPermissionMode) {
    setPermissionMode(mode);
    writeStoredPermissionMode(thread.id, mode);
  }

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [records.length, timelineRecords.length, effectiveRunning, loading]);

  useEffect(() => {
    if (forceProcessOpen) {
      setProcessCollapsed(false);
      return;
    }
    if (liveAssistantText) setProcessCollapsed(true);
  }, [forceProcessOpen, liveAssistantText]);

  useEffect(() => {
    if (!effectiveRunning) {
      setNowMs(Date.now());
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [effectiveRunning]);

  useEffect(() => {
    setCompactInFlightAfterCount(null);
  }, [thread.id]);

  useEffect(() => {
    if (compactInFlightAfterCount === null || records.length <= compactInFlightAfterCount) return;
    const bounds = latestTurnBounds(records);
    if (!bounds) return;
    if (!isCompactCommandMessage(bounds.user)) {
      setCompactInFlightAfterCount(null);
      return;
    }
    const summary = latestRunSummary(records, nowMs, running);
    if (summary && summary.status !== "running") setCompactInFlightAfterCount(null);
  }, [compactInFlightAfterCount, nowMs, records, running]);

  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock) return;

    const updateInset = () => {
      const nextInset = Math.ceil(dock.getBoundingClientRect().height + 28);
      setTimelineBottomInset(nextInset);
      window.requestAnimationFrame(() => {
        const scrollNode = scrollRef.current;
        if (scrollNode) scrollNode.scrollTo({ top: scrollNode.scrollHeight, behavior: "smooth" });
      });
    };

    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [todos.length]);

  async function handleCompact() {
    if (effectiveRunning || effectiveCompacting) return;
    setCompactInFlightAfterCount(records.length);
    try {
      await onRun("/compact", "execute", "review");
    } catch (error) {
      setCompactInFlightAfterCount(null);
      throw error;
    }
  }

  return (
    <AgentThreadIdContext.Provider value={thread.id}>
    <FilePathPreviewProvider onPreviewFilePath={onPreviewFilePath}>
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,244,236,0.62))]">
      <div className="flex items-center justify-between border-b bg-card/70 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{thread.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Claude Agent SDK session · JSONL replay</p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-5" style={{ paddingBottom: timelineBottomInset }}>
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading session timeline
          </div>
        ) : timelineRecords.length === 0 ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-background shadow-sm">
              <TerminalSquare className="h-5 w-5 text-foreground" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">Start this study run</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Ask Brevyn to inspect this workspace, explain uploaded material, or draft next steps. Tool calls will appear inline as SDK messages.
            </p>
          </div>
        ) : (
          <div className={`${CHAT_BODY_WIDTH_CLASS} flex min-w-0 flex-col gap-3`}>
            {timelineRecords.map((record, index) => {
              const meta = renderMeta.byIndex.get(index);
              const itemSummary = meta?.processUserIndex === undefined
                ? runSummary
                : runSummaryForUserIndex(records, meta.processUserIndex, nowMs, effectiveRunning);
              return (
                <AgentRecordItem
                  key={recordKey(record, index)}
                  record={record}
                  attachProcess={Boolean(meta?.attachProcess)}
                  processHeader={Boolean(meta?.processHeader)}
                  processNarration={Boolean(meta?.processNarration)}
                  assistantCopyContent={meta?.assistantCopyContent}
                  stoppedByUser={index === stoppedAssistantIndex}
                  approvalDecision={approvalDecision(record, resolvedApprovals)}
                  questionAnswers={questionAnswers(record, resolvedQuestions)}
                  exitPlanDecision={exitPlanDecision(record, resolvedExitPlans)}
                  processSummary={itemSummary}
                  processEvents={meta?.processEvents || []}
                  processExpanded={forceProcessOpen || !processCollapsed}
                  processLockedOpen={forceProcessOpen}
                  onToggleProcess={() => {
                    if (!forceProcessOpen) setProcessCollapsed((current) => !current);
                  }}
                  onApprove={onApprove}
                  onReject={onReject}
                  onAnswerQuestion={onAnswerQuestion}
                  onResolveExitPlan={onResolveExitPlan}
                  onCompact={() => void handleCompact()}
                />
              );
            })}
          </div>
        )}
      </div>

      {error && <div className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">{error}</div>}

      <AgentComposer
        dockRef={composerDockRef}
        todos={todos}
        running={effectiveRunning}
        planMode={planMode}
        permissionMode={permissionMode}
        contextUsage={contextUsage}
        compacting={effectiveCompacting}
        agentProviders={agentProviders}
        activeProviderId={activeProviderId}
        onSetPlanMode={setPlanMode}
        onSetPermissionMode={handleSetPermissionMode}
        onRun={onRun}
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
      renderToolUseCard={(event, toggle) => (
        <ToolUseCard
          block={event.tool}
          result={event.result}
          collapsed={false}
          onToggleCollapsed={toggle ?? (() => undefined)}
        />
      )}
    />
  );
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
      renderToolUseCard={(event, toggle) => (
        <ToolUseCard
          block={event.tool}
          result={event.result}
          collapsed={false}
          onToggleCollapsed={toggle ?? (() => undefined)}
        />
      )}
    />
  );
}

function AgentRecordItem({
  record,
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

  if (isStreamRecord(record)) {
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
        <StreamingMessageBubble content={record.text} threadId={threadId} />
      </div>
    );
  }

  if (isProcessPlaceholderRecord(record)) {
    if (!attachProcess || !processSummary) return null;
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

  if (isCompactPlaceholderRecord(record)) {
    return <CompactContextNote state="compacting" />;
  }

  if (isRuntimeRecord(record)) {
    if (record.event.type === "approval_requested") {
      if (approvalDecision) {
        return null;
      }
      return (
        <ApprovalCard
          request={record.event.request}
          decision={approvalDecision}
          onApprove={onApprove}
          onReject={onReject}
        />
      );
    }
    if (record.event.type === "ask_user_requested") {
      if (questionAnswers) {
        return (
          <ResolvedRuntimeNote
            tone="approved"
            label="已回答问题"
            detail={record.event.request.questions[0]?.question || "Brevyn question"}
          />
        );
      }
      return (
        <AskUserCard
          request={record.event.request}
          resolvedAnswers={questionAnswers}
          onAnswer={onAnswerQuestion}
        />
      );
    }
    if (record.event.type === "exit_plan_requested") {
      if (exitPlanDecision) {
        return (
          <ResolvedRuntimeNote
            tone={exitPlanDecision === "approve" ? "approved" : "denied"}
            label={exitPlanDecision === "approve" ? "已批准计划" : "已要求修改计划"}
            detail={exitPlanSummary(record.event.request)}
          />
        );
      }
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
  if (message.type === "user") {
    if (isCompactCommandMessage(message)) return null;
    if (toolResultBlocks(message).length) return null;
    return <MessageBubble role="user" content={userText(message)} threadId={threadId} />;
  }

  if (message.type === "assistant") {
    if (isPromptTooLongMessage(message)) {
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
          <PromptTooLongCard message={assistantText(message) || agentErrorMessage(message)} onCompact={onCompact} />
        </div>
      );
    }
    const blocks = assistantBlocks(message).filter((block) => block.type === "text");
    if (blocks.length === 0) {
      if (!attachProcess) return null;
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
    if (processNarration) {
      if (!attachProcess) return null;
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
          {inline}
        </div>
      );
    }
    const content = blocks.map((block) => block.text).join("\n\n");
    if (attachProcess && processSummary?.status === "running" && !assistantCopyContent) {
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
          content={content}
          copyable={Boolean(assistantCopyContent)}
          copyContent={assistantCopyContent}
          threadId={threadId}
          stoppedByUser={stoppedByUser}
          animateReveal={Boolean(processSummary?.running)}
        />
      </div>
    );
  }

  if (message.type === "result") {
    if (attachProcess && processSummary) {
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
    return null;
  }

  if (message.type === "system") {
    const subtype = stringValue((message as { subtype?: unknown }).subtype, "");
    if (subtype === "compacting") {
      return <CompactContextNote state="compacting" />;
    }
    if (subtype === "compact_boundary") {
      return <CompactContextNote state="complete" />;
    }
    return null;
  }

  return null;
}

function ToolTitle({ toolName, input, threadId, isError = false }: { toolName: string; input: unknown; threadId?: string; isError?: boolean }) {
  const data = recordObject(input);
  const path = stringValue(data.file_path ?? data.filePath ?? data.path ?? data.notebook_path, "");
  const diff = toolDiffStats(toolName, input);
  const diffLabel = diff && !isError ? formatDiffStats(diff) : "";

  if (path && (toolName === "Read" || toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    const action = toolName === "Read" ? "Read" : toolName === "Write" ? "已写入" : "已编辑";
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span className="shrink-0">{action}</span>
        <span
          className="min-w-0"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <FilePathChip filePath={path} threadId={threadId} />
        </span>
        {diffLabel && <DiffStatsText value={diffLabel} />}
      </span>
    );
  }

  return <span>{toolTitle(toolName, input)}</span>;
}

function DiffStatsText({ value }: { value: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px]">
      {value.split(" ").map((part) => {
        if (part.startsWith("+")) return <span key={part} className="text-emerald-500">{part}</span>;
        if (part.startsWith("-")) return <span key={part} className="text-red-500">{part}</span>;
        return <span key={part}>{part}</span>;
      })}
    </span>
  );
}

function ToolUseCard({
  block,
  result,
  collapsed,
  onToggleCollapsed,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const threadId = useContext(AgentThreadIdContext);
  return (
    <BaseToolUseCard
      block={block}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      formatToolResultContent={formatToolResultContent}
      formatUnknown={formatUnknown}
      recordObject={recordObject}
      stringValue={stringValue}
      toolResultSummary={toolResultSummary}
      toolTitle={toolTitle}
      renderToolTitle={(toolName, input, options) => <ToolTitle toolName={toolName} input={input} threadId={threadId} isError={options?.isError} />}
      truncatePreview={truncatePreview}
      singleLine={singleLine}
      renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
    />
  );
}

function ApprovalCard({
  request,
  decision,
  onApprove,
  onReject,
}: {
  request: AgentApprovalRequest;
  decision?: "allow" | "deny";
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const threadId = useContext(AgentThreadIdContext);
  const resolved = Boolean(decision);

  async function resolveApproval(next: "allow" | "deny") {
    if (pending || resolved) return;
    setPending(next);
    try {
      await (next === "allow" ? onApprove(request.requestId) : onReject(request.requestId));
    } finally {
      setPending(null);
    }
  }

  const dangerous = request.riskLevel === "dangerous";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${dangerous ? "border-red-200 bg-red-50/80" : "border-amber-200 bg-amber-50/80"}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-background ${dangerous ? "border-red-200 text-red-700" : "border-amber-200 text-amber-700"}`}>
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {request.title || request.displayName || toolTitle(request.toolName, request.input)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {request.description || "Brevyn needs your approval before running this tool."}
          </p>
          {dangerous && (
            <p className="mt-1 text-[11px] font-medium text-red-700">
              This command looks destructive or high-impact. Review it carefully before allowing.
            </p>
          )}
          <div className="mt-3 rounded-xl border bg-background/80 p-2">
            <div className="text-[11px] font-medium text-muted-foreground">Tool · {request.toolName}</div>
            <ToolInputPreview
              toolName={request.toolName}
              input={request.input}
              formatToolResultContent={formatToolResultContent}
              formatUnknown={formatUnknown}
              recordObject={recordObject}
              stringValue={stringValue}
              toolResultSummary={toolResultSummary}
              toolTitle={toolTitle}
              renderToolTitle={(toolName, input, options) => <ToolTitle toolName={toolName} input={input} threadId={threadId} isError={options?.isError} />}
              truncatePreview={truncatePreview}
              singleLine={singleLine}
              renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {resolved ? (
              <span className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium text-muted-foreground">
                {decision === "allow" ? "Approved" : "Denied"}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
                  onClick={() => void resolveApproval("allow")}
                >
                  {pending === "allow" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {pending === "allow" ? "Allowing" : "Allow"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void resolveApproval("deny")}
                >
                  {pending === "deny" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  {pending === "deny" ? "Denying" : "Deny"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AskUserCard({
  request,
  resolvedAnswers,
  onAnswer,
}: {
  request: AgentAskUserRequest;
  resolvedAnswers?: Record<string, string>;
  onAnswer: (requestId: string, answers: Record<string, string>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultQuestionAnswers(request));
  const [pending, setPending] = useState(false);
  const resolved = Boolean(resolvedAnswers);
  const visibleAnswers = resolvedAnswers || answers;

  async function submit() {
    if (pending || resolved) return;
    setPending(true);
    try {
      await onAnswer(request.requestId, answers);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm ring-1 ring-white/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-background text-blue-700">
          <MessageCircleQuestion className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Brevyn needs a choice</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Answer this question so the current run can continue without losing context.
          </p>
          <div className="mt-3 space-y-3">
            {request.questions.map((question, index) => {
              const key = answerKey(question.question, index);
              const selected = visibleAnswers[key] || "";
              return (
                <div key={key} className="rounded-xl border bg-background/82 p-3">
                  <div className="mb-2">
                    {question.header && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">{question.header}</p>}
                    <p className="text-xs font-semibold text-foreground">{question.question || `Question ${index + 1}`}</p>
                  </div>
                  {question.options.length > 0 ? (
                    <div className="space-y-2">
                      {question.options.map((option) => {
                        const active = question.multiSelect
                          ? selected.split(",").map((item) => item.trim()).includes(option.label)
                          : selected === option.label;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            disabled={resolved}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                              active
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-card/70 text-foreground hover:bg-accent"
                            } disabled:cursor-default disabled:opacity-80`}
                            onClick={() => {
                              setAnswers((current) => ({
                                ...current,
                                [key]: nextQuestionAnswer(current[key] || "", option.label, Boolean(question.multiSelect)),
                              }));
                            }}
                          >
                            <span className="font-semibold">{option.label}</span>
                            {option.description && <span className={`mt-0.5 block leading-5 ${active ? "text-background/75" : "text-muted-foreground"}`}>{option.description}</span>}
                            {option.preview && <span className={`mt-1 block truncate text-[11px] ${active ? "text-background/70" : "text-muted-foreground/80"}`}>{option.preview}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={selected}
                      disabled={resolved}
                      rows={2}
                      className="w-full resize-none rounded-xl border bg-card/80 px-3 py-2 text-xs leading-5 text-foreground outline-none transition focus:border-foreground disabled:opacity-80"
                      placeholder="Type your answer..."
                      onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {resolved ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                Answered
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void submit()}
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {pending ? "Sending" : "Answer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExitPlanCard({
  request,
  decision,
  onResolve,
}: {
  request: AgentExitPlanRequest;
  decision?: "approve" | "deny";
  onResolve: (requestId: string, decision: "approve" | "deny", feedback?: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [feedback, setFeedback] = useState("");
  const resolved = Boolean(decision);

  async function resolvePlan(next: "approve" | "deny") {
    if (pending || resolved) return;
    setPending(next);
    try {
      await onResolve(request.requestId, next, next === "deny" ? feedback.trim() : undefined);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm ring-1 ring-white/45">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-background text-blue-700">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Plan ready for review</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Brevyn finished planning. Approve to leave plan mode and continue execution, or send feedback to revise the plan.
          </p>
          {request.allowedPrompts.length > 0 && (
            <div className="mt-3 rounded-xl border bg-background/82 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Requested execution scope</p>
              <div className="mt-2 space-y-1.5">
                {request.allowedPrompts.map((prompt, index) => (
                  <div key={`${prompt.tool}-${prompt.prompt}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
                    <span className="min-w-0 break-words">{prompt.tool}: {prompt.prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!resolved && (
            <textarea
              value={feedback}
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border bg-background/82 px-3 py-2 text-xs leading-5 text-foreground outline-none transition focus:border-blue-300"
              placeholder="Optional feedback if you want Brevyn to revise the plan..."
              onChange={(event) => setFeedback(event.target.value)}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {resolved ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                {decision === "approve" ? "Approved" : "Sent back"}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void resolvePlan("approve")}
                >
                  {pending === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {pending === "approve" ? "Approving" : "Approve plan"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void resolvePlan("deny")}
                >
                  {pending === "deny" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  {pending === "deny" ? "Sending" : "Revise"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ record }: { record: SDKMessage }) {
  const subtype = String((record as { subtype?: unknown }).subtype || "result");
  const turns = typeof (record as { num_turns?: unknown }).num_turns === "number" ? (record as { num_turns: number }).num_turns : undefined;
  return (
    <div className="flex justify-center">
      <span className="rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground">
        {subtype}{turns ? ` · ${turns} turn${turns === 1 ? "" : "s"}` : ""}
      </span>
    </div>
  );
}

function latestRunSummary(records: BrevynAgentTimelineRecord[], nowMs: number, active: boolean): RunSummary | null {
  const bounds = latestTurnBounds(records);
  if (!bounds) return active ? { runId: "active", label: "Thinking", running: true, status: "running" } : null;

  return runSummaryForUserIndex(records, bounds.userIndex, nowMs, active);
}

function runSummaryForUserIndex(records: BrevynAgentTimelineRecord[], userIndex: number, nowMs: number, active: boolean): RunSummary | null {
  const user = records[userIndex];
  if (!user || isRuntimeRecord(user) || (user as SDKMessage).type !== "user") return null;
  const result = resultForUserIndex(records, userIndex);
  const runStart = latestRunStart(records, userIndex);
  const lifecycle = latestRunLifecycle(records, userIndex);
  const latestBounds = latestTurnBounds(records);
  const isLatestTurn = latestBounds?.userIndex === userIndex;
  const startMs = recordCreatedAtMs(user) ?? nowMs;
  const finishMs = lifecycle?.createdAtMs ?? (result.record ? recordCreatedAtMs(result.record) ?? nowMs : nowMs);
  const running = !lifecycle && !result.record && active && isLatestTurn;
  const runId = runStart?.runId || stringValue((user as { uuid?: unknown }).uuid, `turn-${userIndex}`);
  const permissionMode = runStart?.permissionMode;
  const duration = formatDuration(Math.max(0, finishMs - startMs));
  const resultSubtype = result.record ? String((result.record as { subtype?: unknown }).subtype || "") : "";
  const status = lifecycle?.status ?? statusFromResultSubtype(resultSubtype, running);
  const detail = normalizedRunDetail(lifecycle?.detail ?? resultDetail(result.record));
  if (status === "running") return { runId, label: eventsSinceStart(records, userIndex) ? `已处理 ${duration}` : "Thinking", running: true, status, permissionMode };
  if (status === "stopped") return { runId, label: `已停止 · ${duration}`, running: false, status, permissionMode, detail };
  if (status === "failed") return { runId, label: `运行失败 · ${duration}`, running: false, status, permissionMode, detail };
  if (status === "interrupted") return { runId, label: `已中断 · ${duration}`, running: false, status, permissionMode, detail };
  return { runId, label: `已处理 ${duration}`, running: false, status: "completed", permissionMode, detail };
}

function resultForUserIndex(records: BrevynAgentTimelineRecord[], userIndex: number): { record?: SDKMessage; index?: number } {
  const nextUserIndex = nextUserInputIndex(records, userIndex);
  const endIndex = nextUserIndex ?? records.length;
  for (let index = userIndex + 1; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamRecord(record)) continue;
    if ((record as SDKMessage).type === "result") return { record: record as SDKMessage, index };
  }
  return {};
}

function nextUserInputIndex(records: BrevynAgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamRecord(record)) continue;
    if ((record as SDKMessage).type === "user" && !toolResultBlocks(record as SDKMessage).length && userText(record as SDKMessage).trim()) return index;
  }
  return undefined;
}

function latestRunStart(records: BrevynAgentTimelineRecord[], userIndex: number): { runId: string; permissionMode?: AgentPermissionMode } | null {
  for (let index = userIndex; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    return { runId: record.event.runId, permissionMode: record.event.permissionMode };
  }
  return null;
}

function recordCreatedAtMs(record: BrevynAgentTimelineRecord): number | undefined {
  if (isRuntimeRecord(record)) {
    const parsed = Date.parse(record.event.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const createdAt = (record as { _createdAt?: unknown })._createdAt;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  const timestamp = (record as { timestamp?: unknown }).timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function latestRunLifecycle(records: BrevynAgentTimelineRecord[], userIndex: number): { status: RunSummary["status"]; detail?: string; createdAtMs?: number } | null {
  let runId = "";
  let runStartIndex = -1;
  for (let index = userIndex; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    runId = record.event.runId;
    runStartIndex = index;
    break;
  }
  if (!runId) return null;

  for (let index = runStartIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || !("runId" in record.event) || record.event.runId !== runId) continue;
    if (record.event.type === "run_completed") return { status: "completed", createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_stopped") return { status: "stopped", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_failed") return { status: "failed", detail: record.event.error, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_interrupted") return { status: "interrupted", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
  }
  return null;
}

function statusFromResultSubtype(subtype: string, running: boolean): RunSummary["status"] {
  if (running) return "running";
  if (subtype === "success") return "completed";
  if (subtype === "stopped_by_user") return "stopped";
  if (subtype === "interrupted") return "interrupted";
  if (subtype) return "failed";
  return "completed";
}

function resultDetail(result?: SDKMessage): string | undefined {
  if (!result) return undefined;
  const errors = (result as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  const text = (result as { result?: unknown }).result;
  return typeof text === "string" && text.trim() ? text : undefined;
}

function normalizedRunDetail(detail?: string): string | undefined {
  const text = detail?.trim();
  if (!text || text === "Agent run stopped.") return undefined;
  return text;
}

function eventsSinceStart(records: BrevynAgentTimelineRecord[], userIndex: number): boolean {
  return records.slice(userIndex + 1).some((record) => {
    if (isRuntimeRecord(record)) return false;
    return (record as SDKMessage).type === "assistant" || (record as SDKMessage).type === "stream_event";
  });
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return tokens.toLocaleString();
}

function trimNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function runSummaryTone(status: RunSummary["status"]): { text: string; dot: string; detail: string } {
  if (status === "running") {
    return {
      text: "text-muted-foreground",
      dot: "bg-amber-500 animate-pulse",
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

function readStoredPermissionMode(threadId: string): AgentPermissionMode {
  try {
    return window.localStorage.getItem(`${AGENT_PERMISSION_STORAGE_PREFIX}${threadId}`) === "full_access" ? "full_access" : "review";
  } catch {
    return "review";
  }
}

function writeStoredPermissionMode(threadId: string, mode: AgentPermissionMode): void {
  try {
    window.localStorage.setItem(`${AGENT_PERMISSION_STORAGE_PREFIX}${threadId}`, mode);
  } catch {
    // Ignore storage failures; Review remains the safe fallback.
  }
}

function latestCopyableAssistantIndex(meta: ReturnType<typeof buildTimelineRenderMeta>): number | undefined {
  const indexes = [...meta.byIndex.entries()].flatMap(([index, value]) => value.assistantCopyContent ? [index] : []);
  return indexes.at(-1);
}

function latestTodoList(records: BrevynAgentTimelineRecord[]): AgentTodoItem[] {
  let latest: AgentTodoItem[] = [];
  for (const record of records) {
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "tool_use" || block.name !== "TodoWrite") continue;
      const todos = recordObject(block.input).todos;
      if (!Array.isArray(todos)) continue;
      latest = todos.flatMap((todo) => {
        const item = recordObject(todo);
        const content = stringValue(item.content, "");
        if (!content) return [];
        const rawStatus = stringValue(item.status, "pending");
        const status = rawStatus === "completed" || rawStatus === "in_progress" ? rawStatus : "pending";
        return [{ content, status }];
      });
    }
  }
  return latest;
}

function latestContextUsage(records: BrevynAgentTimelineRecord[]): ContextUsage | null {
  let latest: ContextUsage | null = null;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    const message = record as SDKMessage;
    if (message.type === "assistant") {
      const rawMessage = recordObject((message as { message?: unknown }).message);
      const usage = recordObject(rawMessage.usage);
      const inputTokens = tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      if (inputTokens > 0) {
        const previousContextWindow: number | undefined = latest ? latest.contextWindow : undefined;
        latest = {
          inputTokens,
          outputTokens: tokenNumber(usage.output_tokens) || undefined,
          cacheReadTokens: tokenNumber(usage.cache_read_input_tokens) || undefined,
          cacheCreationTokens: tokenNumber(usage.cache_creation_input_tokens) || undefined,
          contextWindow: previousContextWindow ?? inferContextWindow(stringValue(rawMessage.model ?? (message as { _channelModelId?: unknown })._channelModelId, "")),
        };
      }
      continue;
    }
    if (message.type === "result") {
      const usage = recordObject((message as { usage?: unknown }).usage);
      const primaryUsage = primaryModelUsageFromResult(message);
      const inputTokens = primaryUsage
        ? primaryUsage.inputTokens + (primaryUsage.cacheReadTokens || 0) + (primaryUsage.cacheCreationTokens || 0)
        : tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      const contextWindow = primaryUsage?.contextWindow;
      if (inputTokens > 0 || contextWindow) {
        latest = {
          inputTokens: inputTokens || latest?.inputTokens || 0,
          outputTokens: primaryUsage?.outputTokens || tokenNumber(usage.output_tokens) || latest?.outputTokens,
          cacheReadTokens: primaryUsage?.cacheReadTokens || tokenNumber(usage.cache_read_input_tokens) || latest?.cacheReadTokens,
          cacheCreationTokens: primaryUsage?.cacheCreationTokens || tokenNumber(usage.cache_creation_input_tokens) || latest?.cacheCreationTokens,
          contextWindow: contextWindow || latest?.contextWindow,
        };
      }
    }
  }
  return latest && latest.inputTokens > 0 ? latest : null;
}

function defaultContextUsage(model?: string): ContextUsage | null {
  const contextWindow = inferContextWindow(model || "");
  return contextWindow ? { inputTokens: 0, contextWindow } : null;
}

function isCompactingContext(records: BrevynAgentTimelineRecord[]): boolean {
  let compacting = false;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    if ((record as SDKMessage).type === "result") {
      compacting = false;
      continue;
    }
    if ((record as SDKMessage).type !== "system") continue;
    const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
    if (subtype === "compacting") compacting = true;
    if (subtype === "compact_boundary") compacting = false;
  }
  return compacting;
}

function primaryModelUsageFromResult(message: SDKMessage): ContextUsage | undefined {
  const modelUsage = recordObject((message as { modelUsage?: unknown }).modelUsage);
  let selected: ContextUsage | undefined;
  let selectedTokens = 0;
  for (const value of Object.values(modelUsage)) {
    const usage = recordObject(value);
    const inputTokens = tokenNumber(usage.inputTokens);
    const cacheReadTokens = tokenNumber(usage.cacheReadInputTokens);
    const cacheCreationTokens = tokenNumber(usage.cacheCreationInputTokens);
    const totalInputTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    if (totalInputTokens <= selectedTokens) continue;
    selectedTokens = totalInputTokens;
    selected = {
      inputTokens,
      outputTokens: tokenNumber(usage.outputTokens) || undefined,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheCreationTokens: cacheCreationTokens || undefined,
      contextWindow: tokenNumber(usage.contextWindow) || undefined,
    };
  }
  return selected;
}

function inferContextWindow(model: string): number | undefined {
  const normalized = model.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("haiku")) return 200_000;
  if (normalized.includes("deepseek-v4")) return 1_000_000;
  if (normalized.includes("claude-sonnet-4") || normalized.includes("claude-opus-4-6") || normalized.includes("claude-opus-4-7")) return 1_000_000;
  return 200_000;
}

function tokenNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function todoToolUseIds(records: BrevynAgentTimelineRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type === "tool_use" && block.name === "TodoWrite") ids.add(block.id);
    }
  }
  return ids;
}

function toolUseMetadata(records: BrevynAgentTimelineRecord[]): Map<string, ToolUseBlock> {
  const tools = new Map<string, ToolUseBlock>();
  for (const record of records) {
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type === "tool_use") tools.set(block.id, block);
    }
  }
  return tools;
}

function completedToolResultIds(records: BrevynAgentTimelineRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    for (const block of toolResultBlocks(record as SDKMessage)) {
      ids.add(block.toolUseId);
    }
  }
  return ids;
}

function normalizeTimelineRecords(records: BrevynAgentTimelineRecord[], running: boolean, compactInFlight = false): AgentTimelineRecord[] {
  const normalized: AgentTimelineRecord[] = [];
  let streamText = "";
  let streamId = "stream";

  for (const record of records) {
    if (isHiddenSystemRecord(record)) continue;
    const delta = streamTextDelta(record);
    if (delta) {
      streamText += delta;
      if (streamId === "stream") streamId = stringValue((record as { uuid?: unknown }).uuid, streamId);
      continue;
    }

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim()) {
      streamText = "";
    }
    if (streamText && isBoundaryRecord(record)) {
      normalized.push({ kind: "stream", id: streamId, text: streamText });
      streamText = "";
    }
    normalized.push(record);
  }

  if (streamText.trim()) {
    normalized.push({ kind: "stream", id: streamId, text: streamText });
  }
  if ((compactInFlight || running) && shouldShowCompactPlaceholder(normalized)) {
    normalized.push({ kind: "compact_placeholder", id: "active-compact-placeholder" });
  } else if (compactInFlight && shouldShowOptimisticCompactPlaceholder(normalized)) {
    normalized.push({ kind: "compact_placeholder", id: "active-compact-placeholder" });
  }
  if (running && shouldShowProcessPlaceholder(normalized)) {
    normalized.push({ kind: "process_placeholder", id: "active-process-placeholder" });
  }
  return normalized;
}

function shouldShowOptimisticCompactPlaceholder(records: AgentTimelineRecord[]): boolean {
  return !records.some((record) => isCompactPlaceholderRecord(record) || isCompactSystemRecord(record));
}

function shouldShowCompactPlaceholder(records: AgentTimelineRecord[]): boolean {
  const bounds = latestTurnBounds(records);
  if (!bounds || bounds.result || !isCompactCommandMessage(bounds.user)) return false;
  return !records.slice(bounds.userIndex + 1).some((record) => {
    if (isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
    if ((record as SDKMessage).type !== "system") return false;
    const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
    return subtype === "compacting" || subtype === "compact_boundary";
  });
}

function isCompactSystemRecord(record: AgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
  if ((record as SDKMessage).type !== "system") return false;
  const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
  return subtype === "compacting" || subtype === "compact_boundary";
}

function shouldShowProcessPlaceholder(records: AgentTimelineRecord[]): boolean {
  const bounds = latestTurnBounds(records);
  if (!bounds || bounds.result) return false;
  if (isCompactCommandMessage(bounds.user)) return false;
  const afterUser = records.slice(bounds.userIndex + 1);
  return !afterUser.some((record) => {
    if (isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
    return (record as SDKMessage).type === "assistant";
  });
}

function isHiddenSystemRecord(record: BrevynAgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "system") return false;
  const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
  return subtype !== "compacting" && subtype !== "compact_boundary";
}

function streamTextDelta(record: BrevynAgentTimelineRecord): string {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return "";
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return "";
  const delta = recordObject(event.delta);
  return delta.type === "text_delta" && typeof delta.text === "string" ? delta.text : "";
}

function ToolGlyph({ toolName, className }: { toolName: string; className?: string }) {
  if (toolName === "Bash") return <TerminalSquare className={className} />;
  if (toolName === "Read") return <FileText className={className} />;
  if (toolName === "Glob") return <FolderOpen className={className} />;
  if (toolName === "Grep") return <Search className={className} />;
  if (toolName === "Write") return <FileText className={className} />;
  if (toolName === "Edit" || toolName === "MultiEdit") return <Pencil className={className} />;
  if (toolName === "TodoWrite" || toolName === "TodoRead") return <ListTodo className={className} />;
  if (toolName === "mcp__brevyn__rag_search") return <Search className={className} />;
  if (toolName === "WebFetch" || toolName === "WebSearch") return <Globe className={className} />;
  if (toolName === "AskUserQuestion") return <MessageCircleQuestion className={className} />;
  if (toolName === "EnterPlanMode" || toolName === "ExitPlanMode") return <ShieldAlert className={className} />;
  if (toolName.startsWith("mcp__brevyn__")) return <ShieldCheck className={className} />;
  return <HelpCircle className={className} />;
}
