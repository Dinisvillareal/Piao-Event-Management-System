import React, { useEffect, useMemo, useState } from "react";
import { Filter, Printer, TrendingUp, Users, CalendarDays, Star, Award, Wallet, Package } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { BarChart, DonutChart } from "../../../components/ui/Charts";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import StatusModal from "../../../components/ui/StatusModal";
import { useLanguage } from "../../../i18n/LanguageContext";

interface Membership {
  id: string | number;
  name: string;
}

interface ReportsViewProps {
  memberships?: Membership[];
}

const AGE_GROUPS = [
  { key: "", labelKey: "ageAll" },
  { key: "child", labelKey: "ageChild" },
  { key: "youth", labelKey: "ageYouth" },
  { key: "adult", labelKey: "ageAdult" },
  { key: "senior", labelKey: "ageSenior" },
];

const CONDITIONS = ["New", "Good", "Fair", "Poor", "Disposed", "Lost"];

type ReportType = "attendance" | "membership" | "budget" | "inventory";

const REPORT_TYPES: { key: ReportType; labelKey: string; icon: any }[] = [
  { key: "attendance", labelKey: "reportTypeAttendance", icon: CalendarDays },
  { key: "membership", labelKey: "reportTypeMembership", icon: Award },
  { key: "budget", labelKey: "reportTypeBudget", icon: Wallet },
  { key: "inventory", labelKey: "reportTypeInventory", icon: Package },
];

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
export default function ReportsView({ memberships = [] }: ReportsViewProps) {
  const { t } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>("attendance");

  // Attendance-tab filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  // Inventory-tab filter
  const [conditionFilter, setConditionFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (reportType === "attendance") {
        const params: Record<string, string> = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        if (membershipId) params.membership_id = membershipId;
        if (ageGroup) params.age_group = ageGroup;
        res = await api.get("/reports/attendance-summary", { params });
      } else if (reportType === "membership") {
        const params: Record<string, string> = {};
        if (membershipId) params.membership_id = membershipId;
        res = await api.get("/reports/membership-summary", { params });
      } else if (reportType === "budget") {
        const params: Record<string, string> = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        res = await api.get("/reports/budget-summary", { params });
      } else {
        const params: Record<string, string> = {};
        if (conditionFilter) params.condition = conditionFilter;
        res = await api.get("/reports/inventory-summary", { params });
      }
      setData(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadReportFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateFrom, dateTo, membershipId, ageGroup, conditionFilter]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-white print:text-[#005f63]">{t("reports")}</h1>
            <p className="mt-1 text-sm text-white/50 print:text-[#667777]">{t("reportsSubtitle")}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center gap-2 self-start sm:self-auto bg-gold-400 hover:bg-gold-300 text-[#08130F] px-5 py-2.5 rounded-full font-medium transition shadow-sm"
          >
            <Printer className="h-4 w-4" /> {t("printReport")}
          </button>
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
                className="h-11 pl-9 pr-6"
                icon={<Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
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
              className="h-11 pl-9 pr-6"
              icon={<Award className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
              dark
            />
          )}

          {reportType === "budget" && (
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
        <div className="rounded-[30px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-white/40 italic print:border-gray-200 print:bg-white print:text-gray-400">
          {t("noDataAvailableForReport")}
        </div>
      ) : reportType === "attendance" ? (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_events}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsInRange")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_attended}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRecordsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.attendance_percentage}%</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRateLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.average_feedback_rating ?? "—"}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("avgFeedbackRating")}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("eventsPerMonth")}</h3>
              <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("eventsPerMonthDesc")}</p>
              <BarChart data={perMonthChartData} color="#4FBEB0" dark />
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 flex flex-col items-center justify-center print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white self-start mb-2 print:text-[#005f63]">{t("overallAttendance")}</h3>
              <DonutChart percentage={summary.attendance_percentage} color="#4FBEB0" label={`${summary.total_attended} ${t("ofLabel")} ${summary.total_eligible} ${t("ofEligibleResidents")}`} dark />
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white print:text-[#005f63]">{t("attendanceByAgeGroup")}</h3>
            <p className="text-xs text-white/40 mt-0.5 mb-3 print:text-gray-500">{t("adviserProfilingNote")}</p>
            <BarChart data={ageChartData} color="#E8B84A" dark />
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("perEventBreakdown")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perEvent.map((ev: any) => (
                <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Award className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_memberships}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalMembershipsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_assignments}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalEnrolledResidentsLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("enrollmentByMembershipLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perMembership.map((m: any) => (
                <div key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
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
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Wallet className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_approved_budget).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalApprovedBudgetLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_expenses).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalSpentLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-sage-800 to-[#1C2E2B] p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_remaining).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("remainingBudgetLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-[#8A3D2C] to-[#5C2A1E] p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{budgetSummary.events_over_budget}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsOverBudgetLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("budgetPerEventLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {budgetPerEvent.map((ev: any) => (
                <div key={ev.id} className={`rounded-2xl border p-4 ${ev.is_over_budget ? "border-red-500/25 bg-red-500/10 print:border-red-200 print:bg-red-50" : "border-white/10 bg-white/[0.04] print:border-gray-100 print:bg-gray-50"}`}>
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
            <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
              <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("topExpensesLabel")}</h3>
              <div className="space-y-2">
                {topExpenses.map((ex: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-sm print:bg-gray-50 print:border-gray-100">
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="rounded-[30px] bg-gradient-to-r from-sage-400 to-sage-700 p-5 text-white shadow-sm">
              <Package className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_items}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalInventoryItemsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-gold-400 to-gold-700 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_quantity}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalQuantityLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("byConditionLabel")}</h3>
            <div className="flex flex-wrap gap-2">
              {byCondition.map((c: any) => (
                <span key={c.condition} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${conditionColor[c.condition] ?? "bg-white/10 text-white/60 print:bg-gray-100 print:text-gray-600"}`}>
                  {c.condition}: {c.count} {t("itemsLabel")} ({c.quantity} {t("unitsLabel")})
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 print:border-[#ddd5ca] print:bg-white">
            <h3 className="text-lg font-bold text-white mb-3 print:text-[#005f63]">{t("inventoryItemsLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inventoryItems.map((item: any) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:border-gray-100 print:bg-gray-50">
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
        </div>
      </div>

      {/* Error alert -- the shared StatusModal, same convention as every
          other page's success/warning/error popups. */}
      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} />
    </>
  );
}
