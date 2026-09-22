import React, { useState, useMemo, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Search,
  XCircle,
  X as XIcon,
  Archive,
  CheckCircle,
  AlertTriangle,
  Plus,
  Pencil,
  ChevronRight,
  ChevronDown,
  UserPlus,
  QrCode,
  ArrowLeft,
  Trash2,
  Save,
} from "lucide-react";
import DatePicker from "../../../components/ui/DatePicker";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
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

interface CurrentStatusOption {
  id: number;
  label: string;
}

interface AgeBracketOption {
  id: number;
  label: string;
  min_age: number;
  max_age: number | null;
}

interface HouseholdOption {
  id: number;
  code: string;
  address: string | null;
}

// Shape returned by GET /users/{id}/attendances (EventAttendanceController::getMemberHistory)
interface AttendanceRecord {
  id: number;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  location: string;
  timeIn: string | null;
  timeOut: string | null;
  status: string;
  isEventDeleted: boolean;
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
  currentStatusIds: number[];
  currentStatuses: { id: number; label: string }[];
  gender: string | null;
  isHouseholdHead: boolean;
  household: HouseholdOption | null;
}

type AddForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  contactNumber: string;
  role: string;
  hasMemberships: boolean;
  selectedMemberships: number[];
  birthDate: string;
  address: string;
  civilStatusId: number | null;
  currentStatusIds: number[];
  gender: string;
  isHouseholdHead: boolean;
  householdId: number | null;
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
  birthDate: string;
  address: string;
  civilStatusId: number | null;
  currentStatusIds: number[];
  gender: string;
  isHouseholdHead: boolean;
  householdId: number | null;
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

const formatDateShort = (value: string | null | undefined) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const safeParseJson = async (res: Response): Promise<any> => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: `Server error (${res.status}). Please check Laravel logs.` };
  }
};

// Same sage/gold/terracotta family, and the same rotate-by-position
// assignment, as the Budget Snapshot bars on the Dashboard (barTones in
// DashboardView.tsx) -- kept in sync so a membership badge and a budget
// bar in the same slot always read as the same color.
const BADGE_COLORS = [
  "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  "bg-gold-400/15 text-gold-300",
  "bg-[#2E8E82]/15 text-[#7DD8CB]",
  "bg-gold-500/15 text-gold-200",
  "bg-white/10 text-white/70",
  "bg-[#4FBEB0]/10 text-[#4FBEB0]",
  "bg-gold-400/10 text-gold-400",
  "bg-white/[0.08] text-white/60",
];

const getMembershipBadgeStyle = (idx: number) =>
  BADGE_COLORS[idx % BADGE_COLORS.length];

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
  birthDate: "",
  address: "",
  civilStatusId: null,
  currentStatusIds: [],
  gender: "",
  isHouseholdHead: false,
  householdId: null,
});

// ─── Normalize helper for duplicate checking ──────────────────────────────────
const normalizeName = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResidentsView() {
  const { t } = useLanguage();
  const [residentsData, setResidentsData] = useState<ResidentRow[]>([]);
  const [availableMemberships, setAvailableMemberships] = useState<Membership[]>([]);
  const [householdOptions, setHouseholdOptions] = useState<HouseholdOption[]>([]);

  // ─── Quick "add new household" panel (opened from either resident form) ──
  const [showAddHousehold, setShowAddHousehold] = useState<false | { isEdit: boolean }>(false);
  const [newHouseholdAddress, setNewHouseholdAddress] = useState("");
  const [newHouseholdContact, setNewHouseholdContact] = useState("");
  const [addHouseholdSaving, setAddHouseholdSaving] = useState(false);
  const [addHouseholdError, setAddHouseholdError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  // Popped up (instead of buried in an inline banner) for every save
  // failure -- validation rejections (e.g. membership eligibility) and
  // generic server/network failures alike -- per "all validations plsss".
  const [apiErrorTitle, setApiErrorTitle] = useState<string>("");

  const [residentSearch, setResidentSearch] = useState("");
  // Simple membership-status filter, matching the pill row on the
  // Residents list (all active residents / has at least one membership /
  // has none yet). Role, account and age-bracket filtering used to live
  // here as separate dropdowns; those are still reachable via search
  // (which already matches on role) and the dedicated Age & Status
  // Categories / Archive pages.
  const [membershipFilter, setMembershipFilter] = useState<"all" | "members" | "not-members">("all");
  const [currentPage, setCurrentPage] = useState(1);
  // High enough that every real barangay resident list renders on one
  // page -- the table itself scrolls, so there's no real ceiling here.
  const itemsPerPage = 5000;

  const [showAddForm, setShowAddForm] = useState(false);
  const [viewRecord, setViewRecord] = useState<string | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [editRecord, setEditRecord] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<string | null>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [showRoleChangedModal, setShowRoleChangedModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const [newResident, setNewResident] = useState<AddForm>(emptyAdd());
  const [addPhotoFile, setAddPhotoFile] = useState<File | null>(null);
  const [addPhotoPreview, setAddPhotoPreview] = useState("");

  const [editingResident, setEditingResident] = useState<EditForm | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState("");
  const [editPhotoChanged, setEditPhotoChanged] = useState(false);

  // Photo "Preview" popup -- shared by the Add and Edit ID Photo fields
  // (only one of those forms is ever open at a time), styled like the
  // system's other receipt/attachment viewers rather than opening the
  // image in a bare new tab.
  const [photoPreviewModal, setPhotoPreviewModal] = useState<{ url: string; label: string; name: string; size: number | null } | null>(null);

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

  // The member currently flagged as head of the selected household (if
  // any). Only one member can ever be head, so reassigning it is never a
  // silent side effect of checking a box on someone else's form -- while
  // this household already has a head, the checkbox stays disabled and
  // explains who to uncheck first. It goes back to editable the moment
  // that person steps down (or is removed from the household).
  const addFormExistingHead = useMemo(() => {
    if (!newResident.householdId) return null;
    return (
      residentsData.find(
        (r) => r.household?.id === newResident.householdId && r.isHouseholdHead
      ) ?? null
    );
  }, [residentsData, newResident.householdId]);

  const editFormExistingHead = useMemo(() => {
    if (!editingResident?.householdId) return null;
    return (
      residentsData.find(
        (r) =>
          r.household?.id === editingResident.householdId &&
          r.isHouseholdHead &&
          r.real_id !== editingResident.real_id
      ) ?? null
    );
  }, [residentsData, editingResident?.householdId, editingResident?.real_id]);

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

  const [currentStatuses, setCurrentStatuses] = useState<CurrentStatusOption[]>([]);
  useEffect(() => {
    fetch("/current-statuses", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CurrentStatusOption[]) => setCurrentStatuses(Array.isArray(d) ? d : []))
      .catch((e) => console.error("current statuses load:", e));
  }, []);

  // ─── Fetch age brackets (Settings -> Profiling) so the "Filter by Age"
  // dropdown always matches whatever bands staff have actually configured,
  // instead of the old hardcoded Child/Youth/Adult/Senior Citizen bands
  // that getAgeGroupAttribute() on the backend no longer uses once a
  // custom bracket is set up. ──────────────────────────────────────────────
  const [ageBrackets, setAgeBrackets] = useState<AgeBracketOption[]>([]);
  useEffect(() => {
    fetch("/age-brackets", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: AgeBracketOption[]) => setAgeBrackets(Array.isArray(d) ? d : []))
      .catch((e) => console.error("age brackets load:", e));
  }, []);

  // ─── Fetch households (for the "link to household" picker) ───────────────
  useEffect(() => {
    fetch("/households/options", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: HouseholdOption[]) => setHouseholdOptions(Array.isArray(d) ? d : []))
      .catch((e) => console.error("households load:", e));
  }, []);

  // Creates the household through the same /households endpoint the
  // Households page itself uses, so a household added here shows up there
  // automatically -- no separate "sync" step needed.
  const submitNewHousehold = async () => {
    if (!showAddHousehold) return;
    setAddHouseholdSaving(true);
    setAddHouseholdError("");
    try {
      const res = await fetch("/households", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": csrfToken(),
        },
        body: JSON.stringify({
          address: newHouseholdAddress.trim() || null,
          contact_number: newHouseholdContact.trim() || null,
        }),
      });
      const body = await safeParseJson(res);
      if (!res.ok) {
        setAddHouseholdError(body?.message || "Failed to create household.");
        return;
      }
      const created: HouseholdOption = { id: body.id, code: body.code, address: body.address };
      setHouseholdOptions((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));

      const { isEdit } = showAddHousehold;
      if (isEdit) {
        setEditingResident((p) => (p ? { ...p, householdId: created.id, isHouseholdHead: false } : p));
      } else {
        setNewResident((p) => ({ ...p, householdId: created.id, isHouseholdHead: false }));
      }

      setShowAddHousehold(false);
      setNewHouseholdAddress("");
      setNewHouseholdContact("");
    } catch (e: any) {
      setAddHouseholdError(e?.message || "Failed to create household.");
    } finally {
      setAddHouseholdSaving(false);
    }
  };

  // ─── Fetch residents ──────────────────────────────────────────────────────
  const fetchResidents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/membership-residents", {
        headers: { Accept: "application/json" },
      });
      const data = await res.json();

      // The endpoint can fail (e.g. a pending migration) and still return
      // a 200 with a non-array JSON body, or a non-2xx status with an
      // error payload -- either way, data.map() below would throw and get
      // silently swallowed by the catch, which used to leave the table
      // looking like "no records" instead of surfacing what went wrong.
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(
          (data && typeof data === "object" && "message" in data ? data.message : null) ||
            `HTTP ${res.status}`
        );
      }

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
        currentStatusIds: Array.isArray(item.current_status_ids) ? item.current_status_ids : [],
        currentStatuses: Array.isArray(item.current_statuses) ? item.current_statuses : [],
        gender: item.gender ?? null,
        isHouseholdHead: !!item.is_household_head,
        household: item.household
          ? { id: item.household.id, code: item.household.code, address: item.household.address ?? null }
          : null,
      }));

      setResidentsData(formatted);
    } catch (e) {
      console.error("residents load:", e);
      setApiErrorTitle(t("errorTitle"));
      setApiError(t("loadResidentsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, []);

  // ─── Fetch real attendance history for whichever resident's profile
  // panel is currently open (GET /users/{id}/attendances) ────────────────
  useEffect(() => {
    setShowQrPanel(false);
    if (!viewRecord) {
      setAttendanceHistory([]);
      return;
    }
    const r = residentsData.find((x) => x.id === viewRecord);
    if (!r) return;
    setAttendanceLoading(true);
    fetch(`/users/${r.real_id}/attendances`, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AttendanceRecord[]) => setAttendanceHistory(Array.isArray(data) ? data : []))
      .catch((e) => {
        console.error("attendance history load:", e);
        setAttendanceHistory([]);
      })
      .finally(() => setAttendanceLoading(false));
  }, [viewRecord]);

  // ─── Small derived helpers for the redesigned list + profile panel ─────
  const initialsFor = (first: string, last: string) => {
    const s = `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}`;
    return s || "?";
  };

  // Real-time household size -- counted straight from the already-loaded
  // resident list (active residents sharing the same household id),
  // rather than a separate/derived count that could drift out of sync.
  const householdSizeFor = (householdId: number | undefined | null) => {
    if (!householdId) return 0;
    return residentsData.filter((x) => x.household?.id === householdId && x.deleted_at === null).length;
  };

  const membershipListFor = (r: ResidentRow) =>
    r.memberships ? r.memberships.split(", ").map((m) => m.trim()).filter(Boolean) : [];

  const isActiveMember = (r: ResidentRow) => membershipListFor(r).length > 0;

  // ─── Photo handlers ───────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setApiErrorTitle(t("validationErrorTitle"));
      setApiError(t("uploadImageOnly"));
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
  // Selecting/deselecting a membership chip immediately updates hasMemberships
  // too, so the two stay in sync without a separate checkbox step.
  const toggleMembership = (id: number, isEdit = false) => {
    if (isEdit) {
      setEditingResident((p) => {
        if (!p) return p;
        const sel = p.selectedMemberships.includes(id)
          ? p.selectedMemberships.filter((x) => x !== id)
          : [...p.selectedMemberships, id];
        return { ...p, selectedMemberships: sel, hasMemberships: sel.length > 0 };
      });
    } else {
      setNewResident((p) => {
        const sel = p.selectedMemberships.includes(id)
          ? p.selectedMemberships.filter((x) => x !== id)
          : [...p.selectedMemberships, id];
        return { ...p, selectedMemberships: sel, hasMemberships: sel.length > 0 };
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
    setFormErrors(err);
    if (Object.keys(err).length > 0) setApiError(Object.values(err)[0]);
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
    setFormErrors(err);
    if (Object.keys(err).length > 0) setApiError(Object.values(err)[0]);
    return Object.keys(err).length === 0;
  };

  // ─── ADD: POST /users ─────────────────────────────────────────────────────
  // Runs the local validation + duplicate-name check synchronously, and
  // only opens the confirm step once those pass -- the actual POST moved
  // to performAddResident, which fires after the user confirms.
  const handleAddResident = (e: React.FormEvent) => {
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

    setShowAddConfirm(true);
  };

  const performAddResident = async () => {
    setShowAddConfirm(false);
    const fd = new FormData();
    fd.append("first_name", newResident.firstName);
    fd.append("middle_name", newResident.middleName);
    fd.append("last_name", newResident.lastName);
    fd.append("contact_number", newResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", newResident.role);
    // Registering a resident here never creates a portal login -- account
    // access is granted separately, not as a side effect of adding a
    // resident record. Omitting has_account leaves it false server-side
    // (see UserController::store).
    if (addPhotoFile) fd.append("validation_id", addPhotoFile);
    if (newResident.hasMemberships && newResident.selectedMemberships.length > 0)
      newResident.selectedMemberships.forEach((id) => fd.append("membership_ids[]", String(id)));

    // Adviser recommendation: age profiling + household SMS notify
    if (newResident.birthDate) fd.append("birth_date", newResident.birthDate);
    if (newResident.address) fd.append("address", newResident.address);
    if (newResident.civilStatusId) fd.append("civil_status_id", String(newResident.civilStatusId));
    newResident.currentStatusIds.forEach((id) => fd.append("current_status_ids[]", String(id)));
    if (newResident.gender) fd.append("gender", newResident.gender);
    if (newResident.householdId) fd.append("household_id", String(newResident.householdId));
    fd.append("is_household_head", newResident.isHouseholdHead ? "1" : "0");

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
          // Pop up every validation message (not just the first per field)
          // -- membership eligibility can return several at once, e.g.
          // "requires age group: Senior Citizen" AND "requires gender: Female".
          setApiErrorTitle(t("validationErrorTitle"));
          setApiError(Object.values(body.errors).flat().join(" "));
        } else {
          setApiErrorTitle(t("errorTitle"));
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
      setApiErrorTitle(t("errorTitle"));
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
      birthDate: r.birthDate ?? "",
      address: r.address ?? "",
      civilStatusId: r.civilStatusId ?? null,
      currentStatusIds: r.currentStatusIds ?? [],
      gender: r.gender ?? "",
      isHouseholdHead: r.isHouseholdHead ?? false,
      householdId: r.household?.id ?? null,
    };

    setEditingResident(state);
    setInitialEditData(JSON.stringify(state));
    setEditPhotoFile(null);
    setEditPhotoPreview(r.photo);
    setEditPhotoChanged(false);
  }, [editRecord, residentsData, availableMemberships]);

  // ─── UPDATE: POST /users/{id} with _method=PUT ───────────────────────────
  const handleUpdateResident = (e: React.FormEvent) => {
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

    setShowEditConfirm(true);
  };

  const performUpdateResident = async () => {
    setShowEditConfirm(false);
    if (!editRecord || !editingResident) return;

    const fd = new FormData();
    fd.append("_method", "PUT");
    fd.append("first_name", editingResident.firstName);
    fd.append("middle_name", editingResident.middleName);
    fd.append("last_name", editingResident.lastName);
    fd.append("contact_number", editingResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", editingResident.role);

    // This page only manages an account that already exists (a password
    // reset) -- it never grants a new one, so has_account simply carries
    // the resident's current state through unchanged.
    fd.append("has_account", editingResident.hasAccount ? "1" : "0");
    if (editingResident.hasAccount && editingResident.password.trim()) {
      fd.append("password", editingResident.password);
    }

    if (editPhotoFile) fd.append("validation_id", editPhotoFile);

    // Adviser recommendation: age profiling + household SMS notify
    fd.append("birth_date", editingResident.birthDate || "");
    fd.append("address", editingResident.address || "");
    fd.append("civil_status_id", editingResident.civilStatusId ? String(editingResident.civilStatusId) : "");
    if (editingResident.currentStatusIds.length > 0) {
      editingResident.currentStatusIds.forEach((id) => fd.append("current_status_ids[]", String(id)));
    } else {
      fd.append("current_status_ids", "");
    }
    fd.append("gender", editingResident.gender || "");
    fd.append("household_id", editingResident.householdId ? String(editingResident.householdId) : "");
    fd.append("is_household_head", editingResident.isHouseholdHead ? "1" : "0");

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
          setApiErrorTitle(t("validationErrorTitle"));
          setApiError(Object.values(body.errors).flat().join(" "));
        } else {
          setApiErrorTitle(t("errorTitle"));
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
      setApiErrorTitle(t("errorTitle"));
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

  // Restoring an archived resident is handled on the Archive page, which
  // already covers every soft-deletable record type -- this page only
  // ever shows active residents, so it doesn't need its own restore flow.

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
    // Archived/trashed residents live on the Archive page now -- this
    // list only ever shows active records.
    let r = residentsData.filter((x) => x.deleted_at === null);

    if (membershipFilter === "members") r = r.filter((x) => isActiveMember(x));
    else if (membershipFilter === "not-members") r = r.filter((x) => !isActiveMember(x));

    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      r = r.filter((x) =>
        [x.id, x.lastName, x.firstName, x.middleName, x.contactNumber, x.memberships, x.role]
          .some((f) => f?.toLowerCase().includes(q))
      );
    }
    return r;
  }, [residentsData, membershipFilter, residentSearch]);

  const totalPages = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);

  const paginatedResidents = useMemo(
    () => filteredResidents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredResidents, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [residentSearch, membershipFilter]);

  // ─── Sub-components ───────────────────────────────────────────────────────
  // Current Status is many-to-many (a resident can be, say, both a Solo
  // Parent and PWD at once), so this is a checkbox list rather than a
  // single-select dropdown -- same shape as MembershipCheckboxes below.
  const CurrentStatusCheckboxes = ({ isEdit }: { isEdit: boolean }) => {
    const selected = isEdit ? editingResident?.currentStatusIds ?? [] : newResident.currentStatusIds;

    const toggle = (id: number) => {
      if (isEdit) {
        setEditingResident((p) =>
          p
            ? {
                ...p,
                currentStatusIds: p.currentStatusIds.includes(id)
                  ? p.currentStatusIds.filter((x) => x !== id)
                  : [...p.currentStatusIds, id],
              }
            : p
        );
      } else {
        setNewResident((p) => ({
          ...p,
          currentStatusIds: p.currentStatusIds.includes(id)
            ? p.currentStatusIds.filter((x) => x !== id)
            : [...p.currentStatusIds, id],
        }));
      }
    };

    return (
      <div>
        <label className="block text-base font-semibold text-white mb-1.5">{t("currentStatusLabel")}</label>
        {currentStatuses.length === 0 ? (
          <p className="text-sm text-white/60 italic">{t("noCurrentStatusesAvailable")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-white/25 bg-white/10 px-5 py-4">
            {[...currentStatuses].sort((a, b) => a.label.localeCompare(b.label)).map((cs) => (
              <label key={cs.id} className="flex items-center gap-2.5 text-base text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(cs.id)}
                  onChange={() => toggle(cs.id)}
                  className="w-5 h-5 text-[#4FBEB0]"
                />
                <span>{cs.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const MembershipPicker = ({ isEdit }: { isEdit: boolean }) => {
    const [membershipSearch, setMembershipSearch] = useState("");
    const selMems = isEdit ? editingResident?.selectedMemberships ?? [] : newResident.selectedMemberships;
    const count = selMems.length;

    const selectedMemberships = availableMemberships
      .filter((m) => selMems.includes(m.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const query = membershipSearch.trim().toLowerCase();
    const filteredAvailable = availableMemberships
      .filter((m) => !selMems.includes(m.id) && m.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="rounded-2xl border border-white/25 bg-white/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-wide text-gold-300">Membership</p>
          <span
            className={`inline-flex items-center rounded-full text-[11px] font-semibold px-2.5 py-1 transition-colors ${
              count > 0 ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.05] text-white/40"
            }`}
          >
            {count > 0 ? `${count} selected` : "None selected"}
          </span>
        </div>
        <p className="text-sm text-white/60">Search and tap a program to enroll this resident in real time.</p>

        {count > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {selectedMemberships.map((mem) => (
              <span
                key={mem.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/20 text-[#7DD8CB] pl-4 pr-2 py-2 text-base font-medium shadow-sm"
              >
                {mem.name}
                <button
                  type="button"
                  onClick={() => toggleMembership(mem.id, isEdit)}
                  aria-label={`Remove ${mem.name}`}
                  className="rounded-full p-0.5 hover:bg-white/10 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {availableMemberships.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={membershipSearch}
              onChange={(e) => setMembershipSearch(e.target.value)}
              placeholder="Search membership programs..."
              className="h-12 w-full rounded-full border border-white/25 bg-white/10 pl-11 pr-4 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
            />
          </div>
        )}

        {availableMemberships.length === 0 ? (
          <p className="text-sm text-white/60 italic">{t("noMembershipsAvailable")}</p>
        ) : filteredAvailable.length === 0 ? (
          <p className="text-sm text-white/60 italic">
            {query ? "No matching programs." : "All programs have been added."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredAvailable.map((mem) => (
              <button
                key={mem.id}
                type="button"
                onClick={() => toggleMembership(mem.id, isEdit)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-base font-medium text-white hover:bg-white/20 hover:border-white/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#4FBEB0]" />
                {mem.name}
              </button>
            ))}
          </div>
        )}

        {formErrors.membership_ids && (
          <p className="text-red-400 text-xs">{formErrors.membership_ids}</p>
        )}
      </div>
    );
  };

  const PhotoField = ({ isEdit }: { isEdit: boolean }) => {
    const preview = isEdit ? editPhotoPreview : addPhotoPreview;
    const file = isEdit ? editPhotoFile : addPhotoFile;
    const inputId = isEdit ? "edit-photo-file-input" : "add-photo-file-input";
    // A resident being edited may already have a saved photo (preview set
    // from the server) with no freshly-picked File yet -- fall back to a
    // generic label instead of claiming "No file chosen" in that case.
    const displayName = file ? file.name : preview ? "Current photo" : "No file chosen";
    return (
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-colors bg-white/10 ${
          preview ? "border-[#4FBEB0]/50" : formErrors.photo ? "border-red-500" : "border-white/25"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-bold uppercase tracking-wide text-white">
              {t("idPhotoFieldLabel")}{" "}
              <span className="text-white/50 font-medium normal-case">({t("optionalLabel")})</span>
            </p>
            <p className="mt-1 text-sm text-white/60 italic">A clear, recent photo used for the resident's ID.</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {preview && (
              <img src={preview} alt="Preview" className="h-14 w-14 rounded-full object-cover border border-white/15 shrink-0" />
            )}
            <div className="w-full sm:w-64">
              <div
                className={`flex items-center justify-between gap-2 rounded-full border px-5 py-2.5 text-base bg-white/10 ${
                  preview ? "border-[#4FBEB0]/50 text-[#7DD8CB]" : "border-white/25 text-white/50"
                }`}
              >
                <span className="truncate">{displayName}</span>
                {preview && <CheckCircle className="h-4 w-4 text-[#4FBEB0] shrink-0" />}
              </div>
            </div>
          </div>
        </div>

        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={(e) => handlePhotoChange(e, isEdit)}
          className="hidden"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <label
            htmlFor={inputId}
            className="cursor-pointer inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition"
          >
            {preview ? "Replace" : "Choose File"}
          </label>
          {preview && (
            <>
              <button
                type="button"
                onClick={() =>
                  setPhotoPreviewModal({
                    url: preview,
                    label: t("idPhotoFieldLabel"),
                    name: displayName,
                    size: file ? file.size : null,
                  })
                }
                className="inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => handleRemovePhoto(isEdit)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-base font-semibold text-red-400 hover:bg-red-500/10 transition"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </>
          )}
          <span className="text-[11px] text-white/40 sm:ml-auto">JPG, PNG, GIF, or WEBP</span>
        </div>

        {formErrors.photo && (
          <p className="text-red-400 text-xs mt-2 font-medium">⚠ {formErrors.photo}</p>
        )}
      </div>
    );
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  const activeResidents = residentsData.filter((x) => x.deleted_at === null);
  const membersCount = activeResidents.filter((x) => isActiveMember(x)).length;

  return (
    <div className="space-y-5">
      {/* Full-bleed dark navy page, same technique and palette as the
          Dashboard: cancels the shared content area's own padding so this
          view reads as its own immersive "masterlist" instead of sitting
          inside the light staff-shell padding. Add/Edit forms and the
          smaller confirm modals further below are left on their original
          light theme since they're full-screen takeovers, not part of the
          list surface itself. */}
      <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("residentsMasterList")}</h1>
          <p className="text-sm text-white/50 mt-1 max-w-xl">{t("residentsSubtitle")}</p>
        </div>
        <button
          onClick={handleOpenAddForm}
          className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md shrink-0"
        >
          Register resident
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
            <UserPlus className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      {/* Search + membership filter pills */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={residentSearch}
              onChange={(e) => setResidentSearch(e.target.value)}
              placeholder={t("searchByIdNameContactPlaceholder")}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
            {[
              { key: "all" as const, label: `${t("allRecordsOption")} (${activeResidents.length})` },
              { key: "members" as const, label: `Members (${membersCount})` },
              { key: "not-members" as const, label: "Not yet members" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMembershipFilter(opt.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  membershipFilter === opt.key ? "bg-gold-400 text-[#08130F]" : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white">{t("residentsMasterList")}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#7DD8CB]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
              </span>
              Live
            </span>
          </div>
          <p className="text-xs text-white/45">{filteredResidents.length} records</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">Resident</th>
                <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">Age</th>
                <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">Contact</th>
                <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">Household</th>
                <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">Membership</th>
                <th className="py-3 px-4 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-white/40 italic">{t("loading")}</td>
                </tr>
              ) : paginatedResidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-white/40 italic">{t("noRecordsMatchFilter")}</td>
                </tr>
              ) : (
                paginatedResidents.map((r) => {
                  const size = householdSizeFor(r.household?.id);
                  const active = isActiveMember(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setViewRecord(r.id)}
                      className="group border-b border-white/[0.06] last:border-0 cursor-pointer transition-colors hover:bg-white/[0.05]"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-full bg-[#123A38] border border-white/10 flex items-center justify-center text-xs font-bold text-[#7DD8CB] transition-transform duration-200 group-hover:scale-105">
                            {initialsFor(r.firstName, r.lastName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{highlightText(`${r.firstName} ${r.lastName}`, residentSearch)}</p>
                            <p className="text-xs text-white/35 font-mono">{r.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white/60">{r.age !== null ? r.age : "—"}</td>
                      <td className="py-3 px-4 text-white/60">{highlightText(r.contactNumber, residentSearch)}</td>
                      <td className="py-3 px-4 text-white/60">{size > 0 ? `${size} pax` : "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            active ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.06] text-white/45"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#4FBEB0]" : "bg-white/30"}`} />
                          {active ? "Active member" : "Not a member"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <ChevronRight className="h-4 w-4 text-white/25 inline-block transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gold-400" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
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
        )}
      </div>
      </div>
      </div>

      {/* ─── Resident profile slide-over ──────────────────────────────────────── */}
      {viewRecord && (() => {
        const r = residentsData.find((x) => x.id === viewRecord);
        if (!r) return null;
        const allMems = membershipListFor(r);
        const active = isActiveMember(r);
        const size = householdSizeFor(r.household?.id);
        // Encodes the same shape the QR Scanner already reads back out
        // (see ScanView.handleQRCodeScan: data.user_id / user_code / name).
        const qrPayload = JSON.stringify({
          user_id: r.real_id,
          user_code: r.id,
          name: `${r.firstName} ${r.lastName}`,
        });

        const infoRows: [string, React.ReactNode][] = [
          ["Contact number", r.contactNumber || "—"],
          ["Birthdate", formatDateShort(r.birthDate)],
          ["Purok", r.address || "—"],
        ];
        if (r.age !== null) infoRows.push(["Age", `${r.age}${r.ageGroup ? ` · ${r.ageGroup}` : ""}`]);
        if (r.gender) infoRows.push(["Gender", r.gender === "Male" ? t("maleOption") : t("femaleOption")]);
        if (r.civilStatus) infoRows.push(["Civil status", r.civilStatus]);
        infoRows.push(["Household size", size > 0 ? `${size} member${size === 1 ? "" : "s"}` : "—"]);
        infoRows.push(["Role", r.role]);

        return (
          <>
            {/* Back to a right-anchored slide-over drawer (dimmed backdrop,
                fixed narrower width, slides in from the right edge) rather
                than the full content-area take-over used for Add/Edit --
                but keeps that redesign's section styling (underlined ink
                headers, caption-over-value fields) inside it. Same data,
                same handlers -- styling only. */}
            <style>{`
              @keyframes residentProfileSlideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              .resident-profile-slide-in { animation: residentProfileSlideIn 280ms ease-out; }
            `}</style>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setViewRecord(null)} />
            <div className="resident-profile-slide-in fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-[#0A0E1A] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">
              <img
                src="/logo-removebg-preview.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute z-0 bottom-[-3rem] right-[-3rem] h-72 w-72 object-contain opacity-[0.05]"
              />

              <div className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0 bg-[#0A0E1A]">
                <h2 className="font-display text-lg font-bold text-white">Residents Profile</h2>
                <button onClick={() => setViewRecord(null)} className="text-white/50 hover:text-white">
                  <XIcon size={20} />
                </button>
              </div>

              <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6">
                {r.deleted_at !== null && (
                  <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 px-4 py-2.5 text-sm text-center">
                    ⚠ {t("recordDeletedWarning")}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-[#123A38] border border-white/10 flex items-center justify-center text-lg font-bold text-[#7DD8CB] overflow-hidden shrink-0">
                    {r.photo ? (
                      <img src={r.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsFor(r.firstName, r.lastName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-display text-xl font-extrabold text-white truncate">
                      {r.firstName} {r.middleName} {r.lastName}
                    </h1>
                    <p className="text-xs text-white/40 font-mono mt-0.5">{r.id}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                      active ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.06] text-white/45"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#4FBEB0]" : "bg-white/30"}`} />
                    {active ? "Active" : "Not a member"}
                  </span>
                </div>

                <section className="mt-8">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white pb-2.5 border-b-2 border-white/40 mb-5">
                    Personal Information
                  </h2>
                  <div className="grid grid-cols-1 gap-y-4">
                    {infoRows.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">{label}</span>
                        <span className="text-sm font-medium text-white text-right">{value}</span>
                      </div>
                    ))}
                    {r.household && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Household</span>
                        <span className="text-sm font-medium text-white text-right">
                          {r.household.code}
                          {r.isHouseholdHead && (
                            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-400/15 text-gold-300 align-middle">
                              {t("headBadgeLabel") || "Head"}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {r.currentStatuses.length > 0 && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/40 shrink-0">Status</span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.currentStatuses.map((cs) => (
                            <span key={cs.id} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#4FBEB0]/10 text-[#7DD8CB]">
                              {cs.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="mt-8">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white pb-2.5 border-b-2 border-white/40 mb-5">
                    Membership
                  </h2>
                  {allMems.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allMems.map((m, i) => (
                        <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(i)}`}>
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowQrPanel(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/30 px-4 py-2 text-xs font-semibold text-gold-300 hover:bg-gold-400/10 transition-colors"
                  >
                    <QrCode className="h-3.5 w-3.5" /> View QR code
                  </button>
                </section>

                <section className="mt-8">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white pb-2.5 border-b-2 border-white/40 mb-5">
                    Attendance History
                  </h2>
                  {attendanceLoading ? (
                    <p className="text-sm text-white/40 italic">{t("loading")}</p>
                  ) : attendanceHistory.length === 0 ? (
                    <p className="text-sm text-white/40 italic">No attendance recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {attendanceHistory.slice(0, 8).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 text-sm rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{a.isEventDeleted ? "(deleted event)" : a.eventTitle}</p>
                            {a.eventDate && <p className="text-xs text-white/40">{formatDateShort(a.eventDate)}</p>}
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              a.status === "Complete" ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-gold-400/15 text-gold-300"
                            }`}
                          >
                            {a.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="relative z-10 flex items-center gap-3 px-6 py-4 border-t border-white/10 shrink-0 bg-[#0A0E1A]">
                {r.deleted_at === null && (
                  <button
                    onClick={() => setDeleteRecord(r.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-300 hover:underline"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {r.deleted_at === null && !r.hasAccount && (
                    <button
                      onClick={() => {
                        setEditRecord(r.id);
                        setViewRecord(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/30 px-4 py-2 text-sm font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add account
                    </button>
                  )}
                  {r.deleted_at === null && (
                    <button
                      onClick={() => {
                        setEditRecord(r.id);
                        setViewRecord(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit record
                    </button>
                  )}
                  <button
                    onClick={() => setViewRecord(null)}
                    className="rounded-full bg-gold-400 hover:bg-gold-500 text-[#08130F] px-5 py-2 text-sm font-bold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>

            {showQrPanel && (
              <div
                className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
                onClick={() => setShowQrPanel(false)}
              >
                <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl p-6 shadow-2xl text-center max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
                  <p className="font-display text-base font-bold text-white mb-1">
                    {r.firstName} {r.lastName}
                  </p>
                  <p className="text-xs text-white/40 mb-4 font-mono">{r.id}</p>
                  <div className="flex justify-center mb-4">
                    <div className="rounded-xl bg-white p-3">
                      <QRCodeCanvas ref={qrCanvasRef} value={qrPayload} size={180} bgColor="#ffffff" fgColor="#0A0E1A" />
                    </div>
                  </div>
                  <p className="text-xs text-white/45 mb-4">Scan this at the QR Scanner to sign this resident in or out.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        const canvas = qrCanvasRef.current;
                        if (!canvas) return;
                        const link = document.createElement("a");
                        link.href = canvas.toDataURL("image/png");
                        link.download = `${r.id}-qr.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => setShowQrPanel(false)}
                      className="rounded-full bg-gold-400 hover:bg-gold-500 text-[#08130F] px-5 py-2 text-sm font-bold transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ─── Add Page ─────────────────────────────────────────────────────────────
          Full-page take-over instead of a small centered dialog -- plain white
          background with a faded app logo watermarked at the bottom right, and
          bold underlined section headers in ink (#1A1A1A) rather than the usual
          sage caption pills, per the "register resident" layout redesign. Same
          fields, same handlers -- styling only. */}
      {showAddForm && (
        <div className="fixed top-[73px] bottom-0 left-0 right-0 md:left-[280px] z-30 bg-[#0A0E1A] overflow-y-auto">
          <img
            src="/logo-removebg-preview.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none fixed z-0 bottom-[-4rem] right-[-4rem] h-[28rem] w-[28rem] sm:h-[40rem] sm:w-[40rem] object-contain opacity-20"
          />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10 sm:px-12 sm:py-14">
            <button
              type="button"
              onClick={handleCancelAdd}
              className="inline-flex items-center gap-2 text-base font-semibold text-white hover:opacity-70 transition mb-8"
            >
              <ArrowLeft className="h-5 w-5" /> {t("cancel")}
            </button>

            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white text-center tracking-tight">
              {t("addNewRecordTitle")}
            </h1>
            <p className="mt-3 text-base text-white/60 text-center max-w-md mx-auto">
              Fill in the resident's basic information, profile, and household details.
            </p>

            <form onSubmit={handleAddResident} noValidate className="mt-10 space-y-10">
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  Basic Information
                </h2>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    {(["firstName", "middleName", "lastName"] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-base font-semibold text-white mb-1.5">
                          {field === "firstName" ? t("firstNameRequiredLabel") : field === "middleName" ? t("middleNameLabel") : t("lastNameRequiredLabel")}
                        </label>
                        <input
                          type="text"
                          required={field !== "middleName"}
                          value={newResident[field]}
                          onChange={(e) => setNewResident((p) => ({ ...p, [field]: capitalizeName(e.target.value) }))}
                          className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            formErrors[field] ? "border-red-500" : "border-white/25"
                          }`}
                        />
                        {formErrors[field] && <p className="text-red-400 text-xs mt-1">{formErrors[field]}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("roleRequiredLabel")}</label>
                      <div className="relative">
                        <select
                          required
                          value={newResident.role}
                          onChange={(e) => setNewResident((p) => ({ ...p, role: e.target.value }))}
                          className={`w-full appearance-none rounded-full border px-5 py-3.5 pr-11 text-base bg-white/10 font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            !newResident.role ? "text-white/40" : "text-white"
                          } ${formErrors.role ? "border-red-500" : "border-white/25"}`}
                        >
                          <option value="" style={{ display: "none" }}>{t("chooseARoleOption")}</option>
                          <option value="Resident" className="bg-[#0A0E1A] text-white">{t("residentOption")}</option>
                          <option value="Staff" className="bg-[#0A0E1A] text-white">{t("staffOption")}</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                      {formErrors.role && <p className="text-red-400 text-xs mt-1">{formErrors.role}</p>}
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("contactNumberRequiredLabel")}</label>
                      <input
                        type="text"
                        required
                        value={newResident.contactNumber}
                        onChange={(e) => setNewResident((p) => ({ ...p, contactNumber: formatContactNumber(e.target.value) }))}
                        className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                          formErrors.contactNumber ? "border-red-500" : "border-white/25"
                        }`}
                        placeholder="09XX-XXX-XXXX"
                        maxLength={13}
                      />
                      {newResident.contactNumber.length > 0 && !newResident.contactNumber.startsWith("09") && (
                        <p className="text-amber-400 text-xs mt-1">⚠ {t("numberMustStart09Warning")}</p>
                      )}
                      {formErrors.contactNumber && <p className="text-red-400 text-xs mt-1">{formErrors.contactNumber}</p>}
                    </div>
                  </div>

                  <PhotoField isEdit={false} />
                </div>
              </section>

              {/* Adviser recommendations: age profiling + household SMS notify */}
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("profileHouseholdLabel")}
                </h2>
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("birthDateLabel")}</label>
                      <DatePicker
                        value={newResident.birthDate}
                        max={new Date().toISOString().split("T")[0]}
                        onChange={(iso) => setNewResident((p) => ({ ...p, birthDate: iso }))}
                        className="px-5 py-3.5"
                        dark
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("addressPurokLabel")}</label>
                      <input
                        type="text"
                        value={newResident.address}
                        onChange={(e) => setNewResident((p) => ({ ...p, address: e.target.value }))}
                        placeholder={t("purokPlaceholder")}
                        className="w-full rounded-full border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("civilStatusLabel")}</label>
                      <div className="relative">
                        <select
                          value={newResident.civilStatusId ?? ""}
                          onChange={(e) => setNewResident((p) => ({ ...p, civilStatusId: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" className="bg-[#0A0E1A] text-white">{t("anyOptionLabel")}</option>
                          {civilStatuses.map((cs) => (
                            <option key={cs.id} value={cs.id} className="bg-[#0A0E1A] text-white">{cs.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("genderLabel")}</label>
                      <div className="relative">
                        <select
                          value={newResident.gender}
                          onChange={(e) => setNewResident((p) => ({ ...p, gender: e.target.value }))}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" className="bg-[#0A0E1A] text-white">{t("anyOptionLabel")}</option>
                          <option value="Male" className="bg-[#0A0E1A] text-white">{t("maleOption")}</option>
                          <option value="Female" className="bg-[#0A0E1A] text-white">{t("femaleOption")}</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                    </div>
                  </div>
                  <CurrentStatusCheckboxes isEdit={false} />
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("householdCodeLabel")}</label>
                    <SearchableSelect
                      options={householdOptions.map((h) => ({
                        value: String(h.id),
                        label: h.code,
                        hint: h.address ? `(${h.address})` : undefined,
                      }))}
                      onSelect={(value) => setNewResident((p) => ({ ...p, householdId: Number(value), isHouseholdHead: false }))}
                      placeholder={t("householdCodePlaceholder")}
                      noResultsLabel={t("householdLinkNoResults")}
                      footerLabel="Add new household"
                      onFooterClick={() => setShowAddHousehold({ isEdit: false })}
                      dark
                    />
                    <p className="mt-1 text-sm text-white/60">{t("manageHouseholdHint")}</p>
                    {newResident.householdId && (() => {
                      const picked = householdOptions.find((h) => h.id === newResident.householdId);
                      return (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] text-xs font-medium px-3 py-1">
                          🏠 {picked?.code ?? `#${newResident.householdId}`}
                          <button
                            type="button"
                            onClick={() => setNewResident((p) => ({ ...p, householdId: null, isHouseholdHead: false }))}
                            className="ml-1 text-[#7DD8CB]/70 hover:text-[#7DD8CB]"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  <label className={`flex items-center gap-2 text-base ${newResident.householdId && !addFormExistingHead ? "cursor-pointer" : "cursor-not-allowed"}`}>
                    <input
                      type="checkbox"
                      checked={newResident.isHouseholdHead}
                      disabled={!newResident.householdId || !!addFormExistingHead}
                      onChange={(e) => setNewResident((p) => ({ ...p, isHouseholdHead: e.target.checked }))}
                      className="w-5 h-5 text-[#4FBEB0] disabled:opacity-40"
                    />
                    <span className={`font-medium ${newResident.householdId && !addFormExistingHead ? "text-white" : "text-white/60"}`}>{t("headOfHouseholdCheckboxLabel")}</span>
                    <span className="text-white/60">
                      {!newResident.householdId
                        ? t("householdHeadDisabledHint")
                        : addFormExistingHead
                        ? t("householdHeadTakenHint")
                        : t("receivesEventSmsNote")}
                    </span>
                  </label>
                  {addFormExistingHead && (
                    <p className="text-xs text-gold-300 bg-gold-500/10 border border-gold-500/25 rounded-full px-3 py-1.5">
                      ⚠️ {t("currentHeadLabel")}: <span className="font-medium">{[addFormExistingHead.firstName, addFormExistingHead.lastName].filter(Boolean).join(" ")}</span> · {t("uncheckHeadFirstNote")}
                    </p>
                  )}
                </div>
              </section>

              <MembershipPicker isEdit={false} />

              <div className="pt-2 pb-4">
                <button
                  type="submit"
                  disabled={!hasAddChanges}
                  className={`group w-full inline-flex items-center justify-center gap-3 rounded-full border pl-6 pr-2 py-2 text-base font-semibold uppercase tracking-wide shadow-sm transition-all duration-500 ease-out ${
                    hasAddChanges
                      ? "border-[#1E3A5F] bg-[#1E3A5F] text-white hover:border-[#122436] hover:bg-[#122436] hover:shadow-md"
                      : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
                  }`}
                >
                  {t("saveRecordButton")}
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ease-out ${
                      hasAddChanges ? "bg-[#0A0E1A] group-hover:bg-white/15" : "bg-white/5"
                    }`}
                  >
                    <Save className={`h-5 w-5 ${hasAddChanges ? "text-white" : "text-white/20"}`} />
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Page ────────────────────────────────────────────────────────────
          Same full-page take-over as the Add page above -- plain white
          background, faded logo watermark, ink (#1A1A1A) underlined section
          headers -- for a consistent Add/Edit experience. Same fields, same
          handlers -- styling only. */}
      {editRecord && editingResident && (
        <div className="fixed top-[73px] bottom-0 left-0 right-0 md:left-[280px] z-30 bg-[#0A0E1A] overflow-y-auto">
          <img
            src="/logo-removebg-preview.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none fixed z-0 bottom-[-4rem] right-[-4rem] h-[28rem] w-[28rem] sm:h-[40rem] sm:w-[40rem] object-contain opacity-20"
          />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10 sm:px-12 sm:py-14">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-2 text-base font-semibold text-white hover:opacity-70 transition mb-8"
            >
              <ArrowLeft className="h-5 w-5" /> {t("cancel")}
            </button>

            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white text-center tracking-tight">
              {t("editRecordTitle")}
            </h1>
            <p className="mt-3 text-base text-white/60 text-center max-w-md mx-auto">
              Update this resident's basic information, profile, and household details.
            </p>

            {editingResident.deleted_at !== null && (
              <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 text-red-400 px-4 py-2.5 text-sm text-center">
                ⚠️ {t("recordDeletedEditingDisabled")}
              </div>
            )}

            <form
              onSubmit={handleUpdateResident}
              noValidate
              className="mt-10 space-y-10"
              style={{
                pointerEvents: editingResident.deleted_at !== null ? "none" : "auto",
                opacity: editingResident.deleted_at !== null ? 0.6 : 1,
              }}
            >
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  Basic Information
                </h2>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    {(["firstName", "middleName", "lastName"] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-base font-semibold text-white mb-1.5">
                          {field === "firstName" ? t("firstNameRequiredLabel") : field === "middleName" ? t("middleNameLabel") : t("lastNameRequiredLabel")}
                        </label>
                        <input
                          type="text"
                          required={field !== "middleName"}
                          value={editingResident[field]}
                          onChange={(e) =>
                            setEditingResident((p) => p ? { ...p, [field]: capitalizeName(e.target.value) } : p)
                          }
                          className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            formErrors[field] ? "border-red-500" : "border-white/25"
                          }`}
                        />
                        {formErrors[field] && <p className="text-red-400 text-xs mt-1">{formErrors[field]}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("roleRequiredLabel")}</label>
                      <div className="relative">
                        <select
                          required
                          value={editingResident.role}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, role: e.target.value } : p)}
                          className={`w-full appearance-none rounded-full border px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            formErrors.role ? "border-red-500" : "border-white/25"
                          }`}
                        >
                          <option value="Resident" className="bg-[#0A0E1A] text-white">{t("residentOption")}</option>
                          <option value="Staff" className="bg-[#0A0E1A] text-white">{t("staffOption")}</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                      {formErrors.role && <p className="text-red-400 text-xs mt-1">{formErrors.role}</p>}
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("contactNumberRequiredLabel")}</label>
                      <input
                        type="text"
                        required
                        value={editingResident.contactNumber}
                        onChange={(e) =>
                          setEditingResident((p) => p ? { ...p, contactNumber: formatContactNumber(e.target.value) } : p)
                        }
                        className={`w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                          formErrors.contactNumber ? "border-red-500" : "border-white/25"
                        }`}
                        placeholder="09XX-XXX-XXXX"
                        maxLength={13}
                      />
                      {editingResident.contactNumber.length > 0 && !editingResident.contactNumber.startsWith("09") && (
                        <p className="text-amber-400 text-xs mt-1">⚠ {t("numberMustStart09Warning")}</p>
                      )}
                      {formErrors.contactNumber && <p className="text-red-400 text-xs mt-1">{formErrors.contactNumber}</p>}
                    </div>
                  </div>

                  <PhotoField isEdit={true} />
                </div>
              </section>

              {/* Adviser recommendations: age profiling + household SMS notify */}
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("profileHouseholdLabel")}
                </h2>
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("birthDateLabel")}</label>
                      <DatePicker
                        value={editingResident.birthDate}
                        max={new Date().toISOString().split("T")[0]}
                        onChange={(iso) => setEditingResident((p) => p ? { ...p, birthDate: iso } : p)}
                        className="px-5 py-3.5"
                        dark
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("addressPurokLabel")}</label>
                      <input
                        type="text"
                        value={editingResident.address}
                        onChange={(e) => setEditingResident((p) => p ? { ...p, address: e.target.value } : p)}
                        placeholder={t("purokPlaceholder")}
                        className="w-full rounded-full border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("civilStatusLabel")}</label>
                      <div className="relative">
                        <select
                          value={editingResident.civilStatusId ?? ""}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, civilStatusId: e.target.value ? Number(e.target.value) : null } : p)}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" className="bg-[#0A0E1A] text-white">{t("anyOptionLabel")}</option>
                          {civilStatuses.map((cs) => (
                            <option key={cs.id} value={cs.id} className="bg-[#0A0E1A] text-white">{cs.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("genderLabel")}</label>
                      <div className="relative">
                        <select
                          value={editingResident.gender}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, gender: e.target.value } : p)}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" className="bg-[#0A0E1A] text-white">{t("anyOptionLabel")}</option>
                          <option value="Male" className="bg-[#0A0E1A] text-white">{t("maleOption")}</option>
                          <option value="Female" className="bg-[#0A0E1A] text-white">{t("femaleOption")}</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      </div>
                    </div>
                  </div>
                  <CurrentStatusCheckboxes isEdit={true} />
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("householdCodeLabel")}</label>
                    <SearchableSelect
                      options={householdOptions.map((h) => ({
                        value: String(h.id),
                        label: h.code,
                        hint: h.address ? `(${h.address})` : undefined,
                      }))}
                      onSelect={(value) => setEditingResident((p) => p ? { ...p, householdId: Number(value), isHouseholdHead: false } : p)}
                      placeholder={t("householdCodePlaceholder")}
                      noResultsLabel={t("householdLinkNoResults")}
                      footerLabel="Add new household"
                      onFooterClick={() => setShowAddHousehold({ isEdit: true })}
                      dark
                    />
                    <p className="mt-1 text-sm text-white/60">{t("manageHouseholdHint")}</p>
                    {editingResident.householdId && (() => {
                      const picked = householdOptions.find((h) => h.id === editingResident.householdId);
                      return (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] text-xs font-medium px-3 py-1">
                          🏠 {picked?.code ?? `#${editingResident.householdId}`}
                          <button
                            type="button"
                            onClick={() => setEditingResident((p) => p ? { ...p, householdId: null, isHouseholdHead: false } : p)}
                            className="ml-1 text-[#7DD8CB]/70 hover:text-[#7DD8CB]"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  <label className={`flex items-center gap-2 text-base ${editingResident.householdId && !editFormExistingHead ? "cursor-pointer" : "cursor-not-allowed"}`}>
                    <input
                      type="checkbox"
                      checked={editingResident.isHouseholdHead}
                      disabled={!editingResident.householdId || !!editFormExistingHead}
                      onChange={(e) => setEditingResident((p) => p ? { ...p, isHouseholdHead: e.target.checked } : p)}
                      className="w-5 h-5 text-[#4FBEB0] disabled:opacity-40"
                    />
                    <span className={`font-medium ${editingResident.householdId && !editFormExistingHead ? "text-white" : "text-white/60"}`}>{t("headOfHouseholdCheckboxLabel")}</span>
                    <span className="text-white/60">
                      {!editingResident.householdId
                        ? t("householdHeadDisabledHint")
                        : editFormExistingHead
                        ? t("householdHeadTakenHint")
                        : t("receivesEventSmsNote")}
                    </span>
                  </label>
                  {editFormExistingHead && (
                    <p className="text-xs text-gold-300 bg-gold-500/10 border border-gold-500/25 rounded-full px-3 py-1.5">
                      ⚠️ {t("currentHeadLabel")}: <span className="font-medium">{[editFormExistingHead.firstName, editFormExistingHead.lastName].filter(Boolean).join(" ")}</span> · {t("uncheckHeadFirstNote")}
                    </p>
                  )}
                </div>
              </section>

              <MembershipPicker isEdit={true} />

              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  Account Access
                </h2>
                <div className="space-y-3">
                  {editingResident.hasAccount ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-white">{t("hasAccountCheckboxLabel")}</p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-base font-semibold text-white mb-1.5">{t("usernameLabel")}</label>
                          <input
                            type="text"
                            value={`PR-${String(editingResident.real_id).padStart(4, "0")}`}
                            disabled
                            className="w-full rounded-full border px-5 py-3.5 text-base bg-white/[0.05] text-white border-white/10 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-base font-semibold text-white mb-1.5">{t("passwordLabel")}</label>
                          <input
                            type="password"
                            value={editingResident.password}
                            onChange={(e) => setEditingResident((p) => p ? { ...p, password: e.target.value } : p)}
                            className="resident-password-field w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 border-white/10"
                            placeholder={t("resetPasswordPlaceholder")}
                          />
                          <p className="mt-1.5 text-sm text-white/60">{t("passwordResetNote")}</p>
                          {formErrors.password && <p className="text-red-400 text-xs mt-1">{formErrors.password}</p>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-base text-white/60 italic">This resident does not have a portal account yet.</p>
                      <div>
                        <label className="block text-base font-semibold text-white mb-1.5">
                          {t("passwordLabel")}{" "}
                          <span className="text-white/40 text-xs font-normal">(set to create their account)</span>
                        </label>
                        <input
                          type="password"
                          value={editingResident.password}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, password: e.target.value } : p)}
                          className="resident-password-field w-full sm:w-1/2 rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 border-white/10"
                          placeholder="Set an initial password"
                        />
                        {formErrors.password && <p className="text-red-400 text-xs mt-1">{formErrors.password}</p>}
                        <p className="mt-1 text-sm text-white/60">
                          Username will be {`PR-${String(editingResident.real_id).padStart(4, "0")}`}. Saving with a password creates the account.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {/* Edge/IE draw their own native reveal-password eye inside
                    the field itself; it renders dark and is nearly invisible
                    against our dark navy inputs, so invert it to white. */}
                <style>{`
                  .resident-password-field::-ms-reveal,
                  .resident-password-field::-ms-clear {
                    filter: invert(1);
                  }
                `}</style>
              </section>

              <div className="pt-2 pb-4">
                <button
                  type="submit"
                  disabled={!hasEditChanges || editingResident.deleted_at !== null}
                  className={`group w-full inline-flex items-center justify-center gap-3 rounded-full border pl-6 pr-2 py-2 text-base font-semibold uppercase tracking-wide shadow-sm transition-all duration-500 ease-out ${
                    hasEditChanges && editingResident.deleted_at === null
                      ? "border-[#1E3A5F] bg-[#1E3A5F] text-white hover:border-[#122436] hover:bg-[#122436] hover:shadow-md"
                      : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
                  }`}
                >
                  {t("updateRecordButton")}
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ease-out ${
                      hasEditChanges && editingResident.deleted_at === null ? "bg-[#0A0E1A] group-hover:bg-white/15" : "bg-white/5"
                    }`}
                  >
                    <Save className={`h-5 w-5 ${hasEditChanges && editingResident.deleted_at === null ? "text-white" : "text-white/20"}`} />
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ID Photo preview popup ───────────────────────────────────────────── */}
      {photoPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] px-4" onClick={() => setPhotoPreviewModal(null)}>
          <div className="bg-white rounded-[24px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E6E0D3] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-sage-50 text-sage-800 text-[11px] font-bold uppercase tracking-wide px-3 py-1 shrink-0">
                  {photoPreviewModal.label}
                </span>
                <span className="text-sm font-medium text-[#1A1A1A] truncate">{photoPreviewModal.name}</span>
                {photoPreviewModal.size !== null && (
                  <span className="text-xs text-[#6B7280] shrink-0">· {(photoPreviewModal.size / (1024 * 1024)).toFixed(2)} MB</span>
                )}
              </div>
              <button onClick={() => setPhotoPreviewModal(null)} className="text-[#6B7280] hover:text-[#1A1A1A] p-1 shrink-0">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[#FAF9F5] flex items-center justify-center p-6">
              <img src={photoPreviewModal.url} alt={photoPreviewModal.name} className="max-w-full max-h-[65vh] rounded-xl shadow-sm" />
            </div>
          </div>
        </div>
      )}

      {/* ─── Validation / save-error popup (replaces the old inline red banner) ── */}
      {apiError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setApiError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{apiErrorTitle || t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{apiError}</p>
            <button onClick={() => setApiError(null)} className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition">{t("okLabel")}</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showAddConfirm}
        icon={<Plus size={32} />}
        title={t("confirmAddResidentTitle")}
        body={t("confirmAddResidentBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesAdd")}
        onCancel={() => setShowAddConfirm(false)}
        onConfirm={performAddResident}
        z={60}
      />

      <ConfirmDialog
        open={showEditConfirm}
        icon={<Pencil size={32} />}
        title={t("confirmUpdateResidentTitle")}
        body={t("confirmUpdateResidentBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setShowEditConfirm(false)}
        onConfirm={performUpdateResident}
        z={60}
      />

      {/* ─── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {showAddHousehold && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4"
          onClick={() => !addHouseholdSaving && setShowAddHousehold(false)}
        >
          <div
            className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-[#1A1A1A]">Add new household</h3>
              <button
                onClick={() => !addHouseholdSaving && setShowAddHousehold(false)}
                className="text-[#6B7280] hover:text-[#1A1A1A]"
              >
                <XIcon size={20} />
              </button>
            </div>
            <p className="text-sm text-[#6B7280] mb-5">
              A household code is generated automatically. It'll appear on the Households page right away and be linked to this resident.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
                  Address / Purok <span className="text-[#6B7280] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newHouseholdAddress}
                  onChange={(e) => setNewHouseholdAddress(e.target.value)}
                  placeholder="Purok 1, Barangay Piao"
                  className="w-full rounded-full border border-sage-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
                  Contact number <span className="text-[#6B7280] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newHouseholdContact}
                  onChange={(e) => setNewHouseholdContact(formatContactNumber(e.target.value))}
                  placeholder="09XX-XXX-XXXX"
                  maxLength={13}
                  className="w-full rounded-full border border-sage-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sage-700/30"
                />
              </div>
              {addHouseholdError && <p className="text-red-500 text-xs">{addHouseholdError}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-5">
              <button
                type="button"
                onClick={() => setShowAddHousehold(false)}
                disabled={addHouseholdSaving}
                className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNewHousehold}
                disabled={addHouseholdSaving}
                className="px-5 py-2.5 rounded-full bg-sage-800 hover:bg-sage-900 text-white font-semibold transition disabled:opacity-50"
              >
                {addHouseholdSaving ? "Creating…" : "Create household"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
             <div className="mb-4 text-red-500 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{t("moveToTrashConfirm")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("cancel")}</button>
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
            <div className="mb-3 text-sage-700 flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">{t("successTitle")}</h3>
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
            <div className="mb-3 text-sage-700 flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("recordUpdatedSuccess")}</p>
            <button
              onClick={() => setShowUpdateSuccess(false)}
              className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
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
            <div className="mb-3 text-sage-700 flex justify-center">
                <CheckCircle size={48} />
            </div>

            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
                {t("successTitle")}
            </h3>

            <p className="text-[15px] text-gray-600 mb-6">
                {t("residentAddedSuccess")}
            </p>

            <button
                onClick={() => setShowAddSuccess(false)}
                className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
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
            <div className="mb-3 text-sage-700 flex justify-center">
                <CheckCircle size={48} />
            </div>

            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
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
                className="px-5 py-2.5 rounded-full bg-sage-800 text-white hover:bg-sage-900 transition"
            >
                {t("okLabel")}
            </button>
            </div>
        </div>
        )}

      {/* Restoring an archived resident happens on the Archive page. */}

      {/* ─── Cancel Unsaved Changes Confirm Modal ─────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-amber-500 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-500 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-gray-600 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50 transition">{t("stayButton")}</button>
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
