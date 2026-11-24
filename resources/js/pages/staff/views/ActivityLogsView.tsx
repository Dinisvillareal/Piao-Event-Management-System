import KpiCard from "../../../components/ui/KpiCard";
import { scrollListIntoView } from "../../../lib/scrollToList";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { highlightMatches } from "../../../lib/highlight";
import {
  Search,
  Filter,
  Activity as ActivityIcon,
  Eye,
  Clock,
  ShieldAlert,
  Calendar,
  User,
  Users,
  Bell,
  QrCode,
  ArrowUpDown,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import StatCardSkeleton, { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";
import DatePicker from "../../../components/ui/DatePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import FilterBar, { type ExtraChip } from "../../../components/ui/FilterBar";
import PagerSkeleton from "../../../components/ui/PagerSkeleton";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import ExportReportDialog, { ExportBox, type ExportColumnOption } from "../../../components/ui/ExportReportDialog";
import api, { apiErrorMessage } from "../../../lib/api";
import { ACTIVITY_EXPORT_COLUMNS, EXCEL_MAX_ROWS, pdfMaxRows, type ActivityExportColumnKey } from "../../../lib/activityLogExport";
import { MIN_EXPORT_COLUMNS } from "../../../lib/tableExport";

type Activity = {
  id: number;
  action: string;
  module: string;
  description: string;
  user_code: string;
  created_at: string;
  type?: "event" | "resident" | "membership" | "notification" | "scan" | "system";
};

const itemsPerPage = 20;

// Columns ticked by default in the export window: everything but the IP address (a security detail, tick it when needed).
const DEFAULT_EXPORT_COLUMNS: ActivityExportColumnKey[] = ACTIVITY_EXPORT_COLUMNS.map((c) => c.key).filter((k) => k !== "ip");

// Dark-palette badge colors per module type -- teal for routine records,
// gold for scans/notifications (worth a glance), rust for auth/system
// events (the ones staff most want to be able to spot at a glance), same
// semantic mapping the light version used, just recolored for the dark
// navy/gold/teal system used everywhere else.
const MODULE_BADGE_STYLES: Record<string, string> = {
  system: "bg-[#8A3D2C]/25 text-[#E2A088] border border-[#8A3D2C]/40",
  scan: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  notification: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  event: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  resident: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  membership: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
};
const DEFAULT_MODULE_BADGE = "bg-white/10 text-white/60 border border-white/15";

// Same palette, applied to each feed item's icon roundel instead of a
// table badge -- keeps type recognizable at a glance in a scannable feed.
const MODULE_ICON_WRAP: Record<string, string> = {
  system: "bg-[#8A3D2C]/25 text-[#E2A088]",
  scan: "bg-gold-400/15 text-gold-300",
  notification: "bg-gold-400/15 text-gold-300",
  event: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  resident: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  membership: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
};
const DEFAULT_ICON_WRAP = "bg-white/10 text-white/60";

const MODULE_ICONS: Record<string, typeof ActivityIcon> = {
  system: ShieldAlert,
  scan: QrCode,
  notification: Bell,
  event: Calendar,
  resident: User,
  membership: Users,
};
const DEFAULT_MODULE_ICON = ActivityIcon;

export default function ActivityLogsView() {
  const { t, locale } = useLanguage();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  // Page-open skeleton for the KPI strip (first load only -- never returns on polls).
  const statsLoading = usePageOpenSkeleton(loading);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  // Anchor at the very top of the page -- scrolled into view on every
  // pagination click so switching pages always lands the user back at the
  // top of the feed instead of leaving them wherever they'd scrolled to
  // on the previous page.
  const topRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLSpanElement | null>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    scrollListIntoView(listTopRef.current);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Real-time refresh -- other staff generate activity constantly, so this
  // polls quietly in the background rather than relying on a manual
  // refresh. `background` skips the loading skeleton so the table doesn't
  // flash/reset scroll position every 20s; it's only shown on first load
  // or when a filter changes.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Export (Excel / PDF): same flow as the Residents Master List. Clicking a button opens an options
  // window (which entries, which columns, optional message), then a confirm, then the download and a
  // success message. The server builds the report from the log itself for the SAME filters as the
  // list, so the file holds every matching entry (not just this page) and never disagrees with the
  // screen. The files are always English, like the other official reports.
  type ExportPeriod = "all" | "today" | "7d" | "30d";
  const [exportDialog, setExportDialog] = useState<"excel" | "pdf" | null>(null);
  const [exportCols, setExportCols] = useState<ActivityExportColumnKey[]>(DEFAULT_EXPORT_COLUMNS);
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>("all");
  const [exportApply, setExportApply] = useState(true);
  const [exportMessage, setExportMessage] = useState(true);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportCount, setExportCount] = useState<number | null>(null);

  const hasScreenFilters = searchQuery.trim() !== "" || filterType !== "all" || selectedDate !== "";
  // A PDF holds fewer entries than an Excel file (limited by rows x columns); say so before downloading, not after.
  const pdfLimit = pdfMaxRows(exportCols.length);
  const pdfTooMany = exportDialog === "pdf" && exportCount !== null && exportCount > pdfLimit;
  const excelTooMany = exportDialog === "excel" && exportCount !== null && exportCount > EXCEL_MAX_ROWS;
  // A day chosen on the screen wins over the quick period (the server does the same).
  const periodLocked = exportApply && selectedDate !== "";

  /** The filters the report is built from: the screen's (when ticked) plus the quick period. */
  const exportParams = () => {
    const params: Record<string, string> = { sort: sortOrder };
    if (exportApply) {
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (filterType !== "all") params.type = filterType;
      if (selectedDate) params.date = selectedDate;
    }
    if (!periodLocked && exportPeriod !== "all") params.period = exportPeriod;
    return params;
  };

  const openExportDialog = (format: "excel" | "pdf") => {
    setExportApply(true);
    setExportPeriod("all");
    setExportMessage(true);
    setExportError("");
    setExportCount(null);
    setExportDialog(format);
  };

  // "N entries" in the window, counted by the server for the chosen options.
  useEffect(() => {
    if (!exportDialog) return;
    let cancelled = false;
    setExportCount(null);
    api
      .get("/activity-logs", { params: { ...exportParams(), page: 1 } })
      .then((res) => {
        if (!cancelled) setExportCount(typeof res.data?.total === "number" ? res.data.total : 0);
      })
      .catch(() => {
        if (!cancelled) setExportCount(0);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportDialog, exportApply, exportPeriod, searchQuery, filterType, selectedDate, sortOrder]);

  /** A failed download comes back as a Blob when a PDF was asked for -- read the server's message out of it. */
  const exportFailureText = async (e: unknown) => {
    const data = (e as any)?.response?.data;
    if (data instanceof Blob) {
      try {
        const text = JSON.parse(await data.text());
        if (text?.message) return String(text.message);
      } catch {
        /* fall through to the generic text */
      }
      return t("activityExportFailed");
    }
    return apiErrorMessage(e, t("activityExportFailed"));
  };

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const performExport = async () => {
    const format = exportDialog;
    if (!format || exporting || exportCols.length < MIN_EXPORT_COLUMNS) return;
    setExporting(true);
    setExportError("");
    try {
      // Columns in the fixed print order, not the order they were ticked.
      const columns = ACTIVITY_EXPORT_COLUMNS.filter((c) => exportCols.includes(c.key)).map((c) => c.key);
      const params = { ...exportParams(), columns, message: exportMessage ? 1 : 0 };
      if (format === "excel") {
        const response = await api.get("/activity-logs/export/csv", { params: { ...params, as: "json" } });
        const { exportActivityXlsx } = await import("../../../lib/activityLogExport");
        await exportActivityXlsx(response.data);
      } else {
        const response = await api.post("/activity-logs/export/pdf", params, { responseType: "blob", headers: { Accept: "application/pdf" } });
        saveBlob(new Blob([response.data], { type: "application/pdf" }), `activity-log-report-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`);
      }
      setExportDialog(null);
      setExportSuccess(format);
    } catch (e) {
      // Keep the window open so the staff member can narrow the filters (e.g. "too many entries") and try again.
      setExportError(await exportFailureText(e));
    } finally {
      setExporting(false);
    }
  };

  const columnOptions: ExportColumnOption[] = ACTIVITY_EXPORT_COLUMNS.map((c) => ({
    key: c.key,
    label: t(`actCol_${c.key}`),
    description: t(`actColDesc_${c.key}`),
  }));

  // =========================
  // MAP MODULE TO TYPE
  // =========================
  const mapType = (module: string): Activity["type"] => {
    switch (module) {
      case "Events": return "event";
      case "User":
      case "Residents": return "resident";
      case "Membership": return "membership";
      case "Authentication": return "system";
      case "QR": return "scan";
      case "Notifications": return "notification";
      default: return "system";
    }
  };

  // =========================
  // ✅ FETCH — send ALL filters to backend
  // =========================
  // Tags every fetch with an ever-increasing id so a slower, older
  // request can never overwrite what a newer one already returned. This
  // app fires more than one fetch per user action -- a filter/sort change
  // triggers this effect AND (when not already on page 1) a follow-up
  // page-reset re-fetch, and the 20-second background poll can already be
  // in flight when the user changes something -- so without this guard,
  // whichever response's network round-trip happens to land last wins,
  // even when it was the OLDER, now-stale request (e.g. switching to
  // "Oldest First" appearing to do nothing because a leftover
  // "Newest First" response for the previous selection lands afterward).
  const fetchRequestIdRef = useRef(0);

  const fetchActivities = async (page = 1, background = false) => {
    if (!background) setLoading(true);
    const requestId = ++fetchRequestIdRef.current;
    try {
      // Build query params with all filters
      const params = new URLSearchParams({
        page: String(page),
        search: searchQuery,
        type: filterType !== "all" ? filterType : "",
        date: selectedDate,
        sort: sortOrder,
      });

      const res = await fetch(`/activity-logs?${params.toString()}`);
      const json = await res.json();

      if (requestId !== fetchRequestIdRef.current) return; // superseded by a newer request

      const logs = json.data ?? [];

      const formatted: Activity[] = logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        module: log.module,
        description: log.description,
        user_code: log.user_code,
        created_at: log.created_at,
        type: mapType(log.module),
      }));

      setActivities(formatted);
      setTotalPages(json.last_page || 1); // ✅ Now reflects filtered total
      setTotalRecords(typeof json.total === "number" ? json.total : formatted.length);
      setLastUpdated(new Date());

    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return; // superseded by a newer request
      console.error("Error loading activity logs:", err);
      if (!background) {
        setActivities([]);
        setTotalPages(1);
        setTotalRecords(0);
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) setLoading(false);
    }
  };

  // Fetch when page, search, filter, or date changes
  useEffect(() => {
    fetchActivities(currentPage);
  }, [currentPage, searchQuery, filterType, selectedDate, sortOrder]);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, selectedDate, sortOrder]);

  // Quiet background poll -- keeps the log fresh without disturbing
  // whatever the staff member is currently reading or typing.
  useEffect(() => {
    const poll = setInterval(() => fetchActivities(currentPage, true), 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, filterType, selectedDate, sortOrder]);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsSinceUpdate = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated.getTime()) / 1000)) : null;
  const lastUpdatedLabel =
    secondsSinceUpdate === null
      ? ""
      : secondsSinceUpdate < 5
      ? t("updatedJustNowLabel")
      : secondsSinceUpdate < 60
      ? t("updatedSecondsAgoLabel").replace("{n}", String(secondsSinceUpdate))
      : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(secondsSinceUpdate / 60)));

  // =========================
  // ✅ NOW: NO client-side filtering — backend does it
  // =========================
  const filteredActivities = useMemo(() => {
    return activities;
  }, [activities]);

  // At-a-glance stats for the page currently in view -- the log itself is
  // paginated server-side, so "shown" describes this page while "total"
  // uses the server-reported grand total.
  const stats = useMemo(() => {
    const systemEvents = filteredActivities.filter((a) => a.type === "system").length;
    const latestAt = filteredActivities[0]?.created_at;
    return { systemEvents, latestAt };
  }, [filteredActivities]);

  const relativeTimeLabel = (dateString?: string) => {
    if (!dateString) return "--";
    const then = new Date(dateString).getTime();
    if (isNaN(then)) return "--";
    const diffSec = Math.max(0, Math.floor((nowTick - then) / 1000));
    if (diffSec < 60) return t("justNowLabel");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t("minutesAgoShortLabel").replace("{n}", String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("hoursAgoShortLabel").replace("{n}", String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    return t("daysAgoShortLabel").replace("{n}", String(diffDay));
  };

  // Groups the current page's activities into day buckets (Today /
  // Yesterday / a formatted date) in their existing (newest-first) order,
  // so the feed reads like a real activity stream instead of a flat list.
  const groupedActivities = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yesterdayKey = yest.toDateString();

    const order: string[] = [];
    const map = new Map<string, Activity[]>();
    filteredActivities.forEach((act) => {
      const d = new Date(act.created_at);
      const key = isNaN(d.getTime()) ? "unknown" : d.toDateString();
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(act);
    });

    return order.map((key) => {
      let label: string;
      if (key === "unknown") label = t("unknownDateLabel");
      else if (key === todayKey) label = t("todayLabel");
      else if (key === yesterdayKey) label = t("yesterdayLabel");
      else label = new Date(key).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
      return { key, label, items: map.get(key)! };
    });
  }, [filteredActivities, t]);

  const typeOptions = [
    { value: "all", label: t("allActivities") },
    { value: "event", label: t("events") },
    { value: "membership", label: t("memberships") },
    { value: "notification", label: t("notify") },
    { value: "scan", label: t("qrScansOption") },
    { value: "resident", label: t("residents") },
    { value: "system", label: t("systemAuthOption") },
    { value: "inventory", label: t("inventory") },
    { value: "budget", label: t("budget") },
    { value: "household", label: t("households") },
    { value: "profiling", label: t("profilingSettingsOption") },
    { value: "archive", label: t("archiveActivityOption") },
    { value: "report", label: t("reports") },
  ].sort((a, b) => a.label.localeCompare(b.label));

  const sortOptions = [
    { value: "desc", label: t("newestFirstLabel") },
    { value: "asc", label: t("oldestFirstLabel") },
  ];

  const statCards: Array<{
    key: string;
    label: string;
    desc: string;
    value: number | string;
    icon: typeof ActivityIcon;
    gradient: string;
    isText?: boolean;
  }> = [
    {
      key: "total",
      label: t("totalLoggedActivitiesStatLabel"),
      desc: t("totalLoggedActivitiesStatDesc"),
      value: totalRecords,
      icon: ActivityIcon,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      key: "page",
      label: t("shownThisPageStatLabel"),
      desc: t("shownThisPageStatDesc"),
      value: filteredActivities.length,
      icon: Eye,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      key: "latest",
      label: t("latestActivityStatLabel"),
      desc: t("latestActivityStatDesc"),
      value: relativeTimeLabel(stats.latestAt),
      icon: Clock,
      gradient: "from-sage-400 to-sage-700",
      isText: true,
    },
    {
      key: "security",
      label: t("securityAuthEventsStatLabel"),
      desc: t("securityAuthEventsStatDesc"),
      value: stats.systemEvents,
      icon: ShieldAlert,
      gradient: "from-sage-400 to-sage-700",
    },
  ];

  const SkeletonItem = () => (
    <div className="relative pl-11 pb-6 last:pb-0">
      <span className="absolute left-[15px] top-9 bottom-0 w-px bg-white/10" />
      <span className="absolute left-0 top-0 h-8 w-8 rounded-full bg-white/10 animate-pulse" />
      <div className="h-3.5 bg-white/10 rounded w-1/2 animate-pulse" />
      <div className="h-3 bg-white/10 rounded w-2/3 mt-2 animate-pulse" />
      <div className="h-3 bg-white/10 rounded w-1/3 mt-2 animate-pulse" />
    </div>
  );

  // Total count across all day-groups so the very last row in the feed
  // (and only that one) skips the connecting timeline line beneath it.
  const totalFeedItems = filteredActivities.length;
  let renderedFeedIndex = 0;

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events/Budget/Returns
        pages, so Activity Logs reads as part of the same system instead
        of the old light "paper" page. This page has no add/edit modal of
        its own, just the feed below. */}
    <div ref={topRef} className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] dash-canvas p-4 sm:p-8">
    <div className="space-y-6">
      <div className="dash-card flex flex-wrap items-center justify-between gap-3 rounded-[32px] p-5 sm:p-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl page-title-gradient page-title-fit">{t("activitylogs")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("activityLogsSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openExportDialog("excel")}
            disabled={loading || totalRecords === 0}
            title={t("activityExportExcelTitle")}
            className="btn-live-navy inline-flex h-10 items-center gap-2 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] px-5 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 hover:bg-[#274A77] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4 text-white" />
            {t("resExportExcel")}
          </button>
          <button
            type="button"
            onClick={() => openExportDialog("pdf")}
            disabled={loading || totalRecords === 0}
            title={t("activityExportPdfTitle")}
            className="btn-live-navy inline-flex h-10 items-center gap-2 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] px-5 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 hover:bg-[#274A77] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileText className="h-4 w-4 text-white" />
            {t("resExportPdf")}
          </button>
        </div>
        <div className="dash-tile dash-mint flex items-center gap-2 rounded-full px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-white/40">&bull; {lastUpdatedLabel}</span>}
        </div>
        </div>
      </div>

      <div className="report-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card, idx) =>
          statsLoading ? (
            <StatCardSkeleton key={card.key} />
          ) : (
            <KpiCard key={card.key} value={card.value} label={card.label} description={card.desc} icon={card.icon} gradient={card.gradient} delay={idx * 70} />
          )
        )}
      </div>

      <div className="dash-card rounded-[32px] p-4 sm:p-5">
        <FilterBar
          search={{ value: searchQuery, onChange: setSearchQuery, placeholder: t("searchActivitiesPlaceholder") }}
          filters={[{ key: "type", label: t("typeColumn"), value: filterType, onChange: setFilterType, options: typeOptions, searchable: true }]}
          sort={{ value: sortOrder, onChange: (v) => setSortOrder(v as "desc" | "asc"), options: sortOptions }}
          count={loading ? undefined : { shown: totalRecords }}
          extraChips={(selectedDate ? [{ key: "date", label: `${t("fltDateChip")}: ${new Date(selectedDate).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => setSelectedDate("") }] : []) as ExtraChip[]}
          onClearExtras={() => setSelectedDate("")}
        >
          <div className="h-11 w-full shrink-0 sm:w-auto">
            <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 px-4" dark />
          </div>
        </FilterBar>
      </div>

      <p className="text-xs text-white/45">{t("showingPerPage").replace("{n}", String(itemsPerPage))}</p>

      <div className="p-1 sm:p-2">
        <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
        {loading ? (
          <div>{Array(6).fill(0).map((_, i) => <SkeletonItem key={i} />)}</div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-12 text-center text-white/40">
            <Filter size={32} className="mx-auto mb-3 text-white/25" />
            {t("noActivityMatch")}
          </div>
        ) : (
          groupedActivities.map((group) => (
            <div key={group.key} className="mb-6 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wide text-white bg-gradient-to-r from-[#0B0F14] to-[#18212B] rounded-full px-3.5 py-1.5 shrink-0 shadow-sm">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div>
                {group.items.map((act) => {
                  renderedFeedIndex += 1;
                  const isLast = renderedFeedIndex === totalFeedItems;
                  const Icon = MODULE_ICONS[act.type ?? ""] ?? DEFAULT_MODULE_ICON;
                  const iconWrap = MODULE_ICON_WRAP[act.type ?? ""] ?? DEFAULT_ICON_WRAP;
                  const secondsAgo = Math.max(0, Math.floor((nowTick - new Date(act.created_at).getTime()) / 1000));
                  const isFresh = !isNaN(secondsAgo) && secondsAgo < 60;
                  const timeOfDay = new Date(act.created_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <div key={act.id} className={`relative pl-11 ${isLast ? "" : "pb-6"} group`}>
                      {!isLast && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-white/10" />}
                      <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full ${iconWrap}`}>
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="dash-card !shadow-[0_8px_22px_rgba(15,23,42,0.09)] rounded-[22px] px-4 py-3.5 transition group-hover:-translate-y-0.5 group-hover:!border-[#4FBEB0]/50">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white">{highlightMatches(act.action, searchQuery)}</p>
                              {isFresh && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#4FBEB0]/15 text-[#7DD8CB] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#4FBEB0] animate-pulse" />
                                  {t("newLabel")}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/50 mt-0.5">{highlightMatches(act.description, searchQuery)}</p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${MODULE_BADGE_STYLES[act.type ?? ""] ?? DEFAULT_MODULE_BADGE}`}>
                                {highlightMatches(act.module, searchQuery)}
                              </span>
                              <span className="text-xs text-white/40">{t("staffColon")} {highlightMatches(act.user_code, searchQuery)}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-white/70 whitespace-nowrap">{timeOfDay}</p>
                            <p className="text-[11px] text-white/40 mt-0.5 whitespace-nowrap">{relativeTimeLabel(act.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && ((loading) ? <PagerSkeleton withLabel /> : (
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <p className="text-sm text-white/45 text-center sm:text-left">
            {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="dash-tile h-8 w-8 rounded-full text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >
              ←
            </button>
            <span className="h-8 w-8 rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] text-white shadow-sm flex items-center justify-center text-sm font-bold">
              {currentPage}
            </span>
            <button
              onClick={() => goToPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="dash-tile h-8 w-8 rounded-full text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >
              →
            </button>
          </div>
        </div>
      ))}
    </div>
    </div>
      <ExportReportDialog
        open={exportDialog !== null}
        format={exportDialog ?? "excel"}
        reportName={t("activitylogs")}
        subtitle={t("activityExportDialogSubtitle")}
        sectionTitle={t("activityExportEntries")}
        sectionHint={exportCount === null ? t("activityExportEntriesCounting") : t("activityExportEntriesCount").replace("{n}", exportCount.toLocaleString(locale))}
        columns={columnOptions}
        selected={exportCols}
        onSelectedChange={(keys) => setExportCols(keys as ActivityExportColumnKey[])}
        minColumns={MIN_EXPORT_COLUMNS}
        includeMessage={exportMessage}
        onIncludeMessageChange={setExportMessage}
        busy={exporting}
        downloadDisabled={exportCount === 0 || pdfTooMany || excelTooMany}
        onClose={() => setExportDialog(null)}
        onDownload={() => setConfirmExport(true)}
      >
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 sm:inline-flex sm:flex-wrap sm:gap-0 sm:rounded-full" role="group">
          {([
            { key: "all", label: t("activityPeriodAll") },
            { key: "today", label: t("activityPeriodToday") },
            { key: "7d", label: t("activityPeriod7d") },
            { key: "30d", label: t("activityPeriod30d") },
          ] as { key: ExportPeriod; label: string }[]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setExportPeriod(opt.key)}
              disabled={periodLocked}
              aria-pressed={!periodLocked && exportPeriod === opt.key}
              className={`rounded-full px-3 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:text-[14px] ${
                !periodLocked && exportPeriod === opt.key ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {periodLocked && <p className="mt-2 text-[13px] text-white/40">{t("activityExportPeriodLocked")}</p>}
        {hasScreenFilters && (
          <button
            type="button"
            onClick={() => setExportApply((v) => !v)}
            aria-pressed={exportApply}
            className={`mt-3 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              exportApply ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
            }`}
          >
            <ExportBox checked={exportApply} />
            <span className="text-sm font-semibold text-white sm:text-[15px]">{t("activityExportApplyFilters")}</span>
          </button>
        )}
        {excelTooMany && (
          <p className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[14px] text-amber-200" role="alert">
            {t("activityExportExcelTooMany").replace("{max}", EXCEL_MAX_ROWS.toLocaleString(locale)).replace("{n}", (exportCount ?? 0).toLocaleString(locale))}
          </p>
        )}
        {pdfTooMany && (
          <p className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[14px] text-amber-200" role="alert">
            {t("activityExportPdfTooMany").replace("{max}", pdfLimit.toLocaleString(locale)).replace("{cols}", String(exportCols.length)).replace("{n}", (exportCount ?? 0).toLocaleString(locale))}
          </p>
        )}
        {exportError && (
          <p className="mt-3 rounded-2xl border border-[#8A3D2C]/50 bg-[#8A3D2C]/15 px-4 py-3 text-[14px] text-[#F2A99B]" role="alert">
            {exportError}
          </p>
        )}
      </ExportReportDialog>
      <ConfirmDialog
        open={confirmExport && exportDialog !== null}
        icon={exportDialog === "pdf" ? <FileText className="h-9 w-9" /> : <FileSpreadsheet className="h-9 w-9" />}
        title={t("activityConfirmDownloadTitle")}
        body={exportDialog === "pdf" ? t("activityConfirmBodyPdf") : t("activityConfirmBodyExcel")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("downloadLabel")}
        z={90}
        onCancel={() => setConfirmExport(false)}
        onConfirm={() => {
          setConfirmExport(false);
          performExport();
        }}
      />
      <StatusModal
        open={exportSuccess !== null}
        type="success"
        title={t("successTitle")}
        message={exportSuccess === "pdf" ? t("activityExportSuccessPdf") : t("activityExportSuccessExcel")}
        okLabel={t("okLabel")}
        onClose={() => setExportSuccess(null)}
      />
    </>
  );
}
