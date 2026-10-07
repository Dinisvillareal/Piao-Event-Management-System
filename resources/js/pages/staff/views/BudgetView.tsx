import React, { useEffect, useMemo, useState } from "react";
import { Wallet, Lock, Search, Banknote, PiggyBank, AlertTriangle, RefreshCw } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";

import EventBudgetWorkspace, { type EventOption, NEAR_LIMIT_PCT, money, roundCents, budgetStateOf, type BudgetState } from "../../../components/budget/EventBudgetWorkspace";
import { makeEventTiming, STATUS_META } from "../../../lib/eventTiming";

import { tc } from "../../../lib/contentTranslations";
/**
 * UC-8: Record Event Budget and Expenses. A portfolio-wide KPI strip (total
 * approved, total spent, remaining, events over budget) sits on top of the
 * same master-detail layout this page always needed -- pick an event on the
 * left, work its budget on the right -- so staff get the fleet-wide picture
 * before drilling into any one event's ledger.
 */
export default function BudgetView({ allEvents = [] }: { allEvents?: EventOption[] }) {
  const { t, locale, language } = useLanguage();
  const [search, setSearch] = useState("");
  // Left list: which time bucket to show. "all" keeps every bucket on screen, in sections.
  const [timeTab, setTimeTab] = useState<"all" | "ongoing" | "upcoming" | "past">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Left list filter: every event, only those close to their limit, or only the over-budget ones.
  const [budgetFilter, setBudgetFilter] = useState<"all" | "near" | "over">("all");
  // Portfolio-wide KPI strip -- the same /reports/budget-summary endpoint
  // the Reports and Dashboard pages already use, called with no date
  // range so it covers every event ever recorded. Kept as its OWN fetch,
  // separate from the per-event `summary` below, so the top-of-page
  // totals stay put while browsing/searching the event list, and instead
  // refresh on their own short interval like a real live dashboard.
  const [portfolio, setPortfolio] = useState<{ summary: any; per_event: any[] } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Page-open skeleton: shown every time this page is opened from the
  // sidebar (the view remounts on navigation), until the first portfolio
  // fetch lands. The short minimum keeps it from flashing for a single
  // frame on a fast response, so opening the page always reads as a
  // deliberate load like the other modules.
  const [minLoadElapsed, setMinLoadElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinLoadElapsed(true), 450);
    return () => clearTimeout(id);
  }, []);
  const initialLoading = portfolio === null || !minLoadElapsed;

  const fetchPortfolio = async () => {
    try {
      const res = await api.get("/reports/budget-summary");
      setPortfolio({ summary: res.data?.summary ?? null, per_event: res.data?.per_event ?? [] });
      setLastUpdated(new Date());
    } catch (e) {
      // Silent -- the KPI strip just keeps showing its last good numbers;
      // the per-event panel below has its own error modal if the API is
      // actually unreachable.
      // On the very first load, fall back to an empty portfolio so the
      // page-open skeleton ends instead of spinning forever.
      setPortfolio((p) => p ?? { summary: null, per_event: [] });
    }
  };

  useEffect(() => {
    fetchPortfolio();
    const poll = setInterval(() => fetchPortfolio(), 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Per-event approved/spent figures from that same portfolio call,
  // looked up by event id so the picker list on the left can show each
  // event's own little progress bar without an extra request per row.
  const budgetByEventId = useMemo(() => {
    const map = new Map<string, { approved_budget: number | null; total_expenses: number }>();
    (portfolio?.per_event ?? []).forEach((ev: any) => {
      map.set(String(ev.id), { approved_budget: ev.approved_budget ?? null, total_expenses: Number(ev.total_expenses) || 0 });
    });
    return map;
  }, [portfolio]);

  const portfolioSummary = portfolio?.summary ?? {
    total_events: 0,
    total_approved_budget: 0,
    total_expenses: 0,
    total_remaining: 0,
    events_over_budget: 0,
    total_over_amount: 0,
  };

  const stateOfEvent = (id: string | number): BudgetState => {
    const b = budgetByEventId.get(String(id));
    return budgetStateOf(b?.approved_budget != null ? Number(b.approved_budget) : null, b?.total_expenses ?? 0);
  };
  const searchedEvents = allEvents.filter((e) => e.title?.toLowerCase().includes(search.toLowerCase()));
  const filterCounts = {
    all: searchedEvents.length,
    near: searchedEvents.filter((e) => stateOfEvent(e.id) === "near").length,
    over: searchedEvents.filter((e) => stateOfEvent(e.id) === "over").length,
  };
  const filteredEvents = budgetFilter === "all" ? searchedEvents : searchedEvents.filter((e) => stateOfEvent(e.id) === budgetFilter);

  // Shared event-timing helpers (same ones the budget workspace uses).
  const { getEventStatus, eventWindow, relativeLabel, eventStatusLabel, formatTimeFriendly, parseEventDateTime } = makeEventTiming(t);

  // The event list, bucketed by real status. Ongoing and upcoming read
  // soonest-first; past reads most-recent-first.
  const decoratedEvents = filteredEvents.map((e) => ({ e, status: getEventStatus(e).label, start: eventWindow(e).start?.getTime() ?? 0 }));
  const statusCounts = {
    all: decoratedEvents.length,
    ongoing: decoratedEvents.filter((d) => d.status === "Ongoing").length,
    upcoming: decoratedEvents.filter((d) => d.status === "Upcoming").length,
    past: decoratedEvents.filter((d) => d.status === "Past").length,
  };
  const listSections = (["Ongoing", "Upcoming", "Past"] as const)
    .filter((k) => timeTab === "all" || timeTab === STATUS_META[k].tab)
    .map((k) => ({
      key: k,
      items: decoratedEvents
        .filter((d) => d.status === k)
        .sort((a, b) => (k === "Past" ? b.start - a.start : a.start - b.start)),
    }))
    .filter((sec) => sec.items.length > 0);

  const selectedEvent = allEvents.find((e) => String(e.id) === String(selectedEventId));

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events pages, so Budget
        & Expenses reads as part of the same system instead of the old
        light "paper" page. The smaller modals further below (receipt
        viewer, confirm/success/error/delete) stay on their original light
        theme, same scoping used on every other staff view; the Edit
        Expense modal is darkened along with the page, matching the
        Households/Inventory Edit modal treatment. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-10">
    <div className="mx-auto max-w-[1500px] space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("budget")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("budgetSubtitle")}</p>
        </div>
        {/* Genuinely live -- fetchPortfolio() re-polls /reports/budget-summary
            every 20s (see effect above), this just renders how long ago
            that last landed, ticking every second off nowTick. */}
        <div className="hidden sm:inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/50 shrink-0" title={t("liveLabel")}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          {lastUpdatedLabel}
        </div>
      </div>

      {/* Portfolio KPI strip -- same gradient-card language as the
          Dashboard's stat strip, computed across every event (see
          fetchPortfolio above), not just the one currently selected. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { value: `₱${Number(portfolioSummary.total_approved_budget || 0).toLocaleString()}`, label: t("totalApprovedBudgetStatLabel"), description: t("totalApprovedBudgetStatDesc"), icon: Wallet, gradient: "from-sage-400 to-sage-700" },
          { value: `₱${Number(portfolioSummary.total_expenses || 0).toLocaleString()}`, label: t("totalSpentStatLabel"), description: t("totalSpentStatDesc"), icon: Banknote, gradient: "from-gold-400 to-gold-700" },
          { value: money(Number(portfolioSummary.total_remaining || 0)), label: t("remainingBudgetStatLabel"), description: t("remainingBudgetStatDesc"), icon: PiggyBank, gradient: "from-sage-800 to-[#1C2E2B]" },
          { value: portfolioSummary.events_over_budget || 0, label: t("eventsOverBudgetStatLabel"), description: Number(portfolioSummary.total_over_amount) > 0 ? t("totalOverAmountDesc").replace("{over}", money(Number(portfolioSummary.total_over_amount))) : t("eventsOverBudgetStatDesc"), icon: AlertTriangle, gradient: "from-[#8A3D2C] to-[#5C2A1E]" },
        ].map((card, idx) => initialLoading ? (
          <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-6 text-white shadow-sm transition-shadow duration-300 hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums] break-all">{card.value}</h2>
              <card.icon className="h-5 w-5 text-white/40 shrink-0" />
            </div>
            <p className="mt-2.5 text-[12px] font-bold uppercase tracking-wide">{card.label}</p>
            <p className="mt-0.5 text-xs text-white/75">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.85fr)_1.5fr] lg:items-start">
        <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 lg:sticky lg:top-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-white">{t("budgetEventsHeading")}</h2>
            <span className="text-xs font-medium text-white/45">{t("budgetEventsShowing").replace("{n}", String(filteredEvents.length)).replace("{total}", String(allEvents.length))}</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchEventsPlaceholderShort")}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>

          {/* When: Ongoing / Upcoming / Past, with live counts. */}
          <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.04] p-1" role="tablist" aria-label={t("budgetEventsHeading")}>
            {([
              ["all", t("budgetFilterAll")],
              ["ongoing", t("timeTabOngoing")],
              ["upcoming", t("timeTabUpcoming")],
              ["past", t("timeTabPast")],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={timeTab === key}
                onClick={() => setTimeTab(key)}
                className={`flex flex-col items-center rounded-lg px-1 py-2 leading-tight transition ${
                  timeTab === key ? "bg-sage-700 text-white shadow-sm" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="text-[13px] font-bold">{label}</span>
                <span className={`mt-0.5 text-xs font-semibold ${timeTab === key ? "text-white/80" : "text-white/40"}`}>{statusCounts[key]}</span>
              </button>
            ))}
          </div>

          {/* Budget health: all events, only those close to their limit, or only those over. */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/40">{t("budgetFilterLabel")}</span>
            {([
              ["all", t("budgetFilterAll")],
              ["near", t("budgetFilterNear")],
              ["over", t("budgetFilterOver")],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBudgetFilter(key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                  budgetFilter === key
                    ? key === "over" ? "bg-red-500 text-white" : key === "near" ? "bg-amber-500 text-white" : "bg-sage-700 text-white"
                    : "border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${budgetFilter === key ? "bg-white/25" : "bg-white/10"}`}>{filterCounts[key]}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 -mr-2 min-h-[320px] max-h-[calc(100vh-24rem)] overflow-y-auto pr-2 space-y-6 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            {initialLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 space-y-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-1/4" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : listSections.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-white/40">
                {budgetFilter !== "all" || timeTab !== "all" ? t("noEventsInFilter") : t("noEventsFound")}
              </p>
            ) : (
              listSections.map((sec) => {
                const meta = STATUS_META[sec.key];
                return (
                  <section key={sec.key}>
                    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2.5 bg-[#111420]/95 px-1 py-2 backdrop-blur">
                      <span className={`h-2 w-2 rounded-full ${meta.dot} ${sec.key === "Ongoing" ? "animate-pulse" : ""}`} />
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${meta.text}`}>{eventStatusLabel(sec.key)}</h3>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">{sec.items.length}</span>
                      <span className="ml-auto text-[11px] text-white/35">{t(meta.hint)}</span>
                    </div>
                    <div className="mt-2 space-y-3">
                      {sec.items.map(({ e, status }) => {
                        const isSelected = String(selectedEventId) === String(e.id);
                        const locked = status !== "Upcoming";
                        // Mini progress bar straight from the portfolio fetch --
                        // no extra request per row.
                        const rowBudget = budgetByEventId.get(String(e.id));
                        const rowApproved = rowBudget?.approved_budget != null ? Number(rowBudget.approved_budget) : null;
                        const rowSpent = rowBudget?.total_expenses ?? 0;
                        const rowPct = rowApproved ? Math.min(100, (rowSpent / rowApproved) * 100) : rowApproved === 0 ? (rowSpent > 0 ? 100 : 0) : null;
                        const rowState = budgetStateOf(rowApproved, rowSpent);
                        const rowOver = rowState === "over";
                        const rowNear = rowState === "near";
                        const startDate = parseEventDateTime(e.event_start || e.date);
                        const dateLine = startDate
                          ? `${startDate.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}${formatTimeFriendly(e.event_start || e.date) ? ` · ${formatTimeFriendly(e.event_start || e.date)}` : ""}`
                          : "";
                        const rel = relativeLabel(e, status);
                        return (
                          <button
                            key={e.id}
                            onClick={() => setSelectedEventId(String(e.id))}
                            aria-pressed={isSelected}
                            className={`relative w-full overflow-hidden rounded-2xl border px-5 py-4 pl-6 text-left transition ${
                              isSelected
                                ? "border-transparent bg-sage-700 text-white shadow-md"
                                : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]"
                            }`}
                          >
                            <span className={`absolute inset-y-0 left-0 w-1.5 ${isSelected ? "bg-white" : meta.accent}`} />
                            <div className="flex items-center justify-between gap-2">
                              <p className={`flex items-center gap-1.5 text-xs font-semibold ${isSelected ? "text-white/85" : meta.text}`}>
                                {locked && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-label={t("expenseAddLockedHint")} />}
                                {rel}
                              </p>
                              {rowOver && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("budgetRowOverTag")}</span>}
                              {rowNear && <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("budgetRowNearTag")}</span>}
                            </div>
                            <p className="mt-1.5 break-words text-[15px] font-semibold leading-snug">{tc(e.title, language as any)}</p>
                            {dateLine && <p className={`mt-1 text-xs ${isSelected ? "text-white/70" : "text-white/45"}`}>{dateLine}</p>}
                            {rowPct !== null ? (
                              <div className="mt-3.5">
                                <div className={`h-2 overflow-hidden rounded-full ${isSelected ? "bg-white/25" : "bg-white/10"}`}>
                                  <div
                                    className={`h-full rounded-full ${rowOver ? "bg-red-500" : rowNear ? "bg-amber-400" : isSelected ? "bg-white" : "bg-[#4FBEB0]"}`}
                                    style={{ width: `${rowPct}%` }}
                                  />
                                </div>
                                <p className={`mt-2 flex items-center justify-between gap-2 text-xs ${isSelected ? "text-white/75" : "text-white/50"}`}>
                                  <span>{money(rowSpent)} / {money(rowApproved ?? 0)}</span>
                                  {rowOver ? (
                                    <span className={`font-bold ${isSelected ? "text-red-200" : "text-red-400"}`}>{t("budgetRowOverBy").replace("{over}", money(rowSpent - (rowApproved ?? 0)))}</span>
                                  ) : (
                                    <span>{t("budgetUsedPct").replace("{pct}", String(Math.round(rowPct)))}</span>
                                  )}
                                </p>
                              </div>
                            ) : (
                              <p className={`mt-3 text-xs italic ${isSelected ? "text-white/60" : "text-white/35"}`}>{t("budgetRowNoBudget")}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          {initialLoading ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : !selectedEventId ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 py-16">
              <Wallet className="h-10 w-10 mb-3 text-white/20" />
              <p>{t("selectEventToViewBudget")}</p>
            </div>
          ) : selectedEvent ? (
            <EventBudgetWorkspace event={selectedEvent} onChanged={fetchPortfolio} />
          ) : null}
        </div>
      </div>
      </div>
      </div>

    </>
  );
}
