import React, { useEffect, useMemo, useRef, useState } from "react";
import { Package, Plus, X, MapPin, Trash2, Pencil, AlertTriangle, Search, Layers, RefreshCw, Eye, ImagePlus } from "lucide-react";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
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
  photo_url: string | null;
  borrowed_quantity: number;
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

const emptyForm = {
  name: "",
  quantity: 1,
  condition: "Good" as Condition,
  storage_location: "",
  notes: "",
};

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
 * sortable table below for the actual per-item browsing/editing.
 *
 * Photos: each item can optionally have a single photo (added the same
 * way Resident ID photos and expense receipts are -- a file stored on the
 * `public` disk, exposed as `photo_url`). The table shows a round
 * thumbnail (cropped to fit); a small "View" eye button next to it opens
 * the full, uncropped photo in a modal. The thumbnail itself is NOT
 * clickable -- only the View button is.
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

  // ── Photo state for the Add/Edit form ────────────────────────────────
  // photoFile: a freshly-picked file waiting to be uploaded on save.
  // photoPreview: what to show in the form right now (base64 data URL of
  //   the picked file, OR the existing photo_url when editing an item
  //   that already has one).
  // removeExistingPhoto: staff clicked Delete on an existing photo --
  //   tells the backend to null the column on save.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Full-size photo viewer (shared by the table thumbnails AND the
  //    form preview) -- one modal, opened from the small "View" eye
  //    button. Uses the existing design language (white card, rounded
  //    corners, ink headers) like the receipt viewer on the Budget page. ──
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);

  // KPI strip data -- deliberately a SEPARATE, always-unfiltered fetch from
  // the search/condition-filtered `items` list below, so the summary
  // numbers at the top of the page stay stable while someone is typing
  // into the search box or narrowing the condition filter.
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
    }
  };

  useEffect(() => {
    fetchStats();
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
    const timer = setTimeout(fetchItems, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, conditionFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, conditionFilter, items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const paginatedItems = items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Nothing to submit if editing an item and the form still matches its
  // original values, and no photo change was made.
  const originalFormForCompare = editing
    ? {
        name: editing.name,
        quantity: editing.quantity,
        condition: editing.condition,
        storage_location: editing.storage_location ?? "",
        notes: editing.notes ?? "",
      }
    : emptyForm;

  const hasFormChanges = editing
    ? JSON.stringify(form) !== JSON.stringify(originalFormForCompare) || photoFile !== null || removeExistingPhoto
    : JSON.stringify(form) !== JSON.stringify(emptyForm) || photoFile !== null;

  const isFormUnchanged = !!editing && !hasFormChanges;

  const handleCloseForm = () => {
    if (hasFormChanges) setShowFormCancelConfirm(true);
    else closeForm();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreview("");
    setRemoveExistingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreview("");
    setRemoveExistingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
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
    setPhotoFile(null);
    setPhotoPreview(item.photo_url ?? "");
    setRemoveExistingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
    setError(null);
    setShowForm(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side checks mirror the backend rules (image only, max 5 MB)
    // so the user gets instant feedback without a round-trip.
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file only.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo is too large. Maximum is 5 MB.");
      e.target.value = "";
      return;
    }

    setPhotoFile(file);
    setRemoveExistingPhoto(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview("");
    // If there was already a saved photo on the item, flag it for removal
    // on save. If it was only a pending new pick, just clear the local state.
    if (editing?.photo_url) setRemoveExistingPhoto(true);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

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
      // Multipart FormData -- required because we may be sending a file.
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("quantity", String(form.quantity));
      fd.append("condition", form.condition);
      if (form.storage_location) fd.append("storage_location", form.storage_location);
      if (form.notes) fd.append("notes", form.notes);

      if (photoFile) {
        fd.append("photo", photoFile);
      } else if (removeExistingPhoto) {
        fd.append("remove_photo", "1");
      }

      let archived = false;
      if (editing) {
        // Laravel method-spoofing: multipart PUT via _method=PUT.
        fd.append("_method", "PUT");
        const res = await api.post(`/inventory/${editing.id}`, fd);
        archived = !!res?.data?.archived;
      } else {
        await api.post("/inventory", fd);
      }

      closeForm();
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
        Dashboard/Residents/Households/Events pages. No new colors added
        for the photo feature -- it reuses the existing #0A0E1A / #4FBEB0
        / gold-400 / sage-* tokens throughout. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("barangayInventory")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("inventorySubtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
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

      {/* ── KPI strip ──────────────────────────────────────────────── */}
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

      {/* ── Search + condition filter ───────────────────────────────── */}
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

      {/* ── Table ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4FBEB0]"></div>
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
                        {/* Round thumbnail shows the actual photo (cropped to
                            fit the circle via object-cover) when present, or
                            the existing generic Package icon when not. The
                            thumbnail itself is NOT a button -- a separate
                            small eye icon button (bottom-right of the circle)
                            opens the FULL, uncropped photo in the viewer. */}
                        <div className="relative shrink-0">
                          <div className="h-10 w-10 rounded-full bg-[#123A38] border border-white/10 text-[#7DD8CB] overflow-hidden flex items-center justify-center">
                            {item.photo_url ? (
                              <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-4 w-4" />
                            )}
                          </div>
                          {item.photo_url && (
                            <button
                              type="button"
                              onClick={() => setViewingPhoto({ url: item.photo_url as string, name: item.name })}
                              title={t("viewPhotoLabel")}
                              className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#0A0E1A] border border-white/20 text-white/60 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
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
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                >
                  ←
                </button>
                <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] flex items-center justify-center text-sm font-bold">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      {/* ── Add/Edit Item modal (dark navy card, same treatment as the
          Households/Budget edit modals) ───────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={handleCloseForm}>
          <div className="bg-[#0A0E1A] rounded-[30px] w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? t("editItem") : t("addInventoryItem")}</h2>
              <button onClick={handleCloseForm} className="text-white/50 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
              {/* Photo field -- picked file becomes photoFile (uploaded on
                  save); existing photos show as preview with Replace/Delete;
                  an existing photo removed sets removeExistingPhoto. */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">{t("photoOptionalLabel")}</label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-2xl bg-[#123A38] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-6 w-6 text-white/40" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
                    >
                      {photoPreview ? t("replacePhotoLabel") : t("choosePhotoLabel")}
                    </button>
                    {photoPreview && (
                      <>
                        <button
                          type="button"
                          onClick={() => setViewingPhoto({ url: photoPreview, name: form.name || t("itemPhotoFallbackLabel") })}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/40 px-4 py-2 text-sm font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition"
                        >
                          <Eye className="h-3.5 w-3.5" /> {t("viewPhotoLabel")}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("removeLabel")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-white/40">JPG, PNG, GIF, or WEBP · Max 5 MB</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">{t("itemNameRequired")}</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" placeholder={t("itemNamePlaceholder")} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">{t("quantityRequired")}</label>
                  <input type="number" min={0} required value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
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

      {/* ── Unsaved-changes guard for the Add/Edit Item modal ─────────── */}
      {showFormCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowFormCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowFormCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowFormCancelConfirm(false);
                  closeForm();
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success / error popups (shared StatusModal) ───────────────── */}
      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} z={65} />
      <StatusModal open={!!successMessage} type="success" title={t("successTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} z={65} />

      {/* ── Delete confirm ────────────────────────────────────────────── */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
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

      {/* ── Confirm-before-save step ──────────────────────────────────── */}
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

      {/* ── Full-size photo viewer modal -- opens from the eye button on
          each thumbnail (or the form's View button). Shows the FULL,
          uncropped image instead of the cropped circle thumbnail. Same
          white-card style used by the receipt viewer on the Budget page,
          so it matches the rest of the app. ──────────────────────────── */}
      {viewingPhoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] px-4" onClick={() => setViewingPhoto(null)}>
          <div className="bg-white rounded-[24px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E6E0D3] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-50 text-sage-800 text-[11px] font-bold uppercase tracking-wide px-3 py-1 shrink-0">
                  <Eye className="h-3 w-3" />
                  {t("viewPhotoLabel")}
                </span>
                <span className="text-sm font-medium text-[#1A1A1A] truncate">{viewingPhoto.name}</span>
              </div>
              <button onClick={() => setViewingPhoto(null)} className="text-[#6B7280] hover:text-[#1A1A1A] p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[#FAF9F5] flex items-center justify-center p-6">
              <img src={viewingPhoto.url} alt={viewingPhoto.name} className="max-w-full max-h-[65vh] rounded-xl shadow-sm" />
            </div>
            <div className="px-5 py-4 border-t border-[#E6E0D3] flex justify-end">
              <button
                onClick={() => setViewingPhoto(null)}
                className="px-5 py-2.5 rounded-full bg-sage-800 hover:bg-sage-900 text-white text-sm font-semibold transition"
              >
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}