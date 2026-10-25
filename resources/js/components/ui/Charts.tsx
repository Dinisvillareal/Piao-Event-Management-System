import React, { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAnimatedNumber, useEntered, useReveal } from "../../hooks/useAnimatedValue";
import AnimatedNumber from "./AnimatedNumber";

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
  dark = false,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  valueSuffix?: string;
  // Same on-dark-navy-background variant used throughout the redesigned
  // pages -- only recolors this chart's own text, the bars keep whatever
  // `color` the caller passes.
  dark?: boolean;
}) {
  const { t } = useLanguage();
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className={`text-sm italic py-8 text-center ${dark ? "text-white/40 print:text-gray-400" : "text-gray-400"}`}>{t("uiNoDataForFilters")}</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-3 sm:gap-4 min-w-max px-1" style={{ height }}>
        {data.map((d, i) => {
          const barHeight = Math.max(4, (d.value / max) * (height - 40));
          return (
            <div key={i} className="flex flex-col items-center justify-end w-10 sm:w-12 shrink-0" style={{ height }}>
              {/* dark's white text is invisible once this chart prints on a
                  white page (Reports, via print:bg-white cards) -- give it
                  a print-only dark color like every other dark-mode label
                  in ReportsView already has, instead of vanishing on paper. */}
              <span className={`text-[11px] font-bold mb-1 ${dark ? "text-white print:text-gray-700" : "text-gray-700"}`}>{d.value}{valueSuffix}</span>
              <div
                className="w-full rounded-t-lg transition-all duration-300"
                style={{ height: barHeight, background: color }}
                title={`${d.label}: ${d.value}${valueSuffix}`}
              />
              <span className={`mt-2 text-[10px] text-center leading-tight break-words w-full ${dark ? "text-white/45 print:text-gray-500" : "text-gray-500"}`}>{d.label}</span>
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
  trackColor,
  dark = false,
}: {
  percentage: number;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
  trackColor?: string;
  // Same on-dark-navy-background variant used throughout the redesigned
  // pages -- recolors the track ring and label text; the progress color
  // itself stays caller-controlled.
  dark?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;
  const resolvedTrackColor = trackColor ?? (dark ? "rgba(255,255,255,0.1)" : "#eef2f2");

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={resolvedTrackColor} strokeWidth={stroke} />
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
      {/* Same print-invisibility issue as BarChart's labels above -- dark's
          white text disappeared once this donut printed on Reports' white
          page, which is what made the attendance breakdown look unlabeled
          on the printed report. */}
      {label && <span className={`text-xs font-medium text-center ${dark ? "text-white/60 print:text-gray-600" : "text-gray-600"}`}>{label}</span>}
    </div>
  );
}

export { TEAL, TEAL_LIGHT, ORANGE };

/* ────────────────────────────────────────────────────────────────────────────
 * Analytics charts (Reports & Analytics page)
 *
 * Colours: one validated categorical order -- teal, gold, blue, coral, violet --
 * checked for colour-blind separation on the dark surface. Text and gridlines
 * use currentColor with the app's own `text-white/..` tokens, so the generated
 * light theme and the `print:` variants recolour them like every other label.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CHART_COLORS = ["#35a597", "#b98a22", "#3987e5", "#d9654f", "#9085e9"] as const;
/** The dashed "previous period" line -- a neutral, so it never competes with a data hue. */
export const CHART_PREVIOUS = "#8d96ab";
/** Soft pastel set for "who is who" charts (gender, shares, age): blue, pink, lime, lavender, peach, then a neutral. */
export const CHART_SOFT = ["#B9E1EC", "#F9CFDD", "#DDE98F", "#CBC5F2", "#F7DDB0"] as const;
/** The same hues one step deeper -- for a hovered / selected column or a thin bar. */
export const CHART_SOFT_DEEP = ["#79BDD3", "#EFA3BD", "#BFD25E", "#A59BE0", "#EDB872"] as const;
export const CHART_SOFT_NEUTRAL = "#B7C0CF";

const inkSoft = "text-white/45 print:text-gray-500";
const inkMain = "text-white print:text-gray-800";

// ── Line chart ───────────────────────────────────────────────────────────────

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  area?: boolean;
  /** Extra line under this series' value in the tooltip (e.g. the date of the previous period's point). */
  notes?: (string | undefined)[];
}

function niceScale(rawMax: number, integer: boolean) {
  if (rawMax <= 0) return { max: integer ? 4 : 1, ticks: integer ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1] };
  const raw = rawMax / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  if (integer && step < 1) step = 1;
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { max, ticks };
}

/** Smooth curve that never overshoots the data (monotone cubic), so a zero stays at zero. */
function monotonePath(p: [number, number][]) {
  const n = p.length;
  if (n === 0) return "";
  if (n === 1) return `M${p[0][0]},${p[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = (p[i + 1][1] - p[i][1]) / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

/**
 * Responsive line / area chart with a hover crosshair and tooltip. Several
 * series share ONE axis (a "previous period" line is the same measure, dashed).
 */
export function LineChart({
  labels,
  tooltipLabels,
  series,
  height = 260,
  format = (n: number) => String(n),
  integer = false,
}: {
  labels: string[];
  tooltipLabels?: string[];
  series: LineSeries[];
  height?: number;
  format?: (n: number) => string;
  /** Whole-number axis (counts) -- no 0.5 ticks. */
  integer?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const reveal = useReveal(1300, 120);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setW(Math.max(280, el.clientWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const m = { l: 44, r: 16, t: 14, b: 30 };
  const pw = w - m.l - m.r;
  const ph = height - m.t - m.b;
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const { max, ticks } = niceScale(Math.max(0, ...all), integer);
  const x = (i: number) => (n <= 1 ? m.l + pw / 2 : m.l + (i / (n - 1)) * pw);
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const labelStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 74))));

  // Break a series into runs wherever it has no value.
  const runs = (s: LineSeries) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) { if (cur.length) out.push(cur); cur = []; } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    if (n <= 1) { setHover(0); return; }
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1)))));
  };

  const showDots = n <= 14;
  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 96), w - 96);

  return (
    <div ref={wrap} className="w-full">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {series.map((s) => (
            <span key={s.key} className={`inline-flex items-center gap-2 text-xs font-semibold ${inkSoft}`}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dashed ? "4 4" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          className="block max-w-full touch-pan-y select-none"
          role="img"
          aria-label={series.map((s) => s.label).join(", ")}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.filter((s) => s.area).map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <clipPath id={`${uid}-reveal`}>
              <rect x="0" y="0" width={Math.max(0, m.l + (w - m.l) * reveal)} height={height} />
            </clipPath>
          </defs>

          {/* grid + y labels */}
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={m.l} x2={w - m.r} y1={y(tv)} y2={y(tv)} stroke="currentColor" strokeWidth="1" className="text-white/15 print:text-gray-200" strokeDasharray={tv === 0 ? undefined : "3 4"} />
              <text x={m.l - 8} y={y(tv) + 4} textAnchor="end" fontSize="11" fill="currentColor" className={inkSoft}>{format(tv)}</text>
            </g>
          ))}

          {/* x labels */}
          {labels.map((l, i) =>
            i % labelStep === 0 || i === n - 1 && n - 1 - (Math.floor((n - 1) / labelStep) * labelStep) >= labelStep * 0.6 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} fontSize="11" fill="currentColor" className={inkSoft}>{l}</text>
            ) : null
          )}

          {/* hover crosshair */}
          {hover !== null && n > 1 && (
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="text-white/40" />
          )}

          {/* areas, then lines, previous period drawn first so the current one sits on top */}
          <g clipPath={reveal < 1 ? `url(#${uid}-reveal)` : undefined}>
          {[...series].reverse().map((s) =>
            runs(s).map((run, ri) => {
              const line = monotonePath(run);
              return (
                <g key={`${s.key}-${ri}`}>
                  {s.area && run.length > 1 && (
                    <path d={`${line} L${run[run.length - 1][0]},${m.t + ph} L${run[0][0]},${m.t + ph} Z`} fill={`url(#${uid}-${s.key})`} />
                  )}
                  {run.length > 1 ? (
                    <path d={line} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
                  ) : null}
                  {(showDots || run.length === 1) && !s.dashed && run.map(([cx, cy], di) => <circle key={di} cx={cx} cy={cy} r="3" fill={s.color} />)}
                </g>
              );
            })
          )}
          </g>

          {/* hover dots */}
          {hover !== null && series.map((s) => {
            const v = s.values[hover];
            if (v === null || v === undefined) return null;
            return (
              <g key={s.key}>
                <circle cx={x(hover)} cy={y(v)} r="8" fill={s.color} opacity="0.2" />
                <circle cx={x(hover)} cy={y(v)} r="4.5" fill={s.color} />
              </g>
            );
          })}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-xl border border-white/15 bg-[#0A0E1A] px-3 py-2.5 shadow-xl print:hidden"
            style={{ left: tipLeft }}
          >
            <p className={`text-xs font-bold ${inkMain}`}>{tooltipLabels?.[hover] ?? labels[hover]}</p>
            <div className="mt-1.5 space-y-1.5">
              {series.map((s) => {
                const v = s.values[hover];
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] ${inkSoft}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
                      </span>
                      <span className={`text-xs font-bold ${inkMain}`}>{v === null || v === undefined ? "—" : format(v)}</span>
                    </div>
                    {s.notes?.[hover] && <p className={`pl-3.5 text-[10px] ${inkSoft}`}>{s.notes[hover]}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ranked bars ("Age 18-24  72%" style) ────────────────────────────────────

export interface RankedRow {
  label: string;
  value: number;
  /** Shown to the right instead of the raw value (e.g. "₱9,800"). */
  valueLabel?: string;
  sub?: string;
  color?: string;
}

/**
 * A short list where each row is a label, its number, its share of the total
 * and a thin bar -- clearer than lone vertical bars for a handful of groups.
 */
export function RankedBars({
  rows,
  showShare = true,
  scaleToMax = false,
  maxValue,
  color = CHART_COLORS[0],
  emptyText,
  onSelect,
  selectedIndex,
}: {
  rows: RankedRow[];
  showShare?: boolean;
  /** Bar length follows value/biggest instead of value/total. */
  scaleToMax?: boolean;
  /** Bar length follows value/maxValue (e.g. 100 for percentages). */
  maxValue?: number;
  color?: string;
  emptyText?: string;
  /** Makes each row clickable (e.g. filter the report to that group, or open that event). */
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
}) {
  const entered = useEntered();
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className={`py-8 text-center text-sm italic ${inkSoft}`}>{emptyText}</p>;
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => {
        const share = total > 0 ? (r.value / total) * 100 : 0;
        const width = scaleToMax || maxValue !== undefined ? (r.value / (maxValue ?? max)) * 100 : share;
        const c = r.color ?? color;
        const clickable = !!onSelect;
        const selected = selectedIndex === i;
        return (
          <li
            key={`${r.label}-${i}`}
            className={clickable ? `-mx-2 cursor-pointer rounded-xl px-2 py-1.5 transition hover:bg-white/5 print:hover:bg-transparent ${selected ? "bg-white/[0.07]" : ""}` : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={clickable ? selected : undefined}
            onClick={clickable ? () => onSelect(i) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } } : undefined}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-sm font-semibold ${inkMain}`} title={r.label}>{r.label}</span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className={`font-bold ${inkMain}`}>{r.valueLabel ?? r.value}</span>
                {showShare && <span className={`ml-2 text-xs font-semibold ${inkSoft}`}>{Math.round(share)}%</span>}
              </span>
            </div>
            {r.sub && <p className={`mt-0.5 truncate text-xs ${inkSoft}`}>{r.sub}</p>}
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10 print:bg-gray-200">
              <div
                className="h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] print:transition-none"
                style={{ width: entered ? `${Math.max(width > 0 ? 2 : 0, width)}%` : "0%", background: c, transitionDelay: `${Math.min(i, 8) * 70}ms` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Segmented donut ──────────────────────────────────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Donut split into labelled parts, a total in the middle and a legend that doubles as the key. */
export function SegmentDonut({
  segments,
  size = 176,
  stroke = 20,
  centerValue,
  centerLabel,
  format = (n: number) => String(n),
}: {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  /** Big text in the middle; defaults to the total. */
  centerValue?: string;
  centerLabel?: string;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const sweep = useReveal(1200, 150);
  const animTotal = useAnimatedNumber(total, 1100, 150);
  const r = (size - stroke) / 2 - 12;
  const C = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0; // surface gap between parts
  let acc = 0;
  const active = hover !== null ? segments[hover] : null;
  const shownValue = active ? format(active.value) : centerValue ?? format(Math.round(animTotal));
  const shownLabel = active ? `${active.label} · ${total > 0 ? Math.round((active.value / total) * 100) : 0}%` : centerLabel;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6 print:flex-col print:items-center print:gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
          <circle cx={size / 2} cy={size / 2} r={r + stroke / 2 + 7} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/15 print:text-gray-100" />
          <circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 7} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/15 print:text-gray-100" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/15 print:text-gray-200" />
          {total > 0 && segments.map((s, i) => {
            if (s.value <= 0) return null;
            const len = (s.value / total) * C;
            const start = acc;
            acc += len;
            const seen = Math.max(0, Math.min(len, sweep * C - start)); // clockwise sweep
            const dash = seen >= len ? Math.max(0.5, len - gap) : Math.max(0, seen - gap / 2);
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? stroke + 4 : stroke}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-(start + gap / 2)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: "stroke-width .15s ease", cursor: "default" }}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              >
                <title>{`${s.label}: ${format(s.value)}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className={`text-2xl font-black leading-none ${inkMain}`}>{total > 0 || centerValue ? shownValue : "—"}</span>
          {shownLabel && <span className={`mt-1 text-[11px] font-medium leading-tight ${inkSoft}`}>{shownLabel}</span>}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5 print:w-full print:flex-none">
        {segments.map((s, i) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-3"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className={`inline-flex min-w-0 items-center gap-2 text-sm font-semibold ${inkMain}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <span className={`font-bold ${inkMain}`}><AnimatedNumber value={s.value} format={format} delay={250} /></span>
              <span className={`ml-2 text-xs font-semibold ${inkSoft}`}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Paired bars (planned vs actual) ─────────────────────────────────────────

export interface PairedRow {
  label: string;
  sub?: string;
  planned: number;
  actual: number;
}

/** Approved vs spent per event: a track as long as the approved amount, filled with what was spent; red once it passes. */
export function PairedBars({
  rows,
  format,
  plannedLabel,
  actualLabel,
  overLabel,
  onSelect,
}: {
  rows: PairedRow[];
  format: (n: number) => string;
  plannedLabel: string;
  actualLabel: string;
  overLabel: string;
  onSelect?: (index: number) => void;
}) {
  const entered = useEntered();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.actual)));
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => {
        const over = r.actual > r.planned;
        const pPct = (r.planned / max) * 100;
        const aPct = (r.actual / max) * 100;
        const clickable = !!onSelect;
        const grow = "transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] print:transition-none";
        return (
          <li
            key={`${r.label}-${i}`}
            className={clickable ? "-mx-2 cursor-pointer rounded-xl px-2 py-1.5 transition hover:bg-white/5 print:hover:bg-transparent" : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onSelect(i) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } } : undefined}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-sm font-semibold ${inkMain}`} title={r.label}>{r.label}</span>
              <span className={`shrink-0 text-xs tabular-nums ${inkSoft}`}>
                <span className={`font-bold ${over ? "text-red-400 print:text-red-600" : inkMain}`}>{format(r.actual)}</span> / {format(r.planned)}
                {over && <span className="ml-1.5 font-semibold text-red-400 print:text-red-600">· {overLabel} {format(r.actual - r.planned)}</span>}
              </span>
            </div>
            <div className="mt-1.5 space-y-1" title={`${plannedLabel}: ${format(r.planned)} · ${actualLabel}: ${format(r.actual)}`}>
              <div className={`h-2 rounded-full bg-white/10 print:bg-gray-200 ${grow}`} style={{ width: entered ? `${Math.max(2, pPct)}%` : "0%", transitionDelay: `${Math.min(i, 8) * 70}ms` }}>
                <div className="h-full rounded-full" style={{ width: "100%", background: "rgba(141,150,171,0.55)" }} />
              </div>
              <div className={`h-2 rounded-full ${grow}`} style={{ width: entered ? `${Math.max(r.actual > 0 ? 2 : 0, aPct)}%` : "0%", background: over ? "#d9654f" : CHART_SOFT_DEEP[0], transitionDelay: `${Math.min(i, 8) * 70 + 120}ms` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Radar ────────────────────────────────────────────────────────────────────

export interface RadarAxis {
  label: string;
  value: number;
  /** Shown under the label instead of the raw value. */
  display?: string;
}

/**
 * Spider chart for comparing a handful (3-8) of categories on ONE scale.
 * Each corner shows its name and value; the shape grows out from the middle on mount.
 */
export function RadarChart({
  axes,
  color = CHART_COLORS[0],
  format = (n: number) => String(n),
  rings = 4,
  onSelect,
  selectedIndex,
}: {
  axes: RadarAxis[];
  color?: string;
  format?: (n: number) => string;
  rings?: number;
  /** Makes each corner clickable (e.g. filter the report to that group). */
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const grow = useReveal(1200, 150);
  const W = 380, H = 300, cx = W / 2, cy = H / 2 + 4, R = 92;
  const n = axes.length;
  const max = Math.max(1, ...axes.map((a) => a.value));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, f: number) => [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f] as const;
  const ring = (f: number) => axes.map((_, i) => pt(i, f).join(",")).join(" ");
  const shape = axes.map((a, i) => pt(i, (a.value / max) * grow).join(",")).join(" ");
  const clip = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[440px] select-none" role="img" aria-label={axes.map((a) => `${a.label} ${a.value}`).join(", ")}>
      {Array.from({ length: rings }, (_, k) => (k + 1) / rings).map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="currentColor" strokeWidth="1" className="text-white/15 print:text-gray-200" strokeDasharray={f === 1 ? undefined : "3 4"} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeWidth="1" className="text-white/15 print:text-gray-200" />;
      })}
      <polygon points={shape} fill={color} fillOpacity="0.16" stroke={color} strokeWidth="2.25" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, (a.value / max) * grow);
        return <circle key={i} cx={x} cy={y} r={hover === i || selectedIndex === i ? 5.5 : 3.5} fill={color} style={{ transition: "r .15s ease" }} />;
      })}
      {axes.map((a, i) => {
        const c = Math.cos(ang(i));
        const s = Math.sin(ang(i));
        const [lx, ly] = pt(i, 1.2);
        const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        const top = s < -0.6;
        const bottom = s > 0.6;
        const yl = top ? ly - 16 : bottom ? ly + 6 : ly - 2;
        return (
          <g
            key={`${a.label}-${i}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onClick={onSelect ? () => onSelect(i) : undefined}
            onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } } : undefined}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? selectedIndex === i : undefined}
            style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}
          >
            <title>{`${a.label}: ${a.display ?? format(a.value)}`}</title>
            <rect x={anchor === "start" ? lx - 4 : anchor === "end" ? lx - 118 : lx - 57} y={yl - 12} width="122" height="32" fill="transparent" />
            <text x={lx} y={yl} textAnchor={anchor} fontSize="11.5" fill="currentColor" className={hover === i || selectedIndex === i ? inkMain : inkSoft}>{clip(a.label)}</text>
            <text x={lx} y={yl + 16} textAnchor={anchor} fontSize="14" fontWeight="800" fill="currentColor" className={inkMain}>{a.display ?? format(a.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Gauge ────────────────────────────────────────────────────────────────────

export interface GaugeSide {
  label: string;
  value: number;
  color: string;
  /** How to print the number (default: plain integer). */
  format?: (n: number) => string;
  decimals?: number;
}

/**
 * Layered 240° dial for ONE percentage: a fine tick bezel and hairline on the
 * outside, a soft glow under the value arc, a big animated number with an
 * optional icon in the middle, and the two parts it is made of underneath.
 * The arc stops at full, the number shows the real figure.
 */
export function GaugeChart({
  value,
  color = CHART_COLORS[0],
  centerLabel,
  left,
  right,
  icon,
  format = (n: number) => String(n),
}: {
  /** 0-100 (above 100 the arc stays full). */
  value: number;
  color?: string;
  centerLabel?: string;
  left?: GaugeSide;
  right?: GaugeSide;
  icon?: React.ReactNode;
  format?: (n: number) => string;
}) {
  const sweep = useReveal(1400, 150);
  const W = 240;
  const H = 182;
  const cx = W / 2;
  const cy = 120;
  const r = 76;
  const stroke = 16;
  const SPAN = 240;
  const START = -SPAN / 2;
  const pt = (deg: number, rad: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  };
  const arc = (from: number, to: number, rad: number) => {
    const [x1, y1] = pt(from, rad);
    const [x2, y2] = pt(to, rad);
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${rad},${rad} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };
  const raw = Math.max(0, Number.isFinite(value) ? value : 0);
  const pct = Math.min(100, raw);
  const filledDeg = SPAN * (pct / 100) * sweep;
  const TICKS = 61;

  return (
    <div className="w-full">
      <div className="relative mx-auto w-full max-w-[300px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={`${format(Math.round(raw * 10) / 10)}%`}>
          {/* outer hairline + tick bezel */}
          <path d={arc(START, START + SPAN, r + 34)} fill="none" stroke="currentColor" strokeWidth="1.2" className="text-white/15 print:text-gray-200" />
          {Array.from({ length: TICKS }, (_, k) => {
            const deg = START + (SPAN / (TICKS - 1)) * k;
            const [x1, y1] = pt(deg, r + 19);
            const [x2, y2] = pt(deg, r + 27);
            const lit = deg - START <= filledDeg && filledDeg > 0;
            return lit ? (
              <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/15 print:text-gray-300" />
            );
          })}
          {/* inner hairline ring */}
          <circle cx={cx} cy={cy} r={r - stroke / 2 - 7} fill="none" stroke="currentColor" strokeWidth="1" className="text-white/15 print:text-gray-200" />
          {/* track */}
          <path d={arc(START, START + SPAN, r)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" className="text-white/15 print:text-gray-200" />
          {/* soft glow under the value, then the value */}
          {filledDeg > 0.5 && (
            <>
              <path d={arc(START, START + filledDeg, r)} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={stroke + 10} strokeLinecap="round" />
              <path d={arc(START, START + filledDeg, r)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
            </>
          )}
        </svg>
        <div className="pointer-events-none absolute left-1/2 flex w-[52%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ top: `${((cy - 2) / H) * 100}%` }}>
          {icon && (
            <span className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/60 shadow-sm print:border-gray-200 print:bg-white print:text-gray-500">
              {icon}
            </span>
          )}
          <span className={`text-[28px] font-black leading-none tabular-nums ${inkMain}`}>
            <AnimatedNumber value={raw} decimals={1} format={(n) => `${format(n)}%`} delay={150} ms={1300} />
          </span>
          {centerLabel && <span className={`mt-1.5 text-[11px] font-medium leading-tight ${inkSoft}`}>{centerLabel}</span>}
        </div>
      </div>
      {(left || right) && (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
          {left ? <GaugeStat side={left} /> : <span />}
          <span className="w-px bg-white/10 print:bg-gray-200" />
          {right ? <GaugeStat side={right} alignRight /> : <span />}
        </div>
      )}
    </div>
  );
}

function GaugeStat({ side, alignRight = false }: { side: GaugeSide; alignRight?: boolean }) {
  return (
    <div className={`flex min-w-0 items-stretch gap-2.5 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <span className="w-[3px] shrink-0 rounded-full" style={{ background: side.color }} />
      <div className="min-w-0">
        <p className={`truncate text-base font-black leading-tight tabular-nums ${inkMain}`}><AnimatedNumber value={side.value} format={side.format} decimals={side.decimals ?? 0} delay={300} /></p>
        <p className={`truncate text-xs font-medium ${inkSoft}`}>{side.label}</p>
      </div>
    </div>
  );
}

// ── Column chart (ordered groups, e.g. age brackets) ────────────────────────

export interface ColumnRow {
  label: string;
  value: number;
  /** Small line under the label (e.g. the share). */
  sub?: string;
}

/**
 * Vertical columns for a few ORDERED groups (child → senior). One axis with
 * grid lines, the number on top of each column, columns grow up on load.
 * Clickable columns can act as a filter; the others dim while one is chosen.
 */
export function ColumnChart({
  rows,
  color = CHART_SOFT_DEEP[0],
  activeColor = CHART_SOFT_DEEP[0],
  height = 220,
  format = (n: number) => String(n),
  onSelect,
  selectedIndex,
}: {
  rows: ColumnRow[];
  color?: string;
  /** Hovered / chosen column. */
  activeColor?: string;
  height?: number;
  format?: (n: number) => string;
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
}) {
  const entered = useEntered();
  const [hover, setHover] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(0, ...rows.map((r) => r.value)), true);
  const hasSel = selectedIndex !== null && selectedIndex !== undefined && selectedIndex >= 0;

  return (
    <div className="w-full min-w-0 pt-3">
      <div className="flex min-w-0">
        {/* y axis */}
        <div className="relative w-9 shrink-0" style={{ height }}>
          {ticks.map((tv) => (
            <span key={tv} className={`absolute right-2 -translate-y-1/2 text-[11px] tabular-nums ${inkSoft}`} style={{ bottom: `${(tv / max) * 100}%` }}>{format(tv)}</span>
          ))}
        </div>
        {/* plot */}
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((tv) => (
            <div key={tv} className={`absolute inset-x-0 border-t ${tv === 0 ? "border-white/20 print:border-gray-300" : "border-dashed border-white/15 print:border-gray-200"}`} style={{ bottom: `${(tv / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex gap-2 sm:gap-4">
            {rows.map((r, i) => {
              const pct = (r.value / max) * 100;
              const shown = entered ? pct : 0;
              const on = hover === i || selectedIndex === i;
              const dim = hasSel && selectedIndex !== i && hover !== i;
              const grow = "transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] print:transition-none";
              const delay = { transitionDelay: `${Math.min(i, 8) * 80}ms` };
              const inner = (
                <>
                  <div
                    className={`absolute inset-x-0 text-center text-sm font-bold tabular-nums ${inkMain} ${grow}`}
                    style={{ bottom: `calc(${shown}% + 6px)`, ...delay }}
                  >
                    <AnimatedNumber value={r.value} format={format} delay={150 + i * 80} />
                  </div>
                  <div
                    className={`absolute bottom-0 left-1/2 w-[58%] max-w-[84px] -translate-x-1/2 rounded-t-xl ${grow}`}
                    style={{ height: r.value > 0 ? `max(${shown}%, ${entered ? 4 : 0}px)` : entered ? "3px" : "0px", background: on ? activeColor : color, opacity: dim ? 0.55 : 1, ...delay }}
                  />
                </>
              );
              const cls = "group relative h-full flex-1 rounded-xl";
              return onSelect ? (
                <button
                  key={`${r.label}-${i}`}
                  type="button"
                  title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ""}`}
                  aria-pressed={selectedIndex === i}
                  onClick={() => onSelect(i)}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  className={`${cls} cursor-pointer`}
                >
                  {inner}
                </button>
              ) : (
                <div key={`${r.label}-${i}`} title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ""}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={cls}>{inner}</div>
              );
            })}
          </div>
        </div>
      </div>
      {/* x labels */}
      <div className="flex min-w-0">
        <div className="w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 gap-2 pt-2.5 sm:gap-4">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="min-w-0 flex-1 overflow-hidden text-center">
              <p className={`truncate text-xs font-semibold ${hasSel && selectedIndex === i ? inkMain : inkSoft}`}>{r.label}</p>
              {r.sub && <p className={`text-[11px] ${inkSoft}`}>{r.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
