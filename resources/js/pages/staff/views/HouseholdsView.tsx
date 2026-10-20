import { matchesSearch } from "../../../lib/search";
import React, { useEffect, useMemo, useState } from "react";
import { Home, Users, Plus, Pencil, Trash2, Star, UserPlus, X, AlertCircle, AlertTriangle, ChevronDown, Search, Check } from "lucide-react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import { highlightMatches } from "../../../lib/highlight";
import { useLanguage } from "../../../i18n/LanguageContext";
import PagerSkeleton from "../../../components/ui/PagerSkeleton";

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

interface HouseholdAlert {
  id: number;
  code: string;
  address: string | null;
  members_count: number;
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
  // Add Household modal: a head is required, extra members are optional.
  const [addOpen, setAddOpen] = useState(false);
  const [addHeadId, setAddHeadId] = useState<number | null>(null);
  const [addMemberIds, setAddMemberIds] = useState<number[]>([]);
  const [addHeadSearch, setAddHeadSearch] = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [showAddCancelConfirm, setShowAddCancelConfirm] = useState(false);
  // Households with no head of household -- live warning for staff.
  const [alerts, setAlerts] = useState<HouseholdAlert[]>([]);
  const [confirmEdit, setConfirmEdit] = useState(false);
  // Pending household-member action waiting on an "Are you sure?" answer.
  const [memberAction, setMemberAction] = useState<
    | { kind: "add" | "remove" | "head"; household: Household; member: Member }
    | null
  >(null);

  const load = async (searchValue = search, pageValue = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(pageValue) });
      if (searchValue) qs.set("search", searchValue);
      const [list, free, warn] = await Promise.all([
        api(`/households?${qs.toString()}`),
        api(`/households/unassigned`),
        api(`/households/alerts`).catch(() => []),
      ]);
      setAlerts(Array.isArray(warn) ? warn : []);
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

  // Keep the sidebar's red badge in sync the moment a head is added/removed.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("household-alerts", { detail: alerts.length }));
  }, [alerts]);

  const filteredUnassigned = useMemo(() => {
    if (!memberSearch.trim()) return unassigned;
    return unassigned.filter((m) => matchesSearch(memberSearch, fullName(m), m.user_code));
  }, [unassigned, memberSearch]);

  const resetAdd = () => {
    setAddOpen(false);
    setAddHeadId(null);
    setAddMemberIds([]);
    setAddHeadSearch("");
    setAddMemberSearch("");
    setShowAddCancelConfirm(false);
    setConfirmAdd(false);
  };

  const openAdd = () => {
    resetAdd();
    setAddOpen(true);
  };

  const isAddDirty = addHeadId !== null || addMemberIds.length > 0;

  const handleCloseAdd = () => {
    if (isAddDirty) setShowAddCancelConfirm(true);
    else resetAdd();
  };

  const addHead = unassigned.find((m) => m.id === addHeadId) ?? null;

  const headChoices = useMemo(() => {
    if (!addHeadSearch.trim()) return unassigned;
    return unassigned.filter((m) => matchesSearch(addHeadSearch, fullName(m), m.user_code));
  }, [unassigned, addHeadSearch]);

  const memberChoices = useMemo(() => {
    const pool = unassigned.filter((m) => m.id !== addHeadId);
    if (!addMemberSearch.trim()) return pool;
    return pool.filter((m) => matchesSearch(addMemberSearch, fullName(m), m.user_code));
  }, [unassigned, addHeadId, addMemberSearch]);

  const pickHead = (id: number) => {
    setAddHeadId(id);
    // The head is always a member already -- never also list them twice.
    setAddMemberIds((prev) => prev.filter((x) => x !== id));
  };

  const toggleAddMember = (id: number) =>
    setAddMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const performAdd = async () => {
    if (addHeadId === null) return;
    setConfirmAdd(false);
    setSaving(true);
    try {
      // Address/contact number come from the head's resident record
      // (Household::backfillFromHead on the backend).
      await api("/households", {
        method: "POST",
        body: JSON.stringify({ head_user_id: addHeadId, member_ids: [addHeadId, ...addMemberIds] }),
      });
      resetAdd();
      await load();
      setSuccessMessage(t("householdAddedSuccess"));
    } catch (e: any) {
      setConfirmAdd(false);
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
      setSuccessMessage(t("hhMemberAddedSuccess"));
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
      setSuccessMessage(wasHead ? t("removedHeadNowUnassigned") : t("hhMemberRemovedSuccess"));
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
      setSuccessMessage(t("hhHeadUpdatedSuccess"));
    } catch (e: any) {
      setErrorMessage(e?.message || t("setHeadFailed"));
    }
  };

  const runMemberAction = async () => {
    if (!memberAction) return;
    const { kind, household, member } = memberAction;
    setMemberAction(null);
    if (kind === "add") await addMember(household.id, member.id);
    else if (kind === "remove") await removeMember(household.id, member.id, member.is_household_head);
    else await setHead(household.id, member.id);
  };

  const memberActionCopy = (() => {
    if (!memberAction) return null;
    const { kind, household, member } = memberAction;
    const name = fullName(member);
    const currentHead = household.members.find((x) => x.is_household_head && x.id !== member.id);
    const fill = (key: string) =>
      t(key)
        .replace("{name}", name)
        .replace("{head}", currentHead ? fullName(currentHead) : "")
        .replace("{code}", household.code);
    if (kind === "add") {
      return { icon: <UserPlus size={32} />, tone: "brand" as const, title: fill("hhConfirmAddMemberTitle"), body: fill("hhConfirmAddMemberBody"), confirm: t("hhYesAddMember") };
    }
    if (kind === "remove") {
      return {
        icon: <X size={32} />,
        tone: "danger" as const,
        title: fill("hhConfirmRemoveMemberTitle"),
        body: fill(member.is_household_head ? "hhConfirmRemoveHeadBody" : "hhConfirmRemoveMemberBody"),
        confirm: t("hhYesRemoveMember"),
      };
    }
    return {
      icon: <Star size={32} />,
      tone: "brand" as const,
      title: fill(currentHead ? "hhConfirmReplaceHeadTitle" : "hhConfirmSetHeadTitle"),
      body: fill(currentHead ? "hhConfirmReplaceHeadBody" : "hhConfirmSetHeadBody"),
      confirm: t(currentHead ? "hhYesReplaceHead" : "hhYesSetHead"),
    };
  })();

  return (
    <div className="space-y-6">
      {/* Full-bleed dark navy wrapper -- matches the Dashboard/Residents
          background and palette. Modals further down stay in the original
          light theme, same scoping used on the Residents page. */}
      <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("householdsTitle")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("householdsSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={loading}
          className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md shrink-0 disabled:pointer-events-none disabled:opacity-50"
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
      </div>

      {!loading && alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:p-5 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-300">{t("hhAlertBannerTitle").replace("{count}", String(alerts.length))}</p>
            <p className="mt-0.5 text-sm text-white/55">{t("hhAlertBannerBody")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {alerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setSearch(a.code); setExpandedId(a.id); }}
                  title={t("hhAlertAssign")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/20 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 transition"
                >
                  <Home className="h-3.5 w-3.5" /> {a.code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 flex items-center gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
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
                  className="px-5 py-[18px] flex flex-wrap items-center gap-4 cursor-pointer"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4FBEB0]/10 shrink-0">
                    <Home className="h-5 w-5 text-[#4FBEB0]" />
                  </div>
                  <div className="min-w-[140px]">
                    <p className="text-base font-bold text-white">{highlightMatches(h.code, search)}</p>
                    <p className="text-[13.5px] text-white/50">{h.address ? highlightMatches(h.address, search) : t("noAddressOnFile")}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13.5px] text-[#7DD8CB] bg-[#4FBEB0]/10 rounded-full px-3.5 py-1.5">
                    <Users className="h-4 w-4" /> {h.members_count} {t("membersLabel")}
                  </div>
                  {head ? (
                    <span className="inline-flex items-center gap-1 text-[13.5px] font-medium text-gold-300 bg-gold-500/10 rounded-full px-3.5 py-1.5">
                      <Star className="h-4 w-4 fill-gold-300" /> {highlightMatches(fullName(head), search)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[13.5px] font-medium text-amber-300 bg-amber-400/10 border border-amber-400/25 rounded-full px-3.5 py-1.5">
                      <AlertCircle className="h-4 w-4" /> {t("noHeadAssigned")}
                    </span>
                  )}
                  {h.contact_number && (
                    <span className="text-[13.5px] text-white/50">{highlightMatches(h.contact_number, search)}</span>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <ChevronDown
                      className={`h-4 w-4 text-white/30 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="glass-subpanel border-t border-white/10 bg-black/20 px-5 py-4 space-y-3">
                    {h.members.length === 0 ? (
                      <p className="text-sm text-white/50">{t("noMembersYet")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {h.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-full bg-white/[0.05] border border-white/10 pl-3 pr-1.5 py-1.5 text-sm">
                            <span className="font-medium text-white">{highlightMatches(fullName(m), search)}</span>
                            {m.role === "Staff" && (
                              <span className="rounded-full bg-gold-400/15 text-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>
                            )}
                            <span className="text-white/40">{highlightMatches(m.user_code, search)}</span>
                            <button
                              type="button"
                              onClick={() => { if (!m.is_household_head) setMemberAction({ kind: "head", household: h, member: m }); }}
                              title={m.is_household_head ? t("headOfHouseholdTitle") : t("setAsHeadLabel")}
                              className={`p-1 rounded-full ${m.is_household_head ? "text-gold-300" : "text-white/25 hover:text-gold-300"}`}
                            >
                              <Star className={`h-3.5 w-3.5 ${m.is_household_head ? "fill-gold-300" : ""}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMemberAction({ kind: "remove", household: h, member: m })}
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
                          className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50 pr-[4.5rem]"
                        />
                        {memberSearch && (
                          <button
                            type="button"
                            onClick={() => setMemberSearch("")}
                            aria-label="Clear search"
                            title="Clear"
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
                          >
                            {t("clearLabel")}
                          </button>
                        )}
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {filteredUnassigned.length === 0 ? (
                            <p className="text-sm text-white/40 px-2 py-1">{t("noUnassignedResidents")}</p>
                          ) : (
                            filteredUnassigned.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setMemberAction({ kind: "add", household: h, member: m })}
                                className="w-full text-left text-sm px-3 py-2 rounded-full hover:bg-white/[0.06] flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-1.5 text-white">
                                  {highlightMatches(fullName(m), memberSearch)}
                                  {m.role === "Staff" && (
                                    <span className="rounded-full bg-gold-400/15 text-gold-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>
                                  )}
                                </span>
                                <span className="text-white/40">{highlightMatches(m.user_code, memberSearch)}</span>
                              </button>
                            ))
                          )}
                        </div>
                        <button type="button" onClick={() => { setPickerFor(null); setMemberSearch(""); }} className="text-sm text-white/40 hover:text-white px-2">
                          {t("cancelLabel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setPickerFor(h.id)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4FBEB0] hover:text-[#7DD8CB]"
                        >
                          <UserPlus className="h-4 w-4" /> {t("addMemberLabel")}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(h); }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            title={t("editLabel")}
                          >
                            <Pencil className="h-4 w-4" /> {t("editLabel")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteRecord(h); }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                            title={t("deleteTitle")}
                          >
                            <Trash2 className="h-4 w-4" /> {t("deleteTitle")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {lastPage > 1 && ((loading) ? <PagerSkeleton className="justify-center pt-2" /> : (
            <div className="flex justify-center gap-2 pt-2">
              {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-9 w-9 rounded-full text-sm ${p === page ? "bg-sage-700 text-white shadow-sm font-bold" : "bg-white/[0.04] border border-white/10 text-white/50 hover:bg-white/10"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      </div>
      </div>

      {/* Add Household modal -- a head is required, members optional */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={handleCloseAdd}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-3xl p-7 sm:p-10 shadow-2xl space-y-6 max-h-[90dvh] overflow-y-auto"
          >
            <div>
              <h3 className="text-3xl font-bold text-white">{t("addHouseholdLabel")}</h3>
              <p className="mt-1.5 text-base text-white/50">{t("hhAddModalSubtitle")}</p>
            </div>

            {/* Head (required) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-gold-300" />
                <p className="text-base font-bold text-white">{t("hhHeadSectionLabel")}</p>
                <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-300">{t("hhRequiredBadge")}</span>
              </div>
              {addHead && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/10 border border-gold-400/25 pl-3.5 pr-2 py-1.5 text-base font-medium text-gold-300">
                  <Star className="h-3.5 w-3.5 fill-gold-300" /> {fullName(addHead)}
                  <button type="button" onClick={() => setAddHeadId(null)} className="p-1 rounded-full hover:text-white" aria-label="Clear head"><X className="h-3.5 w-3.5" /></button>
                </span>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={addHeadSearch}
                  onChange={(e) => setAddHeadSearch(e.target.value)}
                  placeholder={t("hhSearchHeadPlaceholder")}
                  className="h-[52px] w-full rounded-full border border-white/10 bg-white/[0.03] pl-12 pr-5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 space-y-1">
                {headChoices.length === 0 ? (
                  <p className="px-4 py-2.5 text-base text-white/40">{unassigned.length === 0 ? t("hhNoAvailableResidents") : t("noUnassignedResidents")}</p>
                ) : headChoices.map((m) => {
                  const on = m.id === addHeadId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickHead(m.id)}
                      className={`w-full flex items-center justify-between gap-2 rounded-full px-4 py-2.5 text-left text-base transition ${on ? "bg-gold-500/15 text-gold-300" : "text-white hover:bg-white/[0.06]"}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {on ? <Star className="h-4 w-4 fill-gold-300 shrink-0" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" />}
                        <span className="truncate">{highlightMatches(fullName(m), addHeadSearch)}</span>
                        {m.role === "Staff" && <span className="rounded-full bg-gold-400/15 text-gold-300 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>}
                      </span>
                      <span className="text-white/40 shrink-0">{m.user_code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Members (optional) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#4FBEB0]" />
                <p className="text-base font-bold text-white">{t("hhMembersSectionLabel")}</p>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white/60">{t("hhOptionalBadge")}</span>
                {addMemberIds.length > 0 && <span className="text-xs text-[#7DD8CB]">{addMemberIds.length} {t("hhSelectedCount")}</span>}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  placeholder={t("hhSearchMembersPlaceholder")}
                  disabled={addHeadId === null}
                  className="h-[52px] w-full rounded-full border border-white/10 bg-white/[0.03] pl-12 pr-5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50 disabled:opacity-50"
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 space-y-1">
                {addHeadId === null ? (
                  <p className="px-4 py-2.5 text-base text-white/40">{t("hhChooseHeadError")}</p>
                ) : memberChoices.length === 0 ? (
                  <p className="px-4 py-2.5 text-base text-white/40">{t("noUnassignedResidents")}</p>
                ) : memberChoices.map((m) => {
                  const on = addMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAddMember(m.id)}
                      className={`w-full flex items-center justify-between gap-2 rounded-full px-4 py-2.5 text-left text-base transition ${on ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : "text-white hover:bg-white/[0.06]"}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${on ? "border-[#4FBEB0] bg-[#4FBEB0]" : "border-white/25"}`}>
                          {on && <Check className="h-3 w-3 text-[#0A0E1A]" />}
                        </span>
                        <span className="truncate">{highlightMatches(fullName(m), addMemberSearch)}</span>
                        {m.role === "Staff" && <span className="rounded-full bg-gold-400/15 text-gold-300 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{t("staffBadge")}</span>}
                      </span>
                      <span className="text-white/40 shrink-0">{m.user_code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm text-white/40">{t("hhAutoFillNote")}</p>

            <div className="flex justify-center gap-4 pt-1">
              <button type="button" onClick={handleCloseAdd} className="px-8 py-3.5 rounded-full border border-white/15 text-white text-base hover:bg-white/10 transition">
                {t("cancelLabel")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAdd(true)}
                disabled={saving || addHeadId === null}
                title={addHeadId === null ? t("hhChooseHeadError") : undefined}
                className="px-8 py-3.5 rounded-full bg-sage-700 text-white text-base font-bold hover:bg-sage-800 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-sage-700"
              >
                {t("hhCreateHousehold")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showAddCancelConfirm}
        icon={<AlertTriangle size={36} />}
        title={t("unsavedChangesTitle")}
        body={t("unsavedChangesMessage")}
        cancelLabel={t("stayButton")}
        confirmLabel={t("discardCloseButton")}
        onCancel={() => setShowAddCancelConfirm(false)}
        onConfirm={resetAdd}
        z={80}
      />

      {/* Edit modal */}
      {editRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={handleCloseEdit}>
          <form
            onSubmit={submitEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-lg p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
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
                className="px-6 py-3 rounded-full bg-sage-700 text-white text-base font-bold hover:bg-sage-800 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-sage-700"
              >
                {t("saveChanges")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Unsaved-changes guard for the Edit Household modal */}
      {showEditCancelConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] px-4" onClick={() => setShowEditCancelConfirm(false)}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowEditCancelConfirm(false)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
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
        body={t("hhConfirmCreateBody")
          .replace("{head}", addHead ? fullName(addHead) : "")
          .replace("{count}", String(1 + addMemberIds.length))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesAdd")}
        onCancel={() => setConfirmAdd(false)}
        onConfirm={performAdd}
        z={80}
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

      <ConfirmDialog
        open={!!memberAction && !!memberActionCopy}
        icon={memberActionCopy?.icon ?? <UserPlus size={32} />}
        tone={memberActionCopy?.tone}
        title={memberActionCopy?.title ?? ""}
        body={memberActionCopy?.body ?? ""}
        cancelLabel={t("cancelLabel")}
        confirmLabel={memberActionCopy?.confirm}
        onCancel={() => setMemberAction(null)}
        onConfirm={runMemberAction}
      />

      {/* Delete confirm modal */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-4 text-red-400 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-xl font-bold text-red-400 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-5">{t("deleteHouseholdConfirm")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancel")}</button>
              <button onClick={confirmDelete} disabled={saving} className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}

      <StatusModal open={!!successMessage} type="success" title={t("successTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} />
      <StatusModal open={!!errorMessage} type="error" title={t("errorTitle")} message={errorMessage || ""} okLabel={t("okLabel")} onClose={() => setErrorMessage(null)} />
    </div>
  );
}
