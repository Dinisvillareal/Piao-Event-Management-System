import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpDown, ChevronDown, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import FilterDropdown, { type FilterDropdownOption } from "./FilterDropdown";
import SearchBar from "./SearchBar";
import { useLanguage } from "../../i18n/LanguageContext";

export interface FilterDef {
  key: string;
  /** Short name shown on the chip, e.g. "Civil status". */
  label: string;
  value: string;
  /** The "no filter" value ("all" or ""). The chip only shows when value differs. */
  defaultValue?: string;
  onChange: (value: string) => void;
  options: FilterDropdownOption[];
  icon?: ReactNode;
  searchable?: boolean;
  /** Dropdown trigger width helper. */
  minWidthClass?: string;
}

export interface ExtraChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterBarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  filters?: FilterDef[];
  sort?: { value: string; onChange: (v: string) => void; options: FilterDropdownOption[] };
  /** "Showing x of y" -- total is the unfiltered size of the list. Leave total out for a plain "n results". */
  count?: { shown: number; total?: number };
  /** Chips for filters that aren't dropdowns (a picked date, a quick tab...). */
  extraChips?: ExtraChip[];
  /** Resets everything the bar doesn't own (dates, tabs). Called by "Clear all". */
  onClearExtras?: () => void;
  /** Quick tabs (All / Today ...). Shown above the bar on larger screens; on phones they live inside the filter panel. */
  tabs?: ReactNode;
  /** Label for the `children` row in the phone filter panel (default "Date"). */
  childrenLabel?: string;
  /** Set false when the page shows its tabs some other way on phones (e.g. a floating speed dial). */
  tabsOnPhone?: boolean;
  /** Extra content shown at the top of the phone filter panel only (e.g. a small summary). */
  panelExtra?: ReactNode;
  /** Controls placed at the end of the first row (a date picker, an Add button). */
  children?: ReactNode;
  className?: string;
}

// Strip a trailing " (12)" count off an option label so the chip reads cleanly.
const cleanLabel = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");

/**
 * The one filter toolbar every list page uses: search, filter dropdowns, an
 * optional sort, then a second row with the result count, a removable chip
 * for every active filter, and a single "Clear all filters" button. Pages own
 * their own state and pass it in; the bar only draws it and works out which
 * chips to show, so every page filters, sorts and clears the same way.
 */
export default function FilterBar({ search, filters = [], sort, count, extraChips = [], onClearExtras, tabs, tabsOnPhone = true, childrenLabel, panelExtra, children, className = "" }: FilterBarProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false); // phones: the dropdowns start collapsed behind one "Filters" button
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const active = filters
    .filter((f) => f.value !== (f.defaultValue ?? "all"))
    .map((f) => {
      const opt = f.options.find((o) => o.value === f.value);
      return { key: f.key, label: `${f.label}: ${cleanLabel(opt?.label ?? f.value)}`, onRemove: () => f.onChange(f.defaultValue ?? "all") };
    });
  const chips: ExtraChip[] = [...active, ...extraChips];
  const searching = !!search && search.value.trim() !== "";
  const anyActive = chips.length > 0 || searching;

  const clearAll = () => {
    filters.forEach((f) => { if (f.value !== (f.defaultValue ?? "all")) f.onChange(f.defaultValue ?? "all"); });
    if (search && search.value) search.onChange("");
    onClearExtras?.();
  };

  // Three or more dropdowns: search gets a full-width row of its own and the
  // dropdowns sit below in an even grid, so the search box is never squeezed.
  // One or two dropdowns fit beside the search box on a single row.
  const stacked = filters.length + (sort ? 1 : 0) > 2;
  const triggerCls = stacked ? "h-11 w-full pl-10 pr-8" : "h-11 w-full pl-10 pr-8 sm:w-auto sm:min-w-[11rem] sm:shrink-0";
  const iconCls = "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none";

  const searchBox = search && (
    <div className={stacked ? "min-w-[240px] flex-1 basis-full sm:basis-0" : "min-w-[220px] flex-1 basis-64"}>
      <SearchBar dark value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
    </div>
  );

  const hasDropdowns = filters.length + (sort ? 1 : 0) > 0;
  const toggle = hasDropdowns && (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="dash-tile flex h-11 w-full basis-full items-center justify-between gap-3 rounded-full px-4 text-sm font-semibold text-white sm:hidden"
    >
      <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[#2E8E82]" />{t("rpFiltersLabel")}</span>
      <span className="flex items-center gap-2">
        {active.length > 0 && <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#2E8E82] px-1.5 text-[11px] font-bold !text-white">{active.length}</span>}
        <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </span>
    </button>
  );

  const dropdowns = (
    <>
      {filters.map((f) => {
        // Long lists get a type-to-filter box on top, like memberships always had.
        const searchable = f.searchable ?? f.options.length > 7;
        return (
          <FilterDropdown
            key={f.key}
            value={f.value}
            onChange={f.onChange}
            options={f.options}
            className={`${triggerCls} ${f.minWidthClass ?? ""} max-sm:!min-w-0`}
            wrapperClassName={stacked ? "min-w-0" : "w-full sm:w-auto"}
            icon={f.icon ?? <Filter className={iconCls} />}
            searchable={searchable}
            searchPlaceholder={t("search")}
            noResultsLabel={t("noMatchesFoundLabel")}
            panelWidthPx={searchable ? 288 : undefined}
            dark
          />
        );
      })}
      {sort && (
        <FilterDropdown
          value={sort.value}
          onChange={sort.onChange}
          options={sort.options}
          className={triggerCls}
          wrapperClassName={stacked ? "" : "w-full sm:w-auto"}
          icon={<ArrowUpDown className={iconCls} />}
          align="right"
          dark
        />
      )}
    </>
  );

  // Phones (Gmail-style): one search pill with a "tune" button on its right. The button opens a
  // small panel with one labelled row per filter (label on the left, choice on the right).
  // No search box (e.g. Reports): just the labelled rows, always visible -- no button, no extra card.
  if (isPhone && !search && hasDropdowns) {
    const rowLabelP = "w-[5.5rem] shrink-0 text-[13px] font-semibold text-white/60";
    return (
      <div className={`space-y-3 ${className}`}>
        {filters.map((f) => {
          const searchable = f.searchable ?? f.options.length > 7;
          return (
            <div key={f.key} className="flex items-center gap-3">
              <span className={rowLabelP}>{f.label}</span>
              <div className="min-w-0 flex-1">
                <FilterDropdown
                  value={f.value}
                  onChange={f.onChange}
                  options={f.options}
                  className="h-11 w-full pl-10 pr-8 !text-[14px]"
                  wrapperClassName="min-w-0"
                  icon={f.icon ?? <Filter className={iconCls} />}
                  searchable={searchable}
                  searchPlaceholder={t("search")}
                  noResultsLabel={t("noMatchesFoundLabel")}
                  fullWidth
                  dark
                />
              </div>
            </div>
          );
        })}
        {anyActive && (
          <button type="button" onClick={clearAll} className="px-1 text-[13px] font-bold text-white/60 transition hover:text-white">
            {t("fltClearAll")}
          </button>
        )}
      </div>
    );
  }

  if (isPhone && search && (hasDropdowns || !!children)) {
    const rowLabel = "w-[5.5rem] shrink-0 text-[13px] font-semibold text-white/60";
    return (
      <div data-phone-filterbar className={`space-y-3 ${className}`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="phone-search h-12 w-full rounded-full pl-12 pr-24 text-[15px] text-white placeholder:text-white/45 focus:outline-none"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {search.value && (
              <button type="button" onClick={() => search.onChange("")} aria-label={t("clearSearchAria")} className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition active:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={t("rpFiltersLabel")}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${open ? "bg-[#2E8E82] !text-white" : "text-white/70 active:bg-white/10"}`}
            >
              <SlidersHorizontal className="h-5 w-5" />
              {chips.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#F5C451] px-1 text-[10px] font-bold !text-[#0B0F14]">{chips.length}</span>
              )}
            </button>
          </div>
        </div>

        {open && (
          <div className="dash-card space-y-3 rounded-2xl p-4">
            {panelExtra && <div className="border-b border-white/10 pb-4">{panelExtra}</div>}
            {tabs && tabsOnPhone && <div className="border-b border-white/10 pb-4">{tabs}</div>}
            {filters.map((f) => {
              const searchable = f.searchable ?? f.options.length > 7;
              return (
                <div key={f.key} className="flex items-center gap-3">
                  <span className={rowLabel}>{f.label}</span>
                  <div className="min-w-0 flex-1">
                    <FilterDropdown
                      value={f.value}
                      onChange={f.onChange}
                      options={f.options}
                      className="h-11 w-full pl-10 pr-8 !text-[14px]"
                      wrapperClassName="min-w-0"
                      icon={f.icon ?? <Filter className={iconCls} />}
                      searchable={searchable}
                      searchPlaceholder={t("search")}
                      noResultsLabel={t("noMatchesFoundLabel")}
                      fullWidth
                      dark
                    />
                  </div>
                </div>
              );
            })}
            {sort && (
              <div className="flex items-center gap-3">
                <span className={rowLabel}>{t("fltSortBy")}</span>
                <div className="min-w-0 flex-1">
                  <FilterDropdown
                    value={sort.value}
                    onChange={sort.onChange}
                    options={sort.options}
                    className="h-11 w-full pl-10 pr-8 !text-[14px]"
                    wrapperClassName="min-w-0"
                    icon={<ArrowUpDown className={iconCls} />}
                    fullWidth
                    dark
                  />
                </div>
              </div>
            )}
            {children && (
              <div className="flex items-center gap-3">
                <span className={rowLabel}>{childrenLabel ?? t("fltDateChip")}</span>
                <div className="min-w-0 flex-1 [&>*]:w-full">{children}</div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={clearAll}
                disabled={!anyActive}
                className="px-2 text-[13px] font-bold text-white/60 transition disabled:opacity-40"
              >
                {t("fltClearAll")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-full bg-[#2E8E82] px-6 text-sm font-bold !text-white shadow-sm transition active:scale-95"
              >
                {t("doneLabel")}
              </button>
            </div>
          </div>
        )}

        {(count || chips.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
            {count && (
              <p className={`text-[13px] ${anyActive ? "font-semibold text-[#7DD8CB]" : "text-white/45"}`}>
                {count.total === undefined
                  ? t("fltResults").replace("{n}", String(count.shown))
                  : t("fltShowing").replace("{shown}", String(count.shown)).replace("{total}", String(count.total))}
              </p>
            )}
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-[#7DD8CB]">
                {c.label}
                <button type="button" onClick={c.onRemove} aria-label={`${t("fltRemove")}: ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-white/15 hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-phone-filterbar={search && !hasDropdowns ? "" : undefined} className={`space-y-3 ${className}`}>
      {tabs}
      {stacked ? (
        <>
          {(searchBox || children) && (
            <div className="flex flex-wrap items-center gap-3">
              {searchBox}
              {children}
            </div>
          )}
          {toggle}
          <div className={`${open ? "grid grid-cols-2" : "hidden"} gap-3 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]`}>{dropdowns}</div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {searchBox}
          {toggle}
          <div className={`${open ? "grid grid-cols-2" : "hidden"} basis-full gap-3 sm:contents`}>{dropdowns}</div>
          {children}
        </div>
      )}

      {(count || chips.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
          {count && (
            <p className={`text-[13px] ${anyActive ? "font-semibold text-[#7DD8CB]" : "text-white/45"}`}>
              {count.total === undefined
                ? t("fltResults").replace("{n}", String(count.shown))
                : t("fltShowing").replace("{shown}", String(count.shown)).replace("{total}", String(count.total))}
            </p>
          )}
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-[#7DD8CB]">
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`${t("fltRemove")}: ${c.label}`}
                className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-white/15 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {anyActive && (
            <button type="button" onClick={clearAll} className="text-xs font-bold text-white/60 underline-offset-2 transition hover:text-white hover:underline">
              {t("fltClearAll")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
