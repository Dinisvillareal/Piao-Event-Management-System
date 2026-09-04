import React, { useEffect, useState } from "react";
import { Wallet, Plus, X, AlertTriangle, Trash2, XCircle, Pencil } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import api, { apiErrorMessage } from "../../../lib/api";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useLanguage } from "../../../i18n/LanguageContext";

const THIS_WEEK_KEY = "📅 This Week";
const UNKNOWN_DATE_KEY = "__UNKNOWN_DATE__";

interface EventOption {
  id: number | string;
  title: string;
  date?: string;
  event_start?: string;
  event_end?: string;
  call_time_start?: string;
  call_time_end?: string;
}

interface ExpenseSummary {
  approved_budget: number | null;
  total_expenses: number;
  is_over_budget: boolean;
  expenses: { id: number; item: string; amount: string | number; notes: string | null; created_at: string }[];
}

/**
 * UC-8: Record Event Budget and Expenses. Each event is a progress-bar
 * card (budget vs. spent) rather than a spreadsheet — the thing staff need
 * at a glance is "are we over budget", not a raw ledger.
 */
export default function BudgetView({ allEvents = [] }: { allEvents?: EventOption[] }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [eventListPage, setEventListPage] = useState(1);
  const eventListPerPage = 8;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [form, setForm] = useState({ item: "", amount: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<{ id: number; item: string } | null>(null);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; item: string } | null>(null);
  const [editForm, setEditForm] = useState({ item: "", amount: "", notes: "" });
  const [originalEditForm, setOriginalEditForm] = useState({ item: "", amount: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAddExpenseConfirm, setShowAddExpenseConfirm] = useState(false);
  const [showEditExpenseConfirm, setShowEditExpenseConfirm] = useState(false);

  const filteredEvents = allEvents.filter((e) => e.title?.toLowerCase().includes(search.toLowerCase()));

  // Reset to page 1 whenever the search narrows/widens the list, so a
  // stale page number never lands on an out-of-range (empty) page.
  useEffect(() => {
    setEventListPage(1);
  }, [search]);

  const eventListTotalPages = Math.max(1, Math.ceil(filteredEvents.length / eventListPerPage));
  const paginatedFilteredEvents = filteredEvents.slice(
    (eventListPage - 1) * eventListPerPage,
    eventListPage * eventListPerPage
  );

  // Same "This Week" / weekday-grouping convention as the Events page --
  // a flat list of raw "2026-06-03 07:00:00" timestamps is hostile to
  // non-technical or older residents/staff; grouping by day and writing
  // the time in plain 12-hour clock reads the way a person would say it.
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getEndOfWeek = (date: Date) => {
    const d = getStartOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const formatTimeFriendly = (value?: string | null): string => {
    const d = parseEventDateTime(value ?? undefined);
    if (!d) return "";
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  // Same Upcoming/Ongoing/Past classification as Events & Attendance --
  // once an event is Ongoing or Past, its recorded expenses are locked
  // from further edits/deletes, same idea as the event record itself.
  const parseEventDateTime = (value?: string | null): Date | null => {
    if (!value) return null;
    const iso = value.includes("T") ? value : value.replace(" ", "T");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  };

  const getEventStatus = (event: EventOption): { label: "Upcoming" | "Ongoing" | "Past"; color: string } => {
    const now = new Date();
    const upcoming = { label: "Upcoming" as const, color: "bg-teal-100 text-teal-800" };
    const ongoing = { label: "Ongoing" as const, color: "bg-amber-100 text-amber-800" };
    const past = { label: "Past" as const, color: "bg-amber-50 text-amber-700" };

    const start = parseEventDateTime(event.event_start) ?? parseEventDateTime(event.date);
    if (!start) return upcoming;

    let end = parseEventDateTime(event.event_end) ?? parseEventDateTime(event.call_time_end);
    if (!end) {
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    }

    if (now < start) return upcoming;
    if (now > end) return past;
    return ongoing;
  };

  const eventStatusLabel = (label: "Upcoming" | "Ongoing" | "Past") =>
    label === "Upcoming" ? t("upcomingBadge") : label === "Ongoing" ? t("ongoingBadge") : t("pastBadge");

  // Group the event picker list by day, "This Week" pulled out on top --
  // same structure as the Events page, so the two lists feel like one
  // consistent system rather than two different UIs.
  const groupedEvents = React.useMemo(() => {
    const groups: Record<string, EventOption[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getStartOfWeek(today);
    const weekEnd = getEndOfWeek(today);

    paginatedFilteredEvents.forEach((e) => {
      let dateString = e.date || e.event_start || "";
      if (dateString.includes(" ")) dateString = dateString.split(" ")[0];
      if (dateString.includes("T")) dateString = dateString.split("T")[0];

      const eventDate = new Date(dateString);
      eventDate.setHours(0, 0, 0, 0);

      let sectionKey: string;
      if (!isNaN(eventDate.getTime()) && eventDate >= weekStart && eventDate <= weekEnd) {
        sectionKey = THIS_WEEK_KEY;
      } else if (!isNaN(eventDate.getTime()) && dateString) {
        sectionKey = new Date(dateString).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
      } else {
        sectionKey = UNKNOWN_DATE_KEY;
      }

      if (!groups[sectionKey]) groups[sectionKey] = [];
      groups[sectionKey].push(e);
    });

    return Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === THIS_WEEK_KEY) return -1;
      if (keyB === THIS_WEEK_KEY) return 1;
      if (keyA === UNKNOWN_DATE_KEY) return 1;
      if (keyB === UNKNOWN_DATE_KEY) return -1;
      const dateA = new Date(keyA);
      const dateB = new Date(keyB);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        // Newest day first (descending) -- "This Week" still leads since
        // it's pinned above, unrelated to this ordering.
        return dateB.getTime() - dateA.getTime();
      }
      return 0;
    });
  }, [paginatedFilteredEvents]);

  const selectedEvent = allEvents.find((e) => String(e.id) === String(selectedEventId));
  const selectedEventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;
  const isExpenseLocked = selectedEventStatus?.label === "Past" || selectedEventStatus?.label === "Ongoing";

  const loadSummary = async (eventId: string | number) => {
    setLoadingSummary(true);
    try {
      const res = await api.get(`/events/${eventId}/expenses`);
      setSummary(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadBudgetFailed")));
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) loadSummary(selectedEventId);
  }, [selectedEventId]);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || isExpenseLocked) return;
    setError(null);

    if (!form.item.trim()) {
      setError(t("itemNameRequiredError"));
      return;
    }
    const amountValue = Number(form.amount);
    if (form.amount.trim() === "" || !Number.isFinite(amountValue) || amountValue < 0) {
      setError(t("invalidAmountError"));
      return;
    }

    setShowAddExpenseConfirm(true);
  };

  const performAddExpense = async () => {
    setShowAddExpenseConfirm(false);
    if (!selectedEventId) return;
    try {
      await api.post(`/events/${selectedEventId}/expenses`, {
        item: form.item,
        amount: form.amount,
        notes: form.notes || undefined,
      });
      setForm({ item: "", amount: "", notes: "" });
      loadSummary(selectedEventId);
    } catch (e) {
      setError(apiErrorMessage(e, t("recordExpenseFailed")));
    }
  };

  const openEditExpense = (exp: { id: number; item: string; amount: string | number; notes: string | null }) => {
    const initial = { item: exp.item, amount: String(exp.amount), notes: exp.notes ?? "" };
    setEditingExpense({ id: exp.id, item: exp.item });
    setEditForm(initial);
    setOriginalEditForm(initial);
  };

  // Nothing to submit if the form still matches the expense being edited.
  const isEditExpenseUnchanged =
    editForm.item === originalEditForm.item &&
    editForm.amount === originalEditForm.amount &&
    editForm.notes === originalEditForm.notes;

  const handleUpdateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !selectedEventId) return;
    setError(null);

    if (!editForm.item.trim()) {
      setError(t("itemNameRequiredError"));
      return;
    }
    const amountValue = Number(editForm.amount);
    if (editForm.amount.trim() === "" || !Number.isFinite(amountValue) || amountValue < 0) {
      setError(t("invalidAmountError"));
      return;
    }

    setShowEditExpenseConfirm(true);
  };

  const performUpdateExpense = async () => {
    setShowEditExpenseConfirm(false);
    if (!editingExpense || !selectedEventId) return;
    setSavingEdit(true);
    try {
      await api.put(`/events/${selectedEventId}/expenses/${editingExpense.id}`, {
        item: editForm.item,
        amount: editForm.amount,
        notes: editForm.notes || undefined,
      });
      setEditingExpense(null);
      loadSummary(selectedEventId);
    } catch (e) {
      setError(apiErrorMessage(e, t("updateExpenseFailed")));
      // Revert to what's actually saved instead of leaving the rejected
      // edit sitting in the form.
      setEditForm(originalEditForm);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!deleteExpense || !selectedEventId) return;
    setDeletingExpense(true);
    try {
      await api.delete(`/events/${selectedEventId}/expenses/${deleteExpense.id}`);
      setDeleteExpense(null);
      loadSummary(selectedEventId);
    } catch (e) {
      setError(apiErrorMessage(e, t("deleteExpenseFailed")));
      setDeleteExpense(null);
    } finally {
      setDeletingExpense(false);
    }
  };

  const spentPct = summary?.approved_budget
    ? Math.min(100, (summary.total_expenses / Number(summary.approved_budget)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("budget")}</h1>
        <p className="mt-1 text-sm text-[#667777]">{t("budgetSubtitle")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-4">
          <SearchBar value={search} onChange={setSearch} placeholder={t("searchEventsPlaceholderShort")} />
          <div className="mt-3 max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">{t("noEventsFound")}</p>
            ) : (
              groupedEvents.map(([dateLabel, eventsInGroup]) => (
                <div key={dateLabel}>
                  <p className="px-1 pb-1.5 pt-3 first:pt-0 text-[11px] font-bold uppercase tracking-wide text-[#005f63]/60">
                    {dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel === UNKNOWN_DATE_KEY ? t("unknownDateLabel") : dateLabel}
                  </p>
                  <div className="space-y-2">
                    {eventsInGroup.map((e) => {
                      const timeLabel = formatTimeFriendly(e.event_start || e.date);
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEventId(String(e.id))}
                          className={`w-full text-left rounded-2xl px-4 py-3 transition ${
                            String(selectedEventId) === String(e.id)
                              ? "bg-[#005f63] text-white shadow-md"
                              : "bg-gray-50 text-gray-700 hover:bg-teal-50"
                          }`}
                        >
                          <p className="font-semibold text-sm truncate">{e.title}</p>
                          {timeLabel && <p className="text-xs opacity-70">{timeLabel}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          {eventListTotalPages > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {t("pageOfLabel")} {eventListPage} {t("ofPagesLabel")} {eventListTotalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEventListPage(1)}
                  disabled={eventListPage === 1}
                  title={t("firstPageLabel")}
                  className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  «
                </button>
                <button
                  onClick={() => setEventListPage((p) => Math.max(1, p - 1))}
                  disabled={eventListPage === 1}
                  title={t("previousPageLabel")}
                  className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  ←
                </button>
                <span className="h-7 w-7 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-xs font-semibold">
                  {eventListPage}
                </span>
                <button
                  onClick={() => setEventListPage((p) => Math.min(eventListTotalPages, p + 1))}
                  disabled={eventListPage === eventListTotalPages}
                  title={t("nextPageLabel")}
                  className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  →
                </button>
                <button
                  onClick={() => setEventListPage(eventListTotalPages)}
                  disabled={eventListPage === eventListTotalPages}
                  title={t("lastPageLabel")}
                  className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-5">
          {!selectedEventId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-16">
              <Wallet className="h-10 w-10 mb-3" />
              <p>{t("selectEventToViewBudget")}</p>
            </div>
          ) : loadingSummary || !summary ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-sm font-semibold text-gray-700">
                    ₱{summary.total_expenses.toLocaleString()} {t("spentOf")}
                    {summary.approved_budget !== null && ` ${t("ofLabel")} ₱${Number(summary.approved_budget).toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedEventStatus && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${selectedEventStatus.color}`}>{eventStatusLabel(selectedEventStatus.label)}</span>
                    )}
                    {summary.is_over_budget && (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> {t("overBudget")}
                      </span>
                    )}
                  </div>
                </div>
                {summary.approved_budget !== null && (
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full transition-all ${summary.is_over_budget ? "bg-red-500" : "bg-[#3ec5c5]"}`}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                )}
                {summary.approved_budget === null && (
                  <p className="text-xs text-gray-400 italic">{t("noApprovedBudgetYet")}</p>
                )}
              </div>

              {isExpenseLocked && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-2">
                  {t("expenseAddLockedHint")}
                </p>
              )}
              <form onSubmit={handleAddExpense} noValidate className="grid sm:grid-cols-[1fr_140px_auto] gap-2">
                <input required disabled={isExpenseLocked} value={form.item} onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))} placeholder={t("itemExpenseDescPlaceholder")} className="rounded-full border border-gray-200 px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed" />
                <input required disabled={isExpenseLocked} type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder={t("amountPlaceholder")} className="rounded-full border border-gray-200 px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed" />
                <button
                  type="submit"
                  disabled={isExpenseLocked}
                  title={isExpenseLocked ? t("expenseAddLockedHint") : undefined}
                  className="inline-flex items-center justify-center gap-1 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#005f63]"
                >
                  <Plus className="h-4 w-4" /> {t("addLabel")}
                </button>
              </form>

              <div className="max-h-[35vh] overflow-y-auto space-y-2">
                {summary.expenses.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-6 text-center">{t("noExpensesRecorded")}</p>
                ) : (
                  summary.expenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{exp.item}</p>
                        {exp.notes && <p className="text-xs text-gray-500 truncate">{exp.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-sm font-bold text-[#005f63]">₱{Number(exp.amount).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => openEditExpense(exp)}
                          disabled={isExpenseLocked}
                          title={isExpenseLocked ? t("expenseEventLockedHint") : t("editLabel")}
                          className="p-1.5 rounded-full text-gray-300 hover:text-[#005f63] hover:bg-teal-50 transition opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-300 group-hover:disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteExpense({ id: exp.id, item: exp.item })}
                          disabled={isExpenseLocked}
                          title={isExpenseLocked ? t("expenseEventLockedHint") : t("deleteTitle")}
                          className="p-1.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-300 group-hover:disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{error}</p>
            <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {editingExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => !savingEdit && setEditingExpense(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[#005f63]">{t("editExpenseTitle")}</h2>
              <button onClick={() => setEditingExpense(null)} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateExpense} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("itemExpenseDescPlaceholder")}</label>
                <input required value={editForm.item} onChange={(e) => setEditForm((p) => ({ ...p, item: e.target.value }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("amountPlaceholder")}</label>
                <input required type="number" min={0} step="0.01" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("notesLabel")}</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={savingEdit || isEditExpenseUnchanged} title={isEditExpenseUnchanged ? t("noChangesToSaveHint") : undefined} className="flex-1 py-2.5 rounded-full font-bold bg-[#005f63] hover:bg-[#004a4d] text-white disabled:opacity-60 disabled:cursor-not-allowed">{savingEdit ? t("savingLabel") : t("saveChanges")}</button>
                <button type="button" onClick={() => setEditingExpense(null)} disabled={savingEdit} className="px-6 py-2.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600 disabled:opacity-60">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showAddExpenseConfirm}
        icon={<Plus size={32} />}
        title={t("confirmAddExpenseTitle")}
        body={t("confirmAddExpenseBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesAdd")}
        onCancel={() => setShowAddExpenseConfirm(false)}
        onConfirm={performAddExpense}
      />

      <ConfirmDialog
        open={showEditExpenseConfirm}
        icon={<Pencil size={32} />}
        title={t("confirmUpdateExpenseTitle")}
        body={t("confirmUpdateExpenseBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setShowEditExpenseConfirm(false)}
        onConfirm={performUpdateExpense}
      />

      {deleteExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => !deletingExpense && setDeleteExpense(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-red-500 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{t("deleteExpenseConfirm")} "{deleteExpense.item}"?</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteExpense(null)} disabled={deletingExpense} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={confirmDeleteExpense} disabled={deletingExpense} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
