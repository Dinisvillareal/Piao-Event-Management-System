import React, { useEffect, useMemo, useState } from "react";
import { Undo2, CheckCircle2, PackageX, X, RotateCcw } from "lucide-react";
import { createPortal } from "react-dom";
import api from "../../../lib/api";
import DatePicker from "../../../components/ui/DatePicker";
import SearchBar from "../../../components/ui/SearchBar";
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

  const fetchOverdue = async () => {
    setLoading(true);
    try {
      const response = await api.get("/events/overdue-borrows");
      setEvents(Array.isArray(response.data) ? response.data : []);
    } catch {
      setError(t("loadReturnsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverdue();
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("returnsTitle")}</h1>
        <p className="mt-1 text-sm text-[#667777]">{t("returnsSubtitle")}</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={t("searchReturnsPlaceholder")} />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">{t("filterEndedDateLabel")}</p>
          <DatePicker value={endedDate} onChange={setEndedDate} className="h-11 px-4" />
        </div>
        {(search || endedDate) && (
          <button
            onClick={clearFilters}
            className="h-11 inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("clearFiltersLabel")}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-12 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-teal-600 mb-3" />
          <p className="text-gray-700 font-semibold">{t("noOverdueReturns")}</p>
          <p className="text-sm text-gray-500 mt-1">{t("noOverdueReturnsHint")}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-12 text-center">
          <p className="text-gray-700 font-semibold">{t("noResultsForFilterLabel")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedEvents.map((ev) => (
              <div key={ev.id} className="rounded-[24px] border border-red-200 bg-white p-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 shrink-0">
                    <PackageX className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800">{ev.name}</p>
                    <p className="text-xs text-red-600 mt-0.5">{t("endedOnLabel")} {formatEndedAt(ev.ended_at)}</p>
                    <ul className="mt-2 space-y-0.5">
                      {ev.items.map((it) => (
                        <li key={it.id} className="text-xs text-gray-500">{it.quantity}&times; {it.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEventId(ev.id)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 transition"
                >
                  <Undo2 className="h-4 w-4" />
                  {t("reviewLabel")}
                </button>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-6">
              <p className="text-sm text-gray-600 text-center sm:text-left">
                {t("pageOfLabel")} {safePage} {t("ofPagesLabel")} {totalPages} &bull; {filteredEvents.length} {t("recordsShownLabel")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  &larr;
                </button>
                <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                  {safePage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
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
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{modalEvent.name}</h2>
                <p className="text-xs text-red-600 mt-0.5">{t("endedOnLabel")} {formatEndedAt(modalEvent.ended_at)}</p>
              </div>
              <button onClick={() => setSelectedEventId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2">
              <p className="text-xs text-gray-500 mb-2">{t("releaseEachItemHint")}</p>
              {modalEvent.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 flex-wrap">
                  <p className="text-sm text-gray-800">{it.quantity}&times; {it.name}</p>
                  <div className="flex items-center gap-2 ml-auto">
                    <label className="text-xs text-gray-500">{t("qtyLabel")}</label>
                    <input
                      type="number"
                      min={1}
                      max={it.quantity}
                      value={qtyFor(it)}
                      onChange={(e) => setQtyFor(it, Number(e.target.value))}
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30"
                    />
                    <button
                      onClick={() => setConfirmRelease({ eventId: modalEvent.id, item: it, qty: qtyFor(it) })}
                      disabled={releasingItemId === it.id}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 transition"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {releasingItemId === it.id ? t("releasingLabel") : t("releaseLabel")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedEventId(null)} className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition">
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
            <div className="mb-3 text-teal-600 flex justify-center"><CheckCircle2 size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("returnSuccessTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
