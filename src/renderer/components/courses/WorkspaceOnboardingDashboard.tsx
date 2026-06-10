import { Archive, ArrowRight, BookOpen, CalendarDays, CheckCircle2, FolderOpen, GraduationCap, Loader2, Plus, Sparkles } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { VisionRecognitionImportButton } from "@/components/vision/VisionRecognitionImportDialog";
import type { SemesterWorkspace } from "@/types/domain";

type OnboardingMode = "no-semester" | "select-semester";

export function WorkspaceOnboardingDashboard({
  mode,
  semesters,
  onSelectSemester,
  onOpenSemesterSettings,
  onOpenArchive,
  onWorkspaceChanged,
}: {
  mode: OnboardingMode;
  semesters: SemesterWorkspace[];
  onSelectSemester: (semesterId: string) => Promise<void> | void;
  onOpenSemesterSettings: () => void;
  onOpenArchive: () => void;
  onWorkspaceChanged: () => Promise<void> | void;
}) {
  const [term, setTerm] = useState("");
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectingSemesterId, setSelectingSemesterId] = useState("");
  const [error, setError] = useState("");
  const hasSemesters = semesters.length > 0;

  async function createSemester() {
    const nextTerm = term.trim();
    if (!nextTerm) {
      setError("请先填写学期名称。");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await window.brevyn.semester.create({
        term: nextTerm,
        folderName: folderName.trim() || undefined,
      });
      setTerm("");
      setFolderName("");
      await onWorkspaceChanged();
    } catch (reason) {
      setError(errorMessage(reason, "创建学期失败。"));
    } finally {
      setCreating(false);
    }
  }

  async function selectSemester(semester: SemesterWorkspace) {
    setSelectingSemesterId(semester.id);
    setError("");
    try {
      await onSelectSemester(semester.id);
    } catch (reason) {
      setError(errorMessage(reason, "切换学期失败。"));
    } finally {
      setSelectingSemesterId("");
    }
  }

  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[58rem] max-w-5xl flex-col gap-4">
        <section className="overflow-hidden rounded-2xl border bg-card/92 shadow-sm ring-1 ring-border/60">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[hsl(var(--status-info)/0.11)] blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 left-8 h-48 w-48 rounded-full bg-[hsl(var(--status-warning)/0.10)] blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Brevyn Academic Workspace
                </div>
                <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.045em] text-foreground">
                  {mode === "select-semester" ? "选择一个学期，继续你的课程工作区。" : "先建立学期，再让课程、资料和会话有秩序地展开。"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Brevyn 会以学期为边界整理课程资料、作业会话和本地索引。第一次使用时，建议先识别校历；如果暂时没有校历，也可以手动创建一个学期。
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <OnboardingStep icon={<CalendarDays className="h-4 w-4" />} title="1. 建立学期" text="确定时间边界和资料目录。" />
                  <OnboardingStep icon={<BookOpen className="h-4 w-4" />} title="2. 添加课程" text="导入课表或手动添加课程。" />
                  <OnboardingStep icon={<Sparkles className="h-4 w-4" />} title="3. 开始协作" text="按课程作业沉淀会话。" />
                </div>
              </div>
            </div>

            <aside className="border-t bg-background/46 p-4 shadow-[inset_0_1px_0_hsl(var(--border)/0.5)] lg:border-l lg:border-t-0 lg:shadow-[inset_1px_0_0_hsl(var(--border)/0.5)]">
              <div className="rounded-2xl bg-card/86 p-3 shadow-sm ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  推荐入口
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  有校历截图或图片时，识别校历会自动创建学期并补全年周次信息。
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <VisionRecognitionImportButton
                    kind="academic_calendar"
                    variant="primary"
                    className="h-9 justify-center rounded-[var(--radius-control)]"
                    onImported={async () => {
                      await onWorkspaceChanged();
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border bg-background/80 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                    onClick={onOpenSemesterSettings}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    打开学期管理
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-card/86 p-3 shadow-sm ring-1 ring-border/60">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  手动创建学期
                </div>
                <div className="space-y-2">
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>学期名称</span>
                    <input
                      className="h-8 w-full rounded-[var(--radius-control)] border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-55"
                      value={term}
                      onChange={(event) => setTerm(event.target.value)}
                      onKeyDown={(event) => {
                        if (isComposingText(event)) return;
                        if (event.key === "Enter" && !creating && term.trim()) void createSemester();
                      }}
                      placeholder="例如：2026 秋季学期"
                      disabled={creating}
                    />
                  </label>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>文件夹名称（可选）</span>
                    <input
                      className="h-8 w-full rounded-[var(--radius-control)] border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-55"
                      value={folderName}
                      onChange={(event) => setFolderName(event.target.value)}
                      placeholder="留空则自动生成"
                      disabled={creating}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void createSemester()}
                    disabled={creating || !term.trim()}
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {creating ? "正在创建" : "创建并进入"}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {error && (
          <div className="rounded-[var(--radius-control)] bg-[hsl(var(--status-warning)/0.12)] px-3 py-2 text-xs leading-5 text-[hsl(var(--status-warning))] shadow-[inset_0_0_0_1px_hsl(var(--status-warning)/0.18)]">
            {error}
          </div>
        )}

        {hasSemesters && (
          <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  可继续的学期
                </div>
                <p className="mt-1 text-xs text-muted-foreground">选择后会加载对应课程、作业和会话。</p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onOpenSemesterSettings}
              >
                管理全部
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {semesters.map((semester) => (
                <button
                  key={semester.id}
                  type="button"
                  className="group flex min-w-0 items-center gap-3 rounded-xl border bg-background/68 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm disabled:cursor-wait disabled:opacity-70"
                  disabled={Boolean(selectingSemesterId)}
                  onClick={() => void selectSemester(semester)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground ring-1 ring-border/60">
                    {selectingSemesterId === semester.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">{semester.term}</span>
                    <span className="mt-1 block truncate text-[10px] text-muted-foreground">{semester.semesterNo} · {semester.folderName}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-card/82 p-4 text-xs leading-5 text-muted-foreground shadow-sm ring-1 ring-border/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-2xl">
              <div className="mb-1 font-semibold text-foreground">找不到之前的学期？</div>
              <p>如果你把旧学期归档了，它不会出现在当前工作区。可以进入归档页恢复，永久删除仍会有二次确认。</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onOpenArchive}
            >
              <Archive className="h-3.5 w-3.5" />
              打开归档
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function OnboardingStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-background/58 p-3 shadow-sm ring-1 ring-border/58">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground ring-1 ring-border/60">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "").trim();
  return message || fallback;
}

function isComposingText(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}
