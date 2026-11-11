import { highlightMatches } from "../../../lib/highlight";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import PagerSkeleton from "../../../components/ui/PagerSkeleton";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, AlertTriangle, LogIn, LogOut, IdCard, ScanLine, Search, ChevronDown } from "lucide-react";
import { Scanner } from '@yudiel/react-qr-scanner';
import api from "../../../lib/api";
import { queueAttendance } from "../../../lib/offlineQueue";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { useLanguage } from "../../../i18n/LanguageContext";
import Skeleton from "../../../components/ui/Skeleton";
import { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";
import Portal from "../../../components/ui/Portal";

type ScanResult = {
  ok: boolean;
  residentId: string;
  residentName: string;
  hasAccess: boolean;
  reason: string;
  memberships: string[];
  photo: string | null;
  role: string;
  userCode: string;
};

type AttendanceEntry = {
  residentId: string;
  residentName: string;
  timeIn: string | null;
  timeOut: string | null;
  status: "pending" | "in" | "complete";
};

type ModalConfig = {
  isOpen: boolean;
  type: 'success' | 'error' | 'info' | 'timeout-in' | 'timeout-out';
  title: string;
  message: string;
};

// Every distinct scan outcome still carries its own message, but visually
// they collapse onto the app's shared 3-state success/warning/error palette
// (same colors StatusModal uses everywhere else) instead of each state
// growing its own one-off color.
const SCAN_STATUS_VARIANT: Record<ModalConfig['type'], 'success' | 'warning' | 'error'> = {
  success: 'success',
  info: 'success',
  'timeout-out': 'success',
  'timeout-in': 'warning',
  error: 'error',
};

export default function ScanView({ events, residents, memberships, loading = false, residentsReady = true, residentsFromCache = false }: any) {
          const { t, locale } = useLanguage();
  // Page-open skeleton: shown while the events the scanner lists are loading.
  const openSkeleton = usePageOpenSkeleton(loading);
  const [eventId, setEventId] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry[]>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [closingTime, setClosingTime] = useState("");
  const [isDeadlineActive, setIsDeadlineActive] = useState(false);
  const [scanMode, setScanMode] = useState<"in" | "out">("in");

  // Adviser recommendation: "2 in 1 — Text/physical QR ID" — a manual
  // fallback for residents without a smartphone to show a QR code on, or
  // when the camera / lighting makes scanning unreliable.
  const [checkInMethod, setCheckInMethod] = useState<"camera" | "manual">("camera");
  const [manualQuery, setManualQuery] = useState("");

  // Searchable "Select Event" combobox: results ordered A-Z and finished
  // events (attendance window fully closed) filtered out so staff aren't
  // scrolling past events that are already over.
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const eventDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!eventDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [eventDropdownOpen]);

  // Ticks every 15s so the "window not open yet" banner clears itself once
  // the sign-in/out window actually opens, without needing a page refresh.
  const [currentHHMM, setCurrentHHMM] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  // Live "as of" label shown above the Select Event list -- e.g. "Sep 3,
  // 10:50 PM" -- so staff can tell today's/now's events apart from
  // same-titled recurring ones (see filteredEventOptions below, which now
  // also shows each option's own date/time for the same reason).
  const [currentDateTimeLabel, setCurrentDateTimeLabel] = useState(() => {
    const now = new Date();
    return `${now.toLocaleDateString(locale, { month: "short", day: "numeric" })}, ${now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true })}`;
  });
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date();
      setCurrentHHMM(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      setCurrentDateTimeLabel(`${now.toLocaleDateString(locale, { month: "short", day: "numeric" })}, ${now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true })}`);
    }, 15000);
    return () => clearInterval(tick);
  }, [locale]);

  const formatEventOptionDateTime = (isoLike?: string): string => {
    if (!isoLike) return "";
    const d = new Date(String(isoLike).replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString(locale, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true })}`;
  };

  // Professional status pill for the event picker: Ongoing / Upcoming / Past.
  const getEventStatus = (e: any): "ongoing" | "checkin" | "upcoming" | "past" => {
    const toDate = (raw?: string) => {
      if (!raw) return null;
      const d = new Date(String(raw).replace(" ", "T"));
      return isNaN(d.getTime()) ? null : d;
    };
    const start = toDate(e?.event_start || e?.date);
    const end = toDate(e?.event_end || e?.call_time_end) || start;
    const now = new Date();
    if (start && now < start) {
      // Sign-in window ([call time start, event start]) is already open.
      const open = toDate(e?.call_time_start);
      return open && now >= open ? "checkin" : "upcoming";
    }
    if (end && now > end) return "past";
    return "ongoing";
  };
  const statusPillCls: Record<string, string> = {
    ongoing: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    checkin: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    upcoming: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    past: "border-white/15 bg-white/5 text-white/50",
  };
  const statusLabel = (st: string) =>
    st === "ongoing" ? t("timeTabOngoing") : st === "checkin" ? t("checkInOpenLabel") : st === "upcoming" ? t("timeTabUpcoming") : t("timeTabPast");
  const StatusPill = ({ e }: { e: any }) => {
    const st = getEventStatus(e);
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusPillCls[st]}`}>
        <span className={`h-1.5 w-1.5 rounded-full bg-current ${st === "ongoing" ? "animate-pulse" : ""}`} />
        {statusLabel(st)}
      </span>
    );
  };

  const isOnline = useOnlineStatus();

  const [modalConfig, setModalConfig] = useState<ModalConfig>({ isOpen: false, type: 'info', title: '', message: '' });

  const showModal = (type: ModalConfig['type'], title: string, message: string) => {
    setModalConfig({ isOpen: true, type, title, message });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // QUEUE MODE (camera scan): a scan is recorded straight away, its result
  // stays on screen for RESULT_SECONDS, then clears so the next person in
  // line can scan. While the result is showing, further scans are ignored
  // (the camera stays on, so there is no restart delay).
  const RESULT_SECONDS = 5;
  const scanLockRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanNote, setScanNote] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [scanAuto, setScanAuto] = useState(false);
  const [nextScanIn, setNextScanIn] = useState(0);
  // The camera keeps reporting a QR that stays in view. A code only counts as
  // a NEW scan once it has left the camera (no decode for ~1.5s) or a
  // different code shows up -- otherwise holding the same QR in front of the
  // camera would re-show the result again right after it clears.
  const lastDecodeAtRef = useRef(0);
  const heldCodeRef = useRef<string | null>(null);
  const onCameraDecode = (raw: string) => {
    const now = Date.now();
    const gap = now - lastDecodeAtRef.current;
    lastDecodeAtRef.current = now;
    if (heldCodeRef.current !== raw || gap > 1500) heldCodeRef.current = null;
    if (scanLockRef.current) return;
    if (heldCodeRef.current === raw) return;
    heldCodeRef.current = raw;
    handleQRCodeScan(raw);
  };

  const clearResultTimer = () => {
    if (resultTimerRef.current) clearInterval(resultTimerRef.current);
    resultTimerRef.current = null;
  };

  // Hold the scanner (and the result card) for RESULT_SECONDS, then reset.
  const startResultCountdown = () => {
    clearResultTimer();
    scanLockRef.current = true;
    setNextScanIn(RESULT_SECONDS);
    let left = RESULT_SECONDS;
    resultTimerRef.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearResultTimer();
        setScan(null);
        setScanNote(null);
        setScanAuto(false);
        setNextScanIn(0);
        scanLockRef.current = false;
      } else {
        setNextScanIn(left);
      }
    }, 1000);
  };

  useEffect(() => () => clearResultTimer(), []);

  // Roster pagination: a big event (every resident + staff) no longer turns
  // the roster into one endless scroll box.
  const ROSTER_PER_PAGE = 8;
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterSearch, setRosterSearch] = useState("");
  // Roster order: last name A-Z (then first name). Looked up from the
  // residents list by id; falls back to the displayed name's last word.
  const rosterSortKeys = useMemo(() => {
    const m = new Map<string, string>();
    (residents ?? []).forEach((r: any) => {
      const key = `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim().toLowerCase();
      [r.id, r.user_id, r.real_id].forEach((id) => { if (id != null) m.set(String(id), key); });
    });
    return m;
  }, [residents]);
  const rosterKey = (rec: { residentId: any; residentName: string }) => {
    const hit = rosterSortKeys.get(String(rec.residentId));
    if (hit) return hit;
    const parts = String(rec.residentName ?? "").trim().split(/\s+/);
    return `${parts.slice(-1)[0] ?? ""} ${parts.slice(0, -1).join(" ")}`.trim().toLowerCase();
  };
  useEffect(() => { setRosterPage(1); setRosterSearch(""); }, [eventId]);
  useEffect(() => { setRosterPage(1); }, [rosterSearch]);

  // The roster is one server query per page (EventAttendanceController::getEventAttendees, paged=1):
  // name / ID search and paging happen in the database.
  const [rosterRows, setRosterRows] = useState<AttendanceEntry[]>([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterAll, setRosterAll] = useState(0);
  const [rosterLastPage, setRosterLastPage] = useState(1);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterEventLoaded, setRosterEventLoaded] = useState("");
  const rosterSeq = useRef(0);
  const fetchRosterPage = async (silent = false) => {
    if (!eventId) return;
    const seq = ++rosterSeq.current;
    if (!silent) setRosterLoading(true);
    try {
      const response = await fetch(`/events/${eventId}/attendances?${new URLSearchParams({ paged: "1", page: String(rosterPage), per_page: String(ROSTER_PER_PAGE), ...(rosterSearch.trim() ? { search: rosterSearch.trim() } : {}) })}`, {
        headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!response.ok || seq !== rosterSeq.current) return;
      const body = await response.json();
      if (body.meta.last_page < rosterPage) { setRosterPage(Math.max(1, body.meta.last_page)); return; }
      setRosterRows((body.data ?? []).map((r: any) => ({
        residentId: r.residentId,
        residentName: r.residentName,
        timeIn: r.timeIn,
        timeOut: r.timeOut,
        status: r.timeIn && r.timeOut ? "complete" : r.timeIn || r.timeOut ? "in" : "pending",
      })));
      setRosterTotal(body.meta.total);
      setRosterAll(body.counts?.all ?? body.meta.total);
      setRosterLastPage(body.meta.last_page);
    } catch (error) {
      if (seq === rosterSeq.current) console.error("Failed to fetch roster:", error);
    } finally {
      if (seq === rosterSeq.current) { setRosterLoading(false); setRosterEventLoaded(eventId); }
    }
  };
  const fetchRosterPageRef = useRef(fetchRosterPage);
  fetchRosterPageRef.current = fetchRosterPage;
  useEffect(() => {
    const timer = setTimeout(() => fetchRosterPageRef.current(), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, rosterPage, rosterSearch]);
  // A scan just landed (or the live refresh brought new rows): refresh the page quietly.
  useEffect(() => {
    if (eventId) fetchRosterPageRef.current(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance[eventId]]);
  const rosterSwitching = rosterLoading;

  const ev = events?.find((e: any) => String(e.id) === String(eventId));

  const requiredMemberships = ev?.membershipIds?.length > 0
    ? memberships?.filter((m: any) => ev.membershipIds.includes(m.id) || ev.membershipIds.includes(String(m.id)))
    : [];

  // Events selectable in the "Select Event" combobox: alphabetically
  // ascending, and with events whose attendance window is fully over
  // (past Call Time End, or past End Time when no call time is set)
  // filtered out -- a finished event has nothing left to scan for.
  const nowDateTimeStr = `${String(new Date().getFullYear())}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')} ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:${String(new Date().getSeconds()).padStart(2, '0')}`;

  // Incoming (not yet started) + ongoing (started, not yet over) events
  // only -- a finished one has nothing left to scan for. Previously fell
  // back to "always include" when an event had neither call_time_end nor
  // event_end set, which is exactly the shape of the app's older seeded
  // events (no call time recorded at all) -- so long-past events with
  // missing end times were leaking into this list forever. Falling back
  // to event_start (and, failing that, the plain date) closes that gap:
  // an event with no end info at all is treated as "ends at its own
  // start" instead of "never ends".
  const upcomingEvents = useMemo(() => {
    // This week's events first, then everything else -- both groups
    // ordered newest-to-oldest by their own event date/time (descending).
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7);
    const getSortDate = (e: any): Date | null => {
      const raw = e.event_start || e.date;
      if (!raw) return null;
      const d = new Date(String(raw).replace(" ", "T"));
      return isNaN(d.getTime()) ? null : d;
    };
    return (events ?? [])
      .filter((e: any) => {
        const effectiveEnd = e.call_time_end || e.event_end || e.event_start || e.date;
        if (!effectiveEnd) return true;
        return nowDateTimeStr <= effectiveEnd;
      })
      .sort((a: any, b: any) => {
        // Happening now first, then what's coming up -- nearest date first,
        // so this week's events always open the list and far-off ones sit last.
        const rank = (e: any) => (getEventStatus(e) === "ongoing" ? 0 : 1);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        const da = getSortDate(a);
        const db = getSortDate(b);
        return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, currentHHMM]);

  // The event picker's search is matched by the server (the events list endpoint); the scannable
  // events are then narrowed to the ids it returns.
  const [eventSearchIds, setEventSearchIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    const q = eventSearchQuery.trim();
    if (!q) { setEventSearchIds(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/events-data?${new URLSearchParams({ paged: "1", search: q, per_page: "100" })}`, {
          headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled) setEventSearchIds(new Set((body.data ?? []).map((e: any) => String(e.id))));
      } catch {
        if (!cancelled) setEventSearchIds(new Set());
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eventSearchQuery]);
  const filteredEventOptions = useMemo(
    () => (eventSearchIds === null ? upcomingEvents : upcomingEvents.filter((e: any) => eventSearchIds.has(String(e.id)))),
    [upcomingEvents, eventSearchIds]
  );

  useEffect(() => {
    if (upcomingEvents.length > 0 && (!eventId || !upcomingEvents.some((e: any) => String(e.id) === String(eventId)))) {
      setEventId(String(upcomingEvents[0].id));
    }
  }, [upcomingEvents]);

  const getStatus = (timeIn: string | null, timeOut: string | null): AttendanceEntry['status'] => {
    if (timeIn && timeOut) return "complete";
    if (timeIn || timeOut) return "in";
    return "pending";
  };

  useEffect(() => {
    if (!eventId) return;

    const fetchEventAttendance = async () => {
      try {
        const response = await fetch(`/events/${eventId}/attendances`, {
          headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
        });
        if (response.ok) {
          const data = await response.json();
          const formattedAttendance = data.map((record: any) => ({
            residentId: record.user_id,
            residentName: record.user ? `${record.user.first_name} ${record.user.last_name}` : `User #${record.user_id}`,
            timeIn: record.time_in,
            timeOut: record.time_out,
            status: getStatus(record.time_in, record.time_out)
          }));
          setAttendance(prev => ({ ...prev, [eventId]: formattedAttendance }));
        }
      } catch (error) {
        console.error("Failed to fetch attendance:", error);
      }
    };

    fetchEventAttendance();

    const savedMode = localStorage.getItem(`qr_mode_${eventId}`);
    if (savedMode === "in" || savedMode === "out") setScanMode(savedMode);
    else setScanMode("in");

  }, [eventId]);

  // The event itself already declares its schedule (Start Time / End Time /
  // Call Time / Call Time End from the Events form) -- derive the
  // sign-in/out window from THAT instead of asking staff to retype a
  // closing time by hand every time they open the scanner.
  const selectedEvent = React.useMemo(
    () => (events ?? []).find((e: any) => String(e.id) === String(eventId)),
    [events, eventId]
  );

  // Roster pill text. Before an event has started, nobody is "incomplete" --
  // they simply haven't had the chance to sign in yet, so show "Pending".
  const rosterStatusLabel = (r: any) => {
    if (r.status === "complete") return t("completedLabel");
    const st = selectedEvent ? getEventStatus(selectedEvent) : "ongoing";
    if (!r.timeIn && (st === "upcoming" || st === "checkin")) return t("statusPendingLabel");
    return t("statusIncomplete");
  };

  // "Not open yet" banner: sign-in opens at Call Time (if set), sign-out
  // opens at the event's End Time. Null means either no event selected, no
  // such boundary configured, or the window is already open.
  const windowNotYetOpen = React.useMemo(() => {
    if (!selectedEvent) return null;
    const openTime = scanMode === "in" ? selectedEvent.call_time_start : selectedEvent.event_end;
    if (!openTime) return null;
    return nowDateTimeStr < openTime ? openTime : null;
  }, [selectedEvent, scanMode, nowDateTimeStr]);

  useEffect(() => {
    if (!selectedEvent) {
      setClosingTime("");
      setIsDeadlineActive(false);
      return;
    }
    if (scanMode === "in") {
      // Sign-in closes at the event's own Start Time -- the FULL
      // datetime (event_start), not just its "HH:MM" time-of-day. Bare
      // time-of-day comparisons don't know what DATE the event is on, so
      // e.g. selecting a 6:00 PM event while it's 11:29 PM *today* looked
      // like the deadline had already passed even for an event days away
      // -- that's what was causing the sign-in/out modals to fire
      // immediately and flip-flop the scan mode back and forth.
      const derived = selectedEvent.event_start || "";
      setClosingTime(derived);
      setIsDeadlineActive(!!derived);
    } else {
      // Sign-out closes at Call Time End, if the event set one; otherwise
      // there's no upper bound (matches the backend's fallback behavior).
      const derived = selectedEvent.call_time_end || "";
      setClosingTime(derived);
      setIsDeadlineActive(!!derived);
    }
  }, [selectedEvent, scanMode]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(`qr_mode_${eventId}`, scanMode);
  }, [scanMode, eventId]);

  // "Window just opened" pop-up -- the mirror of the "window just closed"
  // timer below. windowNotYetOpen already flips from a timestamp to null
  // the moment the window opens (ticked by currentHHMM every 15s above);
  // this just announces that transition with a modal instead of letting
  // the "not open yet" banner silently disappear. A ref (not state) skips
  // the very first render for a given event/mode so switching to an
  // already-open event doesn't fire a false "just opened" popup.
  const windowOpenBaseline = useRef<{ key: string; wasClosed: boolean } | null>(null);
  useEffect(() => {
    if (!selectedEvent) {
      windowOpenBaseline.current = null;
      return;
    }
    const key = `${selectedEvent.id}_${scanMode}`;
    const baseline = windowOpenBaseline.current;

    if (!baseline || baseline.key !== key) {
      // First observation of this event/mode combo -- just record where
      // things stand, don't announce anything yet.
      windowOpenBaseline.current = { key, wasClosed: !!windowNotYetOpen };
      return;
    }

    if (baseline.wasClosed && !windowNotYetOpen) {
      showModal(
        'success',
        scanMode === "in" ? t("signInOpenedTitle") : t("signOutOpenedTitle"),
        scanMode === "in" ? t("signInOpenedMessage") : t("signOutOpenedMessage")
      );
    }
    windowOpenBaseline.current = { key, wasClosed: !!windowNotYetOpen };
  }, [windowNotYetOpen, selectedEvent, scanMode]);

  useEffect(() => {
    if (!isDeadlineActive || !closingTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const nowFullStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      if (nowFullStr >= closingTime) {
        const expiredMode = scanMode;
        setScan(null);
        setScanMode(prev => prev === "in" ? "out" : "in");
        setIsDeadlineActive(false);
        setClosingTime("");
        setIsCameraOn(false);

        if (expiredMode === "in") {
          showModal('timeout-in', t("signInClosedTitle"), t("signInClosedMessage"));
        } else {
          showModal('timeout-out', t("signOutClosedTitle"), t("signOutClosedMessage"));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isDeadlineActive, closingTime, scanMode]);

  // Shared resolver used by both the camera QR path and the Manual / Physical
  // ID path ("2 in 1" adviser recommendation) — looks a resident up by id,
  // checks event eligibility against DATABASE memberships, and sets `scan`.
  const resolveAndSetScan = (
    userId: string | number,
    fallback?: { name?: string; userCode?: string }
  ): ScanResult | null => {
    const matchedResident = residents?.find((r: any) => {
      if (r.id == userId || r.user_id == userId || r.real_id == userId) return true;
      const checkString = r.user_code || r.id || "";
      if (typeof checkString === "string") {
        const stripped = checkString.replace("PR-", "").replace("RES-", "");
        if (parseInt(stripped, 10) == (userId as any)) return true;
      }
      return false;
    });

    if (!matchedResident) {
      showModal('error', t("residentNotFoundTitle"), `${t("noResidentFoundWithId")} ${userId}`);
      return null;
    }

    const liveMemberships = matchedResident.memberships && Array.isArray(matchedResident.memberships)
      ? matchedResident.memberships.map((m: any) => m.name || m)
      : [];

    const residentName = matchedResident.first_name && matchedResident.last_name
      ? `${matchedResident.first_name} ${matchedResident.last_name}`
      : fallback?.name || `${t("residentHashPrefix")}${userId}`;

    const userCode = matchedResident.user_code || fallback?.userCode || `${t("idFieldLabel")} ${userId}`;
    const photo = matchedResident.photo || matchedResident.validation_id_url;
    const role = matchedResident.role || t("residentOption");

    let hasAccess = true;
    let reason = t("openEventAllowedMessage");

    if (requiredMemberships && requiredMemberships.length > 0) {
      const requiredNames = requiredMemberships.map((m: any) => m.name);

      if (liveMemberships.length === 0) {
        hasAccess = false;
        reason = `❌ ${t("noMembershipsFoundRequires")} ${requiredNames.join(` ${t("orWord")} `)}`;
      } else {
        hasAccess = liveMemberships.some((userMem: string) =>
          requiredNames.includes(userMem)
        );
        reason = hasAccess
          ? `✅ ${t("eligibleLabel")} ${liveMemberships.join(", ")}`
          : `❌ ${t("requiresLabel")} ${requiredNames.join(` ${t("orWord")} `)} (${t("hasLabel")} ${liveMemberships.join(", ") || t("noneLabel")})`;
      }
    }

    const resolved: ScanResult = {
      ok: true,
      residentId: String(matchedResident.id ?? matchedResident.user_id ?? matchedResident.real_id ?? userId),
      residentName,
      hasAccess,
      reason,
      memberships: liveMemberships,
      photo,
      role,
      userCode,
    };
    setScan(resolved);
    setScanNote(null);
    setScanAuto(false);

    return resolved;
  };

  const handleQRCodeScan = (qrString: string) => {
    // Ignore repeat decodes of the same code while a result is being shown.
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    try {
      const data: any = JSON.parse(qrString);

      // New QR codes carry user_code + name only (no user_id) -- resolve the
      // resident by their unique code. Older cards that still hold user_id work too.
      if (!data.user_id && data.user_code) {
        const code = String(data.user_code).trim().toLowerCase();
        const hit = (residents ?? []).find((r: any) => String(r.user_code ?? "").trim().toLowerCase() === code);
        if (hit) data.user_id = hit.id ?? hit.user_id ?? hit.real_id;
      }

      if (!data.user_id) {
        showModal('error', t("invalidQrCodeTitle"), t("missingUserIdInQr"));
        startResultCountdown();
        return;
      }

      const found = resolveAndSetScan(data.user_id, { name: data.name, userCode: data.user_code });
      if (!found) {
        startResultCountdown();
        return;
      }

      setScanAuto(true);
      if (found.hasAccess) {
        // Queue mode: record attendance immediately, no extra Confirm tap.
        confirmAttendance(found, true);
      }
      startResultCountdown();
    } catch (e) {
      console.error("QR Scan error:", e);
      showModal('error', t("scanFailedTitle"), t("invalidQrFormatMessage"));
      startResultCountdown();
    }
  };

  // Manual / Physical ID search results — matches by user_code or name so
  // staff can type a printed ID card's code, or search by resident name.
  const manualResults = React.useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q || !residents) return [];

    // IDs are stored zero-padded ("PR-0555") but people type them short ("pr-555",
    // "pr 555", "555"). Compare the digits as numbers so all of these find the same card.
    const qDigits = q.replace(/\D/g, "");
    const looksLikeId = /^(pr)?[\s\-_.]*\d+$/.test(q) && qDigits.length > 0;
    const qNum = qDigits ? String(parseInt(qDigits, 10)) : "";
    const words = q.split(/\s+/).filter(Boolean);

    const scored: { r: any; score: number }[] = [];
    for (const r of residents as any[]) {
      const code = String(r.user_code ?? "").toLowerCase();
      const codeDigits = code.replace(/\D/g, "");
      const codeNum = codeDigits ? String(parseInt(codeDigits, 10)) : "";
      const haystack = `${r.first_name ?? ""} ${r.middle_name ?? ""} ${r.last_name ?? ""} ${r.suffix ?? ""}`.toLowerCase();

      let score = 0;
      if (looksLikeId) {
        if (codeNum === qNum) score = 3;                       // exact number: pr-555 = PR-0555
        else if (codeDigits.includes(qDigits) || codeNum.startsWith(qNum)) score = 1; // partial: "55"
      }
      if (!score && code.includes(q)) score = 2;               // typed the code as stored
      if (!score && words.every((w) => haystack.includes(w) || code.includes(w))) score = 1; // names, any order
      if (score) scored.push({ r, score });
    }
    return scored.sort((x, y) => y.score - x.score).map((x) => x.r).slice(0, 8);
  }, [manualQuery, residents]);

  const handleManualSelect = (resident: any) => {
    const userId = resident.id ?? resident.user_id ?? resident.real_id;
    const picked = resolveAndSetScan(userId, {
      name: `${resident.first_name ?? ""} ${resident.last_name ?? ""}`.trim(),
      userCode: resident.user_code,
    });
    setManualQuery("");
    // Same queue behaviour as the camera: eligible residents are recorded
    // right away, and every result (allowed, denied, window closed) clears
    // itself after 5 seconds so the next person in line can be served.
    if (picked) {
      setScanAuto(true);
      if (picked.hasAccess) confirmAttendance(picked, true);
      startResultCountdown();
    }
  };

  const isPastClosingTime = () => {
    if (!isDeadlineActive || !closingTime) return false;
    return nowDateTimeStr >= closingTime;
  };

  const applyLocalAttendance = (residentId: string, residentName: string, now: string) => {
    setAttendance(prev => {
      const list = prev[eventId] ?? [];
      const residentIndex = list.findIndex(e => e.residentId == residentId);
      if (scanMode === "in") {
        if (residentIndex !== -1) {
          const updated = [...list];
          updated[residentIndex].timeIn = now;
          updated[residentIndex].status = getStatus(updated[residentIndex].timeIn, updated[residentIndex].timeOut);
          return { ...prev, [eventId]: updated };
        }
        return { ...prev, [eventId]: [...list, { residentId, residentName, timeIn: now, timeOut: null, status: "in" as const }] };
      } else {
        if (residentIndex !== -1) {
          const updated = [...list];
          updated[residentIndex].timeOut = now;
          updated[residentIndex].status = getStatus(updated[residentIndex].timeIn, updated[residentIndex].timeOut);
          return { ...prev, [eventId]: updated };
        }
        return { ...prev, [eventId]: [...list, { residentId, residentName, timeIn: null, timeOut: now, status: "in" as const }] };
      }
    });
  };

  const confirmAttendance = async (scanArg: ScanResult | null = scan, auto = false) => {
    const target = scanArg;
    if (!target?.ok || !target.hasAccess) return;

    // Queue mode never opens a blocking pop-up -- the outcome shows inside
    // the result card instead, so the line keeps moving.
    const report = (kind: 'success' | 'error' | 'info', title: string, message: string) => {
      if (auto) setScanNote({ kind, text: message });
      else showModal(kind, title, message);
    };

    if (auto) {
      if (windowNotYetOpen) {
        setScanNote({ kind: 'error', text: `${scanMode === "in" ? t("signInOpensAtBanner") : t("signOutOpensAtBanner")} ${formatEventOptionDateTime(windowNotYetOpen) || windowNotYetOpen}` });
        return;
      }
      if (isPastClosingTime()) {
        setScanNote({ kind: 'error', text: `${scanMode === "in" ? t("deadlinePassedPrefix") : t("signOutDeadlinePassedPrefix")} (${formatEventOptionDateTime(closingTime) || closingTime}) ${scanMode === "in" ? t("signInClosedSuffix") : t("signOutClosedSuffix")}` });
        return;
      }
    }

    const endpoint = scanMode === "in" ? "/attendance/time-in" : "/attendance/time-out";
    const method = scanMode === "in" ? "POST" : "PUT";
    const payload = { event_id: eventId, user_id: target.residentId };

    const d = new Date();
    const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    // Adviser recommendation: "Piao has slow/limited connectivity — include
    // offline functionality too." If we're already offline, don't even try
    // the request — queue it straight away so check-in never stalls at a
    // live event waiting for a request that can't reach the server.
    if (!navigator.onLine) {
      queueAttendance({ endpoint, method, payload, residentName: target.residentName });
      applyLocalAttendance(target.residentId, target.residentName, now);
      if (!auto) setScan(null);
      report('info', t("savedOfflineTitle"), `${target.residentName} — ${scanMode === "in" ? t("signInWord") : t("signOutWord")} ${t("savedOfflineMessageSuffix")}`);
      return;
    }

    try {
      const response = await api.request({ url: endpoint, method, data: payload });
      const result = response.data;

      applyLocalAttendance(target.residentId, target.residentName, now);
      if (!auto) setScan(null);
      report('success', t("successTitle"), result.message || t("attendanceRecordedSuccess"));

    } catch (error: any) {
      // A genuine "not eligible / already signed in" rejection from the
      // server (4xx with a message) should surface as-is; a network-level
      // failure (no response at all) is what gets queued for offline retry.
      if (error?.response) {
        report('error', t("actionFailedTitle"), error.response.data?.message || t("failedToRecordAttendance"));
        return;
      }

      console.error("Attendance Error:", error);
      queueAttendance({ endpoint, method, payload, residentName: target.residentName });
      applyLocalAttendance(target.residentId, target.residentName, now);
      if (!auto) setScan(null);
      report('info', t("savedOfflineTitle"), `${t("connectionIssuePrefix")} ${target.residentName} — ${scanMode === "in" ? t("signInWord") : t("signOutWord")} ${t("queuedSyncSuffix")}`);
    }
  };

  // The card headings stay real text; the step labels and everything under them are placeholders.
  const stepLabel = () => <Skeleton className="mb-2 h-3 w-28" />;
  const stepsSkeleton = (
<div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div>
                {stepLabel()}
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <div>
                {stepLabel()}
                <div className="flex gap-2">
                  <Skeleton className="h-11 flex-1 rounded-xl" />
                  <Skeleton className="h-11 flex-1 rounded-xl" />
                </div>
              </div>
              <div>
                {stepLabel()}
                <div className="flex gap-2">
                  <Skeleton className="h-11 flex-1 rounded-xl" />
                  <Skeleton className="h-11 flex-1 rounded-xl" />
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                {stepLabel()}
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            </div>
  );
  const cameraSkeleton = <Skeleton className="min-h-[380px] w-full rounded-2xl" />;
  const resultSkeleton = <Skeleton className="h-24 w-full rounded-2xl" />;

  // First load of an event's attendance: the scanner and result bodies show placeholders
  // too, not just the roster. Later page / search changes in the roster do not touch them,
  // so a running camera is never restarted by them.
  const bodyLoading = !!eventId && rosterEventLoaded !== eventId;

  if (openSkeleton) {
    // Same structure as the page below (scanner card on the left; scan result and
    // attendance roster stacked on the right) so nothing jumps when it loads.
    return (
      <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("scan")}</h1>
            <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("scanSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold text-white">{t("cameraScannerLabel")}</h2>
                  <p className="mt-0.5 text-sm text-white/50">{t("oneQrPerResident")}</p>
                </div>
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
              </div>
              <div className="p-5 space-y-5">
                {stepsSkeleton}
                {cameraSkeleton}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
                <div className="border-b border-white/10 p-5">
                  <h2 className="text-[17px] font-bold text-white">{t("scanResultTitle")}</h2>
                  <p className="mt-0.5 text-sm text-white/50">{t("scanResultSubtitle")}</p>
                </div>
                <div className="p-5">{resultSkeleton}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
                <div className="border-b border-white/10 p-5">
                  <h2 className="text-base font-bold text-white">{t("attendanceRosterTitle")}</h2>
                  <Skeleton className="mt-2 h-3.5 w-2/5" />
                  <Skeleton className="mt-3 h-10 w-full rounded-full" />
                </div>
                <div className="p-5 space-y-3">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <div key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
                <PagerSkeleton withLabel className="px-5 py-3 border-t border-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("scan")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("scanSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-white">
                {checkInMethod === "camera" ? t("cameraScannerLabel") : t("manualPhysicalIdLookupLabel")}
              </h2>
              <p className="mt-0.5 text-sm text-white/50">
                {checkInMethod === "camera" ? t("oneQrPerResident") : t("typeResidentIdOrName")}
              </p>
            </div>
            {checkInMethod === "camera" && (
              <button
                type="button"
                onClick={() => setIsCameraOn(!isCameraOn)}
                disabled={!isDeadlineActive}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  !isDeadlineActive
                    ? "bg-white/10 text-white/40 cursor-not-allowed"
                    : isCameraOn
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-sage-700 text-white hover:bg-sage-800"
                }`}
              >
                {isCameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {bodyLoading ? stepsSkeleton : (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div ref={eventDropdownRef} className="relative">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("selectEventStep1")}</label>
                <button
                  type="button"
                  onClick={() => setEventDropdownOpen((v) => !v)}
                  className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-left text-[15px] transition hover:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-700/20"
                >
                  <span className={ev ? "truncate font-medium text-white" : "text-white/40"}>
                    {ev ? ev.title : t("selectEventStep1")}
                  </span>
                  {ev && <span className="ml-auto"><StatusPill e={ev} /></span>}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${eventDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {eventDropdownOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-white/10 bg-[#0A0E1A] shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.05] px-4 py-2">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4FBEB0] animate-pulse" />
                        {t("currentDateTimeLabel")}
                      </span>
                      <span className="text-sm font-bold text-white/90">{currentDateTimeLabel}</span>
                    </div>
                    <div className="border-b border-white/10 p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                        <input
                          autoFocus
                          value={eventSearchQuery}
                          onChange={(e) => setEventSearchQuery(e.target.value)}
                          placeholder={t("scannerSearchEventPlaceholder")}
                          className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.06] text-white placeholder-white/30 pl-8 pr-[4.5rem] text-[15px] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
                        />
                        {eventSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setEventSearchQuery("")}
                            aria-label="Clear search"
                            title="Clear"
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-sm font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
                          >
                            {t("clearLabel")}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto filter-dropdown-scroll-dark">
                      {filteredEventOptions.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm italic text-white/40">
                          {upcomingEvents.length === 0 ? t("noUpcomingEventsLabel") : t("noEventsMatchSearch")}
                        </p>
                      ) : (
                        filteredEventOptions.map((e: any) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              setEventId(String(e.id));
                              setEventDropdownOpen(false);
                              setEventSearchQuery("");
                            }}
                            className={`w-full text-left px-4 py-2.5 text-[15px] transition ${
                              String(e.id) === String(eventId)
                                ? "bg-white/[0.09] text-white font-semibold shadow-[inset_3px_0_0_#4FBEB0]"
                                : "text-white hover:bg-white/[0.05]"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="block truncate">{highlightMatches(e.title, eventSearchQuery)}</span>
                              <StatusPill e={e} />
                            </span>
                            {formatEventOptionDateTime(e.event_start) && (
                              <span className={`block text-sm font-normal mt-0.5 ${String(e.id) === String(eventId) ? "text-white/60" : "text-white/40"}`}>
                                {formatEventOptionDateTime(e.event_start)}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("checkinMethodStep2")}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setCheckInMethod("camera"); setManualQuery(""); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                      checkInMethod === "camera" ? "bg-sage-700 text-white shadow-sm" : "border border-white/10 bg-white/[0.03] text-white/50 hover:bg-sage-50/10"
                    }`}
                  >
                    <ScanLine className="h-4 w-4" /> {t("cameraScanLabel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCheckInMethod("manual"); setIsCameraOn(false); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                      checkInMethod === "manual" ? "bg-sage-700 text-white shadow-sm" : "border border-white/10 bg-white/[0.03] text-white/50 hover:bg-sage-50/10"
                    }`}
                  >
                    <IdCard className="h-4 w-4" /> {t("manualPhysicalIdLabel")}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("scanModeStep3")}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScanMode("in")}
                    disabled={scanMode === "out"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                      scanMode === "in"
                        ? "bg-sage-700 text-white shadow-sm hover:bg-sage-800"
                        : "border border-white/10 bg-white/[0.03] text-white/30 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {t("signInWord")}
                  </button>
                  <button
                    onClick={() => setScanMode("out")}
                    disabled={scanMode === "in"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                      scanMode === "out"
                        ? "bg-gold-400 text-[#08130F] shadow-sm hover:bg-gold-500"
                        : "border border-white/10 bg-white/[0.03] text-white/30 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {t("signOutWord")}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">
                  {windowNotYetOpen
                    ? (scanMode === "in" ? t("signInOpeningTimeLabel") : t("signOutOpeningTimeLabel"))
                    : (scanMode === "in" ? t("signInClosingTimeLabel") : t("signOutClosingTimeLabel"))}
                </label>
                {/* Read-only -- this window comes from the event's own Start
                    Time / Call Time fields (set on the Events screen), not
                    typed in here each session. */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[15px] text-white">
                  {windowNotYetOpen
                    ? `${t("opensAtLabel")} ${formatEventOptionDateTime(windowNotYetOpen) || windowNotYetOpen}`
                    : closingTime
                      ? `${t("closesAtLabel")} ${formatEventOptionDateTime(closingTime) || closingTime}`
                      : t("noClosingTimeSet")}
                </div>
              </div>
            </div>
            )}

            {bodyLoading && !(checkInMethod === "camera" && isCameraOn) ? cameraSkeleton : checkInMethod === "camera" ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black min-h-[380px]">
                {isCameraOn ? (
                  <div className="absolute inset-0 h-full w-full">
                    <Scanner
                      onScan={(result) => {
                        if (result && result.length > 0) {
                          onCameraDecode(result[0].rawValue);
                        }
                      }}
                      onError={(error) => {
                        console.log("Camera error:", error?.message);
                      }}
                      constraints={{ facingMode: "environment", advanced: [{ focusMode: "continuous" } as any] }}
                      sound={false}
                      // Keep reporting a code that stays in front of the camera
                      // (by default the scanner reports it once and then stays
                      // silent until it leaves view, which made a re-scan of the
                      // same QR look "stuck"). The 5-second lock in
                      // handleQRCodeScan stops this from double-recording.
                      allowMultiple
                      scanDelay={400}
                      components={{ finder: true }}
                      styles={{ container: { width: '100%', height: '100%' }, video: { objectFit: 'cover' } }}
                    />
                    <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm font-bold uppercase tracking-wide text-white backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> {t("cameraScanLabel")}
                    </div>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative h-56 w-56">
                        <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-sage-300" />
                        <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-sage-300" />
                        <span className="absolute left-0 bottom-0 h-8 w-8 rounded-bl-xl border-l-4 border-b-4 border-sage-300" />
                        <span className="absolute right-0 bottom-0 h-8 w-8 rounded-br-xl border-r-4 border-b-4 border-sage-300" />
                      </div>
                    </div>
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex w-[90%] max-w-[300px] flex-col items-center gap-1.5 z-10">
                      <div className="rounded-full bg-black/70 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
                        {t("scanningForQr")}
                      </div>
                      <div className="rounded-xl bg-black/50 px-4 py-1.5 text-center text-sm text-white/80 backdrop-blur">
                        <span className="font-semibold text-white">{t("blurryLabel")}</span> {t("movePhoneCloserNote")}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 text-white/50">
                    <Camera className="h-9 w-9" />
                    <p className="text-[15px]">{t("cameraOffClickToStart")}</p>
                  </div>
                )}
              </div>
            ) : (
              // Adviser recommendation: "2 in 1 — Text/physical QR ID" manual lookup
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] min-h-[380px] p-5">
                <div className="flex items-center gap-2 font-bold text-sage-800 mb-3">
                  <IdCard className="h-4 w-4" /> {t("manualPhysicalIdCheckin")}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    autoFocus
                    value={manualQuery}
                    onChange={(e: any) => setManualQuery(e.target.value)}
                    placeholder={t("typeResidentIdPlaceholder")}
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
                  />
                </div>
                <div className="mt-3 space-y-2 max-h-[270px] overflow-y-auto">
                  {residentsFromCache && (
                    <p className="text-[12px] text-amber-300/80 text-center pb-1">{t("residentsSavedCopyNote")}</p>
                  )}
                  {manualQuery.trim() && manualResults.length === 0 && (
                    <p className="text-[15px] text-white/40 italic text-center py-6">
                      {residentsReady ? t("noMatchingResidentFound") : t("residentsLoadingHint")}
                    </p>
                  )}
                  {manualResults.map((r: any) => (
                    <button
                      key={r.id ?? r.user_id ?? r.real_id}
                      onClick={() => handleManualSelect(r)}
                      className="w-full flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-left hover:border-sage-400 hover:shadow-sm transition"
                    >
                      <div>
                        <p className="font-semibold text-white text-[15px]">{highlightMatches(`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), manualQuery)}</p>
                        <p className="text-sm text-white/40">{highlightMatches(r.user_code, manualQuery)}</p>
                      </div>
                      <span className="text-sm font-bold text-sage-700">{t("selectArrowLabel")}</span>
                    </button>
                  ))}
                  {!manualQuery.trim() && (
                    <p className="text-[15px] text-white/40 italic text-center py-10">{t("startTypingToFindResident")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-white">{t("scanResultTitle")}</h2>
                <p className="mt-0.5 text-sm text-white/50">{t("scanResultSubtitle")}</p>
              </div>
            </div>
            <div className="p-5">
              {bodyLoading ? resultSkeleton : !scan ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-white/50">
                  {t("noScanPerformedYet")}
                </div>
              ) : (
                <div
                  className={`rounded-2xl border p-5 transition-colors ${
                    scan.hasAccess
                      ? scanMode === "in"
                        ? "border-[#4FBEB0]/30 bg-[#4FBEB0]/10"
                        : "border-gold-400/30 bg-gold-400/10"
                      : "border-red-500/25 bg-red-500/10"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-20 h-20 shrink-0 rounded-2xl overflow-hidden border-2 shadow-sm ${scan.hasAccess && scanMode === "in" ? "border-white/20 bg-white/10" : "border-white/20 bg-white/10"}`}>
                      {scan.photo ? (
                        <img src={scan.photo} alt={scan.residentName} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full flex flex-col items-center justify-center p-2 ${"text-white/40 bg-white/[0.06]"}`}>
                          <span className="text-[10px] font-bold uppercase text-center leading-tight">{t("noPhotoShort")}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-2">
                        {scan.hasAccess
                          ? (scanMode === "in" ? <CheckCircle className="text-[#7DD8CB] shrink-0 mt-0.5 h-5 w-5" /> : <CheckCircle className="text-gold-300 shrink-0 mt-0.5 h-5 w-5" />)
                          : <XCircle className="text-red-400 shrink-0 mt-0.5 h-5 w-5" />
                        }
                        <div className="flex flex-col items-start text-left">
                          <p className={`text-xl font-bold leading-tight ${scan.hasAccess ? scanMode === "in" ? "text-[#7DD8CB]" : "text-gold-300" : "text-red-400"}`}>
                            {scan.hasAccess ? scan.residentName : t("deniedAttendanceLabel")}
                          </p>
                          {scan.hasAccess && (
                            <>
                              <p className={`text-base font-bold mt-1.5 tracking-wide text-white`}>
                                {scan.userCode.replace("-", " - ")}
                              </p>
                              <p className={`text-sm font-bold uppercase tracking-wider mt-0.5 text-white/50`}>
                                {scan.role}
                              </p>
                            </>
                          )}
                          <p className={`mt-2 text-base font-medium text-white/80`}>
                            {scan.reason}
                          </p>
                          {scanNote && (
                            <p className={`mt-2 text-sm font-bold ${scanNote.kind === 'success' ? 'text-[#7DD8CB]' : scanNote.kind === 'error' ? 'text-red-400' : 'text-gold-300'}`}>
                              {scanNote.text}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {scanAuto && nextScanIn > 0 && (
                    <p className="mt-4 text-center text-sm font-semibold text-white/50">
                      {t("nextScanInLabel")} {nextScanIn}s
                    </p>
                  )}

                  {scan.hasAccess && !scanAuto && (
                    <>
                      {windowNotYetOpen ? (
                        <div className="mt-4 p-3 rounded-xl border border-gold-400/30 bg-gold-400/10 text-center text-base font-bold text-gold-300">
                          {scanMode === "in" ? t("signInOpensAtBanner") : t("signOutOpensAtBanner")} {formatEventOptionDateTime(windowNotYetOpen) || windowNotYetOpen}
                        </div>
                      ) : isPastClosingTime() ? (
                        <div className="mt-4 p-3 rounded-xl border border-red-500/25 bg-red-500/10 text-center text-base font-bold text-red-400">
                          {scanMode === "in" ? t("deadlinePassedPrefix") : t("signOutDeadlinePassedPrefix")} ({formatEventOptionDateTime(closingTime) || closingTime}) {scanMode === "in" ? t("signInClosedSuffix") : t("signOutClosedSuffix")}
                        </div>
                      ) : (
                        <button
                          onClick={() => confirmAttendance()}
                          className={`mt-4 w-full py-3 text-base font-bold rounded-full transition-colors shadow-sm ${
                            scanMode === "in" ? "text-white bg-sage-700 hover:bg-sage-800" : "text-[#08130F] bg-gold-400 hover:bg-gold-500"
                          }`}
                        >
                          {t("confirmButtonPrefix")} {scanMode === "in" ? t("signInWord") : t("signOutWord")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-base font-bold text-white">{t("attendanceRosterTitle")}</h2>
              <p className="mt-0.5 text-sm text-white/50">{rosterAll} {t("recordsForThisEvent")}</p>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder={t("search")}
                  className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-20 text-[15px] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
                />
                {rosterSearch && (
                  <button
                    type="button"
                    onClick={() => setRosterSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#161C2E]"
                  >
                    {t("clearLabel")}
                  </button>
                )}
              </div>
            </div>
            <div className="p-5">
              {(() => {
                const list = rosterRows;
                const start = (rosterPage - 1) * ROSTER_PER_PAGE;
                if (rosterSwitching) {
                  return (
                    <div className="space-y-3">
                      {Array.from({ length: ROSTER_PER_PAGE }).map((_, k) => (
                        <div key={k} className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-28" />
                          </div>
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      ))}
                    </div>
                  );
                }
                if (!rosterAll) {
                  return <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-white/50">{t("noAttendeesYet")}</p>;
                }
                if (!list.length) {
                  return <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-white/50">{t("noMatchesFoundLabel")}</p>;
                }
                return (
                  <div className="space-y-3">
                    {list.map((rec, i) => (
                      <div key={rec.residentId} className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between transition-colors">
                        <div>
                          <p className="text-base font-semibold text-white">{start + i + 1}. {highlightMatches(rec.residentName, rosterSearch)}</p>
                          <div className="flex gap-4 mt-1 text-[13px] text-white/50 font-medium">
                            <span className="flex items-center gap-1 text-sage-700"><LogIn className="h-3.5 w-3.5" /> {rec.timeIn ? highlightMatches(rec.timeIn, rosterSearch) : "—"}</span>
                            <span className="flex items-center gap-1 text-gold-300"><LogOut className="h-3.5 w-3.5" /> {rec.timeOut ? highlightMatches(rec.timeOut, rosterSearch) : "—"}</span>
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rec.status === "complete" ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : rosterStatusLabel(rec) === t("statusPendingLabel") ? "bg-white/10 text-white/60" : "bg-gold-400/15 text-gold-300"}`}>
                          {highlightMatches(rosterStatusLabel(rec), rosterSearch)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {(() => {
              const total = rosterTotal;
              const totalPages = Math.max(1, rosterLastPage);
              if (totalPages <= 1) return null;
              if (rosterSwitching) return <PagerSkeleton withLabel className="px-5 py-3 border-t border-white/10" />;
              const current = Math.min(rosterPage, totalPages);
              return (
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-5 py-3 border-t border-white/10">
                  <p className="text-sm text-white/45 text-center sm:text-left">
                    {t("pageOfLabel")} {current} {t("ofPagesLabel")} {totalPages} • {total} {t("recordsLabelShort")} • {ROSTER_PER_PAGE} {t("perPage")}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRosterPage(Math.max(1, current - 1))}
                      disabled={current === 1}
                      aria-label="Previous page"
                      className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                    >
                      ←
                    </button>
                    <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">{current}</span>
                    <button
                      type="button"
                      onClick={() => setRosterPage(Math.min(totalPages, current + 1))}
                      disabled={current === totalPages}
                      aria-label="Next page"
                      className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition"
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {modalConfig.isOpen && (() => {
        const variant = SCAN_STATUS_VARIANT[modalConfig.type];
        const accent = variant === 'error' ? 'text-red-400' : variant === 'warning' ? 'text-amber-400' : 'text-sage-400';
        const titleColor = variant === 'success' ? 'text-white' : accent;
        const buttonColor = variant === 'error' ? 'bg-red-500 hover:bg-red-600' : variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sage-700 hover:bg-sage-800';
        const Icon = variant === 'error' ? XCircle : variant === 'warning' ? AlertTriangle : CheckCircle;
        return (
          <Portal><div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-[340px] p-6 py-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-200">
              <Icon className={`${accent} mb-4`} size={56} strokeWidth={2} />
              <h3 className={`text-xl font-bold mb-2 ${titleColor}`}>{modalConfig.title}</h3>
              <p className="text-[15px] text-white/50 mb-6 px-2">{modalConfig.message}</p>
              <button
                onClick={closeModal}
                className={`text-white px-10 py-2.5 rounded-full font-semibold tracking-wide transition-colors ${buttonColor}`}
              >
                {t("okLabel")}
              </button>
            </div>
          </div></Portal>
        );
      })()}
    </div>
    </div>
  );
}