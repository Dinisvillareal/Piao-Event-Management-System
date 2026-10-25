import { Minus, TrendingDown, TrendingUp } from "lucide-react";

type Mode = "percent" | "points" | "count";

/**
 * "▲ 12.5% vs previous period" -- the small change badge under a KPI number.
 * `good` says which direction is healthy ("up" for attendance, "down" for
 * events that went over budget, "neutral" when neither is better, e.g. money
 * spent), which only decides the tint; the arrow always shows the real direction.
 * Hidden on paper: a printout shows the report's own figures only.
 */
export default function KpiDelta({
  cur,
  prev,
  mode = "percent",
  good = "up",
  decimals = 1,
  tip,
  t,
}: {
  cur: number | null | undefined;
  prev: number | null | undefined;
  mode?: Mode;
  good?: "up" | "down" | "neutral";
  decimals?: number;
  tip?: string;
  t: (key: string) => string;
}) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;

  const diff = cur - prev;
  const round = (n: number, d = decimals) => Number(n.toFixed(d));
  let text: string;
  let direction: "up" | "down" | "flat";

  if (Math.abs(diff) < 1e-9) {
    direction = "flat";
    text = t("rpDeltaSame");
  } else if (mode === "percent" && prev === 0) {
    direction = "up";
    text = t("rpDeltaNew");
  } else {
    direction = diff > 0 ? "up" : "down";
    const sign = diff > 0 ? "+" : "−";
    if (mode === "percent") text = `${sign}${Math.abs(round((diff / Math.abs(prev)) * 100))}%`;
    else if (mode === "points") text = `${sign}${Math.abs(round(diff))} ${t("rpPtsSuffix")}`;
    else text = `${sign}${Math.abs(round(diff, Number.isInteger(diff) ? 0 : decimals))}`;
  }

  const healthy = direction === "flat" || good === "neutral" ? null : (direction === "up") === (good === "up");
  const tone = healthy === null ? "text-white/85" : healthy ? "text-emerald-200" : "text-red-200";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <span
      title={tip}
      className={`mt-2 inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold print:hidden ${tone}`}
    >
      <Icon className="h-3 w-3" strokeWidth={3} />
      {text}
    </span>
  );
}
