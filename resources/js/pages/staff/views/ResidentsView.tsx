import { matchesSearch } from "../../../lib/search";
import { highlightMatches } from "../../../lib/highlight";
import FormSelect from "../../../components/ui/FormSelect";
import EyeToggleIcon from "../../../components/ui/EyeToggleIcon";
import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { renderMemberIdCard, renderMemberIdCardSides } from "../../../lib/memberIdCard";
import IdCardFlip from "../../../components/ui/IdCardFlip";
import BarangayPositionField, { type BarangayPositionValue } from "../../../components/ui/BarangayPositionField";
import { useBarangayOfficials, OFFICIALS_CHANGED_EVENT } from "../../../lib/barangayOfficials";
import { exportResidentsXlsx, RESIDENT_EXPORT_COLUMNS, MIN_EXPORT_COLUMNS, type ResidentExportColumnKey } from "../../../lib/residentsExport";
import { checkPassword, isStrongPassword, PASSWORD_MAX } from "../../../lib/passwordPolicy";
import {
  Search,
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
  Download,
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  Trash2,
  Save,
  Lock,
  ImagePlus,
  ShieldCheck,
  Check,
  ListChecks,
} from "lucide-react";
import DatePicker from "../../../components/ui/DatePicker";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import DefaultAvatar from "../../../components/ui/DefaultAvatar";
import { useLanguage } from "../../../i18n/LanguageContext";

import { tc } from "../../../lib/contentTranslations";
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

// Checkbox used by the export dialog -- same look as the Reports "Print & Export Options" boxes.
function ExportBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
        checked ? "border-[#4FBEB0] bg-[#4FBEB0] text-[#0A0E1A]" : "border-white/25 bg-transparent"
      }`}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
    </span>
  );
}

const exportPresetBtn = "rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white";

interface ResidentRow {
  id: string;
  real_id: number;
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  barangayPosition: BarangayPositionValue;
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
  suffix: string;
  barangayPosition: BarangayPositionValue;
  lastName: string;
  contactNumber: string;
  role: string;
  // Portal login -- optional at registration. When on, a password is
  // required (the username is the generated PR-#### code).
  hasAccount: boolean;
  password: string;
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
  suffix: string;
  barangayPosition: BarangayPositionValue;
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

const formatDateShort = (value: string | null | undefined, locale?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
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

const highlightText = (text: string | null | undefined, query: string) => highlightMatches(text, query);

const emptyAdd = (): AddForm => ({
  firstName: "",
  middleName: "",
  suffix: "",
  barangayPosition: "",
  lastName: "",
  contactNumber: "",
  role: "",
  hasAccount: false,
  password: "",
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

const SUFFIX_OPTIONS = ["Jr.", "Sr.", "II", "III", "IV", "V"];

// "Juan Cruz" + "Jr." -> "Juan Cruz, Jr." (display only)
const withSuffix = (name: string, suffix?: string | null) =>
  suffix && suffix.trim() ? `${name}, ${suffix.trim()}` : name;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResidentsView() {
  const { t, locale, language } = useLanguage();
  // Current Barangay Captain / Secretary (one each) -- drives the replace notice in the forms.
  const officials = useBarangayOfficials();
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
  // High enough that every real barangay resident list renders on one
  // page -- the table itself scrolls, so there's no real ceiling here.
  const itemsPerPage = 5000;

  const [showAddForm, setShowAddForm] = useState(false);
  const [viewRecord, setViewRecord] = useState<string | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [showQrDownloadConfirm, setShowQrDownloadConfirm] = useState(false);
  const [showQrDownloadSuccess, setShowQrDownloadSuccess] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrCardUrl, setQrCardUrl] = useState<string | null>(null);
  // Front/back images for the turning preview (qrCardUrl is the combined download image).
  const [qrCardSides, setQrCardSides] = useState<{ front: string; back: string } | null>(null);
  const [editRecord, setEditRecord] = useState<string | null>(null);

  // The Add/Edit panels are `fixed` full-page take-overs, so they need to
  // start exactly where the page content starts (right under the top header).
  // A hardcoded offset drifts whenever the header height changes (wrapped
  // title, banner, zoom), which let the table strip peek out above the
  // panel. Measure the real content scroller instead.
  const [panelTop, setPanelTop] = useState(73);
  // Show/hide toggle for the account password field (Add + Edit forms).
  const [showPassword, setShowPassword] = useState(false);
  const panelOpen = showAddForm || !!editRecord;
  useLayoutEffect(() => {
    if (!panelOpen) return;
    const measure = () => {
      const el = document.getElementById("staff-content-scroll");
      if (el) setPanelTop(Math.round(el.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [panelOpen]);

  // Always reopen a form with the password hidden.
  useEffect(() => {
    if (!panelOpen) setShowPassword(false);
  }, [panelOpen]);

  // Attendance status arrives from the API in mixed case ("missed",
  // "Incomplete", ...). Normalize, then show the translated, capitalized label.
  const attendanceStatusLabel = (status: string) => {
    const key = String(status ?? "").trim().toLowerCase();
    if (key === "complete") return t("statusComplete");
    if (key === "incomplete") return t("statusIncomplete");
    if (key === "missed") return t("statusMissed");
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : "";
  };
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

  // Whether the resident being edited already had a portal account when the
  // form opened. An existing account can be password-reset but never turned
  // off here (the server enforces the same rule); a missing one can be
  // granted by switching it on and setting a password.
  const editOriginalHasAccount = useMemo(
    () => !!residentsData.find((x) => x.id === editRecord)?.hasAccount,
    [residentsData, editRecord]
  );

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
        setAddHouseholdError(body?.message || t("resFailedCreateHousehold"));
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
      setAddHouseholdError(e?.message || t("resFailedCreateHousehold"));
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
        suffix: item.suffix ?? "",
        barangayPosition: (item.barangay_position ?? "") as BarangayPositionValue,
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
      window.dispatchEvent(new Event(OFFICIALS_CHANGED_EVENT));
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
  // Paint the member ID card whenever the "View QR" dialog opens.
  useEffect(() => {
    if (!showQrPanel) { setQrCardUrl(null); setQrCardSides(null); return; }
    const r = residentsData.find((x: any) => x.id === viewRecord);
    const canvas = qrCanvasRef.current;
    if (!r || !canvas) return;
    let cancelled = false;
    renderMemberIdCard(canvas, withSuffix(`${r.firstName} ${r.lastName}`, r.suffix), r.id, r.contactNumber || "", officials.captain?.name ?? "").then((out) => {
      if (!cancelled && out) setQrCardUrl(out.toDataURL("image/png", 1.0));
    });
    renderMemberIdCardSides(canvas, withSuffix(`${r.firstName} ${r.lastName}`, r.suffix), r.id, r.contactNumber || "", officials.captain?.name ?? "").then((out) => {
      if (!cancelled && out) {
        setQrCardSides({
          front: out.front.toDataURL("image/png", 1.0),
          back: out.back.toDataURL("image/png", 1.0),
        });
      }
    });
    return () => { cancelled = true; };
  }, [showQrPanel, viewRecord, residentsData, officials]);

  useEffect(() => {
    setShowQrPanel(false);
    setShowQrDownloadConfirm(false);
    setShowQrDownloadSuccess(false);
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
    if (file.size > 5 * 1024 * 1024) {
      setApiErrorTitle(t("validationErrorTitle"));
      setApiError(t("photoTooLarge"));
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
    if (!newResident.civilStatusId) err.civilStatusId = t("civilStatusRequired");
    if (!newResident.gender) err.gender = t("genderRequired");
    if (newResident.hasAccount && !isStrongPassword(newResident.password)) err.password = t("passwordPolicyError");
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
    // Granting a new account needs a password; resetting an existing one
    // is optional, but if one is typed it must meet the same rule.
    if (editingResident.hasAccount && (!editOriginalHasAccount || editingResident.password.trim() !== "")) {
      if (!isStrongPassword(editingResident.password)) err.password = t("passwordPolicyError");
    }
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
      `${newResident.firstName} ${newResident.middleName} ${newResident.lastName} ${newResident.suffix}`
    );
    const isDuplicate = residentsData.some((r) => {
      if (r.deleted_at !== null) return false; // ignore trashed
      const existingFull = normalizeName(`${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}`);
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
    fd.append("suffix", newResident.suffix);
    if (newResident.barangayPosition) {
      fd.append("barangay_position", newResident.barangayPosition);
    }
    fd.append("last_name", newResident.lastName);
    fd.append("contact_number", newResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", newResident.role);
    // Portal login is opt-in: only when "Has account" is ticked do we send
    // has_account + the password (the server requires a password in that
    // case -- see StoreUserRequest). Otherwise has_account stays false.
    fd.append("has_account", newResident.hasAccount ? "1" : "0");
    if (newResident.hasAccount) fd.append("password", newResident.password);
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
      suffix: r.suffix ?? "",
      barangayPosition: r.barangayPosition ?? "",
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
      `${editingResident.firstName} ${editingResident.middleName} ${editingResident.lastName} ${editingResident.suffix}`
    );
    const isDuplicate = residentsData.some((r) => {
      if (r.deleted_at !== null) return false;           // ignore trashed
      if (r.real_id === editingResident.real_id) return false; // ignore self
      const existingFull = normalizeName(`${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}`);
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
    fd.append("suffix", editingResident.suffix);
    // Always sent on edit (empty = no post), so removing someone from the post works too.
    fd.append("barangay_position", editingResident.barangayPosition);
    fd.append("last_name", editingResident.lastName);
    fd.append("contact_number", editingResident.contactNumber.replace(/\D/g, ""));
    fd.append("role", editingResident.role);

    // has_account can only ever go false -> true here (an existing account
    // is locked on in the UI, and the server rejects removal). Turning it
    // on requires a password; for an existing account a password is just
    // an optional reset.
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
      r = r.filter((x) =>
        matchesSearch(residentSearch, x.id, x.firstName, x.middleName, x.lastName, x.suffix, x.contactNumber, x.memberships, x.role, x.barangayPosition === "captain" ? "barangay captain punong barangay" : x.barangayPosition === "secretary" ? "barangay secretary kalihim" : "")
      );
    }
    return r;
  }, [residentsData, membershipFilter, residentSearch]);

  // ─── Export (Excel / PDF) ─────────────────────────────────────────────────
  // Clicking Excel / PDF opens an options dialog: which residents to include
  // (defaults to what the table is showing) and which columns to print. The
  // exported documents are always in English, like the other official reports.
  type ExportScope = "all" | "members" | "not-members";
  const [exportDialog, setExportDialog] = useState<"excel" | "pdf" | null>(null);
  const [exportCols, setExportCols] = useState<ResidentExportColumnKey[]>(RESIDENT_EXPORT_COLUMNS.map((c) => c.key));
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportApplySearch, setExportApplySearch] = useState(true);
  const [exportMessage, setExportMessage] = useState(true);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportSuccess, setExportSuccess] = useState<"excel" | "pdf" | null>(null);

  const EXPORT_COLUMN_LABEL_KEYS: Record<ResidentExportColumnKey, string> = {
    no: "resColNumber",
    id: "idNumberColumn",
    name: "residentOption",
    gender: "genderLabel",
    age: "ageColumn",
    contact: "rptColContact",
    address: "addressLabel",
    household: "householdLabel",
    membership: "reportTypeMembership",
  };

  const openExportDialog = (format: "excel" | "pdf") => {
    setExportScope(membershipFilter);
    setExportApplySearch(true);
    setExportMessage(true);
    setExportDialog(format);
  };

  const exportResidentList = useMemo(() => {
    let r = residentsData.filter((x) => x.deleted_at === null);
    if (exportScope === "members") r = r.filter((x) => isActiveMember(x));
    else if (exportScope === "not-members") r = r.filter((x) => !isActiveMember(x));
    if (exportApplySearch && residentSearch.trim()) {
      r = r.filter((x) =>
        matchesSearch(residentSearch, x.id, x.firstName, x.middleName, x.lastName, x.suffix, x.contactNumber, x.memberships, x.role, x.barangayPosition === "captain" ? "barangay captain punong barangay" : x.barangayPosition === "secretary" ? "barangay secretary kalihim" : "")
      );
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentsData, exportScope, exportApplySearch, residentSearch]);

  const toggleExportCol = (key: ResidentExportColumnKey) =>
    setExportCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleExport = async () => {
    const format = exportDialog;
    if (!format || exporting || exportCols.length < MIN_EXPORT_COLUMNS) return;
    setExporting(format);
    try {
      // Columns in the fixed print order, not the order they were ticked.
      const columns = RESIDENT_EXPORT_COLUMNS.filter((c) => exportCols.includes(c.key));
      const rows = [...exportResidentList]
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
        .map((r, i) => {
          const middle = r.middleName ? ` ${r.middleName.trim().charAt(0).toUpperCase()}.` : "";
          const size = householdSizeFor(r.household?.id);
          const memberships = membershipListFor(r);
          const values: Record<ResidentExportColumnKey, string> = {
            no: String(i + 1),
            id: r.id,
            name: `${r.lastName}, ${r.firstName}${middle}${r.suffix ? ` ${r.suffix}` : ""}`,
            gender: r.gender ?? "",
            age: r.age !== null && r.age !== undefined ? String(r.age) : "",
            contact: r.contactNumber,
            address: r.household?.address || r.address || "",
            household: r.household ? `${r.household.code}${size > 0 ? ` (${size} pax)` : ""}` : "",
            membership: memberships.length ? memberships.join(", ") : "Not a member",
          };
          return columns.map((c) => values[c.key]);
        });

      const scopeLabel = exportScope === "members" ? "Members only" : exportScope === "not-members" ? "Not yet members" : "All records";
      const labelParts = [`${scopeLabel} · ${rows.length} resident${rows.length === 1 ? "" : "s"}`];
      if (exportApplySearch && residentSearch.trim()) labelParts.push(`Search: "${residentSearch.trim()}"`);
      const filterLabel = labelParts.join(" · ");

      // Opening message (English, like the rest of the exported document) -- optional.
      let message: string[] | undefined;
      if (exportMessage) {
        const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
        const total = exportResidentList.length;
        const memberCount = exportResidentList.filter((x) => isActiveMember(x)).length;
        const scopePhrase =
          exportScope === "members"
            ? "residents who are members of at least one barangay membership"
            : exportScope === "not-members"
            ? "residents who are not yet members of any barangay membership"
            : "all active residents registered in the barangay";
        const fields = columns.filter((c) => c.key !== "no").map((c) => c.label.toLowerCase());
        const fieldList = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}` : fields[0] ?? "";
        const searchNote = exportApplySearch && residentSearch.trim() ? `, narrowed to the search "${residentSearch.trim()}"` : "";
        message = [
          `This Residents Master List is prepared by the Barangay Piao office through the Piao Connect system to present the residents registered in the barangay as of ${today}.`,
          `It covers ${total} resident${total === 1 ? "" : "s"} (${scopePhrase}${searchNote}), listed alphabetically by last name${fieldList ? ` with their ${fieldList}` : ""}.${
            exportScope === "all" && total > 0
              ? ` Of these, ${memberCount} ${memberCount === 1 ? "is a member" : "are members"} of at least one barangay membership and ${total - memberCount} ${total - memberCount === 1 ? "is" : "are"} not yet.`
              : ""
          }`,
          `All information is taken directly from the records encoded in Piao Connect as of ${today} and is respectfully submitted for the information and guidance of the Barangay Council.`,
        ];
      }

      if (format === "excel") {
        await exportResidentsXlsx({ rows, columns, filterLabel, message });
      } else {
        const res = await fetch("/membership-residents/export/pdf", {
          method: "POST",
          headers: { Accept: "application/pdf", "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken() },
          body: JSON.stringify({ rows, columns: columns.map((c) => c.key), filter: filterLabel, message }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "residents-master-list.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setExportDialog(null);
      setExportSuccess(format);
    } catch (e) {
      console.error("residents export:", e);
      setExportDialog(null);
      setApiErrorTitle(t("errorTitle"));
      setApiError(t("resExportFailed"));
    } finally {
      setExporting(null);
    }
  };

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
                <span>{tc(cs.label, language as any)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  // "Account Access" fields shared by the Add and Edit forms (called as a
  // plain function, not a component, so typing in the password box doesn't
  // remount it). Rules:
  //   - Add: optional "Has account" -- ticking it reveals a required password.
  //   - Edit, no account yet: can be switched on (password required).
  //   - Edit, account already exists: locked on -- an account can be
  //     password-reset but never removed (the server enforces this too).
  const renderAccountAccess = (isEdit: boolean) => {
    const form = isEdit ? editingResident : newResident;
    if (!form) return null;
    const locked = isEdit && editOriginalHasAccount;
    const archived = isEdit && editingResident?.deleted_at !== null;
    const disabled = locked || archived;
    const setForm = (patch: { hasAccount?: boolean; password?: string }) =>
      isEdit
        ? setEditingResident((p) => (p ? { ...p, ...patch } : p))
        : setNewResident((p) => ({ ...p, ...patch }));
    const inputCls =
      "resident-password-field w-full rounded-full border px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 border-white/10";
    return (
      <div className="space-y-4">
        {/* Portal access -- a switch card (not a checkbox): clear on/off state,
            status text, and a lock when an existing account can't be removed. */}
        <div
          className={`flex items-center gap-4 rounded-2xl border px-5 py-4 transition ${
            form.hasAccount ? "border-[#4FBEB0]/30 bg-[#4FBEB0]/[0.06]" : "border-white/10 bg-white/[0.04]"
          }`}
        >
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
              form.hasAccount ? "bg-[#4FBEB0]/20 text-[#7DD8CB]" : "bg-white/[0.06] text-white/45"
            }`}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-base font-semibold text-white">
              {t("portalAccessLabel")}
              {locked && <Lock className="h-3.5 w-3.5 text-white/50" />}
            </p>
            <p className="mt-0.5 text-sm text-white/60">
              {locked
                ? t("resAccountLockedNote")
                : isEdit
                ? t("resAccountTurnOnEdit")
                : t("resAccountTurnOnAdd")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                form.hasAccount ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : "bg-white/[0.07] text-white/50"
              }`}
            >
              {form.hasAccount ? t("portalAccessOn") : t("portalAccessOff")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.hasAccount}
              aria-label={t("portalAccessLabel")}
              disabled={disabled}
              onClick={() => setForm({ hasAccount: !form.hasAccount, password: "" })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FBEB0]/50 disabled:cursor-not-allowed disabled:opacity-60 ${
                form.hasAccount ? "border-[#4FBEB0] bg-[#4FBEB0]" : "border-white/20 bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  form.hasAccount ? "translate-x-[22px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>
        </div>

        {form.hasAccount && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold text-white mb-1.5">{t("usernameLabel")}</label>
              <input
                type="text"
                value={isEdit ? `PR-${String(editingResident!.real_id).padStart(4, "0")}` : ""}
                placeholder={t("resGeneratedWhenSaved")}
                disabled
                className="w-full rounded-full border px-5 py-3.5 text-base bg-white/[0.05] text-white placeholder:text-white/40 border-white/10 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-base font-semibold text-white mb-1.5">
                {t("passwordLabel")}
                {!locked && <span className="text-red-400"> *</span>}
              </label>
              <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                disabled={archived}
                onChange={(e) => setForm({ password: e.target.value })}
                maxLength={PASSWORD_MAX}
                className={`${inputCls} pr-14`}
                placeholder={locked ? t("resetPasswordPlaceholder") : t("resPasswordPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("resHidePassword") : t("resShowPassword")}
                aria-pressed={showPassword}
                title={showPassword ? t("resHidePassword") : t("resShowPassword")}
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 transition"
              >
                <EyeToggleIcon visible={showPassword} />
              </button>
              </div>
              <p className="mt-1.5 text-sm text-white/60">
                {locked ? t("passwordResetNote") : t("resPasswordRequiredNote")}
              </p>
              {!archived && (form.password.length > 0 || !locked) && (
                <ul className="mt-2 grid grid-cols-1 gap-1">
                  {checkPassword(form.password).map((c) => (
                    <li
                      key={c.key}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        c.ok ? "text-[#7DD8CB]" : "text-white/45"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                          c.ok ? "bg-[#4FBEB0]/20 text-[#7DD8CB]" : "bg-white/[0.06] text-white/40"
                        }`}
                      >
                        {c.ok ? "✓" : "•"}
                      </span>
                      {t(`resPw_${c.key}`)}
                    </li>
                  ))}
                </ul>
              )}
              {formErrors.password && <p className="text-red-400 text-xs mt-1">{formErrors.password}</p>}
            </div>
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
    const filteredAvailable = availableMemberships
      .filter((m) => !selMems.includes(m.id) && matchesSearch(membershipSearch, m.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="rounded-2xl border border-white/25 bg-white/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-wide text-gold-300">{t("reportTypeMembership")}</p>
          <span
            className={`inline-flex items-center rounded-full text-[11px] font-semibold px-2.5 py-1 transition-colors ${
              count > 0 ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.05] text-white/40"
            }`}
          >
            {count > 0 ? t("resNSelected").replace("{n}", String(count)) : t("resNoneSelected")}
          </span>
        </div>
        <p className="text-sm text-white/60">{t("resMembershipHint")}</p>

        {count > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {selectedMemberships.map((mem) => (
              <span
                key={mem.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/20 text-[#7DD8CB] pl-4 pr-2 py-2 text-base font-medium shadow-sm"
              >
                {tc(mem.name, language as any)}
                <button
                  type="button"
                  onClick={() => toggleMembership(mem.id, isEdit)}
                  aria-label={t("resRemoveMember").replace("{name}", mem.name)}
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
              placeholder={t("resSearchMembershipPrograms")}
              className="h-12 w-full rounded-full border border-white/25 bg-white/10 pl-11 pr-[4.5rem] text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
            />
            {membershipSearch && (
              <button
                type="button"
                onClick={() => setMembershipSearch("")}
                aria-label="Clear search"
                title="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
              >
                {t("clearLabel")}
              </button>
            )}
          </div>
        )}

        {availableMemberships.length === 0 ? (
          <p className="text-sm text-white/60 italic">{t("noMembershipsAvailable")}</p>
        ) : filteredAvailable.length === 0 ? (
          <p className="text-sm text-white/60 italic">
            {membershipSearch.trim() ? t("resNoMatchingPrograms") : t("resAllProgramsAdded")}
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
                {tc(mem.name, language as any)}
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
    const displayName = file ? file.name : preview ? t("resCurrentPhoto") : t("resNoFileChosen");
    const openPreview = () =>
      setPhotoPreviewModal({
        url: preview,
        label: t("idPhotoFieldLabel"),
        name: displayName,
        size: file ? file.size : null,
      });
    return (
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-colors bg-white/10 ${
          preview ? "border-[#4FBEB0]/50" : formErrors.photo ? "border-red-500" : "border-white/25"
        }`}
      >
        <div className="min-w-0">
          <p className="text-base font-bold uppercase tracking-wide text-white">
            {t("idPhotoFieldLabel")}{" "}
            <span className="text-white/50 font-medium normal-case">({t("optionalLabel")})</span>
          </p>
          <p className="mt-1 text-sm text-white/60 italic">{t("resPhotoHint")}</p>
        </div>

        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={(e) => handlePhotoChange(e, isEdit)}
          className="hidden"
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            {preview ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={openPreview}
                  title={t("photoPreviewBtn")}
                  aria-label={t("photoPreviewBtn")}
                  className="block h-16 w-16 overflow-hidden rounded-xl border border-[#4FBEB0]/40 bg-black/20 hover:border-[#7DD8CB] transition"
                >
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                </button>
                <button
                type="button"
                onClick={() => handleRemovePhoto(isEdit)}
                title={t("photoDeleteBtn")}
                aria-label={t("photoDeleteBtn")}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/50 hover:bg-black/70 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
              </div>
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed border-white/25 bg-white/[0.03] flex items-center justify-center text-white/40">
                <ImagePlus className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0">
              {preview ? (
                <>
                  <button
                    type="button"
                    onClick={openPreview}
                    className="block max-w-full truncate text-left text-base font-semibold text-[#7DD8CB] hover:underline"
                  >
                    {displayName}
                  </button>
                  <p className="text-sm text-white/50">
                    {file ? `${t("photoImageKind")} · ${file.size >= 1048576 ? (file.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB"}` : t("savedPhotoLabel")}
                  </p>
                </>
              ) : (
                <p className="text-base text-white/50">{t("resNoPhotoYet")}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={`cursor-pointer ${
                preview
                  ? "inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition"
                  : "inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/40 px-5 py-2.5 text-base font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition"
              }`}
            >
              {!preview && <ImagePlus className="h-4 w-4" />}
              {preview ? t("photoReplaceBtn") : t("resChooseFile")}
            </label>
            {preview && (
              <>
                <button
                  type="button"
                  onClick={openPreview}
                  className="inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition"
                >
                  {t("photoPreviewBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(isEdit)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-base font-semibold text-red-400 hover:bg-red-500/10 transition"
                >
                  <Trash2 className="h-4 w-4" /> {t("photoDeleteBtn")}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-white/50">{t("fileHintImage")}</p>

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
          {t("resRegisterResident")}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
            <UserPlus className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      {/* Search + membership filter pills */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={residentSearch}
              onChange={(e) => setResidentSearch(e.target.value)}
              placeholder={t("searchByIdNameContactPlaceholder")}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-[4.5rem] text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]"
            />
            {residentSearch && (
              <button
                type="button"
                onClick={() => setResidentSearch("")}
                aria-label="Clear search"
                title="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
              >
                {t("clearLabel")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
            {[
              { key: "all" as const, label: `${t("allRecordsOption")} (${activeResidents.length})` },
              { key: "members" as const, label: t("resMembersFilter").replace("{n}", String(membersCount)) },
              { key: "not-members" as const, label: t("resNotYetMembers") },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMembershipFilter(opt.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  membershipFilter === opt.key ? "bg-sage-700 text-white shadow-sm" : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-white">{t("residentsMasterList")}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
              </span>
              {t("liveLabel")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden sm:block text-[13px] text-white/45">{t("resRecordsCount").replace("{n}", String(filteredResidents.length))}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openExportDialog("excel")}
                disabled={loading || residentsData.length === 0}
                title={t("resExportExcelTitle")}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white transition-all duration-300 hover:border-[#1E3A5F] hover:bg-[#1E3A5F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#7DD8CB]" />
                {t("resExportExcel")}
              </button>
              <button
                type="button"
                onClick={() => openExportDialog("pdf")}
                disabled={loading || residentsData.length === 0}
                title={t("resExportPdfTitle")}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white transition-all duration-300 hover:border-[#1E3A5F] hover:bg-[#1E3A5F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-4 w-4 text-gold-300" />
                {t("resExportPdf")}
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px] min-w-[760px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3.5 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("residentOption")}</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("ageColumn")}</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("rptColContact")}</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("householdLabel")}</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold uppercase tracking-wide text-white">{t("reportTypeMembership")}</th>
                <th className="py-3 px-4 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading || pageSwitching ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    </td>
                    <td className="py-3 px-4"><Skeleton className="h-3.5 w-10" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-3.5 w-24" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-3.5 w-28" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="py-3 px-4" />
                  </tr>
                ))
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
                          <div className="h-10 w-10 shrink-0 rounded-full bg-[#123A38] border border-white/10 flex items-center justify-center text-xs font-bold text-[#7DD8CB] transition-transform duration-200 group-hover:scale-105">
                            {initialsFor(r.firstName, r.lastName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{highlightText(withSuffix(`${r.firstName} ${r.lastName}`, r.suffix), residentSearch)}</p>
                            <p className="flex items-center gap-2 text-xs text-white/40 font-mono">
                              {r.id}
                              {r.barangayPosition && (
                                <span className="rounded-full bg-gold-400/15 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-gold-300">
                                  {r.barangayPosition === "captain" ? t("positionCaptain") : t("positionSecretary")}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white/60">{r.age !== null ? r.age : "—"}</td>
                      <td className="py-3 px-4 text-white/60">{highlightText(r.contactNumber, residentSearch)}</td>
                      <td className="py-3 px-4 text-white/60">{size > 0 ? `${size} pax` : "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium ${
                            active ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.06] text-white/45"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#4FBEB0]" : "bg-white/30"}`} />
                          {active ? t("resActiveMember") : t("resNotAMember")}
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
          [t("contactNumberLabel"), r.contactNumber || "—"],
          [t("resBirthdate"), formatDateShort(r.birthDate, locale)],
          [t("resPurok"), r.address || "—"],
        ];
        if (r.age !== null) infoRows.push([t("ageLabel"), `${r.age}${r.ageGroup ? ` · ${r.ageGroup}` : ""}`]);
        if (r.gender) infoRows.push([t("genderLabel"), r.gender === "Male" ? t("maleOption") : t("femaleOption")]);
        if (r.civilStatus) infoRows.push([t("civilStatusLabel"), tc(r.civilStatus, language as any)]);
        infoRows.push([t("resHouseholdSize"), size > 0 ? t(size === 1 ? "resOneMember" : "resNMembers").replace("{n}", String(size)) : "—"]);
        infoRows.push([t("roleColumn"), r.role === "Resident" ? t("residentOption") : r.role === "Staff" ? t("staffOption") : r.role]);
        infoRows.push([
          t("resAccount"),
          r.hasAccount ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#4FBEB0]/15 text-[#7DD8CB]">{t("yesLabel")}</span>
              <span className="text-xs text-white/50">{r.id}</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-white/60">{t("noLabel")}</span>
          ),
        ]);

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
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={() => setViewRecord(null)} />
            <div className="resident-profile-slide-in fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-[#0A0E1A] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">
              <img
                src="/logo-removebg-preview.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute z-0 bottom-[-3rem] right-[-3rem] h-96 w-96 object-contain opacity-[0.05]"
              />

              <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/10 shrink-0 bg-[#0A0E1A]">
                <h2 className="font-display text-xl font-bold text-white">{t("resProfileTitle")}</h2>
                <button onClick={() => setViewRecord(null)} className="text-white/50 hover:text-white">
                  <XIcon size={20} />
                </button>
              </div>

              <div className="relative z-10 flex-1 overflow-y-auto px-8 py-7">
                {r.deleted_at !== null && (
                  <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 px-4 py-2.5 text-sm text-center">
                    ⚠ {t("recordDeletedWarning")}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-full bg-[#123A38] border border-white/10 flex items-center justify-center text-lg font-bold text-[#7DD8CB] overflow-hidden shrink-0">
                    {r.photo ? (
                      <img src={r.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <DefaultAvatar className="h-20 w-20" title={`${r.firstName} ${r.lastName}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-display text-2xl font-extrabold text-white truncate">
                      {withSuffix(`${r.firstName} ${r.middleName} ${r.lastName}`.replace(/\s+/g, " "), r.suffix)}
                    </h1>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-white/40 font-mono">
                      {r.id}
                      {r.barangayPosition && (
                        <span className="rounded-full bg-gold-400/15 px-2.5 py-0.5 font-sans text-xs font-bold uppercase tracking-wide text-gold-300">
                          {r.barangayPosition === "captain" ? t("positionCaptain") : t("positionSecretary")}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold shrink-0 ${
                      active ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-white/[0.06] text-white/45"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#4FBEB0]" : "bg-white/30"}`} />
                    {active ? t("resActive") : t("resNotAMember")}
                  </span>
                </div>

                <section className="mt-8">
                  <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-5">
                    {t("resPersonalInfo")}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {infoRows.map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span className="block text-[12px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
                        <span className="mt-1 block text-base font-semibold text-white break-words">{value}</span>
                      </div>
                    ))}
                    {r.household && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span className="block text-[12px] font-semibold uppercase tracking-wider text-white/40">{t("householdLabel")}</span>
                        <span className="mt-1 block text-base font-semibold text-white">
                          {r.household.code}
                          {r.isHouseholdHead && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold-400/15 text-gold-300 align-middle">
                              {t("headBadgeLabel")}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {r.currentStatuses.length > 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-2">
                        <span className="block text-[12px] font-semibold uppercase tracking-wider text-white/40">{t("statusColumn")}</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.currentStatuses.map((cs) => (
                            <span key={cs.id} className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-[#4FBEB0]/10 text-[#7DD8CB]">
                              {tc(cs.label, language as any)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="mt-8">
                  <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-5">
                    {t("reportTypeMembership")}
                  </h2>
                  {allMems.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allMems.map((m, i) => (
                        <span key={i} className={`px-3 py-1.5 rounded-full text-sm font-medium ${getMembershipBadgeStyle(i)}`}>
                          {tc(m, language as any)}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowQrPanel(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/30 px-5 py-2.5 text-sm font-semibold text-gold-300 hover:bg-gold-400/10 transition-colors"
                  >
                    <QrCode className="h-4 w-4" /> {t("resViewQr")}
                  </button>
                </section>

                <section className="mt-8">
                  <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-5">
                    {t("resAttendanceHistory")}
                  </h2>
                  {attendanceLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : attendanceHistory.length === 0 ? (
                    <p className="text-base text-white/40 italic">{t("resNoAttendanceYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {attendanceHistory.slice(0, 8).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 text-base rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{a.isEventDeleted ? t("resDeletedEvent") : a.eventTitle}</p>
                            {a.eventDate && <p className="text-sm text-white/40">{formatDateShort(a.eventDate, locale)}</p>}
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[13px] font-medium ${
                              String(a.status).toLowerCase() === "complete" ? "bg-[#4FBEB0]/10 text-[#7DD8CB]" : "bg-gold-400/15 text-gold-300"
                            }`}
                          >
                            {attendanceStatusLabel(a.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="relative z-10 flex items-center gap-3 px-8 py-5 border-t border-white/10 shrink-0 bg-[#0A0E1A]">
                {r.deleted_at === null && (
                  <button
                    onClick={() => setDeleteRecord(r.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-300 hover:underline"
                  >
                    <Archive className="h-4 w-4" /> {t("archiveActivityOption")}
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {r.deleted_at === null && !r.hasAccount && (
                    <button
                      onClick={() => {
                        setEditRecord(r.id);
                        setViewRecord(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/30 px-5 py-2.5 text-base font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition-colors"
                    >
                      <UserPlus className="h-4 w-4" /> {t("resAddAccount")}
                    </button>
                  )}
                  {r.deleted_at === null && (
                    <button
                      onClick={() => {
                        setEditRecord(r.id);
                        setViewRecord(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="h-4 w-4" /> {t("editRecordTitle")}
                    </button>
                  )}
                  <button
                    onClick={() => setViewRecord(null)}
                    className="rounded-full bg-sage-700 hover:bg-sage-800 text-white px-6 py-2.5 text-base font-bold transition-colors"
                  >
                    {t("resDone")}
                  </button>
                </div>
              </div>
            </div>

            {showQrPanel && (
              <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex flex-col items-center justify-center px-4 py-6"
                onClick={() => setShowQrPanel(false)}
              >
                <div className="text-center max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                  {/* Hi-res QR, off-screen, used only to paint the ID card */}
                  <div aria-hidden="true" style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }}>
                    <QRCodeCanvas ref={qrCanvasRef} value={qrPayload} size={720} level="H" bgColor="#ffffff" fgColor="#052e16" includeMargin={true} />
                  </div>
                  <div className="mb-6 flex justify-center">
                    {qrCardSides ? (
                      <div className="w-full" style={{ maxWidth: "min(42rem, calc((100vh - 170px) * 1.585))" }}>
                        {/* Turns to the back every 10s; click the card to flip it. */}
                        <IdCardFlip
                          frontUrl={qrCardSides.front}
                          backUrl={qrCardSides.back}
                          alt={`${r.firstName} ${r.lastName}`}
                          autoFlip
                          intervalMs={10000}
                          title="Click to flip"
                          className="w-full"
                        />
                      </div>
                    ) : (
                      <div className="w-full rounded-2xl bg-white/5 animate-pulse" style={{ aspectRatio: "1011 / 638" }} />
                    )}
                  </div>
                                    <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setShowQrDownloadConfirm(true)}
                      className="group inline-flex min-w-[240px] items-center justify-center gap-4 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-1.5 py-1.5 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md"
                    >
                      {t("downloadLabel")}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
                        <Download className="h-4 w-4 text-white" />
                      </span>
                    </button>
                    <button
                      onClick={() => setShowQrPanel(false)}
                      className="rounded-full bg-sage-700 hover:bg-sage-800 text-white px-8 py-3 text-base font-bold transition-colors"
                    >
                      {t("closeLabel")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ConfirmDialog
              open={showQrDownloadConfirm}
              icon={<QrCode className="h-6 w-6" />}
              title={t("resQrDownloadTitle")}
              body={t("resQrDownloadBody").replace("{name}", `${r.firstName} ${r.lastName}`)}
              cancelLabel={t("cancel")}
              confirmLabel={t("downloadLabel")}
              onCancel={() => setShowQrDownloadConfirm(false)}
              onConfirm={() => {
                setShowQrDownloadConfirm(false);
                if (!qrCardUrl) return;
                const link = document.createElement("a");
                link.href = qrCardUrl;
                link.download = `member-id-${r.id}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setShowQrDownloadSuccess(true);
              }}
              z={70}
            />
            <StatusModal
              open={showQrDownloadSuccess}
              type="success"
              title={t("downloadSuccessTitle")}
              message={t("resQrDownloadedMsg")}
              okLabel={t("okLabel")}
              onClose={() => setShowQrDownloadSuccess(false)}
              z={70}
            />
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
        <div style={{ top: panelTop }} className="fixed bottom-0 left-0 right-0 md:left-[280px] z-30 bg-[#0A0E1A] overflow-y-auto">
          <img
            src="/logo-removebg-preview.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none fixed z-0 bottom-[-3rem] right-[-3rem] h-[22rem] w-[22rem] sm:h-[30rem] sm:w-[30rem] object-contain opacity-[0.06]"
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
              {t("resAddFormIntro")}
            </p>

            <form onSubmit={handleAddResident} noValidate className="mt-10 space-y-10">
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("resBasicInfo")}
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

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("suffixLabel")}</label>
                      <FormSelect
                        value={newResident.suffix || "__none"}
                        onChange={(e) => setNewResident((p) => ({ ...p, suffix: e.target.value === "__none" ? "" : e.target.value }))}
                      >
                        <option value="__none">{t("noneOption")}</option>
                        {SUFFIX_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </FormSelect>
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("roleRequiredLabel")}</label>
                      <div className="relative">
                        <FormSelect
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
                        </FormSelect>
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

                  <BarangayPositionField
                    value={newResident.barangayPosition}
                    onChange={(v) => setNewResident((p) => ({ ...p, barangayPosition: v }))}
                    officials={officials}
                    t={t}
                  />

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
                        <FormSelect
                          required
                          value={newResident.civilStatusId ?? ""}
                          onChange={(e) => {
                            setNewResident((p) => ({ ...p, civilStatusId: e.target.value ? Number(e.target.value) : null }));
                            setFormErrors((p) => ({ ...p, civilStatusId: "" }));
                          }}
                          className={`w-full appearance-none rounded-full border px-5 py-3.5 pr-11 text-base bg-white/10 font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            newResident.civilStatusId ? "text-white" : "text-white/50"
                          } ${formErrors.civilStatusId ? "border-red-500" : "border-white/25"}`}
                        >
                          <option value="" disabled hidden className="bg-[#0A0E1A] text-white">{t("selectOptionLabel")}</option>
                          {civilStatuses.map((cs) => (
                            <option key={cs.id} value={cs.id} className="bg-[#0A0E1A] text-white">{tc(cs.label, language as any)}</option>
                          ))}
                        </FormSelect>
                      </div>
                      {formErrors.civilStatusId && <p className="text-red-400 text-xs mt-1">{formErrors.civilStatusId}</p>}
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("genderLabel")}</label>
                      <div className="relative">
                        <FormSelect
                          required
                          value={newResident.gender}
                          onChange={(e) => {
                            setNewResident((p) => ({ ...p, gender: e.target.value }));
                            setFormErrors((p) => ({ ...p, gender: "" }));
                          }}
                          className={`w-full appearance-none rounded-full border px-5 py-3.5 pr-11 text-base bg-white/10 font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            newResident.gender ? "text-white" : "text-white/50"
                          } ${formErrors.gender ? "border-red-500" : "border-white/25"}`}
                        >
                          <option value="" disabled hidden className="bg-[#0A0E1A] text-white">{t("selectOptionLabel")}</option>
                          <option value="Male" className="bg-[#0A0E1A] text-white">{t("maleOption")}</option>
                          <option value="Female" className="bg-[#0A0E1A] text-white">{t("femaleOption")}</option>
                        </FormSelect>
                      </div>
                      {formErrors.gender && <p className="text-red-400 text-xs mt-1">{formErrors.gender}</p>}
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
                      footerLabel={t("resAddNewHousehold")}
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

              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("resAccountAccess")}
                </h2>
                {renderAccountAccess(false)}
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
        <div style={{ top: panelTop }} className="fixed bottom-0 left-0 right-0 md:left-[280px] z-30 bg-[#0A0E1A] overflow-y-auto">
          <img
            src="/logo-removebg-preview.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none fixed z-0 bottom-[-3rem] right-[-3rem] h-[22rem] w-[22rem] sm:h-[30rem] sm:w-[30rem] object-contain opacity-[0.06]"
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
              {t("resEditFormIntro")}
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
                  {t("resBasicInfo")}
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

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("suffixLabel")}</label>
                      <FormSelect
                        value={editingResident.suffix || "__none"}
                        onChange={(e) => setEditingResident((p) => p ? { ...p, suffix: e.target.value === "__none" ? "" : e.target.value } : p)}
                      >
                        <option value="__none">{t("noneOption")}</option>
                        {SUFFIX_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </FormSelect>
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("roleRequiredLabel")}</label>
                      <div className="relative">
                        <FormSelect
                          required
                          value={editingResident.role}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, role: e.target.value } : p)}
                          className={`w-full appearance-none rounded-full border px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 ${
                            formErrors.role ? "border-red-500" : "border-white/25"
                          }`}
                        >
                          <option value="Resident" className="bg-[#0A0E1A] text-white">{t("residentOption")}</option>
                          <option value="Staff" className="bg-[#0A0E1A] text-white">{t("staffOption")}</option>
                        </FormSelect>
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

                  <BarangayPositionField
                    value={editingResident.barangayPosition}
                    onChange={(v) => setEditingResident((p) => p ? { ...p, barangayPosition: v } : p)}
                    officials={officials}
                    selfId={editingResident.real_id}
                    t={t}
                  />

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
                        <FormSelect
                          value={editingResident.civilStatusId ?? ""}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, civilStatusId: e.target.value ? Number(e.target.value) : null } : p)}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" disabled hidden className="bg-[#0A0E1A] text-white">{t("selectOptionLabel")}</option>
                          {civilStatuses.map((cs) => (
                            <option key={cs.id} value={cs.id} className="bg-[#0A0E1A] text-white">{cs.label}</option>
                          ))}
                        </FormSelect>
                      </div>
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("genderLabel")}</label>
                      <div className="relative">
                        <FormSelect
                          value={editingResident.gender}
                          onChange={(e) => setEditingResident((p) => p ? { ...p, gender: e.target.value } : p)}
                          className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        >
                          <option value="" disabled hidden className="bg-[#0A0E1A] text-white">{t("selectOptionLabel")}</option>
                          <option value="Male" className="bg-[#0A0E1A] text-white">{t("maleOption")}</option>
                          <option value="Female" className="bg-[#0A0E1A] text-white">{t("femaleOption")}</option>
                        </FormSelect>
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
                      footerLabel={t("resAddNewHousehold")}
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
                  {t("resAccountAccess")}
                </h2>
                {renderAccountAccess(true)}
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[80] px-4" onClick={() => setPhotoPreviewModal(null)}>
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
      <StatusModal open={!!apiError} type="error" title={apiErrorTitle || t("errorTitle")} message={apiError || ""} okLabel={t("okLabel")} onClose={() => setApiError(null)} />

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
        // Dark-navy card, same as the delete-confirm dialog just below and
        // every other popup in this view -- this one was still the old
        // light "paper" card (bg-white, sage button) left over from before
        // the page moved to the dark theme.
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] px-4"
          onClick={() => !addHouseholdSaving && setShowAddHousehold(false)}
        >
          <div
            className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white">{t("resAddNewHousehold")}</h3>
              <button
                onClick={() => !addHouseholdSaving && setShowAddHousehold(false)}
                className="text-white/50 hover:text-white transition"
              >
                <XIcon size={20} />
              </button>
            </div>
            <p className="text-sm text-white/50 mb-5">
              {t("resHouseholdAutoNote")}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  {t("addressPurokLabel")} <span className="text-white/40 font-normal">({t("optionalLabel")})</span>
                </label>
                <input
                  type="text"
                  value={newHouseholdAddress}
                  onChange={(e) => setNewHouseholdAddress(e.target.value)}
                  placeholder={t("purokPlaceholder")}
                  className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  {t("contactNumberLabel")} <span className="text-white/40 font-normal">({t("optionalLabel")})</span>
                </label>
                <input
                  type="text"
                  value={newHouseholdContact}
                  onChange={(e) => setNewHouseholdContact(formatContactNumber(e.target.value))}
                  placeholder="09XX-XXX-XXXX"
                  maxLength={13}
                  className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                />
              </div>
              {addHouseholdError && <p className="text-red-400 text-xs">{addHouseholdError}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-5">
              <button
                type="button"
                onClick={() => setShowAddHousehold(false)}
                disabled={addHouseholdSaving}
                className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submitNewHousehold}
                disabled={addHouseholdSaving}
                className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white font-bold transition disabled:opacity-50"
              >
                {addHouseholdSaving ? t("resCreating") : t("resCreateHousehold")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
             <div className="mb-4 text-red-400 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
            <h3 className="text-xl font-bold text-red-400 mb-3">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-5">{t("moveToTrashConfirm")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteRecord(null)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancel")}</button>
              <button onClick={handleDeleteResident} className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition">{t("yesDeleteButton")}</button>
            </div>
          </div>
        </div>
      )}

      {exportDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm" onClick={() => !exporting && setExportDialog(null)}>
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0A0E1A] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-7 py-5">
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4FBEB0]/15 text-[#4FBEB0]">
                  {exportDialog === "excel" ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-2xl font-black text-white">{t("resExportDialogTitle").replace("{format}", exportDialog === "excel" ? "Excel" : "PDF")}</h3>
                  <p className="mt-0.5 text-[15px] text-white/50">{t("residentsMasterList")} · {t("resExportDialogSubtitle")}</p>
                </div>
              </div>
              <button type="button" onClick={() => setExportDialog(null)} disabled={!!exporting} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-7 overflow-y-auto px-7 py-6">
              {/* Residents to include */}
              <div>
                <p className="text-[15px] font-bold uppercase tracking-wide text-white/80">{t("resExportRecords")}</p>
                <p className="mt-0.5 mb-3 text-[13px] text-white/40">{t("resRecordsCount").replace("{n}", String(exportResidentList.length))}</p>
                <div className="inline-flex flex-wrap rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {([
                    { key: "all", label: t("allRecordsOption") },
                    { key: "members", label: t("resExportScopeMembers") },
                    { key: "not-members", label: t("resNotYetMembers") },
                  ] as { key: ExportScope; label: string }[]).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setExportScope(opt.key)}
                      className={`rounded-full px-5 py-2 text-[14px] font-semibold transition ${exportScope === opt.key ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {residentSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setExportApplySearch((v) => !v)}
                    aria-pressed={exportApplySearch}
                    className={`mt-3 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${exportApplySearch ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}
                  >
                    <ExportBox checked={exportApplySearch} />
                    <span className="text-[15px] font-semibold text-white">{t("resExportApplySearch").replace("{q}", residentSearch.trim())}</span>
                  </button>
                )}
              </div>

              {/* Columns */}
              <div className="border-t border-white/10 pt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold uppercase tracking-wide text-white/80">{t("resExportColumns")}</p>
                    <p className="mt-0.5 text-[13px] text-white/40">{t("resExportColsSelected").replace("{n}", String(exportCols.length)).replace("{total}", String(RESIDENT_EXPORT_COLUMNS.length))}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={exportPresetBtn} onClick={() => setExportCols(RESIDENT_EXPORT_COLUMNS.map((c) => c.key))}>{t("resExportSelectAll")}</button>
                    <button type="button" className={exportPresetBtn} onClick={() => setExportCols([])}>{t("resExportClearAll")}</button>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {RESIDENT_EXPORT_COLUMNS.map((c) => {
                    const on = exportCols.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleExportCol(c.key)}
                        aria-pressed={on}
                        className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${on ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}
                      >
                        <span className="mt-0.5"><ExportBox checked={on} /></span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-white">{t(EXPORT_COLUMN_LABEL_KEYS[c.key])}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-white/45">{t(`resColDesc_${c.key}`)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Other options */}
              <div className="border-t border-white/10 pt-6">
                <p className="mb-3 text-[15px] font-bold uppercase tracking-wide text-white/80">{t("resExportOther")}</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExportMessage((v) => !v)}
                    aria-pressed={exportMessage}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${exportMessage ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}
                  >
                    <span className="mt-0.5"><ExportBox checked={exportMessage} /></span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-white">{t("resExportIncludeMessage")}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-white/45">{t("resExportIncludeMessageHint")}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-7 py-4">
              <p className="inline-flex items-center gap-1.5 text-[14px] text-white/45">
                {exportCols.length < MIN_EXPORT_COLUMNS ? (
                  <span className="text-amber-300">{t("resExportMinColumns").replace("{n}", String(MIN_EXPORT_COLUMNS))}</span>
                ) : (
                  <><ListChecks className="h-3.5 w-3.5" />{t("resExportColsSelected").replace("{n}", String(exportCols.length)).replace("{total}", String(RESIDENT_EXPORT_COLUMNS.length))}</>
                )}
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setExportDialog(null)} disabled={!!exporting} className="rounded-full border border-white/15 px-6 py-2.5 text-[15px] font-semibold text-white transition hover:bg-white/10">
                  {t("cancelLabel")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExport(true)}
                  disabled={!!exporting || exportCols.length < MIN_EXPORT_COLUMNS}
                  className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  {exporting ? t("resExporting") : t("resExportDownload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmExport && exportDialog !== null}
        icon={exportDialog === "pdf" ? <FileText className="h-9 w-9" /> : <FileSpreadsheet className="h-9 w-9" />}
        title={t("confirmDownloadResidentsTitle")}
        body={exportDialog === "pdf" ? t("confirmDownloadResidentsBodyPdf") : t("confirmDownloadResidentsBodyExcel")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("downloadLabel")}
        z={90}
        onCancel={() => setConfirmExport(false)}
        onConfirm={() => {
          setConfirmExport(false);
          handleExport();
        }}
      />
      <StatusModal open={exportSuccess !== null} type="success" title={t("successTitle")} message={exportSuccess === "pdf" ? t("resExportSuccessPdf") : t("resExportSuccessExcel")} okLabel={t("okLabel")} onClose={() => setExportSuccess(null)} />
      <StatusModal open={showDeleteSuccess} type="success" title={t("successTitle")} message={t("residentDeletedSuccess")} okLabel={t("okLabel")} onClose={() => setShowDeleteSuccess(false)} />
      <StatusModal open={showUpdateSuccess} type="success" title={t("successTitle")} message={t("recordUpdatedSuccess")} okLabel={t("okLabel")} onClose={() => setShowUpdateSuccess(false)} />
      <StatusModal open={showAddSuccess} type="success" title={t("successTitle")} message={t("residentAddedSuccess")} okLabel={t("okLabel")} onClose={() => setShowAddSuccess(false)} />
      <StatusModal
        open={showRoleChangedModal}
        type="success"
        title={t("roleUpdatedTitle")}
        message={t("roleChangedToResidentMessage")}
        okLabel={t("okLabel")}
        onClose={() => {
          setShowRoleChangedModal(false);
          window.location.href = "/login";
        }}
      />

      {/* Restoring an archived resident happens on the Archive page. */}

      {/* ─── Cancel Unsaved Changes Confirm Modal ─────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-3 text-amber-400 flex justify-center"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-bold text-amber-400 mb-3">{t("unsavedChangesTitle")}</h3>
            <p className="text-white/50 mb-5">{t("unsavedChangesMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowCancelConfirm(null)} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("stayButton")}</button>
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
