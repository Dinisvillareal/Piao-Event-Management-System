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
  photo: string | null; 
  role: string; 
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

  const ev = events?.find((e: any) => e.id === eventId);
  const requiredMs = ev?.membershipId ? memberships?.find((m: any) => m.id === ev.membershipId) : null;

  // ==========================================
  // 1. AUTO-SELECT FIRST EVENT ON LOAD
  // ==========================================
  useEffect(() => {
    if (events && events.length > 0 && !eventId) {
      setEventId(events[0].id);
    }
  }, [events]);

  // ==========================================
  // 2. PERMANENT MEMORY: FETCH ATTENDANCE ON EVENT CHANGE
  // ==========================================
  useEffect(() => {
    if (!eventId) return;

    const fetchEventAttendance = async () => {
      try {
        const response = await fetch(`/events/${eventId}/attendances`, {
          headers: {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Map backend data to our frontend state format
          // Adjust 'record.user.first_name' based on your exact backend JSON response
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
  }, [eventId]); // Re-run this anytime the selected event changes!


// ==========================================
  // 3. PERSIST DEADLINE IN BROWSER MEMORY
  // ==========================================
  
  // Load the saved deadline when returning to the page or changing events
  useEffect(() => {
    if (!eventId) return;

    const savedData = localStorage.getItem(`qr_deadline_${eventId}`);
    if (savedData) {
      const { time, isActive } = JSON.parse(savedData);
      setClosingTime(time);
      setIsDeadlineActive(isActive);
    } else {
      // Reset the inputs if the newly selected event doesn't have a saved deadline
      setClosingTime("");
      setIsDeadlineActive(false);
    }
  }, [eventId]);

  //Automatically save to memory whenever the time is locked or cleared
  useEffect(() => {
    if (!eventId) return;

    if (isDeadlineActive && closingTime) {
      localStorage.setItem(`qr_deadline_${eventId}`, JSON.stringify({ 
        time: closingTime, 
        isActive: true 
      }));
    } else {
      localStorage.removeItem(`qr_deadline_${eventId}`);
    }
  }, [isDeadlineActive, closingTime, eventId]);

  // ==========================================
  // 4. PERSIST SCAN MODE IN BROWSER MEMORY
  // ==========================================
  
  //  Load the saved mode when returning to the page or changing events
  useEffect(() => {
    if (!eventId) return;
    
    const savedMode = localStorage.getItem(`qr_mode_${eventId}`);
    if (savedMode === "in" || savedMode === "out") {
      setScanMode(savedMode);
    } else {
      setScanMode("in"); // Default fallback if they haven't picked one yet
    }
  }, [eventId]);

  // Save the mode whenever the user clicks the buttons or the system auto-flips
  useEffect(() => {
    if (!eventId) return;
    
    localStorage.setItem(`qr_mode_${eventId}`, scanMode);
  }, [scanMode, eventId]);



  // ==========================================
  // 5. QR SCANNER LOGIC
  // ==========================================

  useEffect(() => {
    // Don't run the timer if the scanner isn't locked in
    if (!isDeadlineActive || !closingTime) return;

    const timer = setInterval(() => {
      // 1. Get the REAL computer time right now in HH:MM (24-hour format)
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // 2. Compare it directly to the time you put in the input box
      if (currentHHMM >= closingTime) {
        
        // TIME IS UP! Execute the automatic shift change:
        setScan(null);              // Clear the screen
        setScanMode("out");         // Flip to Sign Out mode
        setIsDeadlineActive(false); // Unlock the system
        setClosingTime("");         // Clear the time input

        // Add a tiny microsecond delay so the screen visually flips BEFORE the alert pops up
        setTimeout(() => {
          alert("The deadline has passed!");
        }, 100);
      }
    }, 1000); // Checks the clock every 1 second

    return () => clearInterval(timer);
  }, [isDeadlineActive, closingTime, scanMode]);

  const handleQRCodeScan = (qrString: string) => {
    try {
      const data = JSON.parse(qrString);

      if (!data.user_id) {
        alert("Invalid QR Code: Missing Database User ID.");
        return;
      }

      // ✅ Match the scanned ID to the residents list to pull their profile data
      console.log("QR Data:", data);
      console.log("Residents:", residents);
      console.log(
  residents.map((r: any) => ({
    id: r.id,
    name: r.name
  }))
);
      const matchedResident = residents?.find((r: any) => {
        if (r.id == data.user_id || r.user_id == data.user_id || r.real_id == data.user_id || r.user_code == data.user_id) {
          return true;
        }

        // 2. If the database uses 'PR-0011' format, convert it to '11' for a perfect match
       const checkString = r.user_code || r.id || "";
        if (typeof checkString === "string") {
          // Removes "PR-" or "RES-" and turns "0011" or "011" into the number 11
          const stripped = checkString.replace("PR-", "").replace("RES-", "");
          const extractedNumber = parseInt(stripped, 10);
          if (extractedNumber == data.user_id) return true;
        }

        return false;
      });

      // 🔍 Advanced Debugger (Leave this in just in case!)
      console.log("QR User ID:", data.user_id, "| Matched:", matchedResident);
      if (!matchedResident && residents && residents.length > 0) {
         console.log("Failed to match. Here is what the data structure looks like:", residents[0]);
      }

      let hasAccess = true;
      let reason = "Open event — all residents allowed";

      if (requiredMs) {
        hasAccess = data.memberships.includes(requiredMs.name);
        reason = hasAccess ? `Verified: member of ${requiredMs.name}` : `Denied: requires ${requiredMs.name} membership`;
      }

      setScan({
        ok: true,
        residentId: data.user_id,
        residentName: data.name,
        hasAccess,
        reason,
        memberships: data.memberships || [],
        // ✅ Add the newly fetched photo and role to the state
        photo: matchedResident?.photo || matchedResident?.validation_id_url || null,
        role: matchedResident?.role || "Resident"
      });

    } catch (e) {
      alert("Invalid QR Code format. Could not read data.");
    }
  };


  // ==========================================
  // 6. ATTENDANCE DEADLINE & VALIDATION LOGIC
  // ==========================================
  
 const isPastClosingTime = () => {
    if (!isDeadlineActive || !closingTime) return false; 
    
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    return currentHHMM >= closingTime; 
  };

 
  // ==========================================
  // 7. SUBMIT TO DATABASE
  // ==========================================
  const confirmAttendance = async () => {
    if (!scan?.ok || !scan.hasAccess) return;

    const endpoint = scanMode === "in" ? "/attendance/time-in" : "/attendance/time-out";
    const method = scanMode === "in" ? "POST" : "PUT";

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      const decodedToken = token ? decodeURIComponent(token) : '';

      const response = await fetch(endpoint, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-XSRF-TOKEN": decodedToken
        },
        body: JSON.stringify({
          event_id: eventId,
          user_id: scan.residentId 
        })
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.message || "Failed to record attendance.");
        return;
      }

      // Update the UI instantly for a snappy user experience
     const d = new Date();
     const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
     setAttendance(prev => {
        const list = prev[eventId] ?? [];
        const residentExists = list.some(e => e.residentId == scan!.residentId);
        
        if (scanMode === "in") {
          // ==============================
          // SIGN IN LOGIC
          // ==============================
          if (residentExists) {
            // They exist! Update their existing row with the sign-IN time
            return {
              ...prev,
              [eventId]: list.map(e => e.residentId == scan!.residentId ? { ...e, timeIn: now, status: "in" } : e)
            };
          } else {
            // Append a brand new row for sign-IN
            return {
              ...prev,
              [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: now, timeOut: null, status: "in" }]
            };
          }
        } else {
          // ==============================
          // SIGN OUT LOGIC
          // ==============================
          if (residentExists) {
            // They exist! Update their existing row with the sign-OUT time
            return {
              ...prev,
              [eventId]: list.map(e => e.residentId == scan!.residentId ? { ...e, timeOut: now, status: "complete" } : e)
            };
          } else {
            // They skipped sign-in! Create a brand new row with a blank timeIn and a filled timeOut
            return {
              ...prev,
              [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: null, timeOut: now, status: "complete" }]
            };
          }
        }
      });

      setScan(null); // Clear the scanner for the next person
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
            
            {/* Control Panel */}
            <div className="mb-6 space-y-4 rounded-[20px] bg-gray-50 p-5 border border-gray-100 shadow-inner">
              <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">1. Select Event</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  {events?.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title}
                    </SelectItem>
                  ))}
                </Select>
                {requiredMs && (
                  <Badge className="mt-2 bg-yellow-100 text-yellow-800">
                    Eligibility: {requiredMs.name} only
                  </Badge>
                )}
              </div>

          <div>
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">2. Scan Mode</Label>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setScanMode("in")} 
                    disabled={isDeadlineActive && !isPastClosingTime()}
                    className={`flex-1 rounded-[30px] transition-all ${
                      scanMode === "in" 
                        ? "!bg-[#1f7a7a] !text-white shadow-md hover:!bg-[#145c5c]" 
                        : "!bg-[#f3f4f6] !text-gray-400 hover:!bg-gray-200 border-none shadow-none"
                    } ${isDeadlineActive && !isPastClosingTime() ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    → Sign In
                  </Button>
                  <Button 
                    onClick={() => setScanMode("out")} 
                    disabled={isDeadlineActive && !isPastClosingTime()}
                    className={`flex-1 rounded-[30px] transition-all ${
                      scanMode === "out" 
                        ? "!bg-orange-500 !text-white shadow-md hover:!bg-orange-600" 
                        : "!bg-[#f3f4f6] !text-gray-400 hover:!bg-gray-200 border-none shadow-none"
                    } ${isDeadlineActive && !isPastClosingTime() ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    ← Sign Out
                  </Button>
                </div>
              </div>

             {/* Attendance Closing Time */}
              <div className="pt-2 border-t border-gray-200 mt-4">
                <Label className="text-sm font-medium text-[#005f63] font-bold mb-1 block">
                  Attendance Closing Time
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

            {/* Camera View - Restored to a taller size! */}
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
                    constraints={{
                      facingMode: "environment",
                      advanced: [
                        // Tells supported browsers to keep actively adjusting focus
                        { focusMode: "continuous" } as any 
                      ]
                    }}
                    sound={false}
                    components={{ finder: true }}
                    styles={{ 
                      container: { width: '100%', height: '100%' }, 
                      video: { objectFit: 'cover' } 
                    }}
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
                  <div className="flex items-start gap-4">
                    {/* ✅ New ID Photo Box */}
                    <div className="w-[85px] h-[85px] shrink-0 rounded-[18px] overflow-hidden border-[3px] border-white shadow-sm bg-gray-200">
                      {scan.photo ? (
                        <img src={scan.photo} alt={scan.residentName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100 p-2">
                          <span className="text-[10px] font-bold uppercase text-center leading-tight">No<br/>Photo</span>
                        </div>
                      )}
                    </div>

                    {/* ✅ Upgraded Info Section */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-2">
                        {scan.hasAccess
                          ? (scanMode === "in" ? <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={20} /> : <CheckCircle className="text-orange-600 shrink-0 mt-0.5" size={20} />)
                          : <XCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                        }
                        <div>
                          <p className={`text-xl font-bold leading-none ${scan.hasAccess ? scanMode === "in" ? "text-blue-800" : "text-orange-800" : "text-red-600"}`}>
                            {scan.hasAccess ? scan.residentName : `✗ Denied`}
                          </p>
                          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mt-1.5">{scan.role}</p>
                          <p className="mt-1 text-sm font-medium text-gray-700">{scan.reason}</p>
                          <p className="mt-1 text-xs text-gray-500 italic">
                            Memberships: {scan.memberships.join(", ") || "None"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
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
                    <div key={rec.residentId} className={`p-4 rounded-[20px] border flex items-center justify-between transition-colors ${rec.status === "complete" ? "bg-gray-50 border-gray-200" : "bg-gray-50 border-gray-200"}`}>
                      <div>
                        <p className="font-bold text-gray-800">{i + 1}. {rec.residentName}</p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-600 font-medium">
                          <span className="flex items-center gap-1 text-blue-700"><LogIn size={14} /> {rec.timeIn || "—"}</span>
                          <span className="flex items-center gap-1 text-orange-700"><LogOut size={14} /> {rec.timeOut || "—"}</span>
                        </div>
                      </div>
                      <Badge className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${rec.status === "complete" ? "bg-gray-200 text-gray-600" : "bg-yellow-400 text-yellow-900 shadow-sm"}`}>
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