import React from "react";

/**
 * Small dependency-free SVG chart primitives for the Reports & Analytics
 * view (adviser recommendation: "Filtering — Date, Summary — Attendance,
 * Percentage" + "What Events usually happen per year"). Kept intentionally
 * simple (no charting library) so the dashboard stays visual — cards +
 * charts — rather than another data table.
 */

const TEAL = "#005f63";
const TEAL_LIGHT = "#3ec5c5";
const ORANGE = "#ff7a28";

export function BarChart({
  data,
  color = TEAL,
  height = 180,
  valueSuffix = "",
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-gray-400 italic py-8 text-center">No data for the selected filters.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-3 sm:gap-4 min-w-max px-1" style={{ height }}>
        {data.map((d, i) => {
          const barHeight = Math.max(4, (d.value / max) * (height - 40));
          return (
            <div key={i} className="flex flex-col items-center justify-end w-10 sm:w-12 shrink-0" style={{ height }}>
              <span className="text-[11px] font-bold text-gray-700 mb-1">{d.value}{valueSuffix}</span>
              <div
                className="w-full rounded-t-lg transition-all duration-300"
                style={{ height: barHeight, background: color }}
                title={`${d.label}: ${d.value}${valueSuffix}`}
              />
              <span className="mt-2 text-[10px] text-gray-500 text-center leading-tight break-words w-full">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DonutChart({
  percentage,
  size = 140,
  stroke = 16,
  label,
  color = TEAL,
  trackColor = "#eef2f2",
}: {
  percentage: number;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
  trackColor?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black" style={{ color }}>{clamped.toFixed(0)}%</span>
        </div>
      </div>
      {label && <span className="text-xs font-medium text-gray-600 text-center">{label}</span>}
    </div>
  );
}

export { TEAL, TEAL_LIGHT, ORANGE };
