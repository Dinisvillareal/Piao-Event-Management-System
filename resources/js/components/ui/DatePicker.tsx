import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Dark navy styling for the Add/Edit Resident forms -- applies to both
      the trigger and the calendar dropdown panel. */
  dark?: boolean;
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
  dark = false,
  disabled = false,
  required = false,
  align = "left",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Portaled to document.body and positioned with `position: fixed` from
  // the trigger's own getBoundingClientRect (same fix as FilterDropdown),
  // instead of a plain `absolute` panel living inside the trigger's own DOM
  // subtree. A plain absolute panel gets silently clipped by any
  // scrollable/overflow-y-auto ancestor -- exactly what a tall Add/Edit
  // form modal is -- so a date field near the bottom of one of those forms
  // used to show a calendar that was cut off instead of opening on top of
  // everything, the same way a native date input's own popup always does.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(window.innerWidth * 0.92, 300);
      const panelHeightEstimate = 360;

      let left = align === "right" ? rect.right - panelWidth : rect.left;
      // Keep the panel's right edge on-screen...
      if (left + panelWidth + margin > window.innerWidth) {
        left = window.innerWidth - margin - panelWidth;
      }
      // ...and its left edge too, without pushing it back off the right.
      if (left < margin) left = margin;

      const openUp = rect.bottom + panelHeightEstimate > window.innerHeight && rect.top > panelHeightEstimate;
      const top = openUp ? rect.top - panelHeightEstimate - 6 : rect.bottom + 6;

      setPanelPos({ top, left });
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
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
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
        className={`w-full inline-flex items-center gap-2 rounded-full border text-left disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none transition ${
          dark
            ? `text-base border-white/25 bg-white/10 focus:ring-2 focus:ring-[#4FBEB0]/40 ${open ? "ring-2 ring-[#4FBEB0]/40 border-[#4FBEB0]/70" : ""}`
            : `text-sm border-gray-200 bg-white focus:ring-2 focus:ring-[#005f63]/30 ${open ? "ring-2 ring-[#005f63]/30 border-[#005f63]/40" : ""}`
        } ${className}`}
      >
        <CalendarIcon className={`shrink-0 ${dark ? "h-5 w-5 text-[#4FBEB0]" : "h-4 w-4 text-[#005f63]/70"}`} />
        <span className={`flex-1 truncate ${value ? (dark ? "text-white" : "text-gray-800") : (dark ? "text-white/50" : "text-gray-400")}`}>
          {formatDisplay(value) ?? placeholder}
        </span>
        {required && !value && <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" aria-hidden />}
      </button>

      {open && panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
            className={`z-[9999] w-[min(92vw,300px)] rounded-[24px] border shadow-xl p-4 ${
              dark ? "border-white/10 bg-[#0A0E1A] shadow-2xl" : "border-[#ddd5ca] bg-white"
            }`}
          >
            <Calendar
              value={value}
              min={min}
              max={max}
              dark={dark}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
            <div className={`flex items-center justify-between mt-3 pt-3 border-t ${dark ? "border-white/10" : "border-gray-100"}`}>
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
              <button
                type="button"
                onClick={() => {
                  const t = todayISO();
                  if ((min && t < min) || (max && t > max)) return;
                  onChange(t);
                  setOpen(false);
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  dark ? "bg-[#4FBEB0] hover:bg-[#7DD8CB] text-[#08130F]" : "bg-[#005f63] hover:bg-[#004a4d] text-white"
                }`}
              >
                {todayLabel}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
