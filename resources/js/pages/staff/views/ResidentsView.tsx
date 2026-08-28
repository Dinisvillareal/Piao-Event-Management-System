import React, { useState, useMemo, useEffect } from "react";
import { Filter, XCircle, Archive, CheckCircle } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import { useLanguage } from "../../../i18n/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Membership {
  id: number;
  name: string;
}

interface CivilStatusOption {
  id: number;
  label: string;
}

interface ResidentRow {
  id: string;
  real_id: number;
  lastName: string;
  firstName: string;
  middleName: string;
  contactNumber: string;
  memberships: string;
  role: string;
  hasAccount: boolean;
  password: string;
  passwordChangedByUser: boolean;
  photo: string;
  deleted_at: string | null;
  birthDate: string;
  address: string;
  age: number | null;
  ageGroup: string | null;
  civilStatusId: number | null;
  civilStatus: string | null;
  isHouseholdHead: boolean;
  householdCode: string;
  householdContactNumber: string;
}

type AddForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  contactNumber: string;
  role: string;
  hasMemberships: boolean;
  selectedMemberships: number[];
  needAccount: boolean;
  tempPassword: string;
  birthDate: string;
  address: string;
  civilStatusId: number | null;
  isHouseholdHead: boolean;
  householdCode: string;
  householdContactNumber: string;
};

type EditForm = {
  real_id: number;
  firstName: string;
  middleName: string;
  lastName: string;
  contactNumber: string;
  role: string;
  hasAccount: boolean;
  password: string;
  passwordChangedByUser: boolean;
  hasMemberships: boolean;
  selectedMemberships: number[];
  deleted_at: string | null;
  needAccount: boolean;
  tempPassword: string;
  birthDate: string;
  address: string;
  civilStatusId: number | null;
  isHouseholdHead: boolean;
  householdCode: string;
  householdContactNumber: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const csrfToken = () =>
  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";

const capitalizeName = (v: string) =>
  v
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const formatContactNumber = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
};

const displayContact = (num: string) => formatContactNumber(num);

const safeParseJson = async (res: Response): Promise<any> => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: `Server error (${res.status}). Please check Laravel logs.` };
  }
};

const BADGE_COLORS = [
  "bg-teal-50 text-teal-800",
  "bg-orange-50 text-orange-800",
  "bg-blue-50 text-blue-800",
  "bg-purple-50 text-purple-800",
  "bg-amber-50 text-amber-800",
  "bg-emerald-50 text-emerald-800",
];

const getMembershipBadgeStyle = (name: string) =>
  BADGE_COLORS[name.length % BADGE_COLORS.length];

const highlightText = (text: string | null | undefined, query: string) => {
  const safe = text ?? "";
  if (!query.trim()) return safe;
  try {
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return safe.split(re).map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return safe;
  }
};

const emptyAdd = (): AddForm => ({
  firstName: "",
  middleName: "",
  lastName: "",
  contactNumber: "",
  role: "",
  hasMemberships: false,
  selectedMemberships: [],
  needAccount: false,
  tempPassword: "",
  birthDate: "",
  address: "",
  civilStatusId: null,
  isHouseholdHead: false,
  householdCode: "",
  householdContactNumber: "",
});

const AGE_GROUPS = [
  { key: "all", labelKey: "ageGroupAllOption" },
  { key: "child", labelKey: "ageGroupChildOption" },
  { key: "youth", labelKey: "ageGroupYouthOption" },
  { key: "adult", labelKey: "ageGroupAdultOption" },
  { key: "senior", labelKey: "ageGroupSeniorOption" },
];

const AGE_GROUP_LABELS: Record<string, string> = {
  child: "Child",
  youth: "Youth",
  adult: "Adult",
  senior: "Senior Citizen",
};

// ─── Normalize helper for duplicate checking ──────────────────────────────────
const normalizeName = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResidentsView() {
  const { t } = useLanguage();
  const [residentsData, setResidentsData] = useState<ResidentRow[]>([]);
  const [availableMemberships, setAvailableMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [residentSearch, setResidentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [ageGroupFilter, setAgeGroupFilter] = useState("all"); // Adviser: Profiling / Filter for Age
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [showAddForm, setShowAddForm] = useState(false);
  const [viewRecord, setViewRecord] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<string | null>(null);
  const [restoreRecord, setRestoreRecord] = useState<number | null>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [showRoleChangedModal, setShowRoleChangedModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);

  const [newResident, setNewResident] = useState<AddForm>(emptyAdd());
  const [addPhotoFile, setAddPhotoFile] = useState<File | null>(null);
  const [addPhotoPreview, setAddPhotoPreview] = useState("");

  const [editingResident, setEditingResident] = useState<EditForm | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState("");
  const [editPhotoChanged, setEditPhotoChanged] = useState(false);

  const currentUserId = useMemo<number | null>(() => {
    const sessionUser = sessionStorage.getItem("user");
    if (sessionUser) {
      try { return JSON.parse(sessionUser)?.id ?? null; } catch { return null; }
    }
    const localUser = localStorage.getItem("user");
    if (localUser) {
      try { return JSON.parse(localUser)?.id ?? null; } catch { return null; }
    }
    return null;
  }, []);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [initialAddData, setInitialAddData] = useState("");
  const [initialEditData, setInitialEditData] = useState("");

  const hasAddChanges = useMemo(
    () => JSON.stringify(newResident) !== initialAddData || addPhotoFile !== null,
    [newResident, initialAddData, addPhotoFile]
  );

  const hasEditChanges = useMemo(
    () => JSON.stringify(editingResident) !== initialEditData || editPhotoChanged,
    [editingResident, initialEditData, editPhotoChanged]
  );

  // ─── Fetch memberships ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/memberships", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: any) => {
        const list: Membership[] = Array.isArray(d) ? d : d.data ?? [];
        setAvailableMemberships(list);
      })
      .catch((e) => console.error("memberships load:", e));
  }, []);

  // ─── Fetch civil / current statuses (Adviser example: Senior Citizen ─────
  // eligibility, extended to a Staff-configurable Civil Status list so
  // "Solo Parent" and similar categories can be assigned to residents) ─────
  const [civilStatuses, setCivilStatuses] = useState<CivilStatusOption[]>([]);
  useEffect(() => {
    fetch("/civil-statuses", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CivilStatusOption[]) => setCivilStatuses(Array.isArray(d) ? d : []))
      .catch((e) => console.error("civil statuses load:", e));
  }, []);

  // ─── Fetch residents ──────────────────────────────────────────────────────
  const fetchResidents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/membership-residents", {
        headers: { Accept: "application/json" },
      });
      const data = await res.json();

      const formatted: ResidentRow[] = data.map((item: any) => ({
        id: item.user_code,
        real_id: item.user_id,
        lastName: item.last_name,
        firstName: item.first_name,
        middleName: item.middle_name ?? "",
        contactNumber: displayContact(item.contact_number ?? ""),
        memberships: (item.memberships ?? []).map((m: any) => m.name).join(", "),
        role: item.role,
        hasAccount: !!item.has_account,
        password: "",
        passwordChangedByUser: !!item.password_changed_by_user,
        photo: item.validation_id_url,
        deleted_at: item.deleted_at,
        birthDate: item.birth_date ?? "",
        address: item.address ?? "",
        age: item.age ?? null,
        ageGroup: item.age_group ?? null,
        civilStatusId: item.civil_status_id ?? null,
        civilStatus: item.civil_status ?? null,
        isHouseholdHead: !!item.is_household_head,
        householdCode: item.household_code ?? "",
        householdContactNumber: item.household_contact_number ?? "",
      }));

      setResidentsData(formatted);
    } catch (e) {
      console.error("residents load:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, []);

  // ─── Photo handlers ───────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(t("uploadImageOnly"));
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = ev.target?.result as string;
      if (isEdit) {
        setEditPhotoFile(file);
        setEditPhotoPreview(preview);
        setEditPhotoChanged(true);
      } else {
        setAddPhotoFile(file);
        setAddPhotoPreview(preview);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = (isEdit = false) => {
    if (isEdit) {
      setEditPhotoFile(null);
      setEditPhotoPreview("");
      setEditPhotoChanged(true);
    } else {
      setAddPhotoFile(null);
      setAddPhotoPreview("");
    }
  };

  // ─── Membership toggle ────────────────────────────────────────────────────
  const toggleMembership = (id: number, isEdit = false) => {
    if (isEdit) {
      setEditingResident((p) => {
        if (!p) return p;
        const sel = p.selectedMemberships.includes(id)
          ? p.selectedMemberships.filter((x) => x !== id)
          : [...p.selectedMemberships, id];
        return { ...p, selectedMemberships: sel };
      });
    } else {
      setNewResident((p) => {
        const sel = p.selectedMemberships.includes(id)
          ? p.selectedMemberships.filter((x) => x !== id)
          : [...p.selectedMemberships, id];
        return { ...p, selectedMemberships: sel };
      });
    }
  };

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateAdd = (): boolean => {
    const err: Record<string, string> = {};
    if (!newResident.firstName.trim()) err.firstName = t("firstNameRequired");
    if (!newResident.lastName.trim()) err.lastName = t("lastNameRequired");
    if (!newResident.role.trim()) err.role = t("roleRequired");
    const raw = newResident.contactNumber.replace(/\D/g, "");
    if (!raw) err.contactNumber = t("contactNumberRequired");
    else if (!raw.startsWith("09")) err.contactNumber = t("contactNumberMustStart09");
    else if (raw.length !== 11) err.contactNumber = t("mustBe11Digits");
    if (newResident.needAccount && !newResident.tempPassword.trim())
      err.tempPassword = t("tempPasswordRequired");
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const validateEdit = (): boolean => {
    if (!editingResident) return false;
    const err: Record<string, string> = {};
    if (!editingResident.firstName.trim()) err.firstName = t("firstNameRequired");
    if (!editingResident.lastName.trim()) err.lastName = t("lastNameRequired");
    if (!editingResident.role.trim()) err.role = t("roleRequired");
    const raw = editingResident.contactNumber.replace(/\D/g, "");
    if (!raw) err.contactNumber = t("contactNumberRequired");
    else if (!raw.startsWith("09")) err.contactNumber = t("contactNumberMustStart09");
    else if (raw.length !== 11) err.contactNumber = t("mustBe11Digits");
    if (!editingResident.hasAccount && editingResident.needAccount && !editingResident.tempPassword.trim())
      err.tempPassword = t("tempPasswordRequired");
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  // ─── ADD: POST /users ─────────────────────────────────────────────────────
  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAdd()) return;
    setApiError(null);

    // ── Duplicate full-name check (excludes trashed records) ──────────────
    const incomingFull = normalizeName(
      `${newResident.firstName} ${newResident.middleName} ${newResident.lastName}`
    );
    const isDuplicate = residentsData.some((r) => {
      if (r.deleted_at !== null) return false; // ignore trashed
      const existingFull = normalizeName(`${r.firstName} ${r.middleName} ${r.lastName}`);
      return existingFull === incomingFull;
    });

    if (isDuplicate) {
      setFormErrors((prev) => ({
        ...prev,
        lastName: t("duplicateFullNameError"),
      }));
      return;
    }
    // ──────────────────────────────────────────────────────────────────────

    const fd = new FormData();
    fd.append("first_name", newResident.firstName);
    fd.append("middle_name", newResident.middleName);
    fd.append("last_name", newResident.lastName);
    fd.append("contact_number", newResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", newResident.role);
    fd.append("has_account", newResident.needAccount ? "1" : "0");
    if (newResident.needAccount && newResident.tempPassword.trim()) {
      fd.append("password", newResident.tempPassword);
    }
    if (addPhotoFile) fd.append("validation_id", addPhotoFile);
    if (newResident.hasMemberships && newResident.selectedMemberships.length > 0)
      newResident.selectedMemberships.forEach((id) => fd.append("membership_ids[]", String(id)));

    // Adviser recommendation: age profiling + household SMS notify
    if (newResident.birthDate) fd.append("birth_date", newResident.birthDate);
    if (newResident.address) fd.append("address", newResident.address);
    if (newResident.civilStatusId) fd.append("civil_status_id", String(newResident.civilStatusId));
    if (newResident.householdCode) fd.append("household_code", newResident.householdCode);
    fd.append("is_household_head", newResident.isHouseholdHead ? "1" : "0");
    if (newResident.householdContactNumber)
      fd.append("household_contact_number", newResident.householdContactNumber.replace(/\D/g, ""));

    try {
      const res = await fetch("/users", {
        method: "POST",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": csrfToken() },
        body: fd,
      });

      if (!res.ok) {
        const body = await safeParseJson(res);
        if (body.errors) {
          const mapped: Record<string, string> = {};
          Object.entries(body.errors).forEach(([k, v]) => {
            mapped[k] = (v as string[])[0];
          });
          setFormErrors(mapped);
        } else {
          setApiError(body.message ?? t("saveRecordFailed"));
        }
        return;
      }

    setShowAddForm(false);
    setFormErrors({});
    setApiError(null);
    setNewResident(emptyAdd());
    setAddPhotoFile(null);
    setAddPhotoPreview("");

    setShowAddSuccess(true);

    fetchResidents();
    } catch (e) {
      console.error("Add error:", e);
      setApiError(t("networkErrorTryAgain"));
    }
  };

  // ─── Load edit form ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!editRecord) {
      setEditingResident(null);
      setInitialEditData("");
      setEditPhotoFile(null);
      setEditPhotoPreview("");
      setEditPhotoChanged(false);
      return;
    }
    const r = residentsData.find((x) => x.id === editRecord);
    if (!r) return;

    const memNames = r.memberships ? r.memberships.split(", ").filter(Boolean) : [];
    const memIds = availableMemberships.filter((m) => memNames.includes(m.name)).map((m) => m.id);

    const state: EditForm = {
      real_id: r.real_id,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      contactNumber: r.contactNumber,
      role: r.role,
      hasAccount: r.hasAccount,
      password: r.password,
      passwordChangedByUser: r.passwordChangedByUser,
      hasMemberships: memIds.length > 0,
      selectedMemberships: memIds,
      deleted_at: r.deleted_at,
      needAccount: false,
      tempPassword: "",
      birthDate: r.birthDate ?? "",
      address: r.address ?? "",
      civilStatusId: r.civilStatusId ?? null,
      isHouseholdHead: r.isHouseholdHead ?? false,
      householdCode: r.householdCode ?? "",
      householdContactNumber: r.householdContactNumber ?? "",
    };

    setEditingResident(state);
    setInitialEditData(JSON.stringify(state));
    setEditPhotoFile(null);
    setEditPhotoPreview(r.photo);
    setEditPhotoChanged(false);
  }, [editRecord, residentsData, availableMemberships]);

  // ─── UPDATE: POST /users/{id} with _method=PUT ───────────────────────────
  const handleUpdateResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord || !editingResident || !validateEdit()) return;
    setApiError(null);

    // ── Duplicate full-name check (excludes self and trashed records) ──────
    const incomingFull = normalizeName(
      `${editingResident.firstName} ${editingResident.middleName} ${editingResident.lastName}`
    );
    const isDuplicate = residentsData.some((r) => {
      if (r.deleted_at !== null) return false;           // ignore trashed
      if (r.real_id === editingResident.real_id) return false; // ignore self
      const existingFull = normalizeName(`${r.firstName} ${r.middleName} ${r.lastName}`);
      return existingFull === incomingFull;
    });

    if (isDuplicate) {
      setFormErrors((prev) => ({
        ...prev,
        lastName: t("duplicateFullNameError"),
      }));
      return;
    }
    // ──────────────────────────────────────────────────────────────────────

    const fd = new FormData();
    fd.append("_method", "PUT");
    fd.append("first_name", editingResident.firstName);
    fd.append("middle_name", editingResident.middleName);
    fd.append("last_name", editingResident.lastName);
    fd.append("contact_number", editingResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", editingResident.role);

    if (editingResident.hasAccount) {
      fd.append("has_account", "1");
      if (editingResident.password.trim()) {
        fd.append("password", editingResident.password);
      }
    } else if (editingResident.needAccount) {
      fd.append("has_account", "1");
      fd.append("password", editingResident.tempPassword);
    } else {
      fd.append("has_account", "0");
    }

    if (editPhotoFile) fd.append("validation_id", editPhotoFile);

    // Adviser recommendation: age profiling + household SMS notify
    fd.append("birth_date", editingResident.birthDate || "");
    fd.append("address", editingResident.address || "");
    fd.append("civil_status_id", editingResident.civilStatusId ? String(editingResident.civilStatusId) : "");
    fd.append("household_code", editingResident.householdCode || "");
    fd.append("is_household_head", editingResident.isHouseholdHead ? "1" : "0");
    fd.append("household_contact_number", editingResident.householdContactNumber ? editingResident.householdContactNumber.replace(/\D/g, "") : "");

    if (editingResident.hasMemberships && editingResident.selectedMemberships.length > 0) {
      editingResident.selectedMemberships.forEach((id) => fd.append("membership_ids[]", String(id)));
    } else {
      fd.append("membership_ids", "");
    }

    try {
      const res = await fetch(`/users/${editingResident.real_id}`, {
        method: "POST",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": csrfToken() },
        body: fd,
      });

      if (!res.ok) {
        const body = await safeParseJson(res);
        if (body.errors) {
          const mapped: Record<string, string> = {};
          Object.entries(body.errors).forEach(([k, v]) => {
            mapped[k] = (v as string[])[0];
          });
          setFormErrors(mapped);
        } else {
          setApiError(body.message ?? t("updateRecordFailed"));
        }
        return;
      }

        if (currentUserId === editingResident.real_id && editingResident.role === "Resident") {
        localStorage.removeItem("user");
        localStorage.removeItem("isAuthenticated");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("isAuthenticated");

        setEditRecord(null);
        setShowRoleChangedModal(true);

        return;
        }

      setEditRecord(null);
      setFormErrors({});
      setApiError(null);
      setShowUpdateSuccess(true);
      fetchResidents();
    } catch (e) {
      console.error("Update error:", e);
      setApiError(t("networkErrorTryAgain"));
    }
  };

  // ─── DELETE ───────────────────────────────────────────────────────────────
const handleDeleteResident = async () => {
  if (!deleteRecord) return;
  const rec = residentsData.find((r) => r.id === deleteRecord);
  if (!rec) return;
  try {
    const res = await fetch(`/users/${rec.real_id}`, {
      method: "DELETE",
      headers: { Accept: "application/json", "X-CSRF-TOKEN": csrfToken() },
    });

    if (!res.ok) {
      const body = await safeParseJson(res);
      console.error("Delete error:", body.message || res.statusText);
      return;
    }

    if (currentUserId === rec.real_id) {
      localStorage.removeItem("user");
      localStorage.removeItem("isAuthenticated");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("isAuthenticated");
      // ✅ REMOVED BROWSER ALERT — USE ONLY YOUR MODAL
      setDeleteRecord(null);
      setShowDeleteSuccess(true); // your own success modal
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500); // give user time to read message before redirect
    } else {
      setDeleteRecord(null);
      setShowDeleteSuccess(true);
      fetchResidents();
    }
  } catch (e) {
    console.error("Delete error:", e);
  }
};

  // ─── RESTORE ──────────────────────────────────────────────────────────────
  const handleRestoreResident = async () => {
    if (!restoreRecord) return;
    try {
      await fetch(`/users/${restoreRecord}/restore`, {
        method: "POST",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": csrfToken() },
      });
      setRestoreRecord(null);
      fetchResidents();
    } catch (e) {
      console.error("Restore error:", e);
    }
  };

  // ─── Cancel helpers ───────────────────────────────────────────────────────
  const handleOpenAddForm = () => {
    const empty = emptyAdd();
    setNewResident(empty);
    setInitialAddData(JSON.stringify(empty));
    setAddPhotoFile(null);
    setAddPhotoPreview("");
    setFormErrors({});
    setApiError(null);
    setShowAddForm(true);
  };

  const handleCancelAdd = () => {
    if (hasAddChanges) setShowCancelConfirm("add");
    else {
      setShowAddForm(false);
      setFormErrors({});
      setApiError(null);
    }
  };

  const handleCancelEdit = () => {
    if (hasEditChanges) setShowCancelConfirm("edit");
    else {
      setEditRecord(null);
      setFormErrors({});
      setApiError(null);
    }
  };

  // ─── Filter + Pagination ──────────────────────────────────────────────────
  const filteredResidents = useMemo(() => {
    let r = residentsData;

    if (statusFilter === "residents") r = r.filter((x) => x.role === "Resident" && x.deleted_at === null);
    else if (statusFilter === "staff") r = r.filter((x) => x.role === "Staff" && x.deleted_at === null);
    else if (statusFilter === "trashed") r = r.filter((x) => x.deleted_at !== null);
    else r = r.filter((x) => x.deleted_at === null);

    if (accountFilter === "with-account") r = r.filter((x) => x.hasAccount);
    else if (accountFilter === "no-account") r = r.filter((x) => !x.hasAccount);

    if (ageGroupFilter !== "all") {
      const wanted = AGE_GROUP_LABELS[ageGroupFilter];
      r = r.filter((x) => x.ageGroup === wanted);
    }

    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      r = r.filter((x) =>
        [x.id, x.lastName, x.firstName, x.middleName, x.contactNumber, x.memberships, x.role]
          .some((f) => f?.toLowerCase().includes(q))
      );
    }
    return r;
  }, [residentsData, statusFilter, accountFilter, residentSearch]);

  const totalPages = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);

  const paginatedResidents = useMemo(
    () => filteredResidents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredResidents, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [residentSearch, statusFilter, accountFilter, ageGroupFilter]);

  // ─── Sub-components ───────────────────────────────────────────────────────
  const MembershipCheckboxes = ({ isEdit }: { isEdit: boolean }) => {
    const hasMem = isEdit ? editingResident?.hasMemberships ?? false : newResident.hasMemberships;
    const selMems = isEdit ? editingResident?.selectedMemberships ?? [] : newResident.selectedMemberships;

    return (
      <div className="border-t border-b py-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hasMem}
            onChange={(e) => {
              if (isEdit)
                setEditingResident((p) => (p ? { ...p, hasMemberships: e.target.checked } : p));
              else setNewResident((p) => ({ ...p, hasMemberships: e.target.checked }));
            }}
            className="w-4 h-4 text-[#005f63]"
          />
          <span className="font-medium text-gray-700">{t("hasMembershipsLabel")}</span>
        </label>

        {hasMem &&
          (availableMemberships.length === 0 ? (
            <p className="pl-6 text-xs text-gray-400 italic">{t("noMembershipsAvailable")}</p>
          ) : (
            <div className="pl-6 grid grid-cols-2 gap-2">
              {availableMemberships.map((mem) => (
                <label key={mem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    value={mem.id}
                    checked={selMems.includes(mem.id)}
                    onChange={() => toggleMembership(mem.id, isEdit)}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span>{mem.name}</span>
                </label>
              ))}
            </div>
          ))}
      </div>
    );
  };

  const PhotoField = ({ isEdit }: { isEdit: boolean }) => {
    const preview = isEdit ? editPhotoPreview : addPhotoPreview;
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("idPhotoFieldLabel")} <span className="text-gray-400 font-normal">({t("optionalLabel")})</span>
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handlePhotoChange(e, isEdit)}
          className={`w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63] ${
            formErrors.photo ? "border border-gray-900 rounded-lg p-1" : ""
          }`}
        />
        {formErrors.photo && (
          <p className="text-gray-900 text-xs mt-1 font-medium">⚠ {formErrors.photo}</p>
        )}
        {preview && (
          <div className="relative inline-block mt-2">
            <img src={preview} alt="Preview" className="h-20 rounded border" />
            <button
              type="button"
              onClick={() => handleRemovePhoto(isEdit)}
              className="absolute -top-2 -right-2 bg-gray-200/70 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold border border-gray-300 hover:bg-gray-300/80 transition"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm overflow-x-auto">
        <div className="w-full min-w-0">
          <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("residentsMasterList")}</h1>
          <p className="text-sm text-[#667777] mt-1">
            {t("residentsSubtitle")}
          </p>
          <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 w-full">
            <div className="flex-1 min-w-[220px]">
              <SearchBar
                value={residentSearch}
                onChange={setResidentSearch}
                placeholder={t("searchByIdNameContactPlaceholder")}
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:outline-none appearance-none"
              >
                <option value="all">{t("allRecordsOption")}</option>
                <option value="residents">{t("roleResidentOption")}</option>
                <option value="staff">{t("roleStaffOption")}</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:outline-none appearance-none"
              >
                <option value="all">{t("allAccountsOption")}</option>
                <option value="with-account">{t("hasAccountOption")}</option>
                <option value="no-account">{t("noAccountOption")}</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
            {/* Adviser recommendation: "Profiling (Filter for Age)" */}
            <div className="relative">
              <select
                value={ageGroupFilter}
                onChange={(e) => setAgeGroupFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:outline-none appearance-none"
                title={t("filterByAgeGroupTitle")}
              >
                {AGE_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>{t(g.labelKey)}</option>
                ))}
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredResidents.length} {t("ofPagesLabel")} {residentsData.length} {t("recordsMatchShowing")} {itemsPerPage} {t("perPageLabel")}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="pl-1">
        <div className="sticky top-[140px] z-10 flex items-center justify-between mb-3 bg-[#fcfcf9] py-2">
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
          <button
            onClick={handleOpenAddForm}
            className="bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm ml-auto"
          >
            {t("addNewRecordButton")}
          </button>
        </div>

        <div className="relative rounded-[20px] bg-white shadow-lg overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-1 absolute top-0 left-0 right-0" />
          <div className="p-5 pt-6 max-h-[65vh] overflow-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: "1400px" }}>
              <colgroup>
                <col style={{ width: "110px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "260px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "100px" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[#eee8e0]">
                  {[
                    { key: "ID", labelKey: "idColumn" },
                    { key: "Last Name", labelKey: "lastNameColumn" },
                    { key: "First Name", labelKey: "firstNameColumn" },
                    { key: "Middle Name", labelKey: "middleNameColumn" },
                    { key: "Contact Number", labelKey: "contactNumberColumn" },
                    { key: "Memberships", labelKey: "membershipsColumn" },
                    { key: "Age", labelKey: "ageColumn" },
                    { key: "Role", labelKey: "roleColumn" },
                    { key: "Has Account?", labelKey: "hasAccountColumn" },
                    { key: "Actions", labelKey: "actionsColumn" },
                  ].map(
                    (h) => (
                      <th
                        key={h.key}
                        className={`py-7 px-2 font-bold text-[#005f63] whitespace-nowrap bg-[#f8f6f2] ${h.key === "Actions" ? "text-right" : "text-left"}`}
                        style={{ position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 0 0 #eee8e0" }}
                      >
                        {t(h.labelKey)}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-gray-500 italic">{t("loading")}</td>
                  </tr>
                ) : paginatedResidents.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-gray-500 italic">{t("noRecordsMatchFilter")}</td>
                  </tr>
                ) : (
                  paginatedResidents.map((r) => {
                    const allMems = r.memberships ? r.memberships.split(", ").map((m) => m.trim()).filter(Boolean) : [];
                    const visible = allMems.slice(0, 2);
                    const extra = allMems.length - 2;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[#eee8e0] transition-all duration-200 hover:shadow-md hover:rounded-lg ${
                          r.deleted_at !== null ? "bg-gray-200 text-gray-500 line-through opacity-70" : "hover:bg-teal-50/100"
                        }`}
                      >
                        <td className="py-3 px-2 font-mono truncate">{highlightText(r.id, residentSearch)}</td>
                        <td className="py-3 px-2 font-medium truncate">{highlightText(r.lastName, residentSearch)}</td>
                        <td className="py-3 px-2 truncate">{highlightText(r.firstName, residentSearch)}</td>
                        <td className="py-3 px-2 truncate">{highlightText(r.middleName, residentSearch)}</td>
                        <td className="py-3 px-2 truncate">{highlightText(r.contactNumber, residentSearch)}</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {visible.map((m, i) => (
                              <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>
                                {highlightText(m, residentSearch)}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">+{extra} {t("moreLabel")}</span>
                            )}
                            {allMems.length === 0 && <span className="text-gray-400 text-xs">{t("noneLabel")}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {r.ageGroup ? (
                            <span
                              className="px-2 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-800"
                              title={r.isHouseholdHead ? t("householdHeadTitle") : ""}
                            >
                              {r.age}{r.isHouseholdHead && <span className="ml-1">🏠</span>}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            r.role === "Staff" ? "bg-orange-100 text-orange-800"
                            : r.role === "Resident" ? "bg-teal-50 text-teal-800"
                            : "bg-gray-100 text-gray-800"
                          }`}>
                            {highlightText(r.role, residentSearch)}
                            {r.passwordChangedByUser && <span className="ml-1 text-yellow-600 text-[10px] font-bold">🔒</span>}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            r.hasAccount ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {r.hasAccount ? `✅ ${t("yesLabel")}` : `❌ ${t("noLabel")}`}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => setViewRecord(r.id)} className="p-2 rounded-full hover:bg-teal-50 transition" title={t("viewTitleBtn")}>
                              <svg width="16" height="16" fill="none" stroke="#006666" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            {r.deleted_at === null ? (
                              <>
                                <button onClick={() => setEditRecord(r.id)} className="p-2 rounded-full hover:bg-orange-50 transition" title={t("editTitle")}>
                                  <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button onClick={() => setDeleteRecord(r.id)} className="p-2 rounded-full hover:bg-red-50 transition" title={t("deleteTitle")}>
                                  <Archive className="h-4 w-4 text-red-500" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setRestoreRecord(r.real_id)}
                                className="p-2 rounded-full text-teal-600 hover:bg-teal-50 hover:text-teal-700 transition-colors duration-200"
                                title={t("restoreRecordTitle")}
                              >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                  <polyline points="23 4 23 10 17 10" />
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── View Modal ───────────────────────────────────────────────────────── */}
      {viewRecord && (() => {
        const r = residentsData.find((x) => x.id === viewRecord)!;
        const allMems = r.memberships ? r.memberships.split(", ").map((m) => m.trim()).filter(Boolean) : [];
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">{t("recordDetailsTitle")}</h2>
                <button onClick={() => setViewRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <div className="text-sm">
                {r.deleted_at !== null && (
                  <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ {t("recordDeletedWarning")}</div>
                )}
                <div className="flex gap-6">
                  <div className="flex-1 space-y-2">
                    <p><strong className="text-[#005f63]">{t("idFieldLabel")}</strong> {r.id}</p>
                    <p><strong className="text-[#005f63]">{t("fullNameFieldLabel")}</strong> {r.lastName}, {r.firstName} {r.middleName}</p>
                    <p><strong className="text-[#005f63]">{t("contactFieldLabel")}</strong> {r.contactNumber}</p>
                    <p>
                      <strong className="text-[#005f63]">{t("roleFieldLabel")}</strong> {r.role}{" "}
                      {r.passwordChangedByUser && <span className="text-yellow-600 font-bold">{t("lockedLabel")}</span>}
                    </p>
                    <p><strong className="text-[#005f63]">{t("hasAccountFieldLabel")}</strong> {r.hasAccount ? t("yesLabel") : t("noLabel")}</p>
                    {r.age !== null && (
                      <p><strong className="text-[#005f63]">{t("ageFieldLabel")}</strong> {r.age} ({r.ageGroup})</p>
                    )}
                    {r.address && (
                      <p><strong className="text-[#005f63]">{t("addressFieldLabelColon")}</strong> {r.address}</p>
                    )}
                    {(r.householdCode || r.isHouseholdHead) && (
                      <p>
                        <strong className="text-[#005f63]">{t("householdFieldLabel")}</strong>{" "}
                        {r.householdCode || "—"}{" "}
                        {r.isHouseholdHead && <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-800">🏠 {t("headBadgeLabel")}</span>}
                      </p>
                    )}
                  </div>
                  <div className="w-[160px]">
                    <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ minHeight: 180 }}>
                      {r.photo ? (
                        <img src={r.photo} alt="ID Photo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">{t("noPhotoUploaded")}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <strong className="text-[#005f63] block mb-2">{t("membershipsFieldLabel")}</strong>
                  <div className="flex flex-wrap gap-1.5">
                    {allMems.length > 0 ? (
                      allMems.map((m, i) => (
                        <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>{m}</span>
                      ))
                    ) : (
                      <span className="text-gray-500">{t("noneLabel")}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Add Modal ────────────────────────────────────────────────────────── */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black text-[#005f63]">{t("addNewRecordTitle")}</h2>
              <button onClick={handleCancelAdd} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
            </div>

            {apiError && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{apiError}</div>}

            <form onSubmit={handleAddResident} className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                {(["firstName", "middleName", "lastName"] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field === "firstName" ? t("firstNameRequiredLabel") : field === "middleName" ? t("middleNameLabel") : t("lastNameRequiredLabel")}
                    </label>
                    <input
                      type="text"
                      required={field !== "middleName"}
                      value={newResident[field]}
                      onChange={(e) => setNewResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors[field] ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors[field] && <p className="text-red-500 text-xs mt-1">{formErrors[field]}</p>}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("roleRequiredLabel")}</label>
                <select
                  required
                  value={newResident.role}
                  onChange={(e) => setNewResident((p) => ({ ...p, role: e.target.value }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    !newResident.role ? "text-gray-400" : "text-gray-900"
                  } ${formErrors.role ? "border-red-500" : "border-gray-200"}`}
                >
                  <option value="" style={{ display: "none" }} className="text-gray-400">{t("chooseARoleOption")}</option>
                  <option value="Resident" className="text-gray-900">{t("residentOption")}</option>
                  <option value="Staff" className="text-gray-900">{t("staffOption")}</option>
                </select>
                {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("contactNumberRequiredLabel")}</label>
                <input
                  type="text"
                  required
                  value={newResident.contactNumber}
                  onChange={(e) => setNewResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    formErrors.contactNumber ? "border-red-500" : "border-gray-200"
                  }`}
                  placeholder="09XX-XXX-XXXX"
                  maxLength={13}
                />
                {newResident.contactNumber.length > 0 && !newResident.contactNumber.startsWith("09") && (
                  <p className="text-amber-500 text-xs mt-1">⚠ {t("numberMustStart09Warning")}</p>
                )}
                {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
              </div>

              {/* Adviser recommendations: age profiling + household SMS notify */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("profileHouseholdLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("birthDateLabel")}</label>
                    <input
                      type="date"
                      value={newResident.birthDate}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setNewResident((p) => ({ ...p, birthDate: e.target.value }))}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("addressPurokLabel")}</label>
                    <input
                      type="text"
                      value={newResident.address}
                      onChange={(e) => setNewResident((p) => ({ ...p, address: e.target.value }))}
                      placeholder={t("purokPlaceholder")}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("civilStatusLabel")}</label>
                    <select
                      value={newResident.civilStatusId ?? ""}
                      onChange={(e) => setNewResident((p) => ({ ...p, civilStatusId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {civilStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("householdCodeLabel")}</label>
                    <input
                      type="text"
                      value={newResident.householdCode}
                      onChange={(e) => setNewResident((p) => ({ ...p, householdCode: e.target.value }))}
                      placeholder={t("householdCodePlaceholder")}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("householdContactNumberLabel")}</label>
                    <input
                      type="text"
                      value={newResident.householdContactNumber}
                      onChange={(e) => setNewResident((p) => ({ ...p, householdContactNumber: formatContactNumber(e.target.value) }))}
                      placeholder={t("householdContactPlaceholder")}
                      maxLength={13}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={newResident.isHouseholdHead}
                    onChange={(e) => setNewResident((p) => ({ ...p, isHouseholdHead: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("headOfHouseholdCheckboxLabel")}</span>
                  <span className="text-gray-400">{t("receivesEventSmsNote")}</span>
                </label>
              </div>

              <PhotoField isEdit={false} />

              <div className="border-t border-b py-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newResident.hasMemberships}
                    onChange={(e) => setNewResident((p) => ({ ...p, hasMemberships: e.target.checked }))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("hasMembershipsLabel")}</span>
                </label>

                {newResident.hasMemberships &&
                  (availableMemberships.length === 0 ? (
                    <p className="pl-6 text-xs text-gray-400 italic">{t("noMembershipsAvailable")}</p>
                  ) : (
                    <div className="pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem) => (
                        <label key={mem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            value={mem.id}
                            checked={newResident.selectedMemberships.includes(mem.id)}
                            onChange={() => toggleMembership(mem.id, false)}
                            className="w-4 h-4 text-[#005f63]"
                          />
                          <span>{mem.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                {formErrors.membership_ids && (
                  <p className="pl-6 text-red-500 text-xs">{formErrors.membership_ids}</p>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newResident.needAccount}
                    onChange={(e) =>
                      setNewResident((p) => ({
                        ...p,
                        needAccount: e.target.checked,
                        tempPassword: e.target.checked ? p.tempPassword : "",
                      }))
                    }
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("needAccountLabel")}</span>
                </label>

                {newResident.needAccount && (
                  <div className="pl-6 space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {t("setTempPasswordLabel")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={newResident.tempPassword}
                      onChange={(e) => setNewResident((p) => ({ ...p, tempPassword: e.target.value }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors.tempPassword ? "border-red-500" : "border-gray-200"
                      }`}
                      placeholder={t("tempPasswordPlaceholder")}
                    />
                    {formErrors.tempPassword && <p className="text-red-500 text-xs mt-1">{formErrors.tempPassword}</p>}
                    <p className="text-xs text-gray-400 mt-1">{t("residentCanLoginNote")}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={handleCancelAdd} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!hasAddChanges}
                  className={`px-5 py-2.5 rounded-full transition ${
                    hasAddChanges ? "bg-[#005f63] text-white hover:bg-[#004d4f]" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {t("saveRecordButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ───────────────────────────────────────────────────────── */}
      {editRecord && editingResident && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black text-[#005f63]">{t("editRecordTitle")}</h2>
              <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
            </div>

            {editingResident.deleted_at !== null && (
              <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ {t("recordDeletedEditingDisabled")}</div>
            )}
            {apiError && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{apiError}</div>}

            <form
              onSubmit={handleUpdateResident}
              className="space-y-4"
              style={{
                pointerEvents: editingResident.deleted_at !== null ? "none" : "auto",
                opacity: editingResident.deleted_at !== null ? 0.6 : 1,
              }}
            >
              <div className="grid md:grid-cols-3 gap-4">
                {(["firstName", "middleName", "lastName"] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field === "firstName" ? t("firstNameRequiredLabel") : field === "middleName" ? t("middleNameLabel") : t("lastNameRequiredLabel")}
                    </label>
                    <input
                      type="text"
                      required={field !== "middleName"}
                      value={editingResident[field]}
                      onChange={(e) =>
                        setEditingResident((p) => p ? { ...p, [field]: capitalizeName(e.target.value) } : p)
                      }
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors[field] ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors[field] && <p className="text-red-500 text-xs mt-1">{formErrors[field]}</p>}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("roleRequiredLabel")}</label>
                <select
                  required
                  value={editingResident.role}
                  onChange={(e) => setEditingResident((p) => p ? { ...p, role: e.target.value } : p)}
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    formErrors.role ? "border-red-500" : "border-gray-200"
                  }`}
                >
                  <option value="Resident">{t("residentOption")}</option>
                  <option value="Staff">{t("staffOption")}</option>
                </select>
                {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("contactNumberRequiredLabel")}</label>
                <input
                  type="text"
                  required
                  value={editingResident.contactNumber}
                  onChange={(e) =>
                    setEditingResident((p) => p ? { ...p, contactNumber: formatContactNumber(e.target.value) } : p)
                  }
                  className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                    formErrors.contactNumber ? "border-red-500" : "border-gray-200"
                  }`}
                  placeholder="09XX-XXX-XXXX"
                  maxLength={13}
                />
                {editingResident.contactNumber.length > 0 && !editingResident.contactNumber.startsWith("09") && (
                  <p className="text-amber-500 text-xs mt-1">⚠ {t("numberMustStart09Warning")}</p>
                )}
                {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
              </div>

              {/* Adviser recommendations: age profiling + household SMS notify */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("profileHouseholdLabel")}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("birthDateLabel")}</label>
                    <input
                      type="date"
                      value={editingResident.birthDate}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, birthDate: e.target.value } : p)}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("addressPurokLabel")}</label>
                    <input
                      type="text"
                      value={editingResident.address}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, address: e.target.value } : p)}
                      placeholder={t("purokPlaceholder")}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("civilStatusLabel")}</label>
                    <select
                      value={editingResident.civilStatusId ?? ""}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, civilStatusId: e.target.value ? Number(e.target.value) : null } : p)}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    >
                      <option value="">{t("anyOptionLabel")}</option>
                      {civilStatuses.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("householdCodeLabel")}</label>
                    <input
                      type="text"
                      value={editingResident.householdCode}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, householdCode: e.target.value } : p)}
                      placeholder={t("householdCodePlaceholder")}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("householdContactNumberLabel")}</label>
                    <input
                      type="text"
                      value={editingResident.householdContactNumber}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, householdContactNumber: formatContactNumber(e.target.value) } : p)}
                      placeholder={t("householdContactPlaceholder")}
                      maxLength={13}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={editingResident.isHouseholdHead}
                    onChange={(e) => setEditingResident((p) => p ? { ...p, isHouseholdHead: e.target.checked } : p)}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("headOfHouseholdCheckboxLabel")}</span>
                  <span className="text-gray-400">{t("receivesEventSmsNote")}</span>
                </label>
              </div>

              <PhotoField isEdit={true} />

              <div className="border-t border-b py-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingResident.hasMemberships}
                    onChange={(e) => setEditingResident((p) => (p ? { ...p, hasMemberships: e.target.checked } : p))}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("hasMembershipsLabel")}</span>
                </label>

                {editingResident.hasMemberships &&
                  (availableMemberships.length === 0 ? (
                    <p className="pl-6 text-xs text-gray-400 italic">{t("noMembershipsAvailable")}</p>
                  ) : (
                    <div className="pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem) => (
                        <label key={mem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            value={mem.id}
                            checked={editingResident.selectedMemberships.includes(mem.id)}
                            onChange={() => toggleMembership(mem.id, true)}
                            className="w-4 h-4 text-[#005f63]"
                          />
                          <span>{mem.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                {formErrors.membership_ids && (
                  <p className="pl-6 text-red-500 text-xs">{formErrors.membership_ids}</p>
                )}

                {editingResident.hasAccount ? (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-not-allowed opacity-70">
                      <input type="checkbox" checked={true} disabled className="w-4 h-4 text-[#005f63]" />
                      <span className="font-medium text-gray-700">{t("hasAccountCheckboxLabel")}</span>
                    </label>
                    <div className="pl-6 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t("usernameLabel")}</label>
                        <input
                          type="text"
                          value={`PR-${String(editingResident.real_id).padStart(4, "0")}`}
                          disabled
                          className="w-full rounded-full border px-4 py-2.5 bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t("passwordLabel")}{" "}
                          <span className="text-gray-400 text-xs font-normal">{t("passwordResetNote")}</span>
                        </label>
                        <input
                          type="password"
                          value={editingResident.password}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, password: e.target.value } : p)}
                          className="w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 border-gray-200"
                          placeholder={t("resetPasswordPlaceholder")}
                        />
                        {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingResident.needAccount}
                        onChange={(e) =>
                          setEditingResident((p) =>
                            p ? { ...p, needAccount: e.target.checked, tempPassword: e.target.checked ? p.tempPassword : "" } : p
                          )
                        }
                        className="w-4 h-4 text-[#005f63]"
                      />
                      <span className="font-medium text-gray-700">{t("needAccountLabel")}</span>
                    </label>
                    {editingResident.needAccount && (
                      <div className="pl-6 space-y-1">
                        <label className="block text-sm font-medium text-gray-700">
                          {t("setTempPasswordLabel")} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="password"
                          value={editingResident.tempPassword}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, tempPassword: e.target.value } : p)}
                          className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                            formErrors.tempPassword ? "border-red-500" : "border-gray-200"
                          }`}
                          placeholder={t("tempPasswordPlaceholder")}
                        />
                        {formErrors.tempPassword && <p className="text-red-500 text-xs mt-1">{formErrors.tempPassword}</p>}
                        <p className="text-xs text-gray-400 mt-1">{t("residentCanLoginNote")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={handleCancelEdit} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!hasEditChanges || editingResident.deleted_at !== null}
                  className={`px-5 py-2.5 rounded-full transition ${
                    hasEditChanges && editingResident.deleted_at === null
                      ? "bg-[#005f63] text-white hover:bg-[#004d4f]"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {t("updateRecordButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
             <div className="mb-4 text-red-500 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{t("moveToTrashConfirm")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">{t("cancel")}</button>
              <button onClick={handleDeleteResident} className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteSuccess && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => setShowDeleteSuccess(false)}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("residentDeletedSuccess")}</p>
          </div>
        </div>
      )}

      {showUpdateSuccess && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => setShowUpdateSuccess(false)}
        >
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("recordUpdatedSuccess")}</p>
            <button
              onClick={() => setShowUpdateSuccess(false)}
              className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

        {showAddSuccess && (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={() => setShowAddSuccess(false)}
        >
            <div
            className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
            >
            <div className="mb-3 text-[#005f63] flex justify-center">
                <CheckCircle size={48} />
            </div>

            <h3 className="text-xl font-bold text-[#005f63] mb-2">
                {t("successTitle")}
            </h3>

            <p className="text-[15px] text-gray-600 mb-6">
                {t("residentAddedSuccess")}
            </p>

            <button
                onClick={() => setShowAddSuccess(false)}
                className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
                {t("okLabel")}
            </button>
            </div>
        </div>
        )}

        {showRoleChangedModal && (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
        >
            <div
            className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center"
            >
            <div className="mb-3 text-[#005f63] flex justify-center">
                <CheckCircle size={48} />
            </div>

            <h3 className="text-xl font-bold text-[#005f63] mb-2">
                {t("roleUpdatedTitle")}
            </h3>

            <p className="text-[15px] text-gray-600 mb-6">
                {t("roleChangedToResidentMessage")}
            </p>

            <button
                onClick={() => {
                setShowRoleChangedModal(false);
                window.location.href = "/login";
                }}
                className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
                {t("okLabel")}
            </button>
            </div>
        </div>
        )}

      {/* ─── Restore Confirm Modal ────────────────────────────────────────────── */}
      {restoreRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-teal-600 mb-3">{t("restoreRecordTitle")}</h3>
            <p className="text-gray-600 mb-5">{t("restoreConfirmMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setRestoreRecord(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">{t("cancel")}</button>
              <button onClick={handleRestoreResident} className="px-5 py-2.5 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition">{t("yesRestoreButton")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cancel Unsaved Changes Confirm Modal ─────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-amber-500 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-gray-600 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">{t("stayButton")}</button>
              <button
                onClick={() => {
                  setShowCancelConfirm(null);
                  if (showCancelConfirm === "add") setShowAddForm(false);
                  if (showCancelConfirm === "edit") setEditRecord(null);
                }}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
              >
                {t("discardCloseButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
