import FormSelect from "../../../components/ui/FormSelect";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Package, Plus, X, MapPin, Trash2, Pencil, AlertTriangle, Search, Layers, RefreshCw, Eye, ImagePlus, Filter } from "lucide-react";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import NumberStepper from "../../../components/ui/NumberStepper";
import PhotoAttachment from "../../../components/ui/PhotoAttachment";
import { PhotoItem, photoItemsFromUrls, appendPhotoFields, photoItemsChanged } from "../../../components/ui/PhotoGallery";
import Skeleton from "../../../components/ui/Skeleton";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import StatCardSkeleton, { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";

import { tc } from "../../../lib/contentTranslations";
// An item's condition covers the units still in use. Lost and disposed units
// are separate counters on the item, so they are only *filters*, not conditions.
type Condition = "New" | "Good" | "Fair" | "Poor";
type ConditionFilter = Condition | "Disposed" | "Lost";

interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  // Units reported lost -- separate from `condition`, so a few lost units
  // never mark the still-good ones as Lost. lost_pending is the part that
  // was out on loan when reported (settled once that loan closes).
  lost_quantity: number;
  lost_pending: number;
  // Worn-out / used-up units taken out of service (same idea as lost).
  disposed_quantity: number;
  condition: Condition;
  storage_location: string | null;
  notes: string | null;
  photo_url: string | null;
  // Every photo, cover first (the list above only ever shows the cover).
  photo_urls: string[];
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
};

const emptyForm = { name: "", quantity: 1, lost_quantity: 0, disposed_quantity: 0, condition: "Good" as Condition, storage_location: "", notes: "" };

const CONDITION_LABEL_KEYS: Record<ConditionFilter, string> = {
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
  const { t, language } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Page-open skeleton for the KPI strip (first load only -- never returns on polls).
  const statsLoading = usePageOpenSkeleton(loading);
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

  // Photo state for the Add/Edit form
  // One photo per item: the saved one or a newly picked file (kept as a list
  // of at most one so it shares the save format with the multi-photo fields).
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);

  // Full-size photo viewer (dark themed, matching the rest of the app).
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string; urls?: string[] } | null>(null);

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
      (i) => !!i.overdue_borrow_event || i.condition === "Poor" || (i.lost_quantity ?? 0) > 0
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
  // success popup) from firing for a change that never happened. A chosen
  // or removed photo counts as a change too.
  const isFormUnchanged = !!editing && (
    form.name === editing.name &&
    Number(form.quantity) === editing.quantity &&
    Number(form.lost_quantity) === (editing.lost_quantity ?? 0) &&
    Number(form.disposed_quantity) === (editing.disposed_quantity ?? 0) &&
    form.condition === editing.condition &&
    form.storage_location === (editing.storage_location ?? "") &&
    form.notes === (editing.notes ?? "") &&
    !photoItemsChanged(photoItems, editing.photo_urls?.length ?? (editing.photo_url ? 1 : 0))
  );

  const hasFormChanges = editing
    ? !isFormUnchanged
    : JSON.stringify(form) !== JSON.stringify(emptyForm) || photoItems.length > 0;

  const handleCloseForm = () => {
    if (hasFormChanges) setShowFormCancelConfirm(true);
    else closeForm();
  };

  // Lost / Disposed move units out of (or back into) the in-stock Quantity
  // live, mirroring what the server does on save: stepping Lost or Disposed
  // up takes units out of Quantity, stepping down puts them back. When
  // editing, form.quantity is the BASE stock sent to the server; the number
  // shown in the Quantity box is what's left after the Lost/Disposed changes.
  // Units found again that were out on loan when reported (lost_pending)
  // settle with that loan instead of returning to stock.
  const projectStock = (base: number, lost: number, disposed: number) => {
    if (!editing) return base;
    let s = base;
    const dl = lost - (editing.lost_quantity ?? 0);
    if (dl > 0) {
      s -= Math.min(dl, s);
    } else if (dl < 0) {
      const found = -dl;
      s += found - Math.min(found, editing.lost_pending ?? 0);
    }
    return s - (disposed - (editing.disposed_quantity ?? 0));
  };
  const baseQuantity = Number(form.quantity) || 0;
  const shownQuantity = editing ? projectStock(baseQuantity, form.lost_quantity, form.disposed_quantity) : baseQuantity;
  // Upper limits so the numbers stay within what actually exists: disposed
  // can only come from stock, lost can also come from units out on loan.
  const maxDisposed = editing ? (editing.disposed_quantity ?? 0) + Math.max(0, projectStock(baseQuantity, form.lost_quantity, editing.disposed_quantity ?? 0)) : 0;
  const maxLost = editing
    ? (editing.lost_quantity ?? 0)
      + Math.max(0, baseQuantity - Math.max(0, form.disposed_quantity - (editing.disposed_quantity ?? 0)))
      + Math.max(0, (editing.borrowed_quantity ?? 0) - (editing.lost_pending ?? 0))
    : 0;

  // Picking a photo replaces the current one -- an item holds exactly one.
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("uploadImageOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("photoTooLarge"));
      return;
    }
    const old = photoItems[0];
    if (old?.file) URL.revokeObjectURL(old.url);
    setPhotoItems([{ id: `photo-${Date.now()}`, url: URL.createObjectURL(file), file, existingIndex: null }]);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setPhotoItems([]);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setPhotoItems([]);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      quantity: item.quantity,
      lost_quantity: item.lost_quantity ?? 0,
      disposed_quantity: item.disposed_quantity ?? 0,
      condition: item.condition,
      storage_location: item.storage_location ?? "",
      notes: item.notes ?? "",
    });
    setPhotoItems(photoItemsFromUrls(item.photo_url ? [item.photo_url] : []));
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

    // An item always keeps at least one photo -- a brand-new item with
    // nothing chosen yet, or an existing item whose photos were all removed
    // -- so this one check covers both the Add and Edit forms.
    if (photoItems.length === 0) {
      setError(t("photoRequiredError"));
      return;
    }
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
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("quantity", String(form.quantity));
      fd.append("condition", form.condition);
      if (editing) {
        fd.append("lost_quantity", String(form.lost_quantity));
        fd.append("disposed_quantity", String(form.disposed_quantity));
      }
      if (form.storage_location) fd.append("storage_location", form.storage_location);
      if (form.notes) fd.append("notes", form.notes);

      appendPhotoFields(fd, photoItems);

      let archived = false;
      if (editing) {
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
      // Revert to the item's real values instead of leaving the
      // rejected edit sitting in the form.
      if (editing) {
        setForm({
          name: editing.name,
          quantity: editing.quantity,
          lost_quantity: editing.lost_quantity ?? 0,
          disposed_quantity: editing.disposed_quantity ?? 0,
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
        ].map((card, idx) => statsLoading ? (
          <StatCardSkeleton key={idx} />
        ) : (
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
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-[4.5rem] text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                title="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
              >
                {t("clearLabel")}
              </button>
            )}
          </div>
          <FilterDropdown
            value={conditionFilter}
            onChange={setConditionFilter}
            options={[
              { value: "", label: t("allConditions") },
              ...(["New", "Good", "Fair", "Poor", "Disposed", "Lost"] as ConditionFilter[]).map((c) => ({
                value: c,
                label: t(CONDITION_LABEL_KEYS[c]),
              })),
            ]}
            className="h-11 pl-10 pr-8 shrink-0"
            icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
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
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("itemColumn")}</th>
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("conditionColumn")}</th>
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("quantityColumn")}</th>
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("storageLocationLabel")}</th>
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("statusColumn")}</th>
                  <th className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wide text-white">{t("actionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.05] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="h-9 w-9 rounded-full bg-[#123A38] border border-white/10 text-[#7DD8CB] overflow-hidden flex items-center justify-center">
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
                              className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#0A0E1A] border border-white/20 text-white/60 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
                            >
                              <Eye className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        <div className="min-w-0 max-w-[280px]">
                          <p className="text-[15px] font-semibold text-white truncate" title={tc(item.name, language as any)}>{tc(item.name, language as any)}</p>
                          {item.notes && (
                            <p className="text-[13px] text-white/40 leading-snug mt-0.5 line-clamp-2" title={tc(item.notes, language as any)}>{tc(item.notes, language as any)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${CONDITION_STYLES[item.condition]}`}>{t(CONDITION_LABEL_KEYS[item.condition])}</span>
                    </td>
                    <td className="py-3 px-4 text-[15px] font-semibold text-white [font-variant-numeric:tabular-nums]">
                      {item.quantity} <span className="font-normal text-[13px] text-white/45">{t("inStock")}</span>
                      {item.lost_quantity > 0 && (
                        <span
                          title={item.lost_pending > 0 ? t("lostUnitsPendingTooltip").replace("{n}", String(item.lost_pending)) : undefined}
                          className="ml-2 inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400 whitespace-nowrap"
                        >
                          {t("lostUnitsBadge").replace("{n}", String(item.lost_quantity))}
                        </span>
                      )}
                      {item.disposed_quantity > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/55 whitespace-nowrap">
                          {t("disposedUnitsBadge").replace("{n}", String(item.disposed_quantity))}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[15px] text-white/50">
                      {item.storage_location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 shrink-0 text-[#4FBEB0]" /> {tc(item.storage_location, language as any)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {item.overdue_borrow_event ? (
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 whitespace-nowrap"
                          title={t("overdueBorrowTooltip").replace("{event}", item.overdue_borrow_event.name)}
                        >
                          {t("overdueReturnBadge")}
                        </span>
                      ) : item.borrowed_quantity > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.04] text-white/50 whitespace-nowrap">{t("onLoanBadge")}</span>
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
                <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={handleCloseForm}>
          <div className="bg-[#0A0E1A] rounded-3xl w-full max-w-3xl p-6 sm:p-8 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">{editing ? t("editItem") : t("addInventoryItem")}</h2>
              <button onClick={handleCloseForm} className="text-white/50 hover:text-white"><X size={26} /></button>
            </div>
            <form onSubmit={handleFormSubmit} noValidate className="space-y-5">
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("photoRequiredLabel")}</label>
                <PhotoAttachment
                  file={photoItems[0]?.file ?? null}
                  url={photoItems[0]?.url ?? null}
                  onPick={handlePhotoChange}
                  onPreview={() => photoItems[0] && setViewingPhoto({ url: photoItems[0].url, name: form.name || t("itemPhotoFallbackLabel") })}
                  onDelete={() => setPhotoItems([])}
                />
                <p className="mt-2 text-sm text-white/50">{t("fileHintImage")}</p>
              </div>

              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("itemNameRequired")}</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" placeholder={t("opsPlaceholderPlasticChairs")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-base font-semibold text-white mb-2">{t("quantityRequired")}</label>
                  <NumberStepper
                    min={0}
                    required
                    fullWidth
                    value={String(shownQuantity)}
                    onChange={(v) => {
                      const typed = Math.max(0, Number(v) || 0);
                      // Keep the Lost/Disposed adjustment, change only the base.
                      setForm((p) => ({ ...p, quantity: Math.max(0, typed - (shownQuantity - baseQuantity)) }));
                    }}
                    className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
                </div>
                <div>
                  <label className="block text-base font-semibold text-white mb-2">{t("conditionRequired")}</label>
                  <FormSelect value={form.condition} onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value as Condition }))} className="w-full appearance-none rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50">
                    {(["New", "Good", "Fair", "Poor"] as Condition[]).map((c) => (
                      <option key={c} value={c} className="bg-[#0A0E1A] text-white">{t(CONDITION_LABEL_KEYS[c])}</option>
                    ))}
                  </FormSelect>
                </div>
              </div>
              {editing && (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-base font-semibold text-white mb-2">{t("lostUnitsLabel")}</label>
                      <NumberStepper min={0} max={maxLost} fullWidth value={String(form.lost_quantity)} onChange={(v) => setForm((p) => ({ ...p, lost_quantity: Math.min(maxLost, Math.max(0, Number(v) || 0)) }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-2">{t("disposedUnitsLabel")}</label>
                      <NumberStepper min={0} max={maxDisposed} fullWidth value={String(form.disposed_quantity)} onChange={(v) => setForm((p) => ({ ...p, disposed_quantity: Math.min(maxDisposed, Math.max(0, Number(v) || 0)) }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-white/45">{t("lostUnitsHint")}</p>
                </div>
              )}
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("storageLocationLabel")}</label>
                <input value={form.storage_location} onChange={(e) => setForm((p) => ({ ...p, storage_location: e.target.value }))} className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" placeholder={t("storageLocationPlaceholder")} />
              </div>
              <div>
                <label className="block text-base font-semibold text-white mb-2">{t("notesLabel")}</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50" rows={3} />
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={isFormUnchanged}
                  title={isFormUnchanged ? t("noChangesToSaveHint") : undefined}
                  className="flex-1 py-3.5 text-base rounded-full font-bold bg-sage-700 hover:bg-sage-800 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sage-700 transition"
                >
                  {editing ? t("updateItem") : t("addItem")}
                </button>
                <button type="button" onClick={handleCloseForm} className="px-8 py-3.5 text-base rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancelLabel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard for the Add/Edit Item modal */}
      {showFormCancelConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] px-4" onClick={() => setShowFormCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} z={65} />

      {/* Add / Update / Delete all land here on success, instead of just
          silently closing the form/confirm dialog. */}
      <StatusModal open={!!successMessage} type="success" title={t("successTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} z={65} />

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] px-4">
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

      {/* Full-size photo viewer -- dark themed, matching the rest of the
          app (same treatment as the Delete-confirm and Unsaved-changes
          modals: bg-[#0A0E1A] card, white/10 border, teal accents). */}
      {viewingPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[80] px-4" onClick={() => setViewingPhoto(null)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] text-[11px] font-bold uppercase tracking-wide px-3 py-1 shrink-0">
                  <Eye className="h-3 w-3" />
                  {t("viewPhotoLabel")}
                </span>
                <span className="text-sm font-medium text-white truncate">{tc(viewingPhoto.name, language as any)}</span>
              </div>
              <button onClick={() => setViewingPhoto(null)} className="text-white/50 hover:text-white p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-black/40 flex items-center justify-center p-6">
              <img src={viewingPhoto.url} alt={viewingPhoto.name} className="max-w-full max-h-[65vh] rounded-xl shadow-2xl" />
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              {viewingPhoto.urls && viewingPhoto.urls.length > 1 ? (
                <div className="flex items-center gap-2">
                  {viewingPhoto.urls.map((u, i) => (
                    <button
                      key={u + i}
                      type="button"
                      onClick={() => setViewingPhoto({ ...viewingPhoto, url: u })}
                      className={`h-10 w-10 overflow-hidden rounded-lg border transition ${u === viewingPhoto.url ? "border-[#7DD8CB]" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <button
                onClick={() => setViewingPhoto(null)}
                className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold transition"
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
