import React, { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, ScanLine, Users, Award, CalendarDays, Bell, Settings, ChevronLeft, ChevronRight, LogOut, SquareMenu } from "lucide-react";

// --- VIEW IMPORTS ---
import DashboardView from "./Views/DashboardView";
import ScanView from "./Views/ScanView";
import ResidentsView from "./Views/ResidentsView";
import QRCodesView from "./Views/QRCodesView";
import { EventsView } from "./Views/EventsView";
import NotificationsView from "./Views/NotificationsView";
import ActivityLogsView from "./Views/ActivityLogsView.tsx"; // ✅ Replaced SettingsView
import { FileText } from "lucide-react";

// --- TYPES & MOCK DATA ---
export type Resident = { id: string; name: string; age: number; address: string; contact: string; };
export type Membership = { id: string; name: string; description: string; codeId?: string; note?: string; verified?: boolean; memberIds: string[]; };
export type Notification = { id: number; title: string; body: string; sentAt: string; };
export type AttendanceRecord = { id: number; eventTitle: string; eventDate: string; location: string; timeIn: string; timeOut: string; status: string; };

export const residents: Resident[] = [
  { id: "RES-001", name: "Juan Dela Cruz", age: 42, address: "Purok 1, Brgy. Piao", contact: "09123456789" },
  { id: "RES-002", name: "Maria Santos", age: 35, address: "Purok 2, Brgy. Piao", contact: "09198765432" },
];

export const memberships: Membership[] = [
  { id: "MEM-001", name: "Senior Citizens", description: "For residents aged 60+", memberIds: ["RES-001"] },
  { id: "MEM-002", name: "Women's Club", description: "For female residents 18+", memberIds: ["RES-002"] },
];

export const notifications: Notification[] = [
  { id: 1, title: "General Assembly Reminder", body: "Please attend the General Assembly.", sentAt: "2026-05-05 16:20" },
];

export const attendanceRecords: AttendanceRecord[] = [
  { id: 1, eventTitle: "Barangay General Assembly", eventDate: "2026-05-12 09:00", location: "Barangay Hall", timeIn: "2026-05-12 08:55", timeOut: "2026-05-12 11:30", status: "complete" },
];

// ✅ Updated NAV: "Activity Logs" instead of "Activity Logs / Settings"
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "scan", label: "QR Scanner", icon: ScanLine },
  { key: "residents", label: "Residents", icon: Users },
  { key: "memberships", label: "Memberships", icon: Award },
  { key: "events", label: "Events & Attendance", icon: CalendarDays },
  { key: "notify", label: "Notifications", icon: Bell },
  { key: "activitylogs", label: "Activity Logs", icon: FileText },
];

export const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark> : part
  );
};

// --------------------------
// LAYOUT COMPONENTS
// --------------------------
function Sidebar({ active, setActive }: { active: string; setActive: (key: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);

  const handleLogout = async () => {
    console.log('Logging out...');
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const decodedToken = token ? decodeURIComponent(token) : '';

      await fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        }
      });

      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';

    } catch (err) {
      console.error('Logout error:', err);
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className={`fixed top-4 z-50 bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#005555] ${isOpen ? "left-[235px]" : "left-[50px]"}`}>
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      <aside className={`flex-col border-r border-[#006666] bg-[#006666] h-screen sticky top-0 transition-all duration-300 flex overflow-hidden shadow-lg ${isOpen ? "w-[250px]" : "w-[70px]"}`}>
        <div className="border-b border-[#007777] px-3 py-5 shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-yellow-300 font-black text-[#005f63] shrink-0 shadow-md">B</div>
          <div className={`transition-all duration-300 overflow-hidden ${isOpen ? "opacity-100 w-auto visible" : "opacity-0 w-0 invisible"}`}>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">BARANGAY PIAO</p>
            <h1 className="text-[15px] font-black text-white whitespace-nowrap leading-tight">e-Membership</h1>
          </div>
        </div>
        <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
          <p className={`mb-3 px-3 text-sm font-semibold text-white/60 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>Staff Console</p>
          <div className="space-y-1.5">
            {NAV.map((item) => (
              <button key={item.key} onClick={() => setActive(item.key)} className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white"}`}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={`transition-all duration-300 whitespace-nowrap ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-[#007777] p-2 shrink-0">
          <button
            className={`flex items-center w-full rounded-[20px] py-3 text-white/80 transition-all hover:bg-[#007777] hover:text-white ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"}`}
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function TopHeader({ memberName, role }: { memberName: string; role: string }) {
  return (
    <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-6 py-4">
      <div className="flex items-center gap-2">
        <SquareMenu className="h-5 w-5 text-gray-700" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 m-0">Barangay Staff Portal</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-xs text-gray-500">Signed in as</p>
          <p className="text-sm font-bold text-[#005f63]">{memberName}</p>
        </div>
        <div className="rounded-full bg-[#ff7a28] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow">{role}</div>
      </div>
    </div>
  );
}

// --------------------------
// MAIN COMPONENT
// --------------------------
export default function StaffDashboard() {
  // Safe URL logic! If URL is /staff, it defaults to "dashboard"
  const getInitialActive = () => {
    const path = window.location.pathname;
    const lastSegment = path.split('/').pop() || "";
    const validKeys = NAV.map(n => n.key);
    return validKeys.includes(lastSegment) ? lastSegment : "dashboard";
  };

  const [active, setActiveState] = useState(getInitialActive());

  const setActive = (page: string) => {
    window.history.pushState({}, "", `/staff/${page}`);
    setActiveState(page);
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveState(getInitialActive());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const staff = { id: "STAFF-001", name: "Brgy. Captain", role: "STAFF / ADMIN" };

  const [membershipOptions, setMembershipOptions] = useState<Membership[]>(memberships);
  const [allEvents, setAllEvents] = useState<any[]>([]);

  const getMembershipName = (id: string | number | null | undefined) => {
    if (!id) return "";
    const found = membershipOptions.find((m) => String(m.id) === String(id));
    return found?.name || "";
  };

  useEffect(() => {
    const fetchMemberships = async () => {
      try {
        const response = await fetch('/api/memberships', {
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
        const data = await response.json();
        setMembershipOptions(data?.data ?? data ?? []);
      } catch (error) {
        console.error('Failed to fetch memberships:', error);
        setMembershipOptions([]);
      }
    };

    fetchMemberships();
  }, []);

  useEffect(() => {
    const fetchRealEvents = async () => {
      try {
        const response = await fetch('/events-data', {
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
        const result = await response.json();

        if (result.data) {
          const formattedEvents = result.data.map((dbEvent: any) => {
  const membershipIds = Array.isArray(dbEvent.membership_ids) ? dbEvent.membership_ids : [];
  const membershipNames = membershipIds
    .map((id: any) => getMembershipName(id))
    .filter(Boolean);
  const startDate = dbEvent.event_start?.split(' ')[0] ?? '';
  const endDate = dbEvent.event_end?.split(' ')[0] ?? startDate;
  const startTime = dbEvent.event_start?.split(' ')[1]?.slice(0, 5) ?? '';
  const endTime = dbEvent.event_end?.split(' ')[1]?.slice(0, 5) ?? '';

  return {
    id: dbEvent.id,
    title: dbEvent.name,
    date: dbEvent.event_start,
    event_start: dbEvent.event_start,  // ← ADD THIS LINE
    startDate,
    endDate,
    startTime,
    endTime,
    location: dbEvent.location,
    description: dbEvent.description,
    membershipIds,
    membershipName: membershipNames.length > 0 ? membershipNames.join(', ') : 'Open to all',
  };
});

          setAllEvents(formattedEvents);
        }
      } catch (error) {
        console.error("Error fetching events from database:", error);
      }
    };

    fetchRealEvents();
  }, [membershipOptions]);

  const handleDeleteEvent = (id: string | number) => {
    setAllEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const attended = attendanceRecords.filter(r => r.status === "complete").length;
  const missed = attendanceRecords.filter(r => r.status === "missed").length;

  return (
    <div className="flex min-h-screen bg-[#fcfcf9] text-gray-900">
      <Sidebar active={active} setActive={setActive} />

      <main className="flex-1">
        <TopHeader memberName={staff.name} role={staff.role} />

        <div className="h-[calc(100vh-73px)] overflow-y-auto p-6 smooth-scroll">
          {active === "dashboard" && (
            <DashboardView membershipsCount={memberships.length} setActive={setActive} />
          )}
          {active === "scan" && <ScanView events={allEvents} residents={residents} memberships={memberships} />}
          {active === "residents" && <ResidentsView />}
          {active === "memberships" && <QRCodesView memberships={memberships} highlightText={highlightText} />}
          {active === "events" && <EventsView allEvents={allEvents} onDeleteEvent={handleDeleteEvent} highlightText={highlightText} memberships={membershipOptions} />}
          {active === "notify" && <NotificationsView notifications={notifications} memberships={membershipOptions} highlightText={highlightText} />}
          {active === "activitylogs" && <ActivityLogsView />} {/* ✅ Updated route */}
        </div>
      </main>

      <style>{`
        .smooth-scroll { scroll-behavior: smooth !important; -webkit-overflow-scrolling: touch; }
        .smooth-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .smooth-scroll::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .smooth-scroll::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
      `}</style>
    </div>
  );
}
