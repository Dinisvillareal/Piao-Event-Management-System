import React, { useState, useMemo, useEffect } from "react";
import { Filter, XCircle } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Membership {
  id: number;
  name: string;
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
  is_deleted: boolean;
}

type AddForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  contactNumber: string;
  role: string;
  hasAccount: boolean;
  password: string;
  hasMemberships: boolean;
  selectedMemberships: number[];
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
  is_deleted: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const csrfToken = () =>
  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";

const capitalizeName = (v: string) =>
  v.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

// ✅ UPDATED: Strict format 09XX-XXX-XXXX
const formatContactNumber = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 11); // keep only first 11 digits
  if (digits.length === 0) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
};

// ✅ NEW: Format raw number when loading into forms/table
const displayContact = (num: string) => formatContactNumber(num);

// Safe JSON parse — handles 500s that return HTML/plain-text instead of JSON
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
        <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
      ) : part
    );
  } catch {
    return safe;
  }
};

const emptyAdd = (): AddForm => ({
  firstName: "", middleName: "", lastName: "", contactNumber: "",
  role: "Resident", hasAccount: false, password: "",
  hasMemberships: false, selectedMemberships: [],
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResidentsView() {
  const [residentsData, setResidentsData]               = useState<ResidentRow[]>([]);
  const [availableMemberships, setAvailableMemberships] = useState<Membership[]>([]);
  const [loading, setLoading]                           = useState(false);
  const [apiError, setApiError]                         = useState<string | null>(null);

  const [residentSearch, setResidentSearch] = useState("");
  const [residentFilter, setResidentFilter] = useState("all");
  const [currentPage, setCurrentPage]       = useState(1);
  const itemsPerPage                        = 20;

  const [showAddForm, setShowAddForm]             = useState(false);
  const [viewRecord, setViewRecord]               = useState<string | null>(null);
  const [editRecord, setEditRecord]               = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord]           = useState<string | null>(null);
  const [restoreRecord, setRestoreRecord]         = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);

  const [newResident, setNewResident]         = useState<AddForm>(emptyAdd());
  const [addPhotoFile, setAddPhotoFile]       = useState<File | null>(null);
  const [addPhotoPreview, setAddPhotoPreview] = useState("");

  const [editingResident, setEditingResident]   = useState<EditForm | null>(null);
  const [editPhotoFile, setEditPhotoFile]       = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState("");
  const [editPhotoChanged, setEditPhotoChanged] = useState(false);

  const currentUserId = useMemo<number | null>(() => {
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        return JSON.parse(sessionUser)?.id ?? null;
      } catch {
        return null;
      }
    }
    const localUser = localStorage.getItem('user');
    if (localUser) {
      try {
        return JSON.parse(localUser)?.id ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [initialAddData, setInitialAddData]   = useState("");
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
        const list: Membership[] = Array.isArray(d) ? d : (d.data ?? []);
        setAvailableMemberships(list);
      })
      .catch((e) => console.error("memberships load:", e));
  }, []);

  // ─── Fetch residents ──────────────────────────────────────────────────────
  const fetchResidents = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/membership-residents", { headers: { Accept: "application/json" } });
      const data = await res.json();
      const ftpUrl = (import.meta as any).env?.VITE_FTP_URL ?? "";

      const formatted: ResidentRow[] = data.map((item: any) => ({
        id:                    item.user_code,
        real_id:               item.user_id,
        lastName:              item.last_name,
        firstName:             item.first_name,
        middleName:            item.middle_name ?? "",
        // ✅ UPDATED: Format contact number when loading data
        contactNumber:         displayContact(item.contact_number ?? ""),
        memberships:           (item.memberships ?? []).map((m: any) => m.name).join(", "),
        role:                  item.role,
        hasAccount:            Boolean(item.has_account),
        password:              "",
        passwordChangedByUser: false,
        photo:                 item.validation_id ? `${ftpUrl}/${item.validation_id}` : "",
        is_deleted:            Boolean(item.is_deleted),
      }));

      setResidentsData(formatted);
    } catch (e) {
      console.error("residents load:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResidents(); }, []);

  // ─── Photo handlers ───────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please upload an image file only."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = ev.target?.result as string;
      if (isEdit) { setEditPhotoFile(file); setEditPhotoPreview(preview); setEditPhotoChanged(true); }
      else        { setAddPhotoFile(file);  setAddPhotoPreview(preview); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = (isEdit = false) => {
    if (isEdit) { setEditPhotoFile(null); setEditPhotoPreview(""); setEditPhotoChanged(true); }
    else        { setAddPhotoFile(null);  setAddPhotoPreview(""); }
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
    if (!newResident.firstName.trim()) err.firstName = "First name is required";
    if (!newResident.lastName.trim())  err.lastName  = "Last name is required";
    if (!newResident.role.trim())      err.role      = "Role is required";
    const raw = newResident.contactNumber.replace(/\D/g, "");
    if (!raw)                  err.contactNumber = "Contact number is required";
    else if (raw.length !== 11) err.contactNumber = "Must be exactly 11 digits";
    if (newResident.hasAccount && !newResident.password.trim())
      err.password = "Password is required when account is enabled";
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const validateEdit = (): boolean => {
    if (!editingResident) return false;
    const err: Record<string, string> = {};
    if (!editingResident.firstName.trim()) err.firstName = "First name is required";
    if (!editingResident.lastName.trim())  err.lastName  = "Last name is required";
    if (!editingResident.role.trim())      err.role      = "Role is required";
    const raw = editingResident.contactNumber.replace(/\D/g, "");
    if (!raw)                  err.contactNumber = "Contact number is required";
    else if (raw.length !== 11) err.contactNumber = "Must be exactly 11 digits";
    if (editingResident.hasAccount && !editingResident.passwordChangedByUser && !editingResident.password.trim())
      err.password = "Password is required";
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  // ─── ADD: POST /users ─────────────────────────────────────────────────────
  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAdd()) return;
    setApiError(null);

    const fd = new FormData();
    fd.append("first_name",     newResident.firstName);
    fd.append("middle_name",    newResident.middleName);
    fd.append("last_name",      newResident.lastName);
    // ✅ Send only digits to server
    fd.append("contact_number", newResident.contactNumber.replace(/\D/g, ""));
    fd.append("role",           newResident.role);
    fd.append("has_account",    newResident.hasAccount ? "1" : "0");
    if (newResident.hasAccount && newResident.password)
      fd.append("password", newResident.password);
    if (addPhotoFile)
      fd.append("validation_id", addPhotoFile);
    if (newResident.hasMemberships && newResident.selectedMemberships.length > 0)
      newResident.selectedMemberships.forEach((id) => fd.append("membership_ids[]", String(id)));

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
          Object.entries(body.errors).forEach(([k, v]) => { mapped[k] = (v as string[])[0]; });
          setFormErrors(mapped);
        } else {
          setApiError(body.message ?? "Failed to save record.");
        }
        return; // stay on modal so user can fix
      }

      // Close modal ONLY on success
      setShowAddForm(false);
      setFormErrors({});
      setApiError(null);
      setNewResident(emptyAdd());
      setAddPhotoFile(null);
      setAddPhotoPreview("");
      fetchResidents();
    } catch (e) {
      console.error("Add error:", e);
      setApiError("Network error. Please try again.");
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
    const memIds   = availableMemberships.filter((m) => memNames.includes(m.name)).map((m) => m.id);

    const state: EditForm = {
      real_id:               r.real_id,
      firstName:             r.firstName,
      middleName:            r.middleName,
      lastName:              r.lastName,
      // ✅ Already formatted, keep as-is
      contactNumber:         r.contactNumber,
      role:                  r.role,
      hasAccount:            r.hasAccount,
      password:              r.password,
      passwordChangedByUser: r.passwordChangedByUser,
      hasMemberships:        memIds.length > 0,
      selectedMemberships:   memIds,
      is_deleted:            r.is_deleted,
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

    const fd = new FormData();
    fd.append("_method",        "PUT");
    fd.append("first_name",     editingResident.firstName);
    fd.append("middle_name",    editingResident.middleName);
    fd.append("last_name",      editingResident.lastName);
    // ✅ Send only digits to server
    fd.append("contact_number", editingResident.contactNumber.replace(/\D/g, ""));
    fd.append("role",           editingResident.role);
    fd.append("has_account",    editingResident.hasAccount ? "1" : "0");

    // ✅ Only send password if NOT empty and NOT changed by user
    if (editingResident.hasAccount && !editingResident.passwordChangedByUser && editingResident.password.trim()) {
      fd.append("password", editingResident.password);
    }

    if (editPhotoFile)
      fd.append("validation_id", editPhotoFile);

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
          Object.entries(body.errors).forEach(([k, v]) => { mapped[k] = (v as string[])[0]; });
          setFormErrors(mapped);
        } else {
          setApiError(body.message ?? "Failed to update record.");
        }
        return; // stay on modal
      }

      // Close modal ONLY on success
      setEditRecord(null);
      setFormErrors({});
      setApiError(null);
      fetchResidents();
    } catch (e) {
      console.error("Update error:", e);
      setApiError("Network error. Please try again.");
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

      // ✅ NEW LOGIC: After delete → clear storage and go to login
      localStorage.removeItem('user');
      localStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('isAuthenticated');
      alert("Your account has been deleted successfully. You will be redirected to login.");
      window.location.href = "/login";

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
    else { setShowAddForm(false); setFormErrors({}); setApiError(null); }
  };

  const handleCancelEdit = () => {
    if (hasEditChanges) setShowCancelConfirm("edit");
    else { setEditRecord(null); setFormErrors({}); setApiError(null); }
  };

  // ─── Filter + Pagination ──────────────────────────────────────────────────
  const filteredResidents = useMemo(() => {
    let r = residentsData;
    if (residentFilter === "residents")    r = r.filter((x) => x.role === "Resident");
    if (residentFilter === "staff")        r = r.filter((x) => x.role === "Staff");
    if (residentFilter === "with-account") r = r.filter((x) => x.hasAccount);
    if (residentFilter === "no-account")   r = r.filter((x) => !x.hasAccount);
    if (residentFilter === "trashed")      r = r.filter((x) => x.is_deleted);
    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      r = r.filter((x) =>
        [x.id, x.lastName, x.firstName, x.middleName, x.contactNumber, x.memberships, x.role]
          .some((f) => f?.toLowerCase().includes(q))
      );
    }
    return r;
  }, [residentsData, residentFilter, residentSearch]);

  const totalPages         = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);
  const paginatedResidents = useMemo(
    () => filteredResidents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredResidents, currentPage]
  );
  useMemo(() => setCurrentPage(1), [residentSearch, residentFilter]);

  // ─── Sub-components ───────────────────────────────────────────────────────

  const MembershipCheckboxes = ({ isEdit }: { isEdit: boolean }) => {
    const hasMem  = isEdit ? (editingResident?.hasMemberships ?? false) : newResident.hasMemberships;
    const selMems = isEdit ? (editingResident?.selectedMemberships ?? []) : newResident.selectedMemberships;

    return (
      <div className="border-t border-b py-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hasMem}
            onChange={(e) => {
              if (isEdit) setEditingResident((p) => p ? { ...p, hasMemberships: e.target.checked } : p);
              else        setNewResident((p) => ({ ...p, hasMemberships: e.target.checked }));
            }}
            className="w-4 h-4 text-[#005f63]"
          />
          <span className="font-medium text-gray-700">Has Memberships?</span>
        </label>

        {hasMem && (
          availableMemberships.length === 0 ? (
            <p className="pl-6 text-xs text-gray-400 italic">No memberships available.</p>
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
          )
        )}
      </div>
    );
  };

  const PhotoField = ({ isEdit }: { isEdit: boolean }) => {
    const preview = isEdit ? editPhotoPreview : addPhotoPreview;
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ID Photo</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handlePhotoChange(e, isEdit)}
          className="w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-[#005f63]/10 file:text-[#005f63]"
        />
        {preview && (
          <div className="relative inline-block mt-2">
            <img src={preview} alt="Preview" className="h-20 rounded border" />
            <button
              type="button"
              onClick={() => handleRemovePhoto(isEdit)}
              className="absolute -top-2 -right-2 bg-gray-200/70 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold border border-gray-300 hover:bg-gray-300/80 transition"
            >✕</button>
          </div>
        )}
      </div>
    );
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-[1200px]">
          <h1 className="text-4xl font-black text-[#005f63]">Residents Master List</h1>
          <p className="text-sm text-[#667777] mt-1">Manage all registered residents, staff, and their account status.</p>
          <div className="mt-4 flex items-center gap-4 w-[1580px]">
            <div className="flex-1">
              <SearchBar value={residentSearch} onChange={setResidentSearch} placeholder="Search by ID, name, contact, role or membership..." />
            </div>
            <div className="relative">
              <select
                value={residentFilter}
                onChange={(e) => setResidentFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:outline-none appearance-none"
              >
                <option value="all">All Records</option>
                <option value="residents">Role: Resident</option>
                <option value="staff">Role: Staff</option>
                <option value="with-account">Has Account</option>
                <option value="no-account">No Account</option>
                <option value="trashed">Trashed</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredResidents.length} of {residentsData.length} record(s) match — showing {itemsPerPage} per page.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="pl-1">
        <div className="flex justify-end mb-3">
          <button onClick={handleOpenAddForm} className="bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm">
            + Add New Record
          </button>
        </div>

        <div className="relative rounded-[20px] bg-white shadow-lg overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#3d9085] via-[#FFC107] to-[#00897B] absolute top-0 left-0 right-0" />
          <div className="p-5 pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eee8e0]">
                  {["ID","Last Name","First Name","Middle Name","Contact Number","Memberships","Role","Has Account?","Actions"].map((h) => (
                    <th key={h} className={`py-3 px-2 font-bold text-[#005f63] whitespace-nowrap ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-500 italic">Loading...</td></tr>
                ) : paginatedResidents.length === 0 ? (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-500 italic">No records match your search or filter.</td></tr>
                ) : paginatedResidents.map((r) => {
                  const allMems = r.memberships ? r.memberships.split(", ").map((m) => m.trim()).filter(Boolean) : [];
                  const visible = allMems.slice(0, 2);
                  const extra   = allMems.length - 2;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-[#eee8e0] transition-all duration-200 hover:shadow-md hover:rounded-lg ${
                        r.is_deleted ? "bg-gray-100 text-gray-400 line-through" : "hover:bg-teal-50/100"
                      }`}
                    >
                      <td className="py-3 px-2 font-mono">{highlightText(r.id, residentSearch)}</td>
                      <td className="py-3 px-2 font-medium">{highlightText(r.lastName, residentSearch)}</td>
                      <td className="py-3 px-2">{highlightText(r.firstName, residentSearch)}</td>
                      <td className="py-3 px-2">{highlightText(r.middleName, residentSearch)}</td>
                      {/* ✅ Already formatted */}
                      <td className="py-3 px-2">{highlightText(r.contactNumber, residentSearch)}</td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {visible.map((m, i) => (
                            <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>
                              {highlightText(m, residentSearch)}
                            </span>
                          ))}
                          {extra > 0 && <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">+{extra} more</span>}
                          {allMems.length === 0 && <span className="text-gray-400 text-xs">None</span>}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          r.role === "Staff"    ? "bg-orange-100 text-orange-800" :
                          r.role === "Resident" ? "bg-teal-50 text-teal-800"     : "bg-gray-100 text-gray-800"
                        }`}>
                          {highlightText(r.role, residentSearch)}
                          {r.passwordChangedByUser && <span className="ml-1 text-yellow-600 text-[10px] font-bold">🔒</span>}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.hasAccount ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {r.hasAccount ? "✅ Yes" : "❌ No"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => setViewRecord(r.id)} className="p-2 rounded-full hover:bg-teal-50 transition" title="View">
                            <svg width="16" height="16" fill="none" stroke="#006666" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          {!r.is_deleted ? (
                            <>
                              <button onClick={() => setEditRecord(r.id)} className="p-2 rounded-full hover:bg-orange-50 transition" title="Edit">
                                <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => setDeleteRecord(r.id)} className="p-2 rounded-full hover:bg-red-50 transition" title="Delete">
                                <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </>
                          ) : (
                            <button
                            onClick={() => setRestoreRecord(r.real_id)}
                            className="p-2 rounded-full text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-200"
                            title="Restore Record"
                            >
                            <svg
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                viewBox="0 0 24 24"
                            >
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8v7h7" />
                                <path d="M12 16v-6h-6" />
                            </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* View Modal */}
      {viewRecord && (() => {
        const r       = residentsData.find((x) => x.id === viewRecord)!;
        const allMems = r.memberships ? r.memberships.split(", ").map((m) => m.trim()).filter(Boolean) : [];
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Record Details</h2>
                <button onClick={() => setViewRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <div className="text-sm">
                {r.is_deleted && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ This record is deleted</div>}
                <div className="flex gap-6">
                  <div className="flex-1 space-y-2">
                    <p><strong className="text-[#005f63]">ID:</strong> {r.id}</p>
                    <p><strong className="text-[#005f63]">Full Name:</strong> {r.lastName}, {r.firstName} {r.middleName}</p>
                    {/* ✅ Already formatted */}
                    <p><strong className="text-[#005f63]">Contact:</strong> {r.contactNumber}</p>
                    <p><strong className="text-[#005f63]">Role:</strong> {r.role} {r.passwordChangedByUser && <span className="text-yellow-600 font-bold">(Locked)</span>}</p>
                    <p><strong className="text-[#005f63]">Has Account:</strong> {r.hasAccount ? "Yes" : "No"}</p>
                    {r.hasAccount && (
                      <p><strong className="text-[#005f63]">Password:</strong> {r.passwordChangedByUser ? "•••••••• (changed by user — hidden)" : r.password || "•••••••• (saved)"}</p>
                    )}
                  </div>
                  <div className="w-[160px]">
                    <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ minHeight: 180 }}>
                      {r.photo
                        ? <img src={r.photo} alt="ID Photo" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">No photo uploaded</div>
                      }
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <strong className="text-[#005f63] block mb-2">Memberships:</strong>
                  <div className="flex flex-wrap gap-1.5">
                    {allMems.length > 0
                      ? allMems.map((m, i) => <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>{m}</span>)
                      : <span className="text-gray-500">None</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Modal */}
{showAddForm && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
    <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black text-[#005f63]">Add New Record</h2>
        <button onClick={handleCancelAdd} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
      </div>

      {apiError && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{apiError}</div>}

      <form onSubmit={handleAddResident} className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          {(["firstName","middleName","lastName"] as const).map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}
              </label>
              <input
                type="text"
                required={field !== "middleName"}
                value={newResident[field]}
                onChange={(e) => setNewResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))}
                className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors[field] ? "border-red-500" : "border-gray-200"}`}
              />
              {formErrors[field] && <p className="text-red-500 text-xs mt-1">{formErrors[field]}</p>}
         </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
          <select
            required
            value={newResident.role}
            onChange={(e) => setNewResident((p) => ({ ...p, role: e.target.value }))}
            className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.role ? "border-red-500" : "border-gray-200"}`}
          >
            <option value="Resident">Resident</option>
            <option value="Staff">Staff</option>
          </select>
          {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
          <input
            type="text"
            required
            value={newResident.contactNumber}
            onChange={(e) => setNewResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))}
            className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`}
            placeholder="09XX-XXX-XXXX"
            maxLength={13}
          />
          {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={newResident.hasAccount}
              onChange={(e) => setNewResident((p) => ({ ...p, hasAccount: e.target.checked }))}
              className="w-4 h-4 text-[#005f63]"
            />
            <span className="font-medium text-gray-700">Has Account?</span>
          </label>

          {/* ✅ Password ALWAYS visible & required */}
          <div className="pl-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              required
              value={newResident.password}
              onChange={(e) => setNewResident((p) => ({ ...p, password: e.target.value }))}
              className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.password ? "border-red-500" : "border-gray-200"}`}
              placeholder="Enter password here"
            />
            {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
          </div>
        </div>

        <PhotoField isEdit={false} />
        <MembershipCheckboxes isEdit={false} />

        <div className="flex justify-between gap-3 pt-2">
          <button type="button" onClick={handleCancelAdd} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          <button
            type="submit"
            disabled={!hasAddChanges}
            className={`px-5 py-2.5 rounded-full transition ${hasAddChanges ? "bg-[#005f63] text-white hover:bg-[#004d4d]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
          >Save Record</button>
        </div>
      </form>
    </div>
  </div>
)}

     {/* Edit Modal */}
{editRecord && editingResident && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
    <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black text-[#005f63]">Edit Record</h2>
        <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
      </div>

      {editingResident.is_deleted && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">⚠️ This record is deleted — editing disabled</div>}
      {apiError && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{apiError}</div>}

      <form
        onSubmit={handleUpdateResident}
        className="space-y-4"
        style={{ pointerEvents: editingResident.is_deleted ? "none" : "auto", opacity: editingResident.is_deleted ? 0.6 : 1 }}
      >
        <div className="grid md:grid-cols-3 gap-4">
          {(["firstName","middleName","lastName"] as const).map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field === "firstName" ? "First Name *" : field === "middleName" ? "Middle Name" : "Last Name *"}
              </label>
              <input
                type="text"
                required={field !== "middleName"}
                value={editingResident[field]}
                onChange={(e) => setEditingResident((p) => p ? { ...p, [field]: capitalizeName(e.target.value) } : p)}
                className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 {formErrors[field] ? "border-red-500" : "border-gray-200"}`}
              />
              {formErrors[field] && <p className="text-red-500 text-xs mt-1">{formErrors[field]}</p>}
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
          <select
            required
            value={editingResident.role}
            onChange={(e) => setEditingResident((p) => p ? { ...p, role: e.target.value } : p)}
            className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.role ? "border-red-500" : "border-gray-200"}`}
          >
            <option value="Resident">Resident</option>
            <option value="Staff">Staff</option>
          </select>
          {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
          <input
            type="text"
            required
            value={editingResident.contactNumber}
            onChange={(e) => setEditingResident((p) => p ? { ...p, contactNumber: formatContactNumber(e.target.value) } : p)}
            className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.contactNumber ? "border-red-500" : "border-gray-200"}`}
            placeholder="09XX-XXX-XXXX"
            maxLength={13}
          />
          {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={editingResident.hasAccount}
              onChange={(e) => setEditingResident((p) => p ? { ...p, hasAccount: e.target.checked } : p)}
              className="w-4 h-4 text-[#005f63]"
            />
            <span className="font-medium text-gray-700">Has Account?</span>
          </label>

          <div className="pl-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={editingResident.password}
              onChange={(e) => setEditingResident((p) => p ? { ...p, password: e.target.value, passwordChangedByUser: false } : p)}
              disabled={editingResident.passwordChangedByUser}
              className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${formErrors.password ? "border-red-500" : "border-gray-200"} ${editingResident.passwordChangedByUser ? "bg-gray-100 text-gray-500" : ""}`}
              placeholder={editingResident.passwordChangedByUser ? "Changed by user — cannot edit" : "Leave blank to keep current"}
            />
            {editingResident.passwordChangedByUser && (
              <p className="text-yellow-600 text-xs mt-1">🔒 This password was changed by the user and is locked</p>
            )}
            {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
          </div>
        </div>

        <PhotoField isEdit={true} />
        <MembershipCheckboxes isEdit={true} />

        <div className="flex justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancelEdit}
            className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasEditChanges || editingResident.is_deleted}
            className={`px-5 py-2.5 rounded-full transition ${
              hasEditChanges && !editingResident.is_deleted
                ? "bg-[#005f63] text-white hover:bg-[#004d4d]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            Update Record
          </button>
        </div>
      </form>
    </div>
  </div>
)}

      {/* Cancel Confirmation Modal */}
{showCancelConfirm && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl text-center">
      <h3 className="text-lg font-bold text-gray-800 mb-2">Discard changes?</h3>
      <p className="text-sm text-gray-600 mb-6">You have unsaved changes. Are you sure you want to close this form?</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setShowCancelConfirm(null)}
          className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          No, keep editing
        </button>
        <button
          onClick={() => {
            setShowCancelConfirm(null);
            if (showCancelConfirm === "add") {
              setShowAddForm(false);
              setFormErrors({});
              setApiError(null);
            } else {
              setEditRecord(null);
              setFormErrors({});
              setApiError(null);
            }
          }}
          className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
        >
          Yes, discard
        </button>
      </div>
    </div>
  </div>
)}

      {/* Delete Confirmation Modal */}
{deleteRecord && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl text-center">
      <h3 className="text-lg font-bold text-red-600 mb-2">Delete Record?</h3>
      <p className="text-sm text-gray-600 mb-6">This action cannot be undone. This record will be moved to trash.</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setDeleteRecord(null)}
          className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleDeleteResident}
          className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
        >
          Yes, Delete
        </button>
      </div>
    </div>
  </div>
)}

      {/* Restore Confirmation Modal */}
{restoreRecord && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl text-center">
      <h3 className="text-lg font-bold text-emerald-600 mb-2">Restore Record?</h3>
      <p className="text-sm text-gray-600 mb-6">This will restore the record back to active status.</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setRestoreRecord(null)}
          className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleRestoreResident}
          className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Yes, Restore
        </button>
      </div>
    </div>
  </div>
)}

      {/* Pagination Controls */}
{totalPages > 1 && (
  <div className="flex items-center justify-between px-2">
    <p className="text-sm text-gray-600">
      Page {currentPage} of {totalPages}
    </p>
    <div className="flex gap-2">
      <button
        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
        disabled={currentPage === 1}
        className="px-3 py-1 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
        <button
          key={page}
          onClick={() => setCurrentPage(page)}
          className={`w-8 h-8 rounded-full text-sm font-medium ${
            currentPage === page
              ? "bg-[#005f63] text-white"
              : "border border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        disabled={currentPage === totalPages}
        className="px-3 py-1 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  </div>
)}

    </div>
  );
}
