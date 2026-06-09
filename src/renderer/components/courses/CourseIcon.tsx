import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  FileText,
  Gavel,
  Globe2,
  Landmark,
  Library,
  Microscope,
  NotebookTabs,
  Presentation,
  Scale,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Course, CourseIconKey } from "@/types/domain";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const COURSE_ICON_OPTIONS: Array<{ key: CourseIconKey; label: string; Icon: IconComponent }> = [
  { key: "graduation-cap", label: "课程", Icon: NotebookTabs },
  { key: "book-open", label: "阅读", Icon: BookOpen },
  { key: "scale", label: "法律", Icon: Scale },
  { key: "landmark", label: "学院", Icon: Landmark },
  { key: "briefcase", label: "商科", Icon: BriefcaseBusiness },
  { key: "file-text", label: "写作", Icon: FileText },
  { key: "gavel", label: "法庭", Icon: Gavel },
  { key: "library", label: "资料库", Icon: Library },
  { key: "microscope", label: "研究", Icon: Microscope },
  { key: "calculator", label: "量化", Icon: Calculator },
  { key: "globe", label: "全球", Icon: Globe2 },
  { key: "presentation", label: "研讨", Icon: Presentation },
];

const iconMap = new Map<CourseIconKey, IconComponent>(COURSE_ICON_OPTIONS.map((option) => [option.key, option.Icon]));

export function CourseIcon({ course, className }: { course: Pick<Course, "icon">; className?: string }) {
  const Icon = course.icon ? iconMap.get(course.icon) || NotebookTabs : NotebookTabs;
  return <Icon className={className} />;
}
