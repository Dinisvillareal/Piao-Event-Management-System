import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { Filter, Printer, Download, TrendingUp, Users, CalendarDays, CalendarCheck, Star, Award, Wallet, Package, ChevronDown, MapPin, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { BarChart, DonutChart } from "../../../components/ui/Charts";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import { translate } from "../../../i18n/translations";
import { buildReportMessage, dateRangeScope } from "../../../lib/reportMessage";
import { useBarangayOfficials } from "../../../lib/barangayOfficials";
import ReportOptionsModal, { type AttendeeFilter, type SectionDef } from "./ReportOptionsModal";

interface Membership {
  id: string | number;
  name: string;
}

interface EventOption {
  id: string | number;
  title?: string;
  name?: string;
  event_start?: string;
  date?: string;
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

// What can be included in a printout / PDF / Word file, per report type.
// The keys must match the backend's allowed list in
// ReportController::buildExportPayload().
const SECTION_DEFS: Record<ReportType, SectionDef[]> = {
  attendance: [
    { key: "summary", labelKey: "rptSecSummary", descKey: "rptSecSummaryAtt" },
    { key: "charts", labelKey: "rptSecCharts", descKey: "rptSecChartsDesc" },
    { key: "age", labelKey: "rptSecAge", descKey: "rptSecAgeDesc" },
    { key: "events", labelKey: "rptSecEvents", descKey: "rptSecEventsDesc" },
    { key: "records", labelKey: "rptSecRecords", descKey: "rptSecRecordsDesc" },
    { key: "message", labelKey: "rptSecMessage", descKey: "rptSecMessageDesc", group: "other" },
  ],
  membership: [
    { key: "summary", labelKey: "rptSecSummary", descKey: "rptSecSummaryMem" },
    { key: "memberships", labelKey: "rptSecMemberships", descKey: "rptSecMembershipsDesc" },
    { key: "message", labelKey: "rptSecMessage", descKey: "rptSecMessageDesc", group: "other" },
  ],
  budget: [
    { key: "summary", labelKey: "rptSecSummary", descKey: "rptSecSummaryBud" },
    { key: "overBudget", labelKey: "rptSecOverBudget", descKey: "rptSecOverBudgetDesc" },
    { key: "perEvent", labelKey: "rptSecBudgetEvents", descKey: "rptSecBudgetEventsDesc" },
    { key: "expenses", labelKey: "rptSecExpenses", descKey: "rptSecExpensesDesc" },
    { key: "topExpenses", labelKey: "rptSecTopExpenses", descKey: "rptSecTopExpensesDesc" },
    { key: "noBudget", labelKey: "rptSecNoBudget", descKey: "rptSecNoBudgetDesc" },
    { key: "message", labelKey: "rptSecMessage", descKey: "rptSecMessageDesc", group: "other" },
  ],
  inventory: [
    { key: "summary", labelKey: "rptSecSummary", descKey: "rptSecSummaryInv" },
    { key: "condition", labelKey: "rptSecCondition", descKey: "rptSecConditionDesc" },
    { key: "items", labelKey: "rptSecItems", descKey: "rptSecItemsDesc" },
    { key: "message", labelKey: "rptSecMessage", descKey: "rptSecMessageDesc", group: "other" },
  ],
};

const ALL_SECTIONS = (): Record<ReportType, string[]> => ({
  attendance: SECTION_DEFS.attendance.map((x) => x.key),
  membership: SECTION_DEFS.membership.map((x) => x.key),
  budget: SECTION_DEFS.budget.map((x) => x.key),
  inventory: SECTION_DEFS.inventory.map((x) => x.key),
});

const EVENT_STATUS_PILL: Record<string, string> = {
  Upcoming: "bg-sky-500/15 text-sky-300 print:bg-sky-50 print:text-sky-700",
  Ongoing: "bg-emerald-500/15 text-emerald-300 print:bg-emerald-50 print:text-emerald-700",
  Past: "bg-white/10 text-white/50 print:bg-gray-100 print:text-gray-500",
};

const BUDGET_STATUS_PILL: Record<string, { cls: string; key: string }> = {
  "Over budget": { cls: "bg-red-500/15 text-red-300 print:bg-red-50 print:text-red-600", key: "rptBSOver" },
  "Near limit": { cls: "bg-amber-500/15 text-amber-300 print:bg-amber-50 print:text-amber-700", key: "rptBSNear" },
  "Within budget": { cls: "bg-[#4FBEB0]/15 text-[#7DD8CB] print:bg-teal-50 print:text-teal-700", key: "rptBSWithin" },
};

const peso = (n: any) => `₱${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const ATTENDANCE_PILL: Record<string, string> = {
  Present: "bg-emerald-500/15 text-emerald-300",
  Absent: "bg-red-500/15 text-red-300",
  Expected: "bg-sky-500/15 text-sky-300",
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
  const { t: tUI, locale } = useLanguage();
  // Signature names on the printed report: whoever is marked Barangay Captain / Secretary on their resident record.
  const officials = useBarangayOfficials();
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

  // Budget tab's event picker only offers events that start inside the chosen
  // date range (same rule the server applies: event_start's date, inclusive),
  // so "Oct 1-31" never lists a September or November event. An empty bound
  // means open-ended, i.e. "All dates" lists every event.
  const eventsInRange = useMemo(() => {
    const day = (v?: string) => (v ? String(v).slice(0, 10) : "");
    return events.filter((ev) => {
      const d = day(ev.event_start ?? ev.date);
      if (!d) return !dateFrom && !dateTo;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [events, dateFrom, dateTo]);

  // A pinned event that falls outside a newly chosen range is dropped, so the
  // report never keeps showing an event the date filter has excluded.
  useEffect(() => {
    if (eventId && !eventsInRange.some((ev) => String(ev.id) === eventId)) setEventId("");
  }, [eventsInRange, eventId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  // ── Print & export options ────────────────────────────────────────────────
  // Which parts of each report go on the printout / PDF / Word file. The
  // on-screen page always shows everything; unselected sections are only
  // hidden when printing (print:hidden), so staff never lose sight of data
  // just because they left it out of a printout.
  const [optionsMode, setOptionsMode] = useState<"print" | "download" | null>(null);
  const [selectedSections, setSelectedSections] = useState<Record<ReportType, string[]>>(ALL_SECTIONS);
  // null = every event in the current list gets an attendee list
  const [recordEventIds, setRecordEventIds] = useState<string[] | null>(null);
  const [attendeeFilter, setAttendeeFilter] = useState<AttendeeFilter>("all");
  // Attendee lists are loaded on demand (per event) and cached by filter+event
  const [attendeeCache, setAttendeeCache] = useState<Record<string, any[]>>({});
  const attendeeCacheRef = useRef<Record<string, any[]>>({});
  attendeeCacheRef.current = attendeeCache;
  const inflightRef = useRef<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);

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
      // New filters = new event list: forget cached attendee lists and
      // go back to "every event" for the attendee-list selection.
      setAttendeeCache({});
      inflightRef.current.clear();
      setExpandedEvents([]);
      setRecordEventIds(null);
    } catch (e) {
      setError(apiErrorMessage(e, tUI("loadReportFailed")));
    } finally {
      setLoading(false);
    }
  };

  // ── Word / PDF download (chosen from the Print & Export Options dialog) ──
  const [downloading, setDownloading] = useState(false);
  // "Are you sure?" step in front of every Word / PDF download.
  const [confirmDownload, setConfirmDownload] = useState<"pdf" | "word" | null>(null);
  // Success confirmation shown after the file actually reaches the browser's
  // download handling -- mirrors Budget's success StatusModal for
  // Add/Update/Delete Expense.
  const [downloadSuccessFormat, setDownloadSuccessFormat] = useState<"pdf" | "word" | null>(null);

  const handleDownload = async (format: "pdf" | "word") => {
    setDownloading(true);
    try {
      const params: Record<string, string> = {
        ...buildFilterParams(),
        type: reportType,
        sections: selectedSections[reportType].join(","),
      };
      if (reportType === "attendance" && hasSection("records")) {
        params.event_ids = effectiveRecordIds.join(",");
        params.attendee_filter = attendeeFilter;
      }
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
      setOptionsMode(null);
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

  // ── Section selection helpers ─────────────────────────────────────────────
  const hasSection = (key: string) => selectedSections[reportType].includes(key);
  // Tailwind class that drops an unselected section from the printed page.
  const ph = (key: string) => (hasSection(key) ? "" : "print:hidden");
  const setSectionsForType = (next: string[]) => setSelectedSections((prev) => ({ ...prev, [reportType]: next }));

  const allEventIds: string[] = perEvent.map((ev: any) => String(ev.id));
  const effectiveRecordIds: string[] = (recordEventIds ?? allEventIds).filter((id) => allEventIds.includes(id));
  const recordEventOptions = perEvent.map((ev: any) => ({
    id: String(ev.id),
    name: ev.name,
    date: ev.date ?? "",
    status: ev.status ?? "Past",
    eligible: ev.eligible ?? 0,
    attended: ev.attended ?? 0,
  }));

  const cacheKey = (id: string, filter: AttendeeFilter = attendeeFilter) => `${filter}:${id}`;

  // Loads attendee lists for the given events (skipping ones already cached
  // or in flight). One request for the whole batch.
  const fetchAttendees = async (ids: string[], filter: AttendeeFilter = attendeeFilter): Promise<boolean> => {
    const busy = ids.filter((id) => inflightRef.current.has(cacheKey(id, filter)));
    const need = ids.filter((id) => attendeeCacheRef.current[cacheKey(id, filter)] === undefined && !inflightRef.current.has(cacheKey(id, filter)));
    const waitForOthers = async () => {
      // Lists another request is already loading (e.g. an expanded row):
      // wait for them instead of printing without them.
      for (let i = 0; i < 40 && busy.some((id) => inflightRef.current.has(cacheKey(id, filter))); i++) {
        await new Promise((r) => window.setTimeout(r, 250));
      }
    };
    if (need.length === 0) {
      await waitForOthers();
      return true;
    }
    need.forEach((id) => inflightRef.current.add(cacheKey(id, filter)));
    try {
      const res = await api.get(REPORT_ENDPOINTS.attendance, {
        params: { ...buildFilterParams(), include_attendees: 1, event_ids: need.join(","), attendee_filter: filter },
      });
      const rows: any[] = res.data?.per_event ?? [];
      setAttendeeCache((prev) => {
        const next = { ...prev };
        need.forEach((id) => {
          const row = rows.find((r) => String(r.id) === id);
          next[cacheKey(id, filter)] = row?.attendees ?? [];
        });
        return next;
      });
      need.forEach((id) => inflightRef.current.delete(cacheKey(id, filter)));
      await waitForOthers();
      return true;
    } catch (e) {
      need.forEach((id) => inflightRef.current.delete(cacheKey(id, filter)));
      setError(apiErrorMessage(e, tUI("loadReportFailed")));
      return false;
    }
  };

  // Keep every expanded event's list in step with the attendee filter.
  useEffect(() => {
    if (reportType !== "attendance" || expandedEvents.length === 0) return;
    fetchAttendees(expandedEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeFilter, expandedEvents, reportType]);

  const toggleExpanded = (id: string) =>
    setExpandedEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
  const overBudgetList = reportType === "budget" ? (data?.over_budget ?? []) : [];
  const unbudgeted = reportType === "budget" ? (data?.unbudgeted ?? []) : [];

  // ── Inventory ───────────────────────────────────────────────────────────────
  const inventorySummary = data?.summary ?? { total_items: 0, total_quantity: 0 };
  const byCondition = reportType === "inventory" ? (data?.by_condition ?? []) : [];
  const inventoryItems = reportType === "inventory" ? (data?.items ?? []) : [];

  // Same mapping as InventoryView's CONDITION_STYLES -- reused as-is so the
  // condition badges look identical between the two pages.
  const conditionLabel = (c: string) => (["New", "Good", "Fair", "Poor", "Disposed", "Lost"].includes(c) ? t("condition" + c) : c);
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
    (reportType === "budget" && !loading && budgetPerEvent.length === 0 && unbudgeted.length === 0) ||
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
  const dateLocale = isPrinting ? "en-PH" : locale;
  const printedOn = new Date().toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });

  // "Message" printed under the letterhead: what the report is and exactly
  // what this printout includes (follows the Print & Export Options picks).
  const printMessage = useMemo(() => {
    const scope =
      reportType === "attendance"
        ? dateRangeScope(dateFrom, dateTo)
        : reportType === "budget"
        ? eventId
          ? `the event "${(() => { const ev = events.find((x) => String(x.id) === eventId); return ev?.title || ev?.name || ""; })()}"`
          : dateRangeScope(dateFrom, dateTo)
        : reportType === "membership"
        ? (() => { const m = memberships.find((x) => String(x.id) === membershipId); return m ? `the "${m.name}" membership` : "all memberships"; })()
        : conditionFilter
        ? conditionFilter === "Lost"
          ? "inventory items with lost units"
          : conditionFilter === "Disposed"
          ? "inventory items with disposed units"
          : `inventory items in ${conditionFilter} condition`
        : "all inventory items";
    return buildReportMessage({
      type: reportType,
      title: translate(REPORT_PRINT_TITLE_KEYS[reportType], "en"),
      data,
      sections: selectedSections[reportType],
      scope,
      printedOn: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      recordEventCount: effectiveRecordIds.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, data, selectedSections, dateFrom, dateTo, eventId, membershipId, conditionFilter, events, memberships, recordEventIds]);

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

  // Print from the options dialog: make sure the selected events' attendee
  // lists are loaded first, then hand off to the browser.
  const handlePrintConfirmed = async () => {
    if (reportType === "attendance" && hasSection("records")) {
      setPreparing(true);
      const ok = await fetchAttendees(effectiveRecordIds);
      setPreparing(false);
      if (!ok) return;
    }
    setOptionsMode(null);
    window.setTimeout(handlePrint, 250);
  };

  const attendeeFilterLabel =
    attendeeFilter === "present" ? t("rptAttPresent") : attendeeFilter === "absent" ? t("rptAttAbsent") : t("rptAttAll");

  // Shared attendee table: dark card styling on screen, light ruled table
  // on paper (the printed copy always uses variant "print").
  const renderAttendeeTable = (rows: any[], variant: "screen" | "print") => {
    const screen = variant === "screen";
    if (rows.length === 0) {
      return <p className={`py-4 text-center text-sm italic ${screen ? "text-white/40" : "text-[10px] text-gray-500"}`}>{t("rptNoAttendees")}</p>;
    }
    const cols = ["rptColNo", "rptColName", "rptColId", "rptColAge", "rptColGender", "rptColContact", "rptColStatus", "rptColTimeIn", "rptColTimeOut"];
    const cell = screen ? "px-3.5 py-2.5" : "px-2 py-1";
    return (
      <div className={screen ? "overflow-x-auto rounded-xl border border-white/10" : ""}>
        <table className={`w-full border-collapse text-left ${screen ? "text-sm" : "text-[10px]"}`}>
          <thead className={screen ? "bg-white/[0.06] text-[11px] uppercase tracking-wide text-white/55" : "bg-[#17365D] text-white [display:table-header-group]"}>
            <tr>
              {cols.map((c) => (
                <th key={c} className={`${cell} font-semibold whitespace-nowrap ${screen ? "" : "text-[9px] uppercase tracking-wide"}`}>{t(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a: any, i: number) => (
              <tr
                key={a.id ?? i}
                className={screen ? "border-t border-white/[0.06] text-white/80 hover:bg-white/[0.03]" : "break-inside-avoid border-b border-[#DCEAE5] text-[#222] even:bg-[#EEF4F1]"}
              >
                <td className={`${cell} ${screen ? "text-white/40" : "text-[#222]"}`}>{i + 1}</td>
                <td className={`${cell} ${screen ? "font-semibold text-white" : "font-bold text-[#222]"}`}>{a.name}</td>
                <td className={`${cell} whitespace-nowrap`}>{a.user_code ?? "—"}</td>
                <td className={cell}>{a.age ?? "—"}</td>
                <td className={cell}>{a.gender ?? "—"}</td>
                <td className={`${cell} whitespace-nowrap`}>{a.contact_number ?? "—"}</td>
                <td className={cell}>
                  {screen ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ATTENDANCE_PILL[a.attendance] ?? ATTENDANCE_PILL.Absent}`}>{t(`rptRow${a.attendance}`)}</span>
                  ) : (
                    <span>{t(`rptRow${a.attendance}`)}</span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap`}>{a.time_in ?? "—"}</td>
                <td className={`${cell} whitespace-nowrap`}>{a.time_out ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Itemized expense table (screen = dark card, print = light ruled table).
  const renderExpenseTable = (rows: any[], total: number, variant: "screen" | "print") => {
    const screen = variant === "screen";
    if (!rows || rows.length === 0) {
      return <p className={`py-4 text-center text-sm italic ${screen ? "text-white/40" : "text-[10px] text-gray-500"}`}>{t("rptNoExpenses")}</p>;
    }
    const cell = screen ? "px-3.5 py-2.5" : "px-2 py-1";
    const cols: [string, boolean][] = [["rptColNo", false], ["rptColItem", false], ["rptColAmount", true], ["rptColNotes", false], ["rptColRecordedBy", false], ["rptColDate", false]];
    return (
      <div className={screen ? "overflow-x-auto rounded-xl border border-white/10" : ""}>
        <table className={`w-full border-collapse text-left ${screen ? "text-sm" : "text-[10px]"}`}>
          <thead className={screen ? "bg-white/[0.06] text-[11px] uppercase tracking-wide text-white/55" : "bg-[#17365D] text-white [display:table-header-group]"}>
            <tr>
              {cols.map(([c, right]) => (
                <th key={c} className={`${cell} font-semibold whitespace-nowrap ${right ? "text-right" : ""} ${screen ? "" : "text-[9px] uppercase tracking-wide"}`}>{t(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x: any, i: number) => (
              <tr key={i} className={screen ? "border-t border-white/[0.06] text-white/80 hover:bg-white/[0.03]" : "break-inside-avoid border-b border-[#DCEAE5] text-[#222] even:bg-[#EEF4F1]"}>
                <td className={`${cell} ${screen ? "text-white/40" : "text-gray-500"}`}>{i + 1}</td>
                <td className={`${cell} font-semibold ${screen ? "text-white" : "text-[#005f63]"}`}>{x.item}</td>
                <td className={`${cell} text-right font-semibold whitespace-nowrap`}>{peso(x.amount)}</td>
                <td className={cell}>{x.notes || "—"}</td>
                <td className={`${cell} whitespace-nowrap`}>{x.recorded_by || "—"}</td>
                <td className={`${cell} whitespace-nowrap`}>{x.date || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={screen ? "border-t border-white/15 bg-white/[0.05] text-white" : "bg-[#DCEAE5] text-[#005f63]"}>
              <td className={cell}></td>
              <td className={`${cell} font-bold`}>{t("rptTotalLabel")}</td>
              <td className={`${cell} text-right font-black whitespace-nowrap`}>{peso(total)}</td>
              <td className={cell} colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const budgetEventsAll: any[] = reportType === "budget" ? [...budgetPerEvent, ...unbudgeted] : [];
  const printExpenseEvents = budgetEventsAll.filter((ev: any) => (ev.expenses ?? []).length > 0);

  const printRecordEvents = perEvent.filter(
    (ev: any) => effectiveRecordIds.includes(String(ev.id)) && attendeeCache[cacheKey(String(ev.id))] !== undefined
  );

  return (
    <>
      <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 print:m-0 print:p-0 print:bg-white print:min-h-0">
        <div className="space-y-6 print:space-y-3">
      {/* Not sticky -- matches every other converted page (Inventory, Budget,
          Returns, Activity Logs, Archive), none of which pin their header
          while scrolling. A sticky header here fought with the full-bleed
          dark page wrapper's own top padding and let content peek through
          above it while scrolling. */}
      <div className="pt-2 pb-4 px-1 print:pb-0">
        {/* Official letterhead -- print only (hidden on screen). Makes a
            printed report a self-contained barangay hall record: full
            Republic/Province/Municipality/Barangay address block, the
            report's formal title, the filter it was generated under, and
            the date it was printed. Seal on the left, same as the
            PDF/Word exports -- a matching empty spacer on the right keeps
            the address block itself truly centered instead of drifting
            right, the same balance an official letterhead keeps between a
            seal and the margin on the other side. */}
        <div className="hidden print:block print:mb-0">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <img src="/logo-removebg-preview.png" alt="" className="h-[72px] w-[72px] shrink-0 object-contain" />
              <div className="text-left leading-tight">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#222]">{t("printCountryLabel")}</p>
                <p className="mt-0.5 text-[10px] text-[#222]">{t("printProvinceLabel")}</p>
                <p className="text-[10px] text-[#222]">{t("printMunicipalityLabel")}</p>
                <p className="mt-1.5 text-[13px] font-extrabold uppercase leading-none tracking-wide text-black">{t("printBarangayLabel")}</p>
                <p className="mt-1.5 text-[10px] text-[#222]">{t("printAddressLabel")}</p>
              </div>
            </div>
            <div className="shrink-0 text-right leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#4FBEB0]">{t("printSystemName")}</p>
              <p className="mt-2 text-[9px] text-[#667777]">{t("printGeneratedOnLabel")}</p>
              <p className="text-[10px] font-semibold text-[#005f63]">{printedOn}</p>
            </div>
          </div>
          <div className="mt-3 h-[3px] bg-[#005f63]" />
          <div className="mt-3 flex items-end justify-between gap-4">
            <h2 className="text-lg font-black uppercase tracking-wide text-[#005f63]">{t(REPORT_PRINT_TITLE_KEYS[reportType])}</h2>
            <p className="text-right text-[10px] text-[#667777]">{printFilterSummary}</p>
          </div>
          <div className="mt-2 h-px bg-[#ddd5ca]" />

          {/* Message -- opens the printed report (like the "I. MESSAGE" of an
              annual report): what it is and what it includes. */}
          {hasSection("message") && (
            <div className="mt-4">
              <h3 className="text-[13px] font-black tracking-wide text-black">I.&nbsp;&nbsp;&nbsp;MESSAGE</h3>
              {printMessage.map((para, i) => (
                <p key={i} className="mt-2 text-justify text-[11.5px] leading-relaxed text-[#1a1a1a] indent-8">{para}</p>
              ))}
              <h3 className="mt-8 text-[13px] font-black tracking-wide text-black">II.&nbsp;&nbsp;&nbsp;REPORT DETAILS</h3>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
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
              onClick={() => setOptionsMode("print")}
              className="group inline-flex items-center gap-3.5 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] pl-7 pr-2 py-2 text-[17px] font-semibold text-white shadow-md transition-all duration-500 ease-out hover:border-[#274A77] hover:bg-[#274A77] active:scale-95"
            >
              {tUI("printReport")}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors duration-500 ease-out group-hover:bg-white/25">
                <Printer className="h-5 w-5 text-white" />
              </span>
            </button>

            {/* Download icon button -- opens the same Print & Export Options
                dialog, with the Word / PDF choices in its footer. */}
            <button
              type="button"
              onClick={() => setOptionsMode("download")}
              disabled={loading || isEmpty}
              title={tUI("downloadReportLabel")}
              aria-label={tUI("downloadReportLabel")}
              className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Step 1 per UC-10: choose a report type */}
        <div className="mt-4 flex flex-wrap gap-2.5 print:hidden">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.key}
              onClick={() => handleReportTypeChange(rt.key)}
              className={`inline-flex items-center gap-2.5 rounded-full px-5 py-3.5 text-[14px] font-semibold transition-colors ${
                reportType === rt.key
                  ? "bg-sage-700 text-white shadow-sm hover:bg-sage-800"
                  : "border border-white/10 bg-white/[0.04] text-white/65 hover:border-white/30 hover:bg-white/10 hover:text-white"
              }`}
            >
              <rt.icon className="h-[18px] w-[18px]" /> {t(rt.labelKey)}
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
                  ...eventsInRange
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
                ...CONDITIONS.map((c) => ({ value: c, label: conditionLabel(c) })),
              ]}
              className="h-11 pl-9 pr-6"
              icon={<Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
              dark
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-[30px]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[30px]" />
        </div>
      ) : isEmpty ? (
        // UC-10 extension 4a: no records exist for the selected type/range
        <div className="print:break-inside-avoid rounded-[30px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-white/40 italic print:border-gray-200 print:bg-white print:text-gray-400">
          {t("noDataAvailableForReport")}
        </div>
      ) : reportType === "attendance" ? (
        <>
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-3 ${ph("summary")}`}>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_events}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsInRange")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_attended}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRecordsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.attendance_percentage}%</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRateLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.average_feedback_rating ?? "—"}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("avgFeedbackRating")}</p>
            </div>
          </div>

          <div className={`grid gap-4 lg:grid-cols-3 print:grid-cols-3 print:gap-3 ${ph("charts")}`}>
            <div className="print:break-inside-avoid lg:col-span-2 print:col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("eventsPerMonth")}</h3>
              <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("eventsPerMonthDesc")}</p>
              <BarChart data={perMonthChartData} color="#4FBEB0" dark />
            </div>
            <div className="print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 flex flex-col items-center justify-center print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white self-start mb-2 print:text-[#005f63]">{t("overallAttendance")}</h3>
              <DonutChart percentage={summary.attendance_percentage} color="#4FBEB0" label={`${summary.total_attended} ${t("ofLabel")} ${summary.total_eligible} ${t("ofEligibleResidents")}`} dark />
            </div>
          </div>

          <div className={`print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("age")}`}>
            <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("attendanceByAgeGroup")}</h3>
            <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("adviserProfilingNote")}</p>
            <BarChart data={ageChartData} color="#E8B84A" dark />
          </div>

          <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("events")}`}>
            <h3 className="text-lg font-bold text-white mb-4 print:break-after-avoid print:text-[#005f63]">{t("perEventBreakdown")}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perEvent.map((ev: any) => (
                <div key={ev.id} className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-5 print:border-gray-100 print:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-white text-base truncate print:text-[#005f63]">{ev.name}</p>
                    {ev.status && (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${EVENT_STATUS_PILL[ev.status] ?? EVENT_STATUS_PILL.Past}`}>{t(`rptStatus${ev.status}`)}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-white/40 mt-1 print:text-gray-500">
                    {ev.date}{ev.start_time ? ` · ${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ""}` : ""}
                  </p>
                  {ev.location && <p className="text-xs text-white/40 mt-0.5 truncate print:text-gray-500">{ev.location}</p>}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden print:bg-gray-200">
                      <div className="h-full bg-[#4FBEB0]" style={{ width: `${ev.percentage}%` }} />
                    </div>
                    <span className="text-sm font-bold text-white shrink-0 print:text-[#005f63]">{ev.percentage}%</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1.5 print:text-gray-500">{ev.attended} / {ev.eligible} {t("attendedOfEligible")}</p>
                  {ev.approved_budget !== null && (
                    <p className="text-xs text-white/40 mt-1.5 print:text-gray-500">
                      {t("budgetColon")} ₱{Number(ev.approved_budget).toLocaleString()} · {t("spentColon")} ₱{Number(ev.total_expenses).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* On-screen attendee lists: one expandable row per event. Lists
              load on demand. (Hidden on paper -- the printed version below
              is built from the events picked in Print & Export Options.) */}
          <div className="print:hidden rounded-[30px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">{t("rptRecordsScreenTitle")}</h3>
                <p className="mt-0.5 text-xs text-white/40">{t("rptRecordsScreenDesc")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {([["all", "rptAttAll"], ["present", "rptAttPresent"], ["absent", "rptAttAbsent"]] as [AttendeeFilter, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAttendeeFilter(k)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${attendeeFilter === k ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"}`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedEvents(expandedEvents.length === allEventIds.length ? [] : allEventIds)}
                  className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                >
                  {expandedEvents.length === allEventIds.length ? t("rptCollapseAll") : t("rptExpandAll")}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {perEvent.map((ev: any) => {
                const id = String(ev.id);
                const open = expandedEvents.includes(id);
                const rows = attendeeCache[cacheKey(id)];
                return (
                  <div key={id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                    <button type="button" onClick={() => toggleExpanded(id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.04]">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="truncate font-bold text-white">{ev.name}</p>
                          {ev.status && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${EVENT_STATUS_PILL[ev.status] ?? EVENT_STATUS_PILL.Past}`}>{t(`rptStatus${ev.status}`)}</span>
                          )}
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{ev.date}</span>
                          {ev.start_time && (
                            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ""}</span>
                          )}
                          {ev.location && (
                            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>
                          )}
                        </p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-6 text-center sm:flex">
                        <div><p className="text-lg font-black text-white">{ev.eligible}</p><p className="text-[10px] uppercase tracking-wide text-white/40">{t("rptStatRegistered")}</p></div>
                        <div><p className="text-lg font-black text-emerald-300">{ev.attended}</p><p className="text-[10px] uppercase tracking-wide text-white/40">{t("rptStatPresent")}</p></div>
                        <div><p className="text-lg font-black text-red-300">{ev.absent ?? Math.max(0, ev.eligible - ev.attended)}</p><p className="text-[10px] uppercase tracking-wide text-white/40">{t("rptStatAbsent")}</p></div>
                      </div>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="border-t border-white/10 px-5 py-4">
                        {rows === undefined ? <Skeleton className="h-32 rounded-xl" /> : renderAttendeeTable(rows, "screen")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Printed attendee lists -- only for the events chosen in Print &
              Export Options, and only once their lists have been loaded. */}
          {hasSection("records") && printRecordEvents.length > 0 && (
            <div className={`hidden print:block ${selectedSections.attendance.length > 1 ? "print:break-before-page" : ""}`}>
              <h3 className="text-lg font-black uppercase tracking-wide text-[#005f63] print:break-after-avoid">{t("rptRecordsScreenTitle")}</h3>
              <p className="mt-0.5 text-[10px] text-[#667777]">{attendeeFilterLabel} · {printRecordEvents.length} {t("rptEventsWord")}</p>
              {printRecordEvents.map((ev: any) => {
                const rows = attendeeCache[cacheKey(String(ev.id))] ?? [];
                return (
                  <div key={ev.id} className="mt-5">
                    <div className="mb-1.5 flex items-end justify-between gap-4 border-b-2 border-[#4FBEB0] pb-1.5 print:break-after-avoid">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-black">{ev.name}</p>
                        <p className="text-[10px] text-[#222]">
                          {ev.date}{ev.start_time ? ` · ${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ""}` : ""}{ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-[10px] font-semibold text-[#111]">
                        {t(`rptStatus${ev.status ?? "Past"}`)} · {ev.eligible} {t("rptStatRegistered")} · {ev.attended} {t("rptStatPresent")} · {ev.absent ?? Math.max(0, ev.eligible - ev.attended)} {t("rptStatAbsent")}
                      </p>
                    </div>
                    {renderAttendeeTable(rows, "print")}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : reportType === "membership" ? (
        <>
          <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 print:grid-cols-2 print:gap-3 ${ph("summary")}`}>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Award className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_memberships}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalMembershipsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_assignments}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalEnrolledResidentsLabel")}</p>
            </div>
          </div>

          <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("memberships")}`}>
            <h3 className="text-lg font-bold text-white mb-3 print:break-after-avoid print:text-[#005f63]">{t("enrollmentByMembershipLabel")}</h3>
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
          <div className={`space-y-4 print:space-y-3 ${ph("summary")}`}>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-3">
              <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
                <Wallet className="h-5 w-5 opacity-80" />
                <h2 className="mt-2 text-3xl font-black">{peso(budgetSummary.total_approved_budget)}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalApprovedBudgetLabel")}</p>
              </div>
              <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
                <TrendingUp className="h-5 w-5 opacity-80" />
                <h2 className="mt-2 text-3xl font-black">{peso(budgetSummary.total_expenses)}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalSpentLabel")}</p>
              </div>
              <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
                <CalendarDays className="h-5 w-5 opacity-80" />
                <h2 className="mt-2 text-3xl font-black">{peso(budgetSummary.total_remaining)}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("remainingBudgetLabel")}</p>
              </div>
              <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
                <Star className="h-5 w-5 opacity-80" />
                <h2 className="mt-2 text-3xl font-black">{budgetSummary.events_over_budget}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsOverBudgetLabel")}</p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-3">
              <div className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-[#ddd5ca] print:bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45 print:text-gray-500">{t("rptBudgetUsed")}</p>
                <p className="mt-1 text-2xl font-black text-white print:text-[#005f63]">{budgetSummary.utilization_percentage ?? 0}%</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10 print:bg-gray-200">
                  <div className={`h-full ${(budgetSummary.utilization_percentage ?? 0) > 100 ? "bg-red-400" : "bg-[#4FBEB0]"}`} style={{ width: `${Math.min(100, budgetSummary.utilization_percentage ?? 0)}%` }} />
                </div>
              </div>
              <div className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-[#ddd5ca] print:bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45 print:text-gray-500">{t("rptTotalOver")}</p>
                <p className={`mt-1 text-2xl font-black ${(budgetSummary.total_over_amount ?? 0) > 0 ? "text-red-400 print:text-red-600" : "text-white print:text-[#005f63]"}`}>{peso(budgetSummary.total_over_amount)}</p>
              </div>
              <div className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-[#ddd5ca] print:bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45 print:text-gray-500">{t("rptNearLimit")}</p>
                <p className={`mt-1 text-2xl font-black ${(budgetSummary.events_near_limit ?? 0) > 0 ? "text-amber-300 print:text-amber-700" : "text-white print:text-[#005f63]"}`}>{budgetSummary.events_near_limit ?? 0}</p>
              </div>
              <div className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-[#ddd5ca] print:bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45 print:text-gray-500">{t("rptExpenseEntries")}</p>
                <p className="mt-1 text-2xl font-black text-white print:text-[#005f63]">{budgetSummary.total_expense_entries ?? 0}</p>
                {(budgetSummary.events_without_budget ?? 0) > 0 && (
                  <p className="mt-1 text-[11px] text-white/40 print:text-gray-500">{budgetSummary.events_without_budget} · {t("rptSecNoBudget").toLowerCase()}</p>
                )}
              </div>
            </div>
          </div>

          <div className={`rounded-[30px] border p-5 ${overBudgetList.length > 0 ? "border-red-500/25 bg-red-500/[0.06] print:border-red-200 print:bg-white" : "border-white/10 bg-white/[0.03] print:border-[#ddd5ca] print:bg-white"} ${ph("overBudget")}`}>
            <div className="mb-4 flex items-start justify-between gap-3 print:break-after-avoid">
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl print:hidden ${overBudgetList.length > 0 ? "bg-red-500/15 text-red-300" : "bg-[#4FBEB0]/15 text-[#4FBEB0]"}`}>
                  {overBudgetList.length > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("rptOverBudgetTitle")}</h3>
                  <p className="mt-0.5 text-xs text-white/45 print:text-gray-500">{t("rptOverBudgetDesc")}</p>
                </div>
              </div>
              {overBudgetList.length > 0 && (
                <span className="shrink-0 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 print:bg-red-50 print:text-red-600">{overBudgetList.length}</span>
              )}
            </div>
            {overBudgetList.length === 0 ? (
              <p className="rounded-2xl border border-[#4FBEB0]/25 bg-[#4FBEB0]/[0.07] px-4 py-3 text-sm text-[#7DD8CB] print:border-teal-100 print:bg-teal-50 print:text-teal-700">{t("rptNoOverBudget")}</p>
            ) : (
              <div className="space-y-2.5">
                {overBudgetList.map((ev: any) => (
                  <div key={ev.id} className="print:break-inside-avoid rounded-2xl border border-red-500/20 bg-white/[0.04] p-4 print:border-red-100 print:bg-red-50/60">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white print:text-[#005f63]">{ev.name}</p>
                        <p className="mt-0.5 text-xs text-white/45 print:text-gray-500">{ev.date} · {t(`rptStatus${ev.event_status}`)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <span className="text-white/60 print:text-gray-600">{t("rptApproved")} <b className="text-white print:text-gray-800">{peso(ev.approved_budget)}</b></span>
                        <span className="text-white/60 print:text-gray-600">{t("rptSpent")} <b className="text-white print:text-gray-800">{peso(ev.total_expenses)}</b></span>
                        <span className="font-bold text-red-400 print:text-red-600">{t("rptOverBy")} {peso(ev.over_by)}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10 print:bg-gray-200"><div className="h-full w-full bg-red-400" /></div>
                      <span className="shrink-0 text-xs font-bold text-red-300 print:text-red-600">{ev.utilization}% {t("rptUsed")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("perEvent")}`}>
            <h3 className="text-lg font-bold text-white mb-3 print:break-after-avoid print:text-[#005f63]">{t("budgetPerEventLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {budgetPerEvent.map((ev: any) => {
                const st = BUDGET_STATUS_PILL[ev.budget_status] ?? BUDGET_STATUS_PILL["Within budget"];
                return (
                  <div key={ev.id} className={`print:break-inside-avoid rounded-2xl border p-4 ${ev.is_over_budget ? "border-red-500/25 bg-red-500/10 print:border-red-200 print:bg-red-50" : "border-white/10 bg-white/[0.04] print:border-gray-100 print:bg-gray-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{ev.name}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{t(st.key)}</span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5 print:text-gray-500">{ev.date} · {t(`rptStatus${ev.event_status}`)}</p>
                    <p className="text-[11px] text-white/50 mt-2 print:text-gray-600">{t("budgetColon")} {peso(ev.approved_budget)}</p>
                    <p className="text-[11px] text-white/50 print:text-gray-600">{t("spentColon")} {peso(ev.total_expenses)} · {ev.expense_count} {ev.expense_count === 1 ? t("rptEntryWord") : t("rptEntriesWord")}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 print:bg-gray-200">
                        <div className={`h-full ${ev.is_over_budget ? "bg-red-400" : ev.budget_status === "Near limit" ? "bg-amber-400" : "bg-[#4FBEB0]"}`} style={{ width: `${Math.min(100, ev.utilization)}%` }} />
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-white/70 print:text-gray-700">{ev.utilization}%</span>
                    </div>
                    <p className={`text-[11px] font-semibold mt-1.5 ${ev.is_over_budget ? "text-red-400 print:text-red-600" : "text-[#7DD8CB] print:text-teal-700"}`}>
                      {ev.is_over_budget ? t("overBudgetByLabel") : t("remainingLabel")} {peso(Math.abs(ev.remaining))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Itemized expenses -- one expandable row per event on screen;
              printed as full tables (below) when selected. */}
          {budgetEventsAll.length > 0 && (
            <div className="print:hidden rounded-[30px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{t("rptExpensesTitle")}</h3>
                  <p className="mt-0.5 text-xs text-white/40">{t("rptExpensesDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ids = budgetEventsAll.map((ev: any) => String(ev.id));
                    setExpandedEvents(expandedEvents.length === ids.length ? [] : ids);
                  }}
                  className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                >
                  {expandedEvents.length === budgetEventsAll.length ? t("rptCollapseAll") : t("rptExpandAll")}
                </button>
              </div>
              <div className="space-y-3">
                {budgetEventsAll.map((ev: any) => {
                  const id = String(ev.id);
                  const open = expandedEvents.includes(id);
                  const hasBudget = ev.approved_budget !== undefined;
                  return (
                    <div key={id} className={`overflow-hidden rounded-2xl border ${ev.is_over_budget ? "border-red-500/25 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.04]"}`}>
                      <button type="button" onClick={() => toggleExpanded(id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.04]">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <p className="truncate font-bold text-white">{ev.name}</p>
                            {hasBudget ? (
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${(BUDGET_STATUS_PILL[ev.budget_status] ?? BUDGET_STATUS_PILL["Within budget"]).cls}`}>{t((BUDGET_STATUS_PILL[ev.budget_status] ?? BUDGET_STATUS_PILL["Within budget"]).key)}</span>
                            ) : (
                              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/55">{t("rptNoBudgetSet")}</span>
                            )}
                          </div>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{ev.date}</span>
                            <span>{t(`rptStatus${ev.event_status}`)}</span>
                            <span>{ev.expense_count} {ev.expense_count === 1 ? t("rptEntryWord") : t("rptEntriesWord")}</span>
                          </p>
                        </div>
                        <div className="hidden shrink-0 items-center gap-6 text-center sm:flex">
                          {hasBudget && (
                            <div><p className="text-base font-black text-white">{peso(ev.approved_budget)}</p><p className="text-[10px] uppercase tracking-wide text-white/40">{t("rptApproved")}</p></div>
                          )}
                          <div><p className="text-base font-black text-gold-300">{peso(ev.total_expenses)}</p><p className="text-[10px] uppercase tracking-wide text-white/40">{t("rptSpent")}</p></div>
                          {hasBudget && (
                            <div>
                              <p className={`text-base font-black ${ev.is_over_budget ? "text-red-400" : "text-[#7DD8CB]"}`}>{peso(Math.abs(ev.remaining))}</p>
                              <p className="text-[10px] uppercase tracking-wide text-white/40">{ev.is_over_budget ? t("rptOverBy") : t("remainingLabel")}</p>
                            </div>
                          )}
                        </div>
                        <ChevronDown className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open && <div className="border-t border-white/10 px-5 py-4">{renderExpenseTable(ev.expenses ?? [], ev.total_expenses, "screen")}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasSection("expenses") && printExpenseEvents.length > 0 && (
            <div className={`hidden print:block ${selectedSections.budget.length > 1 ? "print:break-before-page" : ""}`}>
              <h3 className="text-lg font-black uppercase tracking-wide text-[#005f63] print:break-after-avoid">{t("rptExpensesTitle")}</h3>
              {printExpenseEvents.map((ev: any) => (
                <div key={ev.id} className="mt-5">
                  <div className="mb-1.5 flex items-end justify-between gap-4 border-b-2 border-[#4FBEB0] pb-1.5 print:break-after-avoid">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#005f63]">{ev.name}</p>
                      <p className="text-[10px] text-[#667777]">{ev.date} · {t(`rptStatus${ev.event_status}`)}</p>
                    </div>
                    <p className={`shrink-0 text-[10px] font-semibold ${ev.is_over_budget ? "text-red-600" : "text-[#005f63]"}`}>
                      {ev.approved_budget !== undefined
                        ? `${t("rptApproved")} ${peso(ev.approved_budget)} · ${t("rptSpent")} ${peso(ev.total_expenses)} · ${ev.is_over_budget ? `${t("rptOverBy")} ${peso(ev.over_by)}` : `${t("remainingLabel")} ${peso(ev.remaining)}`}`
                        : `${t("rptNoBudgetSet")} · ${t("rptSpent")} ${peso(ev.total_expenses)}`}
                    </p>
                  </div>
                  {renderExpenseTable(ev.expenses ?? [], ev.total_expenses, "print")}
                </div>
              ))}
            </div>
          )}

          {topExpenses.length > 0 && (
            <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("topExpenses")}`}>
              <h3 className="text-lg font-bold text-white mb-3 print:break-after-avoid print:text-[#005f63]">{t("topExpensesLabel")}</h3>
              <div className="space-y-2">
                {topExpenses.map((ex: any, i: number) => (
                  <div key={i} className="print:break-inside-avoid flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-sm print:bg-gray-50 print:border-gray-100">
                    <div>
                      <p className="font-semibold text-white print:text-gray-800">{ex.item}</p>
                      <p className="text-xs text-white/40 print:text-gray-500">{ex.event_name}</p>
                    </div>
                    <span className="font-bold text-gold-300 print:text-[#005f63]">{peso(ex.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unbudgeted.length > 0 && (
            <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("noBudget")}`}>
              <h3 className="text-lg font-bold text-white print:break-after-avoid print:text-[#005f63]">{t("rptNoBudgetTitle")}</h3>
              <p className="mt-0.5 mb-3 text-xs text-white/45 print:text-gray-500">{t("rptNoBudgetDesc")}</p>
              <div className="space-y-2">
                {unbudgeted.map((ev: any) => (
                  <div key={ev.id} className="print:break-inside-avoid flex items-center justify-between gap-4 rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-sm print:bg-gray-50 print:border-gray-100">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white print:text-gray-800">{ev.name}</p>
                      <p className="text-xs text-white/40 print:text-gray-500">{ev.date} · {t(`rptStatus${ev.event_status}`)} · {ev.expense_count} {ev.expense_count === 1 ? t("rptEntryWord") : t("rptEntriesWord")}</p>
                    </div>
                    <span className="shrink-0 font-bold text-gold-300 print:text-[#005f63]">{peso(ev.total_expenses)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 print:grid-cols-2 print:gap-3 ${ph("summary")}`}>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Package className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_items}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalInventoryItemsLabel")}</p>
            </div>
            <div className="print:break-inside-avoid rounded-[30px] print:rounded-2xl print:p-3.5 bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_quantity}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalQuantityLabel")}</p>
            </div>
          </div>

          <div className={`print:break-inside-avoid rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("condition")}`}>
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("byConditionLabel")}</h3>
            <div className="flex flex-wrap gap-2">
              {byCondition.map((c: any) => (
                <span key={c.condition} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${conditionColor[c.condition] ?? "bg-white/10 text-white/60 print:bg-gray-100 print:text-gray-600"}`}>
                  {conditionLabel(c.condition)}: {c.count} {t("itemsLabel")} ({c.quantity} {t("unitsLabel")})
                </span>
              ))}
            </div>
          </div>

          <div className={`rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white ${ph("items")}`}>
            <h3 className="text-lg font-bold text-white mb-3 print:break-after-avoid print:text-[#005f63]">{t("inventoryItemsLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inventoryItems.map((item: any) => (
                <div key={item.id} className="print:break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
                  <p className="font-bold text-white text-sm truncate print:text-[#005f63]">{item.name}</p>
                  <p className="text-xs text-white/40 mt-0.5 print:text-gray-500">{item.storage_location || "—"}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${conditionColor[item.condition] ?? "bg-white/10 text-white/60 print:bg-gray-100 print:text-gray-600"}`}>
                      {conditionLabel(item.condition)}
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
      <div className="hidden print:block print:mt-10 pt-4 border-t border-[#ddd5ca] [break-inside:avoid]">
        <div className="mt-6 grid grid-cols-2 gap-16 px-2">
          <div>
            <p className="text-[12px] font-bold text-[#1a1a1a]">{t("rbPreparedBy")}</p>
            <div className="mt-12 mx-8 min-h-[1.25rem] pb-0.5 text-center text-[13px] font-black uppercase tracking-wide text-black">{officials.secretary?.name ?? ""}</div>
            <div className="mx-8 border-t border-[#667777] pt-1 text-center text-[12px] font-normal text-[#1a1a1a]">{t("rbBrgySecretary")}</div>
          </div>
          <div>
            <p className="text-[12px] font-bold text-[#1a1a1a]">{t("rbNoted")}</p>
            <div className="mt-12 mx-8 min-h-[1.25rem] pb-0.5 text-center text-[13px] font-black uppercase tracking-wide text-black">{officials.captain?.name ?? ""}</div>
            <div className="mx-8 border-t border-[#667777] pt-1 text-center text-[12px] font-normal text-[#1a1a1a]">{t("printBarangayCaptainLabel")}</div>
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

      {/* Print & Export Options -- choose what to include (and, for the
          attendance report, which events get a full attendee list) before
          printing or downloading Word / PDF. */}
      <ReportOptionsModal
        open={optionsMode !== null}
        mode={optionsMode ?? "print"}
        reportLabel={tUI(REPORT_TYPES.find((r) => r.key === reportType)!.labelKey)}
        sections={SECTION_DEFS[reportType]}
        selected={selectedSections[reportType]}
        onSelectedChange={setSectionsForType}
        recordEvents={recordEventOptions}
        recordIds={effectiveRecordIds}
        onRecordIdsChange={setRecordEventIds}
        attendeeFilter={attendeeFilter}
        onAttendeeFilterChange={setAttendeeFilter}
        busy={preparing || downloading}
        onClose={() => setOptionsMode(null)}
        onPrint={handlePrintConfirmed}
        onDownload={(format) => setConfirmDownload(format)}
        t={tUI}
      />

      <ConfirmDialog
        open={confirmDownload !== null}
        icon={<Download className="h-9 w-9" />}
        title={tUI("confirmDownloadReportTitle")}
        body={confirmDownload === "word" ? tUI("confirmDownloadReportBodyWord") : tUI("confirmDownloadReportBodyPdf")}
        cancelLabel={tUI("cancelLabel")}
        confirmLabel={tUI("downloadLabel")}
        z={9999}
        onCancel={() => setConfirmDownload(null)}
        onConfirm={() => {
          const format = confirmDownload;
          setConfirmDownload(null);
          if (format) handleDownload(format);
        }}
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
