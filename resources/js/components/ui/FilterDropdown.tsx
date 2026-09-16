import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterDropdownOption[];
  /** Icon rendered at the trigger's left edge, e.g. <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />. */
  icon?: React.ReactNode;
  /** Trigger button classes -- pass sizing/height/padding to match the pill it replaces (h-14, h-full, pl-10 pr-8, etc). */
  className?: string;
  /** Which edge of the trigger the panel's own edge lines up with. */
  align?: "left" | "right";
  /** Panel width in px (a Tailwind width *class* can't be measured in JS for the viewport-clamping math below, so this takes a plain number instead). */
  panelWidthPx?: number;
  /** Extra classes on the outer wrapper. */
  wrapperClassName?: string;
  /** Dark navy styling for callers whose surrounding page has already moved
      to the dark palette (e.g. the Events list page). Every other caller
      keeps the original light trigger/panel look. */
  dark?: boolean;
}

/**
 * Plain (non-search) pill combobox for short filter lists -- "All Events",
 * "All Types", and the like. A native <select>'s open panel is rendered by
 * the OS/browser and can't be restyled, so this is a fully custom trigger +
 * option list instead: click to open, click an option to choose it, click
 * outside (or Escape) to dismiss. No search box -- these lists are short
 * enough that typing to filter isn't worth the extra control. For longer,
 * growing lists (inventory items, etc.) use SearchableSelect instead.
 *
 * The option panel is portaled to document.body and positioned with
 * `position: fixed` from the trigger's own getBoundingClientRect, instead
 * of living inside the trigger's own DOM subtree with `position: absolute`.
 * A plain absolute panel gets silently clipped (or worse, dragged to some
 * far-off spot in the layout) by any scrollable/overflow-x-auto ancestor --
 * several of this app's filter rows scroll horizontally on narrow screens,
 * which is exactly that case. Portaling sidesteps ancestor overflow/clipping
 * and stacking-context issues entirely, the same way a native <select>'s
 * own dropdown always renders on top of everything regardless of where the
 * <select> itself sits in the page.
 */
export default function FilterDropdown({
  value,
  onChange,
  options,
  icon,
  className = "",
  align = "left",
  panelWidthPx = 224,
  wrapperClassName = "",
  dark = false,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelHeightEstimate = Math.min(options.length * 40 + 16, 296);

      let left = align === "right" ? rect.right - panelWidthPx : rect.left;
      if (left + panelWidthPx + margin > window.innerWidth) {
        left = window.innerWidth - margin - panelWidthPx;
      }
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
  }, [open, align, panelWidthPx, options.length]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
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
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const selectedLabel = options.find((opt) => opt.value === value)?.label ?? options[0]?.label ?? "";

  return (
    <div ref={wrapperRef} className={`relative h-full ${wrapperClassName}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border text-sm focus:outline-none focus:ring-2 ${
          dark
            ? "border-white/10 bg-white/[0.03] focus:border-[#4FBEB0]/50 focus:ring-[#4FBEB0]/20"
            : "border-[#E6E0D3] bg-white focus:border-sage-400 focus:ring-sage-700/20"
        } ${className}`}
      >
        {/* Chevron lives inside the button's own flex row (not absolutely
            positioned over the label) so it always reserves its own space
            next to the text via `gap-2` -- a caller that forgets extra
            right-padding for a long label ("All Conditions") can no longer
            end up with the chevron drawn on top of the tail of the text. */}
        <span className={`truncate flex-1 ${dark ? "text-white" : "text-[#1A1A1A]"}`}>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${dark ? "text-white/40" : "text-[#6B7280]"} ${open ? "rotate-180" : ""}`}
        />
      </button>
      {icon}

      {open && panelPos &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelWidthPx }}
            className={`z-[9999] rounded-2xl border shadow-xl overflow-hidden py-1.5 ${
              dark ? "border-white/10 bg-[#0A0E1A] shadow-2xl" : "border-[#E6E0D3] bg-white"
            }`}
          >
            <div className="max-h-[280px] overflow-y-auto">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={value === opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm truncate transition ${
                    dark
                      ? value === opt.value
                        ? "bg-[#4FBEB0]/10 text-[#7DD8CB] font-semibold"
                        : "text-white hover:bg-white/10"
                      : value === opt.value
                        ? "bg-sage-50 text-sage-800 font-semibold"
                        : "text-[#1A1A1A] hover:bg-sage-50/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
