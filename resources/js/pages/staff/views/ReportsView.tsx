import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Filter, Printer, Download, FileText, FileType, TrendingUp, Users, CalendarDays, CalendarCheck, Star, Award, Wallet, Package } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { BarChart, DonutChart } from "../../../components/ui/Charts";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import StatusModal from "../../../components/ui/StatusModal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useLanguage } from "../../../i18n/LanguageContext";
import { translate } from "../../../i18n/translations";

interface Membership {
  id: string | number;
  name: string;
}

interface EventOption {
  id: string | number;
  title?: string;
  name?: string;
}

interface ReportsViewProps {
  memberships?: Membership[];
  // Budget tab: lets staff pin the report to one specific event instead of
  // a date range -- Staff.tsx's already-loaded event list, so this doesn't
  // need its own fetch. Items come from the events data source, which
  // calls the field "title" rather than "name" -- accept either.
  events?: EventOption[];
}

const AGE_GROUPS = [
  { key: "", labelKey: "ageAll" },
  { key: "child", labelKey: "ageChild" },
  { key: "youth", labelKey: "ageYouth" },
  { key: "adult", labelKey: "ageAdult" },
  { key: "senior", labelKey: "ageSenior" },
];

const CONDITIONS = ["New", "Good", "Fair", "Poor", "Disposed", "Lost"];

// Attendance and Budget default to the current calendar month instead of
// "All dates" -- as the barangay's history grows, "All dates" would pull
// every record ever logged into the charts/tables (and, since this is a
// print report, into a many-page printout) the instant the page opens,
// which is both slow and not what someone opening a report is usually
// after. Staff can still get the full history in one click via the date
// picker's own "All dates"/Clear controls -- this only changes the
// starting point, not what's reachable.
function getThisMonthRange(): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toISO(start), to: toISO(end) };
}

type ReportType = "attendance" | "membership" | "budget" | "inventory";

const REPORT_TYPES: { key: ReportType; labelKey: string; icon: any }[] = [
  { key: "attendance", labelKey: "reportTypeAttendance", icon: CalendarDays },
  { key: "membership", labelKey: "reportTypeMembership", icon: Award },
  { key: "budget", labelKey: "reportTypeBudget", icon: Wallet },
  { key: "inventory", labelKey: "reportTypeInventory", icon: Package },
];

// Translation keys for the print-only letterhead's formal report title,
// keyed by report type -- resolved through t() so the printed report
// follows the language switcher like every other screen.
const REPORT_PRINT_TITLE_KEYS: Record<ReportType, string> = {
  attendance: "reportPrintTitleAttendance",
  membership: "reportPrintTitleMembership",
  budget: "reportPrintTitleBudget",
  inventory: "reportPrintTitleInventory",
};

/**
 * Adviser recommendation: "Filtering (First) Data Analytics — Date, Summary
 * — Attendance, Percentage" + "What Events usually happen per year /
 * attendees" + "Profiling (Filter for Age)". Also satisfies UC-10 (Generate
 * Printable Reports) -- Staff chooses a report type (attendance, membership,
 * budget, or inventory) and a date range or event, then prints/saves it.
 *
 * Deliberately built as cards + charts/tables rather than one giant data
 * table -- this is a "read the summary at a glance" screen per report type.
 */
export default function ReportsView({ memberships = [], events = [] }: ReportsViewProps) {
  const { t: tUI, language } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>("attendance");

  // Attendance-tab filters -- date range defaults to "this month" (see
  // getThisMonthRange above), shared with the Budget tab's date range too.
  const [dateFrom, setDateFrom] = useState(() => getThisMonthRange().from);
  const [dateTo, setDateTo] = useState(() => getThisMonthRange().to);
  const [membershipId, setMembershipId] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  // Budget-tab filter -- narrows to one event instead of the date range
  const [eventId, setEventId] = useState("");
  // Inventory-tab filter
  const [conditionFilter, setConditionFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  // Whether the browser is actively printing this page (set from the
  // beforeprint/afterprint events below, which fire no matter how printing
  // was triggered -- our own Print button, the browser's own Print menu
  // item, or Ctrl+P). While true, every t() call in this component resolves
  // through the English dictionary instead of the on-screen language, so
  // the printed/exported report always reads in English regardless of
  // what a staff member currently has the language switcher set to -- the
  // Dashboard and every other screen are unaffected and keep translating
  // normally, since none of them touch isPrinting or this t() override.
  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setIsPrinting(true));
    const after = () => flushSync(() => setIsPrinting(false));
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const t = useMemo(
    () => (isPrinting ? (key: string) => translate(key, "en") : tUI),
    [isPrinting, tUI]
  );

  // Shared with fetchReport() below and with handleDownload() (Word/PDF
  // export) further down -- one source of truth for "what filters are
  // currently active for this report type" instead of two copies drifting
  // apart.
  const buildFilterParams = (): Record<string, string> => {
    if (reportType === "attendance") {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (membershipId) params.membership_id = membershipId;
      if (ageGroup) params.age_group = ageGroup;
      return params;
    }
    if (reportType === "membership") {
      const params: Record<string, string> = {};
      if (membershipId) params.membership_id = membershipId;
      return params;
    }
    if (reportType === "budget") {
      const params: Record<string, string> = {};
      if (eventId) {
        params.event_id = eventId;
      } else {
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      }
      return params;
    }
    const params: Record<string, string> = {};
    if (conditionFilter) params.condition = conditionFilter;
    return params;
  };

  const REPORT_ENDPOINTS: Record<ReportType, string> = {
    attendance: "/reports/attendance-summary",
    membership: "/reports/membership-summary",
    budget: "/reports/budget-summary",
    inventory: "/reports/inventory-summary",
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(REPORT_ENDPOINTS[reportType], { params: buildFilterParams() });
      setData(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, tUI("loadReportFailed")));
    } finally {
      setLoading(false);
    }
  };

  // ── Word / PDF download (icon button + dropdown, confirmed before it
  // fires) ────────────────────────────────────────────────────────────────
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const downloadPanelRef = useRef<HTMLDivElement>(null);
  const [downloadPanelPos, setDownloadPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmDownloadFormat, setConfirmDownloadFormat] = useState<"pdf" | "word" | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Success confirmation shown after the file actually reaches the browser's
  // download handling -- mirrors Budget's confirm-before/success-after
  // pattern for Add/Update/Delete Expense (ConfirmDialog, then a success
  // StatusModal), so "are you sure" here is followed by the same kind of
  // "it worked" acknowledgement instead of the button just going quiet.
  const [downloadSuccessFormat, setDownloadSuccessFormat] = useState<"pdf" | "word" | null>(null);

  // Positioned the same way FilterDropdown/DatePicker/SearchableSelect are
  // -- portaled to document.body with `position: fixed` computed from the
  // trigger's own getBoundingClientRect, instead of a plain `absolute`
  // panel that a scrollable ancestor could clip.
  useLayoutEffect(() => {
    if (!downloadMenuOpen || !downloadBtnRef.current) return;
    const recompute = () => {
      if (!downloadBtnRef.current) return;
      const rect = downloadBtnRef.current.getBoundingClientRect();
      const margin = 8;
      const panelWidth = 224;
      let left = rect.right - panelWidth;
      if (left < margin) left = margin;
      if (left + panelWidth + margin > window.innerWidth) left = window.innerWidth - margin - panelWidth;
      setDownloadPanelPos({ top: rect.bottom + 8, left });
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [downloadMenuOpen]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        downloadBtnRef.current && !downloadBtnRef.current.contains(target) &&
        downloadPanelRef.current && !downloadPanelRef.current.contains(target)
      ) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [downloadMenuOpen]);

  const handleDownload = async (format: "pdf" | "word") => {
    setConfirmDownloadFormat(null);
    setDownloading(true);
    try {
      const params = { ...buildFilterParams(), type: reportType };
      const response = await api.get(`/reports/export/${format}`, { params, responseType: "blob" });
      const mime = format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reportType}-report.${format === "pdf" ? "pdf" : "docx"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      // The blob request resolving and the browser accepting the triggered
      // <a download> click is as much confirmation of a successful download
      // as JavaScript ever gets (browsers don't expose a "file finished
      // saving to disk" event to the page) -- reaching this line without the
      // catch below firing means it went through, so surface that the same
      // way Budget confirms a successful Add/Update/Delete Expense.
      setDownloadSuccessFormat(format);
    } catch {
      setError(tUI("downloadFailedMessage"));
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateFrom, dateTo, membershipId, ageGroup, eventId, conditionFilter]);

  // Switching report type: previous type's data shouldn't flash while the
  // new type loads, and a stale membership filter from the Attendance tab
  // shouldn't silently narrow the Membership tab.
  const handleReportTypeChange = (next: ReportType) => {
    setData(null);
    setReportType(next);
  };

  // ── Attendance ────────────────────────────────────────────────────────────
  const summary = data?.summary ?? {
    total_events: 0,
    total_eligible: 0,
    total_attended: 0,
    attendance_percentage: 0,
    average_feedback_rating: null,
  };

  const perMonthChartData = useMemo(
    () => (reportType === "attendance" ? (data?.per_month ?? []).map((m: any) => ({ label: m.month, value: m.events })) : []),
    [data, reportType]
  );

  const ageChartData = useMemo(
    () => (reportType === "attendance" ? (data?.age_breakdown ?? []).map((a: any) => ({ label: a.group, value: a.attended })) : []),
    [data, reportType]
  );

  const perEvent = reportType === "attendance" ? (data?.per_event ?? []) : [];

  // ── Membership ─────────────────────────────────────────────────────────────
  const membershipSummary = data?.summary ?? { total_memberships: 0, total_assignments: 0 };
  const perMembership = reportType === "membership" ? (data?.per_membership ?? []) : [];

  // ── Budget ──────────────────────────────────────────────────────────────────
  const budgetSummary = data?.summary ?? {
    total_events: 0,
    total_approved_budget: 0,
    total_expenses: 0,
    total_remaining: 0,
    events_over_budget: 0,
  };
  const budgetPerEvent = reportType === "budget" ? (data?.per_event ?? []) : [];
  const topExpenses = reportType === "budget" ? (data?.top_expenses ?? []) : [];

  // ── Inventory ───────────────────────────────────────────────────────────────
  const inventorySummary = data?.summary ?? { total_items: 0, total_quantity: 0 };
  const byCondition = reportType === "inventory" ? (data?.by_condition ?? []) : [];
  const inventoryItems = reportType === "inventory" ? (data?.items ?? []) : [];

  // Same mapping as InventoryView's CONDITION_STYLES -- reused as-is so the
  // condition badges look identical between the two pages.
  const conditionColor: Record<string, string> = {
    New: "bg-[#4FBEB0]/20 text-[#7DD8CB] print:bg-teal-50 print:text-teal-700",
    Good: "bg-[#4FBEB0]/10 text-[#7DD8CB] print:bg-emerald-50 print:text-emerald-700",
    Fair: "bg-gold-400/15 text-gold-300 print:bg-amber-50 print:text-amber-700",
    Poor: "bg-[#8A3D2C]/25 text-[#E2A088] print:bg-orange-50 print:text-orange-700",
    Disposed: "bg-white/10 text-white/45 print:bg-gray-100 print:text-gray-500",
    Lost: "bg-red-500/15 text-red-400 print:bg-red-50 print:text-red-600",
  };

  const isEmpty =
    (reportType === "attendance" && !loading && perEvent.length === 0) ||
    (reportType === "membership" && !loading && perMembership.length === 0) ||
    (reportType === "budget" && !loading && budgetPerEvent.length === 0) ||
    (reportType === "inventory" && !loading && inventoryItems.length === 0);

  // ── Print-only letterhead ─────────────────────────────────────────────────
  // A one-line "as of" summary of whatever filter is active for the current
  // report type, shown under the official address block on the printed page
  // so a printed copy is self-describing without the on-screen filter bar.
  const printFilterSummary = useMemo(() => {
    if (reportType === "budget" && eventId) {
      const ev = events.find((x) => String(x.id) === eventId);
      return ev ? `${t("eventColumnLabel")}: ${ev.title || ev.name}` : `${t("printPeriodLabel")}: ${t("allDatesLabel")}`;
    }
    if (reportType === "attendance" || reportType === "budget") {
      return dateFrom || dateTo
        ? `${t("printPeriodLabel")}: ${dateFrom || t("printRangeStartLabel")} – ${dateTo || t("printRangePresentLabel")}`
        : `${t("printPeriodLabel")}: ${t("allDatesLabel")}`;
    }
    if (reportType === "membership") {
      const m = memberships.find((x) => String(x.id) === membershipId);
      return m ? `${t("reportTypeMembership")}: ${m.name}` : t("allMembershipsOption");
    }
    return conditionFilter ? `${t("conditionColumn")}: ${conditionFilter}` : t("allConditionsOption");
  }, [reportType, dateFrom, dateTo, membershipId, eventId, conditionFilter, memberships, events, t]);

  // Filipino/Cebuano don't have widely-supported browser locale data for
  // month names, so both fall back to "fil-PH" (Filipino) rather than
  // "en-PH" -- close enough for a printed date, and still distinct from
  // English when the browser does have it. Forced to "en-PH" while actually
  // printing, same reasoning as the `t` override above.
  const dateLocale = isPrinting || language === "en" ? "en-PH" : "fil-PH";
  const printedOn = new Date().toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });

  // The native "Page X of Y" footer (app.css's @page rule) is plain CSS,
  // outside React's render tree -- it can't call t() directly. Instead it
  // reads two CSS custom properties, which this keeps in sync with the
  // current language (or forced English while printing, via the `t`
  // override above) so the physical page footer matches. useLayoutEffect
  // (not useEffect) so this is guaranteed to run inside the same
  // synchronous flush the beforeprint handler forces above -- a plain
  // useEffect here could still be pending when the browser captures the
  // print snapshot, leaving the footer one state behind.
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--print-page-word", JSON.stringify(t("printPageWord")));
    root.setProperty("--print-of-word", JSON.stringify(t("printOfWord")));
  }, [t]);

  // window.print() is standard and works the same on phones and tablets as
  // it does on desktop (it opens the OS/browser's own print-or-save-as-PDF
  // sheet) -- but a small number of embedded/older mobile browsers don't
  // implement it at all, and tapping the button would otherwise just do
  // nothing with no feedback. Guard it so those cases surface the same
  // shared error popup every other failure on this page uses, instead of a
  // silently dead button. Uses tUI (not the print-forced t) since this
  // error, when it fires, is shown on screen before any printing happened.
  const handlePrint = () => {
    if (typeof window === "undefined" || typeof window.print !== "function") {
      setError(tUI("printNotSupportedMessage"));
      return;
    }
    try {
      window.print();
    } catch {
      setError(tUI("printNotSupportedMessage"));
    }
  };

  return (
    <>
      <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 print:m-0 print:p-0 print:bg-white print:min-h-0">
        <div className="space-y-6 print:space-y-3">
      {/* Not sticky -- matches every other converted page (Inventory, Budget,
          Returns, Activity Logs, Archive), none of which pin their header
          while scrolling. A sticky header here fought with the full-bleed
          dark page wrapper's own top padding and let content peek through
          above it while scrolling. */}
      <div className="pt-2 pb-4 px-1">
        {/* Official letterhead -- print only (hidden on screen). Makes a
            printed report a self-contained barangay hall record: full
            Republic/Province/Municipality/Barangay address block, the
            report's formal title, the filter it was generated under, and
            the date it was printed. Seal on the left, same as the
            PDF/Word exports -- a matching empty spacer on the right keeps
            the address block itself truly centered instead of drifting
            right, the same balance an official letterhead keeps between a
            seal and the margin on the other side. */}
        <div className="hidden print:block print:mb-4 border-b-2 border-[#005f63] pb-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-20 shrink-0 flex justify-center">
              <img src="/logo-removebg-preview.png" alt="" className="h-20 w-20 object-contain" />
            </div>
            <div className="flex-1 text-center">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#667777]">{t("printCountryLabel")}</p>
              <p className="text-[10px] text-[#667777]">{t("printProvinceLabel")}</p>
              <p className="text-[10px] text-[#667777]">{t("printMunicipalityLabel")}</p>
              <p className="mt-1 text-xl font-black uppercase tracking-wide text-[#005f63]">{t("printBarangayLabel")}</p>
              <p className="mt-0.5 text-[10px] text-[#667777]">{t("printAddressLabel")}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4FBEB0]">{t("printSystemName")}</p>
            </div>
            <div className="w-20 shrink-0" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-black uppercase tracking-wide text-[#005f63] text-center">{t(REPORT_PRINT_TITLE_KEYS[reportType])}</h2>
          <p className="mt-0.5 text-[11px] text-[#667777] text-center">{printFilterSummary}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* On-screen page title only -- the letterhead above already
              carries the report's own formal title for print, so this
              stays hidden on the printed page instead of duplicating it. */}
          <div className="print:hidden">
            <h1 className="text-2xl sm:text-4xl font-black text-white">{t("reports")}</h1>
            <p className="mt-1 text-sm text-white/50">{t("reportsSubtitle")}</p>
          </div>
          <div className="print:hidden flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 bg-gold-400 hover:bg-gold-300 text-[#08130F] px-5 py-2.5 rounded-full font-medium transition shadow-sm active:scale-95"
            >
              <Printer className="h-4 w-4" /> {tUI("printReport")}
            </button>

            {/* Download icon button -- no dropdown-indicator arrow on the
                button itself, and no caret/pointer on the open panel either;
                just the icon and, on click, a plain rectangular menu, same
                visual language as FilterDropdown/SearchableSelect's own
                portaled panels elsewhere on this page. */}
            <button
              ref={downloadBtnRef}
              type="button"
              onClick={() => setDownloadMenuOpen((v) => !v)}
              disabled={loading || isEmpty}
              title={tUI("downloadReportLabel")}
              aria-label={tUI("downloadReportLabel")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4.5 w-4.5" />
            </button>
            {downloadMenuOpen && downloadPanelPos && createPortal(
              <div
                ref={downloadPanelRef}
                style={{ position: "fixed", top: downloadPanelPos.top, left: downloadPanelPos.left }}
                className="z-[9999] w-56 rounded-2xl border border-white/10 bg-[#0A0E1A] shadow-2xl py-1.5"
              >
                <button
                  type="button"
                  onClick={() => { setDownloadMenuOpen(false); setConfirmDownloadFormat("word"); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
                >
                  <FileText className="h-4 w-4 text-[#7DD8CB]" /> {tUI("downloadAsWordLabel")}
                </button>
                <button
                  type="button"
                  onClick={() => { setDownloadMenuOpen(false); setConfirmDownloadFormat("pdf"); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
                >
                  <FileType className="h-4 w-4 text-[#E2A088]" /> {tUI("downloadAsPdfLabel")}
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>

        {/* Step 1 per UC-10: choose a report type */}
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.key}
              onClick={() => handleReportTypeChange(rt.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                reportType === rt.key
                  ? "bg-gold-400 text-[#08130F] shadow-sm"
                  : "border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
              }`}
            >
              <rt.icon className="h-4 w-4" /> {t(rt.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/40 print:hidden">
          {REPORT_TYPES.find((r) => r.key === reportType) && t(REPORT_TYPES.find((r) => r.key === reportType)!.labelKey)} {t("reportForLabel")}
        </p>

        {/* Step 2 per UC-10: date range / event / other filters, contextual to the report type */}
        <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-3 print:hidden">
          {reportType === "attendance" && (
            <>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
                fromLabel={t("fromLabel")}
                toLabel={t("toLabel")}
                allDatesLabel={t("allDatesLabel")}
                todayLabel={t("todayLabel")}
                thisWeekLabel={t("dateRangeThisWeek")}
                thisMonthLabel={t("thisMonthLabel")}
                thisYearLabel={t("thisYearLabel")}
                clearLabel={t("clearLabel")}
                applyLabel={t("applyLabel")}
                dark
              />
              <FilterDropdown
                value={membershipId}
                onChange={setMembershipId}
                options={[
                  { value: "", label: t("allMembershipsOption") },
                  ...memberships.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: String(m.id), label: m.name })),
                ]}
                className="h-11 min-w-[220px] pl-9 pr-6"
                panelWidthPx={280}
                icon={<Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
                searchable
                searchPlaceholder={t("search")}
                noResultsLabel={t("noMatchesFoundLabel")}
              />
              <FilterDropdown
                value={ageGroup}
                onChange={setAgeGroup}
                options={AGE_GROUPS.map((g) => ({ value: g.key, label: t(g.labelKey) }))}
                className="h-11 pl-9 pr-6"
                icon={<Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
              />
            </>
          )}

          {reportType === "membership" && (
            <FilterDropdown
              value={membershipId}
              onChange={setMembershipId}
              options={[
                { value: "", label: t("allMembershipsOption") },
                ...memberships.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: String(m.id), label: m.name })),
              ]}
              className="h-11 min-w-[220px] pl-9 pr-6"
              panelWidthPx={280}
              icon={<Award className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
              dark
              searchable
              searchPlaceholder={t("search")}
              noResultsLabel={t("noMatchesFoundLabel")}
            />
          )}

          {reportType === "budget" && (
            <>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
                fromLabel={t("fromLabel")}
                toLabel={t("toLabel")}
                allDatesLabel={t("allDatesLabel")}
                todayLabel={t("todayLabel")}
                thisWeekLabel={t("dateRangeThisWeek")}
                thisMonthLabel={t("thisMonthLabel")}
                thisYearLabel={t("thisYearLabel")}
                clearLabel={t("clearLabel")}
                applyLabel={t("applyLabel")}
                dark
              />
              {/* Picking one event answers a different question than a date
                  range, so this takes priority over it (see fetchReport) --
                  left both controls visible rather than hiding the date
                  range, so switching back to "All Events" is a one-click undo. */}
              <FilterDropdown
                value={eventId}
                onChange={setEventId}
                options={[
                  { value: "", label: t("allEvents") },
                  ...events
                    .slice()
                    .sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""))
                    .map((ev) => ({ value: String(ev.id), label: ev.title || ev.name || "" })),
                ]}
                className="h-11 min-w-[220px] pl-9 pr-6"
                panelWidthPx={280}
                icon={<CalendarCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
                searchable
                searchPlaceholder={t("search")}
                noResultsLabel={t("noMatchesFoundLabel")}
              />
            </>
          )}

          {reportType === "inventory" && (
            <FilterDropdown
              value={conditionFilter}
              onChange={setConditionFilter}
              options={[
                { value: "", label: t("allConditionsOption") },
                ...CONDITIONS.map((c) => ({ value: c, label: c })),
              ]}
              className="h-11 pl-9 pr-6"
              icon={<Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
              dark
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4FBEB0]"></div>
        </div>
      ) : isEmpty ? (
        // UC-10 extension 4a: no records exist for the selected type/range
        <div className="print:break-inside-avoid rounded-[30px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-white/40 italic print:border-gray-200 print:bg-white print:text-gray-400">
          {t("noDataAvailableForReport")}
        </div>
      ) : reportType === "attendance" ? (
        <>
          <div className="print:break-inside-avoid grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_events}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsInRange")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_attended}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRecordsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.attendance_percentage}%</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRateLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.average_feedback_rating ?? "—"}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("avgFeedbackRating")}</p>
            </div>
          </div>

          <div className="print:break-inside-avoid grid gap-4 lg:grid-cols-3">
            <div className="print:break-inside-avoid lg:col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("eventsPerMonth")}</h3>
              <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("eventsPerMonthDesc")}</p>
              <BarChart data={perMonthChartData} color="#4FBEB0" dark />
            </div>
            <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 flex flex-col items-center justify-center print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white self-start mb-2 print:text-[#005f63]">{t("overallAttendance")}</h3>
              <DonutChart percentage={summary.attendance_percentage} color="#4FBEB0" label={`${summary.total_attended} ${t("ofLabel")} ${summary.total_eligible} ${t("ofEligibleResidents")}`} dark />
            </div>
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("attendanceByAgeGroup")}</h3>
            <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("adviserProfilingNote")}</p>
            <BarChart data={ageChartData} color="#E8B84A" dark />
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("perEventBreakdown")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perEvent.map((ev: any) => (
                <div key={ev.id} className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
                  <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{ev.name}</p>
                  <p className="text-xs text-white/40 mt-0.5 print:text-gray-500">{ev.date}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden print:bg-gray-200">
                      <div className="h-full bg-[#4FBEB0]" style={{ width: `${ev.percentage}%` }} />
                    </div>
                    <span className="text-xs font-bold text-white shrink-0 print:text-[#005f63]">{ev.percentage}%</span>
                  </div>
                  <p className="text-[11px] text-white/40 mt-1 print:text-gray-500">{ev.attended} / {ev.eligible} {t("attendedOfEligible")}</p>
                  {ev.approved_budget !== null && (
                    <p className="text-[11px] text-white/40 mt-1 print:text-gray-500">
                      {t("budgetColon")} ₱{Number(ev.approved_budget).toLocaleString()} · {t("spentColon")} ₱{Number(ev.total_expenses).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : reportType === "membership" ? (
        <>
          <div className="print:break-inside-avoid grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Award className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_memberships}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalMembershipsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_assignments}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalEnrolledResidentsLabel")}</p>
            </div>
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("enrollmentByMembershipLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perMembership.map((m: any) => (
                <div key={m.id} className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
                  <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{m.name}</p>
                  <p className="mt-1 text-2xl font-black text-white print:text-gray-800">{m.member_count}</p>
                  <p className="text-[11px] text-white/40 print:text-gray-500">{t("membersLabel")}</p>
                  {(m.eligible_age_bracket || m.eligible_civil_status || m.eligible_gender) && (
                    <p className="mt-2 text-[11px] text-[#7DD8CB] bg-[#4FBEB0]/15 border border-[#4FBEB0]/30 rounded-full px-2.5 py-1 inline-block print:text-teal-700 print:bg-teal-50 print:border-teal-200">
                      {t("requiresLabelShort")} {[m.eligible_age_bracket, m.eligible_civil_status, m.eligible_gender].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : reportType === "budget" ? (
        <>
          <div className="print:break-inside-avoid grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Wallet className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_approved_budget).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalApprovedBudgetLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_expenses).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalSpentLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_remaining).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("remainingBudgetLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{budgetSummary.events_over_budget}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsOverBudgetLabel")}</p>
            </div>
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("budgetPerEventLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {budgetPerEvent.map((ev: any) => (
                <div key={ev.id} className={`print:break-inside-avoid rounded-2xl border p-4 ${ev.is_over_budget ? "border-red-500/25 bg-red-500/10 print:border-red-200 print:bg-red-50" : "border-white/10 bg-white/[0.04] print:border-gray-100 print:bg-gray-50"}`}>
                  <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{ev.name}</p>
                  <p className="text-xs text-white/40 mt-0.5 print:text-gray-500">{ev.date}</p>
                  <p className="text-[11px] text-white/50 mt-2 print:text-gray-600">{t("budgetColon")} ₱{Number(ev.approved_budget).toLocaleString()}</p>
                  <p className="text-[11px] text-white/50 print:text-gray-600">{t("spentColon")} ₱{Number(ev.total_expenses).toLocaleString()}</p>
                  <p className={`text-[11px] font-semibold mt-1 ${ev.is_over_budget ? "text-red-400 print:text-red-600" : "text-[#7DD8CB] print:text-teal-700"}`}>
                    {ev.is_over_budget ? t("overBudgetByLabel") : t("remainingLabel")} ₱{Number(Math.abs(ev.remaining)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {topExpenses.length > 0 && (
            <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("topExpensesLabel")}</h3>
              <div className="space-y-2">
                {topExpenses.map((ex: any, i: number) => (
                  <div key={i} className="print:break-inside-avoid flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-sm print:bg-gray-50 print:border-gray-100">
                    <div>
                      <p className="font-semibold text-white print:text-gray-800">{ex.item}</p>
                      <p className="text-xs text-white/40 print:text-gray-500">{ex.event_name}</p>
                    </div>
                    <span className="font-bold text-gold-300 print:text-[#005f63]">₱{Number(ex.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="print:break-inside-avoid grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Package className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_items}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalInventoryItemsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_quantity}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalQuantityLabel")}</p>
            </div>
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("byConditionLabel")}</h3>
            <div className="flex flex-wrap gap-2">
              {byCondition.map((c: any) => (
                <span key={c.condition} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${conditionColor[c.condition] ?? "bg-white/10 text-white/60 print:bg-gray-100 print:text-gray-600"}`}>
                  {c.condition}: {c.count} {t("itemsLabel")} ({c.quantity} {t("unitsLabel")})
                </span>
              ))}
            </div>
          </div>

          <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("inventoryItemsLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inventoryItems.map((item: any) => (
                <div key={item.id} className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
                  <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{item.name}</p>
                  <p className="text-xs text-white/40 mt-0.5 print:text-gray-500">{item.storage_location || "—"}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${conditionColor[item.condition] ?? "bg-white/10 text-white/60 print:bg-gray-100 print:text-gray-600"}`}>
                      {item.condition}
                    </span>
                    <span className="text-sm font-bold text-white print:text-gray-800">×{item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Certification footer -- print only. Standard "prepared by / noted
          by" signature lines so the printed report can double as a signed
          barangay hall record, plus a system attribution/print-date line. */}
      <div className="hidden print:block print:mt-6 pt-4 border-t border-[#ddd5ca]">
        <div className="flex justify-between gap-16 px-6">
          <div className="flex-1 text-center">
            <div className="mt-8 border-t border-[#667777] pt-1 text-[11px] text-[#333]">{t("printPreparedByLabel")}</div>
          </div>
          <div className="flex-1 text-center">
            <div className="mt-8 border-t border-[#667777] pt-1 text-[11px] text-[#333]">{t("printBarangayCaptainLabel")}</div>
          </div>
        </div>
        <p className="mt-6 text-center text-[9px] text-[#999]">{t("printFooterAttributionLabel")} · {printedOn}</p>
      </div>
        </div>
      </div>

      {/* Error alert -- the shared StatusModal, same convention as every
          other page's success/warning/error popups. Uses tUI, not the
          print-forced t, since this is on-screen UI chrome. */}
      <StatusModal open={!!error} type="error" title={tUI("errorTitle")} message={error || ""} okLabel={tUI("okLabel")} onClose={() => setError(null)} />

      {/* "Are you sure you want to download?" -- required before either
          Word or PDF actually fires, same confirm-then-act pattern used for
          destructive/generating actions everywhere else in the app. */}
      <ConfirmDialog
        open={confirmDownloadFormat !== null}
        icon={<Download className="h-9 w-9" />}
        title={tUI("confirmDownloadTitle")}
        body={confirmDownloadFormat === "word" ? tUI("confirmDownloadWordBody") : tUI("confirmDownloadPdfBody")}
        cancelLabel={tUI("cancelLabel")}
        confirmLabel={downloading ? tUI("downloadingLabel") : tUI("downloadLabel")}
        onCancel={() => setConfirmDownloadFormat(null)}
        onConfirm={() => confirmDownloadFormat && handleDownload(confirmDownloadFormat)}
        dark
      />

      {/* "Downloaded successfully" -- confirms the file actually reached the
          browser, same confirm-before/success-after convention as Budget's
          Add/Update/Delete Expense flow (ConfirmDialog, then this success
          StatusModal), instead of the download button going quiet after
          it's clicked. */}
      <StatusModal
        open={downloadSuccessFormat !== null}
        type="success"
        title={tUI("downloadSuccessTitle")}
        message={downloadSuccessFormat === "word" ? tUI("downloadSuccessWordMessage") : tUI("downloadSuccessPdfMessage")}
        okLabel={tUI("okLabel")}
        onClose={() => setDownloadSuccessFormat(null)}
      />
    </>
  );
}
