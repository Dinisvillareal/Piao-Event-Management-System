import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, Plus, Pencil, Trash2, Search, Archive, CheckCircle, AlertTriangle } from "lucide-react";
import { Button, Input } from "../../../components/ui/Core";
import SearchBar from "../../../components/ui/SearchBar";
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

  // ✅ NEW: Success modals
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
  }, [showModal, showAddModal, showEditModal, showDeleteConfirm, showDeleteFailed, showDeleteSuccess, showAddSuccess, showUpdateSuccess, genericError]);

  const fetchMemberships = async () => {
    setLoading(true);
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
      setMemberships([]);
    } finally {
      setLoading(false);
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
        // ✅ NO MORE BROWSER ALERT — use your modal!
        setShowAddModal(false);
        setNewMembership({ name: "", description: "", eligibleAgeBracketId: null, eligibleCivilStatusId: null, eligibleCurrentStatusId: null, eligibleGender: "" });
        fetchMemberships();
        window.dispatchEvent(new Event('refreshMemberships'));
        setShowAddSuccess(true); // <-- YOUR MODAL SHOWS
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

  // UPDATED: Now handles success AND failure with modals
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
        // ✅ Show success popup instead of alert
        setShowDeleteSuccess(true);
        fetchMemberships();
        fetchAllResidents();
        window.dispatchEvent(new Event('refreshMemberships'));
      } else {
        // Show failure modal instead of alert
        setShowDeleteFailed(true);
      }
    } catch (error) {
      console.error('Error archiving membership:', error);
      // Show failure modal on error too
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

  // ✅ Close success modals
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Fixed Header — reduced left padding */}
      <div className="flex-shrink-0 bg-[#fcfcf9] pt-2 pb-4 px-2 shadow-b-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("memberships")}</h1>
            <p className="text-xs sm:text-sm text-[#667777] mt-1">{t("membershipsSubtitle")}</p>
          </div>
        </div>
        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70" />
          <SearchBar value={searchQuery} onChange={(value: string) => setSearchQuery(value)} placeholder={t("searchMembershipsAdminPlaceholder")} />
        </div>
        <p className="mt-2 mb-6 text-xs text-gray-500">
          {filteredMemberships.length} {t("membershipsFoundCountAdmin")}
        </p>

        {/* Pagination on LEFT, Add Button on RIGHT - same row */}
        <div className="flex items-center justify-between">
          {/* LEFT - Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                ←
              </button>

              <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                {currentPage}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                →
              </button>
            </div>
          )}

          {/* RIGHT - Add Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#005f63] hover:bg-[#004a4d] text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-medium transition shadow-sm items-center gap-2 text-sm sm:text-base ml-auto"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> {t("addNewMembership")}
            </div>
          </button>
        </div>
      </div>

      {/* Scrollable Content — reduced left padding */}
      <div className="flex-1 overflow-y-auto px-2 pb-20 sm:pb-6">
        {filteredMemberships.length === 0 ? (
          <p className="text-center text-gray-500 py-12">{t("noMembershipsFoundAdmin")}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {paginatedMemberships.map((m) => {
              const residentCount = getResidentsByMembership(m.name).length;

              return (
                <div
                  key={m.id}
                  className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white overflow-hidden shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300 w-full"
                >
                  <div className="h-1.5 bg-gradient-to-r from-[#fdde8a] via-[#e2964f] to-[#91f0f3]"></div>
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-base font-bold text-[#006666] break-words">
                          {highlightText(m.name, searchQuery)}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#667777] mt-1 break-words line-clamp-2 sm:line-clamp-none">
                          {highlightText(m.description || t("noDescription"), searchQuery)}
                        </p>
                        {(m.eligible_age_bracket?.label || m.eligible_civil_status?.label || m.eligible_current_status?.label || m.eligible_gender) && (
                          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-teal-700">
                            {t("requiresLabelShort")} {[m.eligible_age_bracket?.label, m.eligible_civil_status?.label, m.eligible_current_status?.label, m.eligible_gender].filter(Boolean).join(" • ")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEditModal(m)}
                          className="p-2 rounded-full hover:bg-orange-50 transition text-orange-600 active:bg-orange-100"
                          title={t("editMembershipTitle")}
                        >
                          <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openDeleteConfirm(m.id, m.name)}
                          className="p-2 rounded-full hover:bg-amber-50 transition text-red-400 active:bg-amber-100"
                          title={t("archiveMembershipTitle")}
                        >
                          <Archive className="h-4 w-4 text-red-500"/>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 sm:mt-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 sm:pt-4 mt-2 border-t border-gray-100">
                        <div className="text-left">
                          <p className="sm:text-xs font-semibold uppercase tracking-wider text-gray-500">{t("totalMembersLabel")}</p>
                          <p className="font-medium text-gray-800 mt-0.5 text-sm sm:text-sm">{residentCount} {t("residentCountLabel")}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-teal-500/30 text-teal-700 hover:bg-teal-50 w-full sm:w-auto justify-center"
                          onClick={() => handleViewMembers(m)}
                        >
                          <Users className="mr-1 h-5 w-3.5" /> {t("viewMembers")} ({residentCount})
                        </Button>
                        {(m.eligible_age_bracket?.label || m.eligible_civil_status?.label || m.eligible_current_status?.label || m.eligible_gender) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-amber-500/30 text-amber-700 hover:bg-amber-50 w-full sm:w-auto justify-center"
                            onClick={() => checkEligibility(m)}
                            disabled={checkingEligibilityId === m.id}
                          >
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> {checkingEligibilityId === m.id ? t("checkingEligibility") : t("checkEligibilityLabel")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="sm:hidden fixed bottom-6 right-6 z-[45] bg-[#005f63] hover:bg-[#004a4d] text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
        aria-label={t("addNewMembershipAria")}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* View Members Modal */}
      {showModal && selectedMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">{selectedMembership.name}</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 line-clamp-2">{selectedMembership.description || t("noDescriptionModal")}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-semibold text-gray-700">
                  {selectedMembership.residents.length} {t("residentsCountLabel")}
                </span>
              </div>

              {selectedMembership.residents.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-gray-400 mb-2">
                    <Users className="h-12 w-12 mx-auto opacity-50" />
                  </div>
                  <p className="text-gray-500 text-sm sm:text-base">{t("noResidentsAssigned")}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {t("goToResidentsHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMembership.residents.map((resident: any, idx: number) => (
                    <div
                      key={resident.id || idx}
                      className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-gray-50 hover:bg-teal-50 transition-all active:bg-teal-100"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm sm:text-base">
                          {resident.first_name?.charAt(0)}{resident.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm sm:text-base">
                            {resident.first_name} {resident.last_name}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {resident.user_code || resident.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white px-4 sm:px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={closeModal} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 rounded-full text-sm font-medium transition active:scale-95">
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
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{t("eligibilityCheckTitle")}</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{eligibilityCheck.membershipName}</p>
              </div>
              <button onClick={() => setEligibilityCheck(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              {eligibilityCheck.ineligible.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-10 w-10 mx-auto text-teal-600 mb-2" />
                  <p className="text-gray-600 text-sm">{t("allMembersStillEligible")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                    {t("ineligibleMembersFoundHint")}
                  </p>
                  {eligibilityCheck.ineligible.map((r: any) => (
                    <div key={r.id} className="rounded-xl bg-gray-50 p-3">
                      <p className="font-semibold text-gray-800 text-sm">{r.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.user_code}</p>
                      <ul className="mt-1 list-disc list-inside text-xs text-amber-700">
                        {r.reasons.map((reason: string, i: number) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white px-4 sm:px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setEligibilityCheck(null)} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 rounded-full text-sm font-medium transition active:scale-95">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Membership Modal */}
      {showAddModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddBackdropClick}
        >
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl relative">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">{t("addNewMembership")}</h2>
              <button onClick={handleCancelAdd} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddMembership} noValidate className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("membershipNameLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newMembership.name}
                  onChange={(e) => setNewMembership(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base ${
                    addFormErrors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder={t("membershipNamePlaceholder")}
                />
                {addFormErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{addFormErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
                <textarea
                  value={newMembership.description}
                  onChange={(e) => setNewMembership(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-3xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none text-sm sm:text-base"
                  placeholder={t("descriptionPlaceholder")}
                />
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("eligibilityRequirementsLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleAgeBracketLabel")}</label>
                    <select
                      value={newMembership.eligibleAgeBracketId ?? ""}
                      onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleAgeBracketId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {ageBrackets.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleCivilStatusLabel")}</label>
                    <select
                      value={newMembership.eligibleCivilStatusId ?? ""}
                      onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleCivilStatusId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {civilStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleCurrentStatusLabel")}</label>
                    <select
                      value={newMembership.eligibleCurrentStatusId ?? ""}
                      onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleCurrentStatusId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {currentStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleGenderLabel")}</label>
                    <select
                      value={newMembership.eligibleGender}
                      onChange={(e) => setNewMembership(prev => ({ ...prev, eligibleGender: e.target.value }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      <option value="Male">{t("maleOption")}</option>
                      <option value="Female">{t("femaleOption")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition active:bg-gray-100"
                >
                  {t("cancelLabel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] disabled:opacity-50 transition active:scale-95"
                >
                  {isSubmitting ? t("adding") : t("addMembership")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Membership Modal */}
      {showEditModal && editingMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleEditBackdropClick}
        >
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl relative">
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">{t("editMembershipTitle")}</h2>
              <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditMembership} noValidate className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("membershipNameLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingMembership.name}
                  onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base ${
                    editFormErrors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder={t("membershipNamePlaceholder")}
                />
                {editFormErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{editFormErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
                <textarea
                  value={editingMembership.description}
                  onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-3xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 resize-none text-sm sm:text-base"
                  placeholder={t("descriptionPlaceholder")}
                />
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("eligibilityRequirementsLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleAgeBracketLabel")}</label>
                    <select
                      value={editingMembership.eligibleAgeBracketId ?? ""}
                      onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleAgeBracketId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {ageBrackets.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleCivilStatusLabel")}</label>
                    <select
                      value={editingMembership.eligibleCivilStatusId ?? ""}
                      onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleCivilStatusId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {civilStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleCurrentStatusLabel")}</label>
                    <select
                      value={editingMembership.eligibleCurrentStatusId ?? ""}
                      onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleCurrentStatusId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {currentStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("eligibleGenderLabel")}</label>
                    <select
                      value={editingMembership.eligibleGender ?? ""}
                      onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, eligibleGender: e.target.value }))}
                      className="w-full rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 text-sm sm:text-base"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      <option value="Male">{t("maleOption")}</option>
                      <option value="Female">{t("femaleOption")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition active:bg-gray-100"
                >
                  {t("cancelLabel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isEditMembershipUnchanged}
                  title={isEditMembershipUnchanged ? t("noChangesToSaveHint") : undefined}
                  className="px-4 py-2 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-95"
                >
                  {isSubmitting ? t("savingLabel") : t("saveChanges")}
                </button>
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

      {/* Delete Confirmation Modal — exactly like your example */}
      {showDeleteConfirm && membershipToDelete && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteBackdropClick}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("confirmDeletionBody")}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={closeDeleteConfirm}
                className="px-5 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
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

      {/* ✅ Add Success Modal — YOUR DESIGN */}
      {showAddSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddSuccessBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("membershipAddedSuccess")}</p>
            <button
              onClick={closeAddSuccess}
              className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ✅ Delete Success Modal — YOUR DESIGN */}
      {showDeleteSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteSuccessBackdropClick}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("membershipDeletedSuccess")}</p>
            <button
              onClick={closeDeleteSuccess}
              className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
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
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("membershipUpdatedSuccess")}</p>
            <button
              onClick={closeUpdateSuccess}
              className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Deletion Failed Modal — exactly your required message */}
      {showDeleteFailed && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteFailedBackdropClick}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("deletionFailedTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("membershipInUse")}</p>
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
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{genericError}</p>
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
            <p className="text-gray-600 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">{t("stayButton")}</button>
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
