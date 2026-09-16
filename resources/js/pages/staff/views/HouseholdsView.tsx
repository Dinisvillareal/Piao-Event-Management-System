import React, { useEffect, useMemo, useState } from "react";
import { Home, Users, Plus, Pencil, Trash2, Star, UserPlus, X, CheckCircle, AlertCircle, AlertTriangle, ChevronDown, Search } from "lucide-react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useLanguage } from "../../../i18n/LanguageContext";

/**
 * Real Household module -- staff pick an existing household (or create one)
 * instead of retyping a free-text household_code, so families stay grouped
 * correctly for household-head SMS notifications (see SmsService).
 */

interface Member {
  id: number;
  user_code: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  contact_number: string;
  is_household_head: boolean;
  role?: "Resident" | "Staff";
}

interface Household {
  id: number;
  code: string;
  address: string | null;
  contact_number: string | null;
  members_count: number;
  members: Member[];
  created_at?: string;
}

const csrfToken = () =>
  decodeURIComponent(
    document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1] ?? ""
  );

async function api(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": csrfToken(),
      ...(options.headers || {}),
    },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const message = body?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function fullName(m: Member) {
  return [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" ");
}

export default function HouseholdsView() {
  const { t } = useLanguage();

  const [households, setHouseholds] = useState<Household[]>([]);
  const [unassigned, setUnassigned] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const [editRecord, setEditRecord] = useState<Household | null>(null);
  const [editForm, setEditForm] = useState({ address: "", contact_number: "" });
  // Closing the Edit Household modal (backdrop or Cancel) with unsaved
  // changes asks first instead of silently discarding them.
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false);

  const [deleteRecord, setDeleteRecord] = useState<Household | null>(null);
  const [saving, setSaving] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);

  const load = async (searchValue = search, pageValue = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(pageValue) });
      if (searchValue) qs.set("search", searchValue);
      const [list, free] = await Promise.all([
        api(`/households?${qs.toString()}`),
        api(`/households/unassigned`),
      ]);
      setHouseholds(Array.isArray(list?.data) ? list.data : []);
      setLastPage(list?.last_page ?? 1);
      setUnassigned(Array.isArray(free) ? free : []);
    } catch (e: any) {
      console.error("households load:", e);
      setErrorMessage(e?.message || t("loadHouseholdsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(search, 1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    load(search, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filteredUnassigned = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return unassigned;
    return unassigned.filter((m) =>
      `${fullName(m)} ${m.user_code}`.toLowerCase().includes(q)
    );
  }, [unassigned, memberSearch]);

  const performAdd = async () => {
    setConfirmAdd(false);
    setSaving(true);
    try {
      // No address/contact number to send anymore -- a brand new
      // household starts blank and picks both up automatically from
      // whichever resident staff later make its head (see
      // Household::backfillFromHead() on the backend).
      await api("/households", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setSuccessMessage(t("householdAddedSuccess"));
    } catch (e: any) {
      setErrorMessage(e?.message || t("saveHouseholdFailed"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (h: Household) => {
    setEditRecord(h);
    setEditForm({ address: h.address ?? "", contact_number: h.contact_number ?? "" });
  };

  // Nothing to submit if the form still matches the household being edited.
  const isEditFormUnchanged = !!editRecord &&
    editForm.address === (editRecord.address ?? "") &&
    editForm.contact_number === (editRecord.contact_number ?? "");

  const handleCloseEdit = () => {
    if (!isEditFormUnchanged) setShowEditCancelConfirm(true);
    else setEditRecord(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord) return;
    setConfirmEdit(true);
  };

  const performEdit = async () => {
    if (!editRecord) return;
    setConfirmEdit(false);
    setSaving(true);
    try {
      await api(`/households/${editRecord.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setEditRecord(null);
      await load();
      setSuccessMessage(t("householdUpdatedSuccess"));
    } catch (e: any) {
      setErrorMessage(e?.message || t("saveHouseholdFailed"));
      // Revert the fields to the household as it actually is, rather
      // than leaving the rejected edit sitting in the form.
      if (editRecord) {
        setEditForm({ address: editRecord.address ?? "", contact_number: editRecord.contact_number ?? "" });
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;
    setSaving(true);
    try {
      await api(`/households/${deleteRecord.id}`, { method: "DELETE" });
      setDeleteRecord(null);
      await load();
      setSuccessMessage(t("householdDeletedSuccess"));
    } catch (e: any) {
      setErrorMessage(e?.message || t("deleteHouseholdFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (householdId: number, userId: number) => {
    try {
      await api(`/households/${householdId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      setPickerFor(null);
      setMemberSearch("");
      await load(search, page);
    } catch (e: any) {
      setErrorMessage(e?.message || t("addMemberFailed"));
    }
  };

  const removeMember = async (householdId: number, userId: number, wasHead: boolean) => {
    try {
      await api(`/households/${householdId}/members/${userId}`, { method: "DELETE" });
      await load(search, page);
      // The head badge on the card already flags a headless household
      // passively, but staff should also know it happened right when
      // they took the action that caused it, not just on next glance.
      if (wasHead) {
        setSuccessMessage(t("removedHeadNowUnassigned"));
      }
    } catch (e: any) {
      setErrorMessage(e?.message || t("removeMemberFailed"));
    }
  };

  const setHead = async (householdId: number, userId: number) => {
    try {
      await api(`/households/${householdId}/head`, {
        method: "PUT",
        body: JSON.stringify({ user_id: userId }),
      });
      await load(search, page);
    } catch (e: any) {
      setErrorMessage(e?.message || t("setHeadFailed"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Full-bleed dark navy wrapper -- matches the Dashboard/Residents
          background and palette. Modals further down stay in the original
          light theme, same scoping used on the Residents page. */}
      <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("householdsTitle")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("householdsSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmAdd(true)}
          className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md shrink-0"
        >
          {t("addHouseholdLabel")}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
            <Plus className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchHouseholdsPlaceholder")}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4FBEB0]" />
        </div>
      ) : households.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-sm text-white/50">
          {t("noHouseholdsFound")}
        </div>
      ) : (
        <div className="space-y-3">
          {households.map((h) => {
            const expanded = expandedId === h.id;
            const head = h.members?.find((m) => m.is_household_head);
            return (
              <div key={h.id} className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden transition-colors hover:border-white/20">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : h.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : h.id);
                    }
                  }}
                  className="p-5 flex flex-wrap items-center gap-4 cursor-pointer"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4FBEB0]/10 shrink-0">
                    <Home className="h-5 w-5 text-[#4FBEB0]" />
                  </div>
                  <div className="min-w-[140px]">
                    <p className="text-sm font-bold text-white">{h.code}</p>
                    <p className="text-xs text-white/45">{h.address || t("noAddressOnFile")}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#7DD8CB] bg-[#4FBEB0]/10 rounded-full px-3 py-1">
                    <Users className="h-3.5 w-3.5" /> {h.members_count} {t("membersLabel")}
                  </div>
                  {head ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gold-300 bg-gold-500/10 rounded-full px-3 py-1">
                      <Star className="h-3.5 w-3.5 fill-gold-300" /> {fullName(head)}
                    </span>
                  ) : h.members_count > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gold-300 bg-gold-500/10 rounded-full px-3 py-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {t("noHeadAssigned")}
                    </span>
                  ) : null}
                  {h.contact_number && (
                    <span className="text-xs text-white/40">{h.contact_number}</span>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <ChevronDown
                      className={`h-4 w-4 text-white/30 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/10 bg-black/20 px-5 py-4 space-y-3">
                    {h.members.length === 0 ? (
                      <p className="text-xs text-white/40">{t("noMembersYet")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {h.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-full bg-white/[0.05] border border-white/10 pl-3 pr-1.5 py-1.5 text-xs">
                            <span className="font-medium text-white">{fullName(m)}</span>
                            {m.role === "Staff" && (
                              <span className="rounded-full bg-gold-400/15 text-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>
                            )}
                            <span className="text-white/40">{m.user_code}</span>
                            <button
                              type="button"
                              onClick={() => setHead(h.id, m.id)}
                              title={m.is_household_head ? t("headOfHouseholdTitle") : t("setAsHeadLabel")}
                              className={`p-1 rounded-full ${m.is_household_head ? "text-gold-300" : "text-white/25 hover:text-gold-300"}`}
                            >
                              <Star className={`h-3.5 w-3.5 ${m.is_household_head ? "fill-gold-300" : ""}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMember(h.id, m.id, m.is_household_head)}
                              title={t("removeMemberLabel")}
                              className="p-1 rounded-full text-white/25 hover:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {pickerFor === h.id ? (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3 space-y-2">
                        <input
                          autoFocus
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder={t("searchResidentPlaceholder")}
                          className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {filteredUnassigned.length === 0 ? (
                            <p className="text-xs text-white/40 px-2 py-1">{t("noUnassignedResidents")}</p>
                          ) : (
                            filteredUnassigned.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => addMember(h.id, m.id)}
                                className="w-full text-left text-xs px-3 py-2 rounded-full hover:bg-white/[0.06] flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-1.5 text-white">
                                  {fullName(m)}
                                  {m.role === "Staff" && (
                                    <span className="rounded-full bg-gold-400/15 text-gold-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>
                                  )}
                                </span>
                                <span className="text-white/40">{m.user_code}</span>
                              </button>
                            ))
                          )}
                        </div>
                        <button type="button" onClick={() => { setPickerFor(null); setMemberSearch(""); }} className="text-xs text-white/40 hover:text-white px-2">
                          {t("cancelLabel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setPickerFor(h.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4FBEB0] hover:text-[#7DD8CB]"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> {t("addMemberLabel")}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(h); }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            title={t("editLabel")}
                          >
                            <Pencil className="h-3.5 w-3.5" /> {t("editLabel")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteRecord(h); }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                            title={t("deleteTitle")}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {t("deleteTitle")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {lastPage > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-9 w-9 rounded-full text-sm ${p === page ? "bg-gold-400 text-[#08130F] font-bold" : "bg-white/[0.04] border border-white/10 text-white/50 hover:bg-white/10"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      </div>

      {/* Edit modal */}
      {editRecord && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={handleCloseEdit}>
          <form
            onSubmit={submitEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-lg p-8 shadow-2xl space-y-5"
          >
            <h3 className="text-2xl font-bold text-white">{t("editHouseholdLabel")} -- {editRecord.code}</h3>
            <input
              value={editForm.address}
              onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
              placeholder={t("householdAddressPlaceholder")}
              className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
            <input
              value={editForm.contact_number}
              onChange={(e) => setEditForm((p) => ({ ...p, contact_number: e.target.value }))}
              placeholder={t("householdContactPlaceholder")}
              className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
            <div className="flex justify-center gap-4 pt-2">
              <button type="button" onClick={handleCloseEdit} className="px-6 py-3 rounded-full border border-white/15 text-white text-base hover:bg-white/10 transition">
                {t("cancelLabel")}
              </button>
              <button
                type="submit"
                disabled={saving || isEditFormUnchanged}
                title={isEditFormUnchanged ? t("noChangesToSaveHint") : undefined}
                className="px-6 py-3 rounded-full bg-gold-400 text-[#08130F] text-base font-bold hover:bg-gold-500 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-gold-400"
              >
                {t("saveChanges")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Unsaved-changes guard for the Edit Household modal */}
      {showEditCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4" onClick={() => setShowEditCancelConfirm(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-500 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-500 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-[#6B7280] mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowEditCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowEditCancelConfirm(false);
                  setEditRecord(null);
                  setConfirmEdit(false);
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
        open={confirmAdd}
        icon={<Plus size={32} />}
        title={t("confirmAddHouseholdTitle")}
        body={t("confirmAddHouseholdBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesAdd")}
        onCancel={() => setConfirmAdd(false)}
        onConfirm={performAdd}
      />

      <ConfirmDialog
        open={confirmEdit}
        icon={<Pencil size={32} />}
        title={t("confirmUpdateHouseholdTitle")}
        body={t("confirmUpdateHouseholdBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setConfirmEdit(false)}
        onConfirm={performEdit}
      />

      {/* Delete confirm modal */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-5">{t("deleteHouseholdConfirm")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("cancel")}</button>
              <button onClick={confirmDelete} disabled={saving} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Success modal (shared template) */}
      {successMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setSuccessMessage(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sage-800 flex justify-center"><CheckCircle size={48} /></div>
            <h3 className="text-xl font-bold text-sage-800 mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {/* Error modal (shared template, red variant) */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><AlertCircle size={48} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
