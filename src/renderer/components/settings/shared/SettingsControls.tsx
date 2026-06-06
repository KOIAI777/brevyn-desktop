import { Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  icon,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && passwordVisible ? "text" : type;

  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center gap-1 rounded-md border bg-card px-2">
        {icon}
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/55 disabled:cursor-not-allowed disabled:text-muted-foreground"
          type={inputType}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={disabled}
            aria-label={passwordVisible ? `隐藏${label}` : `显示${label}`}
            title={passwordVisible ? `隐藏${label}` : `显示${label}`}
          >
            {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </label>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center rounded-md border bg-muted/35 px-2 text-xs text-foreground">{value}</div>
    </label>
  );
}

export function CloudAuthStep({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/65 px-2.5 py-2 text-[11px] text-muted-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="font-medium text-foreground/80">{label}</span>
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium text-foreground" title={value}>{value}</div>
    </div>
  );
}

export function ProviderLogo({ src }: { src: string }) {
  return <img src={src} alt="" className="h-4 w-4 shrink-0 rounded-[0.28rem] object-contain" />;
}

export function TogglePill({
  enabled,
  onClick,
  labelOn = "已启用",
  labelOff = "已停用",
  disabled,
}: {
  enabled: boolean;
  onClick: () => void;
  labelOn?: string;
  labelOff?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-45", enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
      {enabled ? labelOn : labelOff}
    </button>
  );
}

export function ActionButton({
  icon,
  label,
  onClick,
  primary,
  disabled,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45",
        primary ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function IconActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-45",
        danger ? "hover:border-red-200 hover:bg-red-50 hover:text-red-700" : "hover:bg-accent hover:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
