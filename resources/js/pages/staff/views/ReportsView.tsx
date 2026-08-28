import React, { useEffect, useMemo, useState } from "react";
import { Filter, Printer, TrendingUp, Users, CalendarDays, Star } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { BarChart, DonutChart } from "../../../components/ui/Charts";
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

/**
 * Adviser recommendation: "Filtering (First) Data Analytics — Date, Summary
 * — Attendance, Percentage" + "What Events usually happen per year /
 * attendees" + "Profiling (Filter for Age)". Also satisfies UC-10 (Generate
 * Printable Reports).
 *
 * Deliberately built as cards + charts rather than another data table —
 * this is a "read the summary at a glance" screen, not a record list.
 */
export default function ReportsView({ memberships = [] }: ReportsViewProps) {
  const { t } = useLanguage();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (membershipId) params.membership_id = membershipId;
      if (ageGroup) params.age_group = ageGroup;

      const res = await api.get("/reports/attendance-summary", { params });
      setData(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadReportFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, membershipId, ageGroup]);

  const summary = data?.summary ?? {
    total_events: 0,
    total_eligible: 0,
    total_attended: 0,
    attendance_percentage: 0,
    average_feedback_rating: null,
  };

  const perMonthChartData = useMemo(
    () => (data?.per_month ?? []).map((m: any) => ({ label: m.month, value: m.events })),
    [data]
  );

  const ageChartData = useMemo(
    () => (data?.age_breakdown ?? []).map((a: any) => ({ label: a.group, value: a.attended })),
    [data]
  );

  const perEvent = data?.per_event ?? [];

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

        <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-600">{t("fromLabel")}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 px-3 rounded-full border border-[#005f63]/20 bg-white text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-600">{t("toLabel")}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 px-3 rounded-full border border-[#005f63]/20 bg-white text-sm" />
          </div>
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
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      ) : (
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
            {perEvent.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">{t("noEventsMatchFilters")}</p>
            ) : (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
