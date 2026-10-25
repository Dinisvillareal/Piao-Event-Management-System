import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import SimplePager from "../../../../components/ui/SimplePager";
import usePager from "../../../../hooks/usePager";
import { CHART_COLORS } from "../../../../components/ui/Charts";
import { useEntered } from "../../../../hooks/useAnimatedValue";

type SortKey = "name" | "date" | "rate" | "spent";

const PAGE_SIZE = 10;

/** Every event on one tidy, sortable table: when, who showed up, and what it cost. Printing shows all rows. */
export default function EventBreakdownTable({
  events,
  t,
  onOpen,
  statusPill,
  peso,
}: {
  events: any[];
  t: (k: string) => string;
  onOpen: (id: number | string) => void;
  statusPill: (status: string) => string;
  peso: (n: any) => string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const entered = useEntered();

  const sorted = useMemo(() => {
    if (!sort) return events;
    const val = (e: any) =>
      sort.key === "name" ? String(e.name ?? "").toLowerCase()
      : sort.key === "date" ? String(e.date ?? "")
      : sort.key === "rate" ? Number(e.percentage) || 0
      : Number(e.total_expenses) || 0;
    const out = [...events].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0));
    return sort.dir === "desc" ? out.reverse() : out;
  }, [events, sort]);

  const pager = usePager(sorted, PAGE_SIZE, 350, `${sort?.key}|${sort?.dir}|${events.length}`);
  const visible = new Set(pager.shown.map((e) => e.id));

  const toggle = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: key === "name" || key === "date" ? "asc" : "desc" } : s.dir === (key === "name" || key === "date" ? "asc" : "desc") ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : null));

  const th = "px-4 py-3.5 print:px-2 print:py-2 print:text-[10px] text-left text-xs font-semibold uppercase tracking-wide text-white/45 print:text-gray-500";
  const head = (key: SortKey, label: string, className = "") => {
    const on = sort?.key === key;
    const Icon = !on ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`${th} ${className}`} aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggle(key)} className={`inline-flex items-center gap-1.5 uppercase tracking-wide transition hover:text-white print:pointer-events-none ${on ? "text-white" : ""}`}>
          {label}
          <Icon className={`h-3 w-3 print:hidden ${on ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-white/10 print:overflow-hidden print:border-[#ddd5ca]">
        <table className="w-full min-w-[820px] border-collapse text-base print:min-w-0 print:table-fixed print:text-xs">
          <thead className="bg-white/[0.04] print:bg-gray-50">
            <tr>
              {head("name", t("rpColEvent"))}
              {head("date", t("rpColDate"), "print:w-[16%]")}
              <th className={`${th} print:w-[11%]`}>{t("rpColStatus")}</th>
              {head("rate", t("rpColAttendance"), "w-[26%] print:w-[27%]")}
              {head("spent", t("rpColBudget"), "text-right print:w-[17%]")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((ev, i) => {
              const pct = Math.max(0, Math.min(100, Number(ev.percentage) || 0));
              const color = pct >= 75 ? CHART_COLORS[0] : pct >= 40 ? CHART_COLORS[1] : CHART_COLORS[3];
              const hasBudget = ev.approved_budget !== null && ev.approved_budget !== undefined;
              return (
                <tr
                  key={ev.id}
                  className={`border-t border-white/10 align-middle transition hover:bg-white/[0.04] print:break-inside-avoid print:border-gray-200 print:hover:bg-transparent ${visible.has(ev.id) ? "" : "hidden print:table-row"}`}
                >
                  <td className="max-w-[280px] px-4 py-4 print:max-w-none print:overflow-hidden print:px-2 print:py-2">
                    <button type="button" onClick={() => onOpen(ev.id)} title={t("rpOpenEvent")} className="block max-w-full truncate text-left text-base font-bold text-white transition hover:text-[#7DD8CB] hover:underline print:text-[#005f63] print:no-underline">
                      {ev.name}
                    </button>
                    {ev.location && <span className="mt-0.5 block truncate text-[13px] text-white/40 print:text-gray-500">{ev.location}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-white/80 print:px-2 print:py-2 print:text-[11px] print:text-gray-700">
                    {ev.date}
                    {ev.start_time && <span className="mt-0.5 block text-[13px] text-white/40 print:text-gray-500">{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ""}</span>}
                  </td>
                  <td className="px-4 py-4 print:px-2 print:py-2">
                    {ev.status && <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusPill(ev.status)}`}>{t(`rptStatus${ev.status}`)}</span>}
                  </td>
                  <td className="px-4 py-4 print:px-2 print:py-2">
                    <div className="flex items-center gap-3.5 print:gap-1.5">
                      <div className="h-2.5 w-28 shrink-0 print:h-2 print:w-12 overflow-hidden rounded-full bg-white/10 print:bg-gray-200">
                        <div
                          className="h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] print:transition-none"
                          style={{ width: entered ? `${pct}%` : "0%", background: color, transitionDelay: `${Math.min(i, 10) * 40}ms` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-base print:w-9 print:text-[11px] font-bold tabular-nums text-white print:text-gray-800">{ev.percentage}%</span>
                      <span className="whitespace-nowrap text-sm print:text-[10px] tabular-nums text-white/45 print:text-gray-500">{ev.attended} / {ev.eligible}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums print:px-2 print:py-2 print:text-[11px]">
                    {hasBudget ? (
                      <>
                        <span className="block font-bold text-white print:text-gray-800">{peso(ev.total_expenses)}</span>
                        <span className="mt-0.5 block text-[13px] text-white/40 print:text-gray-500">{t("rpOfBudget")} {peso(ev.approved_budget)}</span>
                      </>
                    ) : (
                      <span className="text-white/30 print:text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SimplePager className="mt-4 print:hidden" page={pager.page} totalPages={pager.totalPages} onChange={pager.go} loading={pager.switching} />
    </div>
  );
}
