import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";

export interface DropdownOption {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export function DropdownSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  disabled,
  ariaLabel,
  className,
  buttonClassName,
  menuClassName,
  menuMinWidth = 220,
  renderValue,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  menuMinWidth?: number;
  renderValue?: (option: DropdownOption | undefined) => ReactNode;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, menuMinWidth);
    const width = Math.min(Math.max(menuWidth, rect.width), window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 12 - width));
    const estimatedHeight = Math.min(288, Math.max(44, options.length * 44 + 8));
    const menuHeight = menuRef.current?.getBoundingClientRect().height || estimatedHeight;
    const belowTop = rect.bottom + 6;
    const belowSpace = window.innerHeight - 12 - belowTop;
    const aboveSpace = rect.top - 18;
    const placeAbove = belowSpace < menuHeight && aboveSpace > belowSpace;
    const top = placeAbove
      ? Math.max(12, rect.top - 6 - menuHeight)
      : Math.min(belowTop, window.innerHeight - 12 - Math.min(menuHeight, window.innerHeight - 24));
    setPosition((current) => {
      if (current && Math.abs(current.top - top) < 0.5 && Math.abs(current.left - left) < 0.5 && Math.abs(current.width - width) < 0.5) {
        return current;
      }
      return { top, left, width };
    });
  }, [menuMinWidth, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
    setHighlightedIndex(nextIndex);
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, options, selectedIndex, updatePosition]);

  useLayoutEffect(() => {
    if (!open || !position) return;
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, position, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleResizeOrScroll() {
      updatePosition();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") {
        if (highlightedIndex >= 0) {
          const option = options[highlightedIndex];
          if (option && !option.disabled) {
            onChange(option.value);
            setOpen(false);
            buttonRef.current?.focus();
          }
        }
        return;
      }
      if (event.key === "Home") {
        const next = firstEnabledIndex(options);
        if (next >= 0) setHighlightedIndex(next);
        return;
      }
      if (event.key === "End") {
        const next = lastEnabledIndex(options);
        if (next >= 0) setHighlightedIndex(next);
        return;
      }
      if (event.key === "ArrowDown") {
        const next = nextEnabledIndex(options, highlightedIndex, 1);
        if (next >= 0) setHighlightedIndex(next);
        return;
      }
      if (event.key === "ArrowUp") {
        const next = nextEnabledIndex(options, highlightedIndex, -1);
        if (next >= 0) setHighlightedIndex(next);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [highlightedIndex, onChange, open, options, updatePosition]);

  function toggleOpen() {
    if (disabled) return;
    setOpen((current) => !current);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className={cx("relative", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cx(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-card px-2 text-left text-xs text-foreground outline-none transition",
          "focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-45",
          buttonClassName,
        )}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
            const next = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
            setHighlightedIndex(next);
          }
        }}
      >
        <span className={cx("min-w-0 flex flex-1 items-center truncate", !selectedOption && "text-muted-foreground")}>
          {renderValue ? renderValue(selectedOption) : selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={cx("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && position && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={`${id}-menu`}
            role="listbox"
            aria-labelledby={id}
            className={cx(
              "fixed z-[70] max-h-72 overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80",
              menuClassName,
            )}
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            <div className="max-h-72 overflow-y-auto p-1 brevyn-scrollbar">
              {options.length === 0 ? (
                <div className="rounded-md px-3 py-2 text-[11px] text-muted-foreground">No options</div>
              ) : (
                options.map((option, index) => {
                  const selected = option.value === value;
                  const highlighted = index === highlightedIndex;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      className={cx(
                        "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition",
                        selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        highlighted && "ring-1 ring-foreground/10",
                        option.disabled && "cursor-not-allowed opacity-45",
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => choose(index)}
                    >
                      <span className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm", selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                        {selected ? <Check className="h-3 w-3" /> : option.icon || <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.detail && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.detail}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function firstEnabledIndex(options: DropdownOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabledIndex(options: DropdownOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function nextEnabledIndex(options: DropdownOption[], currentIndex: number, step: 1 | -1): number {
  if (options.length === 0) return -1;
  const start = currentIndex >= 0 ? currentIndex : step > 0 ? -1 : options.length;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + step * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return currentIndex;
}
