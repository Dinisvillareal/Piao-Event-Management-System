import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";

interface TimePickerProps {
  /** 24-hour "HH:MM" string, or "" for none selected -- same shape a
      native <input type="time"> used. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel?: string;
  /** Extra classes applied to the trigger button -- pass sizing/height to match whatever it's replacing. */
  className?: string;
  /** Dark navy styling, matching DatePicker/Calendar -- applies to both
      the trigger and the dropdown panel. */
  dark?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Shows the trigger's border in red, matching the app's other field-level validation errors. */
  error?: boolean;
  title?: string;
  align?: "left" | "right";
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function parse(v: string): { h12: number; m: number; period: "AM" | "PM" } | null {
  if (!v) return null;
  const [hStr, mStr] = v.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { h12, m, period };
}

function to24(h12: number, m: number, period: "AM" | "PM"): string {
  let h = h12 % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDisplay(v: string): string | null {
  const parsed = parse(v);
  if (!parsed) return null;
  return `${String(parsed.h12).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")} ${parsed.period.toLowerCase()}`;
}

/**
 * Dropdown-triggered time picker, backed by our own hour/minute/AM-PM
 * columns instead of the browser's native <input type="time"> -- that
 * native picker is rendered outside the DOM as OS chrome and, unlike a
 * native <select>'s <option> list, can't be recolored with CSS at all, so
 * it always shows up as a plain white popup no matter how dark the rest
 * of the page is. Drop-in replacement: give it `value`/`onChange` as a
 * 24-hour "HH:MM" string, same shape a native time input used.
 */
export default function TimePicker({
  value,
  onChange,
  placeholder = "--:-- --",
  clearLabel = "Clear",
  className = "",
  dark = false,
  disabled = false,
  required = false,
  error = false,
  title,
  align = "left",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const periodListRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; openUp: boolean }>({ left: 0, openUp: false });

  const parsed = parse(value);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(window.innerWidth * 0.92, 260);
      const panelHeightEstimate = 260;

      let left = align === "right" ? rect.width - panelWidth : 0;
      if (rect.left + left + panelWidth + margin > window.innerWidth) {
        left = window.innerWidth - margin - panelWidth - rect.left;
      }
      if (rect.left + left < margin) {
        left = margin - rect.left;
      }

      const openUp = rect.bottom + panelHeightEstimate > window.innerHeight && rect.top > panelHeightEstimate;

      setPanelPos({ left, openUp });
    };

    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  // Scroll each column's current value into view when the panel opens,
  // instead of always starting at the top of a 60-row minute list.
  useEffect(() => {
    if (!open) return;
    const scrollIntoView = (el: HTMLDivElement | null) => {
      if (!el) return;
      const selected = el.querySelector('[data-selected="true"]') as HTMLElement | null;
      selected?.scrollIntoView({ block: "center" });
    };
    // Run after the panel has painted so scrollHeight is accurate.
    const id = requestAnimationFrame(() => {
      scrollIntoView(hourListRef.current);
      scrollIntoView(minuteListRef.current);
      scrollIntoView(periodListRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const setPart = (part: Partial<{ h12: number; m: number; period: "AM" | "PM" }>) => {
    const base = parsed ?? { h12: 12, m: 0, period: "AM" as const };
    const next = { ...base, ...part };
    onChange(to24(next.h12, next.m, next.period));
  };

  const columnButtonClasses = (active: boolean) =>
    [
      "w-full h-9 shrink-0 rounded-full text-sm font-medium transition",
      active
        ? dark
          ? "!bg-[#4FBEB0] !text-[#08130F] font-bold shadow-sm"
          : "!bg-[#005f63] !text-white font-bold shadow-sm"
        : dark
          ? "text-white hover:bg-white/10 cursor-pointer"
          : "text-gray-700 hover:bg-teal-50 cursor-pointer",
    ].join(" ");

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full inline-flex items-center gap-2 rounded-full border text-left disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none transition ${
          dark
            ? `text-base bg-white/10 focus:ring-2 focus:ring-[#4FBEB0]/40 ${error ? "border-red-500" : "border-white/25"} ${open ? "ring-2 ring-[#4FBEB0]/40 border-[#4FBEB0]/70" : ""}`
            : `text-sm bg-white focus:ring-2 focus:ring-[#005f63]/30 ${error ? "border-red-400" : "border-gray-200"} ${open ? "ring-2 ring-[#005f63]/30 border-[#005f63]/40" : ""}`
        } ${className}`}
      >
        <span className={`flex-1 truncate ${value ? (dark ? "text-white" : "text-gray-800") : (dark ? "text-white/50" : "text-gray-400")}`}>
          {formatDisplay(value) ?? placeholder}
        </span>
        {required && !value && <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" aria-hidden />}
        <Clock className={`shrink-0 ${dark ? "h-5 w-5 text-white/40" : "h-4 w-4 text-gray-400"}`} />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[min(92vw,260px)] rounded-[24px] border shadow-xl p-4 ${
            dark ? "border-white/10 bg-[#0A0E1A] shadow-2xl" : "border-[#ddd5ca] bg-white"
          } ${panelPos.openUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
          style={{ left: panelPos.left }}
        >
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className={`text-center text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${dark ? "text-white/40" : "text-gray-400"}`}>Hour</p>
              <div ref={hourListRef} className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
                {HOURS_12.map((h) => {
                  const active = !!parsed && parsed.h12 === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-selected={active}
                      onClick={() => setPart({ h12: h })}
                      className={columnButtonClasses(active)}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className={`text-center text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${dark ? "text-white/40" : "text-gray-400"}`}>Min</p>
              <div ref={minuteListRef} className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
                {MINUTES.map((m) => {
                  const active = !!parsed && parsed.m === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-selected={active}
                      onClick={() => setPart({ m })}
                      className={columnButtonClasses(active)}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className={`text-center text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${dark ? "text-white/40" : "text-gray-400"}`}>&nbsp;</p>
              <div ref={periodListRef} className="space-y-0.5 pr-0.5">
                {(["AM", "PM"] as const).map((p) => {
                  const active = !!parsed && parsed.period === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      data-selected={active}
                      onClick={() => setPart({ period: p })}
                      className={columnButtonClasses(active)}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`flex items-center justify-end mt-3 pt-3 border-t ${dark ? "border-white/10" : "border-gray-100"}`}>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`inline-flex items-center gap-1 text-xs font-medium transition ${dark ? "text-white/50 hover:text-red-400" : "text-gray-500 hover:text-red-500"}`}
            >
              <X className="h-3.5 w-3.5" /> {clearLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
