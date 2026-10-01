import React, { useEffect, useMemo, useRef, useState } from "react";
import { Wallet, Plus, X, AlertTriangle, Trash2, Pencil, Paperclip, FileText, Download, FileSpreadsheet, Banknote, PiggyBank, Search } from "lucide-react";
import StatusModal from "../../../components/ui/StatusModal";
import api, { apiErrorMessage } from "../../../lib/api";
import { exportExpenseReportXlsx } from "../../../lib/expenseReportExport";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import NumberStepper from "../../../components/ui/NumberStepper";
import Skeleton from "../../../components/ui/Skeleton";
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
  expenses: { id: number; item: string; amount: string | number; notes: string | null; recorded_by?: string | null; created_at: string; receipt_url: string | null }[];
}

/**
 * UC-8: Record Event Budget and Expenses. A portfolio-wide KPI strip (total
 * approved, total spent, remaining, events over budget) sits on top of the
 * same master-detail layout this page always needed -- pick an event on the
 * left, work its budget on the right -- so staff get the fleet-wide picture
 * before drilling into any one event's ledger.
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
  // Recording an expense that pushes an event over budget is allowed
  // (approved_budget is a soft cap, not a hard wall -- see
  // EventExpenseController::store) but staff should find out right when
  // it happens, not only by later noticing a red progress bar.
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<{ id: number; item: string } | null>(null);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; item: string } | null>(null);
  const [editForm, setEditForm] = useState({ item: "", amount: "", notes: "" });
  const [originalEditForm, setOriginalEditForm] = useState({ item: "", amount: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  // Receipt attachments -- required proof-of-purchase image/PDF per
  // expense (see EventExpenseController::store's "receipt" => "required"
  // rule). A picked File sits here until the expense is actually saved;
  // existingEditReceiptUrl tracks what's already attached to the expense
  // being edited -- it can only ever be *replaced*, never removed outright
  // (see the update() guard), so there's no "remove" state to track.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const addReceiptInputRef = useRef<HTMLInputElement>(null);
  const [existingEditReceiptUrl, setExistingEditReceiptUrl] = useState<string | null>(null);
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const editReceiptInputRef = useRef<HTMLInputElement>(null);
  // Receipt viewer -- "View receipt" opens this instead of a raw new-tab
  // link, so images preview inline and PDFs render in an embedded viewer
  // rather than dumping the visitor onto a bare file URL.
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; item: string } | null>(null);
  // Confirm-before / success-after around the receipt download button
  // itself, same pattern as the rest of the app (Add/Update/Delete Expense
  // below, the Reports page's Word/PDF download) instead of the plain
  // silent <a download> this used to be.
  const [confirmDownloadReceipt, setConfirmDownloadReceipt] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [receiptDownloadSuccess, setReceiptDownloadSuccess] = useState(false);
  // One shared success modal for Add/Update/Delete expense -- mirrors the
  // confirm-before / success-after pattern used elsewhere in the app
  // (e.g. Returns), so a completed action is never silent.
  const [expenseSuccessMessage, setExpenseSuccessMessage] = useState<string | null>(null);
  const [showAddExpenseConfirm, setShowAddExpenseConfirm] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  // Confirm-before / success-after around the CSV export button, same
  // pattern already used below for a receipt download.
  const [confirmExportCsv, setConfirmExportCsv] = useState(false);
  const [exportCsvSuccess, setExportCsvSuccess] = useState(false);
  const [showEditExpenseConfirm, setShowEditExpenseConfirm] = useState(false);
  // Closing the Edit Expense modal (X, Cancel, or the backdrop) with
  // unsaved changes asks first instead of silently discarding them.
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false);
  // Same guard for the Add Expense modal -- closing it (X, Cancel, or the
  // backdrop) after typing anything into the form asks first instead of
  // silently throwing the draft away.
  const [showAddCancelConfirm, setShowAddCancelConfirm] = useState(false);

  // Portfolio-wide KPI strip -- the same /reports/budget-summary endpoint
  // the Reports and Dashboard pages already use, called with no date
  // range so it covers every event ever recorded. Kept as its OWN fetch,
  // separate from the per-event `summary` below, so the top-of-page
  // totals stay put while browsing/searching the event list, and instead
  // refresh on their own short interval like a real live dashboard.
  const [portfolio, setPortfolio] = useState<{ summary: any; per_event: any[] } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchPortfolio = async () => {
    try {
      const res = await api.get("/reports/budget-summary");
      setPortfolio({ summary: res.data?.summary ?? null, per_event: res.data?.per_event ?? [] });
      setLastUpdated(new Date());
    } catch (e) {
      // Silent -- the KPI strip just keeps showing its last good numbers;
      // the per-event panel below has its own error modal if the API is
      // actually unreachable.
    }
  };

  // Any modal that mutates an expense (add/edit/delete, plus their
  // confirm/cancel steps) pauses the poll so numbers don't shift under a
  // staff member mid-action -- the same pattern used on Inventory.
  const expenseModalOpen =
    !!editingExpense || deleteExpense !== null || showAddExpenseConfirm || showEditExpenseConfirm || showEditCancelConfirm ||
    showAddExpenseModal || showAddCancelConfirm;

  useEffect(() => {
    fetchPortfolio();
    const poll = setInterval(() => {
      if (!expenseModalOpen) fetchPortfolio();
    }, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseModalOpen]);

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
  };

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

  // Dark-palette equivalents of the same three statuses, same teal/gold/
  // neutral mapping used for event status pills everywhere else (Events
  // list/detail).
  const getEventStatus = (event: EventOption): { label: "Upcoming" | "Ongoing" | "Past"; color: string; dot: string } => {
    const now = new Date();
    const upcoming = { label: "Upcoming" as const, color: "bg-[#4FBEB0]/15 text-[#7DD8CB]", dot: "bg-[#4FBEB0]" };
    const ongoing = { label: "Ongoing" as const, color: "bg-gold-400/15 text-gold-300", dot: "bg-gold-400" };
    const past = { label: "Past" as const, color: "bg-white/10 text-white/50", dot: "bg-white/40" };

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

  // Receipt file-type detection, purely from the URL's own extension --
  // the backend already only ever accepts jpg/jpeg/png/pdf (see
  // EventExpenseController::store/update), so this is just telling the
  // two apart to pick a preview, not re-validating the upload.
  const receiptExt = (url: string) => {
    const clean = url.split("?")[0].split("#")[0];
    const dot = clean.lastIndexOf(".");
    return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
  };
  const isImageReceipt = (ext: string) => ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  const isPdfReceipt = (ext: string) => ext === "pdf";

  // Fires only after confirmDownloadReceipt is accepted. Pulls the receipt
  // as a blob and triggers the save via a throwaway <a download> instead of
  // just pointing the browser straight at the file URL, the same way
  // ReportsView's Word/PDF export does -- the fetch actually resolving is
  // the closest thing the browser gives JS to "the file was downloaded",
  // so only then do we show the success popup.
  const handleDownloadReceipt = async () => {
    if (!viewingReceipt) return;
    setConfirmDownloadReceipt(false);
    setDownloadingReceipt(true);
    try {
      const response = await fetch(viewingReceipt.url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = viewingReceipt.item || "receipt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setReceiptDownloadSuccess(true);
    } catch {
      setError(t("downloadReceiptFailedMessage"));
    } finally {
      setDownloadingReceipt(false);
    }
  };

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

  // Nothing typed yet -- an untouched form (or a receipt already cleared
  // back out) can close without asking, same idea as isEditExpenseUnchanged
  // above but against a blank slate instead of a saved expense.
  const isAddExpenseEmpty =
    !form.item.trim() && !form.amount.trim() && !form.notes.trim() && !receiptFile;

  const resetAddExpenseForm = () => {
    setForm({ item: "", amount: "", notes: "" });
    setReceiptFile(null);
    if (addReceiptInputRef.current) addReceiptInputRef.current.value = "";
  };

  const handleCloseAddExpense = () => {
    if (!isAddExpenseEmpty) setShowAddCancelConfirm(true);
    else setShowAddExpenseModal(false);
  };

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
    if (!receiptFile) {
      setError(t("receiptRequiredError"));
      return;
    }

    setShowAddExpenseConfirm(true);
  };

  const performAddExpense = async () => {
    setShowAddExpenseConfirm(false);
    if (!selectedEventId || !receiptFile) return;
    try {
      const fd = new FormData();
      fd.append("item", form.item);
      fd.append("amount", form.amount);
      if (form.notes) fd.append("notes", form.notes);
      fd.append("receipt", receiptFile);

      const result = await api.post(`/events/${selectedEventId}/expenses`, fd);
      setForm({ item: "", amount: "", notes: "" });
      setReceiptFile(null);
      if (addReceiptInputRef.current) addReceiptInputRef.current.value = "";
      setShowAddExpenseModal(false);
      loadSummary(selectedEventId);
      fetchPortfolio();
      if (result?.data?.is_over_budget) {
        setBudgetWarning(
          t("expenseOverBudgetWarning")
            .replace("{total}", Number(result.data.total_expenses).toLocaleString())
        );
      } else {
        setExpenseSuccessMessage(t("expenseAddedWithReceiptSuccess"));
      }
    } catch (e) {
      setError(apiErrorMessage(e, t("recordExpenseFailed")));
    }
  };

  // Exports a real, styled .xlsx workbook (see lib/expenseReportExport.ts)
  // rather than a raw CSV row dump -- a colored title/event banner, an
  // event-details block (status, date, budget figures), then the expense
  // table with zebra striping and real currency formatting, and a totals
  // row, so the file is presentable as soon as it's opened. Left enabled
  // once an event is locked -- staff still need to pull a finished event's
  // numbers for reporting, only *adding* new expenses is what a finished
  // event should block.
  const performExportExpensesCsv = async () => {
    setConfirmExportCsv(false);
    if (!selectedEventId || !selectedEvent || !summary || summary.expenses.length === 0) return;
    const approved = summary.approved_budget !== null ? Number(summary.approved_budget) : null;
    const spent = Number(summary.total_expenses);
    const timeLabel = formatTimeFriendly(selectedEvent.event_start || selectedEvent.date);

    try {
      await exportExpenseReportXlsx({
        eventTitle: selectedEvent.title,
        statusLabel: selectedEventStatus ? eventStatusLabel(selectedEventStatus.label) : "",
        dateLabel: `${selectedEvent.event_start || selectedEvent.date || ""}${timeLabel ? ` ${timeLabel}` : ""}`,
        approvedBudget: approved,
        totalSpent: spent,
        expenses: summary.expenses,
      });
      setExportCsvSuccess(true);
    } catch (e) {
      setError(apiErrorMessage(e, t("expenseReportExportFailed")));
    }
  };

  const openEditExpense = (exp: { id: number; item: string; amount: string | number; notes: string | null; receipt_url: string | null }) => {
    const initial = { item: exp.item, amount: String(exp.amount), notes: exp.notes ?? "" };
    setEditingExpense({ id: exp.id, item: exp.item });
    setEditForm(initial);
    setOriginalEditForm(initial);
    setExistingEditReceiptUrl(exp.receipt_url);
    setEditReceiptFile(null);
    if (editReceiptInputRef.current) editReceiptInputRef.current.value = "";
  };

  // Nothing to submit if the form still matches the expense being edited
  // -- including whether a replacement receipt was picked. A receipt can
  // no longer be removed outright (see the update() guard), so there's
  // nothing else receipt-related to track here.
  const isEditExpenseUnchanged =
    editForm.item === originalEditForm.item &&
    editForm.amount === originalEditForm.amount &&
    editForm.notes === originalEditForm.notes &&
    !editReceiptFile;

  const handleCloseEditExpense = () => {
    if (!isEditExpenseUnchanged) setShowEditCancelConfirm(true);
    else setEditingExpense(null);
  };

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
      const fd = new FormData();
      fd.append("_method", "PUT");
      fd.append("item", editForm.item);
      fd.append("amount", editForm.amount);
      if (editForm.notes) fd.append("notes", editForm.notes);
      if (editReceiptFile) fd.append("receipt", editReceiptFile);

      await api.post(`/events/${selectedEventId}/expenses/${editingExpense.id}`, fd);
      setEditingExpense(null);
      loadSummary(selectedEventId);
      fetchPortfolio();
      setExpenseSuccessMessage(t("expenseUpdatedSuccess"));
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
      fetchPortfolio();
      setExpenseSuccessMessage(t("expenseDeletedSuccess"));
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
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events pages, so Budget
        & Expenses reads as part of the same system instead of the old
        light "paper" page. The smaller modals further below (receipt
        viewer, confirm/success/error/delete) stay on their original light
        theme, same scoping used on every other staff view; the Edit
        Expense modal is darkened along with the page, matching the
        Households/Inventory Edit modal treatment. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { value: `₱${Number(portfolioSummary.total_approved_budget || 0).toLocaleString()}`, label: t("totalApprovedBudgetStatLabel"), description: t("totalApprovedBudgetStatDesc"), icon: Wallet, gradient: "from-sage-400 to-sage-700" },
          { value: `₱${Number(portfolioSummary.total_expenses || 0).toLocaleString()}`, label: t("totalSpentStatLabel"), description: t("totalSpentStatDesc"), icon: Banknote, gradient: "from-gold-400 to-gold-700" },
          { value: `₱${Number(portfolioSummary.total_remaining || 0).toLocaleString()}`, label: t("remainingBudgetStatLabel"), description: t("remainingBudgetStatDesc"), icon: PiggyBank, gradient: "from-sage-800 to-[#1C2E2B]" },
          { value: portfolioSummary.events_over_budget || 0, label: t("eventsOverBudgetStatLabel"), description: t("eventsOverBudgetStatDesc"), icon: AlertTriangle, gradient: "from-[#8A3D2C] to-[#5C2A1E]" },
        ].map((card, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white shadow-sm transition-shadow duration-300 hover:shadow-md`}
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

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchEventsPlaceholderShort")}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>
          <div className="mt-3 max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-white/40 italic py-6 text-center">{t("noEventsFound")}</p>
            ) : (
              groupedEvents.map(([dateLabel, eventsInGroup]) => (
                <div key={dateLabel}>
                  <p className="px-1 pb-1.5 pt-3 first:pt-0 text-[11px] font-bold uppercase tracking-wide text-[#7DD8CB]">
                    {dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel === UNKNOWN_DATE_KEY ? t("unknownDateLabel") : dateLabel}
                  </p>
                  <div className="space-y-2">
                    {eventsInGroup.map((e) => {
                      const timeLabel = formatTimeFriendly(e.event_start || e.date);
                      const isSelected = String(selectedEventId) === String(e.id);
                      // Mini progress bar straight from the portfolio fetch --
                      // no extra request per row -- so browsing the list
                      // already flags which events are close to or over
                      // their approved budget, not just the one open on
                      // the right.
                      const rowBudget = budgetByEventId.get(String(e.id));
                      const rowApproved = rowBudget?.approved_budget ? Number(rowBudget.approved_budget) : null;
                      const rowSpent = rowBudget?.total_expenses ?? 0;
                      const rowPct = rowApproved ? Math.min(100, (rowSpent / rowApproved) * 100) : null;
                      const rowOver = rowApproved !== null && rowSpent > rowApproved;
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEventId(String(e.id))}
                          className={`w-full text-left rounded-2xl px-4 py-3 transition ${
                            isSelected
                              ? "bg-gold-400 text-[#08130F] shadow-md"
                              : "bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.06]"
                          }`}
                        >
                          <p className="font-semibold text-sm truncate">{e.title}</p>
                          {timeLabel && <p className={`text-xs ${isSelected ? "text-[#08130F]/70" : "text-white/45"}`}>{timeLabel}</p>}
                          {rowPct !== null && (
                            <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${isSelected ? "bg-[#08130F]/20" : "bg-white/10"}`}>
                              <div
                                className={`h-full rounded-full ${rowOver ? "bg-red-500" : isSelected ? "bg-[#08130F]" : "bg-[#4FBEB0]"}`}
                                style={{ width: `${rowPct}%` }}
                              />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          {eventListTotalPages > 1 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
              <p className="text-xs text-white/45">
                {t("pageOfLabel")} {eventListPage} {t("ofPagesLabel")} {eventListTotalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEventListPage(1)}
                  disabled={eventListPage === 1}
                  title={t("firstPageLabel")}
                  className="h-7 w-7 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  «
                </button>
                <button
                  onClick={() => setEventListPage((p) => Math.max(1, p - 1))}
                  disabled={eventListPage === 1}
                  title={t("previousPageLabel")}
                  className="h-7 w-7 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  ←
                </button>
                <span className="h-7 w-7 rounded-full bg-gold-400 text-[#08130F] flex items-center justify-center text-xs font-bold">
                  {eventListPage}
                </span>
                <button
                  onClick={() => setEventListPage((p) => Math.min(eventListTotalPages, p + 1))}
                  disabled={eventListPage === eventListTotalPages}
                  title={t("nextPageLabel")}
                  className="h-7 w-7 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  →
                </button>
                <button
                  onClick={() => setEventListPage(eventListTotalPages)}
                  disabled={eventListPage === eventListTotalPages}
                  title={t("lastPageLabel")}
                  className="h-7 w-7 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          {!selectedEventId ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 py-16">
              <Wallet className="h-10 w-10 mb-3 text-white/20" />
              <p>{t("selectEventToViewBudget")}</p>
            </div>
          ) : loadingSummary || !summary ? (
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
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-sm font-semibold text-white">
                    ₱{summary.total_expenses.toLocaleString()} {t("spentOf")}
                    {summary.approved_budget !== null && ` ${t("ofLabel")} ₱${Number(summary.approved_budget).toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedEventStatus && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selectedEventStatus.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedEventStatus.dot}`} />
                        {eventStatusLabel(selectedEventStatus.label)}
                      </span>
                    )}
                    {summary.is_over_budget && (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> {t("overBudget")}
                      </span>
                    )}
                  </div>
                </div>
                {summary.approved_budget !== null && (
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full transition-all ${summary.is_over_budget ? "bg-red-500" : "bg-[#4FBEB0]"}`}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                )}
                {summary.approved_budget === null && (
                  <p className="text-xs text-white/40 italic">{t("noApprovedBudgetYet")}</p>
                )}
              </div>

              {isExpenseLocked && (
                <p className="text-xs text-gold-300 bg-gold-400/10 border border-gold-400/25 rounded-full px-4 py-2">
                  {t("expenseAddLockedHint")}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isExpenseLocked}
                  title={isExpenseLocked ? t("expenseAddLockedHint") : undefined}
                  onClick={() => setShowAddExpenseModal(true)}
                  className="inline-flex items-center justify-center gap-1 rounded-full bg-gold-400 hover:bg-gold-500 text-[#08130F] px-4 py-2 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gold-400"
                >
                  <Plus className="h-4 w-4" /> {t("addExpenseTitle")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExportCsv(true)}
                  disabled={summary.expenses.length === 0}
                  title={t("exportCsvLabel")}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 text-white px-4 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="h-4 w-4" /> {t("exportCsvLabel")}
                </button>
              </div>

              <div className="max-h-[35vh] overflow-y-auto space-y-2">
                {summary.expenses.length === 0 ? (
                  <p className="text-sm text-white/40 italic py-6 text-center">{t("noExpensesRecorded")}</p>
                ) : (
                  summary.expenses.map((exp) => (
                    <div key={exp.id} className="flex items-start justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 group">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{exp.item}</p>
                          {exp.receipt_url && (
                            <button
                              type="button"
                              onClick={() => setViewingReceipt({ url: exp.receipt_url as string, item: exp.item })}
                              title={t("viewReceiptLabel")}
                              className="text-white/50 hover:text-[#7DD8CB] transition shrink-0"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {exp.notes && <p className="mt-0.5 text-xs text-white/50 whitespace-pre-wrap break-words">{exp.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-sm font-bold text-[#7DD8CB]">₱{Number(exp.amount).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => openEditExpense(exp)}
                          disabled={isExpenseLocked}
                          title={isExpenseLocked ? t("expenseEventLockedHint") : t("editLabel")}
                          className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white/40 group-hover:disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteExpense({ id: exp.id, item: exp.item })}
                          disabled={isExpenseLocked}
                          title={isExpenseLocked ? t("expenseEventLockedHint") : t("deleteTitle")}
                          className="p-1.5 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white/40 group-hover:disabled:opacity-40"
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
      </div>
      </div>

      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} />
      <StatusModal open={!!budgetWarning} type="warning" title={t("overBudgetTitle")} message={budgetWarning || ""} okLabel={t("okLabel")} onClose={() => setBudgetWarning(null)} />

      {/* Add Expense modal -- same dark navy card treatment as Edit Expense
          below, replacing the old always-visible inline row so the form
          only takes over the screen while actually adding one. */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={handleCloseAddExpense}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">{t("addExpenseTitle")}</h2>
              <button onClick={handleCloseAddExpense} className="text-white/50 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddExpense} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("itemExpenseDescPlaceholder")}</label>
                <input
                  required
                  value={form.item}
                  onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))}
                  placeholder={t("itemExpenseDescPlaceholder")}
                  className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("amountPlaceholder")}</label>
                <NumberStepper
                  required
                  fullWidth
                  min={0}
                  step={0.01}
                  value={form.amount}
                  onChange={(v) => setForm((p) => ({ ...p, amount: v }))}
                  placeholder={t("amountPlaceholder")}
                  className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-4 pr-6 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("notesLabel")}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("receiptLabel")}</label>
                <input
                  ref={addReceiptInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {receiptFile ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <FileText className="h-4 w-4 text-[#7DD8CB] shrink-0" />
                    <span className="truncate">{receiptFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptFile(null);
                        if (addReceiptInputRef.current) addReceiptInputRef.current.value = "";
                      }}
                      className="text-white/50 hover:text-red-400 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addReceiptInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 px-4 py-2 text-sm text-gold-300 hover:bg-gold-400/10 transition"
                  >
                    <Paperclip className="h-4 w-4" /> {t("attachReceiptRequiredLabel")}
                  </button>
                )}
                {!receiptFile && <p className="mt-1 text-xs text-gold-300">{t("receiptRequiredHint")}</p>}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 rounded-full font-bold bg-gold-400 hover:bg-gold-500 text-[#08130F] transition">{t("addLabel")}</button>
                <button type="button" onClick={handleCloseAddExpense} className="px-6 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense modal -- dark navy card, same treatment as the
          Households/Inventory Edit modals (this page's own core edit
          form, as opposed to the confirm/success/error/receipt modals
          further below which stay on their original light theme). */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => !savingEdit && handleCloseEditExpense()}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">{t("editExpenseTitle")}</h2>
              <button onClick={handleCloseEditExpense} className="text-white/50 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateExpense} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("itemExpenseDescPlaceholder")}</label>
                <input required value={editForm.item} onChange={(e) => setEditForm((p) => ({ ...p, item: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("amountPlaceholder")}</label>
                {/* Our own up/down buttons instead of the browser's native
                    spinner -- see NumberStepper.tsx for why. */}
                <NumberStepper
                  required
                  fullWidth
                  min={0}
                  step={0.01}
                  value={editForm.amount}
                  onChange={(v) => setEditForm((p) => ({ ...p, amount: v }))}
                  className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-4 pr-6 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("notesLabel")}</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("receiptLabel")}</label>
                {editReceiptFile ? (
                  <div className="flex items-center gap-2 text-sm text-white/50">
                    <FileText className="h-4 w-4 text-[#7DD8CB] shrink-0" />
                    <span className="truncate">{editReceiptFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditReceiptFile(null);
                        if (editReceiptInputRef.current) editReceiptInputRef.current.value = "";
                      }}
                      className="text-white/50 hover:text-red-400 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : existingEditReceiptUrl ? (
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setViewingReceipt({ url: existingEditReceiptUrl, item: editForm.item })}
                      className="text-[#7DD8CB] hover:underline flex items-center gap-1"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> {t("viewReceiptLabel")}
                    </button>
                    <button type="button" onClick={() => editReceiptInputRef.current?.click()} className="text-xs text-white/50 hover:underline">
                      {t("replaceReceiptLabel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => editReceiptInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
                  >
                    <Paperclip className="h-4 w-4" /> {t("attachReceiptLabel")}
                  </button>
                )}
                <input
                  ref={editReceiptInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setEditReceiptFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={savingEdit || isEditExpenseUnchanged} title={isEditExpenseUnchanged ? t("noChangesToSaveHint") : undefined} className="flex-1 py-2.5 rounded-full font-bold bg-gold-400 hover:bg-gold-500 text-[#08130F] disabled:opacity-60 disabled:cursor-not-allowed">{savingEdit ? t("savingLabel") : t("saveChanges")}</button>
                <button type="button" onClick={handleCloseEditExpense} disabled={savingEdit} className="px-6 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 disabled:opacity-60">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard for the Edit Expense modal */}
      {showEditCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowEditCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowEditCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowEditCancelConfirm(false);
                  setEditingExpense(null);
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard for the Add Expense modal -- same dialog as
          Edit's above, just against a blank form instead of a saved
          expense's original values. */}
      {showAddCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowAddCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowAddCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowAddCancelConfirm(false);
                  setShowAddExpenseModal(false);
                  resetAddExpenseForm();
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
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

      <StatusModal open={!!expenseSuccessMessage} type="success" title={t("expenseSuccessTitle")} message={expenseSuccessMessage || ""} okLabel={t("okLabel")} onClose={() => setExpenseSuccessMessage(null)} />

      {viewingReceipt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4" onClick={() => setViewingReceipt(null)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[24px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 text-[#4FBEB0] shrink-0">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{viewingReceipt.item}</p>
                  <p className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
                    {receiptExt(viewingReceipt.url) || t("fileLabel")}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewingReceipt(null)} className="text-white/40 hover:text-white p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black/20 flex items-center justify-center p-4">
              {isImageReceipt(receiptExt(viewingReceipt.url)) ? (
                <img src={viewingReceipt.url} alt={viewingReceipt.item} className="max-w-full max-h-[65vh] rounded-xl shadow-sm" />
              ) : isPdfReceipt(receiptExt(viewingReceipt.url)) ? (
                <iframe
                  src={viewingReceipt.url}
                  title={viewingReceipt.item}
                  className="w-full h-[65vh] rounded-xl border border-white/10 bg-white"
                />
              ) : (
                <div className="text-center py-10">
                  <FileText className="h-10 w-10 mx-auto text-white/40 mb-3" />
                  <p className="text-sm text-white/40">{t("previewNotAvailableLabel")}</p>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDownloadReceipt(true)}
                disabled={downloadingReceipt}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold-400 hover:bg-gold-300 text-[#08130F] text-sm font-semibold px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" /> {downloadingReceipt ? t("downloadingLabel") : t("downloadLabel")}
              </button>
              <button onClick={() => setViewingReceipt(null)} className="px-5 py-2.5 rounded-full border border-white/15 text-white text-sm hover:bg-white/10 transition">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Are you sure you want to download?" -- then "Downloaded
          successfully" -- same confirm-before/success-after pattern as
          Add/Update/Delete Expense above and the Reports page's Word/PDF
          download, instead of the receipt silently saving with no feedback. */}
      <ConfirmDialog
        open={confirmDownloadReceipt}
        icon={<Download className="h-9 w-9" />}
        title={t("confirmDownloadReceiptTitle")}
        body={t("confirmDownloadReceiptBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={downloadingReceipt ? t("downloadingLabel") : t("downloadLabel")}
        onCancel={() => setConfirmDownloadReceipt(false)}
        onConfirm={handleDownloadReceipt}
        z={80}
      />
      <StatusModal
        open={receiptDownloadSuccess}
        type="success"
        title={t("downloadSuccessTitle")}
        message={t("downloadReceiptSuccessMessage")}
        okLabel={t("okLabel")}
        onClose={() => setReceiptDownloadSuccess(false)}
        z={80}
      />

      {/* Same confirm-before/success-after pattern for the expense report
          CSV export button above. */}
      <ConfirmDialog
        open={confirmExportCsv}
        icon={<FileSpreadsheet className="h-9 w-9" />}
        title={t("confirmExportCsvTitle")}
        body={t("confirmExportCsvBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("downloadLabel")}
        onCancel={() => setConfirmExportCsv(false)}
        onConfirm={performExportExpensesCsv}
      />
      <StatusModal
        open={exportCsvSuccess}
        type="success"
        title={t("downloadSuccessTitle")}
        message={t("csvDownloadSuccessMessage")}
        okLabel={t("okLabel")}
        onClose={() => setExportCsvSuccess(false)}
      />

      {deleteExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => !deletingExpense && setDeleteExpense(null)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-red-400 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-xl font-bold text-red-400 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-5">{t("deleteExpenseConfirm")} "{deleteExpense.item}"?</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteExpense(null)} disabled={deletingExpense} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={confirmDeleteExpense} disabled={deletingExpense} className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
