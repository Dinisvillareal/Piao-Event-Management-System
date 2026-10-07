import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { matchesSearch } from "../../lib/search";
import { useLanguage } from "../../i18n/LanguageContext";

export interface FilterDropdownOption {
  value: string;
  label: string;
  /** Shown but not selectable (dimmed, can't be clicked). */
  disabled?: boolean;
  /** Small muted note shown at the right of the option, e.g. "Taken". */
  hint?: string;
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
  /** Adds a type-to-filter search box pinned to the top of the option panel,
      for lists that grow (memberships, events) rather than the short, fixed
      lists (age group, condition, etc.) this component was originally built
      for. Off by default so every existing caller is unaffected. */
  searchable?: boolean;
  /** Placeholder for the search box above. Only used when searchable. */
  searchPlaceholder?: string;
  /** Shown in place of the option list when a search matches nothing. Only used when searchable. */
  noResultsLabel?: string;
  /** Make the option panel exactly as wide as the trigger (for full-width form fields). */
  fullWidth?: boolean;
  /** Shown (muted) when `value` matches no option, instead of falling back to the first option. */
  placeholder?: string;
  disabled?: boolean;
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
  searchable = false,
  searchPlaceholder,
  noResultsLabel,
  fullWidth = false,
  placeholder,
  disabled = false,
}: FilterDropdownProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // The search box (when enabled) filters what's rendered below it, but the
  // trigger's own selected-value label always comes from the full `options`
  // list further down -- searching never changes what's currently selected.
  const filteredOptions = searchable && query.trim()
    ? options.filter((opt) => matchesSearch(query, opt.label))
    : options;

  useEffect(() => {
    if (!open) {
      setQuery("");
    } else if (searchable) {
      // Autofocus so typing can start immediately, same as SearchableSelect.
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;

    const recompute = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const margin = 8;
      const panelHeightEstimate = Math.min(options.length * 40 + (searchable ? 64 : 16), 296);

      const width = fullWidth ? rect.width : panelWidthPx;
      let left = align === "right" ? rect.right - width : rect.left;
      if (left + width + margin > window.innerWidth) {
        left = window.innerWidth - margin - width;
      }
      if (left < margin) left = margin;

      const openUp = rect.bottom + panelHeightEstimate > window.innerHeight && rect.top > panelHeightEstimate;
      const top = openUp ? rect.top - panelHeightEstimate - 6 : rect.bottom + 6;

      setPanelPos({ top, left, width });
    };

    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open, align, panelWidthPx, options.length, searchable, fullWidth]);

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

  const selectedOpt = options.find((opt) => opt.value === value);
  const showingPlaceholder = !selectedOpt && placeholder !== undefined;
  const selectedLabel = selectedOpt?.label ?? (placeholder !== undefined ? placeholder : options[0]?.label ?? "");

  return (
    <div ref={wrapperRef} className={`relative h-full ${wrapperClassName}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`relative flex items-center gap-2 rounded-full border text-sm focus:outline-none focus:ring-2 ${
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
        <span className={`truncate flex-1 text-left ${showingPlaceholder ? (dark ? "text-white/50" : "text-gray-400") : (dark ? "text-white" : "text-[#1A1A1A]")}`}>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${dark ? "text-white/40" : "text-[#6B7280]"} ${open ? "rotate-180" : ""}`}
        />
        {/* The icon renders INSIDE the button (which now carries its own
            `relative`) instead of as a sibling positioned against the
            outer wrapper. The wrapper is `h-full` and can get stretched
            taller than the button by flex `align-items: stretch` when a
            taller sibling (e.g. a DatePicker) shares its row -- the button
            itself always keeps the fixed height its caller passed in via
            `className` (h-11, etc.), so anchoring the icon to the button
            guarantees it stays centered no matter what happens to the
            wrapper around it. */}
        {icon}
      </button>

      {open && panelPos &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelPos.width }}
            className={`z-[9999] rounded-2xl border shadow-xl overflow-hidden py-1.5 ${
              dark ? "border-white/10 bg-[#0A0E1A] shadow-2xl" : "border-[#E6E0D3] bg-white"
            }`}
          >
            {searchable && (
              <div className="px-2 pb-1.5">
                <div className="relative">
                  <Search className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${dark ? "text-white/40" : "text-gray-400"}`} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder ?? t("uiSearchPlaceholder")}
                    className={`w-full rounded-full border pl-8 pr-[4.25rem] py-1.5 text-sm focus:outline-none ${
                      dark
                        ? "border-white/10 bg-white/[0.06] text-white placeholder-white/30 focus:border-[#4FBEB0]/50"
                        : "border-[#E6E0D3] bg-sage-50/40 text-[#1A1A1A] placeholder-gray-400 focus:border-sage-400"
                    }`}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      title="Clear"
                      className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold shadow-sm transition ${dark ? "border border-white/10 bg-[#0A0E1A] text-white hover:bg-[#161C2E]" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      {t("clearLabel")}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className={`max-h-[280px] overflow-y-auto ${dark ? "filter-dropdown-scroll-dark" : "filter-dropdown-scroll-light"}`}>
              {searchable && filteredOptions.length === 0 ? (
                <p className={`px-4 py-2.5 text-sm italic ${dark ? "text-white/40" : "text-gray-400"}`}>{noResultsLabel ?? t("noMatchesFoundLabel")}</p>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={value === opt.value}
                    aria-disabled={opt.disabled || undefined}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm truncate transition ${
                      opt.disabled
                        ? dark
                          ? "cursor-not-allowed text-white/30"
                          : "cursor-not-allowed text-gray-400"
                        : dark
                        ? value === opt.value
                          ? "bg-[#4FBEB0]/10 text-[#7DD8CB] font-semibold"
                          : "text-white hover:bg-white/10"
                        : value === opt.value
                          ? "bg-sage-50 text-sage-800 font-semibold"
                          : "text-[#1A1A1A] hover:bg-sage-50/60"
                    }`}
                  >
                    {opt.hint ? (
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate">{opt.label}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${dark ? "bg-white/10 text-white/50" : "bg-gray-100 text-gray-500"}`}>{opt.hint}</span>
                      </span>
                    ) : (
                      opt.label
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Thin, rounded scrollbar for the option panel above -- without
          this it falls back to the browser's default scrollbar, which on
          a small rounded dark popover reads as a big, jarring white bar
          with square arrow buttons that clash with the rest of the app's
          styling. Global (not scoped) like the app's other `.smooth-scroll`
          style blocks, so it's safe if more than one FilterDropdown is
          open/mounted on the same page at once. */}
      <style>{`
        .filter-dropdown-scroll-dark::-webkit-scrollbar { width: 6px; }
        .filter-dropdown-scroll-dark::-webkit-scrollbar-track { background: transparent; }
        .filter-dropdown-scroll-dark::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        .filter-dropdown-scroll-dark::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        .filter-dropdown-scroll-dark { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }

        .filter-dropdown-scroll-light::-webkit-scrollbar { width: 6px; }
        .filter-dropdown-scroll-light::-webkit-scrollbar-track { background: transparent; }
        .filter-dropdown-scroll-light::-webkit-scrollbar-thumb { background: #d8d2c4; border-radius: 10px; }
        .filter-dropdown-scroll-light::-webkit-scrollbar-thumb:hover { background: #c7bfab; }
        .filter-dropdown-scroll-light { scrollbar-width: thin; scrollbar-color: #d8d2c4 transparent; }
      `}</style>
    </div>
  );
}
