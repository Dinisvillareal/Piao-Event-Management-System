import React, { useEffect, useState } from "react";
import { Package, Plus, X, MapPin, Trash2, Pencil, XCircle, CheckCircle } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
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
}

const CONDITION_STYLES: Record<Condition, string> = {
  New: "bg-teal-50 text-teal-800",
  Good: "bg-green-50 text-green-800",
  Fair: "bg-amber-50 text-amber-800",
  Poor: "bg-orange-50 text-orange-800",
  Disposed: "bg-gray-100 text-gray-600",
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
 * UC-9: Manage Barangay Inventory. Presented as a card grid (with a
 * condition badge + stock count front-and-center) rather than a plain
 * table — a stock check is closer to "at-a-glance browsing" than to
 * reading rows of numbers, matching the resident's note to vary the UI per
 * feature instead of defaulting everything to a table.
 */
export default function InventoryView() {
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const wasEditing = !!editing;
    try {
      if (editing) {
        await api.put(`/inventory/${editing.id}`, form);
      } else {
        await api.post("/inventory", form);
      }
      setShowForm(false);
      setSuccessMessage(wasEditing ? t("itemUpdatedSuccess") : t("itemAddedSuccess"));
      fetchItems();
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
    } catch (e) {
      setDeleteId(null);
      setError(apiErrorMessage(e, t("deleteItemFailed")));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("barangayInventory")}</h1>
          <p className="mt-1 text-sm text-[#667777]">{t("inventorySubtitle")}</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 self-start sm:self-auto bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm">
          <Plus className="h-4 w-4" /> {t("addItem")}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder={t("searchInventoryPlaceholder")} />
        </div>
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="h-14 px-4 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm"
        >
          <option value="">{t("allConditions")}</option>
          {(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as Condition[]).map((c) => (
            <option key={c} value={c}>{t(CONDITION_LABEL_KEYS[c])}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
          <Package size={40} className="mx-auto mb-3 text-[#005f63]/40" />
          <p>{t("noInventoryItems")}</p>
        </div>
      ) : (
        <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedItems.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-[#ddd5ca] bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#005f63]/10">
                  <Package className="h-5 w-5 text-[#005f63]" />
                </div>
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${CONDITION_STYLES[item.condition]}`}>{t(CONDITION_LABEL_KEYS[item.condition])}</span>
              </div>
              <h3 className="mt-3 font-bold text-[#005f63] truncate" title={item.name}>{item.name}</h3>
              <p className="text-2xl font-black text-gray-800 mt-1">{item.quantity} <span className="text-xs font-medium text-gray-400">{t("inStock")}</span></p>
              {item.storage_location && (
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-500 truncate">
                  <MapPin className="h-3 w-3 shrink-0" /> {item.storage_location}
                </p>
              )}
              {/* Same size/shape for both -- Edit amber, Delete red,
                  matching the Edit/Delete color pairing used on Residents. */}
              <div className="mt-4 flex gap-2">
                <button onClick={() => openEdit(item)} className="flex-1 rounded-full border border-amber-200 p-2 flex items-center justify-center text-amber-500 hover:bg-amber-50 transition" title={t("editLabel")}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteId(item.id)} className="flex-1 rounded-full border border-red-200 p-2 flex items-center justify-center text-red-500 hover:bg-red-50 transition" title={t("removeLabel")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-6">
            <p className="text-sm text-gray-600 text-center sm:text-left">
              {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages} • {items.length} {t("recordsShownLabel")}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                ←
              </button>
              <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                →
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-lg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[#005f63]">{editing ? t("editItem") : t("addInventoryItem")}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("itemNameRequired")}</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder="Plastic chairs" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("quantityRequired")}</label>
                  <input type="number" min={0} required value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("conditionRequired")}</label>
                  <select value={form.condition} onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value as Condition }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm bg-white">
                    {(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as Condition[]).map((c) => (
                      <option key={c} value={c}>{t(CONDITION_LABEL_KEYS[c])}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("storageLocationLabel")}</label>
                <input value={form.storage_location} onChange={(e) => setForm((p) => ({ ...p, storage_location: e.target.value }))} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder={t("storageLocationPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("notesLabel")}</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isFormUnchanged}
                  title={isFormUnchanged ? t("noChangesToSaveHint") : undefined}
                  className="flex-1 py-2.5 rounded-full font-bold bg-[#005f63] hover:bg-[#004a4d] text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#005f63]"
                >
                  {editing ? t("updateItem") : t("addItem")}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[65] px-4" onClick={() => setError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{error}</p>
            <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
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
            <div className="mb-3 text-[#005f63] flex justify-center"><CheckCircle size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-red-500 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("removeItemConfirmTitle")}</h3>
            <p className="text-sm text-gray-600 mb-6">{t("removeItemConfirmBody")}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100">{t("cancelLabel")}</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700">{t("yesRemove")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
