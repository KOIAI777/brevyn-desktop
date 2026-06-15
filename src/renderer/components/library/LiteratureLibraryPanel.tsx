import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BookMarked, BookOpen, CheckCircle2, ChevronDown, Download, FileQuestion, FileText, Globe2, GraduationCap, Library, Newspaper, PencilLine, Plus, Quote, ScrollText, Video, X } from "lucide-react";
import type { BrevynTask, Course, ReferenceCreateInput, ReferenceCreatorRole, ReferenceItem, ReferenceItemType, ReferenceScope, ReferenceScopeType, ReferenceUpdateInput, SemesterWorkspace } from "@/types/domain";
import { cx } from "@/lib/cn";

interface LiteratureLibraryPanelProps {
  semester: SemesterWorkspace | null;
  courses: Course[];
  tasksByCourse: Record<string, BrevynTask[]>;
  activeCourse?: Course;
  activeTask?: BrevynTask;
  onClose: () => void;
  onOpenCourses: () => void;
}

interface ScopeOption {
  id: string;
  level: "semester" | "course" | "task";
  title: string;
  description: string;
  count: string;
  icon: ReactNode;
  scopeInput?: {
    scopeType: VisibleReferenceScopeType;
    semesterId?: string;
    courseId?: string;
    taskId?: string;
  };
}

interface CourseScopeGroup {
  course: ScopeOption;
  tasks: ScopeOption[];
}

type VisibleReferenceScopeType = Exclude<ReferenceScopeType, "candidate">;

interface CreatorDraft {
  role: ReferenceCreatorRole;
  given: string;
  family: string;
  name: string;
}

interface ReferenceDraft {
  title: string;
  creators: CreatorDraft[];
  year: string;
  itemType: ReferenceItemType;
  containerTitle: string;
  publisher: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  isbn: string;
  url: string;
  citationKey: string;
  language: string;
  tags: string;
  abstract: string;
}

type ReferenceExportFormat = "csl-json" | "bibtex" | "ris" | "apa-markdown";
type CitationStyle = "apa7" | "mla9" | "chicago" | "harvard" | "ieee";

const referenceExportOptions: Array<{ label: string; format: ReferenceExportFormat; description: string }> = [
  { label: "APA Markdown", format: "apa-markdown", description: "复制可直接放进文档的引用文本" },
  { label: "CSL-JSON", format: "csl-json", description: "适合 Zotero、Pandoc 和后续迁移" },
  { label: "BibTeX", format: "bibtex", description: "适合 LaTeX / Overleaf" },
  { label: "RIS", format: "ris", description: "适合 EndNote、Mendeley" },
];

type ReferenceItemTypeOption = { icon: ReactNode; label: string; value: ReferenceItemType; description: string };

const referenceItemTypeOptionSpecs: Array<Omit<ReferenceItemTypeOption, "icon"> & { icon?: ReactNode }> = [
  { icon: <Globe2 className="h-4 w-4" />, label: "Website", value: "webpage", description: "网页 / 在线资料" },
  { label: "Book", value: "book", description: "专著 / 书籍" },
  { icon: <Newspaper className="h-4 w-4" />, label: "Journal", value: "article-journal", description: "期刊论文" },
  { icon: <Video className="h-4 w-4" />, label: "Video", value: "video", description: "视频 / 在线讲座" },
  { label: "Book chapter", value: "chapter", description: "书籍章节" },
  { label: "Conference paper", value: "paper-conference", description: "会议论文" },
  { label: "Report", value: "report", description: "报告 / 白皮书" },
  { label: "Thesis", value: "thesis", description: "学位论文" },
  { label: "Document", value: "document", description: "其他文档" },
];

const referenceItemTypeOptions: ReferenceItemTypeOption[] = referenceItemTypeOptionSpecs.map((option) => ({
  ...option,
  icon: option.icon || referenceTypeIcon(option.value),
}));

function referenceTypeIcon(type: ReferenceItemType): ReactNode {
  if (type === "webpage") return <Globe2 className="h-4 w-4" />;
  if (type === "book") return <BookMarked className="h-4 w-4" />;
  if (type === "article-journal") return <Newspaper className="h-4 w-4" />;
  if (type === "video") return <Video className="h-4 w-4" />;
  if (type === "chapter") return <BookOpen className="h-4 w-4" />;
  if (type === "paper-conference") return <GraduationCap className="h-4 w-4" />;
  if (type === "report") return <ScrollText className="h-4 w-4" />;
  if (type === "thesis") return <Library className="h-4 w-4" />;
  return <FileQuestion className="h-4 w-4" />;
}

function createEmptyDraft(itemType: ReferenceItemType = "webpage"): ReferenceDraft {
  return {
    title: "",
    creators: [createBlankCreator("author")],
    year: "",
    itemType,
    containerTitle: "",
    publisher: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    isbn: "",
    url: "",
    citationKey: "",
    language: "",
    tags: "",
    abstract: "",
  };
}

function createBlankCreator(role: ReferenceCreatorRole): CreatorDraft {
  return { role, given: "", family: "", name: "" };
}

const citationStyleOptions: Array<{ label: string; value: CitationStyle; description: string }> = [
  { label: "APA 7", value: "apa7", description: "教育、心理、社科常用" },
  { label: "MLA 9", value: "mla9", description: "文学与人文写作常用" },
  { label: "Chicago", value: "chicago", description: "历史、人文与书稿常用" },
  { label: "Harvard", value: "harvard", description: "英联邦课程常见 author-date" },
  { label: "IEEE", value: "ieee", description: "工程、计算机与编号引用" },
];

interface ReferenceFieldSet {
  workSectionTitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  containerLabel: string;
  containerPlaceholder: string;
  publisherLabel: string;
  pagesLabel: string;
  pagesPlaceholder: string;
  showContainer: boolean;
  showPublisher: boolean;
  showVolume: boolean;
  showIssue: boolean;
  showPages: boolean;
  showIsbn: boolean;
  showLanguage: boolean;
}

function referenceFieldSet(itemType: ReferenceItemType): ReferenceFieldSet {
  const base: ReferenceFieldSet = {
    workSectionTitle: "作品",
    titleLabel: "Title",
    titlePlaceholder: "Title of work",
    containerLabel: "Container title",
    containerPlaceholder: "Journal, book, conference or site",
    publisherLabel: "Publisher",
    pagesLabel: "Pages",
    pagesPlaceholder: "15-28",
    showContainer: true,
    showPublisher: false,
    showVolume: false,
    showIssue: false,
    showPages: false,
    showIsbn: false,
    showLanguage: false,
  };

  if (itemType === "article-journal") {
    return {
      ...base,
      workSectionTitle: "文章",
      titleLabel: "Article title",
      titlePlaceholder: "Title of article",
      containerLabel: "Journal title",
      containerPlaceholder: "Name of journal",
      showVolume: true,
      showIssue: true,
      showPages: true,
    };
  }
  if (itemType === "book") {
    return {
      ...base,
      workSectionTitle: "书籍",
      titleLabel: "Book title",
      titlePlaceholder: "Title of book",
      showContainer: false,
      showPublisher: true,
      showIsbn: true,
    };
  }
  if (itemType === "chapter") {
    return {
      ...base,
      workSectionTitle: "章节",
      titleLabel: "Chapter title",
      titlePlaceholder: "Title of chapter",
      containerLabel: "Book title",
      containerPlaceholder: "Title of edited book",
      showPublisher: true,
      showPages: true,
      showIsbn: true,
    };
  }
  if (itemType === "paper-conference") {
    return {
      ...base,
      workSectionTitle: "会议论文",
      titleLabel: "Paper title",
      titlePlaceholder: "Title of conference paper",
      containerLabel: "Conference / Proceedings",
      containerPlaceholder: "Conference or proceedings title",
      showPublisher: true,
      showPages: true,
    };
  }
  if (itemType === "report") {
    return {
      ...base,
      workSectionTitle: "报告",
      titleLabel: "Report title",
      titlePlaceholder: "Title of report",
      containerLabel: "Series / Report number",
      containerPlaceholder: "Report series or number",
      publisherLabel: "Organization",
      showPublisher: true,
    };
  }
  if (itemType === "webpage") {
    return {
      ...base,
      workSectionTitle: "网页",
      titleLabel: "Page title",
      titlePlaceholder: "Title of webpage",
      containerLabel: "Website name",
      containerPlaceholder: "Name of website",
      publisherLabel: "Organization",
      showPublisher: true,
    };
  }
  if (itemType === "video") {
    return {
      ...base,
      workSectionTitle: "视频",
      titleLabel: "Video title",
      titlePlaceholder: "Title of video or lecture",
      containerLabel: "Platform / Channel",
      containerPlaceholder: "YouTube, course platform, channel...",
      publisherLabel: "Publisher / Organization",
      showPublisher: true,
    };
  }
  if (itemType === "thesis") {
    return {
      ...base,
      workSectionTitle: "论文",
      titleLabel: "Thesis title",
      titlePlaceholder: "Title of thesis or dissertation",
      containerLabel: "Degree / thesis type",
      containerPlaceholder: "PhD thesis, master's dissertation...",
      publisherLabel: "Institution",
      showPublisher: true,
    };
  }
  return {
    ...base,
    showPublisher: true,
    showLanguage: true,
  };
}

export function LiteratureLibraryPanel({
  semester,
  courses,
  tasksByCourse,
  activeCourse,
  activeTask,
  onClose,
  onOpenCourses,
}: LiteratureLibraryPanelProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [citationStyleMenuOpen, setCitationStyleMenuOpen] = useState(false);
  const [referenceTypeMenuOpen, setReferenceTypeMenuOpen] = useState(false);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa7");
  const [expandedCourseIds, setExpandedCourseIds] = useState<string[]>([]);
  const [selectedScopeId, setSelectedScopeId] = useState(
    activeTask ? `task:${activeTask.id}` : activeCourse?.workspaceKind === "course" ? `course:${activeCourse.id}` : `semester:${semester?.id || "current"}`,
  );
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [selectedReferenceId, setSelectedReferenceId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState("");
  const [draft, setDraft] = useState<ReferenceDraft>(() => createEmptyDraft());

  const realCourses = courses.filter((course) => course.workspaceKind !== "semester_home" && !course.archivedAt);
  const taskCount = realCourses.reduce((total, course) => total + (tasksByCourse[course.id] || []).filter((task) => !task.archivedAt).length, 0);

  const semesterScope: ScopeOption = {
    id: `semester:${semester?.id || "current"}`,
    level: "semester",
    icon: <GraduationCap className="h-3.5 w-3.5" />,
    title: semester?.term || "当前学期",
    description: `${realCourses.length} 门课程 · ${taskCount} 个课程作业`,
    count: String(countReferencesByScope(references, { scopeType: "semester", semesterId: semester?.id })),
    scopeInput: semester?.id ? { scopeType: "semester", semesterId: semester.id } : undefined,
  };

  const courseScopeGroups: CourseScopeGroup[] = realCourses.map((course) => {
    const tasks = (tasksByCourse[course.id] || []).filter((task) => !task.archivedAt);
    return {
      course: {
        id: `course:${course.id}`,
        level: "course",
        icon: <BookOpen className="h-3.5 w-3.5" />,
        title: course.name,
        description: `课程文献 · ${tasks.length} 个课程作业`,
        count: String(countReferencesByScope(references, { scopeType: "course", courseId: course.id })),
        scopeInput: { scopeType: "course", semesterId: course.semesterId, courseId: course.id },
      },
      tasks: tasks.map((task) => ({
        id: `task:${task.id}`,
        level: "task" as const,
        icon: <Quote className="h-3.5 w-3.5" />,
        title: task.title,
        description: "作业文献",
        count: String(countReferencesByScope(references, { scopeType: "task", taskId: task.id })),
        scopeInput: { scopeType: "task", semesterId: task.semesterId, courseId: task.courseId, taskId: task.id },
      })),
    };
  });

  const scopeOptions = [semesterScope, ...courseScopeGroups.flatMap((group) => [group.course, ...group.tasks])];
  const selectedScope = scopeOptions.find((option) => option.id === selectedScopeId) ?? scopeOptions[0];
  const visibleReferences = filterReferencesForScope(references, selectedScope);
  const selectedReference = visibleReferences.find((reference) => reference.id === selectedReferenceId) ?? visibleReferences[0];
  const editingReference = editingReferenceId ? references.find((reference) => reference.id === editingReferenceId) : undefined;

  useEffect(() => {
    setSelectedScopeId(activeTask ? `task:${activeTask.id}` : activeCourse?.workspaceKind === "course" ? `course:${activeCourse.id}` : `semester:${semester?.id || "current"}`);
  }, [activeCourse?.id, activeCourse?.workspaceKind, activeTask?.id, semester?.id]);

  useEffect(() => {
    const activeCourseId = activeTask?.courseId || (activeCourse?.workspaceKind === "course" ? activeCourse.id : "");
    if (!activeCourseId) return;
    setExpandedCourseIds((current) => current.includes(activeCourseId) ? current : [...current, activeCourseId]);
  }, [activeCourse?.id, activeCourse?.workspaceKind, activeTask?.courseId]);

  useEffect(() => {
    void loadReferences();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
    setSelectedReferenceId((current) => visibleReferences.some((reference) => reference.id === current) ? current : visibleReferences[0]?.id || "");
  }, [selectedScopeId, references]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2600);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (citationStyleMenuOpen) setCitationStyleMenuOpen(false);
        else if (exportMenuOpen) setExportMenuOpen(false);
        else if (referenceTypeMenuOpen) setReferenceTypeMenuOpen(false);
        else if (editorOpen) closeEditor();
        else onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [citationStyleMenuOpen, editorOpen, exportMenuOpen, onClose, referenceTypeMenuOpen]);

  async function loadReferences() {
    setLoading(true);
    setError("");
    try {
      const next = await window.brevyn.references.list({ includeCandidates: false });
      setReferences(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function referenceToDraft(reference: ReferenceItem): ReferenceDraft {
    return {
      title: reference.title || "",
      creators: reference.creators.length > 0
        ? reference.creators.map((creator) => ({
            role: creator.role,
            given: creator.given || "",
            family: creator.family || "",
            name: creator.name || "",
          }))
        : [createBlankCreator("author")],
      year: reference.year || "",
      itemType: reference.itemType,
      containerTitle: reference.containerTitle || "",
      publisher: reference.publisher || "",
      volume: reference.volume || "",
      issue: reference.issue || "",
      pages: reference.pages || "",
      doi: reference.doi || "",
      isbn: reference.isbn || "",
      url: reference.url || "",
      citationKey: reference.citationKey || "",
      language: reference.language || "",
      tags: reference.tags.join(", "),
      abstract: reference.abstract || "",
    };
  }

  function openCreateReference() {
    setEditingReferenceId("");
    setDraft(createEmptyDraft());
    setEditorOpen(true);
  }

  function openEditReference(reference: ReferenceItem) {
    setEditingReferenceId(reference.id);
    setDraft(referenceToDraft(reference));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingReferenceId("");
    setDraft(createEmptyDraft());
  }

  async function saveReference() {
    if (!draft.title.trim()) {
      setError("请先填写文献标题。");
      return;
    }
    setError("");
    try {
      if (editingReferenceId) {
        const updated = await window.brevyn.references.update(draftToUpdateInput(editingReferenceId, draft));
        setReferences((current) => [updated, ...current.filter((reference) => reference.id !== updated.id)]);
        setSelectedReferenceId(updated.id);
        setStatus("文献已更新。");
      } else {
        const created = await window.brevyn.references.create(draftToInput(draft, selectedScope.scopeInput));
        setReferences((current) => [created, ...current.filter((reference) => reference.id !== created.id)]);
        setSelectedReferenceId(created.id);
        setStatus("文献已添加。");
      }
      closeEditor();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeSelectedFromScope() {
    if (!selectedScope.scopeInput || selectedIds.length === 0) return;
    const scopeInput = selectedScope.scopeInput;
    const scopeIds = references
      .filter((reference) => selectedIds.includes(reference.id))
      .flatMap((reference) => reference.scopes.filter((scope) => matchesScope(scope, scopeInput)).map((scope) => scope.id));
    try {
      await Promise.all(scopeIds.map((scopeId) => window.brevyn.references.removeScope(scopeId)));
      await loadReferences();
      setSelectedIds([]);
      setStatus("已从当前位置移出。");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteSelectedReferences() {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((referenceId) => window.brevyn.references.delete(referenceId)));
      await loadReferences();
      setSelectedIds([]);
      setStatus("已从文献库删除。");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copyCitation(referenceIds = selectedIds.length > 0 ? selectedIds : selectedReference ? [selectedReference.id] : []) {
    if (referenceIds.length === 0) return;
    try {
      const referenceSet = new Set(referenceIds);
      const content = references
        .filter((reference) => referenceSet.has(reference.id))
        .map((reference, index) => formatCitationPreview(reference, citationStyle, index + 1))
        .join("\n\n");
      await navigator.clipboard.writeText(content);
      setStatus(`${citationStyleLabel(citationStyle)} 引用已复制。`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copyExport(format: ReferenceExportFormat) {
    const referenceIds = selectedIds.length > 0 ? selectedIds : visibleReferences.map((reference) => reference.id);
    if (referenceIds.length === 0) return;
    try {
      const result = await window.brevyn.references.export({ format, referenceIds });
      await navigator.clipboard.writeText(result.content);
      setStatus(`${result.fileName} 已复制到剪贴板。`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function toggleSelected(referenceId: string) {
    setSelectedIds((current) => current.includes(referenceId) ? current.filter((id) => id !== referenceId) : [...current, referenceId]);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-12 z-50 flex brevyn-app-background p-2 text-foreground"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="brevyn-panel-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-dialog)]">
        <div className="drag-region flex items-center justify-between bg-[hsl(var(--surface-chrome))] px-5 py-3.5 shadow-[inset_0_-1px_0_hsl(var(--border)/0.62)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Library className="h-4 w-4" />
              文献库
            </div>
            <div className="truncate text-[11px] text-muted-foreground">管理文献、引用样式和 Agent 写作来源</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground shadow-sm ring-1 ring-black/[0.06] transition hover:bg-background hover:text-foreground active:scale-[0.98]"
            onClick={onClose}
            title="关闭文献库"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden rounded-[var(--radius-panel)] bg-card/48 p-3 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.045)] dark:bg-white/[0.026] dark:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.07)]">
            <div className="min-h-0 space-y-4 overflow-y-auto overflow-x-visible pr-1 brevyn-scrollbar">
              <section className="relative rounded-[var(--radius-card)] p-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground">文献位置</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">按学期、课程和课程作业查看文献</div>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-foreground text-background shadow-sm">
                    <Library className="h-3.5 w-3.5" />
                  </span>
                </div>

                <ScopeTree
                  courseGroups={courseScopeGroups}
                  expandedCourseIds={expandedCourseIds}
                  selected={selectedScope}
                  semesterOption={semesterScope}
                  onSelect={(scopeId) => {
                    setSelectedScopeId(scopeId);
                    setExportMenuOpen(false);
                    setCitationStyleMenuOpen(false);
                  }}
                  onToggleCourse={(courseId) => {
                    setExpandedCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
                  }}
                />
              </section>

              <section className="px-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">添加</div>
                <div className="mt-2 grid gap-1">
                  <LibraryAction label="手动添加" onClick={openCreateReference} />
                  <LibraryAction label="从课程资料添加" onClick={onOpenCourses} />
                </div>
              </section>
            </div>
          </aside>

          <main className="min-h-0 overflow-hidden rounded-[var(--radius-panel)] bg-background/68 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.045)]">
            <div className="flex h-full min-h-0 flex-col">
              <section className="relative z-20 px-6 py-5">
                <div className="pointer-events-none absolute right-0 top-0 h-36 w-72 rounded-bl-[999px] bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_70%)]" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-muted/48 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      {selectedScope.title}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">References</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      按学期、课程和课程作业整理来源。写作或讨论时，Brevyn 会优先使用当前位置里的文献。
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">引用样式</span>
                      <CitationStyleSwitch
                        open={citationStyleMenuOpen}
                        value={citationStyle}
                        onSelect={(style) => {
                          setCitationStyle(style);
                          setCitationStyleMenuOpen(false);
                        }}
                        onToggle={() => {
                          setExportMenuOpen(false);
                          setCitationStyleMenuOpen((open) => !open);
                        }}
                      />
                    </div>
                  </div>
                  <div className="relative z-30 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                      onClick={openCreateReference}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      添加
                    </button>
                    <ReferenceExportSplitButton
                      className="w-[150px]"
                      disabled={visibleReferences.length === 0}
                      open={exportMenuOpen}
                      variant="secondary"
                      onExport={(format) => {
                        setExportMenuOpen(false);
                        void copyExport(format);
                      }}
                      onToggle={() => {
                        setCitationStyleMenuOpen(false);
                        setExportMenuOpen((open) => !open);
                      }}
                    />
                  </div>
                </div>
              </section>

              {(status || error) && (
                <div className="mx-6 mb-3 rounded-[var(--radius-control)] bg-card px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.045] dark:ring-white/[0.055]">
                  <span className={error ? "text-destructive" : "text-muted-foreground"}>{error || status}</span>
                </div>
              )}

              <section className="min-h-0 flex-1 overflow-hidden px-6 pb-5">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 overflow-y-auto pr-1 brevyn-scrollbar">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">当前文献</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {selectedScope.title} · {visibleReferences.length === 0 ? "暂无文献" : `${visibleReferences.length} 条文献`}
                        </div>
                      </div>
                      <BulkActions
                        disabled={selectedIds.length === 0}
                        selectedCount={selectedIds.length}
                        canRemoveScope={Boolean(selectedScope.scopeInput)}
                        citationStyle={citationStyle}
                        onCopy={() => copyCitation()}
                        onRemoveScope={removeSelectedFromScope}
                        onDelete={deleteSelectedReferences}
                      />
                    </div>

                    {loading ? (
                      <LibraryEmptyState title="正在读取文献库" description="Brevyn 正在打开本地文献数据。" />
                    ) : visibleReferences.length === 0 ? (
                      <LibraryEmptyState
                        title="这里还没有文献"
                        description="添加课程阅读、网页、论文或报告。之后写作和讨论会优先使用这里的来源。"
                        actionLabel="添加文献"
                        onAction={openCreateReference}
                      />
                    ) : (
                      <div className="space-y-2.5">
                        {visibleReferences.map((reference) => (
                          <ReferenceCard
                            key={reference.id}
                            reference={reference}
                            selected={reference.id === selectedReference?.id}
                            checked={selectedIds.includes(reference.id)}
                            citationStyle={citationStyle}
                            scopeLabel={scopeLabel(reference, selectedScope.scopeInput)}
                            onToggle={() => toggleSelected(reference.id)}
                            onSelect={() => setSelectedReferenceId(reference.id)}
                            onEdit={() => openEditReference(reference)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      {editorOpen && (
        <ReferenceEditorDialog
          mode={editingReference ? "edit" : "create"}
          draft={draft}
          scopeTitle={selectedScope.title}
          hasScope={Boolean(selectedScope.scopeInput)}
          citationStyle={citationStyle}
          typeMenuOpen={referenceTypeMenuOpen}
          previewReference={draftToPreviewReference(draft, editingReference)}
          onChange={setDraft}
          onClose={closeEditor}
          onTypeMenuOpenChange={setReferenceTypeMenuOpen}
          onSave={saveReference}
        />
      )}
    </div>
  );
}

function ScopeTree({
  courseGroups,
  expandedCourseIds,
  selected,
  semesterOption,
  onSelect,
  onToggleCourse,
}: {
  courseGroups: CourseScopeGroup[];
  expandedCourseIds: string[];
  selected: ScopeOption;
  semesterOption: ScopeOption;
  onSelect: (scopeId: string) => void;
  onToggleCourse: (courseId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <ScopeTreeRow option={semesterOption} selected={selected.id === semesterOption.id} onSelect={onSelect} />
      <div className="my-2 h-px bg-border/56" />
      <div className="space-y-1">
        {courseGroups.length === 0 ? (
          <div className="rounded-[var(--radius-control)] bg-muted/42 px-2.5 py-3 text-[11px] leading-5 text-muted-foreground">还没有课程。先在我的课程里添加课程后，这里会显示对应的课程和课程作业。</div>
        ) : courseGroups.map((group) => {
          const courseId = group.course.scopeInput?.courseId || group.course.id.replace(/^course:/, "");
          const expanded = expandedCourseIds.includes(courseId);
          return (
            <div key={group.course.id}>
              <ScopeTreeRow
                expandable
                expanded={expanded}
                option={group.course}
                selected={selected.id === group.course.id}
                onSelect={onSelect}
                onToggle={() => onToggleCourse(courseId)}
              />
              <div className={cx("grid transition-[grid-template-rows,opacity] duration-200 ease-out", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  {group.tasks.length > 0 ? (
                    <div className="ml-4 mt-1 space-y-1 pl-2">
                      {group.tasks.map((task) => (
                        <ScopeTreeRow key={task.id} compact option={task} selected={selected.id === task.id} onSelect={onSelect} />
                      ))}
                    </div>
                  ) : (
                    <div className="ml-10 px-2 py-1.5 text-[10px] text-muted-foreground">暂无课程作业</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScopeTreeRow({
  compact,
  expandable,
  expanded,
  option,
  selected,
  onSelect,
  onToggle,
}: {
  compact?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  option: ScopeOption;
  selected: boolean;
  onSelect: (scopeId: string) => void;
  onToggle?: () => void;
}) {
  const handleMainAction = () => {
    if (expandable) {
      onToggle?.();
      return;
    }
    onSelect(option.id);
  };

  return (
    <div
      className={cx(
        "group flex w-full items-center gap-1 rounded-[var(--radius-control)] transition-colors",
        selected
          ? "bg-foreground/[0.065] text-foreground shadow-sm dark:bg-white/[0.07]"
          : "text-foreground hover:bg-accent/64",
      )}
    >
      {expandable ? (
        <span
          className={cx("ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-badge)] transition", selected ? "text-foreground/62" : "text-muted-foreground")}
          aria-hidden="true"
        >
          <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90")} />
        </span>
      ) : (
        <span className={cx("shrink-0", compact ? "ml-1 h-6 w-6" : "ml-1 h-6 w-6")} />
      )}
      <button
        type="button"
        className={cx("flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] pr-2 text-left transition active:scale-[0.99]", compact ? "py-1.5" : "py-2")}
        onClick={handleMainAction}
        aria-expanded={expandable ? expanded : undefined}
      >
        <span className={cx("flex shrink-0 items-center justify-center rounded-[var(--radius-badge)]", compact ? "h-5 w-5" : "h-6 w-6", selected ? "bg-background/64 text-foreground shadow-sm dark:bg-white/[0.075] dark:text-white/82" : "bg-muted/72 text-muted-foreground")}>{option.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate font-semibold", compact ? "text-[11px]" : "text-xs")}>{option.title}</span>
          <span className={cx("mt-0.5 block truncate", compact ? "text-[9.5px]" : "text-[10px]", selected ? "text-muted-foreground" : "text-muted-foreground")}>{option.description}</span>
        </span>
        <span className={cx("rounded-[var(--radius-badge)] px-1.5 py-0.5 text-[10px]", selected ? "bg-background/54 text-muted-foreground shadow-sm dark:bg-white/[0.065]" : "bg-muted/70 text-muted-foreground")}>{option.count}</span>
      </button>
      {expandable && (
        <button
          type="button"
          className={cx(
            "mr-1 h-6 shrink-0 rounded-[var(--radius-badge)] px-1.5 text-[9.5px] font-semibold transition active:scale-[0.98]",
            selected
              ? "bg-background/54 text-foreground shadow-sm dark:bg-white/[0.075] dark:text-white/86"
              : "text-muted-foreground opacity-0 hover:bg-background/56 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-white/[0.07]",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(option.id);
          }}
          aria-label={`查看${option.title}文献`}
        >
          查看
        </button>
      )}
    </div>
  );
}

function LibraryAction({ label, muted, onClick }: { label: string; muted?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={cx(
        "flex h-8 w-full items-center justify-between rounded-[var(--radius-control)] px-2 text-left text-[11px] font-medium transition active:scale-[0.99]",
        muted ? "cursor-default text-muted-foreground/58" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={muted ? undefined : onClick}
    >
      <span className="truncate">{label}</span>
      <ArrowRight className="h-3 w-3 shrink-0" />
    </button>
  );
}

function CitationStyleSwitch({
  open,
  value,
  onSelect,
  onToggle,
}: {
  open: boolean;
  value: CitationStyle;
  onSelect: (style: CitationStyle) => void;
  onToggle: () => void;
}) {
  const selected = citationStyleOptions.find((option) => option.value === value) ?? citationStyleOptions[0];
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-background/58 px-2.5 text-[11px] font-semibold text-foreground shadow-sm shadow-black/[0.035] ring-1 ring-black/[0.045] transition hover:bg-accent active:scale-[0.98] dark:bg-white/[0.045] dark:ring-white/[0.06]"
        onClick={onToggle}
        aria-expanded={open}
      >
        {selected.label}
        <ChevronDown className={cx("h-3.5 w-3.5 text-muted-foreground transition-transform", open ? "rotate-180" : "rotate-0")} />
      </button>
      <div
        className={cx(
          "absolute left-0 top-[calc(100%+7px)] z-[80] w-[232px] overflow-hidden rounded-[var(--radius-card)] bg-card p-1 shadow-2xl shadow-black/10 ring-1 ring-black/[0.08] transition duration-150 dark:bg-[hsl(var(--surface-chrome))] dark:ring-white/[0.08]",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {citationStyleOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx("flex w-full flex-col rounded-[var(--radius-control)] px-2.5 py-2 text-left transition active:scale-[0.99]", option.value === value ? "bg-accent text-foreground" : "hover:bg-accent")}
            onClick={() => onSelect(option.value)}
          >
            <span className="text-[11px] font-semibold text-foreground">{option.label}</span>
            <span className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReferenceExportSplitButton({
  className,
  disabled,
  open,
  variant = "primary",
  onExport,
  onToggle,
}: {
  className?: string;
  disabled: boolean;
  open: boolean;
  variant?: "primary" | "secondary";
  onExport: (format: ReferenceExportFormat) => void;
  onToggle: () => void;
}) {
  const primary = variant === "primary";
  const mainClass = primary
    ? "bg-foreground text-background hover:opacity-90"
    : "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.52)] hover:bg-accent dark:shadow-[inset_0_0_0_1px_hsl(var(--border)/0.35)]";
  const arrowClass = primary
    ? "bg-foreground text-background shadow-[inset_1px_0_0_hsl(var(--background)/0.16)] hover:opacity-90"
    : "bg-card text-foreground shadow-[inset_1px_0_0_hsl(var(--border)/0.62),inset_0_0_0_1px_hsl(var(--border)/0.52)] hover:bg-accent dark:shadow-[inset_1px_0_0_hsl(var(--border)/0.45),inset_0_0_0_1px_hsl(var(--border)/0.35)]";
  return (
    <div className={cx("relative flex w-full", className)}>
      <button
        type="button"
        className={cx(
          "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-l-[var(--radius-control)] px-2.5 text-[11px] font-semibold shadow-sm transition active:scale-[0.99] disabled:cursor-default disabled:opacity-45",
          mainClass,
        )}
        disabled={disabled}
        onClick={() => onExport("apa-markdown")}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="truncate">复制导出</span>
      </button>
      <button
        type="button"
        className={cx("flex h-8 w-9 items-center justify-center rounded-r-[var(--radius-control)] transition active:scale-[0.99] disabled:cursor-default disabled:opacity-45", arrowClass)}
        disabled={disabled}
        onClick={onToggle}
        aria-label="选择导出格式"
        aria-expanded={open}
      >
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
      </button>
      <div
        className={cx(
          "absolute right-0 top-[calc(100%+7px)] z-[80] w-[228px] overflow-hidden rounded-[var(--radius-card)] bg-card p-1 shadow-2xl shadow-black/10 ring-1 ring-black/[0.08] transition duration-150 dark:bg-[hsl(var(--surface-chrome))] dark:ring-white/[0.08]",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {referenceExportOptions.map((option) => (
          <button
            key={option.format}
            type="button"
            className="flex w-full flex-col rounded-[var(--radius-control)] px-2.5 py-2 text-left transition hover:bg-accent active:scale-[0.99]"
            onClick={() => onExport(option.format)}
          >
            <span className="text-[11px] font-semibold text-foreground">{option.label}</span>
            <span className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BulkActions({
  disabled,
  selectedCount,
  canRemoveScope,
  citationStyle,
  onCopy,
  onRemoveScope,
  onDelete,
}: {
  disabled: boolean;
  selectedCount: number;
  canRemoveScope: boolean;
  citationStyle: CitationStyle;
  onCopy: () => void;
  onRemoveScope: () => void;
  onDelete: () => void;
}) {
  if (disabled) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-1 text-[10px] text-muted-foreground">已选 {selectedCount}</span>
      <button type="button" className="h-7 rounded-[var(--radius-control)] bg-card px-2 text-[10px] font-semibold text-foreground shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.055]" onClick={onCopy}>
        复制 {citationStyleLabel(citationStyle)}
      </button>
      {canRemoveScope && (
        <button type="button" className="h-7 rounded-[var(--radius-control)] bg-muted px-2 text-[10px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground" onClick={onRemoveScope}>
          从当前位置移出
        </button>
      )}
      <button type="button" className="h-7 rounded-[var(--radius-control)] bg-destructive/10 px-2 text-[10px] font-semibold text-destructive transition hover:bg-destructive/14" onClick={onDelete}>
        删除
      </button>
    </div>
  );
}

function ReferenceCard({
  reference,
  selected,
  checked,
  citationStyle,
  scopeLabel,
  onToggle,
  onSelect,
  onEdit,
}: {
  reference: ReferenceItem;
  selected: boolean;
  checked: boolean;
  citationStyle: CitationStyle;
  scopeLabel: string;
  onToggle: () => void;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <article
      className={cx(
        "group relative w-full overflow-hidden rounded-[var(--radius-card)] p-3 text-left transition hover:-translate-y-px",
        selected
          ? "bg-foreground/[0.055] shadow-[0_10px_26px_hsl(var(--foreground)/0.04)] dark:bg-white/[0.052]"
          : "bg-card/72 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.04)] dark:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.065)]",
      )}
    >
      <div className="flex items-start gap-3 pl-0.5">
        <button
          type="button"
          className={cx(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition",
            checked
              ? "bg-foreground text-background ring-transparent dark:bg-white/90 dark:text-black"
              : "bg-background text-transparent ring-border hover:text-muted-foreground",
          )}
          onClick={onToggle}
          aria-label="选择文献"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{referenceAuthor(reference)}</span>
            <span className="text-xs text-muted-foreground">{reference.year || "n.d."}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{reference.title}</h3>
          <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-badge)] bg-background/58 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm dark:bg-white/[0.05]">
            <Library className="h-3 w-3 shrink-0" />
            <span className="truncate">{scopeLabel}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{itemTypeLabel(reference.itemType)}</span>
            {reference.containerTitle && <span>· {reference.containerTitle}</span>}
            {reference.doi && <span>· DOI</span>}
          </div>
          <p className="mt-2 line-clamp-2 rounded-[var(--radius-control)] bg-background/42 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground dark:bg-white/[0.035]">
            {formatCitationPreview(reference, citationStyle)}
          </p>
        </button>
        <div className="flex shrink-0">
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-background px-2.5 text-[11px] font-medium text-muted-foreground opacity-80 shadow-sm ring-1 ring-black/[0.04] transition hover:bg-accent hover:text-foreground hover:opacity-100 active:scale-[0.98] dark:ring-white/[0.055]"
            onClick={onEdit}
          >
            <PencilLine className="h-3.5 w-3.5" />
            编辑
          </button>
        </div>
      </div>
    </article>
  );
}

function ReferenceEditorDialog({
  mode,
  draft,
  scopeTitle,
  hasScope,
  citationStyle,
  typeMenuOpen,
  previewReference,
  onChange,
  onClose,
  onTypeMenuOpenChange,
  onSave,
}: {
  mode: "create" | "edit";
  draft: ReferenceDraft;
  scopeTitle: string;
  hasScope: boolean;
  citationStyle: CitationStyle;
  typeMenuOpen: boolean;
  previewReference: ReferenceItem;
  onChange: (draft: ReferenceDraft) => void;
  onClose: () => void;
  onTypeMenuOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const title = mode === "edit" ? "编辑文献" : "添加文献";
  const description = mode === "edit"
    ? "修改后会更新这条文献在所有使用位置里的引用信息。"
    : hasScope
      ? `会保存到「${scopeTitle}」，之后可继续用于当前学习语境。`
      : "会先保存为一条本地文献，之后可以绑定到课程或作业。";
  const fieldSet = referenceFieldSet(draft.itemType);

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-foreground/16 p-5 backdrop-blur-sm" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[calc(100vh-96px)] w-[min(980px,calc(100vw-64px))] flex-col overflow-hidden rounded-[var(--radius-dialog)] bg-card shadow-2xl ring-1 ring-black/[0.08] dark:bg-card dark:ring-white/[0.08]">
        <div className="relative z-[80] grid shrink-0 grid-cols-[44px_minmax(0,1fr)_44px] items-start gap-3 overflow-visible px-5 py-4 shadow-[inset_0_-1px_0_hsl(var(--border)/0.58)]">
          <button type="button" className="no-drag flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-background/70 text-muted-foreground shadow-sm ring-1 ring-black/[0.045] transition hover:bg-accent hover:text-foreground active:scale-[0.98] dark:bg-white/[0.055] dark:ring-white/[0.06]" onClick={onClose} aria-label="返回文献库">
            <ArrowRight className="h-4 w-4 rotate-180" />
          </button>
          <div className="grid min-w-0 justify-items-center gap-2 text-center">
            <div className="min-w-0">
              <div className="text-base font-semibold tracking-[-0.02em] text-foreground dark:text-white/95">{title}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground dark:text-white/62">{description}</div>
            </div>
            <ReferenceTypeDropdown
              open={typeMenuOpen}
              value={draft.itemType}
              onSelect={(itemType) => {
                onChange({ ...draft, itemType });
                onTypeMenuOpenChange(false);
              }}
              onToggle={() => onTypeMenuOpenChange(!typeMenuOpen)}
            />
          </div>
          <button type="button" className="no-drag flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-background/82 text-foreground shadow-sm ring-1 ring-black/[0.075] transition hover:bg-[hsl(var(--status-danger)/0.11)] hover:text-[hsl(var(--status-danger))] active:scale-[0.98] dark:bg-white/[0.075] dark:text-white/90 dark:ring-white/[0.095] dark:hover:bg-[hsl(var(--status-danger)/0.18)] dark:hover:text-[hsl(var(--status-danger))]" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4 stroke-[2.4]" />
          </button>
        </div>

        <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-6 py-5 brevyn-scrollbar">
          <div className="mx-auto grid max-w-[820px] gap-6">
            <ReferenceFormSection title="贡献者" status={draft.creators.some(hasCreatorName) ? "complete" : "attention"}>
              <CreatorRows
                creators={draft.creators}
                itemType={draft.itemType}
                onChange={(creators) => onChange({ ...draft, creators })}
              />
              <p className="text-[10px] leading-4 text-muted-foreground dark:text-white/58">个人作者分开填写名和姓；机构作者放在 Organization / Institution。</p>
            </ReferenceFormSection>

            <ReferenceFormSection title={fieldSet.workSectionTitle} status={draft.title || draft.year ? "complete" : "attention"}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                <Field label={fieldSet.titleLabel} value={draft.title} onChange={(title) => onChange({ ...draft, title })} placeholder={fieldSet.titlePlaceholder} />
                <Field label="Year" value={draft.year} onChange={(year) => onChange({ ...draft, year })} placeholder="2024" />
              </div>
              <FieldGrid>
                {fieldSet.showContainer && (
                  <Field label={fieldSet.containerLabel} value={draft.containerTitle} onChange={(containerTitle) => onChange({ ...draft, containerTitle })} placeholder={fieldSet.containerPlaceholder} />
                )}
                {fieldSet.showPublisher && (
                  <Field label={fieldSet.publisherLabel} value={draft.publisher} onChange={(publisher) => onChange({ ...draft, publisher })} placeholder="Publisher or institution" />
                )}
                {fieldSet.showLanguage && (
                  <Field label="Language" value={draft.language} onChange={(language) => onChange({ ...draft, language })} placeholder="en, zh, Spanish..." />
                )}
              </FieldGrid>
            </ReferenceFormSection>

            <ReferenceFormSection title="卷期与定位" status={draft.volume || draft.issue || draft.pages || draft.doi || draft.isbn ? "complete" : "neutral"}>
              <FieldGrid>
                {fieldSet.showVolume && <Field label="Volume" value={draft.volume} onChange={(volume) => onChange({ ...draft, volume })} placeholder="12" />}
                {fieldSet.showIssue && <Field label="Issue" value={draft.issue} onChange={(issue) => onChange({ ...draft, issue })} placeholder="3" />}
                {fieldSet.showPages && <Field label={fieldSet.pagesLabel} value={draft.pages} onChange={(pages) => onChange({ ...draft, pages })} placeholder={fieldSet.pagesPlaceholder} />}
                <Field label="DOI" value={draft.doi} onChange={(doi) => onChange({ ...draft, doi })} placeholder="10.xxxx/xxxxx" />
                {fieldSet.showIsbn && <Field label="ISBN" value={draft.isbn} onChange={(isbn) => onChange({ ...draft, isbn })} placeholder="978..." />}
              </FieldGrid>
            </ReferenceFormSection>

            <ReferenceFormSection title="访问与备注" status={draft.url || draft.tags || draft.abstract ? "complete" : "neutral"}>
              <FieldGrid>
                <Field label="URL" value={draft.url} onChange={(url) => onChange({ ...draft, url })} placeholder="https://..." />
                <Field label="Citation key" value={draft.citationKey} onChange={(citationKey) => onChange({ ...draft, citationKey })} placeholder="smith2024policy" />
                <Field label="Tags" value={draft.tags} onChange={(tags) => onChange({ ...draft, tags })} placeholder="writing, evidence, policy" />
              </FieldGrid>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground dark:text-white/64">摘要 / 备注</span>
                <textarea
                  value={draft.abstract}
                  onChange={(event) => onChange({ ...draft, abstract: event.target.value })}
                  className="min-h-[118px] rounded-[var(--radius-control)] bg-background px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border/70 transition placeholder:text-muted-foreground/72 focus:ring-foreground/22 dark:text-white/90 dark:placeholder:text-white/36 dark:ring-white/[0.10] dark:focus:ring-white/22"
                  placeholder="这条文献为什么对课程或作业有用"
                />
              </label>
            </ReferenceFormSection>
          </div>
        </div>

        <div className="shrink-0 bg-muted/58 px-5 py-4 shadow-[inset_0_1px_0_hsl(var(--border)/0.56)] dark:bg-white/[0.045]">
          <div className="mx-auto flex max-w-[780px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex rounded-[var(--radius-pill)] bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm ring-1 ring-black/[0.035] dark:bg-white/[0.06] dark:ring-white/[0.05]">
                {citationStyleLabel(citationStyle)} 预览
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground dark:text-white/70">{formatCitationPreview(previewReference, citationStyle)}</p>
            </div>
            <button type="button" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98]" onClick={onSave}>
              <CheckCircle2 className="h-4 w-4" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferenceFormSection({ children, status, title }: { children: ReactNode; status: "complete" | "attention" | "neutral"; title: string }) {
  const statusClass = {
    complete: "text-[hsl(var(--status-success))]",
    attention: "text-[hsl(var(--status-warning))]",
    neutral: "text-muted-foreground",
  }[status];
  return (
    <section className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
      <div className="flex items-center gap-2 pt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:text-white/66">
        <span>{title}</span>
        <span className="h-px min-w-8 flex-1 bg-border/56" />
      </div>
      <div className="grid gap-3">
        {children}
      </div>
      <div className="hidden sm:block" />
      <div className={cx("-mt-2 flex justify-end text-[10px] font-medium", statusClass)}>
        {status === "complete" ? "已填写" : status === "attention" ? "建议补充" : "可选"}
      </div>
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground dark:text-white/64">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-[var(--radius-control)] bg-background px-3 text-sm text-foreground outline-none ring-1 ring-border/70 transition placeholder:text-muted-foreground/72 focus:ring-foreground/22 dark:text-white/90 dark:placeholder:text-white/36 dark:ring-white/[0.10] dark:focus:ring-white/22"
        placeholder={placeholder}
      />
    </label>
  );
}

function ReferenceTypeDropdown({
  open,
  value,
  onSelect,
  onToggle,
}: {
  open: boolean;
  value: ReferenceItemType;
  onSelect: (value: ReferenceItemType) => void;
  onToggle: () => void;
}) {
  const selected = referenceItemTypeOptions.find((option) => option.value === value) || referenceItemTypeOptions[0];
  const priorityOptions = referenceItemTypeOptions.filter((option) => ["webpage", "book", "article-journal", "video"].includes(option.value));
  const moreOptions = referenceItemTypeOptions.filter((option) => !priorityOptions.some((priority) => priority.value === option.value));
  const selectedInMore = moreOptions.some((option) => option.value === value);
  return (
    <div className="relative z-[90] flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[var(--radius-card)] bg-background/66 p-1 shadow-sm ring-1 ring-black/[0.045] dark:bg-white/[0.055] dark:ring-white/[0.075]">
      {priorityOptions.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cx(
              "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 text-[12px] font-semibold tracking-[-0.01em] transition active:scale-[0.98]",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-black/[0.05] dark:bg-white/[0.12] dark:text-white dark:ring-white/[0.11]"
                : "text-muted-foreground hover:bg-card/72 hover:text-foreground dark:text-white/68 dark:hover:bg-white/[0.075] dark:hover:text-white/92",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className={cx("shrink-0", active ? "text-[hsl(var(--foreground))] dark:text-white" : "text-muted-foreground dark:text-white/58")}>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={cx(
          "inline-flex h-9 min-w-[92px] items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 text-[12px] font-semibold tracking-[-0.01em] transition active:scale-[0.98]",
          selectedInMore
            ? "bg-card text-foreground shadow-sm ring-1 ring-black/[0.05] dark:bg-white/[0.12] dark:text-white dark:ring-white/[0.11]"
            : "text-muted-foreground hover:bg-card/72 hover:text-foreground dark:text-white/68 dark:hover:bg-white/[0.075] dark:hover:text-white/92",
        )}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="truncate">{selectedInMore ? selected.label : "More"}</span>
        <ChevronDown className={cx("h-3.5 w-3.5 text-muted-foreground transition-transform dark:text-white/58", open ? "rotate-180" : "rotate-0")} />
      </button>
      <div
        className={cx(
          "absolute right-0 top-[calc(100%+8px)] z-[90] w-[256px] overflow-hidden rounded-[var(--radius-card)] bg-card p-1.5 text-left shadow-2xl shadow-black/12 ring-1 ring-black/[0.08] transition duration-150 dark:bg-[hsl(var(--surface-chrome))] dark:ring-white/[0.10]",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {moreOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx(
              "flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2.5 text-left transition active:scale-[0.99]",
              option.value === value ? "bg-accent text-foreground dark:bg-white/[0.085] dark:text-white/95" : "hover:bg-accent dark:hover:bg-white/[0.06]",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span className={cx("mt-0.5 shrink-0", option.value === value ? "text-foreground dark:text-white" : "text-muted-foreground dark:text-white/60")}>{option.icon}</span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-foreground dark:text-white/92">{option.label}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground dark:text-white/56">{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CreatorRows({
  creators,
  itemType,
  onChange,
}: {
  creators: CreatorDraft[];
  itemType: ReferenceItemType;
  onChange: (creators: CreatorDraft[]) => void;
}) {
  const primaryRoleLabel = itemType === "book" ? "Book author" : itemType === "chapter" ? "Chapter author" : itemType === "report" ? "Report author" : "Author";
  const updateCreator = (index: number, patch: Partial<CreatorDraft>) => {
    onChange(creators.map((creator, currentIndex) => currentIndex === index ? { ...creator, ...patch } : creator));
  };
  const removeCreator = (index: number) => {
    const next = creators.filter((_, currentIndex) => currentIndex !== index);
    onChange(next.length > 0 ? next : [createBlankCreator("author")]);
  };

  return (
    <div className="grid gap-2">
      {creators.map((creator, index) => (
        <div key={index} className="grid gap-2 rounded-[var(--radius-control)] bg-background/58 p-2 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.42)] dark:bg-white/[0.045] dark:shadow-[inset_0_0_0_1px_hsl(var(--border)/0.30)] sm:grid-cols-[128px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_34px]">
          <select
            value={creator.role}
            onChange={(event) => updateCreator(index, { role: event.target.value as ReferenceCreatorRole })}
            className="h-9 rounded-[var(--radius-control)] bg-card px-2 text-[11px] font-semibold text-foreground outline-none ring-1 ring-border/60 transition focus:ring-foreground/22 dark:bg-black/[0.16] dark:text-white/90 dark:ring-white/[0.10] dark:focus:ring-white/22"
          >
            <option value="author">{primaryRoleLabel}</option>
            <option value="editor">Editor</option>
            <option value="translator">Translator</option>
          </select>
          <input
            value={creator.given}
            onChange={(event) => updateCreator(index, { given: event.target.value })}
            className="h-9 rounded-[var(--radius-control)] bg-card px-2.5 text-sm text-foreground outline-none ring-1 ring-border/60 transition placeholder:text-muted-foreground/72 focus:ring-foreground/22 dark:bg-black/[0.16] dark:text-white/90 dark:placeholder:text-white/36 dark:ring-white/[0.10] dark:focus:ring-white/22"
            placeholder="First name(s)"
          />
          <input
            value={creator.family}
            onChange={(event) => updateCreator(index, { family: event.target.value })}
            className="h-9 rounded-[var(--radius-control)] bg-card px-2.5 text-sm text-foreground outline-none ring-1 ring-border/60 transition placeholder:text-muted-foreground/72 focus:ring-foreground/22 dark:bg-black/[0.16] dark:text-white/90 dark:placeholder:text-white/36 dark:ring-white/[0.10] dark:focus:ring-white/22"
            placeholder="Last name"
          />
          <input
            value={creator.name}
            onChange={(event) => updateCreator(index, { name: event.target.value })}
            className="h-9 rounded-[var(--radius-control)] bg-card px-2.5 text-sm text-foreground outline-none ring-1 ring-border/60 transition placeholder:text-muted-foreground/72 focus:ring-foreground/22 dark:bg-black/[0.16] dark:text-white/90 dark:placeholder:text-white/36 dark:ring-white/[0.10] dark:focus:ring-white/22"
            placeholder="Organization / Institution"
          />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-[hsl(var(--status-danger)/0.10)] hover:text-[hsl(var(--status-danger))] dark:text-white/48"
            onClick={() => removeCreator(index)}
            aria-label="移除贡献者"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground dark:bg-white/[0.06] dark:text-white/62 dark:hover:bg-white/[0.09] dark:hover:text-white/90" onClick={() => onChange([...creators, createBlankCreator("author")])}>
          <Plus className="h-3.5 w-3.5" />
          Add author
        </button>
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground dark:bg-white/[0.06] dark:text-white/62 dark:hover:bg-white/[0.09] dark:hover:text-white/90" onClick={() => onChange([...creators, createBlankCreator("editor")])}>
          <Plus className="h-3.5 w-3.5" />
          Add editor
        </button>
      </div>
    </div>
  );
}

function LibraryEmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] bg-muted/62 text-muted-foreground shadow-sm shadow-black/[0.025] dark:bg-white/[0.055]">
        <FileText className="h-[18px] w-[18px]" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">{description}</p>
      {actionLabel && (
        <button type="button" className="mt-4 h-9 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98]" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function filterReferencesForScope(references: ReferenceItem[], scope: ScopeOption): ReferenceItem[] {
  if (!scope.scopeInput) return references;
  const scopeInput = scope.scopeInput;
  return references.filter((reference) => reference.scopes.some((item) => item.status === "active" && matchesScope(item, scopeInput)));
}

function countReferencesByScope(references: ReferenceItem[], input: ScopeOption["scopeInput"]): number {
  if (!input) return 0;
  return references.filter((reference) => reference.scopes.some((scope) => scope.status === "active" && matchesScope(scope, input))).length;
}

function matchesScope(scope: ReferenceScope, input: NonNullable<ScopeOption["scopeInput"]>): boolean {
  if (input.scopeType !== scope.scopeType) return false;
  if (input.scopeType === "semester") return Boolean(input.semesterId && scope.semesterId === input.semesterId);
  if (input.scopeType === "course") return Boolean(input.courseId && scope.courseId === input.courseId);
  if (input.scopeType === "task") return Boolean(input.taskId && scope.taskId === input.taskId);
  return false;
}

function scopeLabel(reference: ReferenceItem, input?: ScopeOption["scopeInput"]): string {
  if (input && reference.scopes.some((scope) => matchesScope(scope, input))) {
    if (input.scopeType === "semester") return "当前学期";
    if (input.scopeType === "course") return "当前课程";
    if (input.scopeType === "task") return "当前课程作业";
  }
  const activeScopes = reference.scopes.filter((scope) => scope.status !== "rejected");
  const scopeNames = [
    activeScopes.some((scope) => scope.scopeType === "task" && scope.status === "active") ? "课程作业" : "",
    activeScopes.some((scope) => scope.scopeType === "course" && scope.status === "active") ? "课程" : "",
    activeScopes.some((scope) => scope.scopeType === "semester" && scope.status === "active") ? "学期" : "",
  ].filter(Boolean);
  return scopeNames.length > 0 ? `已放入：${scopeNames.join(" / ")}` : "未放入学习位置";
}

function draftToInput(draft: ReferenceDraft, scope?: ScopeOption["scopeInput"]): ReferenceCreateInput {
  return {
    itemType: draft.itemType || "document",
    title: draft.title,
    year: draft.year.trim() || undefined,
    containerTitle: draft.containerTitle.trim() || undefined,
    abstract: draft.abstract.trim() || undefined,
    language: draft.language.trim() || undefined,
    publisher: draft.publisher.trim() || undefined,
    volume: draft.volume.trim() || undefined,
    issue: draft.issue.trim() || undefined,
    pages: draft.pages.trim() || undefined,
    sourceKind: "manual",
    doi: draft.doi.trim() || undefined,
    isbn: draft.isbn.trim() || undefined,
    url: draft.url.trim() || undefined,
    citationKey: draft.citationKey.trim() || undefined,
    creators: draft.creators.map((creator) => ({
      role: creator.role,
      given: creator.given.trim() || undefined,
      family: creator.family.trim() || undefined,
      name: creator.name.trim() || undefined,
    })),
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    scope: scope ? {
      ...scope,
      status: "active",
      addedBy: "user",
    } : undefined,
  };
}

function draftToUpdateInput(referenceId: string, draft: ReferenceDraft): ReferenceUpdateInput {
  return {
    id: referenceId,
    itemType: draft.itemType || "document",
    title: draft.title,
    year: draft.year.trim() || undefined,
    containerTitle: draft.containerTitle.trim() || undefined,
    abstract: draft.abstract.trim() || undefined,
    language: draft.language.trim() || undefined,
    publisher: draft.publisher.trim() || undefined,
    volume: draft.volume.trim() || undefined,
    issue: draft.issue.trim() || undefined,
    pages: draft.pages.trim() || undefined,
    doi: draft.doi.trim() || undefined,
    isbn: draft.isbn.trim() || undefined,
    url: draft.url.trim() || undefined,
    citationKey: draft.citationKey.trim() || undefined,
    creators: draft.creators.map((creator) => ({
      role: creator.role,
      given: creator.given.trim() || undefined,
      family: creator.family.trim() || undefined,
      name: creator.name.trim() || undefined,
    })),
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function draftToPreviewReference(draft: ReferenceDraft, fallback?: ReferenceItem): ReferenceItem {
  const timestamp = fallback?.updatedAt || new Date().toISOString();
  return {
    id: fallback?.id || "preview",
    itemType: draft.itemType || fallback?.itemType || "document",
    title: draft.title.trim() || fallback?.title || "Untitled reference",
    year: draft.year.trim() || fallback?.year,
    containerTitle: draft.containerTitle.trim() || fallback?.containerTitle,
    language: draft.language.trim() || fallback?.language,
    publisher: draft.publisher.trim() || fallback?.publisher,
    volume: draft.volume.trim() || fallback?.volume,
    issue: draft.issue.trim() || fallback?.issue,
    pages: draft.pages.trim() || fallback?.pages,
    doi: draft.doi.trim() || fallback?.doi,
    isbn: draft.isbn.trim() || fallback?.isbn,
    url: draft.url.trim() || fallback?.url,
    citationKey: draft.citationKey.trim() || fallback?.citationKey,
    abstract: draft.abstract.trim() || fallback?.abstract,
    sourceKind: fallback?.sourceKind || "manual",
    creators: draft.creators
      .filter(hasCreatorName)
      .map((creator, index) => ({
        id: fallback?.creators[index]?.id || `preview-creator-${index}`,
        referenceId: fallback?.id || "preview",
        role: creator.role,
        given: creator.given.trim() || undefined,
        family: creator.family.trim() || undefined,
        name: creator.name.trim() || undefined,
        position: index,
      })),
    scopes: fallback?.scopes || [],
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    createdAt: fallback?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function hasCreatorName(creator: Pick<CreatorDraft, "given" | "family" | "name">): boolean {
  return Boolean(creator.given.trim() || creator.family.trim() || creator.name.trim());
}

function referenceAuthor(reference: ReferenceItem): string {
  const creator = reference.creators.find((item) => item.role === "author") || reference.creators[0];
  if (!creator) return "Unknown author";
  return creator.family || creator.name || [creator.given, creator.family].filter(Boolean).join(" ") || "Unknown author";
}

function citationStyleLabel(style: CitationStyle): string {
  return citationStyleOptions.find((option) => option.value === style)?.label || "APA 7";
}

function formatCitationPreview(reference: ReferenceItem, style: CitationStyle, index = 1): string {
  if (style === "mla9") return formatMlaPreview(reference);
  if (style === "chicago") return formatChicagoPreview(reference);
  if (style === "harvard") return formatHarvardPreview(reference);
  if (style === "ieee") return formatIeeePreview(reference, index);
  return formatApaPreview(reference);
}

function formatApaPreview(reference: ReferenceItem): string {
  const authors = formatApaAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const editors = formatApaEditors(reference.creators.filter((creator) => creator.role === "editor"));
  const year = reference.year || "n.d.";
  const url = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
  if (reference.itemType === "article-journal") {
    const journalPart = [reference.containerTitle, journalVolumeIssue(reference, "apa"), reference.pages].filter(Boolean).join(", ");
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, journalPart, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "book") {
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "chapter") {
    const bookPart = [`In ${editors || "Editor"}`, reference.containerTitle, reference.pages ? `(pp. ${reference.pages})` : ""].filter(Boolean).join(", ");
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, bookPart, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "thesis") {
    const thesisType = reference.containerTitle || "Thesis";
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title} [${thesisType}].`, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "webpage") {
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, reference.containerTitle || reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "video") {
    const source = reference.containerTitle || reference.publisher;
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title} [Video].`, source, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "report") {
    const reportTitle = reference.containerTitle ? `${reference.title} (${reference.containerTitle}).` : `${reference.title}.`;
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reportTitle}`, reference.publisher, url].filter(Boolean).join(" "));
  }
  const source = [reference.containerTitle, reference.publisher].filter(Boolean).join(". ");
  return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, source, url].filter(Boolean).join(" "));
}

function formatMlaPreview(reference: ReferenceItem): string {
  const authors = formatMlaAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const editors = formatMlaEditors(reference.creators.filter((creator) => creator.role === "editor"));
  const year = reference.year || "n.d.";
  const url = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
  if (reference.itemType === "book") {
    return cleanCitation([`${authors || "Unknown author"}. ${reference.title}.`, reference.publisher, year, url].filter(Boolean).join(", ") + ".");
  }
  if (reference.itemType === "chapter") {
    return cleanCitation([`${authors || "Unknown author"}. "${reference.title}."`, reference.containerTitle, editors, reference.publisher, year, reference.pages ? `pp. ${reference.pages}` : "", url].filter(Boolean).join(", ") + ".");
  }
  const container = reference.containerTitle || reference.publisher;
  const locator = reference.itemType === "article-journal"
    ? [journalVolumeIssue(reference, "mla"), reference.pages ? `pp. ${reference.pages}` : ""].filter(Boolean).join(", ")
    : reference.pages ? `pp. ${reference.pages}` : "";
  return cleanCitation([`${authors || "Unknown author"}. "${reference.title}."`, container, reference.publisher && reference.publisher !== container ? reference.publisher : "", year, locator, url].filter(Boolean).join(", ") + ".");
}

function formatChicagoPreview(reference: ReferenceItem): string {
  const authors = formatChicagoAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const editors = formatChicagoEditors(reference.creators.filter((creator) => creator.role === "editor"));
  const year = reference.year || "n.d.";
  const url = reference.doi ? ` https://doi.org/${reference.doi}.` : reference.url ? ` ${reference.url}.` : "";
  if (reference.itemType === "book") {
    return cleanCitation([`${authors || "Unknown author"}. ${year}. ${reference.title}.`, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "chapter") {
    return cleanCitation([`${authors || "Unknown author"}. ${year}. "${reference.title}."`, `In ${reference.containerTitle || "Book title"}`, editors, reference.pages ? `${reference.pages}.` : "", reference.publisher, url].filter(Boolean).join(" "));
  }
  const locator = chicagoLocator(reference);
  const title = reference.itemType === "article-journal" || reference.itemType === "webpage" || reference.itemType === "video" ? `"${reference.title}."` : `${reference.title}.`;
  return cleanCitation([`${authors || "Unknown author"}. ${year}. ${title}`, reference.containerTitle || reference.publisher, locator, url].filter(Boolean).join(" "));
}

function formatHarvardPreview(reference: ReferenceItem): string {
  const authors = formatHarvardAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const editors = formatHarvardEditors(reference.creators.filter((creator) => creator.role === "editor"));
  const year = reference.year || "n.d.";
  if (reference.itemType === "book") {
    return cleanCitation([`${authors || "Unknown author"} (${year}) ${reference.title}.`, reference.publisher].filter(Boolean).join(" "));
  }
  if (reference.itemType === "chapter") {
    return cleanCitation([`${authors || "Unknown author"} (${year}) '${reference.title}',`, editors ? `in ${editors},` : "", reference.containerTitle, reference.publisher, reference.pages ? `pp. ${reference.pages}` : ""].filter(Boolean).join(" "));
  }
  const source = reference.containerTitle || reference.publisher;
  const locator = [reference.volume ? `vol. ${reference.volume}` : "", reference.issue ? `no. ${reference.issue}` : "", reference.pages ? `pp. ${reference.pages}` : ""].filter(Boolean).join(", ");
  const url = reference.doi ? `doi: ${reference.doi}` : reference.url;
  return cleanCitation([`${authors || "Unknown author"} (${year}) '${reference.title}',`, source, locator, url].filter(Boolean).join(" "));
}

function formatIeeePreview(reference: ReferenceItem, index: number): string {
  const authors = formatIeeeAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const year = reference.year;
  const url = reference.doi ? `doi: ${reference.doi}` : reference.url;
  if (reference.itemType === "book") {
    return cleanCitation([`[${index}] ${authors || "Unknown author"}, ${reference.title}.`, reference.publisher, year, url].filter(Boolean).join(", ") + ".");
  }
  const source = reference.containerTitle || reference.publisher;
  const locator = [reference.volume ? `vol. ${reference.volume}` : "", reference.issue ? `no. ${reference.issue}` : "", reference.pages ? `pp. ${reference.pages}` : ""].filter(Boolean).join(", ");
  return cleanCitation([`[${index}] ${authors || "Unknown author"}, "${reference.title},"`, source, locator, year, url].filter(Boolean).join(", ") + ".");
}

function journalVolumeIssue(reference: ReferenceItem, style: "apa" | "mla"): string {
  if (!reference.volume && !reference.issue) return "";
  if (style === "mla") return [reference.volume ? `vol. ${reference.volume}` : "", reference.issue ? `no. ${reference.issue}` : ""].filter(Boolean).join(", ");
  return `${reference.volume || ""}${reference.issue ? `(${reference.issue})` : ""}`;
}

function chicagoLocator(reference: ReferenceItem): string {
  const volumeIssue = reference.volume ? `${reference.volume}${reference.issue ? `, no. ${reference.issue}` : ""}` : reference.issue ? `no. ${reference.issue}` : "";
  const pages = reference.pages ? `: ${reference.pages}.` : volumeIssue ? "." : "";
  return [volumeIssue, pages].filter(Boolean).join("");
}

function formatMlaAuthors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  return creators.map((creator, index) => {
    if (creator.name) return creator.name;
    const full = [creator.given, creator.family].filter(Boolean).join(" ");
    if (index === 0 && creator.family && creator.given) return `${creator.family}, ${creator.given}`;
    return full || creator.family || creator.given || "Unknown";
  }).join(", ");
}

function formatApaAuthors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  return creators.map((creator) => {
    if (creator.name) return creator.name;
    if (creator.family && creator.given) return `${creator.family}, ${creator.given.slice(0, 1).toUpperCase()}.`;
    return creator.family || creator.given || "Unknown";
  }).join(", ");
}

function formatApaEditors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  const names = creators.map((creator) => {
    if (creator.name) return creator.name;
    const initial = creator.given ? `${creator.given.slice(0, 1).toUpperCase()}.` : "";
    return [initial, creator.family].filter(Boolean).join(" ") || creator.given || "Unknown";
  }).join(", ");
  return `${names} (Ed${creators.length > 1 ? "s" : ""}.)`;
}

function formatMlaEditors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  const names = creators.map((creator) => creator.name || [creator.given, creator.family].filter(Boolean).join(" ") || creator.family || "Unknown").join(", ");
  return `edited by ${names}`;
}

function formatChicagoAuthors(creators: ReferenceItem["creators"]): string {
  return formatMlaAuthors(creators);
}

function formatChicagoEditors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  const names = creators.map((creator) => creator.name || [creator.given, creator.family].filter(Boolean).join(" ") || creator.family || "Unknown").join(", ");
  return `edited by ${names}.`;
}

function formatHarvardAuthors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  if (creators.length > 3) {
    const first = creators[0];
    return `${first.family || first.name || first.given || "Unknown"} et al.`;
  }
  return creators.map((creator) => creator.family || creator.name || [creator.given, creator.family].filter(Boolean).join(" ") || "Unknown").join(", ");
}

function formatHarvardEditors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  const names = creators.map((creator) => creator.family || creator.name || [creator.given, creator.family].filter(Boolean).join(" ") || "Unknown").join(", ");
  return `${names} (ed${creators.length > 1 ? "s" : ""}.)`;
}

function formatIeeeAuthors(creators: ReferenceItem["creators"]): string {
  if (creators.length === 0) return "";
  return creators.map((creator) => {
    if (creator.name) return creator.name;
    const initial = creator.given ? `${creator.given.slice(0, 1).toUpperCase()}.` : "";
    return [initial, creator.family].filter(Boolean).join(" ") || creator.given || "Unknown";
  }).join(", ");
}

function cleanCitation(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+:/g, ":")
    .trim();
}

function itemTypeLabel(type: ReferenceItem["itemType"]): string {
  return {
    "article-journal": "Journal article",
    book: "Book",
    chapter: "Book chapter",
    "paper-conference": "Conference paper",
    report: "Report",
    webpage: "Webpage",
    video: "Video",
    thesis: "Thesis",
    document: "Document",
  }[type];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "文献操作失败。");
}
