import React, { useEffect, useMemo, useRef, useState } from "react";
import { Wallet, Plus, X, AlertTriangle, CheckCircle, Lock, Trash2, Pencil, Paperclip, FileText, Download, FileSpreadsheet, Banknote, PiggyBank, Search, Eye, RefreshCw } from "lucide-react";
import StatusModal from "../ui/StatusModal";
import api, { apiErrorMessage } from "../../lib/api";
import { exportExpenseReportXlsx } from "../../lib/expenseReportExport";
import ConfirmDialog from "../ui/ConfirmDialog";
import NumberStepper from "../ui/NumberStepper";
import ReceiptField, { ReceiptItem, receiptItemsFromUrls, appendReceiptFields, receiptItemsChanged } from "../ui/ReceiptField";
import Skeleton from "../ui/Skeleton";
import { useLanguage } from "../../i18n/LanguageContext";
import { makeEventTiming, STATUS_META, type EventTimingInput } from "../../lib/eventTiming";

import { tc } from "../../lib/contentTranslations";
export type EventOption = EventTimingInput;

export interface ExpenseSummary {
  approved_budget: number | null;
  total_expenses: number;
  is_over_budget: boolean;
  remaining?: number | null;
  over_by?: number;
  expenses: { id: number; item: string; amount: string | number; notes: string | null; recorded_by?: string | null; created_at: string; receipt_url: string | null; receipt_urls?: string[] }[];
}

// ---- budget helpers -------------------------------------------------------
// approved_budget is a soft cap: going over is allowed, but it is always
// flagged -- in the event list, the summary, the add/edit preview, the
// confirm step, the ledger and the activity log.
export const NEAR_LIMIT_PCT = 80;
export const roundCents = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `${n < 0 ? "-" : ""}₱${Math.abs(roundCents(n)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export type BudgetState = "none" | "ok" | "near" | "over";
export const budgetStateOf = (approved: number | null, spent: number): BudgetState => {
  if (approved === null) return "none";
  if (spent > approved) return "over";
  if (approved > 0 && (spent / approved) * 100 >= NEAR_LIMIT_PCT) return "near";
  return "ok";
};
const fmtLedgerDate = (value?: string | null, locale?: string) => {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
};

interface EventBudgetWorkspaceProps {
  event: EventOption;
  /** Called after anything changes (expense added/edited/removed, budget changed). */
  onChanged?: () => void;
  /** Called with the latest figures each time they are (re)loaded. */
  onSummary?: (summary: ExpenseSummary) => void;
  /** Show the event title / date / status header (hide it where the page already shows it). */
  showHeader?: boolean;
  /** Change this to make the workspace quietly re-read the numbers. */
  reloadToken?: string | number;
}

/**
 * The one place an event's budget is managed: approved budget, live
 * spending, add / edit / delete expenses with receipts, the running-total
 * ledger and the Excel export. Used by BOTH the Budget & Expenses page and
 * an event's own Budget tab, so the two can never drift apart and every
 * change made in one shows up in the other.
 */
export default function EventBudgetWorkspace({ event, onChanged, onSummary, showHeader = true, reloadToken }: EventBudgetWorkspaceProps) {
  const { t, locale, language } = useLanguage();
  const { formatTimeFriendly, parseEventDateTime, getEventStatus, eventStatusLabel, relativeLabel } = makeEventTiming(t);
  const selectedEventId = String(event.id);
  const selectedEvent = event;

  // Approved-budget editing (works from the Budget page and an event's own
  // Budget tab). budgetEdit === null means the dialog is closed.
  const [budgetEdit, setBudgetEdit] = useState<string | null>(null);
  const [showBudgetConfirm, setShowBudgetConfirm] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  // When the numbers were last read from the server (drives the live pill).
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [form, setForm] = useState({ item: "", amount: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  // Right panel: the Add Expense form, or the list of recorded expenses.
  const [expenseTab, setExpenseTab] = useState<"add" | "records">("add");
  // Recording an expense that pushes an event over budget is allowed
  // (approved_budget is a soft cap, not a hard wall -- see
  // EventExpenseController::store) but staff should find out right when
  // it happens, not only by later noticing a red progress bar.
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<{ id: number; item: string; amount: number } | null>(null);
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
  // A receipt is up to 5 photos or one PDF (see ReceiptField).
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [editReceiptItems, setEditReceiptItems] = useState<ReceiptItem[]>([]);
  const [editReceiptSavedCount, setEditReceiptSavedCount] = useState(0);
  // Receipt viewer -- "View receipt" opens this instead of a raw new-tab
  // link, so images preview inline and PDFs render in an embedded viewer
  // rather than dumping the visitor onto a bare file URL.
  // `local` = a just-picked file shown via a blob: URL (not uploaded yet), so
  // it has no file extension (use `mime`) and nothing to download.
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; item: string; mime?: string; local?: boolean; files?: { url: string; name: string; mime?: string }[] } | null>(null);
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

  // Preview a receipt that's been picked but not submitted yet.
  // (The field owns the blob URLs, so closing the viewer must not revoke them.)
  const previewReceiptItem = (item: ReceiptItem, all: ReceiptItem[], eventItem: string) =>
    setViewingReceipt({
      url: item.url,
      item: item.file ? item.name : eventItem,
      mime: item.file?.type,
      local: !!item.file,
      files: all.map((f) => ({ url: f.url, name: f.file ? f.name : eventItem, mime: f.file?.type })),
    });
  // Open a saved expense's receipt (all of its files).
  const openSavedReceipt = (urls: string[], eventItem: string) =>
    setViewingReceipt({ url: urls[0], item: eventItem, files: urls.map((u) => ({ url: u, name: eventItem })) });
  const closeReceiptViewer = () => setViewingReceipt(null);
  const viewerKind: "image" | "pdf" | "other" = !viewingReceipt
    ? "other"
    : viewingReceipt.mime
      ? viewingReceipt.mime.startsWith("image/") ? "image" : viewingReceipt.mime === "application/pdf" ? "pdf" : "other"
      : isImageReceipt(receiptExt(viewingReceipt.url)) ? "image" : isPdfReceipt(receiptExt(viewingReceipt.url)) ? "pdf" : "other";

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

  const selectedEventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;
  const isExpenseLocked = selectedEventStatus?.label === "Past" || selectedEventStatus?.label === "Ongoing";

  // Which event the right-hand tab was last auto-picked for, so it is chosen
  // once per event (records if any, else the Add form) and never flips while
  // someone is working or the background refresh runs.
  const tabPickedFor = useRef<string | null>(null);

  const loadSummary = async (eventId: string | number, silent = false) => {
    if (!silent) setLoadingSummary(true);
    try {
      const res = await api.get(`/events/${eventId}/expenses`);
      if (tabPickedFor.current !== String(eventId)) {
        tabPickedFor.current = String(eventId);
        setExpenseTab(Array.isArray(res.data?.expenses) && res.data.expenses.length > 0 ? "records" : "add");
      }
      setSummary(res.data);
      setLastSynced(Date.now());
      onSummaryRef.current?.(res.data);
    } catch (e) {
      if (!silent) setError(apiErrorMessage(e, t("loadBudgetFailed")));
    } finally {
      if (!silent) setLoadingSummary(false);
    }
  };

  // Switching event: drop the old ledger and load the new one.
  useEffect(() => {
    setSummary(null);
    setBudgetEdit(null);
    loadSummary(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  // The host page changed something about this event (e.g. the event was
  // edited) -- quietly re-read the numbers.
  useEffect(() => {
    if (reloadToken !== undefined) loadSummary(selectedEventId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // Real-time: re-read this event's budget every 15s and the moment the tab
  // is shown again -- paused while any dialog is open so numbers never shift
  // under someone mid-action.
  const modalOpen =
    !!editingExpense || deleteExpense !== null || showAddExpenseConfirm || showEditExpenseConfirm || showEditCancelConfirm || budgetEdit !== null || showBudgetConfirm;
  useEffect(() => {
    const refresh = () => {
      if (document.hidden || modalOpen) return;
      loadSummary(selectedEventId, true);
    };
    const poll = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, modalOpen]);

  // Nothing typed yet -- an untouched form (or a receipt already cleared
  // back out) can close without asking, same idea as isEditExpenseUnchanged
  // above but against a blank slate instead of a saved expense.
  const isAddExpenseEmpty =
    !form.item.trim() && !form.amount.trim() && !form.notes.trim() && receiptItems.length === 0;

  const resetAddExpenseForm = () => {
    setForm({ item: "", amount: "", notes: "" });
    setReceiptItems([]);
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
    if (receiptItems.length === 0) {
      setError(t("receiptRequiredError"));
      return;
    }

    setShowAddExpenseConfirm(true);
  };

  const performAddExpense = async () => {
    setShowAddExpenseConfirm(false);
    if (!selectedEventId || receiptItems.length === 0) return;
    try {
      const fd = new FormData();
      fd.append("item", form.item);
      fd.append("amount", form.amount);
      if (form.notes) fd.append("notes", form.notes);
      appendReceiptFields(fd, receiptItems);

      const result = await api.post(`/events/${selectedEventId}/expenses`, fd);
      setForm({ item: "", amount: "", notes: "" });
      setReceiptItems([]);
      loadSummary(selectedEventId);
      onChanged?.();
      if (result?.data?.is_over_budget) {
        setBudgetWarning(
          t("expenseAddedOverBudgetWarning")
            .replace("{total}", money(totalFromResponse(result.data)))
            .replace("{over}", money(overFromResponse(result.data)))
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
    // event_start/date is a full "YYYY-MM-DD HH:MM:SS" timestamp -- take
    // just the date portion here, since timeLabel above already carries
    // the time. Appending the raw value and the formatted time was
    // showing both ("2026-07-28 09:00:00 9:00 AM").
    const datePart = (selectedEvent.event_start || selectedEvent.date || "").split(" ")[0].split("T")[0];

    try {
      await exportExpenseReportXlsx({
        eventTitle: selectedEvent.title,
        statusLabel: selectedEventStatus ? eventStatusLabel(selectedEventStatus.label) : "",
        dateLabel: `${datePart}${timeLabel ? ` ${timeLabel}` : ""}`,
        approvedBudget: approved,
        totalSpent: spent,
        expenses: summary.expenses,
      });
      setExportCsvSuccess(true);
    } catch (e) {
      setError(apiErrorMessage(e, t("expenseReportExportFailed")));
    }
  };

  const openEditExpense = (exp: { id: number; item: string; amount: string | number; notes: string | null; receipt_url: string | null; receipt_urls?: string[] }) => {
    const initial = { item: exp.item, amount: String(exp.amount), notes: exp.notes ?? "" };
    setEditingExpense({ id: exp.id, item: exp.item });
    setEditForm(initial);
    setOriginalEditForm(initial);
    const saved = exp.receipt_urls?.length ? exp.receipt_urls : exp.receipt_url ? [exp.receipt_url] : [];
    setEditReceiptItems(receiptItemsFromUrls(saved));
    setEditReceiptSavedCount(saved.length);
  };

  // Nothing to submit if the form still matches the expense being edited
  // -- including whether a replacement receipt was picked. A receipt can
  // no longer be removed outright (see the update() guard), so there's
  // nothing else receipt-related to track here.
  const isEditExpenseUnchanged =
    editForm.item === originalEditForm.item &&
    editForm.amount === originalEditForm.amount &&
    editForm.notes === originalEditForm.notes &&
    !receiptItemsChanged(editReceiptItems, editReceiptSavedCount);

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
    if (editReceiptItems.length === 0) {
      setError(t("receiptRequiredError"));
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
      appendReceiptFields(fd, editReceiptItems);

      const wasOver = !!summary?.is_over_budget;
      const result = await api.post(`/events/${selectedEventId}/expenses/${editingExpense.id}`, fd);
      setEditingExpense(null);
      loadSummary(selectedEventId);
      onChanged?.();
      if (result?.data?.is_over_budget) {
        setBudgetWarning(
          t("expenseUpdatedOverBudgetWarning")
            .replace("{total}", money(totalFromResponse(result.data)))
            .replace("{over}", money(overFromResponse(result.data)))
        );
      } else if (wasOver) {
        setExpenseSuccessMessage(t("expenseBackWithinBudget").replace("{message}", t("expenseUpdatedSuccess")));
      } else {
        setExpenseSuccessMessage(t("expenseUpdatedSuccess"));
      }
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
      const wasOver = !!summary?.is_over_budget;
      const result = await api.delete(`/events/${selectedEventId}/expenses/${deleteExpense.id}`);
      setDeleteExpense(null);
      loadSummary(selectedEventId);
      onChanged?.();
      setExpenseSuccessMessage(
        wasOver && !result?.data?.is_over_budget
          ? t("expenseBackWithinBudget").replace("{message}", t("expenseDeletedSuccess"))
          : t("expenseDeletedSuccess")
      );
    } catch (e) {
      setError(apiErrorMessage(e, t("deleteExpenseFailed")));
      setDeleteExpense(null);
    } finally {
      setDeletingExpense(false);
    }
  };

  // ---- this event's budget standing, derived once and reused by the
  // summary card, the add/edit impact preview, the confirm dialogs and
  // the ledger so every number on the page agrees.
  const approvedNum = summary && summary.approved_budget !== null && summary.approved_budget !== undefined ? Number(summary.approved_budget) : null;
  const spentNum = summary ? roundCents(Number(summary.total_expenses) || 0) : 0;
  const budgetState = budgetStateOf(approvedNum, spentNum);
  const usedPctRaw = approvedNum ? (spentNum / approvedNum) * 100 : spentNum > 0 ? 100 : 0;
  const spentPct = Math.min(100, usedPctRaw);
  const selectedDateLine = (() => {
    if (!selectedEvent) return "";
    const raw = selectedEvent.event_start || selectedEvent.date;
    const d = parseEventDateTime(raw);
    if (!d) return "";
    const time = formatTimeFriendly(raw);
    return `${d.toLocaleDateString(locale, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}${time ? ` · ${time}` : ""}`;
  })();
  const selectedRelLabel = selectedEvent && selectedEventStatus ? relativeLabel(selectedEvent, selectedEventStatus.label) : "";
  const selectedStatusMeta = selectedEventStatus ? STATUS_META[selectedEventStatus.label] : null;
  const remainingNum = approvedNum !== null ? roundCents(approvedNum - spentNum) : null;
  const overByNum = approvedNum !== null ? roundCents(Math.max(0, spentNum - approvedNum)) : 0;

  // What the budget looks like after changing the total by `delta`
  // (new amount for an add, new minus old for an edit, minus the amount
  // for a delete).
  const computeImpact = (delta: number) => {
    if (approvedNum === null || !Number.isFinite(delta)) return null;
    const after = roundCents(spentNum + delta);
    const leftAfter = roundCents(approvedNum - after);
    const pctAfter = approvedNum > 0 ? (after / approvedNum) * 100 : after > 0 ? 100 : 0;
    const wasOver = spentNum > approvedNum;
    const kind: "over" | "within" = after > approvedNum ? "over" : "within";
    return { after, leftAfter, overAfter: Math.max(0, -leftAfter), pctAfter, wasOver, kind, near: kind === "within" && pctAfter >= NEAR_LIMIT_PCT };
  };

  const impactTone = (imp: NonNullable<ReturnType<typeof computeImpact>>) =>
    imp.kind === "over" ? "over" : imp.wasOver ? "back" : imp.near ? "near" : "ok";

  const impactMessage = (imp: NonNullable<ReturnType<typeof computeImpact>>, delta: number) => {
    if (imp.kind === "over") {
      if (!imp.wasOver) return t("impactWillExceed").replace("{over}", money(imp.overAfter));
      return t(delta > 0 ? "impactAlreadyOver" : "impactStillOver").replace("{over}", money(imp.overAfter));
    }
    if (imp.wasOver) return t("impactBackWithin").replace("{left}", money(imp.leftAfter));
    if (imp.near) return t("impactNearAfter").replace("{left}", money(imp.leftAfter)).replace("{pct}", String(Math.round(imp.pctAfter)));
    return t("impactWithin").replace("{left}", money(imp.leftAfter));
  };

  // Live "budget impact" card shown under the amount field (add + edit).
  const renderImpact = (delta: number) => {
    if (approvedNum === null) {
      return <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">{t("impactNoBudget")}</p>;
    }
    const imp = computeImpact(delta);
    if (!imp) return null;
    const tone = impactTone(imp);
    const box =
      tone === "over" ? "border-red-500/40 bg-red-500/10 text-red-200"
      : tone === "near" ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
      : "border-[#4FBEB0]/30 bg-[#4FBEB0]/10 text-[#9BE3D8]";
    const Icon = tone === "over" || tone === "near" ? AlertTriangle : CheckCircle;
    return (
      <div className={`rounded-2xl border px-4 py-3 ${box}`} role="status" aria-live="polite">
        <div className="flex items-start gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{impactMessage(imp, delta)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-white/45">{t("impactSpentLabel")}</p>
            <p className="mt-0.5 text-sm text-white/80">{money(spentNum)} → <span className="font-bold text-white">{money(imp.after)}</span></p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-white/45">{t("impactRemainingLabel")}</p>
            <p className="mt-0.5 text-sm text-white/80">
              {money(remainingNum ?? 0)} → <span className={`font-bold ${imp.leftAfter < 0 ? "text-red-300" : "text-white"}`}>{money(imp.leftAfter)}</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  const addAmount = Number(form.amount);
  const addDelta = form.amount.trim() !== "" && Number.isFinite(addAmount) && addAmount > 0 ? roundCents(addAmount) : 0;
  const addImpact = computeImpact(addDelta);
  const editAmount = Number(editForm.amount);
  const editDelta =
    editForm.amount.trim() !== "" && Number.isFinite(editAmount) && editAmount >= 0
      ? roundCents(editAmount - Number(originalEditForm.amount || 0))
      : 0;
  const editImpact = computeImpact(editDelta);

  // Chronological ledger (the list itself stays newest-first): a running
  // total per expense, so it is obvious which one first pushed the event
  // over its approved budget and which ones landed after that.
  const ledger = useMemo(() => {
    const map = new Map<number, { running: number; over: boolean; crossing: boolean }>();
    if (!summary) return map;
    const asc = [...summary.expenses].sort(
      (a, b) => new Date(String(a.created_at).replace(" ", "T")).getTime() - new Date(String(b.created_at).replace(" ", "T")).getTime() || a.id - b.id
    );
    let running = 0;
    let crossed = false;
    asc.forEach((e) => {
      running = roundCents(running + (Number(e.amount) || 0));
      const over = approvedNum !== null && running > approvedNum;
      map.set(e.id, { running, over, crossing: over && !crossed });
      if (over) crossed = true;
    });
    return map;
  }, [summary, approvedNum]);

  const totalFromResponse = (data: any) => Number(data?.total_expenses) || 0;
  const overFromResponse = (data: any) => Number(data?.over_by) || (approvedNum !== null ? Math.max(0, totalFromResponse(data) - approvedNum) : 0);


  // ---- approved budget editing ----
  const canEditBudget = selectedEventStatus?.label !== "Past";
  const syncedSeconds = lastSynced ? Math.max(0, Math.floor((tick - lastSynced) / 1000)) : 0;
  const syncedLabel =
    syncedSeconds < 5
      ? t("updatedJustNowLabel")
      : syncedSeconds < 60
      ? t("updatedSecondsAgoLabel").replace("{n}", String(syncedSeconds))
      : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(syncedSeconds / 60)));

  const openBudgetEdit = () => setBudgetEdit(approvedNum !== null ? String(approvedNum) : "");
  const newBudgetValue = budgetEdit === null || budgetEdit.trim() === "" ? null : Number(budgetEdit);
  const budgetEditInvalid = budgetEdit !== null && budgetEdit.trim() !== "" && (!Number.isFinite(Number(budgetEdit)) || Number(budgetEdit) < 0);
  const budgetEditUnchanged =
    budgetEdit !== null &&
    ((newBudgetValue === null && approvedNum === null) ||
      (newBudgetValue !== null && approvedNum !== null && roundCents(newBudgetValue) === roundCents(approvedNum)));

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (budgetEditInvalid) {
      setError(t("invalidAmountError"));
      return;
    }
    if (budgetEditUnchanged) return;
    setShowBudgetConfirm(true);
  };

  const performBudgetSave = async () => {
    setShowBudgetConfirm(false);
    setSavingBudget(true);
    try {
      const res = await api.put(`/events/${selectedEventId}/budget`, { approved_budget: newBudgetValue });
      setBudgetEdit(null);
      await loadSummary(selectedEventId, true);
      onChanged?.();
      if (res.data?.is_over_budget) {
        setBudgetWarning(t("budgetUpdatedOverWarning").replace("{over}", money(Number(res.data.over_by) || 0)));
      } else {
        setExpenseSuccessMessage(t("budgetUpdatedSuccess"));
      }
    } catch (e) {
      setError(apiErrorMessage(e, t("budgetSaveFailed")));
    } finally {
      setSavingBudget(false);
    }
  };

  // What the event looks like at the budget typed into the dialog.
  const budgetPreview = (() => {
    if (budgetEdit === null || budgetEditInvalid) return null;
    if (newBudgetValue === null) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">{t("budgetWillBeNone")}</p>;
    const left = roundCents(newBudgetValue - spentNum);
    const over = left < 0;
    const pct = newBudgetValue > 0 ? (spentNum / newBudgetValue) * 100 : spentNum > 0 ? 100 : 0;
    const near = !over && pct >= NEAR_LIMIT_PCT;
    const box = over ? "border-red-500/40 bg-red-500/10 text-red-200" : near ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-[#4FBEB0]/30 bg-[#4FBEB0]/10 text-[#9BE3D8]";
    const Icon = over || near ? AlertTriangle : CheckCircle;
    return (
      <div className={`rounded-2xl border px-4 py-3 ${box}`} role="status" aria-live="polite">
        <div className="flex items-start gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {over
              ? t("budgetWillBeOver").replace("{over}", money(-left)).replace("{spent}", money(spentNum))
              : t("budgetWillBeWithin").replace("{left}", money(left)).replace("{pct}", String(Math.round(pct)))}
          </span>
        </div>
      </div>
    );
  })();

  return (
    <>
      {loadingSummary || !summary ? (
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
            <div className="space-y-8">
              {showHeader && (
              <>
              {/* Event header: which event this ledger belongs to, and its status. */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white break-words">{selectedEvent?.title}</h2>
                  {selectedDateLine && (
                    <p className="mt-1.5 text-sm text-white/50">
                      {selectedDateLine}
                      {selectedRelLabel && <span className="text-white/35"> · </span>}
                      {selectedRelLabel && <span className={selectedStatusMeta?.text}>{selectedRelLabel}</span>}
                    </p>
                  )}
                </div>
                {selectedEventStatus && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${selectedEventStatus.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedEventStatus.dot}`} />
                    {eventStatusLabel(selectedEventStatus.label)}
                  </span>
                )}
              </div>
              </>
              )}
              <div className={`rounded-2xl border p-6 ${budgetState === "over" ? "border-red-500/40 bg-red-500/[0.05]" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-display text-3xl font-extrabold text-white [font-variant-numeric:tabular-nums]">{money(spentNum)}</p>
                    <p className="mt-1 text-sm text-white/55">
                      {t("spentOf")}
                      {approvedNum !== null && ` ${t("ofLabel")} ${money(approvedNum)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {lastSynced !== null && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/50" title={t("liveLabel")}>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
                        </span>
                        {syncedLabel}
                      </span>
                    )}
                    {canEditBudget && (
                      <button
                        type="button"
                        onClick={openBudgetEdit}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" /> {approvedNum === null ? t("budgetSetLabel") : t("budgetEditLabel")}
                      </button>
                    )}
                    {budgetState === "over" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5" /> {t("overBudget")}
                      </span>
                    )}
                    {budgetState === "near" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" /> {t("budgetNearLimit")}
                      </span>
                    )}
                    {budgetState === "ok" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#4FBEB0]/15 px-2.5 py-1 text-xs font-bold text-[#7DD8CB]">
                        <CheckCircle className="h-3.5 w-3.5" /> {t("budgetOnTrack")}
                      </span>
                    )}
                  </div>
                </div>

                {approvedNum !== null ? (
                  <>
                    <div className="mt-6 h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${budgetState === "over" ? "bg-red-500" : budgetState === "near" ? "bg-amber-400" : "bg-[#4FBEB0]"}`}
                        style={{ width: `${spentPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-right text-xs font-semibold text-white/50">{t("budgetUsedPct").replace("{pct}", String(Math.round(usedPctRaw)))}</p>

                    <div className="mt-5 grid grid-cols-3 gap-3">
                      {[
                        { label: t("budgetApprovedLabel"), value: money(approvedNum), cls: "text-white" },
                        { label: t("budgetSpentLabel"), value: money(spentNum), cls: budgetState === "over" ? "text-red-300" : "text-white" },
                        budgetState === "over"
                          ? { label: t("budgetOverByLabel"), value: money(overByNum), cls: "text-red-300" }
                          : { label: t("budgetRemainingLabel"), value: money(remainingNum ?? 0), cls: budgetState === "near" ? "text-amber-300" : "text-[#7DD8CB]" },
                      ].map((tile) => (
                        <div key={tile.label} className="rounded-xl bg-white/[0.04] px-4 py-3.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{tile.label}</p>
                          <p className={`mt-1 text-lg font-bold [font-variant-numeric:tabular-nums] ${tile.cls}`}>{tile.value}</p>
                        </div>
                      ))}
                    </div>

                    {budgetState === "over" && (
                      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm leading-relaxed text-red-200">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{t("budgetOverBanner").replace("{over}", money(overByNum)).replace("{pct}", String(Math.round(usedPctRaw)))}</span>
                      </div>
                    )}
                    {budgetState === "near" && (
                      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3.5 text-sm leading-relaxed text-amber-200">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{t("budgetNearBanner").replace("{pct}", String(Math.round(usedPctRaw))).replace("{left}", money(remainingNum ?? 0))}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-white/45 italic">{t("noApprovedBudgetYet")}</p>
                )}
              </div>

              {isExpenseLocked && (
                <p className="text-xs text-gold-300 bg-gold-400/10 border border-gold-400/25 rounded-full px-4 py-2">
                  {t("expenseAddLockedHint")}
                </p>
              )}
              {/* Two buttons switch between adding an expense and the records
                  of what was already spent. The form is the default view, so
                  it is already there -- no click needed to start adding. */}
              <div className="flex items-center justify-between gap-4 flex-wrap border-b border-white/10 pb-6">
                <div className="inline-flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpenseTab("add")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                      expenseTab === "add" ? "bg-sage-700 text-white" : "border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Plus className="h-4 w-4" /> {t("addExpenseTitle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseTab("records")}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                      expenseTab === "records" ? "bg-sage-700 text-white" : "border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <FileText className="h-4 w-4" /> {t("recordsTab")}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${expenseTab === "records" ? "bg-white/20" : "bg-white/10"}`}>
                      {summary.expenses.length}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmExportCsv(true)}
                  disabled={summary.expenses.length === 0}
                  title={t("exportCsvLabel")}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 text-white px-4 py-2.5 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="h-4 w-4" /> {t("exportCsvLabel")}
                </button>
              </div>

              {expenseTab === "add" && (
              <form
                onSubmit={handleAddExpense}
                noValidate
                className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 space-y-6 ${isExpenseLocked ? "opacity-60" : ""}`}
              >
                <fieldset disabled={isExpenseLocked} className="space-y-6 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2.5">{t("itemExpenseDescPlaceholder")}</label>
                      <input
                        required
                        value={form.item}
                        onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))}
                        placeholder={t("itemExpenseDescPlaceholder")}
                        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2.5">{t("amountPlaceholder")}</label>
                      <NumberStepper
                        required
                        fullWidth
                        min={0}
                        step={0.01}
                        value={form.amount}
                        onChange={(v) => setForm((p) => ({ ...p, amount: v }))}
                        placeholder={t("amountPlaceholder")}
                        className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                      />
                    </div>
                  </div>
                  {addDelta > 0 && renderImpact(addDelta)}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2.5">{t("notesLabel")}</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2.5">{t("receiptLabel")}</label>
                    <ReceiptField
                      items={receiptItems}
                      onChange={setReceiptItems}
                      onPreview={(item, all) => previewReceiptItem(item, all, form.item || t("receiptLabel"))}
                      onError={setError}
                      emptyLabel={t("attachReceiptRequiredLabel")}
                    />
                    {receiptItems.length === 0 && <p className="mt-2 text-sm text-[#7DD8CB]">{t("receiptRequiredHint")}</p>}
                    <p className="mt-2 text-sm text-white/50">{t("fileHintReceipts")}</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" className="flex-1 py-3.5 text-base rounded-full font-bold bg-sage-700 hover:bg-sage-800 text-white transition disabled:opacity-50 disabled:cursor-not-allowed">{t("addLabel")}</button>
                    <button
                      type="button"
                      onClick={resetAddExpenseForm}
                      disabled={isAddExpenseEmpty}
                      className="px-8 py-3.5 text-base rounded-full border border-white/15 text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t("clearLabel")}
                    </button>
                  </div>
                </fieldset>
              </form>
              )}

              {expenseTab === "records" && (
              <div className="space-y-4">
                {summary.expenses.length > 0 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm">
                    <span className="text-white/60">{t("ledgerCount").replace("{n}", String(summary.expenses.length))}</span>
                    <span className="text-white/60">
                      {t("ledgerTotalSpent")}:{" "}
                      <span className={`font-bold ${budgetState === "over" ? "text-red-300" : "text-[#7DD8CB]"}`}>{money(spentNum)}</span>
                      {approvedNum !== null && <span className="text-white/40"> / {money(approvedNum)}</span>}
                    </span>
                  </div>
                )}
                <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                  {summary.expenses.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-white/40 italic">{t("noExpensesRecorded")}</p>
                      {!isExpenseLocked && (
                        <button
                          type="button"
                          onClick={() => setExpenseTab("add")}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white px-5 py-2 text-sm font-bold transition"
                        >
                          <Plus className="h-4 w-4" /> {t("ledgerAddFirst")}
                        </button>
                      )}
                    </div>
                  ) : (
                    summary.expenses.map((exp) => {
                      const meta = ledger.get(exp.id);
                      const amt = Number(exp.amount) || 0;
                      const share = approvedNum ? (amt / approvedNum) * 100 : null;
                      const receipts = exp.receipt_urls?.length ? exp.receipt_urls : exp.receipt_url ? [exp.receipt_url] : [];
                      const dateLabel = fmtLedgerDate(exp.created_at, locale);
                      return (
                        <div
                          key={exp.id}
                          className={`rounded-xl border px-5 py-4 ${meta?.over ? "border-red-500/30 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.03]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <p className="text-[15px] font-semibold text-white truncate">{tc(exp.item, language as any)}</p>
                                {receipts.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openSavedReceipt(receipts, exp.item)}
                                    title={t("viewReceiptLabel")}
                                    className="inline-flex items-center gap-0.5 text-white/50 hover:text-[#7DD8CB] transition shrink-0"
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                    {receipts.length > 1 && <span className="text-[11px] font-semibold">{receipts.length}</span>}
                                  </button>
                                )}
                                {meta?.crossing && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                    <AlertTriangle className="h-3 w-3" /> {t("ledgerPushedOver")}
                                  </span>
                                )}
                                {meta?.over && !meta.crossing && (
                                  <span className="rounded-full border border-red-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">{t("ledgerOverBudgetTag")}</span>
                                )}
                              </div>
                              {exp.notes && <p className="mt-0.5 text-xs text-white/50 whitespace-pre-wrap break-words">{tc(exp.notes, language as any)}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`mr-2 text-[15px] font-bold [font-variant-numeric:tabular-nums] ${meta?.over ? "text-red-300" : "text-[#7DD8CB]"}`}>{money(amt)}</span>
                              <button
                                type="button"
                                onClick={() => openEditExpense(exp)}
                                disabled={isExpenseLocked}
                                title={isExpenseLocked ? t("expenseEventLockedHint") : t("editLabel")}
                                className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white/60"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteExpense({ id: exp.id, item: exp.item, amount: amt })}
                                disabled={isExpenseLocked}
                                title={isExpenseLocked ? t("expenseEventLockedHint") : t("deleteTitle")}
                                className="p-1.5 rounded-full text-white/60 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white/60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                            {dateLabel && <span>{dateLabel}</span>}
                            {exp.recorded_by && <span>{t("ledgerRecordedBy").replace("{name}", exp.recorded_by)}</span>}
                            {share !== null && <span>{t("ledgerShareOfBudget").replace("{pct}", String(Math.round(share)))}</span>}
                            {meta && <span>{t("ledgerRunningTotal")}: <span className={meta.over ? "text-red-300 font-semibold" : "text-white/65"}>{money(meta.running)}</span></span>}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              )}
            </div>
      )}
      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} z={60} />
      <StatusModal open={!!budgetWarning} type="warning" title={t("overBudgetTitle")} message={budgetWarning || ""} okLabel={t("okLabel")} onClose={() => setBudgetWarning(null)} z={60} />

      {/* Edit Expense modal -- dark navy card, same treatment as the
          Households/Inventory Edit modals (this page's own core edit
          form, as opposed to the confirm/success/error/receipt modals
          further below which stay on their original light theme). */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => !savingEdit && handleCloseEditExpense()}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-3xl w-full max-w-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-white">{t("editExpenseTitle")}</h2>
              <button onClick={handleCloseEditExpense} className="text-white/50 hover:text-white"><X size={26} /></button>
            </div>
            <form onSubmit={handleUpdateExpense} noValidate className="space-y-5">
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("itemExpenseDescPlaceholder")}</label>
                <input required value={editForm.item} onChange={(e) => setEditForm((p) => ({ ...p, item: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
              </div>
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("amountPlaceholder")}</label>
                {/* Our own up/down buttons instead of the browser's native
                    spinner -- see NumberStepper.tsx for why. */}
                <NumberStepper
                  required
                  fullWidth
                  min={0}
                  step={0.01}
                  value={editForm.amount}
                  onChange={(v) => setEditForm((p) => ({ ...p, amount: v }))}
                  className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              {Math.abs(editDelta) > 0.004 && renderImpact(editDelta)}
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("notesLabel")}</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" rows={3} />
              </div>
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("receiptLabel")}</label>
                <ReceiptField
                  items={editReceiptItems}
                  onChange={setEditReceiptItems}
                  onPreview={(item, all) => previewReceiptItem(item, all, editForm.item || t("receiptLabel"))}
                  onError={setError}
                />
                <p className="mt-2 text-sm text-white/50">{t("fileHintReceipts")}</p>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="submit" disabled={savingEdit || isEditExpenseUnchanged} title={isEditExpenseUnchanged ? t("noChangesToSaveHint") : undefined} className="flex-1 py-3.5 text-base rounded-full font-bold bg-sage-700 hover:bg-sage-800 text-white disabled:opacity-60 disabled:cursor-not-allowed">{savingEdit ? t("savingLabel") : t("saveChanges")}</button>
                <button type="button" onClick={handleCloseEditExpense} disabled={savingEdit} className="px-8 py-3.5 text-base rounded-full border border-white/15 text-white hover:bg-white/10 disabled:opacity-60">{t("cancelLabel")}</button>
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

      {/* Confirm steps spell out the budget consequence: what remains, or
          exactly how far over budget the change leaves the event. */}
      <ConfirmDialog
        open={showAddExpenseConfirm}
        icon={addImpact?.kind === "over" ? <AlertTriangle size={32} /> : <Plus size={32} />}
        tone={addImpact?.kind === "over" ? "danger" : "brand"}
        title={t("confirmAddExpenseTitle")}
        body={
          addImpact
            ? addImpact.kind === "over"
              ? t("confirmAddOverBody").replace("{amount}", money(addDelta)).replace("{over}", money(addImpact.overAfter))
              : t("confirmAddWithinBody").replace("{amount}", money(addDelta)).replace("{left}", money(addImpact.leftAfter))
            : t("confirmAddExpenseBody")
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={addImpact?.kind === "over" ? t("yesAddAnyway") : t("yesAdd")}
        onCancel={() => setShowAddExpenseConfirm(false)}
        onConfirm={performAddExpense}
      />

      <ConfirmDialog
        open={showEditExpenseConfirm}
        icon={editImpact?.kind === "over" ? <AlertTriangle size={32} /> : <Pencil size={32} />}
        tone={editImpact?.kind === "over" ? "danger" : "brand"}
        title={t("confirmUpdateExpenseTitle")}
        body={
          editImpact && Math.abs(editDelta) > 0.004
            ? editImpact.kind === "over"
              ? t("confirmUpdateOverBody").replace("{over}", money(editImpact.overAfter))
              : editImpact.wasOver
              ? t("impactBackWithin").replace("{left}", money(editImpact.leftAfter))
              : t("confirmUpdateExpenseBody")
            : t("confirmUpdateExpenseBody")
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={editImpact?.kind === "over" && Math.abs(editDelta) > 0.004 ? t("yesSaveAnyway") : t("yesUpdate")}
        onCancel={() => setShowEditExpenseConfirm(false)}
        onConfirm={performUpdateExpense}
      />

      <StatusModal open={!!expenseSuccessMessage} type="success" title={t("expenseSuccessTitle")} message={expenseSuccessMessage || ""} okLabel={t("okLabel")} onClose={() => setExpenseSuccessMessage(null)} />

      {viewingReceipt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4" onClick={closeReceiptViewer}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[24px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 text-[#4FBEB0] shrink-0">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{viewingReceipt.item}</p>
                  <p className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
                    {viewingReceipt.local
                      ? (viewerKind === "pdf" ? "PDF" : viewerKind === "image" ? "Image" : t("fileLabel"))
                      : receiptExt(viewingReceipt.url) || t("fileLabel")}
                  </p>
                </div>
              </div>
              <button onClick={closeReceiptViewer} className="text-white/40 hover:text-white p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black/20 flex items-center justify-center p-4">
              {viewerKind === "image" ? (
                <img src={viewingReceipt.url} alt={viewingReceipt.item} className="max-w-full max-h-[65vh] rounded-xl shadow-sm" />
              ) : viewerKind === "pdf" ? (
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

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
              {viewingReceipt.files && viewingReceipt.files.length > 1 && (
                <div className="mr-auto flex items-center gap-2">
                  {viewingReceipt.files.map((f, i) => (
                    <button
                      key={f.url + i}
                      type="button"
                      onClick={() => setViewingReceipt({ ...viewingReceipt, url: f.url, mime: f.mime })}
                      className={`h-10 w-10 overflow-hidden rounded-lg border transition ${f.url === viewingReceipt.url ? "border-[#7DD8CB]" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      <img src={f.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {!viewingReceipt.local && (
              <button
                type="button"
                onClick={() => setConfirmDownloadReceipt(true)}
                disabled={downloadingReceipt}
                className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-semibold px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" /> {downloadingReceipt ? t("downloadingLabel") : t("downloadLabel")}
              </button>
              )}
              <button onClick={closeReceiptViewer} className="px-5 py-2.5 rounded-full border border-white/15 text-white text-sm hover:bg-white/10 transition">
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
            <p className="text-[15px] text-white/50 mb-3">{t("deleteExpenseConfirm")} "{deleteExpense.item}" ({money(deleteExpense.amount)})?</p>
            {(() => {
              const imp = computeImpact(-deleteExpense.amount);
              return imp && imp.wasOver && imp.kind === "within" ? (
                <p className="mb-5 rounded-xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 px-3.5 py-2.5 text-sm text-[#9BE3D8]">
                  {t("impactBackWithin").replace("{left}", money(imp.leftAfter))}
                </p>
              ) : <div className="mb-2" />;
            })()}
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteExpense(null)} disabled={deletingExpense} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={confirmDeleteExpense} disabled={deletingExpense} className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Approved budget dialog */}
      {budgetEdit !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => !savingBudget && setBudgetEdit(null)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-black text-white">{t("budgetEditTitle")}</h2>
              <button onClick={() => setBudgetEdit(null)} className="text-white/50 hover:text-white"><X size={24} /></button>
            </div>
            <p className="mb-6 text-sm text-white/50">{t("budgetEditHint")}</p>
            <form onSubmit={handleBudgetSubmit} noValidate className="space-y-5">
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("budgetEditFieldLabel")}</label>
                <NumberStepper
                  fullWidth
                  min={0}
                  step={0.01}
                  value={budgetEdit}
                  onChange={(v) => setBudgetEdit(v)}
                  placeholder={t("amountPlaceholder")}
                  className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
                <p className="mt-2 text-xs text-white/40">{t("budgetClearHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-white/[0.04] px-4 py-3">
                  <p className="font-semibold uppercase tracking-wide text-white/45">{t("budgetSpentLabel")}</p>
                  <p className="mt-1 text-base font-bold text-white">{money(spentNum)}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-4 py-3">
                  <p className="font-semibold uppercase tracking-wide text-white/45">{t("budgetApprovedLabel")}</p>
                  <p className="mt-1 text-base font-bold text-white">{approvedNum !== null ? money(approvedNum) : "—"}</p>
                </div>
              </div>
              {budgetPreview}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingBudget || budgetEditUnchanged || budgetEditInvalid} title={budgetEditUnchanged ? t("noChangesToSaveHint") : undefined} className="flex-1 py-3.5 text-base rounded-full font-bold bg-sage-700 hover:bg-sage-800 text-white disabled:opacity-60 disabled:cursor-not-allowed">{savingBudget ? t("savingLabel") : t("saveChanges")}</button>
                <button type="button" onClick={() => setBudgetEdit(null)} disabled={savingBudget} className="px-8 py-3.5 text-base rounded-full border border-white/15 text-white hover:bg-white/10 disabled:opacity-60">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showBudgetConfirm}
        icon={<Pencil size={32} />}
        title={t("confirmBudgetTitle")}
        body={t("confirmBudgetBody").replace("{from}", approvedNum !== null ? money(approvedNum) : t("budgetNoneWord")).replace("{to}", newBudgetValue !== null ? money(newBudgetValue) : t("budgetNoneWord"))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setShowBudgetConfirm(false)}
        onConfirm={performBudgetSave}
        z={60}
      />
    </>
  );
}
