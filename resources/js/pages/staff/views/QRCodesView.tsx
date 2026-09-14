import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Users, Plus, Pencil, Trash2, Search, CheckCircle, AlertCircle, AlertTriangle, Layers, ChevronRight, ChevronDown, XCircle } from "lucide-react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useLanguage } from "../../../i18n/LanguageContext";


export interface Membership {
  id: string | number;
  name: string;
  description: string;
}

interface AgeBracketOption {
  id: number;
  label: string;
}

interface CivilStatusOption {
  id: number;
  label: string;
}

interface CurrentStatusOption {
  id: number;
  label: string;
}

interface QRCodesViewProps {
  highlightText: (text: string, query: string) => React.ReactNode;
  memberships?: Membership[];
}

// Membership Groups -- the sectoral associations / councils residents can
// belong to (Senior Citizens, SK Youth Council, 4Ps, PWD Federation, etc.).
// Laid out to match the rest of the Residents/Households/Dashboard module:
// same ink/sage palette, same card and search-bar shapes, same modal
// template -- so this screen reads as part of the same product instead of
// an older, differently-themed page bolted on.
export default function QRCodesView({ highlightText }: QRCodesViewProps) {
  const { t } = useLanguage();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [allResidents, setAllResidents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedMembership, setSelectedMembership] = useState<any>(null);
  // Eligibility is only enforced when a resident is first assigned to a
  // gated membership -- nothing re-checks it afterward, so residents can
  // drift out of eligibility over time (aged out of a bracket, status
  // changed) and stay enrolled unnoticed. This lets staff proactively ask.
  const [eligibilityCheck, setEligibilityCheck] = useState<{ membershipId: number; membershipName: string; ineligible: any[] } | null>(null);
  const [checkingEligibilityId, setCheckingEligibilityId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMembership, setEditingMembership] = useState<any>(null);
  const [originalEditMembership, setOriginalEditMembership] = useState<string>("");
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [membershipToDelete, setMembershipToDelete] = useState<{id: number | string, name: string} | null>(null);

  // NEW: Deletion failed modal state
  const [showDeleteFailed, setShowDeleteFailed] = useState(false);
  // Generic error modal -- replaces native alert() for add/edit membership
  // failures so it matches the rest of the app's popup template instead of
  // a jarring native browser dialog.
  const [genericError, setGenericError] = useState<string | null>(null);

  // Success modals
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);
  const [confirmAddMembership, setConfirmAddMembership] = useState(false);
  const [confirmEditMembership, setConfirmEditMembership] = useState(false);

  // Unsaved-changes guard for the Add/Edit Membership modals -- closing
  // (X, Cancel, or clicking the backdrop) while the form differs from
  // where it started asks first instead of silently discarding, matching
  // the same pattern used on the Residents form.
  const [showCancelConfirm, setShowCancelConfirm] = useState<"add" | "edit" | null>(null);

  const emptyMembership = {
    name: "",
    description: "",
    eligibleAgeBracketId: null as number | null,
    eligibleCivilStatusId: null as number | null,
    eligibleCurrentStatusId: null as number | null,
    eligibleGender: "",
  };

  const [newMembership, setNewMembership] = useState<{
    name: string;
    description: string;
    eligibleAgeBracketId: number | null;
    eligibleCivilStatusId: number | null;
    eligibleCurrentStatusId: number | null;
    eligibleGender: string;
  }>(emptyMembership);

  // Adviser example (Senior Citizen eligibility) extended to Youth / Solo
  // Parent: Staff-configurable lists used to optionally gate a membership.
  const [ageBrackets, setAgeBrackets] = useState<AgeBracketOption[]>([]);
  const [civilStatuses, setCivilStatuses] = useState<CivilStatusOption[]>([]);
  const [currentStatuses, setCurrentStatuses] = useState<CurrentStatusOption[]>([]);

  useEffect(() => {
    fetch("/age-brackets", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAgeBrackets(Array.isArray(d) ? d : []))
      .catch((e) => console.error("age brackets load:", e));

    fetch("/civil-statuses", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCivilStatuses(Array.isArray(d) ? d : []))
      .catch((e) => console.error("civil statuses load:", e));

    fetch("/current-statuses", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCurrentStatuses(Array.isArray(d) ? d : []))
      .catch((e) => console.error("current statuses load:", e));
  }, []);

  const itemsPerPage = 6;

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showModal || showAddModal || showEditModal || showDeleteConfirm || showDeleteFailed || showDeleteSuccess || showUpdateSuccess || showAddSuccess || genericError) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal, showAddModal, showEditModal, showDeleteConfirm, showDeleteFailed, showAddSuccess, showDeleteSuccess, showUpdateSuccess, genericError]);

  const fetchMemberships = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/memberships', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const membershipsData = await response.json();
      setMemberships(membershipsData);

    } catch (error) {
      console.error('Error fetching memberships:', error);
      if (!silent) setMemberships([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchAllResidents = async () => {
    try {
      const response = await fetch('/users/all-for-memberships', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const residents = Array.isArray(data) ? data : (data.data || []);
        setAllResidents(residents);
      } else {
        const fallbackResponse = await fetch('/users?per_page=1000', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        if (fallbackResponse.ok) {
          const result = await fallbackResponse.json();
          setAllResidents(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching residents:', error);
      setAllResidents([]);
    }
  };

  const checkEligibility = async (m: any) => {
    setCheckingEligibilityId(m.id);
    try {
      const response = await fetch(`/api/memberships/${m.id}/ineligible-members`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      const result = await response.json();
      setEligibilityCheck({ membershipId: m.id, membershipName: m.name, ineligible: result.ineligible || [] });
    } catch {
      setEligibilityCheck({ membershipId: m.id, membershipName: m.name, ineligible: [] });
    } finally {
      setCheckingEligibilityId(null);
    }
  };

  const handleAddMembership = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!newMembership.name.trim()) errors.name = t("membershipNameRequired");
    if (newMembership.name.length < 3) errors.name = t("membershipNameMinLength");

    setAddFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setGenericError(errors.name);
      return;
    }

    setConfirmAddMembership(true);
  };

  const performAddMembership = async () => {
    setConfirmAddMembership(false);
    setIsSubmitting(true);

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const decodedToken = token ? decodeURIComponent(token) : '';

      const response = await fetch('/api/memberships', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        },
        body: JSON.stringify({
          name: newMembership.name,
          description: newMembership.description,
          eligible_age_bracket_id: newMembership.eligibleAgeBracketId,
          eligible_civil_status_id: newMembership.eligibleCivilStatusId,
          eligible_current_status_id: newMembership.eligibleCurrentStatusId,
          eligible_gender: newMembership.eligibleGender || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        setShowAddModal(false);
        setNewMembership({ name: "", description: "", eligibleAgeBracketId: null, eligibleCivilStatusId: null, eligibleCurrentStatusId: null, eligibleGender: "" });
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
        setShowAddSuccess(true);
      } else {
        setGenericError(result.message || t("addMembershipFailedDefault"));
      }
    } catch (error) {
      console.error('Error adding membership:', error);
      setGenericError(t("addMembershipErrorOccurred"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditMembership = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!editingMembership.name.trim()) errors.name = t("membershipNameRequired");
    if (editingMembership.name.length < 3) errors.name = t("membershipNameMinLength");

    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setGenericError(errors.name);
      return;
    }

    setConfirmEditMembership(true);
  };

  const performEditMembership = async () => {
    setConfirmEditMembership(false);
    setIsSubmitting(true);

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const decodedToken = token ? decodeURIComponent(token) : '';

      const response = await fetch(`/api/memberships/${editingMembership.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        },
        body: JSON.stringify({
          name: editingMembership.name,
          description: editingMembership.description,
          eligible_age_bracket_id: editingMembership.eligibleAgeBracketId,
          eligible_civil_status_id: editingMembership.eligibleCivilStatusId,
          eligible_current_status_id: editingMembership.eligibleCurrentStatusId,
          eligible_gender: editingMembership.eligibleGender || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        setShowEditModal(false);
        setEditingMembership(null);
        setShowUpdateSuccess(true);
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        setGenericError(result.message || t("updateMembershipFailedDefault"));
        // Revert to what's actually saved instead of leaving the
        // rejected edit sitting in the form.
        if (originalEditMembership) setEditingMembership(JSON.parse(originalEditMembership));
      }
    } catch (error) {
      console.error('Error updating membership:', error);
      setGenericError(t("updateMembershipErrorOccurred"));
      if (originalEditMembership) setEditingMembership(JSON.parse(originalEditMembership));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirm = (id: number | string, name: string) => {
    setMembershipToDelete({ id, name });
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!membershipToDelete) return;

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const decodedToken = token ? decodeURIComponent(token) : '';

      const response = await fetch(`/api/memberships/${membershipToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        }
      });

      const result = await response.json();

      if (response.ok) {
        setShowDeleteSuccess(true);
        fetchMemberships();
        fetchAllResidents();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        setShowDeleteFailed(true);
      }
    } catch (error) {
      console.error('Error archiving membership:', error);
      setShowDeleteFailed(true);
    } finally {
      setShowDeleteConfirm(false);
      setMembershipToDelete(null);
    }
  };

  const openEditModal = (membership: any) => {
    const initial = {
      id: membership.id,
      name: membership.name,
      description: membership.description || "",
      eligibleAgeBracketId: membership.eligible_age_bracket_id ?? null,
      eligibleCivilStatusId: membership.eligible_civil_status_id ?? null,
      eligibleCurrentStatusId: membership.eligible_current_status_id ?? null,
      eligibleGender: membership.eligible_gender ?? "",
    };
    setEditingMembership(initial);
    setOriginalEditMembership(JSON.stringify(initial));
    setShowEditModal(true);
  };

  // Nothing to submit if the form still matches what was loaded.
  const isEditMembershipUnchanged = !!editingMembership && JSON.stringify(editingMembership) === originalEditMembership;

  useEffect(() => {
    fetchMemberships();
    fetchAllResidents();

    const handleRefresh = () => {
      fetchMemberships();
      fetchAllResidents();
    };

    window.addEventListener('refreshMemberships', handleRefresh);
    window.addEventListener('resident-updated', handleRefresh);

    return () => {
      window.removeEventListener('refreshMemberships', handleRefresh);
      window.removeEventListener('resident-updated', handleRefresh);
    };
  }, []);

  // Real-time-ish refresh: this app has no websocket/push layer, so a
  // second staff member adding/editing a group elsewhere is picked up here
  // via light polling plus a refetch whenever this tab regains focus or
  // becomes visible again -- instead of only updating on this tab's own
  // actions. A modal open pauses the poll so it never yanks a card out
  // from under an in-progress edit.
  const anyModalOpen = showModal || showAddModal || showEditModal || showDeleteConfirm;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;

  useEffect(() => {
    const poll = setInterval(() => {
      if (anyModalOpenRef.current) return;
      fetchMemberships(true);
    }, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !anyModalOpenRef.current) {
        fetchMemberships(true);
        fetchAllResidents();
      }
    };
    const handleFocus = () => {
      if (!anyModalOpenRef.current) {
        fetchMemberships(true);
        fetchAllResidents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return memberships;
    const q = searchQuery.toLowerCase();
    return memberships.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q)
    );
  }, [memberships, searchQuery]);

  const totalPages = Math.ceil(filteredMemberships.length / itemsPerPage);
  const paginatedMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const getResidentsByMembership = (membershipName: string) => {
    if (!allResidents.length) return [];

    const filtered = allResidents.filter(resident => {
      let residentMembershipNames: string[] = [];

      if (Array.isArray(resident.memberships)) {
        residentMembershipNames = resident.memberships.map((m: any) => m.name || m);
      } else if (resident.memberships && typeof resident.memberships === 'object') {
        residentMembershipNames = [resident.memberships.name];
      } else if (typeof resident.memberships === 'string') {
        residentMembershipNames = resident.memberships.split(',').map((m: string) => m.trim());
      }

      return residentMembershipNames.includes(membershipName);
    });

    return filtered;
  };

  const handleViewMembers = (membership: any) => {
    const residents = getResidentsByMembership(membership.name);
    setSelectedMembership({
      ...membership,
      residents: residents
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMembership(null);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddFormErrors({});
    setNewMembership({
      name: "",
      description: "",
      eligibleAgeBracketId: null,
      eligibleCivilStatusId: null,
      eligibleCurrentStatusId: null,
      eligibleGender: "",
    });
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingMembership(null);
    setEditFormErrors({});
  };

  // Nothing typed yet -- safe to close without asking.
  const hasAddChanges = JSON.stringify(newMembership) !== JSON.stringify(emptyMembership);

  const handleCancelAdd = () => {
    if (hasAddChanges) setShowCancelConfirm("add");
    else closeAddModal();
  };

  const handleCancelEdit = () => {
    if (!isEditMembershipUnchanged) setShowCancelConfirm("edit");
    else closeEditModal();
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setMembershipToDelete(null);
  };

  const closeDeleteFailed = () => {
    setShowDeleteFailed(false);
  };

  const closeGenericError = () => setGenericError(null);
  const handleGenericErrorBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeGenericError();
  };

  const closeAddSuccess = () => setShowAddSuccess(false);
  const closeDeleteSuccess = () => setShowDeleteSuccess(false);
  const closeUpdateSuccess = () => setShowUpdateSuccess(false);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const handleAddBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleCancelAdd();
  };

  const handleEditBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleCancelEdit();
  };

  const handleDeleteBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeDeleteConfirm();
  };

  const handleDeleteFailedBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeDeleteFailed();
  };

  const handleAddSuccessBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeAddSuccess();
  };
  const handleDeleteSuccessBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeDeleteSuccess();
  };
  const handleUpdateSuccessBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeUpdateSuccess();
  };

  // Jump straight from the Edit modal into the same delete-confirm flow
  // used everywhere else, instead of a separate archive icon on the card.
  const handleDeleteFromEditModal = () => {
    if (!editingMembership) return;
    setShowEditModal(false);
    openDeleteConfirm(editingMembership.id, editingMembership.name);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The unsaved-changes prompt itself takes priority -- Escape just
        // dismisses it (equivalent to "Stay"), never discards on its own.
        if (showCancelConfirm) {
          setShowCancelConfirm(null);
          return;
        }
        closeModal();
        if (showAddModal) handleCancelAdd();
        if (showEditModal) handleCancelEdit();
        closeDeleteConfirm();
        closeDeleteFailed();
        closeAddSuccess();
        closeDeleteSuccess();
        closeUpdateSuccess();
        closeGenericError();
      }
    };
    if (showModal || showAddModal || showEditModal || showDeleteConfirm || showDeleteFailed || showAddSuccess || showDeleteSuccess || showUpdateSuccess || genericError || showCancelConfirm) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showModal, showAddModal, showEditModal, showDeleteConfirm, showDeleteFailed, showAddSuccess, showDeleteSuccess, showUpdateSuccess, genericError, showCancelConfirm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("membershipGroupsTitle")}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">{t("membershipGroupsPageSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1A1A] hover:bg-[#2E2E2E] text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" /> {t("newMembershipGroupButton")}
        </button>
      </div>

      <div className="rounded-2xl border border-[#E6E0D3] bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchMembershipsAdminPlaceholder")}
            className="h-11 w-full rounded-xl border border-[#E6E0D3] bg-white pl-11 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage-700" />
        </div>
      ) : filteredMemberships.length === 0 ? (
        <div className="rounded-2xl border border-[#E6E0D3] bg-white p-10 text-center text-sm text-[#6B7280]">
          {t("noMembershipsFoundAdmin")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {paginatedMemberships.map((m) => {
              const residentCount = getResidentsByMembership(m.name).length;
              const hasEligibility = !!(m.eligible_age_bracket?.label || m.eligible_civil_status?.label || m.eligible_current_status?.label || m.eligible_gender);

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[#E6E0D3] bg-white p-5 hover:shadow-md transition-shadow duration-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-50 text-sage-700 shrink-0">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEditModal(m)}
                        className="p-1.5 rounded-full text-[#6B7280] hover:bg-sage-50 hover:text-sage-800 transition"
                        title={t("editMembershipTitle")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#8A3D2C]/10 px-3 py-1 text-xs font-semibold text-[#5C2A1E]">
                        {residentCount} {t("membersBadgeSuffix")}
                      </span>
                    </div>
                  </div>

                  <h2 className="mt-4 text-base font-bold text-[#1A1A1A] break-words">
                    {highlightText(m.name, searchQuery)}
                  </h2>
                  <p className="mt-1 text-sm text-[#6B7280] break-words line-clamp-2">
                    {highlightText(m.description || t("noDescription"), searchQuery)}
                  </p>

                  {hasEligibility && (
                    <p className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-gold-50 border border-gold-100 px-2.5 py-0.5 text-[11px] font-semibold text-gold-700">
                      {t("requiresLabelShort")} {[m.eligible_age_bracket?.label, m.eligible_civil_status?.label, m.eligible_current_status?.label, m.eligible_gender].filter(Boolean).join(" • ")}
                    </p>
                  )}

                  <div className="mt-4 pt-4 border-t border-[#E6E0D3] flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleViewMembers(m)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-sage-700 hover:text-sage-900 hover:underline transition"
                    >
                      {t("viewRosterLabel")} <ChevronRight className="h-4 w-4" />
                    </button>
                    {hasEligibility && (
                      <button
                        onClick={() => checkEligibility(m)}
                        disabled={checkingEligibilityId === m.id}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 hover:underline disabled:opacity-50 shrink-0"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> {checkingEligibilityId === m.id ? t("checkingEligibility") : t("checkEligibilityLabel")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`h-9 w-9 rounded-full text-sm ${p === currentPage ? "bg-sage-800 text-white" : "bg-white border border-sage-200 text-[#6B7280] hover:bg-sage-50"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Roster Modal */}
      {showModal && selectedMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-[#E6E0D3] flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#1A1A1A]">{selectedMembership.name}</h2>
                <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5 line-clamp-2">{selectedMembership.description || t("noDescriptionModal")}</p>
              </div>
              <button onClick={closeModal} className="text-[#6B7280] hover:text-[#1A1A1A] p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-sage-700" />
                <span className="text-sm font-semibold text-[#1A1A1A]">
                  {selectedMembership.residents.length} {t("residentsCountLabel")}
                </span>
              </div>

              {selectedMembership.residents.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-[#6B7280] mb-2">
                    <Users className="h-12 w-12 mx-auto opacity-50" />
                  </div>
                  <p className="text-[#6B7280] text-sm sm:text-base">{t("noResidentsAssigned")}</p>
                  <p className="text-xs text-[#6B7280] mt-2">
                    {t("goToResidentsHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMembership.residents.map((resident: any, idx: number) => (
                    <div
                      key={resident.id || idx}
                      className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-[#FAF9F5] hover:bg-sage-50 transition-all"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-sage-50 border border-sage-200 flex items-center justify-center text-sage-800 font-bold text-sm sm:text-base">
                          {resident.first_name?.charAt(0)}{resident.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-[#1A1A1A] text-sm sm:text-base">
                            {resident.first_name} {resident.last_name}
                          </p>
                          <p className="text-xs text-[#6B7280] font-mono">
                            {resident.user_code || resident.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white px-4 sm:px-6 py-4 border-t border-[#E6E0D3] flex justify-end">
              <button onClick={closeModal} className="bg-sage-800 hover:bg-sage-900 text-white px-4 py-2 rounded-full text-sm font-medium transition">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {eligibilityCheck && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setEligibilityCheck(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-[#E6E0D3] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A1A]">{t("eligibilityCheckTitle")}</h2>
                <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5">{eligibilityCheck.membershipName}</p>
              </div>
              <button onClick={() => setEligibilityCheck(null)} className="text-[#6B7280] hover:text-[#1A1A1A] p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              {eligibilityCheck.ineligible.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-10 w-10 mx-auto text-sage-700 mb-2" />
                  <p className="text-[#6B7280] text-sm">{t("allMembersStillEligible")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gold-700 bg-gold-50 border border-gold-100 rounded-xl px-3 py-2 mb-3">
                    {t("ineligibleMembersFoundHint")}
                  </p>
                  {eligibilityCheck.ineligible.map((r: any) => (
                    <div key={r.id} className="rounded-xl bg-[#FAF9F5] p-3">
                      <p className="font-semibold text-[#1A1A1A] text-sm">{r.name}</p>
                      <p className="text-xs text-[#6B7280] font-mono">{r.user_code}</p>
                      <ul className="mt-1 list-disc list-inside text-xs text-gold-700">
                        {r.reasons.map((reason: string, i: number) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white px-4 sm:px-6 py-4 border-t border-[#E6E0D3] flex justify-end">
              <button onClick={() => setEligibilityCheck(null)} className="bg-sage-800 hover:bg-sage-900 text-white px-4 py-2 rounded-full text-sm font-medium transition">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New Membership Group Modal -- sized and styled to match the Add New
          Record modal (Residents) exactly: same width class, card sections,
          title size, close icon, and button treatment. */}
      {showAddModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddBackdropClick}
        >
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 sm:p-8 shadow-xl border border-[#E6E0D3] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-[#1A1A1A]">{t("newMembershipGroupTitle")}</h2>
              <button onClick={handleCancelAdd} className="text-[#6B7280] hover:text-[#1A1A1A]"><XCircle size={20} /></button>
            </div>
            <p className="text-sm text-[#6B7280] mb-5">{t("newMembershipGroupSubtitle")}</p>

            <form onSubmit={handleAddMembership} noValidate className="space-y-5">
              <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 space-y-4">
                <p className="text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("groupDetailsLabel")}</p>
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
                    {t("groupNameLabel")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newMembership.name}
                    onChange={(e) => setNewMembership(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full rounded-full border px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30 ${
                      addFormErrors.name ? "border-red-500" : "border-sage-200"
                    }`}
                    placeholder={t("groupNamePlaceholder")}
                  />
                  {addFormErrors.name && (
                    <p className="text-red-500 text-xs mt-1">{addFormErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("descriptionLabel")}</label>
                  <textarea
                    value={newMembership.description}
                    onChange={(e) => setNewMembership(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-3xl border border-sage-200 px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30 resize-none"
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("eligibilityRequirementsLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleAgeBracketLabel")}</label>
                    <div className="relative">
                      <select
                        value={newMembership.eligibleAgeBracketId ?? ""}
                        onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleAgeBracketId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {ageBrackets.map((b) => (
                          <option key={b.id} value={b.id}>{b.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleCivilStatusLabel")}</label>
                    <div className="relative">
                      <select
                        value={newMembership.eligibleCivilStatusId ?? ""}
                        onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleCivilStatusId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {civilStatuses.map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleCurrentStatusLabel")}</label>
                    <div className="relative">
                      <select
                        value={newMembership.eligibleCurrentStatusId ?? ""}
                        onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleCurrentStatusId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {currentStatuses.map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleGenderLabel")}</label>
                    <div className="relative">
                      <select
                        value={newMembership.eligibleGender}
                        onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleGender: e.target.value }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        <option value="Male">{t("maleOption")}</option>
                        <option value="Female">{t("femaleOption")}</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition"
                >
                  {t("cancelLabel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 disabled:opacity-50 transition"
                >
                  {isSubmitting ? t("adding") : t("addMembership")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Membership Group Modal -- same treatment as the Add modal above. */}
      {showEditModal && editingMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleEditBackdropClick}
        >
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 sm:p-8 shadow-xl border border-[#E6E0D3] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-[#1A1A1A]">{t("editMembershipGroupTitle")}</h2>
              <button onClick={handleCancelEdit} className="text-[#6B7280] hover:text-[#1A1A1A]"><XCircle size={20} /></button>
            </div>
            <p className="text-sm text-[#6B7280] mb-5">{t("editMembershipGroupSubtitle")}</p>

            <form onSubmit={handleEditMembership} noValidate className="space-y-5">
              <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 space-y-4">
                <p className="text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("groupDetailsLabel")}</p>
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
                    {t("groupNameLabel")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMembership.name}
                    onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, name: e.target.value }))}
                    className={`w-full rounded-full border px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30 ${
                      editFormErrors.name ? "border-red-500" : "border-sage-200"
                    }`}
                    placeholder={t("groupNamePlaceholder")}
                  />
                  {editFormErrors.name && (
                    <p className="text-red-500 text-xs mt-1">{editFormErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("descriptionLabel")}</label>
                  <textarea
                    value={editingMembership.description}
                    onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-3xl border border-sage-200 px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/30 resize-none"
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("eligibilityRequirementsLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleAgeBracketLabel")}</label>
                    <div className="relative">
                      <select
                        value={editingMembership.eligibleAgeBracketId ?? ""}
                        onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleAgeBracketId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {ageBrackets.map((b) => (
                          <option key={b.id} value={b.id}>{b.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleCivilStatusLabel")}</label>
                    <div className="relative">
                      <select
                        value={editingMembership.eligibleCivilStatusId ?? ""}
                        onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleCivilStatusId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {civilStatuses.map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleCurrentStatusLabel")}</label>
                    <div className="relative">
                      <select
                        value={editingMembership.eligibleCurrentStatusId ?? ""}
                        onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleCurrentStatusId: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        {currentStatuses.map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1">{t("eligibleGenderLabel")}</label>
                    <div className="relative">
                      <select
                        value={editingMembership.eligibleGender ?? ""}
                        onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleGender: e.target.value }))}
                        className="w-full appearance-none rounded-full border border-sage-200 px-4 py-2.5 pr-10 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                      >
                        <option value="">{t("anyOptionLabel")}</option>
                        <option value="Male">{t("maleOption")}</option>
                        <option value="Female">{t("femaleOption")}</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDeleteFromEditModal}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2.5 rounded-full transition"
                >
                  <Trash2 className="h-4 w-4" /> {t("deleteGroupLabel")}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition"
                  >
                    {t("cancelLabel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isEditMembershipUnchanged}
                    title={isEditMembershipUnchanged ? t("noChangesToSaveHint") : undefined}
                    className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {isSubmitting ? t("savingLabel") : t("saveChanges")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {createPortal(
        <ConfirmDialog
          open={confirmAddMembership}
          icon={<Plus size={32} />}
          title={t("confirmAddMembershipTitle")}
          body={t("confirmAddMembershipBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={t("yesAdd")}
          onCancel={() => setConfirmAddMembership(false)}
          onConfirm={performAddMembership}
          z={9999}
        />,
        document.body
      )}

      {createPortal(
        <ConfirmDialog
          open={confirmEditMembership}
          icon={<Pencil size={32} />}
          title={t("confirmUpdateMembershipTitle")}
          body={t("confirmUpdateMembershipBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={t("yesUpdate")}
          onCancel={() => setConfirmEditMembership(false)}
          onConfirm={performEditMembership}
          z={9999}
        />,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && membershipToDelete && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <Trash2 size={36} />
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{t("confirmDeletionBody")}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={closeDeleteConfirm}
                className="px-5 py-2 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition"
              >
                {t("cancelLabel")}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
              >
                {t("yesDelete")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Success Modal */}
      {showAddSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddSuccessBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-sage-800 flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-sage-800 mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{t("membershipAddedSuccess")}</p>
            <button
              onClick={closeAddSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Success Modal */}
      {showDeleteSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteSuccessBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-sage-800 flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-sage-800 mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{t("membershipDeletedSuccess")}</p>
            <button
              onClick={closeDeleteSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {showUpdateSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleUpdateSuccessBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-sage-800 flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-sage-800 mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{t("membershipUpdatedSuccess")}</p>
            <button
              onClick={closeUpdateSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Deletion Failed Modal */}
      {showDeleteFailed && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteFailedBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <AlertCircle size={40} />
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("deletionFailedTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{t("membershipInUse")}</p>
            <button
              onClick={closeDeleteFailed}
              className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Generic Error Modal -- replaces native alert() for add/edit failures */}
      {genericError && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleGenericErrorBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <AlertCircle size={40} />
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-[#6B7280] mb-6">{genericError}</p>
            <button
              onClick={closeGenericError}
              className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Cancel Unsaved Changes Confirm Modal -- same pattern as the Residents form */}
      {showCancelConfirm && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCancelConfirm(null);
          }}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-amber-500 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-500 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-[#6B7280] mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  const target = showCancelConfirm;
                  setShowCancelConfirm(null);
                  if (target === "add") closeAddModal();
                  if (target === "edit") closeEditModal();
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
