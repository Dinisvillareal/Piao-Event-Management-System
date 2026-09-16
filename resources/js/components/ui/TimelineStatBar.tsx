import React from "react";
import { Calendar } from "lucide-react";

export interface TimelineStatItem {
  value: number | string;
  label: string;
  caption: string;
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  /** Overrides the bar's overall accent for just this cell -- used to keep
   *  a semantically distinct stat (e.g. an overdue count) red regardless
   *  of the bar's own gold/teal theme. */
  tone?: "gold" | "teal" | "danger";
}

interface TimelineStatBarProps {
  items: TimelineStatItem[];
  accent?: "gold" | "teal";
}

const toneAccentText: Record<string, string> = {
  gold: "text-gold-600",
  teal: "text-[#2E8E82]",
  danger: "text-[#8A3D2C]",
};

const toneValueText: Record<string, string> = {
  gold: "text-[#0A0E1A]",
  teal: "text-[#0A0E1A]",
  danger: "text-[#8A3D2C]",
};

// Piao design system -- the timeline-style stat strip from the DOST-SEI
// scholarships reference (dark header with a calendar icon + a dotted
// progress line, then big numbers underneath) repurposed to show real,
// live dashboard counts instead of program dates, in Piao's own dark
// navy / gold / teal palette.
export default function TimelineStatBar({ items, accent = "gold" }: TimelineStatBarProps) {
  const headerGradient =
    accent === "teal"
      ? "from-[#0A0E1A] via-[#123A38] to-[#1C5850]"
      : "from-[#0A0E1A] via-[#241B05] to-[#3C2E0A]";
  const dotColor = accent === "teal" ? "bg-[#4FBEB0]" : "bg-gold-400";

  return (
    <div className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-sm">
      <div className={`flex items-center gap-4 bg-gradient-to-r ${headerGradient} px-6 py-4`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Calendar className="h-4 w-4 text-white" />
        </span>
        <div className="relative h-px flex-1 bg-white/25">
          <span className={`absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${dotColor}`} />
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
          <span className={`absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${dotColor}`} />
        </div>
      </div>

      <div className="flex flex-wrap">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const tone = item.tone ?? accent;
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`font-display text-3xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums] sm:text-4xl ${toneValueText[tone]}`}
                >
                  {item.value}
                </span>
                {Icon && <Icon className={`h-4 w-4 ${toneAccentText[tone]}`} />}
              </div>
              <p className={`mt-2 text-[11px] font-bold uppercase tracking-wide ${toneAccentText[tone]}`}>
                {item.label}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[#5C574A]">{item.caption}</p>
            </>
          );

          const cellClass =
            "flex-1 min-w-[140px] border-l border-black/[0.06] px-5 py-5 text-left first:border-l-0 sm:px-6";

          return item.onClick ? (
            <button key={idx} onClick={item.onClick} className={`${cellClass} transition hover:bg-black/[0.02]`}>
              {body}
            </button>
          ) : (
            <div key={idx} className={cellClass}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
