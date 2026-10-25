import { useCallback, useEffect, useRef, useState } from "react";
import { Award, CalendarDays, FileSpreadsheet, FileText, FileType, History, Package, Printer, RotateCw, Wallet } from "lucide-react";
import api, { apiErrorMessage } from "../../../../lib/api";
import FilterBar from "../../../../components/ui/FilterBar";
import QuickTabs from "../../../../components/ui/QuickTabs";
import SimplePager from "../../../../components/ui/SimplePager";
import Skeleton from "../../../../components/ui/Skeleton";
import { useLanguage } from "../../../../i18n/LanguageContext";
import type { ReportFormat } from "./ReportGenerateDrawer";

export interface HistoryItem {
  id: number;
  type: "attendance" | "membership" | "budget" | "inventory";
  format: ReportFormat;
  title: string;
  scope_label: string | null;
  filters: Record<string, string | number>;
  sections: string[] | null;
  generated_by: string;
  generated_at: string | null;
}

const PAGE_SIZE = 8;

const TYPE_ICON = { attendance: CalendarDays, membership: Award, budget: Wallet, inventory: Package };
const TYPE_TINT: Record<string, string> = {
  attendance: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  membership: "bg-[#E8B84A]/15 text-[#E8B84A]",
  budget: "bg-sky-500/15 text-sky-300",
  inventory: "bg-[#C0705A]/20 text-[#E2A088]",
};
const FORMAT_ICON = { print: Printer, pdf: FileType, word: FileText, csv: FileSpreadsheet };

/** "just now", "5 min ago", "3 hr ago", "2d ago", then a plain date. */
function relativeTime(iso: string | null, t: (k: string) => string, locale: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 45) return t("rpJustNow");
  if (sec < 3600) return t("rpMinAgo").replace("{n}", String(Math.max(1, Math.floor(sec / 60))));
  if (sec < 86400) return t("rpHrAgo").replace("{n}", String(Math.floor(sec / 3600)));
  if (sec < 86400 * 7) return t("rpDayAgo").replace("{n}", String(Math.floor(sec / 86400)));
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Report History -- every report printed or downloaded from the Reports page.
 * "Open" restores the report's filters and sections on the page; "Generate
 * again" opens the Generate Report drawer with that format ready to go.
 */
export default function ReportHistoryPanel({
  refreshKey,
  onOpen,
  onGenerateAgain,
  onError,
}: {
  refreshKey: number;
  onOpen: (item: HistoryItem) => void;
  onGenerateAgain: (item: HistoryItem) => void;
  onError: (message: string) => void;
}) {
  const { t, locale } = useLanguage();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("all");
  const [format, setFormat] = useState("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [, setTick] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  // A new filter starts again from page 1.
  useEffect(() => { setPage(1); }, [debounced, type, format, scope]);

  const load = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setFetching(true);
    try {
      const res = await api.get("/reports/history", {
        params: { page, per_page: PAGE_SIZE, search: debounced || undefined, type, format, mine: scope === "mine" ? 1 : undefined },
      });
      if (id !== reqId.current) return;
      setItems(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
      setLastPage(res.data?.last_page ?? 1);
    } catch (e) {
      if (id === reqId.current && !silent) onError(apiErrorMessage(e, t("rpHistLoadFailed")));
    } finally {
      if (id === reqId.current && !silent) setFetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debounced, type, format, scope]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Quiet background refresh + a tick so "5 min ago" keeps counting.
  useEffect(() => {
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") load(true); }, 15000);
    const tick = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  const typeOptions = [
    { value: "all", label: t("rpHistAllTypes") },
    { value: "attendance", label: t("reportTypeAttendance") },
    { value: "membership", label: t("reportTypeMembership") },
    { value: "budget", label: t("reportTypeBudget") },
    { value: "inventory", label: t("reportTypeInventory") },
  ];
  const formatOptions = [
    { value: "all", label: t("rpHistAllFormats") },
    { value: "print", label: t("rpFmtPrint") },
    { value: "pdf", label: t("rpFmtPdf") },
    { value: "word", label: t("rpFmtWord") },
    { value: "csv", label: t("rpFmtCsv") },
  ];
  const formatLabel = (f: string) => ({ print: t("rpFmtPrint"), pdf: t("rpFmtPdf"), word: t("rpFmtWord"), csv: t("rpFmtCsv") } as Record<string, string>)[f] ?? f;
  const typeLabel = (k: string) => t(`reportType${k.charAt(0).toUpperCase()}${k.slice(1)}`);
  const filtering = debounced !== "" || type !== "all" || format !== "all" || scope !== "all";

  const outlineBtn = "inline-flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-white"><History className="h-5 w-5 text-[#4FBEB0]" />{t("rpHistTitle")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/50">{t("rpHistSub")}</p>
      </div>

      <QuickTabs
        value={scope}
        onChange={(k) => setScope(k as "all" | "mine")}
        tabs={[
          { key: "all", label: t("rpHistEveryone") },
          { key: "mine", label: t("rpHistMine") },
        ]}
      />

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: t("rpHistSearch") }}
        filters={[
          { key: "type", label: t("rpHistType"), value: type, defaultValue: "all", onChange: setType, options: typeOptions },
          { key: "format", label: t("rpHistFormat"), value: format, defaultValue: "all", onChange: setFormat, options: formatOptions },
        ]}
        count={fetching ? undefined : { shown: total }}
      />

      <div className="space-y-3">
        {fetching ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : items.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
            <History className="mx-auto h-9 w-9 text-white/25" />
            <p className="mt-3 text-base font-semibold text-white/70">{filtering ? t("rpHistNoMatch") : t("rpHistEmpty")}</p>
            {!filtering && <p className="mt-1 text-sm text-white/40">{t("rpHistEmptyHint")}</p>}
          </div>
        ) : (
          items.map((it) => {
            const TypeIcon = TYPE_ICON[it.type] ?? CalendarDays;
            const FormatIcon = FORMAT_ICON[it.format] ?? FileText;
            return (
              <div key={it.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:p-5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TYPE_TINT[it.type] ?? TYPE_TINT.attendance}`}>
                  <TypeIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-bold text-white">{typeLabel(it.type)}</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/70">
                      <FormatIcon className="h-3 w-3" /> {formatLabel(it.format)}
                    </span>
                  </div>
                  {it.scope_label && <p className="mt-0.5 truncate text-sm text-white/60">{it.scope_label}</p>}
                  <p className="mt-1 text-xs text-white/40" title={it.generated_at ? new Date(it.generated_at).toLocaleString(locale) : ""}>
                    {t("rpHistBy").replace("{name}", it.generated_by)} · {relativeTime(it.generated_at, t, locale)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onOpen(it)} className={outlineBtn}>{t("rpHistOpen")}</button>
                  <button type="button" onClick={() => onGenerateAgain(it)} className={outlineBtn}><RotateCw className="h-3.5 w-3.5" />{t("rpHistAgain")}</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <SimplePager page={page} totalPages={lastPage} onChange={setPage} loading={fetching && items.length > 0} />
    </div>
  );
}
