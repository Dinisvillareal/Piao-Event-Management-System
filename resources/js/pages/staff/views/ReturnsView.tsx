import React, { useEffect, useMemo, useState } from "react";
import { Undo2, CheckCircle2, PackageX, X, RotateCcw, Search, Package, Clock } from "lucide-react";
import { createPortal } from "react-dom";
import api from "../../../lib/api";
import DatePicker from "../../../components/ui/DatePicker";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
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

const ITEMS_PER_PAGE = 6;

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
  // How many units to release per item, keyed by borrow-record id --
  // staff can give back fewer than the full borrowed quantity.
  const [releaseQty, setReleaseQty] = useState<Record<number, number>>({});

  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [releasingItemId, setReleasingItemId] = useState<number | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<{ eventId: number; item: OverdueEventItem; qty: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  useEffect(() => {
    fetchOverdue();
    const poll = setInterval(() => {
      if (selectedEventId === null && confirmRelease === null) fetchOverdue(true);
    }, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, confirmRelease]);

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

  const clearFilters = () => {
    setSearch("");
    setEndedDate("");
  };

  const modalEvent = events.find((ev) => ev.id === selectedEventId) ?? null;

  const qtyFor = (item: OverdueEventItem) => releaseQty[item.id] ?? item.quantity;

  const setQtyFor = (item: OverdueEventItem, value: number) => {
    const clamped = Math.max(1, Math.min(item.quantity, Math.floor(value) || 1));
    setReleaseQty((prev) => ({ ...prev, [item.id]: clamped }));
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
      setSuccessMessage(t("returnSuccessMessage").replace("{qty}", String(qty)).replace("{item}", item.name));
    } catch {
      setError(t("releaseItemsFailed"));
    } finally {
      setReleasingItemId(null);
    }
  };

  const formatEndedAt = (value: string) => {
    try {
      return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return value;
    }
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("returnsTitle")}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">{t("returnsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#E6E0D3] bg-white px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-600" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-sage-700">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-[#9C9584]">&bull; {lastUpdatedLabel}</span>}
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
        <div className="flex-1 rounded-2xl border border-[#E6E0D3] bg-white p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9C9584]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchReturnsPlaceholder")}
              className="h-11 w-full rounded-xl border border-transparent bg-transparent pl-10 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#9C9584] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
            />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <p className="text-xs font-semibold text-[#6B7280] mb-1">{t("filterEndedDateLabel")}</p>
            <DatePicker value={endedDate} onChange={setEndedDate} className="h-11 px-4" />
          </div>
          {(search || endedDate) && (
            <button
              onClick={clearFilters}
              className="h-11 inline-flex items-center gap-1.5 rounded-full border border-[#E6E0D3] bg-white px-4 text-sm text-[#37423F] hover:bg-sage-50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("clearFiltersLabel")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage-600" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-[#E6E0D3] bg-white p-12 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-sage-600 mb-3" />
          <p className="text-[#1A1A1A] font-semibold">{t("noOverdueReturns")}</p>
          <p className="text-sm text-[#6B7280] mt-1">{t("noOverdueReturnsHint")}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-[#E6E0D3] bg-white p-12 text-center">
          <p className="text-[#1A1A1A] font-semibold">{t("noResultsForFilterLabel")}</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[#E6E0D3] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E6E0D3]">
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("eventColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("endedOnColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("daysOverdueColumnLabel")}</th>
                    <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("itemsColumnLabel")}</th>
                    <th className="py-3 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("actionColumnLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => {
                    const days = daysOverdue(ev.ended_at);
                    return (
                      <tr key={ev.id} className="border-b border-[#F1EEE5] last:border-0 hover:bg-sage-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8A3D2C]/10 shrink-0">
                              <PackageX className="h-4 w-4 text-[#5C2A1E]" />
                            </div>
                            <p className="font-semibold text-[#1A1A1A] truncate">{ev.name}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#37423F] whitespace-nowrap">{formatEndedAt(ev.ended_at)}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center rounded-full bg-[#8A3D2C]/10 text-[#5C2A1E] border border-[#8A3D2C]/30 px-2.5 py-1 text-xs font-bold">
                            {t("daysOverdueBadge").replace("{n}", String(days))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[#6B7280]">
                          <ul className="space-y-0.5">
                            {ev.items.map((it) => (
                              <li key={it.id} className="text-xs">{it.quantity}&times; {it.name}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedEventId(ev.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold uppercase tracking-wide px-4 py-2 transition"
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
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-6">
              <p className="text-sm text-[#6B7280] text-center sm:text-left">
                {t("pageOfLabel")} {safePage} {t("ofPagesLabel")} {totalPages} &bull; {filteredEvents.length} {t("recordsShownLabel")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-800 hover:text-white hover:border-sage-800 transition-all active:scale-95"
                >
                  &larr;
                </button>
                <span className="h-8 w-8 rounded-full bg-sage-800 text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                  {safePage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-800 hover:text-white hover:border-sage-800 transition-all active:scale-95"
                >
                  &rarr;
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {modalEvent && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedEventId(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E6E0D3] flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1A1A1A]">{modalEvent.name}</h2>
                <p className="text-xs text-[#5C2A1E] mt-0.5">{t("endedOnLabel")} {formatEndedAt(modalEvent.ended_at)}</p>
              </div>
              <button onClick={() => setSelectedEventId(null)} className="text-[#9C9584] hover:text-[#1A1A1A] p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2">
              <p className="text-xs text-[#6B7280] mb-2">{t("releaseEachItemHint")}</p>
              {modalEvent.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#FAF9F5] border border-[#F1EEE5] px-4 py-3 flex-wrap">
                  <p className="text-sm text-[#1A1A1A]">{it.quantity}&times; {it.name}</p>
                  <div className="flex items-center gap-2 ml-auto">
                    <label className="text-xs text-[#6B7280]">{t("qtyLabel")}</label>
                    <input
                      type="number"
                      min={1}
                      max={it.quantity}
                      value={qtyFor(it)}
                      onChange={(e) => setQtyFor(it, Number(e.target.value))}
                      className="w-16 rounded-lg border border-[#E6E0D3] px-2 py-1.5 text-sm text-center text-[#1A1A1A] focus:border-sage-400 focus:outline-none focus:ring-1 focus:ring-sage-700/20"
                    />
                    <button
                      onClick={() => setConfirmRelease({ eventId: modalEvent.id, item: it, qty: qtyFor(it) })}
                      disabled={releasingItemId === it.id}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#5C2A1E] hover:bg-[#4A2118] disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 transition"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {releasingItemId === it.id ? t("releasingLabel") : t("releaseLabel")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-[#E6E0D3] flex justify-end">
              <button onClick={() => setSelectedEventId(null)} className="px-5 py-2 rounded-full border border-[#E6E0D3] text-[#37423F] text-sm hover:bg-sage-50 transition">
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

      {successMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] px-4" onClick={() => setSuccessMessage(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sage-700 flex justify-center"><CheckCircle2 size={40} /></div>
            <h3 className="font-display text-xl font-bold text-[#1A1A1A] mb-2">{t("returnSuccessTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="px-6 py-2.5 rounded-full bg-sage-800 hover:bg-sage-900 text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
