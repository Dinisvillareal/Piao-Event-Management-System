import React, { useState } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, Clock, UserCheck } from "lucide-react";
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

  // ✅ Scan logic — check membership access
  const simulateScan = (residentId: string) => {
    const r = residents.find((x: any) => x.id === residentId)!;
    const residentMemberships = memberships.filter((m: any) => m.memberIds.includes(residentId)).map((m: any) => m.id);

    let hasAccess = true;
    let reason = "Open event — all residents allowed";

    if (requiredMs) {
      hasAccess = residentMemberships.includes(requiredMs.id);
      reason = hasAccess ? `Verified: member of ${requiredMs.name}` : `Denied: requires ${requiredMs.name} membership`;
    }

    setScan({
      ok: true,
      residentId: r.id,
      residentName: r.name,
      hasAccess,
      reason,
      memberships: residentMemberships
    });
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

  const confirmAttendance = () => {
    if (!scan?.ok || !scan.hasAccess) return;

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
        if (!existing || !existing.timeIn) {
          alert("You must Sign In first before Sign Out.");
          return prev;
        }
        if (!isSignOutAllowed(scan.residentId)) {
          alert(`Sign Out is only available after ${closingTime || "set closing time"}.`);
          return prev;
        }
        return {
          ...prev,
          [eventId]: list.map(e => e.residentId === scan!.residentId ? { ...e, timeOut: now, status: "complete" } : e)
        };
      }

      return prev;
    });

    setScan(null);
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
            <div className="relative aspect-video overflow-hidden rounded-[30px] border-2 border-dashed border-[#e2e2dc] bg-gradient-to-br from-[#f4f4f0] to-[#ecece8]">
                {isCameraOn ? (
                    <>
                    <div className="absolute inset-6 rounded-[30px] border-2 border-yellow-400/80" />
                    <div className="absolute inset-x-6 top-1/2 h-0.5 animate-pulse bg-[#d0d0cb] shadow-[0_0_18px_rgba(208,208,203,0.5)]" />
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
                        Scanning...
                    </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#888880] rounded-[30px]">
                    <Camera size={40} className="mb-2 opacity-60" />
                    <p>Camera off — click button to start</p>
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <Button
                    onClick={() => setScanMode("in")}
                    className={`flex-1 rounded-[80px] py-3 font-medium transition-all duration-150 !border-0 !outline-none !ring-0
                    ${scanMode === "in"
                        ? "!bg-[#217676] !text-white hover:!bg-[#46a7a7] active:!bg-[#1a6060]"
                        : "!bg-gray-100 !text-gray-600 hover:!bg-[#e0f2f2] hover:!text-[#217676] active:!bg-[#cceae]"
                    }`}
                >
                    <LogIn size={16} className="mr-2" /> Sign In
                </Button>

                <Button
                    onClick={() => setScanMode("out")}
                    disabled={!canAccessSignOut()}
                    className={`flex-1 rounded-[80px] py-3 font-medium transition-all duration-150 !border-0 !outline-none !ring-0
                    ${scanMode === "out"
                        ? "!bg-[#ff9a04] !text-white hover:!bg-[#ffbc57] active:!bg-[#cc7a00]"
                        : "!bg-gray-100 !text-gray-600 hover:!bg-[#fff3e0] hover:!text-[#ff9a04] active:!bg-[#ffe0b2]"
                    } ${!canAccessSignOut() ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                    <LogOut size={16} className="mr-2" /> Sign Out
                </Button>
            </div>

            <div>
            <Label className="text-[15px] tracking-wider text-gray-500 font-semibold">Select Event</Label>
            <Select
              value={eventId}
              onValueChange={(val: string) => {
                  if (val === "add-new") setShowAddEvent(true);
                  else setEventId(val);
              }}
              className={`mt-1.5 border-[#ddd5ca] rounded-[80px] text-[14px] [&_[data-selected]]:text-[#005f63] [&>span]:data-[state=closed]:text-[#005f63] transition-colors ${scanMode === "in" ? "text-[#005f63]" : "text-[#b86a00]"}`}
            >
                {events.map((e: any) => (
                <SelectItem
                    key={e.id}
                    value={e.id}
                    className={`text-[14px] ${e.title.includes("Open Event") ? "text-[#005f63]" : "text-gray-700"} ${scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"} data-[selected]:text-[#005f63]`}
                >
                    {e.title} {e.membershipId ? `· ${memberships.find((m:any) => m.id === e.membershipId)?.name}` : "· Open Event"}
                </SelectItem>
                ))}
                <SelectItem value="add-new" className={`font-medium text-[14px] ${scanMode === "in" ? "text-teal-600 data-[highlighted]:bg-teal-100" : "text-orange-600 data-[highlighted]:bg-orange-100"}`}>
                    + Add New Event
                </SelectItem>
            </Select>

            {showAddEvent && (
            <div className={`mt-3 p-3 border border-dashed rounded-[30px] space-y-2 ${scanMode === "in" ? "border-teal-300 bg-teal-50/50" : "border-orange-300 bg-orange-50/50"}`}>
                <Input
                    placeholder="Event Title"
                    value={newEvent.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEvent({...newEvent, title: e.target.value})}
                    className="rounded-[80px] border-[#ddd5ca] text-[14px] text-gray-700"
                />
                <Select
                    value={newEvent.membershipId}
                    onValueChange={(val: string) => setNewEvent({...newEvent, membershipId: val})}
                    className="rounded-[80px] text-[14px] text-gray-700 [&_[data-selected]]:text-[#005f63] [&>span]:text-gray-700 [&>span]:data-[state=closed]:text-[#005f63]"
                >
                    <SelectItem value="" className={`rounded-[40px] text-[14px] text-[#005f63] ${scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"} data-[selected]:text-[#005f63]`}>
                        Open Event (All can join)
                    </SelectItem>
                    {memberships.map((m: any) => (
                      <SelectItem key={m.id} value={m.id} className={`rounded-[40px] text-[14px] text-gray-700 ${scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"} data-[selected]:text-[#005f63]`}>
                          {m.name}
                      </SelectItem>
                    ))}
                </Select>
                <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddEvent} className={`text-white rounded-[80px] text-[12px] transition-colors ${scanMode === "in" ? "bg-[#1c6364] hover:bg-[#238588] active:bg-[#185455]" : "bg-[#d18513] hover:bg-[#ebaa48] active:bg-[#cc7a00]"}`}>
                        Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddEvent(false)} className={`rounded-[80px] text-[12px] transition-colors ${scanMode === "in" ? "text-[#005f63] hover:bg-teal-100" : "text-[#b86a00] hover:bg-orange-100"}`}>
                        Cancel
                    </Button>
                </div>
                </div>
            )}

            {requiredMs && (
                <p className={`mt-2 text-xs px-2 py-1 rounded-[40px] inline-flex items-center gap-1 transition-colors ${scanMode === "in" ? "text-teal-700 bg-teal-50" : "text-orange-700 bg-orange-50"}`}>
                    <UserCheck size={12} /> Eligibility: <strong>{requiredMs.name}</strong> only
                </p>
                )}
            </div>

            <div className="flex gap-3 items-end">
                <div className="flex-1">
                    <Label className="text-[15px] tracking-wider text-gray-500 font-semibold">Attendance Closing Time</Label>
                    <Input
                    type="time"
                    value={closingTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClosingTime(e.target.value)}
                    className={`mt-1.5 border-[#ddd5ca] rounded-[80px] text-[14px] transition-colors ${scanMode === "in" ? "text-[#005f63] [&:not(:placeholder-shown)]:text-[#005f63]" : "text-[#b86a00] [&:not(:placeholder-shown)]:text-[#b86a00]"}`}
                    />
                </div>
                <Button onClick={setEventCloseTime} className={`rounded-[80px] h-10 text-[14px] transition-colors ${scanMode === "in" ? "bg-[#5b9b9e] hover:bg-[#0f7a7c] text-white" : "bg-[#c9ab5a] hover:bg-[#fc9c0b] text-white"}`}>
                    <Clock size={15} className="mr-1" /> Set
                </Button>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Test Scan (Select Resident)</p>
              <div className="flex flex-wrap gap-2">
                {residents.map((r: any) => (
                    <Button key={r.id} variant="outline" size="sm" onClick={() => simulateScan(r.id)} className={`rounded-[30px] transition-colors ${scanMode === "in" ? "border-teal-500/30 text-teal-700 hover:bg-teal-50" : "border-orange-500/30 text-orange-700 hover:bg-orange-50"}`}>
                        {r.name}
                    </Button>
                ))}
              </div>
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