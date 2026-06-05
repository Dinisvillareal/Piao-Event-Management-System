import React from "react";

interface SummaryCardProps {
  value: number;
  title: string;
  gradient: string;
  description: string;
  onClick?: () => void;
}

export default function SummaryCard({ value, title, gradient, description, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-[30px] bg-gradient-to-r ${gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]`}
    >
      <h2 className="text-5xl font-black">{value}</h2>
      <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
        {title}
      </p>
      <p className="mt-1 text-xs text-white/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {description}
      </p>
    </button>
  );
}
