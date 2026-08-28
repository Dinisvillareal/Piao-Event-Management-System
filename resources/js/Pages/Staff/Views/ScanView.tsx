import React, { useState, useEffect } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, IdCard, ScanLine } from "lucide-react";
import { Scanner } from '@yudiel/react-qr-scanner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Select, SelectItem, Badge } from "../../../Components/UI/Core";
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

  useEffect(() => {
    if (events && events.length > 0 && !eventId) {
      setEventId(String(events[0].id));
    }
  }, [events]);

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

    const savedData = localStorage.getItem(`qr_deadline_${eventId}`);
    if (savedData) {
      const { time, isActive } = JSON.parse(savedData);
      setClosingTime(time);
      setIsDeadlineActive(isActive);
    } else {
      setClosingTime("");
      setIsDeadlineActive(false);
    }

    const savedMode = localStorage.getItem(`qr_mode_${eventId}`);
    if (savedMode === "in" || savedMode === "out") setScanMode(savedMode);
    else setScanMode("in");

  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    if (isDeadlineActive && closingTime) {
      localStorage.setItem(`qr_deadline_${eventId}`, JSON.stringify({ time: closingTime, isActive: true }));
    } else {
      localStorage.removeItem(`qr_deadline_${eventId}`);
    }
  }, [isDeadlineActive, closingTime, eventId]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(`qr_mode_${eventId}`, scanMode);
  }, [scanMode, eventId]);

  useEffect(() => {
    if (!isDeadlineActive || !closingTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentHHMM >= closingTime) {
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
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentHHMM >= closingTime;
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
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm rounded-[10px]">
        <div>
          <h1 className="text-4xl font-black text-[#005f63]">{t("scan")}</h1>
          <p className="text-sm text-[#667777] mt-1">{t("scanSubtitle")}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card className="overflow-hidden border-[#ddd5ca] rounded-[30px] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[#005f63] font-black text-[15px]">
                  {checkInMethod === "camera" ? t("cameraScannerLabel") : t("manualPhysicalIdLookupLabel")}
                </CardTitle>
                <CardDescription className="text-[#667777] mt-1">
                  {checkInMethod === "camera" ? t("oneQrPerResident") : t("typeResidentIdOrName")}
                </CardDescription>
              </div>
              {checkInMethod === "camera" && (
                <Button
                  onClick={() => setIsCameraOn(!isCameraOn)}
                  disabled={!isDeadlineActive}
                  className={`rounded-full w-10 h-10 p-0 flex items-center justify-center transition-all ${
                    !isDeadlineActive ? "bg-gray-300 cursor-not-allowed opacity-50" :
                    isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-[#005f63] hover:bg-[#217676]"
                  }`}
                >
                  {isCameraOn ? <CameraOff size={18} /> : <Camera size={18} />}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-5 rounded-b-[30px]">
            <div className="mb-6 space-y-4 rounded-[20px] bg-gray-50 p-5 border border-gray-100 shadow-inner">
              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">{t("selectEventStep1")}</Label>
                <Select
                  value={eventId}
                  onValueChange={setEventId}
                  disabled={isDeadlineActive}
                  className={`!rounded-[20px] [&_button]:!rounded-[20px] [&_button]:!text-sm [&_div]:!rounded-[20px] !overflow-hidden ${isDeadlineActive ? '!bg-gray-100 !text-gray-500 !cursor-not-allowed !pointer-events-none' : ''}`}
                  style={{
                    borderRadius: '20px !important',
                    WebkitBorderRadius: '20px !important',
                    MozBorderRadius: '20px !important',
                    pointerEvents: isDeadlineActive ? 'none !important' : 'auto !important'
                  }}
                >
                  {events?.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)} className="rounded-[12px] !text-sm">
                      {e.title}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-2 block">{t("checkinMethodStep2")}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => { setCheckInMethod("camera"); setManualQuery(""); }}
                    className={`flex-1 !rounded-[20px] transition-colors flex items-center justify-center gap-1.5 ${
                      checkInMethod === "camera" ? "!bg-[#005f63] !text-white shadow-md" : "!bg-[#f3f4f6] !text-gray-500"
                    }`}
                  >
                    <ScanLine size={16} /> {t("cameraScanLabel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { setCheckInMethod("manual"); setIsCameraOn(false); }}
                    className={`flex-1 !rounded-[20px] transition-colors flex items-center justify-center gap-1.5 ${
                      checkInMethod === "manual" ? "!bg-[#005f63] !text-white shadow-md" : "!bg-[#f3f4f6] !text-gray-500"
                    }`}
                  >
                    <IdCard size={16} /> {t("manualPhysicalIdLabel")}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">{t("adviserTwoInOneNote")}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-2 block">{t("scanModeStep3")}</Label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setScanMode("in")}
                    disabled={scanMode === "out"}
                    className={`flex-1 !rounded-[20px] transition-colors ${
                      scanMode === "in"
                        ? "!bg-[#4b9fa1] !text-white shadow-md hover:!bg-[#367c7c]"
                        : "!bg-[#f3f4f6] !text-gray-400 border-none shadow-none opacity-50 cursor-not-allowed"
                    }`}
                    style={{ borderRadius: '20px !important' }}
                  >
                    → {t("signInWord")}
                  </Button>
                  <Button
                    onClick={() => setScanMode("out")}
                    disabled={scanMode === "in"}
                    className={`flex-1 !rounded-[20px] transition-colors ${
                      scanMode === "out"
                        ? "!bg-orange-500 !text-white shadow-md hover:!bg-orange-600"
                        : "!bg-[#f3f4f6] !text-gray-400 border-none shadow-none opacity-50 cursor-not-allowed"
                    }`}
                    style={{ borderRadius: '20px !important' }}
                  >
                    ← {t("signOutWord")}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 mt-4">
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">
                  {scanMode === "in" ? t("signInClosingTimeLabel") : t("signOutClosingTimeLabel")}
                </Label>
                <div className="flex gap-3 items-center">
                  <Input
                    type="time"
                    value={closingTime}
                    onChange={(e: any) => {
                      setClosingTime(e.target.value);
                      setIsDeadlineActive(false);
                    }}
                    disabled={isDeadlineActive}
                    className="flex-1 !rounded-[20px] disabled:!bg-gray-100 disabled:!text-gray-500"
                    style={{ borderRadius: '20px !important' }}
                  />
                  {!isDeadlineActive ? (
                    <Button
                      onClick={() => closingTime ? setIsDeadlineActive(true) : showModal('error', t("timeRequiredTitle"), t("pleaseSelectTimeFirst"))}
                      className="bg-[#dac935] hover:bg-[#bdba2a] text-white px-6 !rounded-[20px] shadow-sm"
                      style={{ borderRadius: '20px !important' }}
                    >
                      {t("setTimeButton")}
                    </Button>
                  ) : (
                    <Button
                      disabled={true}
                      className="bg-gray-100 text-gray-500 border border-gray-200 px-6 !rounded-[20px] cursor-not-allowed shadow-inner"
                      style={{ borderRadius: '20px !important' }}
                    >
                      {t("lockedButtonLabel")} 🔒
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {checkInMethod === "camera" ? (
              <div className="relative overflow-hidden rounded-[30px] border-2 border-dashed border-gray-300 bg-black min-h-[400px]">
                {isCameraOn ? (
                  <div className="h-full w-full absolute inset-0">
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
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center w-[90%] max-w-[300px] z-10">
                      <div className="rounded-full bg-black/70 px-5 py-2 text-sm font-bold text-white backdrop-blur shadow-lg animate-pulse mb-2">
                        {t("scanningForQr")}
                      </div>
                      <div className="rounded-[15px] bg-black/50 px-4 py-2 text-xs text-center text-gray-200 backdrop-blur">
                        <span className="font-bold text-white">{t("blurryLabel")}</span> {t("movePhoneCloserNote")}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full w-full absolute inset-0 bg-gray-100 text-gray-400">
                    <Camera size={40} className="mb-2 opacity-60" />
                    <p className="text-sm">{t("cameraOffClickToStart")}</p>
                  </div>
                )}
              </div>
            ) : (
              // Adviser recommendation: "2 in 1 — Text/physical QR ID" manual lookup
              <div className="relative rounded-[30px] border-2 border-dashed border-gray-200 bg-gray-50 min-h-[400px] p-6">
                <div className="flex items-center gap-2 text-[#005f63] font-bold mb-3">
                  <IdCard size={20} /> {t("manualPhysicalIdCheckin")}
                </div>
                <Input
                  autoFocus
                  value={manualQuery}
                  onChange={(e: any) => setManualQuery(e.target.value)}
                  placeholder={t("typeResidentIdPlaceholder")}
                  className="!rounded-[20px] bg-white"
                />
                <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto">
                  {manualQuery.trim() && manualResults.length === 0 && (
                    <p className="text-sm text-gray-400 italic text-center py-6">{t("noMatchingResidentFound")}</p>
                  )}
                  {manualResults.map((r: any) => (
                    <button
                      key={r.id ?? r.user_id ?? r.real_id}
                      onClick={() => handleManualSelect(r)}
                      className="w-full flex items-center justify-between rounded-2xl bg-white border border-gray-200 px-4 py-3 text-left hover:border-[#005f63]/40 hover:shadow-sm transition"
                    >
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-500">{r.user_code}</p>
                      </div>
                      <span className="text-xs font-bold text-[#005f63]">{t("selectArrowLabel")} →</span>
                    </button>
                  ))}
                  {!manualQuery.trim() && (
                    <p className="text-sm text-gray-400 italic text-center py-10">{t("startTypingToFindResident")}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
              <CardTitle className="font-black text-[#005f63]">{t("scanResultTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="rounded-b-[30px] p-5">
              {!scan ? (
                <div className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  {t("noScanPerformedYet")}
                </div>
              ) : (
                <div className={`rounded-[30px] border p-5 transition-colors ${scan.hasAccess ? scanMode === "in" ? "border-teal-500/50 bg-teal-50" : "border-orange-500/50 bg-orange-50" : "border-red-500/40 bg-red-50"}`}>
                  <div className="flex items-start gap-4">
                    <div className="w-[85px] h-[85px] shrink-0 rounded-[18px] overflow-hidden border-[3px] border-white shadow-sm bg-gray-200">
                      {scan.photo ? (
                        <img src={scan.photo} alt={scan.residentName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100 p-2">
                          <span className="text-[10px] font-bold uppercase text-center leading-tight">{t("noPhotoShort")}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-2">
                        {scan.hasAccess
                          ? (scanMode === "in" ? <CheckCircle className="text-teal-600 shrink-0 mt-0.5" size={20} /> : <CheckCircle className="text-orange-600 shrink-0 mt-0.5" size={20} />)
                          : <XCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                        }
                        <div className="flex flex-col items-start text-left">
                          <p className={`text-xl font-black leading-none ${scan.hasAccess ? scanMode === "in" ? "text-teal-800" : "text-orange-800" : "text-red-600"}`}>
                            {scan.hasAccess ? scan.residentName : t("deniedAttendanceLabel")}
                          </p>
                          {scan.hasAccess && (
                            <>
                              <p className="text-sm font-bold text-gray-700 mt-1.5 tracking-wide">
                                {scan.userCode.replace("-", " - ")}
                              </p>
                              <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mt-0.5">
                                {scan.role}
                              </p>
                            </>
                          )}
                          <p className="mt-2 text-sm font-medium text-gray-800">
                            {scan.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {scan.hasAccess && (
                    <>
                      {scanMode === "in" && !isDeadlineActive ? (
                        <div className="mt-4 p-3 bg-orange-100 border border-orange-300 text-orange-800 rounded-[20px] text-center font-bold text-sm shadow-sm">
                          🔒 {t("lockedSetClosingTimeNote")}
                        </div>
                      ) : isPastClosingTime() && scanMode === "in" ? (
                        <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-[20px] text-center font-bold text-sm shadow-sm">
                          ⚠️ {t("deadlinePassedPrefix")} ({closingTime}) {t("signInClosedSuffix")}
                        </div>
                      ) : (
                        <Button
                          onClick={confirmAttendance}
                          className={`mt-4 w-full py-3 text-md font-bold text-white !rounded-[25px] transition-colors shadow-md ${scanMode === "in" ? "bg-[#4b9fa1] hover:bg-[#367c7c]" : "bg-orange-500 hover:bg-[#ff954e]"}`}
                          style={{ borderRadius: '25px !important' }}
                        >
                          {t("confirmButtonPrefix")} {scanMode === "in" ? t("signInWord") : t("signOutWord")}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white sticky top-0 z-10 rounded-t-[30px]">
              <CardTitle className="font-black text-[#005f63]">{t("attendanceRosterTitle")}</CardTitle>
              <CardDescription className="text-[#667777] mt-1">{attendance[eventId]?.length ?? 0} {t("recordsForThisEvent")}</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto smooth-scroll rounded-b-[30px] p-5">
              {!(attendance[eventId] ?? []).length ? (
                <p className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">{t("noAttendeesYet")}</p>
              ) : (
                <div className="space-y-3">
                  {attendance[eventId]!.map((rec, i) => (
                    <div key={rec.residentId} className={`p-4 rounded-[20px] border flex items-center justify-between transition-colors ${rec.status === "complete" ? "bg-gray-30 border-gray-300" : "bg-gray-50 border-gray-200"}`}>
                      <div>
                        <p className="font-semibold text-[#085053]">{i + 1}. {rec.residentName}</p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-600 font-medium">
                          <span className="flex items-center gap-1 text-teal-700"><LogIn size={14} /> {rec.timeIn || "—"}</span>
                          <span className="flex items-center gap-1 text-orange-700"><LogOut size={14} /> {rec.timeOut || "—"}</span>
                        </div>
                      </div>
                      <Badge className={`rounded-full px-3 py-1 text-xs font-black tracking-wider ${rec.status === "complete" ? "bg-teal-300 text-teal-700" : "bg-yellow-100 text-yellow-900 shadow-sm"}`}>
                        {rec.status === "complete" ? t("completedLabel") : t("statusIncomplete")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white rounded-[24px] w-full max-w-[340px] p-6 py-8 flex flex-col items-center text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            {modalConfig.type === 'success' && <CheckCircle className="text-[#005f63] mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'error' && <XCircle className="text-red-500 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'info' && <CheckCircle className="text-[#005f63] mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'timeout-in' && <CheckCircle className="text-orange-500 mb-4" size={56} strokeWidth={2} />}
            {modalConfig.type === 'timeout-out' && <CheckCircle className="text-[#005f63] mb-4" size={56} strokeWidth={2} />}

            <h3 className={`text-xl font-bold mb-2 ${modalConfig.type === 'error' ? 'text-red-600' : modalConfig.type === 'timeout-in' ? 'text-orange-600' : 'text-[#005f63]'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-sm text-gray-600 mb-6 px-2">{modalConfig.message}</p>
            <button
              onClick={closeModal}
              className={`text-white px-10 py-2.5 rounded-full font-bold tracking-wide transition-colors ${modalConfig.type === 'timeout-in' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#005f63] hover:bg-[#004a4d]'}`}
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}