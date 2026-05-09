import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";

export type ConfirmRequest = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  verificationText?: string;
  verificationLabel?: string;
  initialValue?: string;
};

export function useConfirmDialog() {
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: ConfirmRequest) => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(options);
    });
  }, []);

  useEffect(
    () => () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    },
    [],
  );

  return {
    confirm,
    confirmDialog: request ? <ConfirmDialog request={request} onResolve={settle} /> : null,
  };
}

function ConfirmDialog({ request, onResolve }: { request: ConfirmRequest; onResolve: (value: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(request.initialValue || "");
  const [error, setError] = useState("");
  const hasVerification = Boolean(request.verificationText?.trim());
  const verified = !hasVerification || value.trim() === request.verificationText?.trim();

  useEffect(() => {
    setValue(request.initialValue || "");
    setError("");
    const frame = window.requestAnimationFrame(() => {
      if (hasVerification) inputRef.current?.focus();
      else confirmButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasVerification, request]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onResolve]);

  function confirm() {
    if (hasVerification && !verified) {
      setError(`Type "${request.verificationText}" exactly to confirm.`);
      return;
    }
    onResolve(true);
  }

  const toneClass = request.tone === "danger" ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-card text-foreground";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-sm" onMouseDown={() => onResolve(false)}>
      <div
        className={cx("w-full max-w-md rounded-lg border shadow-2xl ring-1 ring-border/80", toneClass)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", request.tone === "danger" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{request.title}</div>
              {request.message && <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{request.message}</div>}
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => onResolve(false)}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {hasVerification && (
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              <span>{request.verificationLabel || `Type ${request.verificationText} to confirm`}</span>
              <input
                ref={inputRef}
                className="h-9 w-full rounded-md border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm();
                  }
                }}
              />
            </label>
          )}
          {error && <div className="rounded-md bg-red-100 px-3 py-2 text-[11px] leading-4 text-red-800">{error}</div>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => onResolve(false)}
            >
              {request.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              ref={confirmButtonRef}
              className={cx(
                "inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-background transition",
                request.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-foreground hover:opacity-90",
                !verified && "opacity-55",
              )}
              onClick={confirm}
            >
              {request.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
