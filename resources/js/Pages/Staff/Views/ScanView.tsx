import React, { useState, useEffect } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, Clock } from "lucide-react";
import { Scanner } from '@yudiel/react-qr-scanner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Select, SelectItem, Badge } from "../../../Components/UI/Core";

type ScanResult = {
  ok: boolean;
  residentId: string;
  residentName: string;
  hasAccess: boolean;
  reason: string;
  memberships: string[];
  photo: string | null;  // ✅ Restored
  role: string;          // ✅ Restored
  userCode: string;      // ✅ Restored
};

type AttendanceEntry = {
  residentId: string;
  residentName: string;
  timeIn: string | null;
  timeOut: string | null;
  status: "pending" | "in" | "complete";
};

export default function ScanView({ events, residents, memberships }: any) {
  const [eventId, setEventId] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry[]>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [closingTime, setClosingTime] = useState("");
  const [isDeadlineActive, setIsDeadlineActive] = useState(false);
  const [scanMode, setScanMode] = useState<"in" | "out">("in");

  const ev = events?.find((e: any) => String(e.id) === String(eventId));
  
  // ✅ RESTORED: Smart Membership Array Checker
  const requiredMemberships = ev?.membershipIds?.length > 0 
    ? memberships?.filter((m: any) => ev.membershipIds.includes(m.id) || ev.membershipIds.includes(String(m.id))) 
    : [];

  // ==========================================
  // 1. AUTO-SELECT FIRST EVENT ON LOAD
  // ==========================================
  useEffect(() => {
    if (events && events.length > 0 && !eventId) {
      setEventId(String(events[0].id));
    }
  }, [events]);

  // ==========================================
  // 2. PERMANENT MEMORY & ATTENDANCE FETCHING
  // ==========================================
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
            status: record.time_out ? "complete" : "in"
          }));
          setAttendance(prev => ({ ...prev, [eventId]: formattedAttendance }));
        }
      } catch (error) {
        console.error("Failed to fetch attendance:", error);
      }
    };

    fetchEventAttendance();

    // ✅ RESTORED: Load Local Storage Memory
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

  // ✅ RESTORED: Save Local Storage Memory
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


  // ==========================================
  // 3. QR SCANNER & SMART MATCHING LOGIC
  // ==========================================
  useEffect(() => {
    if (!isDeadlineActive || !closingTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentHHMM >= closingTime) {
        setScan(null);              
        setScanMode(prev => prev === "in" ? "out" : "in");         
        setIsDeadlineActive(false); 
        setClosingTime("");         
        setIsCameraOn(false);

        setTimeout(() => {
          alert("The deadline has passed! The scanner has automatically switched modes.");
        }, 100);
      }
    }, 1000); 

    return () => clearInterval(timer);
  }, [isDeadlineActive, closingTime, scanMode]);

  const handleQRCodeScan = (qrString: string) => {
    try {
      const data = JSON.parse(qrString);

      if (!data.user_id) {
        alert("Invalid QR Code: Missing Database User ID.");
        return;
      }

      // ✅ RESTORED: Smart Matcher (Fixes missing photos)
      const matchedResident = residents?.find((r: any) => {
        if (r.id == data.user_id || r.user_id == data.user_id || r.real_id == data.user_id || r.user_code == data.user_id) return true;
        const checkString = r.user_code || r.id || "";
        if (typeof checkString === "string") {
          const stripped = checkString.replace("PR-", "").replace("RES-", "");
          if (parseInt(stripped, 10) == data.user_id) return true;
        }
        return false;
      });

     let hasAccess = true;
      let reason = "Open event — all residents allowed";

      // Grab LIVE memberships from the database instead of the old physical QR code
      let liveMemberships: string[] = data.memberships || [];
      if (matchedResident && matchedResident.memberships) {
        liveMemberships = matchedResident.memberships.map((m: any) => m.name);
      }

      // True Array Validation logic (Now uses live database memberships)
      if (requiredMemberships && requiredMemberships.length > 0) {
        const requiredNames = requiredMemberships.map((m: any) => m.name);
        
        hasAccess = liveMemberships.some((userMem: string) => requiredNames.includes(userMem));
        reason = hasAccess 
          ? `Verified: Eligible member` 
          : `Requires: ${requiredNames.join(" or ")}`;
      }

      setScan({
        ok: true,
        residentId: data.user_id,
        residentName: matchedResident?.first_name ? `${matchedResident.first_name} ${matchedResident.last_name}` : data.name,
        hasAccess,
        reason,
        memberships: liveMemberships,
        photo: matchedResident?.photo || matchedResident?.validation_id_url || null,
        role: matchedResident?.role || "Resident",
        userCode: matchedResident?.user_code || matchedResident?.id || data.user_code || `ID: ${data.user_id}` 
      });

    } catch (e) {
      alert("Invalid QR Code format. Could not read data.");
    }
  };

  const isPastClosingTime = () => {
    if (!isDeadlineActive || !closingTime) return false; 
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentHHMM >= closingTime; 
  };

  // ==========================================
  // 4. SUBMIT TO DATABASE
  // ==========================================
  const confirmAttendance = async () => {
    if (!scan?.ok || !scan.hasAccess) return;

    const endpoint = scanMode === "in" ? "/attendance/time-in" : "/attendance/time-out";
    const method = scanMode === "in" ? "POST" : "PUT";

    try {
      const token = document.cookie.split('; ').find(row => row.startsWith('XSRF-TOKEN='))?.split('=')[1];
      const decodedToken = token ? decodeURIComponent(token) : '';

      const response = await fetch(endpoint, {
        method: method,
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "X-XSRF-TOKEN": decodedToken },
        body: JSON.stringify({ event_id: eventId, user_id: scan.residentId })
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.message || "Failed to record attendance.");
        return;
      }

      const d = new Date();
      const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      
      setAttendance(prev => {
        const list = prev[eventId] ?? [];
        
        if (scanMode === "in") {
          const residentExists = list.some(e => e.residentId == scan!.residentId);
          if (residentExists) {
            // ✅ FIXED: Now correctly updates timeIn instead of timeOut!
            return { ...prev, [eventId]: list.map(e => e.residentId == scan!.residentId ? { ...e, timeIn: now, status: "in" } : e) };
          } else {
            return { ...prev, [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: now, timeOut: null, status: "in" }] };
          }
        } else {
          const residentExists = list.some(e => e.residentId == scan!.residentId);
          if (residentExists) {
            return { ...prev, [eventId]: list.map(e => e.residentId == scan!.residentId ? { ...e, timeOut: now, status: "complete" } : e) };
          } else {
            return { ...prev, [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: null, timeOut: now, status: "complete" }] };
          }
        }
      });

      setScan(null); 
      alert(result.message || "Attendance recorded successfully!");

    } catch (error) {
      console.error("Attendance Error:", error);
      alert("A network error occurred while connecting to the database.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm rounded-[10px]">
        <div>
          <h1 className="text-4xl font-black text-[#005f63]">QR Scanner</h1>
          <p className="text-sm text-[#667777] mt-1">Scan resident QR codes — sign in & sign out.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        
        {/* LEFT COLUMN: SCANNER CONTROLS */}
        <Card className="overflow-hidden border-[#ddd5ca] rounded-[30px] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[#005f63] font-black text-[15px]">Camera Scanner</CardTitle>
                <CardDescription className="text-[#667777] mt-1">One QR per resident</CardDescription>
              </div>
              <Button
                onClick={() => setIsCameraOn(!isCameraOn)}
                disabled={!isDeadlineActive}
                className={`rounded-full w-10 h-10 p-0 flex items-center justify-center transition-all ${
                  !isDeadlineActive 
                    ? "bg-gray-300 cursor-not-allowed opacity-50" 
                    : isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-[#005f63] hover:bg-[#217676]"
                }`}
              >
                {isCameraOn ? <CameraOff size={18} /> : <Camera size={18} />}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-5 rounded-b-[30px]">
            <div className="mb-6 space-y-4 rounded-[20px] bg-gray-50 p-5 border border-gray-100 shadow-inner">
              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">1. Select Event</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  {events?.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)} className="rounded-[12px]">
                      {e.title}
                    </SelectItem>
                  ))}
                </Select>
                {requiredMemberships && requiredMemberships.length > 0 }
              </div>

              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">2. Scan Mode</Label>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setScanMode("in")} 
                    disabled={isDeadlineActive && !isPastClosingTime() && scanMode === "out"}
                    className={`flex-1 rounded-[30px] transition-all ${
                      scanMode === "in" 
                        ? "!bg-[#1f7a7a] !text-white shadow-md hover:!bg-[#145c5c]" 
                        : "!bg-[#f3f4f6] !text-gray-400 hover:!bg-gray-200 border-none shadow-none"
                    } ${isDeadlineActive && scanMode === "out" ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    → Sign In
                  </Button>
                  <Button 
                    onClick={() => setScanMode("out")} 
                    disabled={isDeadlineActive && !isPastClosingTime() && scanMode === "in"}
                    className={`flex-1 rounded-[30px] transition-all ${
                      scanMode === "out" 
                        ? "!bg-orange-500 !text-white shadow-md hover:!bg-orange-600" 
                        : "!bg-[#f3f4f6] !text-gray-400 hover:!bg-gray-200 border-none shadow-none"
                    } ${isDeadlineActive && scanMode === "in" ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    ← Sign Out
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 mt-4">
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">
                  {scanMode === "in" ? "Sign-In Closing Time" : "Sign-Out Closing Time"}
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
                    className="flex-1 rounded-md disabled:bg-gray-100 disabled:text-gray-500" 
                  />
                  {!isDeadlineActive ? (
                    <Button 
                      onClick={() => closingTime ? setIsDeadlineActive(true) : alert("Please select a time first.")} 
                      className="bg-[#005f63] hover:bg-[#217676] text-white px-6 rounded-md shadow-sm"
                    >
                      Set Time
                    </Button>
                  ) : (
                    <Button 
                      disabled={true} 
                      className="bg-gray-100 text-gray-500 border border-gray-200 px-6 rounded-md cursor-not-allowed shadow-inner"
                    >
                      Locked 🔒
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
                      Scanning for QR...
                    </div>
                    <div className="rounded-[15px] bg-black/50 px-4 py-2 text-xs text-center text-gray-200 backdrop-blur">
                      <span className="font-bold text-white">Blurry?</span> Move the phone closer to the QR, then slowly pull back to force autofocus.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full w-full absolute inset-0 bg-gray-100 text-gray-400">
                  <Camera size={40} className="mb-2 opacity-60" />
                  <p className="text-sm">Camera off — click button to start</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: RESULTS & ATTENDANCE */}
        <div className="space-y-4">
          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
              <CardTitle className="font-black text-[#005f63]">Scan Result</CardTitle>
            </CardHeader>
            <CardContent className="rounded-b-[30px] p-5">
              {!scan ? (
                <div className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No scan performed yet.
                </div>
              ) : (
                <div className={`rounded-[30px] border p-5 transition-colors ${scan.hasAccess ? scanMode === "in" ? "border-blue-500/50 bg-blue-50" : "border-orange-500/50 bg-orange-50" : "border-red-500/40 bg-red-50"}`}>
                  
                 {/* Centered ID Photo & Text Layout */}
                  <div className="flex items-start gap-4">
                    
                    {/* 1. Photo on the Left */}
                    <div className="w-[85px] h-[85px] shrink-0 rounded-[18px] overflow-hidden border-[3px] border-white shadow-sm bg-gray-200">
                      {scan.photo ? (
                        <img src={scan.photo} alt={scan.residentName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100 p-2">
                          <span className="text-[10px] font-bold uppercase text-center leading-tight">No<br/>Photo</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Text Block on the Right */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-2">
                        
                        {/* Icon */}
                        {scan.hasAccess
                          ? (scanMode === "in" ? <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={20} /> : <CheckCircle className="text-orange-600 shrink-0 mt-0.5" size={20} />)
                          : <XCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                        }
                        
                        {/* Stacked Text Container (Forces everything to align left) */}
                        <div className="flex flex-col items-start text-left">
                          
                          <p className={`text-xl font-black leading-none ${scan.hasAccess ? scanMode === "in" ? "text-blue-800" : "text-orange-800" : "text-red-600"}`}>
                            {scan.hasAccess ? scan.residentName : `Denied Attendance`}
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
                          
                          {/* Event Description (Padding removed so it aligns flush left!) */}
                          <p className="mt-2 text-sm font-medium text-gray-800">
                            {scan.reason}
                          </p>
                          
                      
                        </div>
                        
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons & Warnings */}
                  {scan.hasAccess && (
                  <>
                      {scanMode === "in" && !isDeadlineActive ? (
                        <div className="mt-4 p-3 bg-orange-100 border border-orange-300 text-orange-800 rounded-[15px] text-center font-bold text-sm shadow-sm">
                          🔒 Please set a Closing Time to unlock Sign Ins.
                        </div>
                      ) : isPastClosingTime() && scanMode === "in" ? (
                        <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-[15px] text-center font-bold text-sm shadow-sm">
                          ⚠️ Deadline Passed ({closingTime}) — Sign In is Closed
                        </div>
                      ) : (
                      <Button 
                        onClick={confirmAttendance} 
                        className={`mt-4 w-full py-6 text-md font-bold text-white rounded-[80px] transition-all shadow-md hover:-translate-y-1 ${scanMode === "in" ? "bg-blue-600 hover:bg-blue-700" : "bg-orange-500 hover:bg-orange-600"}`}
                      >
                        Confirm {scanMode === "in" ? "Sign In" : "Sign Out"}
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
              <CardTitle className="font-black text-[#005f63]">Attendance Roster</CardTitle>
              <CardDescription className="text-[#667777] mt-1">{attendance[eventId]?.length ?? 0} record(s) for this event</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto smooth-scroll rounded-b-[30px] p-5">
              {!(attendance[eventId] ?? []).length ? (
                <p className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No attendees yet.</p>
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
                      <Badge className={`rounded-full px-3 py-1 text-xs font-black tracking-wider ${rec.status === "complete" ? "bg-teal-300 text-teal-700" : "bg-yellow-400 text-yellow-900 shadow-sm"}`}>
                        {rec.status === "complete" ? "Completed" : "Signed In"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}