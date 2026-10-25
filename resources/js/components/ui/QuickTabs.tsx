// Pill tabs with live counts -- the "quick filter" row that sits above a list
// ("All 24 · Today 2 · This week 5"). One look for every page; the active tab
// is the same sage pill the Residents page always used.
export interface QuickTab {
  key: string;
  label: string;
  count?: number;
  /** Tint the count (e.g. red for things that need attention). */
  alert?: boolean;
}

export default function QuickTabs({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: QuickTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => { if (!on) onChange(tab.key); }}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              on ? "bg-sage-700 text-white shadow-sm" : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`inline-flex min-w-[1.4rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                  on ? "bg-white/20 text-white" : tab.alert && tab.count > 0 ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/60"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
