import { BookOpen, Compass, Gem, Landmark, Moon, Scale, Sparkles, WandSparkles, type LucideIcon } from "lucide-react";
import type { UserProfileSettings } from "@/types/domain";
import { cx } from "@/lib/cn";

export interface UserAvatarOption {
  id: string;
  label: string;
  icon: LucideIcon;
  className: string;
}

export const USER_AVATAR_OPTIONS: UserAvatarOption[] = [
  { id: "prism", label: "棱镜", icon: WandSparkles, className: "bg-emerald-100 text-emerald-800 ring-emerald-200/80" },
  { id: "spark", label: "火花", icon: Sparkles, className: "bg-amber-100 text-amber-800 ring-amber-200/80" },
  { id: "book", label: "书页", icon: BookOpen, className: "bg-stone-100 text-stone-800 ring-stone-200/80" },
  { id: "compass", label: "罗盘", icon: Compass, className: "bg-cyan-100 text-cyan-800 ring-cyan-200/80" },
  { id: "landmark", label: "学院", icon: Landmark, className: "bg-lime-100 text-lime-800 ring-lime-200/80" },
  { id: "moon", label: "月弧", icon: Moon, className: "bg-slate-100 text-slate-800 ring-slate-200/80" },
  { id: "gem", label: "晶石", icon: Gem, className: "bg-teal-100 text-teal-800 ring-teal-200/80" },
  { id: "scale", label: "天平", icon: Scale, className: "bg-zinc-100 text-zinc-800 ring-zinc-200/80" },
];

const DEFAULT_AVATAR = USER_AVATAR_OPTIONS[0];

export function profileDisplayName(profile?: UserProfileSettings | null): string {
  return profile?.displayName?.trim() || "Koi";
}

export function getUserAvatarOption(avatarId?: string): UserAvatarOption {
  return USER_AVATAR_OPTIONS.find((option) => option.id === avatarId) ?? DEFAULT_AVATAR;
}

export function UserAvatar({
  profile,
  avatarId,
  size = "md",
  className,
}: {
  profile?: UserProfileSettings | null;
  avatarId?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const option = getUserAvatarOption(avatarId || profile?.avatarId);
  const Icon = option.icon;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl ring-1 shadow-sm",
        option.className,
        size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14 rounded-2xl" : "h-9 w-9",
        className,
      )}
      title={option.label}
      aria-hidden="true"
    >
      <Icon className={cx(size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4")} />
    </span>
  );
}
