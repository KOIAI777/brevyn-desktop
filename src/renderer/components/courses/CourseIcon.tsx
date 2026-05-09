import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  FileText,
  Gavel,
  Globe2,
  GraduationCap,
  Landmark,
  Library,
  Microscope,
  Presentation,
  Scale,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Course, CourseIconKey } from "@/types/domain";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const COURSE_ICON_OPTIONS: Array<{ key: CourseIconKey; label: string; Icon: IconComponent }> = [
  { key: "graduation-cap", label: "Academic", Icon: GraduationCap },
  { key: "book-open", label: "Reading", Icon: BookOpen },
  { key: "scale", label: "Law", Icon: Scale },
  { key: "landmark", label: "Institution", Icon: Landmark },
  { key: "briefcase", label: "Business", Icon: BriefcaseBusiness },
  { key: "file-text", label: "Writing", Icon: FileText },
  { key: "gavel", label: "Court", Icon: Gavel },
  { key: "library", label: "Library", Icon: Library },
  { key: "microscope", label: "Research", Icon: Microscope },
  { key: "calculator", label: "Quant", Icon: Calculator },
  { key: "globe", label: "Global", Icon: Globe2 },
  { key: "presentation", label: "Seminar", Icon: Presentation },
];

const iconMap = new Map<CourseIconKey, IconComponent>(COURSE_ICON_OPTIONS.map((option) => [option.key, option.Icon]));

export function CourseIcon({ course, className }: { course: Pick<Course, "icon">; className?: string }) {
  const Icon = course.icon ? iconMap.get(course.icon) || GraduationCap : GraduationCap;
  return <Icon className={className} />;
}
