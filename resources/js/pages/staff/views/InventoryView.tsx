import React, { useEffect, useMemo, useState } from "react";
import { Package, Plus, X, MapPin, Trash2, Pencil, XCircle, CheckCircle, AlertTriangle, Search, Layers, RefreshCw } from "lucide-react";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
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

const CONDITION_STYLES: Record<Condition, string> = {
  New: "bg-sage-100 text-sage-800",
  Good: "bg-sage-50 text-sage-700",
  Fair: "bg-gold-50 text-gold-700",
  Poor: "bg-[#8A3D2C]/10 text-[#5C2A1E]",
  Disposed: "bg-[#E6E0D3]/70 text-[#6B7280]",
  Lost: "bg-red-50 text-red-700",
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("barangayInventory")}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">{t("inventorySubtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          {/* Genuinely live -- fetchStats() re-polls /inventory every 20s
              (see effect above), this just renders how long ago that last
              landed, ticking every second off nowTick. */}
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#E6E0D3] bg-white px-3.5 py-2 text-xs font-medium text-[#6B7280]" title={t("liveLabel")}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-600" />
            </span>
            {lastUpdatedLabel}
          </div>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] hover:bg-[#2E2E2E] text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> {t("addItem")}
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

      <div className="rounded-2xl border border-[#E6E0D3] bg-white p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchInventoryPlaceholder")}
              className="h-11 w-full rounded-xl border border-[#E6E0D3] bg-white pl-11 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
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
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sage-700"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E6E0D3] bg-white p-10 text-center text-[#6B7280]">
          <Package size={40} className="mx-auto mb-3 text-sage-300" />
          <p>{t("noInventoryItems")}</p>
        </div>
      ) : (
        <>
        <div className="rounded-2xl border border-[#E6E0D3] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E0D3]">
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("itemColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("conditionColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("quantityColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("storageLocationLabel")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("statusColumn")}</th>
                  <th className="py-3 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]">{t("actionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="border-b border-[#F1EEE5] last:border-0 hover:bg-sage-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-50 text-sage-700">
                          <Package className="h-4 w-4" />
                        </div>
                        <p className="font-semibold text-[#1A1A1A] truncate" title={item.name}>{item.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${CONDITION_STYLES[item.condition]}`}>{t(CONDITION_LABEL_KEYS[item.condition])}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#1A1A1A] [font-variant-numeric:tabular-nums]">
                      {item.quantity} <span className="font-normal text-xs text-[#6B7280]">{t("inStock")}</span>
                    </td>
                    <td className="py-3 px-4 text-[#6B7280]">
                      {item.storage_location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8A3D2C]" /> {item.storage_location}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {item.overdue_borrow_event ? (
                        <span
                          className="px-2 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 whitespace-nowrap"
                          title={t("overdueBorrowTooltip").replace("{event}", item.overdue_borrow_event.name)}
                        >
                          {t("overdueReturnBadge")}
                        </span>
                      ) : item.borrowed_quantity > 0 ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-semibold border border-[#E6E0D3] bg-white text-[#6B7280] whitespace-nowrap">{t("onLoanBadge")}</span>
                      ) : (
                        <span className="text-[#B8B2A2]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {/* Neutral with a sage hover for Edit, red hover for
                          Delete -- matches the icon-only Edit/Delete
                          pairing used on the Events card grid. Delete is
                          disabled while any units are out on loan --
                          deleting an item an active event still points to
                          would orphan its borrow record (see
                          InventoryController::destroy). */}
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-full text-[#6B7280] hover:bg-sage-50 hover:text-sage-800 transition" title={t("editLabel")}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => item.borrowed_quantity === 0 && setDeleteId(item.id)}
                          disabled={item.borrowed_quantity > 0}
                          className={`p-1.5 rounded-full transition ${
                            item.borrowed_quantity > 0
                              ? "text-[#B8B2A2] cursor-not-allowed"
                              : "text-[#6B7280] hover:bg-red-50 hover:text-red-500"
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
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 py-3 border-t border-[#E6E0D3]">
              <p className="text-sm text-[#6B7280] text-center sm:text-left">
                {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages} • {items.length} {t("recordsShownLabel")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-50 transition"
                >
                  ←
                </button>
                <span className="h-8 w-8 rounded-full bg-sage-800 text-white flex items-center justify-center text-sm font-semibold">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-50 transition"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={handleCloseForm}>
          <div className="bg-white rounded-[30px] w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-[#E6E0D3] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#1A1A1A]">{editing ? t("editItem") : t("addInventoryItem")}</h2>
              <button onClick={handleCloseForm} className="text-[#6B7280] hover:text-[#1A1A1A]"><X size={20} /></button>
            </div>
            <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("itemNameRequired")}</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-full border border-sage-200 px-4 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30" placeholder="Plastic chairs" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("quantityRequired")}</label>
                  <input type="number" min={0} required value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} className="w-full rounded-full border border-sage-200 px-4 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("conditionRequired")}</label>
                  <select value={form.condition} onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value as Condition }))} className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30">
                    {(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as Condition[]).map((c) => (
                      <option key={c} value={c}>{t(CONDITION_LABEL_KEYS[c])}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("storageLocationLabel")}</label>
                <input value={form.storage_location} onChange={(e) => setForm((p) => ({ ...p, storage_location: e.target.value }))} className="w-full rounded-full border border-sage-200 px-4 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30" placeholder={t("storageLocationPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("notesLabel")}</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-2xl border border-sage-200 px-4 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isFormUnchanged}
                  title={isFormUnchanged ? t("noChangesToSaveHint") : undefined}
                  className="flex-1 py-2.5 rounded-full font-semibold bg-sage-800 hover:bg-sage-900 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sage-800 transition"
                >
                  {editing ? t("updateItem") : t("addItem")}
                </button>
                <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard for the Add/Edit Item modal */}
      {showFormCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowFormCancelConfirm(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-500 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-500 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-[#6B7280] mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowFormCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("stayButton")}</button>
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

      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[65] px-4" onClick={() => setError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{error}</p>
            <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {/* Add / Update / Delete all land here on success, instead of just
          silently closing the form/confirm dialog. */}
      {successMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[65] px-4" onClick={() => setSuccessMessage(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sage-800 flex justify-center"><CheckCircle size={40} /></div>
            <h3 className="text-xl font-bold text-sage-800 mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="px-6 py-2.5 rounded-full bg-sage-800 hover:bg-sage-900 text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-red-500 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("removeItemConfirmTitle")}</h3>
            <p className="text-sm text-[#6B7280] mb-6">{t("removeItemConfirmBody")}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("cancelLabel")}</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition">{t("yesRemove")}</button>
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
    </div>
  );
}
