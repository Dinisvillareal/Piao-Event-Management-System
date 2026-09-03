import React, { useEffect, useMemo, useState } from "react";
import { Filter, Printer, TrendingUp, Users, CalendarDays, Star, Award, Wallet, Package, XCircle } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { BarChart, DonutChart } from "../../../components/ui/Charts";
import DateRangePicker from "../../../components/ui/DateRangePicker";
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

  const conditionColor: Record<string, string> = {
    New: "bg-teal-50 text-teal-700",
    Good: "bg-emerald-50 text-emerald-700",
    Fair: "bg-amber-50 text-amber-700",
    Poor: "bg-orange-50 text-orange-700",
    Disposed: "bg-gray-100 text-gray-500",
    Lost: "bg-red-50 text-red-600",
  };

  const isEmpty =
    (reportType === "attendance" && !loading && perEvent.length === 0) ||
    (reportType === "membership" && !loading && perMembership.length === 0) ||
    (reportType === "budget" && !loading && budgetPerEvent.length === 0) ||
    (reportType === "inventory" && !loading && inventoryItems.length === 0);

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 print:static">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("reports")}</h1>
            <p className="mt-1 text-sm text-[#667777]">{t("reportsSubtitle")}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center gap-2 self-start sm:self-auto bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm"
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
                  ? "bg-[#005f63] text-white shadow-sm"
                  : "bg-white border border-[#005f63]/20 text-[#005f63] hover:bg-teal-50"
              }`}
            >
              <rt.icon className="h-4 w-4" /> {t(rt.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#005f63]/60 print:hidden">
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
              />
              <div className="relative">
                <select value={membershipId} onChange={(e) => setMembershipId(e.target.value)} className="h-11 pl-9 pr-6 rounded-full border border-[#005f63]/20 bg-white text-sm appearance-none">
                  <option value="">{t("allMembershipsOption")}</option>
                  {memberships.map((m) => (
                    <option key={m.id} value={String(m.id)}>{m.name}</option>
                  ))}
                </select>
                <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className="h-11 pl-9 pr-6 rounded-full border border-[#005f63]/20 bg-white text-sm appearance-none">
                  {AGE_GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>{t(g.labelKey)}</option>
                  ))}
                </select>
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              </div>
            </>
          )}

          {reportType === "membership" && (
            <div className="relative">
              <select value={membershipId} onChange={(e) => setMembershipId(e.target.value)} className="h-11 pl-9 pr-6 rounded-full border border-[#005f63]/20 bg-white text-sm appearance-none">
                <option value="">{t("allMembershipsOption")}</option>
                {memberships.map((m) => (
                  <option key={m.id} value={String(m.id)}>{m.name}</option>
                ))}
              </select>
              <Award className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
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
            />
          )}

          {reportType === "inventory" && (
            <div className="relative">
              <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)} className="h-11 pl-9 pr-6 rounded-full border border-[#005f63]/20 bg-white text-sm appearance-none">
                <option value="">{t("allConditionsOption")}</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      ) : isEmpty ? (
        // UC-10 extension 4a: no records exist for the selected type/range
        <div className="rounded-[30px] border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400 italic">
          {t("noDataAvailableForReport")}
        </div>
      ) : reportType === "attendance" ? (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_events}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsInRange")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.total_attended}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRecordsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.attendance_percentage}%</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("attendanceRateLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{summary.average_feedback_rating ?? "—"}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("avgFeedbackRating")}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-[30px] border border-[#ddd5ca] bg-white p-5">
              <h3 className="text-lg font-bold text-[#005f63]">{t("eventsPerMonth")}</h3>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">{t("eventsPerMonthDesc")}</p>
              <BarChart data={perMonthChartData} />
            </div>
            <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 flex flex-col items-center justify-center">
              <h3 className="text-lg font-bold text-[#005f63] self-start mb-2">{t("overallAttendance")}</h3>
              <DonutChart percentage={summary.attendance_percentage} label={`${summary.total_attended} ${t("ofLabel")} ${summary.total_eligible} ${t("ofEligibleResidents")}`} />
            </div>
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63]">{t("attendanceByAgeGroup")}</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">{t("adviserProfilingNote")}</p>
            <BarChart data={ageChartData} color="#ff7a28" />
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("perEventBreakdown")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perEvent.map((ev: any) => (
                <div key={ev.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="font-bold text-[#005f63] text-sm truncate">{ev.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ev.date}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full bg-[#3ec5c5]" style={{ width: `${ev.percentage}%` }} />
                    </div>
                    <span className="text-xs font-bold text-[#005f63] shrink-0">{ev.percentage}%</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{ev.attended} / {ev.eligible} {t("attendedOfEligible")}</p>
                  {ev.approved_budget !== null && (
                    <p className="text-[11px] text-gray-500 mt-1">
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
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <Award className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_memberships}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalMembershipsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <Users className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{membershipSummary.total_assignments}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalEnrolledResidentsLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("enrollmentByMembershipLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perMembership.map((m: any) => (
                <div key={m.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="font-bold text-[#005f63] text-sm truncate">{m.name}</p>
                  <p className="mt-1 text-2xl font-black text-gray-800">{m.member_count}</p>
                  <p className="text-[11px] text-gray-500">{t("membersLabel")}</p>
                  {(m.eligible_age_bracket || m.eligible_civil_status || m.eligible_gender) && (
                    <p className="mt-2 text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-1 inline-block">
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
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <Wallet className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_approved_budget).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalApprovedBudgetLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_expenses).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalSpentLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <CalendarDays className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">₱{Number(budgetSummary.total_remaining).toLocaleString()}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("remainingBudgetLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <Star className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{budgetSummary.events_over_budget}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("eventsOverBudgetLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("budgetPerEventLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {budgetPerEvent.map((ev: any) => (
                <div key={ev.id} className={`rounded-2xl border p-4 ${ev.is_over_budget ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                  <p className="font-bold text-[#005f63] text-sm truncate">{ev.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ev.date}</p>
                  <p className="text-[11px] text-gray-600 mt-2">{t("budgetColon")} ₱{Number(ev.approved_budget).toLocaleString()}</p>
                  <p className="text-[11px] text-gray-600">{t("spentColon")} ₱{Number(ev.total_expenses).toLocaleString()}</p>
                  <p className={`text-[11px] font-semibold mt-1 ${ev.is_over_budget ? "text-red-600" : "text-teal-700"}`}>
                    {ev.is_over_budget ? t("overBudgetByLabel") : t("remainingLabel")} ₱{Number(Math.abs(ev.remaining)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {topExpenses.length > 0 && (
            <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
              <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("topExpensesLabel")}</h3>
              <div className="space-y-2">
                {topExpenses.map((ex: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-gray-800">{ex.item}</p>
                      <p className="text-xs text-gray-500">{ex.event_name}</p>
                    </div>
                    <span className="font-bold text-[#005f63]">₱{Number(ex.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] to-[#3ec5c5] p-5 text-white shadow-sm">
              <Package className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_items}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalInventoryItemsLabel")}</p>
            </div>
            <div className="rounded-[30px] bg-gradient-to-r from-orange-400 to-yellow-300 p-5 text-white shadow-sm">
              <TrendingUp className="h-5 w-5 opacity-80" />
              <h2 className="mt-2 text-3xl font-black">{inventorySummary.total_quantity}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t("totalQuantityLabel")}</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("byConditionLabel")}</h3>
            <div className="flex flex-wrap gap-2">
              {byCondition.map((c: any) => (
                <span key={c.condition} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${conditionColor[c.condition] ?? "bg-gray-100 text-gray-600"}`}>
                  {c.condition}: {c.count} {t("itemsLabel")} ({c.quantity} {t("unitsLabel")})
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5">
            <h3 className="text-lg font-bold text-[#005f63] mb-3">{t("inventoryItemsLabel")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inventoryItems.map((item: any) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="font-bold text-[#005f63] text-sm truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.storage_location || "—"}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${conditionColor[item.condition] ?? "bg-gray-100 text-gray-600"}`}>
                      {item.condition}
                    </span>
                    <span className="text-sm font-bold text-gray-800">×{item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{error}</p>
            <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
