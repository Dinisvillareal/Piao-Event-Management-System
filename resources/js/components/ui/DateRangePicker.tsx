import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import MiniCalendar from "./Calendar";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  fromLabel: string;
  toLabel: string;
  allDatesLabel: string;
  todayLabel: string;
  thisWeekLabel: string;
  thisMonthLabel: string;
  thisYearLabel: string;
  clearLabel: string;
  applyLabel: string;
  /** Dark navy styling to match the redesigned pages -- mirrors the `dark`
      prop on DatePicker/Calendar. Default false keeps every other caller
      on the original light look. */
  dark?: boolean;
}

const toISODate = (d: Date) => d.toISOString().split("T")[0];

/**
 * Self-contained date-range dropdown, built to replace native
 * <input type="date"> pairs. A native date input's popup calendar is
 * rendered by the browser/OS itself -- it ignores our z-index and can
 * visually clip or overlap page content depending on the browser. This
 * component is a normal bit of our own DOM instead, so it always
 * positions and layers correctly above the page it's opened from.
 */
export default function DateRangePicker({
  from,
  to,
  onChange,
  fromLabel,
  toLabel,
  allDatesLabel,
  todayLabel,
  thisWeekLabel,
  thisMonthLabel,
  thisYearLabel,
  clearLabel,
  applyLabel,
  dark = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [pickerTarget, setPickerTarget] = useState<"from" | "to">("from");
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Same fix as DatePicker.tsx: measure the trigger's actual position each
  // time the panel opens instead of always anchoring left-0, so it can't
  // render cut off past the right edge of the viewport.
  const [panelPos, setPanelPos] = useState<{ left: number; openUp: boolean }>({ left: 0, openUp: false });

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  useEffect(() => {
    if (open) setPickerTarget("from");
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(window.innerWidth * 0.92, 340);
      const panelHeightEstimate = 420;

      let left = 0;
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
  }, [open]);

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

  const applyQuickRange = (f: Date, t: Date) => {
    setDraftFrom(toISODate(f));
    setDraftTo(toISODate(t));
  };

  const quickRanges = [
    {
      label: todayLabel,
      apply: () => {
        const now = new Date();
        applyQuickRange(now, now);
      },
    },
    {
      label: thisWeekLabel,
      apply: () => {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const start = new Date(now);
        start.setDate(now.getDate() - diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        applyQuickRange(start, end);
      },
    },
    {
      label: thisMonthLabel,
      apply: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        applyQuickRange(start, end);
      },
    },
    {
      label: thisYearLabel,
      apply: () => {
        const now = new Date();
        applyQuickRange(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31));
      },
    },
  ];

  const formatDisplay = (value: string) => {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const displayLabel = from || to
    ? `${formatDisplay(from) ?? "…"} – ${formatDisplay(to) ?? "…"}`
    : allDatesLabel;

  const handleApply = () => {
    onChange(draftFrom, draftTo);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftFrom("");
    setDraftTo("");
    onChange("", "");
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-11 inline-flex items-center gap-2 pl-4 pr-3 rounded-full border text-sm transition ${
          dark
            ? "border-white/25 bg-white/10 text-white/80 hover:border-[#4FBEB0]/50"
            : "border-[#005f63]/20 bg-white text-gray-700 shadow-sm hover:border-[#005f63]/40"
        }`}
      >
        <Calendar className={`h-4 w-4 ${dark ? "text-[#4FBEB0]" : "text-[#005f63]/70"}`} />
        <span className={from || to ? (dark ? "font-medium text-white" : "font-medium text-gray-800") : (dark ? "text-white/50" : "text-gray-500")}>{displayLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""} ${dark ? "text-white/40" : "text-gray-400"}`} />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[min(92vw,340px)] rounded-[24px] border shadow-xl p-4 ${
            dark ? "border-white/10 bg-[#0A0E1A] shadow-2xl" : "border-[#ddd5ca] bg-white"
          } ${panelPos.openUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
          style={{ left: panelPos.left }}
        >
          <div className="grid grid-cols-2 gap-2 mb-3">
            {quickRanges.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={r.apply}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  dark
                    ? "border-white/15 text-white/60 hover:bg-white/10 hover:border-[#4FBEB0]/40 hover:text-[#7DD8CB]"
                    : "border-gray-200 text-gray-600 hover:bg-teal-50 hover:border-[#005f63]/30 hover:text-[#005f63]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className={`space-y-3 border-t pt-3 ${dark ? "border-white/10" : "border-gray-100"}`}>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${dark ? "text-white/50" : "text-gray-500"}`}>{fromLabel}</label>
                <div className={`rounded-2xl border px-2 py-1.5 text-sm truncate ${dark ? "border-white/15 text-white/80" : "border-gray-200 text-gray-700"}`}>
                  {draftFrom || "…"}
                </div>
              </div>
              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${dark ? "text-white/50" : "text-gray-500"}`}>{toLabel}</label>
                <div className={`rounded-2xl border px-2 py-1.5 text-sm truncate ${dark ? "border-white/15 text-white/80" : "border-gray-200 text-gray-700"}`}>
                  {draftTo || "…"}
                </div>
              </div>
            </div>
            <div className={`flex rounded-full p-1 text-xs font-semibold ${dark ? "bg-white/5 text-white/50" : "bg-gray-50 text-gray-500"}`}>
              <button
                type="button"
                onClick={() => setPickerTarget("from")}
                className={`flex-1 rounded-full py-1.5 transition ${
                  pickerTarget === "from"
                    ? (dark ? "bg-[#4FBEB0] text-[#08130F] shadow-sm" : "bg-white text-[#005f63] shadow-sm")
                    : (dark ? "hover:text-white/80" : "hover:text-gray-700")
                }`}
              >
                {fromLabel}
              </button>
              <button
                type="button"
                onClick={() => setPickerTarget("to")}
                className={`flex-1 rounded-full py-1.5 transition ${
                  pickerTarget === "to"
                    ? (dark ? "bg-[#4FBEB0] text-[#08130F] shadow-sm" : "bg-white text-[#005f63] shadow-sm")
                    : (dark ? "hover:text-white/80" : "hover:text-gray-700")
                }`}
              >
                {toLabel}
              </button>
            </div>
            {pickerTarget === "from" ? (
              <MiniCalendar
                value={draftFrom}
                onSelect={(iso) => { setDraftFrom(iso); setPickerTarget("to"); }}
                max={draftTo || undefined}
                dark={dark}
              />
            ) : (
              <MiniCalendar value={draftTo} onSelect={setDraftTo} min={draftFrom || undefined} dark={dark} />
            )}
          </div>

          <div className={`flex items-center justify-between mt-4 pt-3 border-t ${dark ? "border-white/10" : "border-gray-100"}`}>
            <button
              type="button"
              onClick={handleClear}
              className={`inline-flex items-center gap-1 text-xs font-medium transition ${dark ? "text-white/50 hover:text-red-400" : "text-gray-500 hover:text-red-500"}`}
            >
              <X className="h-3.5 w-3.5" /> {clearLabel}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                dark ? "bg-[#4FBEB0] hover:bg-[#7DD8CB] text-[#08130F]" : "bg-[#005f63] hover:bg-[#004a4d] text-white"
              }`}
            >
              {applyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
