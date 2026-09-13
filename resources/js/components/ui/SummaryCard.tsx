import React from "react";

interface SummaryCardProps {
  value: number;
  title: string;
  gradient: string;
  description: string;
  onClick?: () => void;
}

export default function SummaryCard({ value, title, gradient, description, onClick }: SummaryCardProps) {
  // Piao design system: stat tiles read as calm, bordered paper cards --
  // the caller's "gradient" becomes a thin 3px accent stripe instead of a
  // full-bleed color fill, so the dashboard isn't a wall of color.
  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-[#E6E0D3] bg-white p-5 text-left text-[#1A1A1A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#A2C9BC]"
    >
      <span className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${gradient}`} aria-hidden="true" />
      <h2 className="text-4xl font-display font-extrabold tracking-tight">{value}</h2>
      <p className="mt-2 text-[13px] font-semibold uppercase tracking-wide text-sage-700">
        {title}
      </p>
      <p className="mt-1 text-xs text-[#6E6A60] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {description}
      </p>
    </button>
  );
}
