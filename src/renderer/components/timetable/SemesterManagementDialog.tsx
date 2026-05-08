import { Archive, CalendarDays, Check, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SemesterWorkspace } from "@/types/domain";
import { cx } from "@/lib/cn";

export function SemesterManagementDialog({
  onSelectSemester,
  onWorkspaceChanged,
  onClose,
}: {
  onSelectSemester?: (semesterId: string) => Promise<void> | void;
  onWorkspaceChanged?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [activeSemesters, setActiveSemesters] = useState<SemesterWorkspace[]>([]);
  const [archivedSemesters, setArchivedSemesters] = useState<SemesterWorkspace[]>([]);
  const [currentSemester, setCurrentSemester] = useState<SemesterWorkspace | null>(null);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [term, setTerm] = useState("");
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");

  const hasArchived = archivedSemesters.length > 0;
  const allSemesters = useMemo(() => [...activeSemesters, ...archivedSemesters], [activeSemesters, archivedSemesters]);

  useEffect(() => {
    void loadSemesters();
  }, []);

  async function loadSemesters() {
    try {
      const [active, archived, current] = await Promise.all([
        window.uclaw.semester.list(),
        window.uclaw.semester.listArchived(),
        window.uclaw.semester.current(),
      ]);
      setActiveSemesters(active);
      setArchivedSemesters(archived);
      setCurrentSemester(current);
    } catch (reason) {
      setActiveSemesters([]);
      setArchivedSemesters([]);
      setCurrentSemester(null);
      setError(errorMessage(reason, "Failed to load semesters."));
    }
  }

  async function refreshWorkspace() {
    await loadSemesters();
    await onWorkspaceChanged?.();
  }

  async function createSemester() {
    const nextTerm = term.trim();
    if (!nextTerm) {
      setError("Semester term is required.");
      return;
    }
    setError("");
    setCreating(true);
    try {
      await window.uclaw.semester.create({
        term: nextTerm,
        folderName: folderName.trim() || undefined,
      });
      setTerm("");
      setFolderName("");
      await refreshWorkspace();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to create semester."));
    } finally {
      setCreating(false);
    }
  }

  async function selectSemester(semester: SemesterWorkspace) {
    if (semester.archivedAt) return;
    setBusyId(semester.id);
    setError("");
    try {
      await onSelectSemester?.(semester.id);
      await refreshWorkspace();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to select semester."));
    } finally {
      setBusyId("");
    }
  }

  async function archiveSemester(semester: SemesterWorkspace) {
    if (!window.confirm(`Archive "${semester.term}"? It will disappear from the active workspace until restored.`)) return;
    setBusyId(semester.id);
    setError("");
    try {
      await window.uclaw.semester.archive(semester.id);
      await refreshWorkspace();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to archive semester."));
    } finally {
      setBusyId("");
    }
  }

  async function restoreSemester(semester: SemesterWorkspace) {
    setBusyId(semester.id);
    setError("");
    try {
      await window.uclaw.semester.restore(semester.id);
      await refreshWorkspace();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to restore semester."));
    } finally {
      setBusyId("");
    }
  }

  async function deleteSemester(semester: SemesterWorkspace) {
    if (!semester.archivedAt) {
      window.alert("Archive this semester before deleting it permanently.");
      return;
    }
    const typed = window.prompt(`This permanently deletes "${semester.term}", all courses, files, and indexed data.\n\nType the semester term to confirm:`);
    if (typed !== semester.term) return;
    setBusyId(semester.id);
    setError("");
    try {
      await window.uclaw.semester.delete(semester.id);
      await refreshWorkspace();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to delete semester."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" />
              Manage semesters
            </div>
            <div className="truncate text-[11px] text-muted-foreground">Archive hides a semester; permanent delete removes files, SQLite rows, and indexed chunks.</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close semester management"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_280px] uclaw-scrollbar">
          <section className="min-h-0 space-y-4">
            <SemesterGroup
              title="Active semesters"
              emptyLabel="No active semesters."
              semesters={activeSemesters}
              currentSemesterId={currentSemester?.id}
              busyId={busyId}
              onSelect={(semester) => void selectSemester(semester)}
              onArchive={(semester) => void archiveSemester(semester)}
              onRestore={(semester) => void restoreSemester(semester)}
              onDelete={(semester) => void deleteSemester(semester)}
            />
            {hasArchived && (
              <SemesterGroup
                title="Archived semesters"
                emptyLabel="No archived semesters."
                semesters={archivedSemesters}
                currentSemesterId={currentSemester?.id}
                busyId={busyId}
                onSelect={(semester) => void selectSemester(semester)}
                onArchive={(semester) => void archiveSemester(semester)}
                onRestore={(semester) => void restoreSemester(semester)}
                onDelete={(semester) => void deleteSemester(semester)}
              />
            )}
          </section>

          <aside className="space-y-3">
            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                New semester
              </div>
              <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                <span>Term</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="e.g. Fall 2026"
                />
              </label>
              <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                <span>Folder name</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="Optional, auto-sanitized"
                />
              </label>
              {error && <div className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">{error}</div>}
              <button
                type="button"
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void createSemester()}
                disabled={creating}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {creating ? "Creating..." : "Create semester"}
              </button>
            </section>

            <section className="rounded-lg border bg-background/70 p-3 text-[11px] leading-5 text-muted-foreground">
              <div className="mb-1 text-xs font-semibold text-foreground">Safety rule</div>
              <p>Permanent delete is only available after archive. Semester archive does not mark child courses archived, so restoring the semester brings its courses back as they were.</p>
              <div className="mt-2 rounded-md bg-muted/55 px-2 py-2">{allSemesters.length} total semesters · {archivedSemesters.length} archived</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SemesterGroup({
  title,
  emptyLabel,
  semesters,
  currentSemesterId,
  busyId,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
}: {
  title: string;
  emptyLabel: string;
  semesters: SemesterWorkspace[];
  currentSemesterId?: string;
  busyId: string;
  onSelect: (semester: SemesterWorkspace) => void;
  onArchive: (semester: SemesterWorkspace) => void;
  onRestore: (semester: SemesterWorkspace) => void;
  onDelete: (semester: SemesterWorkspace) => void;
}) {
  return (
    <section className="rounded-lg border bg-background/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{title}</div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{semesters.length}</span>
      </div>

      {semesters.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-3 py-5 text-center text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="space-y-2">
          {semesters.map((semester) => {
            const isArchived = Boolean(semester.archivedAt);
            const isCurrent = currentSemesterId === semester.id;
            const isBusy = busyId === semester.id;
            return (
              <div
                key={semester.id}
                className={cx(
                  "flex items-center gap-2 rounded-lg border px-3 py-3 transition",
                  isArchived ? "bg-muted/45 text-muted-foreground" : "bg-card",
                  isCurrent ? "border-border shadow-sm ring-1 ring-border/60" : "border-border/60",
                )}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(semester)} disabled={isArchived || isBusy}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{semester.term}</span>
                    {isCurrent && !isArchived && <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] uppercase text-emerald-700">Current</span>}
                    {isArchived && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase">Archived</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {semester.semesterNo} · {semester.folderName}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {isArchived ? (
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground" title="Restore semester" disabled={isBusy} onClick={() => onRestore(semester)}>
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground" title="Archive semester" disabled={isBusy} onClick={() => onArchive(semester)}>
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-700" title={isArchived ? "Delete permanently" : "Archive before deleting"} disabled={isBusy} onClick={() => onDelete(semester)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {isCurrent && !isArchived && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.trim() || fallback;
}
