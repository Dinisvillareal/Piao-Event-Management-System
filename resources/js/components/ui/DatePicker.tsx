import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import Calendar from "./Calendar";

interface DatePickerProps {
  /** ISO "yyyy-mm-dd" string, or "" for none selected. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  todayLabel?: string;
  clearLabel?: string;
  /** Extra classes applied to the trigger button -- pass sizing/height to match whatever it's replacing (h-14, h-full, etc). */
  className?: string;
  disabled?: boolean;
  /** Visually marks the field as required (a red dot) -- this is a fully custom widget so it can't hook into native HTML5 form validation; callers should still check the value before submit. */
  required?: boolean;
  align?: "left" | "right";
}

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function formatDisplay(v: string): string | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Dropdown-triggered single date picker, backed by our own Calendar grid
 * instead of the browser's native <input type="date"> -- see Calendar.tsx
 * for why. Drop-in replacement: give it `value`/`onChange` as an ISO
 * "yyyy-mm-dd" string, same shape a native date input used.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "dd/mm/yyyy",
  todayLabel = "Today",
  clearLabel = "Clear",
  className = "",
  disabled = false,
  required = false,
  align = "left",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Computed each time the panel opens (and kept in sync on resize/scroll)
  // instead of a fixed left-0/right-0 -- that fixed positioning is what let
  // the panel render cut off past the right edge when its trigger sat near
  // the edge of the screen. `left` is relative to the trigger's own left
  // edge; `openUp` flips the panel above the trigger when there isn't
  // enough room below it.
  const [panelPos, setPanelPos] = useState<{ left: number; openUp: boolean }>({ left: 0, openUp: false });

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(window.innerWidth * 0.92, 300);
      const panelHeightEstimate = 360;

      let left = align === "right" ? rect.width - panelWidth : 0;
      // Keep the panel's right edge on-screen...
      if (rect.left + left + panelWidth + margin > window.innerWidth) {
        left = window.innerWidth - margin - panelWidth - rect.left;
      }
      // ...and its left edge too, without pushing it back off the right.
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

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white text-sm text-left disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 transition ${open ? "ring-2 ring-[#005f63]/30 border-[#005f63]/40" : ""} ${className}`}
      >
        <CalendarIcon className="h-4 w-4 text-[#005f63]/70 shrink-0" />
        <span className={`flex-1 truncate ${value ? "text-gray-800" : "text-gray-400"}`}>
          {formatDisplay(value) ?? placeholder}
        </span>
        {required && !value && <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" aria-hidden />}
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[min(92vw,300px)] rounded-[24px] border border-[#ddd5ca] bg-white shadow-xl p-4 ${panelPos.openUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
          style={{ left: panelPos.left }}
        >
          <Calendar
            value={value}
            min={min}
            max={max}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-500 transition"
            >
              <X className="h-3.5 w-3.5" /> {clearLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                const t = todayISO();
                if ((min && t < min) || (max && t > max)) return;
                onChange(t);
                setOpen(false);
              }}
              className="rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-1.5 text-xs font-semibold transition"
            >
              {todayLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
