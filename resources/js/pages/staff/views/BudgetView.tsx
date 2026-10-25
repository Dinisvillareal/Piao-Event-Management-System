import { matchesSearch } from "../../../lib/search";
import { highlightMatches } from "../../../lib/highlight";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Lock, Banknote, PiggyBank, AlertTriangle, ChevronRight, Wallet } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import Skeleton from "../../../components/ui/Skeleton";
import DatePicker from "../../../components/ui/DatePicker";
import FormDrawer from "../../../components/ui/FormDrawer";
import FilterBar, { type ExtraChip } from "../../../components/ui/FilterBar";
import QuickTabs from "../../../components/ui/QuickTabs";
import SimplePager from "../../../components/ui/SimplePager";
import usePager from "../../../hooks/usePager";
import { useLanguage } from "../../../i18n/LanguageContext";

import EventBudgetWorkspace, { type EventOption, NEAR_LIMIT_PCT, money, roundCents, budgetStateOf, type BudgetState } from "../../../components/budget/EventBudgetWorkspace";
import { makeEventTiming, STATUS_META } from "../../../lib/eventTiming";

import { tc } from "../../../lib/contentTranslations";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
/**
 * UC-8: Record Event Budget and Expenses. A portfolio-wide KPI strip (total
 * approved, total spent, remaining, events over budget) sits on top of the
 * same master-detail layout this page always needed -- pick an event on the
 * left, work its budget on the right -- so staff get the fleet-wide picture
 * before drilling into any one event's ledger.
 */
// Event cards per page (3 x 3 on a wide screen).
const EVENTS_PAGE_SIZE = 9;

export default function BudgetView({ allEvents = [] }: { allEvents?: EventOption[] }) {
  const { t, locale, language } = useLanguage();
  const [search, setSearch] = useState("");
  // Left list: which time bucket to show. "all" keeps every bucket on screen, in sections.
  const [timeTab, setTimeTab] = useState<"all" | "ongoing" | "upcoming" | "past">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Left list filter: every event, only those close to their limit, or only the over-budget ones.
  const [budgetFilter, setBudgetFilter] = useState<"all" | "near" | "over">("all");
  // Left list: one picked day (matches events starting that day; "" = every date) and current page.
  const [selectedDate, setSelectedDate] = useState("");
  const [sortKey, setSortKey] = useState("default");
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
  const eventDay = (e: EventOption) => String(e.event_start ?? e.date ?? "").slice(0, 10);
  const dateFilterActive = !!selectedDate;
  const searchedEvents = allEvents.filter((e) => matchesSearch(search, e.title) && (!selectedDate || eventDay(e) === selectedDate));
  const filterCounts = {
    all: searchedEvents.length,
    near: searchedEvents.filter((e) => stateOfEvent(e.id) === "near").length,
    over: searchedEvents.filter((e) => stateOfEvent(e.id) === "over").length,
  };
  const filteredEvents = budgetFilter === "all" ? searchedEvents : searchedEvents.filter((e) => stateOfEvent(e.id) === budgetFilter);

  // Shared event-timing helpers (same ones the budget workspace uses).
  const { getEventStatus, eventWindow, relativeLabel, eventStatusLabel, formatTimeFriendly, parseEventDateTime } = makeEventTiming(t);

  // Spent / approved per event, straight from the portfolio fetch.
  const figuresOf = (id: string | number) => {
    const b = budgetByEventId.get(String(id));
    const approved = b?.approved_budget != null ? Number(b.approved_budget) : null;
    const spent = b?.total_expenses ?? 0;
    const pct = approved ? Math.min(100, (spent / approved) * 100) : approved === 0 ? (spent > 0 ? 100 : 0) : null;
    return { approved, spent, pct };
  };

  // Cards stay grouped by real status (Ongoing, Upcoming, Past); the sort picks the order inside each group.
  const decoratedEvents = filteredEvents.map((e) => ({ e, status: getEventStatus(e).label, start: eventWindow(e).start?.getTime() ?? 0 }));
  const statusCounts = {
    all: decoratedEvents.length,
    ongoing: decoratedEvents.filter((d) => d.status === "Ongoing").length,
    upcoming: decoratedEvents.filter((d) => d.status === "Upcoming").length,
    past: decoratedEvents.filter((d) => d.status === "Past").length,
  };
  const withinGroup = (k: "Ongoing" | "Upcoming" | "Past") => (a: typeof decoratedEvents[number], b: typeof decoratedEvents[number]) => {
    if (sortKey === "soonest") return a.start - b.start;
    if (sortKey === "latest") return b.start - a.start;
    if (sortKey === "spent") return figuresOf(b.e.id).spent - figuresOf(a.e.id).spent;
    if (sortKey === "used") return (figuresOf(b.e.id).pct ?? -1) - (figuresOf(a.e.id).pct ?? -1);
    return k === "Past" ? b.start - a.start : a.start - b.start;
  };
  const listSections = (["Ongoing", "Upcoming", "Past"] as const)
    .filter((k) => timeTab === "all" || timeTab === STATUS_META[k].tab)
    .map((k) => ({ key: k, items: decoratedEvents.filter((d) => d.status === k).sort(withinGroup(k)) }))
    .filter((sec) => sec.items.length > 0);

  // Paging runs over the whole ordered list, then the visible slice is regrouped under its status headings.
  const flatList = listSections.flatMap((sec) => sec.items.map((item) => ({ key: sec.key, item })));
  const pager = usePager(flatList, EVENTS_PAGE_SIZE, 350, `${search}|${timeTab}|${budgetFilter}|${selectedDate}|${sortKey}`);
  const pagedSections = listSections
    .map((sec) => ({ key: sec.key, total: sec.items.length, items: pager.shown.filter((x) => x.key === sec.key).map((x) => x.item) }))
    .filter((sec) => sec.items.length > 0);

  // Filters / search / sort changing flashes the same card skeleton a page change does.
  const filterSwitching = useFilterSwitching([search, timeTab, budgetFilter, selectedDate, sortKey]);
  const listLoading = initialLoading || pager.switching || filterSwitching;

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
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
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

      {/* Toolbar: status tabs + search / budget health / sort / date, then the event cards. */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
        <QuickTabs
          value={timeTab}
          onChange={(k) => setTimeTab(k as typeof timeTab)}
          tabs={[
            { key: "all", label: t("budgetFilterAll"), count: initialLoading ? 0 : statusCounts.all },
            { key: "ongoing", label: t("timeTabOngoing"), count: initialLoading ? 0 : statusCounts.ongoing },
            { key: "upcoming", label: t("timeTabUpcoming"), count: initialLoading ? 0 : statusCounts.upcoming },
            { key: "past", label: t("timeTabPast"), count: initialLoading ? 0 : statusCounts.past },
          ]}
        />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: t("searchEventsPlaceholder") }}
          filters={[{
            key: "budget", label: t("budgetFilterLabel"), value: budgetFilter, onChange: (v) => setBudgetFilter(v as typeof budgetFilter),
            options: [
              { value: "all", label: `${t("budgetFilterAll")} (${filterCounts.all})` },
              { value: "near", label: `${t("budgetFilterNear")} (${filterCounts.near})` },
              { value: "over", label: `${t("budgetFilterOver")} (${filterCounts.over})` },
            ],
          }]}
          sort={{
            value: sortKey, onChange: setSortKey,
            options: [
              { value: "default", label: t("sortEventDefault") },
              { value: "soonest", label: t("sortEventSoonest") },
              { value: "latest", label: t("sortEventLatest") },
              { value: "spent", label: t("sortSpentHigh") },
              { value: "used", label: t("sortUsedHigh") },
            ],
          }}
          count={initialLoading ? undefined : { shown: filteredEvents.length, total: allEvents.length }}
          extraChips={[
            ...(timeTab !== "all" ? [{ key: "tab", label: t(timeTab === "ongoing" ? "timeTabOngoing" : timeTab === "upcoming" ? "timeTabUpcoming" : "timeTabPast"), onRemove: () => setTimeTab("all") }] : []),
            ...(selectedDate ? [{ key: "date", label: `${t("fltDateChip")}: ${new Date(selectedDate).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => setSelectedDate("") }] : []),
          ] as ExtraChip[]}
          onClearExtras={() => { setTimeTab("all"); setSelectedDate(""); }}
        >
          <div className="h-11 shrink-0 sm:w-[190px]">
            <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 px-4" dark align="right" />
          </div>
        </FilterBar>
      </div>

      {listLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 pl-7">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="mt-4 h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : listSections.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-sm text-white/50">
          {budgetFilter !== "all" || timeTab !== "all" || selectedDate || search ? t("noEventsInFilter") : t("noEventsFound")}
        </div>
      ) : (
        <div className="space-y-8">
          {pagedSections.map((sec) => {
            const meta = STATUS_META[sec.key];
            return (
              <section key={sec.key}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${meta.dot} ${sec.key === "Ongoing" ? "animate-pulse" : ""}`} />
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${meta.text}`}>{eventStatusLabel(sec.key)}</h3>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">{sec.total}</span>
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px] text-white/35">{t(meta.hint)}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sec.items.map(({ e, status }) => {
                    const locked = status !== "Upcoming";
                    const { approved, spent, pct } = figuresOf(e.id);
                    const state = budgetStateOf(approved, spent);
                    const over = state === "over";
                    const near = state === "near";
                    const startDate = parseEventDateTime(e.event_start || e.date);
                    const timeLine = formatTimeFriendly(e.event_start || e.date);
                    const dateLine = startDate
                      ? `${startDate.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}${timeLine ? ` · ${timeLine}` : ""}`
                      : "";
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEventId(String(e.id))}
                        className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] py-5 pl-7 pr-5 text-left text-white transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FBEB0]/50"
                      >
                        <span className={`absolute inset-y-0 left-0 w-1.5 ${meta.accent}`} />
                        <div className="flex items-center justify-between gap-2">
                          <p className={`flex items-center gap-1.5 text-xs font-semibold ${meta.text}`}>
                            {locked && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-label={t("expenseAddLockedHint")} />}
                            {relativeLabel(e, status)}
                          </p>
                          {over && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("budgetRowOverTag")}</span>}
                          {near && <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("budgetRowNearTag")}</span>}
                        </div>
                        <p className="mt-2 break-words text-base font-semibold leading-snug">{highlightMatches(tc(e.title, language as any), search)}</p>
                        {dateLine && <p className="mt-1 text-xs text-white/45">{dateLine}</p>}
                        <div className="mt-auto pt-4">
                          {pct !== null ? (
                            <>
                              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div className={`h-full rounded-full ${over ? "bg-red-500" : near ? "bg-amber-400" : "bg-[#4FBEB0]"}`} style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-2 flex items-center justify-between gap-2 text-xs text-white/50">
                                <span>{money(spent)} / {money(approved ?? 0)}</span>
                                {over ? (
                                  <span className="font-bold text-red-400">{t("budgetRowOverBy").replace("{over}", money(spent - (approved ?? 0)))}</span>
                                ) : (
                                  <span>{t("budgetUsedPct").replace("{pct}", String(Math.round(pct)))}</span>
                                )}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs italic text-white/35">{t("budgetRowNoBudget")}</p>
                          )}
                          <p className="mt-3 flex items-center justify-end gap-1 border-t border-white/10 pt-3 text-xs font-semibold text-[#7DD8CB] opacity-80 transition group-hover:opacity-100">
                            {t("budgetOpenCard")} <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <SimplePager page={pager.page} totalPages={pager.totalPages} onChange={pager.go} loading={pager.switching || filterSwitching} />

      {/* The event's whole budget slides in from the right, like every other form. */}
      {selectedEvent && (
        <FormDrawer
          title={tc(selectedEvent.title, language as any)}
          subtitle={(() => {
            const sd = parseEventDateTime(selectedEvent.event_start || selectedEvent.date);
            const tl = formatTimeFriendly(selectedEvent.event_start || selectedEvent.date);
            return sd ? `${sd.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}${tl ? ` · ${tl}` : ""}` : undefined;
          })()}
          onClose={() => setSelectedEventId(null)}
          footer={
            <button
              type="button"
              onClick={() => setSelectedEventId(null)}
              className="w-full rounded-full border border-white/20 py-3.5 text-base font-bold text-white transition hover:bg-white/10"
            >
              {t("budgetCloseDrawer")}
            </button>
          }
        >
          <EventBudgetWorkspace event={selectedEvent} onChanged={fetchPortfolio} showHeader={false} />
        </FormDrawer>
      )}
      </div>
      </div>

    </>
  );
}
