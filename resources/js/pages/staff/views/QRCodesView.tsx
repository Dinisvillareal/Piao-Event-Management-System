import { scrollListIntoView } from "../../../lib/scrollToList";
import SaveButton from "../../../components/ui/SaveButton";
import FormDrawer, { FormSection } from "../../../components/ui/FormDrawer";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Users, Plus, Pencil, Trash2, Search, CheckCircle, AlertCircle, AlertTriangle, Layers, ChevronRight, ChevronDown, X, Save } from "lucide-react";
import FormSelect from "../../../components/ui/FormSelect";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import { tc } from "../../../lib/contentTranslations";
import PagerSkeleton from "../../../components/ui/PagerSkeleton";


export interface Membership {
  id: string | number;
  name: string;
  description: string;
}

interface AgeBracketOption {
  id: number;
  label: string;
  archived?: boolean;
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

// ---------------------------------------------------------------------------
// Eligibility fields. All four look like the same dropdown. Civil status,
// current status and gender are single-select; age bracket is a multi-select
// dropdown (a program can be open to several age groups, e.g. Youth + Adult).
// Nothing picked = "Any".
// ---------------------------------------------------------------------------
const FIELD_CLASS =
  "w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70";

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: { id: number | string; label: string }[];
}) {
  const { t } = useLanguage();
  return (
    <div>
      <label className="block text-base font-semibold text-white mb-1.5">{label}</label>
      <div className="relative">
        <FormSelect value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS}>
          <option value="" className="bg-[#0A0E1A] text-white">{t("anyOptionLabel")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id} className="bg-[#0A0E1A] text-white">{o.label}</option>
          ))}
        </FormSelect>
      </div>
    </div>
  );
}

function AgeBracketPicker({ options, selected, onChange }: {
  options: AgeBracketOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const summary = options.filter((b) => selected.includes(b.id)).map((b) => tc(b.label, language as any)).join(", ");

  return (
    <div ref={ref} className="relative">
      <label className="block text-base font-semibold text-white mb-1.5">{t("eligibleAgeBracketLabel")}</label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${FIELD_CLASS} relative text-left truncate`}
      >
        {summary || t("anyOptionLabel")}
        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/15 bg-[#0A0E1A] p-1.5 shadow-2xl">
          <button
            type="button"
            role="option"
            aria-selected={selected.length === 0}
            onClick={() => onChange([])}
            className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10"
          >
            {t("anyOptionLabel")}
            {selected.length === 0 && <CheckCircle className="h-4 w-4 text-[#7DD8CB]" />}
          </button>
          {options.map((b) => {
            const on = selected.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(b.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  {tc(b.label, language as any)}
                  {b.archived && <span className="text-[11px] font-bold uppercase text-white/50">{t("ageBracketArchivedTag")}</span>}
                </span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-[#4FBEB0] bg-[#4FBEB0]/30" : "border-white/30"}`}>
                  {on && <CheckCircle className="h-3.5 w-3.5 text-[#7DD8CB]" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-xs text-white/50">{t("eligibleAgeBracketsHint")}</p>
    </div>
  );
}

// Plain-language summary + live count of residents who would qualify, so a
// mistyped rule (e.g. Child + Senior + Widowed) is caught before it is saved.
function EligibilityPreview({ form, membershipId, ageBrackets, civilStatuses, currentStatuses }: {
  form: any;
  membershipId?: number | string;
  ageBrackets: AgeBracketOption[];
  civilStatuses: CivilStatusOption[];
  currentStatuses: CurrentStatusOption[];
}) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<{ qualify: number; total_residents: number; missing_birth_date: number; current_members_no_longer_match: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const ids: number[] = form.eligibleAgeBracketIds ?? [];
  const key = JSON.stringify([ids, form.eligibleCivilStatusId, form.eligibleCurrentStatusId, form.eligibleGender, membershipId ?? null]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const raw = document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1];
        const res = await fetch("/memberships/eligibility-preview", {
          method: "POST",
          credentials: "include",
          signal: ctrl.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": raw ? decodeURIComponent(raw) : "",
          },
          body: JSON.stringify({
            eligible_age_bracket_ids: ids,
            eligible_civil_status_id: form.eligibleCivilStatusId,
            eligible_current_status_id: form.eligibleCurrentStatusId,
            eligible_gender: form.eligibleGender || null,
            membership_id: membershipId ?? null,
          }),
        });
        if (res.ok) setData(await res.json());
      } catch {
        /* aborted or offline: keep the last numbers */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { ctrl.abort(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ageText = ageBrackets.filter((b) => ids.includes(b.id)).map((b) => tc(b.label, language as any)).join(" / ");
  const civil = civilStatuses.find((c) => c.id === form.eligibleCivilStatusId)?.label;
  const current = currentStatuses.find((c) => c.id === form.eligibleCurrentStatusId)?.label;
  const parts = [ageText, civil && tc(civil, language as any), current && tc(current, language as any), form.eligibleGender].filter(Boolean);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm" aria-live="polite">
      <p className="font-semibold text-white">
        {parts.length === 0 ? t("eligOpenToAll") : <>{t("eligOpenTo")} {parts.join(" • ")}</>}
      </p>
      <p className="mt-1 text-white/60">
        {loading && !data ? t("eligChecking") : data ? `${data.qualify} / ${data.total_residents} ${t("eligResidentsQualify")}` : ""}
      </p>
      {data && data.qualify === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-gold-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t("eligNoneQualify")}</p>
      )}
      {data && data.missing_birth_date > 0 && ids.length > 0 && (
        <p className="mt-1.5 text-white/50">{data.missing_birth_date} {t("eligMissingBirth")}</p>
      )}
      {data && data.current_members_no_longer_match > 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-gold-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{data.current_members_no_longer_match} {t("eligWouldLose")}</p>
      )}
    </div>
  );
}

// Membership Groups -- the sectoral associations / councils residents can
// belong to (Senior Citizens, SK Youth Council, 4Ps, PWD Federation, etc.).
// Laid out to match the rest of the Residents/Households/Dashboard module:
// same ink/sage palette, same card and search-bar shapes, same modal
// template -- so this screen reads as part of the same product instead of
// an older, differently-themed page bolted on.
export default function QRCodesView({ highlightText }: QRCodesViewProps) {
  const { t, language } = useLanguage();
  const itemsPerPage = 6;
  const [memberships, setMemberships] = useState<any[]>([]);
  const [allResidents, setAllResidents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash on every page switch, same as Activity Logs --
  // this list paginates client-side so there's nothing to actually wait
  // on, but the flash keeps page switches feeling consistent app-wide.
  const [pageSwitchingRaw, setPageSwitching] = useState(false);
  const filterSwitching = useFilterSwitching([searchQuery]);
  const pageSwitching = pageSwitchingRaw || filterSwitching;
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTopRef = useRef<HTMLSpanElement | null>(null);
  const goToPage = (page: number) => {
    setCurrentPage(page);
    scrollListIntoView(listTopRef.current);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 0);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
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
    eligibleAgeBracketIds: [] as number[],
    eligibleAgeBracketExtra: [] as AgeBracketOption[],
    eligibleCivilStatusId: null as number | null,
    eligibleCurrentStatusId: null as number | null,
    eligibleGender: "",
  };

  const [newMembership, setNewMembership] = useState<{
    name: string;
    description: string;
    eligibleAgeBracketIds: number[];
    eligibleAgeBracketExtra: AgeBracketOption[];
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

  // Search and paging are done by the server (MembershipController::index, paged=1).
  const [membershipMeta, setMembershipMeta] = useState({ total: 0, last_page: 1 });
  const membershipQueryRef = useRef({ search: "", page: 1 });
  membershipQueryRef.current = { search: searchQuery, page: currentPage };
  const membershipSeq = useRef(0);

  const fetchMemberships = async (silent = false) => {
    const seq = ++membershipSeq.current;
    if (!silent) setLoading(true);
    try {
      const q = membershipQueryRef.current;
      const qs = new URLSearchParams({ paged: '1', page: String(q.page), per_page: String(itemsPerPage) });
      if (q.search.trim()) qs.set('search', q.search.trim());
      const response = await fetch(`/api/memberships?${qs.toString()}`, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const body = await response.json();
      if (seq !== membershipSeq.current) return;
      // A page past the end (the last card of a page was deleted): step back.
      if (body.meta.last_page < q.page) {
        setCurrentPage(Math.max(1, body.meta.last_page));
        return;
      }
      setMemberships(body.data ?? []);
      setMembershipMeta({ total: body.meta.total, last_page: body.meta.last_page });

    } catch (error) {
      console.error('Error fetching memberships:', error);
      if (!silent && seq === membershipSeq.current) setMemberships([]);
    } finally {
      if (seq === membershipSeq.current) setLoading(false);
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
          eligible_age_bracket_ids: newMembership.eligibleAgeBracketIds,
          eligible_civil_status_id: newMembership.eligibleCivilStatusId,
          eligible_current_status_id: newMembership.eligibleCurrentStatusId,
          eligible_gender: newMembership.eligibleGender || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        setShowAddModal(false);
        setNewMembership({ name: "", description: "", eligibleAgeBracketIds: [], eligibleAgeBracketExtra: [], eligibleCivilStatusId: null, eligibleCurrentStatusId: null, eligibleGender: "" });
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
          eligible_age_bracket_ids: editingMembership.eligibleAgeBracketIds,
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
      eligibleAgeBracketIds: (membership.eligible_age_brackets ?? []).map((b: any) => Number(b.id)),
      eligibleAgeBracketExtra: (membership.eligible_age_brackets ?? []).map((b: any) => ({ id: Number(b.id), label: b.label, archived: !!b.deleted_at })),
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

  const filteredMemberships = { length: membershipMeta.total };
  const totalPages = Math.max(1, membershipMeta.last_page);
  const paginatedMemberships = memberships;

  // A new search starts again from page 1; any search / page change reloads from the server.
  const membershipFirstLoad = useRef(true);
  const prevSearch = useRef(searchQuery);
  useEffect(() => {
    if (membershipFirstLoad.current) { membershipFirstLoad.current = false; return; }
    if (prevSearch.current !== searchQuery) {
      prevSearch.current = searchQuery;
      if (currentPage !== 1) { setCurrentPage(1); return; }
    }
    const timer = setTimeout(() => fetchMemberships(), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, currentPage]);

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
      eligibleAgeBracketIds: [],
      eligibleAgeBracketExtra: [],
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
      {/* Full-bleed dark navy wrapper -- matches the Dashboard/Residents/
          Households background and palette. Modals further down stay in
          the original light theme, same scoping used on those pages. */}
      <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] dash-canvas p-4 sm:p-8">
      <div className="space-y-6">
      <div className="dash-card flex flex-col justify-between gap-4 rounded-[32px] p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1
            className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl page-title-gradient"
          >
            {t("membershipGroupsTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("membershipGroupsPageSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          disabled={loading || pageSwitching}
          className="btn-live-navy group inline-flex items-center gap-3 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#274A77] hover:bg-[#274A77] hover:shadow-md shrink-0 disabled:pointer-events-none disabled:opacity-50"
        >
          {t("newMembershipGroupButton")}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors duration-500 ease-out group-hover:bg-white/25">
            <Plus className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      <div className="dash-card rounded-[32px] p-4 sm:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchMembershipsAdminPlaceholder")}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-[4.5rem] text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label={t("clearSearchAria")}
              title={t("clearLabel")}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
            >
              {t("clearLabel")}
            </button>
          )}
        </div>
      </div>

      <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
      {loading || pageSwitching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dash-card rounded-[28px] p-5">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-4 w-3/5" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : filteredMemberships.length === 0 ? (
        <div className="dash-card rounded-[32px] p-10 text-center text-sm text-white/50">
          {t("noMembershipsFoundAdmin")}
        </div>
      ) : (
        <div className="space-y-4">
          {totalPages > 1 && ((pageSwitching) ? <PagerSkeleton className="justify-end" /> : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label={t("previousPageLabel")}
                className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                &larr;
              </button>
              <span
                title={`${t("pageOfLabel")} ${currentPage} ${t("ofPagesLabel")} ${totalPages}`}
                className="h-9 w-9 rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] text-white shadow-sm flex items-center justify-center text-sm font-bold"
              >
                {currentPage}
              </span>
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                aria-label={t("nextPageLabel")}
                className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                &rarr;
              </button>
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {paginatedMemberships.map((m) => {
              const residentCount = getResidentsByMembership(m.name).length;
              const hasEligibility = !!((m.eligible_age_brackets?.length > 0) || m.eligible_civil_status?.label || m.eligible_current_status?.label || m.eligible_gender);

              return (
                <div
                  key={m.id}
                  className="dash-card group flex h-full flex-col rounded-[28px] p-5 transition-all duration-300 hover:border-[#4FBEB0]/50 sm:p-6"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2E8E82] text-white shadow-sm">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold leading-snug text-white break-words">
                        {highlightText(tc(m.name, language as any), searchQuery)}
                      </h2>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E8E82]">
                        <Users className="h-3.5 w-3.5" />
                        {residentCount} {t("membersBadgeSuffix")}
                      </p>
                    </div>
                    <button
                      onClick={() => openEditModal(m)}
                      className="dash-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/60 hover:text-white"
                      title={t("editMembershipTitle")}
                      aria-label={t("editMembershipTitle")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-white/55 break-words line-clamp-3">
                    {highlightText(tc(m.description || t("noDescription"), language as any), searchQuery)}
                  </p>

                  {hasEligibility && (
                    <p className="mt-3 inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-gold-400/15 px-2.5 py-1 text-[11px] font-semibold text-gold-300">
                      {t("requiresLabelShort")} {[(m.eligible_age_brackets ?? []).map((b: any) => tc(b.label, language as any)).join(" / "), tc(m.eligible_civil_status?.label, language as any), tc(m.eligible_current_status?.label, language as any), m.eligible_gender].filter(Boolean).join(" • ")}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                    <button
                      onClick={() => handleViewMembers(m)}
                      className="dash-tile inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white/85 transition hover:text-white"
                    >
                      {t("viewRosterLabel")} <ChevronRight className="h-4 w-4 text-[#2E8E82]" />
                    </button>
                    {hasEligibility && (
                      <button
                        onClick={() => checkEligibility(m)}
                        disabled={checkingEligibilityId === m.id}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gold-400/15 px-3.5 text-xs font-semibold text-gold-300 transition hover:bg-gold-400/25 disabled:opacity-50 shrink-0"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> {checkingEligibilityId === m.id ? t("checkingEligibility") : t("checkEligibilityLabel")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
      </div>

      {/* View Roster Modal */}
      {showModal && selectedMembership && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto">
            <div className="bg-[#0A0E1A] px-5 sm:px-7 pt-6 pb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2E8E82] text-white shadow-sm">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white">{tc(selectedMembership.name, language as any)}</h2>
                <p className="text-xs sm:text-sm text-white/50 mt-1 line-clamp-2">{tc(selectedMembership.description || t("noDescriptionModal"), language as any)}</p>
              </div>
              <button onClick={closeModal} aria-label={t("closeLabel")} className="dash-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/60 hover:text-white"><X size={20} /></button>
            </div>

            <div className="px-5 pb-5 sm:px-7 overflow-y-auto max-h-[55vh]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#4FBEB0]/10 px-3.5 py-1.5">
                <Users className="h-4 w-4 text-[#2E8E82]" />
                <span className="text-sm font-semibold text-[#2E8E82]">
                  {selectedMembership.residents.length} {t("residentsCountLabel")}
                </span>
              </div>

              {selectedMembership.residents.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-white/40 mb-2">
                    <Users className="h-12 w-12 mx-auto opacity-50" />
                  </div>
                  <p className="text-white/50 text-sm sm:text-base">{t("noResidentsAssigned")}</p>
                  <p className="text-xs text-white/40 mt-2">
                    {t("goToResidentsHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMembership.residents.map((resident: any, idx: number) => (
                    <div
                      key={resident.id || idx}
                      className="dash-tile flex items-center justify-between rounded-2xl p-3 sm:p-4"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-[#4FBEB0]/10 border border-[#4FBEB0]/20 flex items-center justify-center text-[#4FBEB0] font-bold text-sm sm:text-base">
                          {resident.first_name?.charAt(0)}{resident.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">
                            {resident.first_name} {resident.last_name}
                          </p>
                          <p className="text-xs text-white/40 font-mono">
                            {resident.user_code || resident.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0A0E1A] px-5 sm:px-7 py-5 flex justify-end">
              <button onClick={closeModal} className="bg-gradient-to-r from-[#0B0F14] to-[#18212B] text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-sm transition hover:brightness-125 active:scale-95">
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {eligibilityCheck && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-0"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setEligibilityCheck(null)}
        >
          <div
            className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl relative mx-4 sm:mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0A0E1A] px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{t("eligibilityCheckTitle")}</h2>
                <p className="text-xs sm:text-sm text-white/50 mt-0.5">{tc(eligibilityCheck.membershipName, language as any)}</p>
              </div>
              <button onClick={() => setEligibilityCheck(null)} className="text-white/50 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
              {eligibilityCheck.ineligible.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-10 w-10 mx-auto text-[#4FBEB0] mb-2" />
                  <p className="text-white/50 text-sm">{t("allMembersStillEligible")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gold-300 bg-gold-400/15 rounded-xl px-3 py-2 mb-3">
                    {t("ineligibleMembersFoundHint")}
                  </p>
                  {eligibilityCheck.ineligible.map((r: any) => (
                    <div key={r.id} className="rounded-xl bg-white/[0.04] p-3">
                      <p className="font-semibold text-white text-sm">{r.name}</p>
                      <p className="text-xs text-white/40 font-mono">{r.user_code}</p>
                      <ul className="mt-1 list-disc list-inside text-xs text-gold-300">
                        {r.reasons.map((reason: string, i: number) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0A0E1A] px-4 sm:px-6 py-4 border-t border-white/10 flex justify-end">
              <button onClick={() => setEligibilityCheck(null)} className="bg-sage-700 hover:bg-sage-800 text-white px-4 py-2 rounded-full text-sm font-bold transition">
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
        <FormDrawer
          z="z-[9999]"
          title={t("newMembershipGroupTitle")}
          subtitle={t("newMembershipGroupSubtitle")}
          onClose={handleCancelAdd}
          onSubmit={handleAddMembership}
          footer={<SaveButton className="w-full" active={!isSubmitting && hasAddChanges}>{isSubmitting ? t("adding") : t("addMembership")}</SaveButton>}
        >
          <FormSection title={t("groupDetailsLabel")} className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-white mb-1.5">
                {t("groupNameLabel")} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={newMembership.name}
                onChange={(e) => setNewMembership(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 ${
                  addFormErrors.name ? "border-red-400" : "border-white/25 focus:border-[#4FBEB0]/70"
                }`}
                placeholder={t("groupNamePlaceholder")}
              />
              {addFormErrors.name && (
                <p className="text-red-400 text-xs mt-1">{addFormErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-base font-semibold text-white mb-1.5">{t("descriptionLabel")}</label>
              <textarea
                value={newMembership.description}
                onChange={(e) => setNewMembership(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full rounded-3xl border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 resize-none"
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
          </FormSection>

          <FormSection title={t("eligibilityRequirementsLabel")} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <AgeBracketPicker
                  options={[...ageBrackets, ...(newMembership.eligibleAgeBracketExtra ?? []).filter((x: AgeBracketOption) => !ageBrackets.some((b) => b.id === x.id))]}
                  selected={newMembership.eligibleAgeBracketIds ?? []}
                  onChange={(ids) => setNewMembership((prev) => ({ ...prev, eligibleAgeBracketIds: ids }))}
                />
              </div>
              <SelectField
                label={t("eligibleCivilStatusLabel")}
                value={newMembership.eligibleCivilStatusId}
                options={civilStatuses.map((o) => ({ id: o.id, label: tc(o.label, language as any) }))}
                onChange={(v) => setNewMembership((prev) => ({ ...prev, eligibleCivilStatusId: v ? Number(v) : null }))}
              />
              <SelectField
                label={t("eligibleCurrentStatusLabel")}
                value={newMembership.eligibleCurrentStatusId}
                options={currentStatuses.map((o) => ({ id: o.id, label: tc(o.label, language as any) }))}
                onChange={(v) => setNewMembership((prev) => ({ ...prev, eligibleCurrentStatusId: v ? Number(v) : null }))}
              />
              <SelectField
                label={t("eligibleGenderLabel")}
                value={newMembership.eligibleGender}
                options={[{ id: "Male", label: t("maleOption") }, { id: "Female", label: t("femaleOption") }]}
                onChange={(v) => setNewMembership((prev) => ({ ...prev, eligibleGender: v }))}
              />
            </div>
            <EligibilityPreview
              form={newMembership}
              membershipId={undefined}
              ageBrackets={[...ageBrackets, ...(newMembership.eligibleAgeBracketExtra ?? [])]}
              civilStatuses={civilStatuses}
              currentStatuses={currentStatuses}
            />
          </FormSection>
        </FormDrawer>,
        document.body
      )}

      {/* Edit Membership Group Modal -- same treatment as the Add modal above. */}
      {showEditModal && editingMembership && createPortal(
        <FormDrawer
          z="z-[9999]"
          title={t("editMembershipGroupTitle")}
          subtitle={t("editMembershipGroupSubtitle")}
          onClose={handleCancelEdit}
          onSubmit={handleEditMembership}
          footer={
            <div className="space-y-3">
              <SaveButton className="w-full" active={!isSubmitting && !isEditMembershipUnchanged} title={isEditMembershipUnchanged ? t("noChangesToSaveHint") : undefined}>{isSubmitting ? t("savingLabel") : t("saveChanges")}</SaveButton>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleDeleteFromEditModal}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2.5 rounded-full transition"
                >
                  <Trash2 className="h-4 w-4" /> {t("deleteGroupLabel")}
                </button>
              </div>
            </div>
          }
        >
          <FormSection title={t("groupDetailsLabel")} className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-white mb-1.5">
                {t("groupNameLabel")} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={editingMembership.name}
                onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, name: e.target.value }))}
                className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 ${
                  editFormErrors.name ? "border-red-400" : "border-white/25 focus:border-[#4FBEB0]/70"
                }`}
                placeholder={t("groupNamePlaceholder")}
              />
              {editFormErrors.name && (
                <p className="text-red-400 text-xs mt-1">{editFormErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-base font-semibold text-white mb-1.5">{t("descriptionLabel")}</label>
              <textarea
                value={editingMembership.description}
                onChange={(e) => setEditingMembership((prev: any) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full rounded-3xl border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 resize-none"
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
          </FormSection>

          <FormSection title={t("eligibilityRequirementsLabel")} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <AgeBracketPicker
                  options={[...ageBrackets, ...(editingMembership.eligibleAgeBracketExtra ?? []).filter((x: AgeBracketOption) => !ageBrackets.some((b) => b.id === x.id))]}
                  selected={editingMembership.eligibleAgeBracketIds ?? []}
                  onChange={(ids) => setEditingMembership((prev: any) => ({ ...prev, eligibleAgeBracketIds: ids }))}
                />
              </div>
              <SelectField
                label={t("eligibleCivilStatusLabel")}
                value={editingMembership.eligibleCivilStatusId}
                options={civilStatuses.map((o) => ({ id: o.id, label: tc(o.label, language as any) }))}
                onChange={(v) => setEditingMembership((prev: any) => ({ ...prev, eligibleCivilStatusId: v ? Number(v) : null }))}
              />
              <SelectField
                label={t("eligibleCurrentStatusLabel")}
                value={editingMembership.eligibleCurrentStatusId}
                options={currentStatuses.map((o) => ({ id: o.id, label: tc(o.label, language as any) }))}
                onChange={(v) => setEditingMembership((prev: any) => ({ ...prev, eligibleCurrentStatusId: v ? Number(v) : null }))}
              />
              <SelectField
                label={t("eligibleGenderLabel")}
                value={editingMembership.eligibleGender}
                options={[{ id: "Male", label: t("maleOption") }, { id: "Female", label: t("femaleOption") }]}
                onChange={(v) => setEditingMembership((prev: any) => ({ ...prev, eligibleGender: v }))}
              />
            </div>
            <EligibilityPreview
              form={editingMembership}
              membershipId={editingMembership.id}
              ageBrackets={[...ageBrackets, ...(editingMembership.eligibleAgeBracketExtra ?? [])]}
              civilStatuses={civilStatuses}
              currentStatuses={currentStatuses}
            />
          </FormSection>
        </FormDrawer>,
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
          dark
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
          dark
        />,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && membershipToDelete && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-4 text-red-400 flex justify-center">
              <Trash2 size={36} />
            </div>
            <h3 className="text-lg font-bold text-red-400 mb-2">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("confirmDeletionBody")}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={closeDeleteConfirm}
                className="px-5 py-2 rounded-full border border-white/15 text-white hover:bg-white/10 transition"
              >
                {t("cancelLabel")}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition"
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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[90] px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleAddSuccessBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-[#4FBEB0] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("membershipAddedSuccess")}</p>
            <button
              onClick={closeAddSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white font-bold transition"
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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[90] px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteSuccessBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-[#4FBEB0] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("membershipDeletedSuccess")}</p>
            <button
              onClick={closeDeleteSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white font-bold transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {showUpdateSuccess && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[90] px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleUpdateSuccessBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-[#4FBEB0] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("membershipUpdatedSuccess")}</p>
            <button
              onClick={closeUpdateSuccess}
              className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white font-bold transition"
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleDeleteFailedBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-4 text-red-400 flex justify-center">
              <AlertCircle size={40} />
            </div>
            <h3 className="text-lg font-bold text-red-400 mb-2">{t("deletionFailedTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("membershipInUse")}</p>
            <button
              onClick={closeDeleteFailed}
              className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition"
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleGenericErrorBackdropClick}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-sm p-6 shadow-2xl relative text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-4 text-red-400 flex justify-center">
              <AlertCircle size={40} />
            </div>
            <h3 className="text-lg font-bold text-red-400 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{genericError}</p>
            <button
              onClick={closeGenericError}
              className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition"
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCancelConfirm(null);
          }}
        >
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-gold-300 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-gold-300 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  const target = showCancelConfirm;
                  setShowCancelConfirm(null);
                  if (target === "add") closeAddModal();
                  if (target === "edit") closeEditModal();
                }}
                className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white font-bold transition"
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
