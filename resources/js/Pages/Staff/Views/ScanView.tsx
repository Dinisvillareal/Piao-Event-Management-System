import React, { useState } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, Clock, UserCheck } from "lucide-react";
import { Scanner } from '@yudiel/react-qr-scanner';
// ✅ Correctly importing all UI components from our new Core file
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Select, SelectItem, Badge } from "../../../Components/UI/Core";

type ScanResult = {
  ok: boolean;
  residentId: string;
  residentName: string;
  hasAccess: boolean;
  reason: string;
  memberships: string[];
};

type AttendanceEntry = {
  residentId: string;
  residentName: string;
  timeIn: string | null;
  timeOut: string | null;
  status: "pending" | "in" | "complete";
};

export default function ScanView({ events, residents, memberships }: any) {
  const [eventId, setEventId] = useState(events[0]?.id || "");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry[]>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [closingTime, setClosingTime] = useState("");
  const [scanMode, setScanMode] = useState<"in" | "out">("in");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", membershipId: "" });

  const ev = events.find((e: any) => e.id === eventId);
  const requiredMs = ev?.membershipId ? memberships.find((m: any) => m.id === ev.membershipId) : null;

  // ✅ Add new event logic
  const handleAddEvent = () => {
    if (!newEvent.title.trim()) return;
    const newId = `event-${Date.now()}`;
    events.push({
      id: newId,
      title: newEvent.title,
      date: "",
      location: "",
      description: "",
      membershipId: newEvent.membershipId || undefined,
      attendees: []
    });
    setEventId(newId);
    setShowAddEvent(false);
    setNewEvent({ title: "", membershipId: "" });
  };

  // ✅ NEW: This acts exactly like a real camera reading the QR JSON
  const handleQRCodeScan = (qrString: string) => {
    try {
      // The QR code contains a JSON string, so we parse it back into an object
      const data = JSON.parse(qrString);

      if (!data.user_id) {
        alert("Invalid QR Code: Missing Database User ID.");
        return;
      }

      let hasAccess = true;
      let reason = "Open event — all residents allowed";

      // If the event requires a specific membership, check if the QR data includes it
      if (requiredMs) {
        hasAccess = data.memberships.includes(requiredMs.name);
        reason = hasAccess ? `Verified: member of ${requiredMs.name}` : `Denied: requires ${requiredMs.name} membership`;
      }

      // Set the scan result using the real data from the QR code
      setScan({
        ok: true,
        residentId: data.user_id, // THIS IS THE REAL DATABASE ID!
        residentName: data.name,
        hasAccess,
        reason,
        memberships: data.memberships || []
      });

    } catch (e) {
      alert("Invalid QR Code format. Could not read data.");
    }
  };

  const isSignOutAllowed = (residentId: string) => {
    const record = attendance[eventId]?.find(e => e.residentId === residentId);
    if (!record || !record.timeIn) return false;
    if (!closingTime) return true;

    const now = new Date();
    const [closeHour, closeMin] = closingTime.split(":").map(Number);
    const closeTimeObj = new Date();
    closeTimeObj.setHours(closeHour, closeMin, 0);

    return now >= closeTimeObj;
  };

  const confirmAttendance = async () => {
    if (!scan?.ok || !scan.hasAccess) return;

    // 1. Determine the correct Laravel endpoint and method
    const endpoint = scanMode === "in" ? "/attendance/time-in" : "/attendance/time-out";
    const method = scanMode === "in" ? "POST" : "PUT";

    try {
      // 2. Grab the CSRF token for Laravel security
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      const decodedToken = token ? decodeURIComponent(token) : '';

      // 3. Send the request to the database
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
          user_id: scan.residentId // This comes from the scanned QR code
        })
      });

      const result = await response.json();

      // 4. Handle Backend Validation Errors (e.g., "Event hasn't started")
      if (!response.ok) {
        alert(result.message || "Failed to record attendance.");
        return;
      }

      // 5. If successful, update the UI table instantly
      setAttendance(prev => {
        const list = prev[eventId] ?? [];
        const existing = list.find(e => e.residentId === scan!.residentId);
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (scanMode === "in") {
          if (existing) return prev;
          return {
            ...prev,
            [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: now, timeOut: null, status: "in" }]
          };
        }

        if (scanMode === "out") {
          return {
            ...prev,
            [eventId]: list.map(e => e.residentId === scan!.residentId ? { ...e, timeOut: now, status: "complete" } : e)
          };
        }

        return prev;
      });

      // Clear the scanner
      setScan(null);
      alert(result.message || "Attendance recorded successfully!");

    } catch (error) {
      console.error("Attendance Error:", error);
      alert("A network error occurred while connecting to the database.");
    }
  };

  const setEventCloseTime = () => {
    if (!closingTime) return;
    alert(`Attendance for this event will close at ${closingTime}`);
  };

  const canAccessSignOut = () => {
    const records = attendance[eventId] ?? [];
    return records.some(r => r.timeIn && !r.timeOut);
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
        <Card className="overflow-hidden border-[#ddd5ca] rounded-[30px] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[#005f63] font-black text-[15px]">Camera Scanner</CardTitle>
                <CardDescription className="text-[#667777] mt-1">One QR per resident — contains all their memberships</CardDescription>
              </div>
              <Button
                onClick={() => setIsCameraOn(!isCameraOn)}
                className={`rounded-full w-10 h-10 p-0 flex items-center justify-center ${isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-[#005f63] hover:bg-[#217676]"}`}
              >
                {isCameraOn ? <CameraOff size={18} /> : <Camera size={18} />}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-5 rounded-b-[30px]">
            {/* REAL CAMERA VIEW */}
            <div className="relative overflow-hidden rounded-[30px] border-2 border-dashed border-[#e2e2dc] bg-black">
              {isCameraOn ? (
                <div className="h-full w-full">
                  <Scanner
                    onScan={(result) => {
                      // When the camera catches a QR code, it triggers our existing function!
                      if (result && result.length > 0) {
                        handleQRCodeScan(result[0].rawValue);
                        // Optional: Automatically turn off the camera after a successful scan
                        setIsCameraOn(false); 
                      }
                    }}
                    onError={(error) => {
                      console.log("Camera error:", error?.message);
                    }}
                    components={{
                      finder: true,      // Shows the scanning square outline
                    }}
                    styles={{
                      container: { width: '100%', height: '100%' },
                      video: { objectFit: 'cover' }
                    }}
                  />
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur z-10">
                    Scanning for QR...
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center aspect-video bg-gradient-to-br from-[#f4f4f0] to-[#ecece8] text-[#888880] h-full w-full">
                  <Camera size={40} className="mb-2 opacity-60" />
                  <p>Camera off — click button to start</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
              <CardTitle className={`font-black transition-colors ${scanMode === "in" ? "text-[#005f63]" : "text-[#005f63]"}`}>Scan Result</CardTitle>
            </CardHeader>
            <CardContent className="rounded-b-[30px]">
              {!scan ? (
                <div className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No scan performed yet.
                </div>
              ) : (
                <div className={`rounded-[30px] border p-4 transition-colors ${scan.hasAccess ? scanMode === "in" ? "border-teal-500/50 bg-teal-50" : "border-orange-500/50 bg-orange-50" : "border-red-500/40 bg-red-50"}`}>
                <div className="flex items-start gap-3">
                    {scan.hasAccess
                    ? (scanMode === "in" ? <CheckCircle className="text-teal-600 shrink-0" size={20} /> : <CheckCircle className="text-orange-600 shrink-0" size={20} />)
                    : <XCircle className="text-red-600 shrink-0" size={20} />
                    }
                    <div>
                    <p className={`text-lg font-bold ${scan.hasAccess ? scanMode === "in" ? "text-teal-800" : "text-orange-800" : "text-red-600"}`}>
                        {scan.hasAccess ? `✓ ${scan.residentName}` : `✗ Denied — ${scan.residentName}`}
                    </p>
                      <p className="mt-1 text-sm text-gray-600">{scan.reason}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Their memberships: {scan.memberships.map(id => memberships.find((m: any) => m.id === id)?.name).join(", ") || "None"}
                      </p>
                    </div>
                  </div>

                  {scan.hasAccess && (
                    <Button onClick={confirmAttendance} disabled={scanMode === "out" && !isSignOutAllowed(scan.residentId)} className={`mt-3 w-full text-white rounded-[80px] transition-colors ${scanMode === "in" ? "bg-[#227a7a] hover:bg-[#439e9e]" : "bg-[#fd9a06] hover:bg-[#ffb444]"} ${scanMode === "out" && !isSignOutAllowed(scan.residentId) ? "opacity-40 cursor-not-allowed" : ""}`}>
                        Confirm {scanMode === "in" ? "Sign In" : "Sign Out"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white sticky top-0 z-10 rounded-t-[30px]">
              <CardTitle className="font-black text-[#005f63]">Attendance · {ev?.title}</CardTitle>
              <CardDescription className="text-[#667777] mt-1">{attendance[eventId]?.length ?? 0} record(s)</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto smooth-scroll rounded-b-[30px]">
              {!(attendance[eventId] ?? []).length ? (
                <p className="rounded-[30px] border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">No attendees added yet.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {attendance[eventId]!.map((rec, i) => (
                    <div key={rec.residentId} className={`p-3 rounded-[30px] border flex items-center justify-between transition-colors ${scanMode === "in" ? "bg-teal-50 border-teal-100" : "bg-orange-50 border-orange-100"}`}>
                      <div>
                        <p className="font-medium text-gray-800">{i + 1}. {rec.residentName}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-600">
                          <span className="flex items-center gap-1"><LogIn size={12} /> {rec.timeIn || "—"}</span>
                          <span className="flex items-center gap-1"><LogOut size={12} /> {rec.timeOut || "—"}</span>
                        </div>
                      </div>
                      <Badge className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.status === "complete" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
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