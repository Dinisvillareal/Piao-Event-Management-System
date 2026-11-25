// Pill tabs with live counts -- the "quick filter" row that sits above a list
// ("All 24 · Today 2 · This week 5"). One look for every page; the active tab
// is the same sage pill the Residents page always used.
import type { ReactNode } from "react";

export interface QuickTab {
  key: string;
  label: string;
  count?: number;
  /** Optional icon -- on phones the label hides and only the icon (+ count) shows. */
  icon?: ReactNode;
  /** Tint the count (e.g. red for things that need attention). */
  alert?: boolean;
}

export default function QuickTabs({
  tabs,
  value,
  onChange,
  className = "",
  variant = "pills",
}: {
  tabs: QuickTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  /** "segmented" = all choices inside one rounded track (for a single either/or choice, like a period). */
  variant?: "pills" | "segmented";
}) {
  if (variant === "segmented") {
    return (
      <div role="tablist" className={`inline-flex max-w-full items-center gap-1 overflow-x-auto dash-tile rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
        {tabs.map((tab) => {
          const on = tab.key === value;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => { if (!on) onChange(tab.key); }}
              className={`inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${
                on ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] text-white shadow-sm" : "text-white/60 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="tablist" className={`flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${tabs.length > 0 && tabs.every((x) => x.icon) ? "max-sm:justify-center" : "max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-sm:overflow-visible"} ${className}`}>
      {tabs.map((tab, idx) => {
        const on = tab.key === value;
        // Phones (text tabs): an even 2-column grid; an odd last tab spans the full row.
        const lastOdd = !tab.icon && tabs.length % 2 === 1 && idx === tabs.length - 1;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => { if (!on) onChange(tab.key); }}
            title={tab.label}
            aria-label={tab.label}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab.icon ? "max-sm:gap-2 max-sm:px-5 max-sm:py-2.5" : (`max-sm:w-full max-sm:min-w-0 max-sm:justify-between max-sm:gap-1.5 max-sm:px-3.5 max-sm:py-2 max-sm:text-[13px] ${lastOdd ? "max-sm:col-span-2" : ""}`)} ${
              on ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] text-white shadow-sm" : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
            }`}
          >
            {tab.icon && <span className="flex shrink-0 items-center max-sm:[&>svg]:h-5 max-sm:[&>svg]:w-5 [&>svg]:h-4 [&>svg]:w-4">{tab.icon}</span>}
            <span className={tab.icon ? "max-sm:hidden" : "max-sm:truncate"}>{tab.label}</span>
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
