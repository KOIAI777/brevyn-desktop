import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Image, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Course, SemesterWorkspace, TimetableEvent, TimetableViewMode } from "@/types/domain";
import { cx } from "@/lib/cn";

export function TimetableDialog({
  course,
  onSemesterUpdated,
  onClose,
}: {
  course?: Course;
  onSemesterUpdated?: (semester: SemesterWorkspace) => void;
  onClose: () => void;
}) {
  const [viewMode, setViewMode] = useState<TimetableViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date("2026-05-06T12:00:00"));
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [semester, setSemester] = useState<SemesterWorkspace | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const range = useMemo(() => getRange(anchorDate, viewMode), [anchorDate, viewMode]);

  useEffect(() => {
    void loadSemester();
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [course?.id, range.start.toISOString(), range.end.toISOString(), viewMode]);

  async function loadSemester() {
    setSemester(await window.uclaw.semester.current());
  }

  async function loadEvents() {
    const result = await window.uclaw.timetable.range({
      viewMode,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      courseId: course?.id,
      includeDeadlines: true,
      includeSchoolEvents: true,
    });
    setEvents(result);
  }

  async function analyzeImage() {
    setAnalyzing(true);
    try {
      const result = await window.uclaw.semester.analyzeImage({
        instruction: "Recognize semester number, term name, semester date range, school events, and timetable anchors from uploaded school calendar or timetable images.",
      });
      setSemester(result.semester);
      onSemesterUpdated?.(result.semester);
      setAnchorDate(new Date(result.semester.startsAt || result.createdEvents[0]?.startsAt || Date.now()));
      await loadEvents();
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" />
              Timetable
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{semester?.term || range.label} · semester, deadlines, school events, and course sessions</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close timetable"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex rounded-md border bg-background p-0.5">
            {(["week", "month", "year"] as TimetableViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cx("h-7 rounded px-3 text-[11px] font-medium capitalize transition", viewMode === mode ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setAnchorDate(shiftDate(anchorDate, viewMode, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-[190px] truncate text-center text-xs font-semibold">{range.label}</div>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setAnchorDate(shiftDate(anchorDate, viewMode, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1.35fr_0.75fr] uclaw-scrollbar">
          <section className="rounded-lg border bg-background/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold">{viewModeLabel(viewMode)}</div>
              <EventLegend />
            </div>
            {viewMode === "week" && <WeekGrid start={range.start} events={events} />}
            {viewMode === "month" && <MonthGrid anchor={anchorDate} events={events} />}
            {viewMode === "year" && <YearGrid anchor={anchorDate} events={events} />}
          </section>

          <aside className="space-y-3">
            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                Semester Recognition
              </div>
              <div className="mb-2 rounded-md bg-muted/55 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">{semester?.semesterNo || "Semester not recognized"}</span>
                <span> · </span>
                <span>{semester?.folderName || "folder will be generated after upload"}</span>
              </div>
              <div className="rounded-md border border-dashed bg-card px-3 py-5 text-center text-xs leading-5 text-muted-foreground">
                Upload a school calendar or timetable image first. Multimodal AI recognizes the semester number and date range, then generates the semester folder.
              </div>
              <button
                type="button"
                className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                onClick={analyzeImage}
                disabled={analyzing}
              >
                <Upload className="h-3.5 w-3.5" />
                {analyzing ? "Recognizing..." : "Recognize semester"}
              </button>
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Clock3 className="h-3.5 w-3.5" />
                Event Interfaces
              </div>
              <div className="space-y-2 text-[11px] text-muted-foreground">
                <Hook icon={<CalendarDays className="h-3 w-3" />} label="course_session" />
                <Hook icon={<FileText className="h-3 w-3" />} label="deadline" />
                <Hook icon={<Image className="h-3 w-3" />} label="school_event" />
              </div>
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-2 text-xs font-semibold">Upcoming</div>
              <div className="space-y-2">
                {events.slice(0, 5).map((event) => (
                  <EventCard key={event.id} event={event} compact />
                ))}
                {events.length === 0 && <div className="rounded-md border border-dashed bg-card px-3 py-4 text-center text-xs text-muted-foreground">No events in this range.</div>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function WeekGrid({ start, events }: { start: Date; events: TimetableEvent[] }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => (
        <div key={day.toISOString()} className="min-h-[300px] rounded-md border bg-card px-2 py-2">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">{formatDay(day)}</div>
          <div className="space-y-2">
            {eventsForDay(events, day).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthGrid({ anchor, events }: { anchor: Date; events: TimetableEvent[] }) {
  const days = monthDays(anchor);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => (
        <div key={day.toISOString()} className="min-h-[94px] rounded-md border bg-card px-2 py-1.5">
          <div className="text-[10px] font-medium text-muted-foreground">{day.getDate()}</div>
          <div className="mt-1 space-y-1">
            {eventsForDay(events, day)
              .slice(0, 3)
              .map((event) => (
                <div key={event.id} className={cx("truncate rounded px-1.5 py-0.5 text-[10px]", eventTone(event.kind))}>{event.title}</div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function YearGrid({ anchor, events }: { anchor: Date; events: TimetableEvent[] }) {
  const year = anchor.getFullYear();
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 12 }, (_, month) => {
        const monthEvents = events.filter((event) => {
          const date = new Date(event.startsAt);
          return date.getFullYear() === year && date.getMonth() === month;
        });
        return (
          <div key={month} className="min-h-[110px] rounded-md border bg-card px-3 py-2">
            <div className="text-xs font-semibold">{new Date(year, month, 1).toLocaleString("en", { month: "short" })}</div>
            <div className="mt-2 space-y-1">
              {(["course_session", "deadline", "school_event"] as const).map((kind) => (
                <div key={kind} className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{kindLabel(kind)}</span>
                  <span>{monthEvents.filter((event) => event.kind === kind).length}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ event, compact = false }: { event: TimetableEvent; compact?: boolean }) {
  return (
    <div className={cx("rounded-md border px-2 py-2 text-[11px] leading-4", eventTone(event.kind), compact && "py-1.5")}>
      <div className="font-semibold">{formatTime(event.startsAt)}</div>
      <div className="mt-1 font-medium">{event.title}</div>
      {!compact && event.location && <div className="mt-1 opacity-75">{event.location}</div>}
    </div>
  );
}

function EventLegend() {
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-900">session</span>
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">deadline</span>
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-900">school</span>
    </div>
  );
}

function Hook({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-2">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function getRange(anchor: Date, mode: TimetableViewMode) {
  if (mode === "week") {
    const start = startOfWeek(anchor);
    const end = endOfDay(addDays(start, 6));
    return { start, end, label: `${formatShort(start)} - ${formatShort(end)}` };
  }
  if (mode === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    return { start, end, label: start.toLocaleString("en", { month: "long", year: "numeric" }) };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = endOfDay(new Date(anchor.getFullYear(), 11, 31));
  return { start, end, label: String(anchor.getFullYear()) };
}

function shiftDate(date: Date, mode: TimetableViewMode, amount: number) {
  const next = new Date(date);
  if (mode === "week") next.setDate(next.getDate() + amount * 7);
  if (mode === "month") next.setMonth(next.getMonth() + amount);
  if (mode === "year") next.setFullYear(next.getFullYear() + amount);
  return next;
}

function monthDays(anchor: Date) {
  const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function eventsForDay(events: TimetableEvent[], day: Date) {
  return events.filter((event) => isSameDay(new Date(event.startsAt), day));
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

function formatShort(date: Date) {
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

function viewModeLabel(mode: TimetableViewMode) {
  if (mode === "week") return "Week Range";
  if (mode === "month") return "Month Range";
  return "Year Range";
}

function kindLabel(kind: TimetableEvent["kind"]) {
  if (kind === "course_session") return "sessions";
  if (kind === "deadline") return "deadlines";
  return "school";
}

function eventTone(kind: TimetableEvent["kind"]) {
  if (kind === "deadline") return "border-amber-100 bg-amber-50 text-amber-950";
  if (kind === "school_event") return "border-emerald-100 bg-emerald-50 text-emerald-950";
  return "border-blue-100 bg-blue-50 text-blue-950";
}
