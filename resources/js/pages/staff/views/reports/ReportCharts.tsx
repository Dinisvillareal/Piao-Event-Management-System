import { useState, type ReactNode } from "react";
import { Boxes, Users, Wallet } from "lucide-react";
import { ColumnChart, GaugeChart, LineChart, PairedBars, RankedBars, SegmentDonut, CHART_COLORS, CHART_PREVIOUS, CHART_SOFT, CHART_SOFT_DEEP, CHART_SOFT_NEUTRAL, type LineSeries } from "../../../../components/ui/Charts";
import AnimatedNumber from "../../../../components/ui/AnimatedNumber";
import { useReveal } from "../../../../hooks/useAnimatedValue";

type T = (key: string) => string;

/** The card every analytics chart sits in -- same look as the rest of the report. */
export function ChartCard({ title, desc, right, children, className = "", delay = 0 }: { title: ReactNode; desc?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <div
      className={`report-rise print:break-inside-avoid min-w-0 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 sm:p-6 print:border-[#ddd5ca] print:bg-white ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white print:text-[#005f63]">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-white/40 print:text-gray-500">{desc}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Small segmented switch for the measure a trend chart plots. */
function MetricTabs({ value, onChange, options }: { value: string; onChange: (k: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 print:hidden">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={value === o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${value === o.key ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One event in the ranking: a progress ring with the rate, the name, and who showed up. Click opens the event. */
function EventRankTile({ index, ev, color, onOpen, t }: { index: number; ev: any; color: string; onOpen?: () => void; t: T }) {
  const reveal = useReveal(1000, 120 + index * 70);
  const size = 62;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(ev.percentage) || 0));
  const body = (
    <>
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/15 print:text-gray-200" />
          {pct > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${Math.max(0.5, C * (pct / 100) * reveal)} ${C}`} />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-black tabular-nums text-white print:text-gray-800">
          <AnimatedNumber value={pct} decimals={pct % 1 ? 1 : 0} format={(n) => `${n}%`} delay={120 + index * 70} />
        </span>
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-white print:text-gray-800" title={ev.name}>{ev.name}</span>
        <span className="mt-0.5 block text-xs text-white/45 print:text-gray-500">{ev.attended} / {ev.eligible} {String(t("rpMetricAttendees")).toLowerCase()}</span>
        <span className="block text-[11px] text-white/40 print:text-gray-500">{ev.date}</span>
      </span>
      <span className="self-start rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold tabular-nums text-white/55 print:bg-gray-100 print:text-gray-500">#{index + 1}</span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 print:break-inside-avoid print:border-[#ddd5ca] print:bg-white";
  return onOpen ? (
    <button type="button" onClick={onOpen} title={ev.name} className={`${cls} w-full text-left transition hover:bg-white/5 print:hover:bg-white`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function EventRankGrid({ events, color, onOpen, t }: { events: any[]; color: string; onOpen?: (id: number | string) => void; t: T }) {
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-1">
      {events.map((e, i) => (
        <EventRankTile key={e.id ?? i} index={i} ev={e} color={color} t={t} onOpen={onOpen ? () => onOpen(e.id) : undefined} />
      ))}
    </div>
  );
}

interface Trend { unit: string; points: any[] }

/** "This period" (filled teal) against "Previous period" (dashed grey), same axis. */
function trendSeries(t: T, trend: Trend, prev: Trend | null | undefined, metric: string, label: string): LineSeries[] {
  const cur: LineSeries = { key: "cur", label: `${label} · ${t("rpThisPeriod")}`, color: CHART_COLORS[0], area: true, values: trend.points.map((p) => (p[metric] ?? 0) as number) };
  if (!prev || !prev.points?.length) return [{ ...cur, label }];
  return [
    cur,
    {
      key: "prev",
      label: `${label} · ${t("rpPrevPeriod")}`,
      color: CHART_PREVIOUS,
      dashed: true,
      values: trend.points.map((_, i) => (prev.points[i] ? ((prev.points[i][metric] ?? 0) as number) : null)),
      notes: trend.points.map((_, i) => prev.points[i]?.full),
    },
  ];
}

function TrendBody({ t, trend, prev, metric, label, format, integer }: { t: T; trend: Trend | null | undefined; prev: Trend | null | undefined; metric: string; label: string; format?: (n: number) => string; integer?: boolean }) {
  if (!trend || trend.points.length < 2) {
    return <p className="py-14 text-center text-sm italic text-white/40 print:text-gray-400">{t("rpNoTrend")}</p>;
  }
  return (
    <LineChart
      key={metric}
      labels={trend.points.map((p) => p.label)}
      tooltipLabels={trend.points.map((p) => p.full)}
      series={trendSeries(t, trend, prev, metric, label)}
      format={format}
      integer={integer}
    />
  );
}

// ── Attendance ──────────────────────────────────────────────────────────────

export function AttendanceCharts({
  t, data, previous, chartsClass, ageClass, ageGroup = "", onAgeSelect, onOpenEvent,
}: {
  t: T; data: any; previous: any; chartsClass: string; ageClass: string;
  /** Currently filtered age group ("" = all); clicking an age bar toggles it. */
  ageGroup?: string;
  onAgeSelect?: (group: string) => void;
  /** Open an event (Events page) from a ranked row. */
  onOpenEvent?: (eventId: number | string, tab: string) => void;
}) {
  const [metric, setMetric] = useState("attended");
  const [rank, setRank] = useState("best");
  const summary = data?.summary ?? {};
  const perEvent: any[] = data?.per_event ?? [];
  const metrics = [
    { key: "attended", label: t("rpMetricAttendees"), format: (n: number) => String(n), integer: true },
    { key: "rate", label: t("rpMetricRate"), format: (n: number) => `${n}%`, integer: false },
    { key: "events", label: t("rpMetricEvents"), format: (n: number) => String(n), integer: true },
  ];
  const active = metrics.find((m) => m.key === metric) ?? metrics[0];

  const present = Number(summary.total_attended ?? 0);
  const eligible = Number(summary.total_eligible ?? 0);

  const finished = perEvent.filter((e) => e.status === "Past" && e.eligible > 0);
  // Ties (lots of events at 100%) are broken by turnout, so the list stays meaningful.
  const best = [...finished].sort((a, b) => b.percentage - a.percentage || b.attended - a.attended).slice(0, 6);
  const worst = [...finished].sort((a, b) => a.percentage - b.percentage || b.eligible - a.eligible).slice(0, 6);

  const order = ["child", "youth", "adult", "senior"];
  const ageSorted = [...(data?.age_breakdown ?? [])]
    .sort((a: any, b: any) => order.indexOf(String(a.group).toLowerCase()) - order.indexOf(String(b.group).toLowerCase()));
  const ageTotal = ageSorted.reduce((acc: number, a: any) => acc + Number(a.attended), 0);
  const ageRows = ageSorted.map((a: any) => ({
    label: t(`age${a.group}`),
    value: Number(a.attended),
    sub: ageTotal > 0 ? `${Math.round((Number(a.attended) / ageTotal) * 100)}%` : "0%",
  }));
  const ageSelected = ageSorted.findIndex((a: any) => ageGroup && String(a.group).toLowerCase() === ageGroup);
  const genderSegments = (data?.gender ?? []).map((g: any, i: number) => ({ label: g.label, value: Number(g.value), color: CHART_SOFT_DEEP[i % CHART_SOFT_DEEP.length] }));

  return (
    <>
      <div className={`space-y-4 print:space-y-3 ${chartsClass}`}>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 print:grid-cols-3 print:gap-3">
          <ChartCard
            className="lg:col-span-2 print:col-span-2"
            title={t("rpTrendTitle")}
            desc={t("rpTrendDesc")}
            right={<MetricTabs value={metric} onChange={setMetric} options={metrics.map((m) => ({ key: m.key, label: m.label }))} />}
          >
            <TrendBody t={t} trend={data?.trend} prev={previous?.trend} metric={active.key} label={active.label} format={active.format} integer={active.integer} />
          </ChartCard>
          <ChartCard title={t("overallAttendance")} desc={t("rpGaugeAttendDesc")} delay={90}>
            <GaugeChart
              icon={<Users className="h-4 w-4" />}
              value={Number(summary.attendance_percentage ?? 0)}
              centerLabel={`${present} ${t("ofLabel")} ${eligible} ${t("ofEligibleResidents")}`}
              left={{ label: t("rptStatPresent"), value: present, color: CHART_COLORS[0] }}
              right={{ label: t("rptStatAbsent"), value: Math.max(0, eligible - present), color: CHART_PREVIOUS }}
            />
          </ChartCard>
        </div>

        {(best.length > 0 || worst.length > 0) && (
          <ChartCard
            title={t("rpEventRankTitle")}
            desc={t("rpEventRankDesc")}
            delay={160}
            right={<MetricTabs value={rank} onChange={setRank} options={[{ key: "best", label: t("rpRankBest") }, { key: "worst", label: t("rpRankLowest") }]} />}
          >
            {/* print shows both lists; the screen shows the one picked */}
            <div className="space-y-5">
              <div key={`best-${rank}`} className={rank === "best" ? "" : "hidden print:block"}>
                <p className="mb-2 hidden text-xs font-bold uppercase tracking-wide text-gray-500 print:block">{t("rpRankBest")}</p>
                <EventRankGrid events={best} color={CHART_COLORS[2]} t={t} onOpen={onOpenEvent ? (id) => onOpenEvent(id, "attendance") : undefined} />
              </div>
              <div key={`worst-${rank}`} className={rank === "worst" ? "" : "hidden print:block"}>
                <p className="mb-2 hidden text-xs font-bold uppercase tracking-wide text-gray-500 print:block">{t("rpRankLowest")}</p>
                <EventRankGrid events={worst} color={CHART_COLORS[3]} t={t} onOpen={onOpenEvent ? (id) => onOpenEvent(id, "attendance") : undefined} />
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      <div className={`grid gap-4 grid-cols-1 lg:grid-cols-2 print:grid-cols-2 print:gap-3 ${ageClass}`}>
        <ChartCard title={t("attendanceByAgeGroup")} desc={t("rpAgeDesc")} delay={300}>
          {(() => {
            const pick = onAgeSelect ? (i: number) => {
              const g = String(ageSorted[i].group).toLowerCase();
              onAgeSelect(g === ageGroup ? "" : g);
            } : undefined;
            const sel = ageSelected >= 0 ? ageSelected : null;
            return ageRows.length >= 2 ? (
              <ColumnChart rows={ageRows} selectedIndex={sel} onSelect={pick} />
            ) : (
              <RankedBars rows={ageRows} color={CHART_SOFT_DEEP[0]} emptyText={t("uiNoDataForFilters")} selectedIndex={sel} onSelect={pick} />
            );
          })()}
        </ChartCard>
        <ChartCard title={t("rpGenderTitle")} desc={t("rpGenderDesc")} delay={370}>
          {genderSegments.length > 0 ? (
            <SegmentDonut segments={genderSegments} centerLabel={t("rpMetricAttendees")} />
          ) : (
            <p className="py-10 text-center text-sm italic text-white/40 print:text-gray-400">{t("uiNoDataForFilters")}</p>
          )}
        </ChartCard>
      </div>
    </>
  );
}

// ── Budget ──────────────────────────────────────────────────────────────────

export function BudgetCharts({ t, data, previous, money, onOpenEvent }: { t: T; data: any; previous: any; money: (n: any) => string; onOpenEvent?: (eventId: number | string, tab: string) => void }) {
  const [metric, setMetric] = useState("amount");
  const counts = data?.status_counts ?? { within: 0, near: 0, over: 0 };
  const sum = data?.summary ?? {};
  const used = Number(sum.utilization_percentage ?? 0);
  const perEvent: any[] = data?.per_event ?? [];
  const metrics = [
    { key: "amount", label: t("rpMetricSpent"), format: (n: number) => money(n), integer: false },
    { key: "entries", label: t("rpMetricEntries"), format: (n: number) => String(n), integer: true },
  ];
  const active = metrics.find((m) => m.key === metric) ?? metrics[0];
  const rows = [...perEvent]
    .sort((a, b) => b.total_expenses - a.total_expenses)
    .slice(0, 8)
    .map((e) => ({ id: e.id, label: e.name, planned: Number(e.approved_budget), actual: Number(e.total_expenses) }));

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 print:grid-cols-3 print:gap-3">
        <ChartCard
          className="lg:col-span-2 print:col-span-2"
          title={t("rpSpendTrendTitle")}
          desc={t("rpSpendTrendDesc")}
          right={<MetricTabs value={metric} onChange={setMetric} options={metrics.map((m) => ({ key: m.key, label: m.label }))} />}
        >
          <TrendBody t={t} trend={data?.trend} prev={previous?.trend} metric={active.key} label={active.label} format={active.format} integer={active.integer} />
        </ChartCard>
        <ChartCard title={t("rpGaugeBudgetTitle")} desc={t("rpGaugeBudgetDesc")} delay={90}>
          <GaugeChart
            icon={<Wallet className="h-4 w-4" />}
            value={used}
            color={used > 100 ? CHART_COLORS[3] : used >= 85 ? CHART_COLORS[1] : CHART_COLORS[0]}
            centerLabel={t("rpUsedLabel")}
            left={{ label: t("rpSpentShort"), value: Number(sum.total_expenses ?? 0), color: used > 100 ? CHART_COLORS[3] : CHART_COLORS[0], format: money, decimals: 2 }}
            right={{ label: t("rpRemainingShort"), value: Number(sum.total_remaining ?? 0), color: CHART_PREVIOUS, format: money, decimals: 2 }}
          />
        </ChartCard>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 print:grid-cols-3 print:gap-3">
        <ChartCard title={t("rpBudgetStatusTitle")} desc={t("rpBudgetStatusDesc")} delay={160}>
          <SegmentDonut
            segments={[
              { label: t("rptBSWithin"), value: counts.within, color: CHART_COLORS[0] },
              { label: t("rptBSNear"), value: counts.near, color: CHART_COLORS[1] },
              { label: t("rptBSOver"), value: counts.over, color: CHART_COLORS[3] },
            ]}
            centerLabel={t("rpEventsCenter")}
          />
        </ChartCard>
        {rows.length > 0 && (
          <ChartCard className="lg:col-span-2 print:col-span-2" title={t("rpApprovedVsSpentTitle")} desc={t("rpApprovedVsSpentDesc")} delay={230}>
            <PairedBars rows={rows} format={money} plannedLabel={t("rpApprovedShort")} actualLabel={t("rpSpentShort")} overLabel={t("rpOverByShort")} onSelect={onOpenEvent ? (i) => onOpenEvent(rows[i].id, "budget") : undefined} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}

// ── Membership ──────────────────────────────────────────────────────────────

export function MembershipCharts({ t, data, className }: { t: T; data: any; className: string }) {
  const [dim, setDim] = useState("age");
  const list: any[] = [...(data?.per_membership ?? [])].sort((a, b) => b.member_count - a.member_count);
  if (list.length === 0) return null;

  // Part-to-whole: each program's share of all enrollments (top 5 + the rest).
  const top = list.slice(0, 5);
  const rest = list.slice(5).reduce((a, m) => a + Number(m.member_count), 0);
  const segments = [
    ...top.map((m, i) => ({ label: m.name, value: Number(m.member_count), color: CHART_SOFT_DEEP[i % CHART_SOFT_DEEP.length] })),
    ...(rest > 0 ? [{ label: t("rpOthersLabel"), value: rest, color: CHART_SOFT_NEUTRAL }] : []),
  ];

  // Who the programs are open to: enrollments grouped by one eligibility rule.
  const dims = [
    { key: "age", label: t("rpAudAge"), field: "eligible_age_bracket" },
    { key: "gender", label: t("rpAudGender"), field: "eligible_gender" },
    { key: "civil", label: t("rpAudCivil"), field: "eligible_civil_status" },
    { key: "status", label: t("rpAudStatus"), field: "eligible_current_status" },
  ];
  const active = dims.find((d) => d.key === dim) ?? dims[0];
  const grouped = new Map<string, number>();
  list.forEach((m) => {
    const key = String(m[active.field] ?? "").trim() || t("rpOpenToAll");
    grouped.set(key, (grouped.get(key) ?? 0) + Number(m.member_count));
  });
  const rows = [...grouped.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  return (
    <div className={`grid gap-4 grid-cols-1 lg:grid-cols-2 print:grid-cols-2 print:gap-3 ${className}`}>
      <ChartCard title={t("rpEnrollTitle")} desc={t("rpEnrollDesc")}>
        <SegmentDonut segments={segments} centerLabel={t("membersLabel")} />
      </ChartCard>
      <ChartCard
        title={t("rpAudienceTitle")}
        desc={t("rpAudienceDesc")}
        delay={90}
        right={<MetricTabs value={dim} onChange={setDim} options={dims.map((d) => ({ key: d.key, label: d.label }))} />}
      >
        <RankedBars key={dim} rows={rows} color={CHART_SOFT_DEEP[0]} emptyText={t("uiNoDataForFilters")} />
      </ChartCard>
    </div>
  );
}

// ── Inventory ───────────────────────────────────────────────────────────────

const CONDITION_COLORS: Record<string, string> = {
  New: "#35a597", Good: "#3987e5", Fair: "#b98a22", Poor: "#d9654f", Disposed: CHART_PREVIOUS, Lost: "#9085e9",
};

export function InventoryCharts({ t, data, conditionLabel, className }: { t: T; data: any; conditionLabel: (c: string) => string; className: string }) {
  const byCondition: any[] = data?.by_condition ?? [];
  const items: any[] = data?.items ?? [];

  // Usable = New / Good / Fair; everything else needs attention.
  const usable = byCondition.filter((c) => ["New", "Good", "Fair"].includes(c.condition)).reduce((a, c) => a + Number(c.quantity), 0);
  const all = byCondition.reduce((a, c) => a + Number(c.quantity), 0);
  const pct = all > 0 ? Math.round((usable / all) * 1000) / 10 : 0;

  // Units per storage location (largest first; the tail is folded into one corner).
  const byLoc = new Map<string, number>();
  items.forEach((i) => {
    const k = (i.storage_location || "").trim() || t("rpNoLocation");
    byLoc.set(k, (byLoc.get(k) ?? 0) + Number(i.quantity));
  });
  const locs = [...byLoc.entries()].sort((a, b) => b[1] - a[1]);
  const axes = locs.slice(0, 7).map(([label, value]) => ({ label, value }));
  const rest = locs.slice(7).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) axes.push({ label: t("rpOthersLabel"), value: rest });

  return (
    <div className={`grid gap-4 grid-cols-1 lg:grid-cols-3 print:grid-cols-3 print:gap-3 ${className}`}>
      <ChartCard title={t("rpStockHealthTitle")} desc={t("rpStockHealthDesc")}>
        <GaugeChart
          icon={<Boxes className="h-4 w-4" />}
          value={pct}
          color={pct >= 80 ? CHART_COLORS[0] : pct >= 50 ? CHART_COLORS[1] : CHART_COLORS[3]}
          centerLabel={t("rpTotalUnits")}
          left={{ label: t("rpUsableUnits"), value: usable, color: CHART_COLORS[0] }}
          right={{ label: t("rpOtherUnits"), value: Math.max(0, all - usable), color: CHART_COLORS[3] }}
        />
      </ChartCard>
      <ChartCard title={t("rpConditionMixTitle")} desc={t("rpConditionMixDesc")} delay={90}>
        <SegmentDonut
          segments={byCondition.map((c) => ({ label: conditionLabel(c.condition), value: Number(c.quantity), color: CONDITION_COLORS[c.condition] ?? CHART_PREVIOUS }))}
          centerLabel={t("rpTotalUnits")}
        />
      </ChartCard>
      <ChartCard title={t("rpStockByLocationTitle")} desc={t("rpStockByLocationDesc")} delay={180}>
        <RankedBars rows={axes} showShare={false} scaleToMax color={CHART_SOFT_DEEP[0]} emptyText={t("uiNoDataForFilters")} />
      </ChartCard>
    </div>
  );
}
