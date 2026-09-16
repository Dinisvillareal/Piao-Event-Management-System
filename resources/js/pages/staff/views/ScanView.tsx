import React, { useState, useEffect, useMemo, useRef } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, IdCard, ScanLine, Search, ChevronDown } from "lucide-react";
import { Scanner } from '@yudiel/react-qr-scanner';
import api from "../../../lib/api";
import { queueAttendance } from "../../../lib/offlineQueue";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { useLanguage } from "../../../i18n/LanguageContext";

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

export default function ScanView({ events, residents, memberships }: any) {
          const { t } = useLanguage();
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
    return `${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  });
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date();
      setCurrentHHMM(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      setCurrentDateTimeLabel(`${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`);
    }, 15000);
    return () => clearInterval(tick);
  }, []);

  const formatEventOptionDateTime = (isoLike?: string): string => {
    if (!isoLike) return "";
    const d = new Date(String(isoLike).replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  };

  const isOnline = useOnlineStatus();

  const [modalConfig, setModalConfig] = useState<ModalConfig>({ isOpen: false, type: 'info', title: '', message: '' });

  const showModal = (type: ModalConfig['type'], title: string, message: string) => {
    setModalConfig({ isOpen: true, type, title, message });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

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
    return (events ?? [])
      .filter((e: any) => {
        const effectiveEnd = e.call_time_end || e.event_end || e.event_start || e.date;
        if (!effectiveEnd) return true;
        return nowDateTimeStr <= effectiveEnd;
      })
      .sort((a: any, b: any) => (a.title ?? "").localeCompare(b.title ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, currentHHMM]);

  const filteredEventOptions = useMemo(() => {
    const q = eventSearchQuery.trim().toLowerCase();
    if (!q) return upcomingEvents;
    return upcomingEvents.filter((e: any) => (e.title ?? "").toLowerCase().includes(q));
  }, [upcomingEvents, eventSearchQuery]);

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
  ): boolean => {
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
      return false;
    }

    const liveMemberships = matchedResident.memberships && Array.isArray(matchedResident.memberships)
      ? matchedResident.memberships.map((m: any) => m.name || m)
      : [];

    const residentName = matchedResident.first_name && matchedResident.last_name
      ? `${matchedResident.first_name} ${matchedResident.last_name}`
      : fallback?.name || `${t("residentHashPrefix")}${userId}`;

    const userCode = matchedResident.user_code || fallback?.userCode || `${t("idFieldLabel")} ${userId}`;
    const photo = matchedResident.photo || matchedResident.validation_id_url;
    const role = matchedResident.role || "Resident";

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

    setScan({
      ok: true,
      residentId: String(matchedResident.id ?? matchedResident.user_id ?? matchedResident.real_id ?? userId),
      residentName,
      hasAccess,
      reason,
      memberships: liveMemberships,
      photo,
      role,
      userCode,
    });

    return true;
  };

  const handleQRCodeScan = (qrString: string) => {
    try {
      const data = JSON.parse(qrString);

      if (!data.user_id) {
        showModal('error', t("invalidQrCodeTitle"), t("missingUserIdInQr"));
        return;
      }

      const found = resolveAndSetScan(data.user_id, { name: data.name, userCode: data.user_code });
      if (found) setIsCameraOn(false);

    } catch (e) {
      console.error("QR Scan error:", e);
      showModal('error', t("scanFailedTitle"), t("invalidQrFormatMessage"));
    }
  };

  // Manual / Physical ID search results — matches by user_code or name so
  // staff can type a printed ID card's code, or search by resident name.
  const manualResults = React.useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q || !residents) return [];
    return residents
      .filter((r: any) => {
        const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase();
        const code = (r.user_code ?? "").toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .slice(0, 8);
  }, [manualQuery, residents]);

  const handleManualSelect = (resident: any) => {
    const userId = resident.id ?? resident.user_id ?? resident.real_id;
    resolveAndSetScan(userId, {
      name: `${resident.first_name ?? ""} ${resident.last_name ?? ""}`.trim(),
      userCode: resident.user_code,
    });
    setManualQuery("");
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

  const confirmAttendance = async () => {
    if (!scan?.ok || !scan.hasAccess) return;
    const endpoint = scanMode === "in" ? "/attendance/time-in" : "/attendance/time-out";
    const method = scanMode === "in" ? "POST" : "PUT";
    const payload = { event_id: eventId, user_id: scan.residentId };

    const d = new Date();
    const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    // Adviser recommendation: "Piao has slow/limited connectivity — include
    // offline functionality too." If we're already offline, don't even try
    // the request — queue it straight away so check-in never stalls at a
    // live event waiting for a request that can't reach the server.
    if (!navigator.onLine) {
      queueAttendance({ endpoint, method, payload, residentName: scan.residentName });
      applyLocalAttendance(scan.residentId, scan.residentName, now);
      setScan(null);
      showModal('info', t("savedOfflineTitle"), `${scan.residentName} — ${scanMode === "in" ? t("signInWord") : t("signOutWord")} ${t("savedOfflineMessageSuffix")}`);
      return;
    }

    try {
      const response = await api.request({ url: endpoint, method, data: payload });
      const result = response.data;

      applyLocalAttendance(scan.residentId, scan.residentName, now);
      setScan(null);
      showModal('success', t("successTitle"), result.message || t("attendanceRecordedSuccess"));

    } catch (error: any) {
      // A genuine "not eligible / already signed in" rejection from the
      // server (4xx with a message) should surface as-is; a network-level
      // failure (no response at all) is what gets queued for offline retry.
      if (error?.response) {
        showModal('error', t("actionFailedTitle"), error.response.data?.message || t("failedToRecordAttendance"));
        return;
      }

      console.error("Attendance Error:", error);
      queueAttendance({ endpoint, method, payload, residentName: scan.residentName });
      applyLocalAttendance(scan.residentId, scan.residentName, now);
      setScan(null);
      showModal('info', t("savedOfflineTitle"), `${t("connectionIssuePrefix")} ${scan.residentName} — ${scanMode === "in" ? t("signInWord") : t("signOutWord")} ${t("queuedSyncSuffix")}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("scan")}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">{t("scanSubtitle")}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-[#E6E0D3] bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#E6E0D3] p-5">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {checkInMethod === "camera" ? t("cameraScannerLabel") : t("manualPhysicalIdLookupLabel")}
              </h2>
              <p className="mt-0.5 text-sm text-[#6B7280]">
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
                    ? "bg-[#E6E0D3]/70 text-[#6B7280] cursor-not-allowed"
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
            <div className="space-y-4 rounded-2xl border border-[#E6E0D3] bg-[#FAF9F5] p-5">
              <div ref={eventDropdownRef} className="relative">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("selectEventStep1")}</label>
                <button
                  type="button"
                  onClick={() => setEventDropdownOpen((v) => !v)}
                  className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[#E6E0D3] bg-white px-4 text-left text-sm transition hover:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-700/20"
                >
                  <span className={ev ? "truncate font-medium text-[#1A1A1A]" : "text-[#6B7280]"}>
                    {ev ? ev.title : t("selectEventStep1")}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#6B7280] transition-transform ${eventDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {eventDropdownOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-[#E6E0D3] bg-white shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#E6E0D3] bg-sage-50 px-4 py-2">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sage-700/80">
                        <span className="h-1.5 w-1.5 rounded-full bg-sage-600 animate-pulse" />
                        {t("currentDateTimeLabel")}
                      </span>
                      <span className="text-xs font-bold text-sage-800">{currentDateTimeLabel}</span>
                    </div>
                    <div className="border-b border-[#E6E0D3] p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]" />
                        <input
                          autoFocus
                          value={eventSearchQuery}
                          onChange={(e) => setEventSearchQuery(e.target.value)}
                          placeholder={t("scannerSearchEventPlaceholder")}
                          className="h-9 w-full rounded-xl border border-[#E6E0D3] bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
                        />
                      </div>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                      {filteredEventOptions.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs italic text-[#6B7280]">
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
                            className={`w-full text-left px-4 py-2.5 text-sm transition ${
                              String(e.id) === String(eventId)
                                ? "bg-sage-50 text-sage-800 font-semibold"
                                : "text-[#1A1A1A] hover:bg-sage-50/60"
                            }`}
                          >
                            <span className="block truncate">{e.title}</span>
                            {formatEventOptionDateTime(e.event_start) && (
                              <span className="block text-[11px] font-normal text-[#6B7280] mt-0.5">
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
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      checkInMethod === "camera" ? "bg-sage-700 text-white shadow-sm" : "border border-[#E6E0D3] bg-white text-[#6B7280] hover:bg-sage-50"
                    }`}
                  >
                    <ScanLine className="h-4 w-4" /> {t("cameraScanLabel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCheckInMethod("manual"); setIsCameraOn(false); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      checkInMethod === "manual" ? "bg-sage-700 text-white shadow-sm" : "border border-[#E6E0D3] bg-white text-[#6B7280] hover:bg-sage-50"
                    }`}
                  >
                    <IdCard className="h-4 w-4" /> {t("manualPhysicalIdLabel")}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#6B7280]">{t("adviserTwoInOneNote")}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">{t("scanModeStep3")}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScanMode("in")}
                    disabled={scanMode === "out"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      scanMode === "in"
                        ? "bg-sage-700 text-white shadow-sm hover:bg-sage-800"
                        : "border border-[#E6E0D3] bg-white text-[#B8B2A2] cursor-not-allowed opacity-60"
                    }`}
                  >
                    {t("signInWord")}
                  </button>
                  <button
                    onClick={() => setScanMode("out")}
                    disabled={scanMode === "in"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      scanMode === "out"
                        ? "bg-gold-700 text-white shadow-sm hover:brightness-95"
                        : "border border-[#E6E0D3] bg-white text-[#B8B2A2] cursor-not-allowed opacity-60"
                    }`}
                  >
                    {t("signOutWord")}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E6E0D3]">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-sage-700/80">
                  {scanMode === "in" ? t("signInClosingTimeLabel") : t("signOutClosingTimeLabel")}
                </label>
                {/* Read-only -- this window comes from the event's own Start
                    Time / Call Time fields (set on the Events screen), not
                    typed in here each session. */}
                <div className="rounded-xl border border-[#E6E0D3] bg-white px-4 py-2.5 text-sm text-[#1A1A1A]">
                  {closingTime ? `${t("closesAtLabel")} ${formatEventOptionDateTime(closingTime) || closingTime}` : t("noClosingTimeSet")}
                </div>
              </div>
            </div>

            {checkInMethod === "camera" ? (
              <div className="relative overflow-hidden rounded-2xl border border-[#E6E0D3] bg-black min-h-[380px]">
                {isCameraOn ? (
                  <div className="absolute inset-0 h-full w-full">
                    <Scanner
                      onScan={(result) => {
                        if (result && result.length > 0) {
                          handleQRCodeScan(result[0].rawValue);
                          setIsCameraOn(false);
                        }
                      }}
                      onError={(error) => {
                        console.log("Camera error:", error?.message);
                      }}
                      constraints={{ facingMode: "environment", advanced: [{ focusMode: "continuous" } as any] }}
                      sound={false}
                      components={{ finder: true }}
                      styles={{ container: { width: '100%', height: '100%' }, video: { objectFit: 'cover' } }}
                    />
                    <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">
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
                      <div className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur">
                        {t("scanningForQr")}
                      </div>
                      <div className="rounded-xl bg-black/50 px-4 py-1.5 text-center text-[11px] text-white/80 backdrop-blur">
                        <span className="font-semibold text-white">{t("blurryLabel")}</span> {t("movePhoneCloserNote")}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 text-white/50">
                    <Camera className="h-9 w-9" />
                    <p className="text-sm">{t("cameraOffClickToStart")}</p>
                  </div>
                )}
              </div>
            ) : (
              // Adviser recommendation: "2 in 1 — Text/physical QR ID" manual lookup
              <div className="rounded-2xl border border-[#E6E0D3] bg-[#FAF9F5] min-h-[380px] p-5">
                <div className="flex items-center gap-2 font-bold text-sage-800 mb-3">
                  <IdCard className="h-5 w-5" /> {t("manualPhysicalIdCheckin")}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    autoFocus
                    value={manualQuery}
                    onChange={(e: any) => setManualQuery(e.target.value)}
                    placeholder={t("typeResidentIdPlaceholder")}
                    className="h-11 w-full rounded-xl border border-[#E6E0D3] bg-white pl-11 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
                  />
                </div>
                <div className="mt-3 space-y-2 max-h-[270px] overflow-y-auto">
                  {manualQuery.trim() && manualResults.length === 0 && (
                    <p className="text-sm text-[#6B7280] italic text-center py-6">{t("noMatchingResidentFound")}</p>
                  )}
                  {manualResults.map((r: any) => (
                    <button
                      key={r.id ?? r.user_id ?? r.real_id}
                      onClick={() => handleManualSelect(r)}
                      className="w-full flex items-center justify-between rounded-xl bg-white border border-[#E6E0D3] px-4 py-3 text-left hover:border-sage-400 hover:shadow-sm transition"
                    >
                      <div>
                        <p className="font-semibold text-[#1A1A1A] text-sm">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-[#6B7280]">{r.user_code}</p>
                      </div>
                      <span className="text-xs font-bold text-sage-700">{t("selectArrowLabel")}</span>
                    </button>
                  ))}
                  {!manualQuery.trim() && (
                    <p className="text-sm text-[#6B7280] italic text-center py-10">{t("startTypingToFindResident")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[#E6E0D3] bg-white overflow-hidden">
            <div className="border-b border-[#E6E0D3] p-5">
              <h2 className="text-base font-bold text-[#1A1A1A]">{t("scanResultTitle")}</h2>
            </div>
            <div className="p-5">
              {!scan ? (
                <div className="rounded-2xl border border-dashed border-[#E6E0D3] bg-[#FAF9F5] p-8 text-center text-sm text-[#6B7280]">
                  {t("noScanPerformedYet")}
                </div>
              ) : (
                <div
                  className={`rounded-2xl border p-5 transition-colors ${
                    scan.hasAccess
                      ? scanMode === "in"
                        ? "border-sage-300 bg-sage-50"
                        : "border-gold-300 bg-gold-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border-2 border-white shadow-sm bg-[#E6E0D3]">
                      {scan.photo ? (
                        <img src={scan.photo} alt={scan.residentName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[#8A8474] bg-[#F1EEE5] p-2">
                          <span className="text-[10px] font-bold uppercase text-center leading-tight">{t("noPhotoShort")}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-2">
                        {scan.hasAccess
                          ? (scanMode === "in" ? <CheckCircle className="text-sage-700 shrink-0 mt-0.5 h-5 w-5" /> : <CheckCircle className="text-gold-700 shrink-0 mt-0.5 h-5 w-5" />)
                          : <XCircle className="text-red-600 shrink-0 mt-0.5 h-5 w-5" />
                        }
                        <div className="flex flex-col items-start text-left">
                          <p className={`text-xl font-bold leading-tight ${scan.hasAccess ? scanMode === "in" ? "text-sage-800" : "text-gold-800" : "text-red-600"}`}>
                            {scan.hasAccess ? scan.residentName : t("deniedAttendanceLabel")}
                          </p>
                          {scan.hasAccess && (
                            <>
                              <p className="text-sm font-bold text-[#1A1A1A] mt-1.5 tracking-wide">
                                {scan.userCode.replace("-", " - ")}
                              </p>
                              <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mt-0.5">
                                {scan.role}
                              </p>
                            </>
                          )}
                          <p className="mt-2 text-sm font-medium text-[#1A1A1A]">
                            {scan.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {scan.hasAccess && (
                    <>
                      {windowNotYetOpen ? (
                        <div className="mt-4 p-3 rounded-xl border border-gold-300 bg-gold-50 text-center text-sm font-bold text-gold-800">
                          {scanMode === "in" ? t("signInOpensAtBanner") : t("signOutOpensAtBanner")} {formatEventOptionDateTime(windowNotYetOpen) || windowNotYetOpen}
                        </div>
                      ) : isPastClosingTime() ? (
                        <div className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50 text-center text-sm font-bold text-red-700">
                          {scanMode === "in" ? t("deadlinePassedPrefix") : t("signOutDeadlinePassedPrefix")} ({formatEventOptionDateTime(closingTime) || closingTime}) {scanMode === "in" ? t("signInClosedSuffix") : t("signOutClosedSuffix")}
                        </div>
                      ) : (
                        <button
                          onClick={confirmAttendance}
                          className={`mt-4 w-full py-3 text-sm font-bold text-white rounded-full transition-colors shadow-sm ${
                            scanMode === "in" ? "bg-sage-700 hover:bg-sage-800" : "bg-gold-700 hover:brightness-95"
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

          <div className="rounded-2xl border border-[#E6E0D3] bg-white overflow-hidden">
            <div className="border-b border-[#E6E0D3] bg-white p-5">
              <h2 className="text-base font-bold text-[#1A1A1A]">{t("attendanceRosterTitle")}</h2>
              <p className="mt-0.5 text-sm text-[#6B7280]">{attendance[eventId]?.length ?? 0} {t("recordsForThisEvent")}</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-5">
              {!(attendance[eventId] ?? []).length ? (
                <p className="rounded-2xl border border-dashed border-[#E6E0D3] bg-[#FAF9F5] p-6 text-center text-sm text-[#6B7280]">{t("noAttendeesYet")}</p>
              ) : (
                <div className="space-y-3">
                  {attendance[eventId]!.map((rec, i) => (
                    <div key={rec.residentId} className="p-4 rounded-xl border border-[#E6E0D3] bg-[#FAF9F5] flex items-center justify-between transition-colors">
                      <div>
                        <p className="font-semibold text-[#1A1A1A]">{i + 1}. {rec.residentName}</p>
                        <div className="flex gap-4 mt-1 text-xs text-[#6B7280] font-medium">
                          <span className="flex items-center gap-1 text-sage-700"><LogIn className="h-3.5 w-3.5" /> {rec.timeIn || "—"}</span>
                          <span className="flex items-center gap-1 text-gold-700"><LogOut className="h-3.5 w-3.5" /> {rec.timeOut || "—"}</span>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rec.status === "complete" ? "bg-sage-50 text-sage-800" : "bg-gold-50 text-gold-700"}`}>
                        {rec.status === "complete" ? t("completedLabel") : t("statusIncomplete")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[30px] w-full max-w-[340px] p-6 py-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-200">
            {modalConfig.type === 'success' && <CheckCircle className="text-sage-800 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'error' && <XCircle className="text-red-500 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'info' && <CheckCircle className="text-sage-800 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'timeout-in' && <CheckCircle className="text-gold-700 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'timeout-out' && <CheckCircle className="text-sage-800 mb-4" size={56} strokeWidth={2} />}

            <h3 className={`text-xl font-bold mb-2 ${modalConfig.type === 'error' ? 'text-red-600' : modalConfig.type === 'timeout-in' ? 'text-gold-700' : 'text-sage-800'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[15px] text-[#6B7280] mb-6 px-2">{modalConfig.message}</p>
            <button
              onClick={closeModal}
              className={`text-white px-10 py-2.5 rounded-full font-semibold tracking-wide transition-colors ${
                modalConfig.type === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : modalConfig.type === 'timeout-in'
                  ? 'bg-gold-700 hover:brightness-95'
                  : 'bg-sage-800 hover:bg-sage-900'
              }`}
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}