import React, { useState } from "react";
import { Camera, CameraOff, CheckCircle, XCircle, LogIn, LogOut, Clock, UserCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../Components/UI/Card";
import { Button } from "../../../Components/UI/Button";
import { Input } from "../../../Components/UI/Input";
import { Label } from "../../../Components/UI/Label";
import { Select, SelectItem } from "../../../Components/UI/Select";
import { Badge } from "../../../Components/UI/Badge";

// Types
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

  // ✅ Scan logic
  const simulateScan = (residentId: string) => {
    const r = residents.find((x: any) => x.id === residentId)!;
    const residentMemberships = memberships.filter((m: any) => m.memberIds.includes(residentId)).map((m: any) => m.id);

    let hasAccess = true;
    let reason = "Open event — all residents allowed";

    if (requiredMs) {
      hasAccess = residentMemberships.includes(requiredMs.id);
      reason = hasAccess ? `Verified: member of ${requiredMs.name}` : `Denied: requires ${requiredMs.name} membership`;
    }

    setScan({ ok: true, residentId: r.id, residentName: r.name, hasAccess, reason, memberships: residentMemberships });
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
        return { ...prev, [eventId]: [...list, { residentId: scan!.residentId, residentName: scan!.residentName, timeIn: now, timeOut: null, status: "in" }] };
      }

      if (scanMode === "out") {
        if (!existing || !existing.timeIn) { alert("You must Sign In first."); return prev; }
        if (!isSignOutAllowed(scan.residentId)) { alert(`Available after ${closingTime}.`); return prev; }
        return { ...prev, [eventId]: list.map(e => e.residentId === scan!.residentId ? { ...e, timeOut: now, status: "complete" } : e) };
      }
      return prev;
    });
    setScan(null);
  };

  const canAccessSignOut = () => (attendance[eventId] ?? []).some(r => r.timeIn && !r.timeOut);

  return (
    <div className="space-y-6">
      {/* ... (Keep your existing JSX here, it was correct!) ... */}
    </div>
  );
}