import React, { useEffect, useMemo, useState, useRef } from "react";
import { Package, Plus, X, MapPin, Trash2, Pencil, AlertTriangle, Search, Layers, RefreshCw } from "lucide-react";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import NumberStepper from "../../../components/ui/NumberStepper";
import Skeleton from "../../../components/ui/Skeleton";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";

type Condition = "New" | "Good" | "Fair" | "Poor" | "Disposed" | "Lost";

interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  condition: Condition;
  storage_location: string | null;
  notes: string | null;
  // How many units are currently lent out to a still-active event (see
  // InventoryItem::borrows() on the backend). >0 means the item can't be
  // deleted yet -- it has to be returned to Inventory first.
  borrowed_quantity: number;
  // Set when this item is on loan to an event whose date has already
  // passed and nobody has archived it yet -- the item is effectively
  // stuck, since nothing returns it to Inventory automatically.
  overdue_borrow_event: { id: number; name: string; ended_at: string } | null;
}

// Dark-palette badges -- same semantic hue mapping as the light styles
// they replace (teal for good condition, gold for caution, rust/red for
// needing attention), matching the navy/gold/teal system used everywhere
// else (Dashboard, Residents, Households, Events).
const CONDITION_STYLES: Record<Condition, string> = {
  New: "bg-[#4FBEB0]/20 text-[#7DD8CB]",
  Good: "bg-[#4FBEB0]/10 text-[#7DD8CB]",
  Fair: "bg-gold-400/15 text-gold-300",
  Poor: "bg-[#8A3D2C]/25 text-[#E2A088]",
  Disposed: "bg-white/10 text-white/45",
  Lost: "bg-red-500/15 text-red-400",
};

const emptyForm = { name: "", quantity: 1, condition: "Good" as Condition, storage_location: "", notes: "" };

const CONDITION_LABEL_KEYS: Record<Condition, string> = {
  New: "conditionNew",
  Good: "conditionGood",
  Fair: "conditionFair",
  Poor: "conditionPoor",
  Disposed: "conditionDisposed",
  Lost: "conditionLost",
};

/**
 * UC-9: Manage Barangay Inventory. Laid out like a live ops dashboard --
 * a KPI strip up top (total items, units on hand, on loan, needing
 * attention) driven by a quietly self-refreshing dataset, and a dense
 * sortable table below for the actual per-item browsing/editing, instead
 * of the card-grid layout this page used previously.
 */
export default function InventoryView() {
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  // Closing the Add/Edit Item modal (X, Cancel, or the backdrop) with
  // unsaved changes asks first instead of silently discarding them.
  const [showFormCancelConfirm, setShowFormCancelConfirm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash on every page switch, same as Activity Logs --
  // this list paginates client-side so there's nothing to actually wait
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
  const itemsPerPage = 10;

  // KPI strip data -- deliberately a SEPARATE, always-unfiltered fetch from
  // the search/condition-filtered `items` list below, so the summary
  // numbers at the top of the page stay stable while someone is typing
  // into the search box or narrowing the condition filter, and instead
  // update on their own short interval like a real live dashboard would.
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchStats = async () => {
    try {
      const res = await api.get("/inventory");
      setAllItems(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      // Silent -- the KPI strip just keeps showing its last good numbers.
      // The search/filter table below has its own fetchItems, which does
      // surface a real error modal if the API is actually unreachable.
    }
  };

  useEffect(() => {
    fetchStats();
    // Refreshes itself every 20s, but skips a tick while the Add/Edit or
    // Delete modal is open so the KPI numbers don't shift under a staff
    // member who's mid-edit.
    const poll = setInterval(() => {
      if (!showForm && deleteId === null) fetchStats();
    }, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, deleteId]);

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

  const stats = useMemo(() => {
    const totalItems = allItems.length;
    const totalUnits = allItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const onLoanCount = allItems.filter((i) => i.borrowed_quantity > 0).length;
    const needsAttentionCount = allItems.filter(
      (i) => !!i.overdue_borrow_event || i.condition === "Poor" || i.condition === "Lost"
    ).length;
    return { totalItems, totalUnits, onLoanCount, needsAttentionCount };
  }, [allItems]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get("/inventory", { params: { search, condition: conditionFilter } });
      setItems(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadInventoryFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchItems, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, conditionFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, conditionFilter, items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const paginatedItems = items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Nothing to submit if editing an item and the form still matches its
  // original values -- keeps a no-op "Update Item" click (and its own
  // success popup) from firing for a change that never happened.
  const isFormUnchanged = !!editing && (
    form.name === editing.name &&
    Number(form.quantity) === editing.quantity &&
    form.condition === editing.condition &&
    form.storage_location === (editing.storage_location ?? "") &&
    form.notes === (editing.notes ?? "")
  );

  const hasFormChanges = editing
    ? !isFormUnchanged
    : JSON.stringify(form) !== JSON.stringify(emptyForm);

  const handleCloseForm = () => {
    if (hasFormChanges) setShowFormCancelConfirm(true);
    else setShowForm(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      quantity: item.quantity,
      condition: item.condition,
      storage_location: item.storage_location ?? "",
      notes: item.notes ?? "",
    });
    setError(null);
    setShowForm(true);
  };

  // Form submit only opens the "are you sure" step -- the actual save
  // happens in performSave, once the user confirms. The form now carries
  // noValidate (see below), so this is the ONLY thing standing between a
  // bad value and the API -- the browser's own "please enter a valid
  // value" bubble no longer fires, on purpose, in favor of the app's own
  // error modal below.
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(t("itemNameRequiredError"));
      return;
    }
    if (!Number.isInteger(form.quantity) || form.quantity < 0) {
      setError(t("invalidQuantityError"));
      return;
    }

    setShowConfirm(true);
  };

  const performSave = async () => {
    setShowConfirm(false);
    setError(null);
    const wasEditing = !!editing;
    try {
      let archived = false;
      if (editing) {
        const res = await api.put(`/inventory/${editing.id}`, form);
        archived = !!res?.data?.archived;
      } else {
        await api.post("/inventory", form);
      }
      setShowForm(false);
      setSuccessMessage(
        archived
          ? t("itemArchivedSuccess").replace("{condition}", form.condition)
          : wasEditing
          ? t("itemUpdatedSuccess")
          : t("itemAddedSuccess")
      );
      fetchItems();
      fetchStats();
    } catch (e) {
      setError(apiErrorMessage(e, t("saveItemFailed")));
      // Revert to the item's real values instead of leaving the
      // rejected edit sitting in the form.
      if (editing) {
        setForm({
          name: editing.name,
          quantity: editing.quantity,
          condition: editing.condition,
          storage_location: editing.storage_location ?? "",
          notes: editing.notes ?? "",
        });
      }
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await api.delete(`/inventory/${deleteId}`);
      setDeleteId(null);
      setSuccessMessage(t("itemDeletedSuccess"));
      fetchItems();
      fetchStats();
    } catch (e) {
      setDeleteId(null);
      setError(apiErrorMessage(e, t("deleteItemFailed")));
    }
  };

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Events pages, so Inventory reads as
        part of the same system instead of the old light "paper" page.
        Confirm/success/error/delete modals further below stay on their
        original light theme, same scoping used on every other staff view. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("barangayInventory")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("inventorySubtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          {/* Genuinely live -- fetchStats() re-polls /inventory every 20s
              (see effect above), this just renders how long ago that last
              landed, ticking every second off nowTick. */}
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/50" title={t("liveLabel")}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
            </span>
            {lastUpdatedLabel}
          </div>
          <button
            onClick={openAdd}
            className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md shrink-0"
          >
            {t("addItem")}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
              <Plus className="h-5 w-5 text-white" />
            </span>
          </button>
        </div>
      </div>

      {/* KPI strip -- same gradient-card language as the Dashboard's stat
          strip, so "at a glance" reads the same way on both pages. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { value: stats.totalItems, label: t("totalItemsStatLabel"), description: t("totalItemsStatDesc"), icon: Package, gradient: "from-sage-400 to-sage-700" },
          { value: stats.totalUnits, label: t("unitsInStockStatLabel"), description: t("unitsInStockStatDesc"), icon: Layers, gradient: "from-sage-800 to-[#1C2E2B]" },
          { value: stats.onLoanCount, label: t("onLoanStatLabel"), description: t("onLoanStatDesc"), icon: RefreshCw, gradient: "from-gold-400 to-gold-700" },
          { value: stats.needsAttentionCount, label: t("needsAttentionStatLabel"), description: t("needsAttentionStatDesc"), icon: AlertTriangle, gradient: "from-[#8A3D2C] to-[#5C2A1E]" },
        ].map((card, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white shadow-sm transition-shadow duration-300 hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">{card.value}</h2>
              <card.icon className="h-5 w-5 text-white/40 shrink-0" />
            </div>
            <p className="mt-2.5 text-[12px] font-bold uppercase tracking-wide">{card.label}</p>
            <p className="mt-0.5 text-xs text-white/75">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchInventoryPlaceholder")}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>
          <FilterDropdown
            value={conditionFilter}
            onChange={setConditionFilter}
            options={[
              { value: "", label: t("allConditions") },
              ...(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as Condition[]).map((c) => ({
                value: c,
                label: t(CONDITION_LABEL_KEYS[c]),
              })),
            ]}
            className="h-11 px-4 shrink-0"
            dark
          />
        </div>
      </div>

      {loading || pageSwitching ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="border-b border-white/10 px-4 py-3">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-24 hidden sm:block" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-white/50">
          <Package size={40} className="mx-auto mb-3 text-white/20" />
          <p>{t("noInventoryItems")}</p>
        </div>
      ) : (
        <>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("itemColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("conditionColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("quantityColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("storageLocationLabel")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("statusColumn")}</th>
                  <th className="py-3 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-white">{t("actionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.05] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#123A38] border border-white/10 text-[#7DD8CB]">
                          <Package className="h-4 w-4" />
                        </div>
                        <p className="font-semibold text-white truncate" title={item.name}>{item.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${CONDITION_STYLES[item.condition]}`}>{t(CONDITION_LABEL_KEYS[item.condition])}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-white [font-variant-numeric:tabular-nums]">
                      {item.quantity} <span className="font-normal text-xs text-white/45">{t("inStock")}</span>
                    </td>
                    <td className="py-3 px-4 text-white/50">
                      {item.storage_location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#4FBEB0]" /> {item.storage_location}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {item.overdue_borrow_event ? (
                        <span
                          className="px-2 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 whitespace-nowrap"
                          title={t("overdueBorrowTooltip").replace("{event}", item.overdue_borrow_event.name)}
                        >
                          {t("overdueReturnBadge")}
                        </span>
                      ) : item.borrowed_quantity > 0 ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-semibold border border-white/10 bg-white/[0.04] text-white/50 whitespace-nowrap">{t("onLoanBadge")}</span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {/* Neutral with a white hover for Edit, red hover for
                          Delete -- matches the icon-only Edit/Delete
                          pairing used elsewhere on the dark pages. Delete
                          is disabled while any units are out on loan --
                          deleting an item an active event still points to
                          would orphan its borrow record (see
                          InventoryController::destroy). */}
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition" title={t("editLabel")}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => item.borrowed_quantity === 0 && setDeleteId(item.id)}
                          disabled={item.borrowed_quantity > 0}
                          className={`p-1.5 rounded-full transition ${
                            item.borrowed_quantity > 0
                              ? "text-white/20 cursor-not-allowed"
                              : "text-white/50 hover:bg-red-500/10 hover:text-red-400"
                          }`}
                          title={item.borrowed_quantity > 0 ? t("itemCurrentlyBorrowedTooltip") : t("removeLabel")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 py-3 border-t border-white/10">
              <p className="text-sm text-white/45 text-center sm:text-left">
                {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages} • {items.length} {t("recordsShownLabel")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  ←
                </button>
                <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] flex items-center justify-center text-sm font-bold">
                  {currentPage}
                </span>
                <button
                  onClick={() => goToPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
        </>
      )}
      </div>
      </div>

      {/* Add/Edit Item modal -- dark navy card, same treatment as the
          Households Edit modal (centered card rather than a full-page
          takeover, since this form is small). */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={handleCloseForm}>
          <div className="bg-[#0A0E1A] rounded-[30px] w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? t("editItem") : t("addInventoryItem")}</h2>
              <button onClick={handleCloseForm} className="text-white/50 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("itemNameRequired")}</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" placeholder="Plastic chairs" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">{t("quantityRequired")}</label>
                  <NumberStepper min={0} required fullWidth value={String(form.quantity)} onChange={(v) => setForm((p) => ({ ...p, quantity: Number(v) || 0 }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-4 pr-6 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">{t("conditionRequired")}</label>
                  <select value={form.condition} onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value as Condition }))} className="w-full appearance-none rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50">
                    {(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as Condition[]).map((c) => (
                      <option key={c} value={c} className="bg-[#0A0E1A] text-white">{t(CONDITION_LABEL_KEYS[c])}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("storageLocationLabel")}</label>
                <input value={form.storage_location} onChange={(e) => setForm((p) => ({ ...p, storage_location: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" placeholder={t("storageLocationPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("notesLabel")}</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isFormUnchanged}
                  title={isFormUnchanged ? t("noChangesToSaveHint") : undefined}
                  className="flex-1 py-2.5 rounded-full font-bold bg-gold-400 hover:bg-gold-500 text-[#08130F] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gold-400 transition"
                >
                  {editing ? t("updateItem") : t("addItem")}
                </button>
                <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard for the Add/Edit Item modal */}
      {showFormCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowFormCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowFormCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowFormCancelConfirm(false);
                  setShowForm(false);
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} z={65} />

      {/* Add / Update / Delete all land here on success, instead of just
          silently closing the form/confirm dialog. */}
      <StatusModal open={!!successMessage} type="success" title={t("successTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} z={65} />

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-red-400 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-lg font-bold text-red-400 mb-2">{t("removeItemConfirmTitle")}</h3>
            <p className="text-sm text-white/50 mb-6">{t("removeItemConfirmBody")}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancelLabel")}</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition">{t("yesRemove")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm-before-save step: shown on top of the open form when
          Add/Update is clicked, so the request only fires once the user
          confirms -- mirrors the delete-confirm pattern above. */}
      <ConfirmDialog
        open={showConfirm}
        icon={editing ? <Pencil size={32} /> : <Plus size={32} />}
        title={editing ? t("confirmUpdateItemTitle") : t("confirmAddItemTitle")}
        body={editing ? t("confirmUpdateItemBody") : t("confirmAddItemBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={editing ? t("yesUpdate") : t("yesAdd")}
        onCancel={() => setShowConfirm(false)}
        onConfirm={performSave}
      />
    </>
  );
}
