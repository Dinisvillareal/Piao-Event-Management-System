import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarProps {
  /** Selected date as an ISO "yyyy-mm-dd" string, or "" for none selected. */
  value: string;
  onSelect: (iso: string) => void;
  /** Inclusive bounds, also as ISO "yyyy-mm-dd" strings. */
  min?: string;
  max?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s?: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A small, fully in-DOM month-grid calendar -- built to replace the
 * browser/OS's own native <input type="date"> popup, which we don't
 * control the styling, sizing, or positioning of (and which looks and
 * behaves differently across Chrome/Edge/Safari/mobile). This renders
 * like any other bit of our UI, so it always matches the app's look and
 * always fits inside its own popover on any screen size.
 *
 * Tapping the month/year header opens a "year view" -- a 12-month grid
 * with its own </> to step a whole YEAR at a time, so jumping from, say,
 * 2026 to a resident's 1958 birth year doesn't mean clicking "next month"
 * hundreds of times. Picking a month there drops back into the day grid
 * for that month. This one component is shared by every date field in
 * the app (DatePicker, DateRangePicker), so the fix applies everywhere
 * at once.
 */
export default function Calendar({ value, onSelect, min, max }: CalendarProps) {
  const selected = parseISO(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewDate, setViewDate] = useState<Date>(() => selected ?? today);
  const [viewMode, setViewMode] = useState<"day" | "year">("day");

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]);

  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
    nextDay++;
  }

  const isDisabled = (d: Date) => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  // A whole month is out of range only if EVERY day in it is -- e.g. a
  // min of the 15th still leaves that same month partly pickable.
  const isMonthDisabled = (y: number, m: number) => {
    const lastDay = new Date(y, m + 1, 0);
    const firstDay = new Date(y, m, 1);
    if (minDate && lastDay < minDate) return true;
    if (maxDate && firstDay > maxDate) return true;
    return false;
  };

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (viewMode === "year") {
    return (
      <div className="select-none">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setViewDate(new Date(year - 1, month, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-full text-[#005f63] hover:bg-teal-50 active:scale-95 transition"
            aria-label="Previous year"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-[#005f63]">{year}</span>
          <button
            type="button"
            onClick={() => setViewDate(new Date(year + 1, month, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-full text-[#005f63] hover:bg-teal-50 active:scale-95 transition"
            aria-label="Next year"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTH_ABBR.map((label, m) => {
            const isCurrentView = m === month;
            const disabled = isMonthDisabled(year, m);
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setViewDate(new Date(year, m, 1));
                  setViewMode("day");
                }}
                className={[
                  "h-10 rounded-full text-sm font-medium transition",
                  disabled ? "opacity-30 cursor-not-allowed text-gray-400" : "text-gray-700 hover:bg-teal-50 cursor-pointer",
                  isCurrentView && !disabled ? "!bg-[#005f63] !text-white font-bold shadow-sm" : "",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="h-8 w-8 flex items-center justify-center rounded-full text-[#005f63] hover:bg-teal-50 active:scale-95 transition"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("year")}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold text-[#005f63] hover:bg-teal-50 transition"
          title="Jump to a different year"
        >
          {monthLabel}
          <ChevronRight size={14} className="rotate-90 opacity-60" />
        </button>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="h-8 w-8 flex items-center justify-center rounded-full text-[#005f63] hover:bg-teal-50 active:scale-95 transition"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="h-7 flex items-center justify-center text-[11px] font-semibold text-gray-400">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map(({ date, inMonth }, idx) => {
          const disabled = isDisabled(date);
          const isSelected = selected ? isSameDay(date, selected) : false;
          const isToday = isSameDay(date, today);
          return (
            <div key={idx} className="flex items-center justify-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(toISO(date))}
                className={[
                  "h-8 w-8 flex items-center justify-center rounded-full text-xs font-medium transition",
                  !inMonth ? "text-gray-300" : "text-gray-700",
                  disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-teal-50 cursor-pointer",
                  isSelected ? "!bg-[#005f63] !text-white font-bold shadow-sm" : "",
                  isToday && !isSelected ? "ring-1 ring-inset ring-[#005f63]/50" : "",
                ].join(" ")}
              >
                {date.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
