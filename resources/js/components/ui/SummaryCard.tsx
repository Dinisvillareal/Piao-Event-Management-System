import React from "react";
import type { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  value: number;
  title: string;
  gradient: string;
  description: string;
  icon?: LucideIcon;
  onClick?: () => void;
}

export default function SummaryCard({ value, title, gradient, description, icon: Icon, onClick }: SummaryCardProps) {
  // Same full-gradient KPI tile used by the staff Dashboard and Inventory
  // stat strips (solid gradient fill, value + icon up top, uppercase label,
  // always-visible description) -- so the two portals' stat cards read as
  // one consistent design language instead of two different card styles.
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-left text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">{value}</h2>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-white/80" />}
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-xs text-white/75">{description}</p>
    </button>
  );
}
