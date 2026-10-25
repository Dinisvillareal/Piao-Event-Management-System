import type { ReactNode } from "react";
import { ArrowUpDown, Filter, X } from "lucide-react";
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
export default function FilterBar({ search, filters = [], sort, count, extraChips = [], onClearExtras, children, className = "" }: FilterBarProps) {
  const { t } = useLanguage();

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
  const triggerCls = stacked ? "h-11 w-full pl-10 pr-8" : "h-11 min-w-[11rem] pl-10 pr-8 shrink-0";
  const iconCls = "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none";

  const searchBox = search && (
    <div className={stacked ? "min-w-[240px] flex-1 basis-full sm:basis-0" : "min-w-[220px] flex-1 basis-64"}>
      <SearchBar dark value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
    </div>
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
            className={`${triggerCls} ${f.minWidthClass ?? ""}`}
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
          icon={<ArrowUpDown className={iconCls} />}
          align="right"
          dark
        />
      )}
    </>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {stacked ? (
        <>
          {(searchBox || children) && (
            <div className="flex flex-wrap items-center gap-3">
              {searchBox}
              {children}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">{dropdowns}</div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {searchBox}
          {dropdowns}
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
