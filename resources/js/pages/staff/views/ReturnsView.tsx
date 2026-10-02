import React, { useEffect, useMemo, useRef, useState } from "react";
import { Undo2, CheckCircle2, PackageX, X, RotateCcw, Search, Package, Clock, History } from "lucide-react";
import { createPortal } from "react-dom";
import api, { apiErrorMessage } from "../../../lib/api";
import DatePicker from "../../../components/ui/DatePicker";
import NumberStepper from "../../../components/ui/NumberStepper";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";

interface OverdueEventItem {
  id: number;
  name: string;
  quantity: number;
}

interface OverdueEvent {
  id: number;
  name: string;
  ended_at: string;
  items: OverdueEventItem[];
}

interface RecentRelease {
  id: number;
  event_id: number;
  event_name: string;
  item_name: string;
  quantity: number;
  released_by: string | null;
  released_at: string;
}

const ITEMS_PER_PAGE = 6;
const RELEASES_PER_PAGE = 5;

// Events that have already ended but still hold borrowed inventory --
// nothing in the system releases these on its own (see
// EventController::overdueBorrows / releaseBorrowedItem). This page is
// the dedicated home for that queue; the Dashboard only shows a short
// summary that links back here.
export default function ReturnsView() {
  const { t } = useLanguage();
  const [events, setEvents] = useState<OverdueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [endedDate, setEndedDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash on every page switch, same as Activity Logs --
  // this table paginates client-side so there's nothing to actually wait
  // on, but the flash keeps page switches feeling consistent app-wide.
  const [pageSwitching, setPageSwitching] = useState(false);
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
  // Which of the two panels below is showing -- Pending Returns and
  // Recently Released are two unrelated queues (overdue items waiting to
  // come back vs. a log of what was just released) that used to just sit
  // stacked on the page. They're now switched between with their own
  // pill buttons instead, so the separation is the buttons themselves,
  // not just spacing.
  const [activeTab, setActiveTab] = useState<"pending" | "released">("pending");
  // How many units to release per item, keyed by borrow-record id --
  // staff can give back fewer than the full borrowed quantity.
  const [releaseQty, setReleaseQty] = useState<Record<number, number>>({});

  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [releasingItemId, setReleasingItemId] = useState<number | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<{ eventId: number; item: OverdueEventItem; qty: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTitle, setSuccessTitle] = useState<string | null>(null);

  // Bulk release -- a checkbox per item (checked by default) plus one
  // "Release Selected" action, instead of making staff click "Release"
  // once per line for an event with many borrowed item types. Unchecking
  // an item leaves it out of the batch entirely (still borrowed, released
  // individually later) rather than forcing an all-or-nothing release.
  const [selectedItemIds, setSelectedItemIds] = useState<Record<number, boolean>>({});
  const [confirmReleaseAll, setConfirmReleaseAll] = useState(false);
  const [bulkReleasing, setBulkReleasing] = useState(false);

  // Recent releases -- lets staff catch and fix a mis-entered quantity
  // ("I meant to release 2, not 3") without touching Inventory's raw
  // stock count by hand. See EventController::recentReleases()/undoRelease().
  const [recentReleases, setRecentReleases] = useState<RecentRelease[]>([]);
  const [recentReleasesLoading, setRecentReleasesLoading] = useState(true);
  const [recentReleasesPage, setRecentReleasesPage] = useState(1);
  const [recentReleasesTotalPages, setRecentReleasesTotalPages] = useState(1);
  const [recentReleasesTotal, setRecentReleasesTotal] = useState(0);
  const [undoingReleaseId, setUndoingReleaseId] = useState<number | null>(null);
  const [confirmUndo, setConfirmUndo] = useState<{ release: RecentRelease; qty: number } | null>(null);
  // How many units to put back per release record, keyed by release id --
  // a release of 2 doesn't have to be undone as a whole (e.g. it was 1
  // genuine release and 1 mistaken extra unit).
  const [undoQty, setUndoQty] = useState<Record<number, number>>({});

  // Real-time refresh -- the overdue-borrows queue can change any time
  // another staff member releases an item, so this polls quietly in the
  // background rather than relying on a manual refresh. `background`
  // skips the full-page spinner so the table doesn't flash/reset scroll
  // position every 20s; it's only shown on the very first load.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchOverdue = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await api.get("/events/overdue-borrows");
      setEvents(Array.isArray(response.data) ? response.data : []);
      setLastUpdated(new Date());
    } catch {
      if (!background) setError(t("loadReturnsFailed"));
    } finally {
      if (!background) setLoading(false);
    }
  };

  const fetchRecentReleases = async (page = recentReleasesPage, background = false, searchTerm = search) => {
    if (!background) setRecentReleasesLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const response = await api.get(`/events/borrowed-items/releases/recent?${params.toString()}`);
      const payload = response.data;
      setRecentReleases(Array.isArray(payload?.data) ? payload.data : []);
      setRecentReleasesPage(payload?.current_page ?? 1);
      setRecentReleasesTotalPages(Math.max(1, payload?.last_page ?? 1));
      setRecentReleasesTotal(payload?.total ?? 0);
    } catch {
      // Silent -- this panel is a convenience, not the page's core data;
      // a failed refresh just leaves the previous list showing.
    } finally {
      if (!background) setRecentReleasesLoading(false);
    }
  };

  // The background poll needs to know, on every tick, whether a modal is
  // currently open (so it can skip refreshing under someone's feet) and
  // which release-panel page is showing -- but reading those directly
  // would mean re-running this whole effect (and its foreground,
  // spinner-showing fetches) every time the modal opens or closes, which
  // is exactly the "loading flashes every time I open/close the modal"
  // annoyance this replaced. A ref sidesteps that: it's kept up to date
  // every render without ever forcing the effect below to re-subscribe.
  const pollGateRef = useRef({ selectedEventId, confirmRelease, confirmUndo, recentReleasesPage, search });
  useEffect(() => {
    pollGateRef.current = { selectedEventId, confirmRelease, confirmUndo, recentReleasesPage, search };
  });

  useEffect(() => {
    // Foreground (spinner-showing) fetch -- intentionally only ever runs
    // once, on mount, not on every modal open/close. The Recently Released
    // panel's own first load is handled by the debounced search effect
    // below (it fires on mount too, since `search` starts out defined).
    fetchOverdue();
    const poll = setInterval(() => {
      const gate = pollGateRef.current;
      if (gate.selectedEventId === null && gate.confirmRelease === null && gate.confirmUndo === null) {
        fetchOverdue(true);
        fetchRecentReleases(gate.recentReleasesPage, true, gate.search);
      }
    }, 20000);
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

  // Portfolio-wide KPIs across every overdue event currently queued --
  // gives staff the scale of the backlog before drilling into any one
  // event's line items.
  const stats = useMemo(() => {
    const totalUnits = events.reduce((sum, ev) => sum + ev.items.reduce((s, it) => s + it.quantity, 0), 0);
    const distinctItems = new Set<string>();
    events.forEach((ev) => ev.items.forEach((it) => distinctItems.add(it.name)));
    let oldestDays = 0;
    const now = Date.now();
    events.forEach((ev) => {
      const ended = new Date(ev.ended_at).getTime();
      if (!isNaN(ended)) {
        const days = Math.floor((now - ended) / (1000 * 60 * 60 * 24));
        if (days > oldestDays) oldestDays = days;
      }
    });
    return { totalEvents: events.length, totalUnits, distinctItems: distinctItems.size, oldestDays };
  }, [events]);

  const daysOverdue = (endedAt: string) => {
    const ended = new Date(endedAt).getTime();
    if (isNaN(ended)) return 0;
    return Math.max(0, Math.floor((Date.now() - ended) / (1000 * 60 * 60 * 24)));
  };

  // Ended-date range filter -- comparing plain "yyyy-mm-dd" slices keeps
  // this independent of time-of-day/timezone formatting.
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (q) {
        const matchesEvent = ev.name.toLowerCase().includes(q);
        const matchesItem = ev.items.some((it) => it.name.toLowerCase().includes(q));
        if (!matchesEvent && !matchesItem) return false;
      }
      if (endedDate && ev.ended_at.slice(0, 10) !== endedDate) return false;
      return true;
    });
  }, [events, search, endedDate]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEvents = filteredEvents.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, endedDate]);

  // The same search box also searches Recently Released (by event or item
  // name), same as it does for the table above -- debounced so typing
  // doesn't fire a request per keystroke, and since that panel is fetched
  // page-by-page from the server (unlike the table's in-memory filter), a
  // new search always jumps back to its page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecentReleases(1, false, search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const modalEvent = events.find((ev) => ev.id === selectedEventId) ?? null;

  const qtyFor = (item: OverdueEventItem) => releaseQty[item.id] ?? item.quantity;

  const setQtyFor = (item: OverdueEventItem, value: number) => {
    const clamped = Math.max(1, Math.min(item.quantity, Math.floor(value) || 1));
    setReleaseQty((prev) => ({ ...prev, [item.id]: clamped }));
  };

  // Checked by default -- an event with a handful of items is usually
  // released in full, so the common case (release everything) takes zero
  // clicks on the checkboxes themselves.
  const isItemSelected = (item: OverdueEventItem) => selectedItemIds[item.id] ?? true;

  const toggleItemSelected = (item: OverdueEventItem) => {
    setSelectedItemIds((prev) => ({ ...prev, [item.id]: !isItemSelected(item) }));
  };

  const selectedCount = modalEvent ? modalEvent.items.filter(isItemSelected).length : 0;
  const allItemsSelected = modalEvent ? modalEvent.items.length > 0 && modalEvent.items.every(isItemSelected) : false;

  const toggleSelectAll = () => {
    if (!modalEvent) return;
    const next = !allItemsSelected;
    setSelectedItemIds((prev) => {
      const copy = { ...prev };
      modalEvent.items.forEach((it) => {
        copy[it.id] = next;
      });
      return copy;
    });
  };

  const undoQtyFor = (release: RecentRelease) => undoQty[release.id] ?? release.quantity;

  const setUndoQtyFor = (release: RecentRelease, value: number) => {
    const clamped = Math.max(1, Math.min(release.quantity, Math.floor(value) || 1));
    setUndoQty((prev) => ({ ...prev, [release.id]: clamped }));
  };

  const releaseOneItem = async (eventId: number, item: OverdueEventItem, qty: number) => {
    setConfirmRelease(null);
    setReleasingItemId(item.id);
    try {
      await api.post(`/events/${eventId}/borrowed-items/${item.id}/release`, { quantity: qty });
      setEvents((prev) =>
        prev
          .map((ev) =>
            ev.id === eventId
              ? {
                  ...ev,
                  items: ev.items
                    .map((it) => (it.id === item.id ? { ...it, quantity: it.quantity - qty } : it))
                    .filter((it) => it.quantity > 0),
                }
              : ev
          )
          .filter((ev) => ev.items.length > 0)
      );
      setReleaseQty((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setSuccessTitle(t("returnSuccessTitle"));
      setSuccessMessage(t("returnSuccessMessage").replace("{qty}", String(qty)).replace("{item}", item.name));
      // The new release is always the newest, so it belongs on page 1
      // regardless of which page of the panel was showing before.
      fetchRecentReleases(1);
    } catch {
      setError(t("releaseItemsFailed"));
    } finally {
      setReleasingItemId(null);
    }
  };

  const releaseSelectedItems = async (event: OverdueEvent) => {
    setConfirmReleaseAll(false);
    // Snapshot which items are checked and their current Qty-field values
    // up front -- the in-flight requests below will progressively mutate
    // `events` (and therefore modalEvent.items) as each one resolves.
    const jobs = event.items.filter(isItemSelected).map((item) => ({ item, qty: qtyFor(item) }));
    if (jobs.length === 0) return;
    setBulkReleasing(true);
    try {
      const results = await Promise.allSettled(
        jobs.map(({ item, qty }) => api.post(`/events/${event.id}/borrowed-items/${item.id}/release`, { quantity: qty }))
      );
      const succeededIds = new Set(jobs.filter((_, i) => results[i].status === "fulfilled").map(({ item }) => item.id));
      const anyFailed = results.some((r) => r.status === "rejected");

      setEvents((prev) =>
        prev
          .map((ev) =>
            ev.id === event.id
              ? {
                  ...ev,
                  items: ev.items
                    .map((it) => {
                      const job = jobs.find((j) => j.item.id === it.id);
                      return job && succeededIds.has(it.id) ? { ...it, quantity: it.quantity - job.qty } : it;
                    })
                    .filter((it) => it.quantity > 0),
                }
              : ev
          )
          .filter((ev) => ev.items.length > 0)
      );
      setReleaseQty((prev) => {
        const next = { ...prev };
        succeededIds.forEach((id) => delete next[id]);
        return next;
      });
      setSelectedItemIds((prev) => {
        const next = { ...prev };
        succeededIds.forEach((id) => delete next[id]);
        return next;
      });

      if (succeededIds.size > 0) {
        setSuccessTitle(t("bulkReleaseSuccessTitle"));
        setSuccessMessage(
          anyFailed
            ? t("bulkReleasePartialFailureMessage")
            : t("bulkReleaseSuccessMessage").replace("{event}", event.name)
        );
        fetchRecentReleases(1);
      } else {
        setError(t("releaseItemsFailed"));
      }
    } catch {
      setError(t("releaseItemsFailed"));
    } finally {
      setBulkReleasing(false);
    }
  };

  const undoReleaseAction = async (release: RecentRelease, qty: number) => {
    setConfirmUndo(null);
    setUndoingReleaseId(release.id);
    try {
      await api.post(`/events/borrowed-items/releases/${release.id}/undo`, { quantity: qty });
      setUndoQty((prev) => {
        const next = { ...prev };
        delete next[release.id];
        return next;
      });
      setSuccessTitle(t("undoReleaseSuccessTitle"));
      setSuccessMessage(
        t("undoReleaseSuccessMessage")
          .replace("{qty}", String(qty))
          .replace("{item}", release.item_name)
          .replace("{event}", release.event_name)
      );
      // The event may need to reappear in the overdue list (if this
      // release had fully closed it out) or show an updated remaining
      // quantity -- either way, the main table needs a fresh copy. This
      // one is a real, user-triggered update (not the quiet 20s poll), so
      // it shows the same loading spinner as the very first page load
      // instead of silently swapping the table underneath them.
      fetchOverdue();
      // Re-fetch this page from the server rather than filtering locally,
      // since the panel is server-paginated now. A partial undo (qty less
      // than the full release) leaves the row in place with a smaller
      // number, so only step back a page when the row was fully undone
      // and it was the only one left on this page.
      const wasFullUndo = qty >= release.quantity;
      const nextPage = wasFullUndo && recentReleases.length <= 1 && recentReleasesPage > 1 ? recentReleasesPage - 1 : recentReleasesPage;
      fetchRecentReleases(nextPage);
    } catch (err) {
      setError(apiErrorMessage(err, t("undoReleaseFailedMessage")));
    } finally {
      setUndoingReleaseId(null);
    }
  };

  const formatEndedAt = (value: string) => {
    try {
      return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return value;
    }
  };

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

  const statCards = [
    {
      key: "overdue",
      label: t("overdueEventsStatLabel"),
      desc: t("overdueEventsStatDesc"),
      value: stats.totalEvents,
      icon: PackageX,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]",
    },
    {
      key: "units",
      label: t("itemsStillOutStatLabel"),
      desc: t("itemsStillOutStatDesc"),
      value: stats.totalUnits,
      icon: Package,
      gradient: "from-gold-400 to-gold-700",
    },
    {
      key: "types",
      label: t("distinctItemTypesStatLabel"),
      desc: t("distinctItemTypesStatDesc"),
      value: stats.distinctItems,
      icon: Undo2,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      key: "oldest",
      label: t("oldestOverdueStatLabel"),
      desc: t("oldestOverdueStatDesc"),
      value: stats.oldestDays,
      icon: Clock,
      gradient: "from-sage-800 to-[#1C2E2B]",
    },
  ];

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events/Budget pages, so
        Returns reads as part of the same system instead of the old light
        "paper" page. The Release Items modal is darkened along with the
        page (it's this page's core action, same treatment as the
        Households/Inventory/Budget Edit modals); the confirm and success
        modals further below stay on their original light theme, same
        scoping used everywhere else. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("returnsTitle")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("returnsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-white/40">&bull; {lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white`}>
              <div className="flex items-start justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide">{card.label}</span>
                <Icon className="h-5 w-5 text-white/40" />
              </div>
              <p className="mt-2 font-display text-2xl lg:text-3xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-white/75">{card.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchReturnsPlaceholder")}
              className="h-11 w-full rounded-xl border border-transparent bg-transparent pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <p className="text-xs font-semibold text-white/50 mb-1">{t("filterEndedDateLabel")}</p>
            <DatePicker value={endedDate} onChange={setEndedDate} className="h-11 px-4" dark />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Section switcher -- two standalone pill buttons, not a single
          segmented control, so each one reads as its own distinct button
          the way "buttons for the first table and button for the recently
          released" asked for. Only one panel is shown at a time, so the
          separation is the buttons themselves rather than stacking both
          cards and hoping spacing alone reads as separate sections. */}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "pending"
              ? "bg-gold-400 text-[#08130F] shadow-sm"
              : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <PackageX className="h-4 w-4" />
          {t("pendingReturnsTitle")}
          {filteredEvents.length > 0 && (
            <span
              className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                activeTab === "pending" ? "bg-[#08130F]/15 text-[#08130F]" : "bg-white/10 text-white/70"
              }`}
            >
              {filteredEvents.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("released")}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "released"
              ? "bg-gold-400 text-[#08130F] shadow-sm"
              : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <History className="h-4 w-4" />
          {t("recentlyReleasedTitle")}
          {recentReleasesTotal > 0 && (
            <span
              className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                activeTab === "released" ? "bg-[#08130F]/15 text-[#08130F]" : "bg-white/10 text-white/70"
              }`}
            >
              {recentReleasesTotal}
            </span>
          )}
        </button>
      </div>

      {/* Pending Returns -- its own bordered card with a persistent header
          (icon + title + hint), only rendered while its pill button above
          is the active one. */}
      {activeTab === "pending" && (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5">
          <PackageX className="h-4 w-4 text-white/40" />
          <div>
            <p className="text-sm font-bold text-white">{t("pendingReturnsTitle")}</p>
            <p className="text-xs text-white/40">{t("pendingReturnsHint")}</p>
          </div>
        </div>

        {loading || pageSwitching ? (
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20 ml-auto hidden sm:block" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-[#4FBEB0] mb-3" />
            <p className="text-white font-semibold">{t("noOverdueReturns")}</p>
            <p className="text-sm text-white/45 mt-1">{t("noOverdueReturnsHint")}</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-white font-semibold">{t("noResultsForFilterLabel")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("eventColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("endedOnColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("daysOverdueColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("itemsColumnLabel")}</th>
                    <th className="py-3 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-white">{t("actionColumnLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => {
                    const days = daysOverdue(ev.ended_at);
                    return (
                      <tr key={ev.id} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.05] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8A3D2C]/25 shrink-0">
                              <PackageX className="h-4 w-4 text-[#E2A088]" />
                            </div>
                            <p className="font-semibold text-white truncate">{ev.name}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-white/60 whitespace-nowrap">{formatEndedAt(ev.ended_at)}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center rounded-full bg-[#8A3D2C]/25 text-[#E2A088] border border-[#8A3D2C]/40 px-2.5 py-1 text-xs font-bold">
                            {t("daysOverdueBadge").replace("{n}", String(days))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-white/50">
                          <ul className="space-y-0.5">
                            {ev.items.map((it) => (
                              <li key={it.id} className="text-xs">{it.quantity}&times; {it.name}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedEventId(ev.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-gold-400 hover:bg-gold-500 text-[#08130F] text-xs font-bold uppercase tracking-wide px-4 py-2 transition"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            {t("reviewLabel")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 sm:px-5 py-3.5 border-t border-white/10">
                <p className="text-sm text-white/45 text-center sm:text-left">
                  {t("pageOfLabel")} {safePage} {t("ofPagesLabel")} {totalPages} &bull; {filteredEvents.length} {t("recordsShownLabel")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &larr;
                  </button>
                  <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
                    {safePage}
                  </span>
                  <button
                    onClick={() => goToPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Recently Released -- the "undo a mis-entered quantity" surface.
          Shown regardless of whether the source event still has other
          items outstanding (an event that's fully released drops off the
          table above entirely, so this can't live nested inside that
          event's own modal -- it has to stand on its own). Only rendered
          while its pill button above is the active one, same as Pending
          Returns, so the two never appear stacked together. */}
      {activeTab === "released" && (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5">
          <History className="h-4 w-4 text-white/40" />
          <div>
            <p className="text-sm font-bold text-white">{t("recentlyReleasedTitle")}</p>
            <p className="text-xs text-white/40">{t("recentlyReleasedHint")}</p>
          </div>
        </div>
        {recentReleasesLoading ? (
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : recentReleases.length === 0 ? (
          <p className="px-5 py-6 text-sm text-white/40 text-center">
            {search.trim() ? t("noResultsForFilterLabel") : t("noRecentReleasesLabel")}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.06]">
              {recentReleases.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {r.quantity}&times; {r.item_name} <span className="text-white/40">&bull;</span> {r.event_name}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {relativeTimeLabel(r.released_at)}
                      {r.released_by && <> &bull; {t("releasedByPrefixLabel")} {r.released_by}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {r.quantity > 1 && (
                      <>
                        <label className="text-xs text-white/50">{t("qtyLabel")}</label>
                        {/* Only shown when more than 1 unit is on this release
                            record -- lets staff undo just the mistaken portion
                            (e.g. released 2, undo 1) instead of reversing the
                            whole release. Numeric up/down bounded 1..r.quantity;
                            setUndoQtyFor() clamps every change. Uses our own
                            stepper buttons rather than the browser's native
                            spinner -- see NumberStepper.tsx for why. */}
                        <NumberStepper
                          min={1}
                          max={r.quantity}
                          value={String(undoQtyFor(r))}
                          onChange={(v) => setUndoQtyFor(r, Number(v))}
                          className="w-14 rounded-lg border border-white/10 bg-white/[0.03] pl-2 pr-5 py-1.5 text-sm text-center text-white focus:border-[#4FBEB0]/50 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/20"
                        />
                      </>
                    )}
                    <button
                      onClick={() => setConfirmUndo({ release: r, qty: undoQtyFor(r) })}
                      disabled={undoingReleaseId === r.id}
                      // Same pill size as the modal's Close button (rounded-full,
                      // px-5 py-2, text-sm), but filled solid with the page's own
                      // teal accent (used elsewhere for the live indicator and
                      // focus rings) and dark text -- same filled-pill treatment
                      // as the gold Release/Release Selected buttons, just in teal
                      // so Undo reads as its own distinct action.
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0] hover:bg-[#3FA89B] disabled:opacity-50 text-[#08130F] text-sm font-bold px-5 py-2 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {undoingReleaseId === r.id ? t("undoingLabel") : t("undoLabel")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {recentReleasesTotalPages > 1 && (
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 sm:px-5 py-3.5 border-t border-white/10">
                <p className="text-sm text-white/45 text-center sm:text-left">
                  {t("pageOfLabel")} {recentReleasesPage} {t("ofPagesLabel")} {recentReleasesTotalPages} &bull; {recentReleasesTotal} {t("recordsShownLabel")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchRecentReleases(Math.max(1, recentReleasesPage - 1))}
                    disabled={recentReleasesPage === 1}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &larr;
                  </button>
                  <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
                    {recentReleasesPage}
                  </span>
                  <button
                    onClick={() => fetchRecentReleases(Math.min(recentReleasesTotalPages, recentReleasesPage + 1))}
                    disabled={recentReleasesPage === recentReleasesTotalPages}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
      </div>
      </div>

      {/* Release Items modal -- dark navy card, same treatment as the
          Households/Inventory/Budget core edit modals, since releasing
          items is this page's main action rather than a peripheral
          confirm/success alert. */}
      {modalEvent && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedEventId(null)}
        >
          <div
            className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-white">{modalEvent.name}</h2>
                <p className="text-xs text-[#E2A088] mt-0.5">{t("endedOnLabel")} {formatEndedAt(modalEvent.ended_at)}</p>
              </div>
              <button onClick={() => setSelectedEventId(null)} className="text-white/50 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-xs text-white/50">{t("releaseEachItemHint")}</p>
                {modalEvent.items.length > 1 && (
                  <label className="shrink-0 flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allItemsSelected}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-white/25 bg-white/[0.03] accent-[#4FBEB0]"
                    />
                    {t("selectAllLabel")}
                  </label>
                )}
              </div>
              {modalEvent.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 flex-wrap">
                  <label className="flex items-center gap-3 min-w-0 cursor-pointer select-none">
                    {/* Unchecked items are simply left out of "Release
                        Selected" below -- the item itself, and its own
                        Release button, are unaffected either way. */}
                    <input
                      type="checkbox"
                      checked={isItemSelected(it)}
                      onChange={() => toggleItemSelected(it)}
                      className="h-4 w-4 shrink-0 rounded border-white/25 bg-white/[0.03] accent-[#4FBEB0]"
                    />
                    <span className="text-sm text-white truncate">{it.quantity}&times; {it.name}</span>
                  </label>
                  <div className="flex items-center gap-2 ml-auto">
                    <label className="text-xs text-white/50">{t("qtyLabel")}</label>
                    {/* Numeric up/down bounded to 1..borrowed-quantity --
                        setQtyFor() clamps every change, so typing or
                        stepping past either end just snaps back instead of
                        accepting a bad number. Our own stepper buttons
                        rather than the browser's native spinner -- see
                        NumberStepper.tsx for why. */}
                    <NumberStepper
                      min={1}
                      max={it.quantity}
                      value={String(qtyFor(it))}
                      onChange={(v) => setQtyFor(it, Number(v))}
                      className="w-16 rounded-lg border border-white/10 bg-white/[0.03] pl-2.5 pr-5 py-1.5 text-sm text-center text-white focus:border-[#4FBEB0]/50 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/20"
                    />
                    <button
                      onClick={() => setConfirmRelease({ eventId: modalEvent.id, item: it, qty: qtyFor(it) })}
                      disabled={releasingItemId === it.id}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gold-400 hover:bg-gold-500 disabled:opacity-60 text-[#08130F] text-xs font-bold px-4 py-2 transition"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {releasingItemId === it.id ? t("releasingLabel") : t("releaseLabel")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              {modalEvent.items.length > 1 ? (
                <button
                  onClick={() => setConfirmReleaseAll(true)}
                  disabled={selectedCount === 0 || bulkReleasing}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gold-400 hover:bg-gold-500 disabled:opacity-40 disabled:cursor-not-allowed text-[#08130F] text-xs font-bold px-4 py-2 transition"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {bulkReleasing ? t("releasingSelectedLabel") : `${t("releaseSelectedLabel")} (${selectedCount})`}
                </button>
              ) : (
                <span />
              )}
              <button onClick={() => setSelectedEventId(null)} className="px-5 py-2 rounded-full border border-white/15 text-white text-sm hover:bg-white/10 transition">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={confirmRelease !== null}
        icon={<Undo2 size={32} />}
        title={t("confirmReturnTitle")}
        body={
          confirmRelease
            ? t("confirmReturnBody").replace("{qty}", String(confirmRelease.qty)).replace("{item}", confirmRelease.item.name)
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("confirmReturnLabel")}
        onCancel={() => setConfirmRelease(null)}
        onConfirm={() => confirmRelease && releaseOneItem(confirmRelease.eventId, confirmRelease.item, confirmRelease.qty)}
        tone="danger"
        z={10000}
      />

      <ConfirmDialog
        open={confirmReleaseAll}
        icon={<Undo2 size={32} />}
        title={t("confirmReleaseSelectedTitle")}
        body={
          modalEvent
            ? t("confirmReleaseSelectedBody").replace("{n}", String(selectedCount)).replace("{event}", modalEvent.name)
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("confirmReleaseSelectedLabel")}
        onCancel={() => setConfirmReleaseAll(false)}
        onConfirm={() => modalEvent && releaseSelectedItems(modalEvent)}
        tone="danger"
        z={10000}
      />

      <ConfirmDialog
        open={confirmUndo !== null}
        icon={<RotateCcw size={32} />}
        title={t("confirmUndoReleaseTitle")}
        body={
          confirmUndo
            ? t("confirmUndoReleaseBody")
                .replace("{qty}", String(confirmUndo.qty))
                .replace("{item}", confirmUndo.release.item_name)
                .replace("{event}", confirmUndo.release.event_name)
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("undoReleaseLabel")}
        onCancel={() => setConfirmUndo(null)}
        onConfirm={() => confirmUndo && undoReleaseAction(confirmUndo.release, confirmUndo.qty)}
        tone="danger"
        z={10000}
      />

      <StatusModal open={!!successMessage} type="success" title={successTitle || t("returnSuccessTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} z={10000} />
    </>
  );
}
