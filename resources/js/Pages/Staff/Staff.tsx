import { useEffect, useMemo, useState } from "react";
import {
  Filter, MoreVertical, KeyRound, UserPlus, Eye, Pencil, Archive, LayoutDashboard, ScanLine, Users, Award, CalendarDays, Bell, Settings, ChevronLeft, ChevronRight, LogOut, User, Download, PlusCircle, Calendar, MapPin, Trash2,
  Camera, CameraOff, CheckCircle, XCircle, LogIn, Clock, UserCheck
} from "lucide-react";
import SearchBar from "../../Components/UI/SearchBar";

// --------------------------
// TYPES & MOCK DATA
// --------------------------
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

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
};

type Resident = {
  id: string;
  name: string;
  age: number;
  address: string;
  contact: string;
};

type Membership = {
  id: string;
  name: string;
  description: string;
  codeId?: string;
  note?: string;
  verified?: boolean;
  memberIds: string[];
};

type Event = {
  id: string;
  title: string;
  date: string;
  location: string;
  description?: string;
  membershipId?: string;
  attendees: { residentId: string; signIn: string; signOut?: string }[];
};

type Notification = {
  id: number;
  title: string;
  body: string;
  sentAt: string;
};

type ActivityLog = {
  id: string;
  action: string;
  target: string;
  actor: string;
  at: string;
};

type AttendanceRecord = {
  id: number;
  eventTitle: string;
  eventDate: string;
  location: string;
  timeIn: string;
  timeOut: string;
  status: string;
};

const residents: Resident[] = [
  { id: "RES-001", name: "Juan Dela Cruz", age: 42, address: "Purok 1, Brgy. Piao", contact: "09123456789" },
  { id: "RES-002", name: "Maria Santos", age: 35, address: "Purok 2, Brgy. Piao", contact: "09198765432" },
  { id: "RES-003", name: "Jose Reyes", age: 28, address: "Purok 3, Brgy. Piao", contact: "09176543210" },
  { id: "RES-004", name: "Ana Garcia", age: 50, address: "Purok 1, Brgy. Piao", contact: "09154321098" },
];

const memberships: Membership[] = [
  { id: "MEM-001", name: "Senior Citizens", description: "For residents aged 60+", memberIds: ["RES-001", "RES-004"] },
  { id: "MEM-002", name: "Women's Club", description: "For female residents 18+", memberIds: ["RES-002"] },
  { id: "m1", name: "Verified Resident", description: "Official barangay resident membership.", codeId: "R-000-M-RES", note: "Use only for resident-only events and transactions.", verified: true, memberIds: [] },
  { id: "m2", name: "Women's Association", description: "Barangay women's empowerment group.", codeId: "R-005-M-WOMEN", note: "Use only for Women's Association events.", verified: true, memberIds: [] },
  { id: "m3", name: "Senior Citizen", description: "Official senior citizen membership.", codeId: "R-010-M-SENIOR", note: "Discounts and priority access for seniors.", verified: true, memberIds: [] },
  { id: "m4", name: "SK Youth Member", description: "Registered Sangguniang Kabataan member.", codeId: "R-015-M-YOUTH", note: "Access to youth programs and activities.", verified: true, memberIds: [] },
  { id: "m5", name: "PWD Member", description: "Official Person With Disability membership.", codeId: "R-020-M-PWD", note: "Priority lanes and government discounts.", verified: true, memberIds: [] },
  { id: "m6", name: "Indigenous People", description: "Registered IP community member.", codeId: "R-025-M-IP", note: "Cultural rights and support programs.", verified: true, memberIds: [] },
  { id: "m7", name: "Fisherfolk Sector", description: "Registered fisherfolk member.", codeId: "R-030-M-FISH", note: "Aid and support for fisherfolk community.", verified: true, memberIds: [] },
  { id: "m8", name: "Agriculture Worker", description: "Registered agricultural worker member.", codeId: "R-035-M-AGRI", note: "Farming assistance and subsidy programs.", verified: true, memberIds: [] },
  { id: "m9", name: "Health Worker", description: "Barangay health worker membership.", codeId: "R-040-M-HEALTH", note: "Eligible for health service benefits.", verified: true, memberIds: [] },
  { id: "m10", name: "Peace & Order Team", description: "Barangay peace and order volunteer.", codeId: "R-045-M-PEACE", note: "Community safety and security duties.", verified: true, memberIds: [] },
];

const events: Event[] = [
  {
    id: "EVT-001",
    title: "Health Checkup",
    date: "2026-05-15 08:00",
    location: "Barangay Hall",
    membershipId: undefined,
    attendees: [{ residentId: "RES-001", signIn: "08:15", signOut: "11:30" }]
  },
  {
    id: "EVT-002",
    title: "Senior Citizen Assembly",
    date: "2026-05-20 09:00",
    location: "Multi-Purpose Hall",
    membershipId: "MEM-001",
    attendees: []
  }
];

const notifications: Notification[] = [
  { id: 1, title: "General Assembly Reminder", body: "Please attend the General Assembly on May 12, 9:00 AM at the Barangay Hall.", sentAt: "2026-05-05 16:20" },
  { id: 2, title: "Bring your QR code", body: "Always bring your QR code for attendance scanning.", sentAt: "2026-05-04 10:00" },
  { id: 3, title: "Sports Fest open registration", body: "SK Youth Sports Fest registration is now open.", sentAt: "2026-05-02 09:15" },
  { id: 4, title: "Water Service Advisory", body: "Water interruption scheduled May 10 1PM–5PM in Poblacion area.", sentAt: "2026-05-01 09:45" },
  { id: 5, title: "New Benefit Available", body: "Senior citizens may now claim free medicine every Wednesday.", sentAt: "2026-04-30 14:30" },
  { id: 6, title: "Clean-Up Drive", body: "Join our community clean-up drive this Saturday, 6AM at the plaza.", sentAt: "2026-04-29 08:00" },
];

const activityLogs: ActivityLog[] = [
  { id: "LOG-001", action: "Added Resident", target: "Juan Dela Cruz", actor: "Brgy. Captain", at: "2026-05-13 09:12" },
  { id: "LOG-002", action: "Updated Event", target: "Health Checkup", actor: "Brgy. Captain", at: "2026-05-13 10:45" }
];

const attendanceRecords: AttendanceRecord[] = [
  { id: 1, eventTitle: "Barangay General Assembly", eventDate: "2026-05-12 09:00", location: "Barangay Hall", timeIn: "2026-05-12 08:55", timeOut: "2026-05-12 11:30", status: "complete" },
  { id: 2, eventTitle: "Community Clean-Up", eventDate: "2026-05-15 06:00", location: "Town Plaza", timeIn: "2026-05-15 06:02", timeOut: "", status: "incomplete" },
  { id: 3, eventTitle: "Health Seminar", eventDate: "2026-05-20 13:00", location: "Barangay Hall", timeIn: "", timeOut: "", status: "missed" },
  { id: 4, eventTitle: "Youth Basketball League", eventDate: "2026-05-25 08:00", location: "Covered Court", timeIn: "2026-05-25 08:10", timeOut: "2026-05-25 12:00", status: "complete" },
  { id: 5, eventTitle: "Disaster Preparedness", eventDate: "2026-05-30 10:00", location: "Multi-Purpose Hall", timeIn: "", timeOut: "2026-05-30 12:30", status: "incomplete" },
  { id: 6, eventTitle: "Monthly Assembly", eventDate: "2026-04-20 09:00", location: "Barangay Hall", timeIn: "2026-04-20 08:50", timeOut: "2026-04-20 11:45", status: "complete" },
  { id: 7, eventTitle: "Tree Planting Activity", eventDate: "2026-04-10 07:00", location: "Community Park", timeIn: "", timeOut: "", status: "missed" },
  { id: 8, eventTitle: "Senior Citizen Forum", eventDate: "2026-04-05 14:00", location: "Senior Center", timeIn: "2026-04-05 14:05", timeOut: "", status: "incomplete" },
  { id: 9, eventTitle: "Women's Month Celebration", eventDate: "2026-03-25 08:00", location: "Covered Court", timeIn: "2026-03-25 08:15", timeOut: "2026-03-25 12:10", status: "complete" },
  { id: 10, eventTitle: "SK Leadership Training", eventDate: "2026-03-15 09:00", location: "Multi-Purpose Hall", timeIn: "", timeOut: "", status: "missed" },
];

function residentName(id: string): string {
  const r = residents.find(x => x.id === id);
  return r ? r.name : "Unknown Resident";
}

const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
    ) : part
  );
};

// --------------------------
// UI COMPONENTS (BUILT-IN, NO EXTERNAL DEPENDENCIES)
// --------------------------
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-lg border shadow-sm ${className}`}>{children}</div>;
}
function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 border-b ${className}`}>{children}</div>;
}
function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>;
}
function CardDescription({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-500 ${className}`}>{children}</p>;
}
function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

function Button({ children, variant = "default", size = "default", className = "", ...props }: any) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors";
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-300 bg-white hover:bg-gray-100",
    ghost: "hover:bg-gray-100"
  };
  const sizes = {
    default: "px-4 py-2 text-sm",
    sm: "px-2 py-1 text-xs",
    icon: "h-9 w-9 p-0"
  };
  return <button className={`${base} ${variants[variant as keyof typeof variants]} ${sizes[size as keyof typeof sizes]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = "", ...props }: any) {
  return <input className={`w-full px-3 py-2 border rounded-md ${className}`} {...props} />;
}

function Textarea({ className = "", ...props }: any) {
  return <textarea className={`w-full px-3 py-2 border rounded-md ${className}`} {...props} />;
}

function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode; variant?: "default" | "secondary"; className?: string }) {
  const variants = {
    default: "bg-teal-50 text-teal-800",
    secondary: "bg-gray-100 text-gray-600",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>{children}</span>;
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium ${className}`}>{children}</label>;
}

function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-x-auto ${className}`}><table className="w-full text-sm">{children}</table></div>;
}
function TableHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <thead className={`bg-gray-50 ${className}`}>{children}</thead>;
}
function TableBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tbody className={className}>{children}</tbody>;
}
function TableRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tr className={`border-b ${className}`}>{children}</tr>;
}
function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left p-3 font-medium ${className}`}>{children}</th>;
}
function TableCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`p-3 ${className}`}>{children}</td>;
}

function Select({ value, onValueChange, children, className = "" }: any) {
  return (
    <select value={value} onChange={(e) => onValueChange(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${className}`}>
      {children}
    </select>
  );
}
function SelectTrigger({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={className}>{children}</div>; }
function SelectValue({ placeholder, className = "" }: { placeholder?: string;
    className?: string }) { return <option value="" className={className}>{placeholder}</option>; }
function SelectContent({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={className}>{children}</div>; }
function SelectItem({ value, children, className = "" }: { value: string; children: React.ReactNode; className?: string }) { return <option value={value} className={className}>{children}</option>; }

// UPDATED Sidebar Component
function Sidebar({ active, setActive }: { active: string; setActive: (key: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);

  const NAV: NavItem[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "scan", label: "QR Scanner", icon: ScanLine },
    { key: "residents", label: "Residents", icon: Users },
    { key: "memberships", label: "Memberships", icon: Award },
    { key: "events", label: "Events & Attendance", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      {/* Toggle Button - improved position & style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 z-50 bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#005555] ${
          isOpen ? "left-[235px]" : "left-[50px]"
        }`}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <aside
        className={`flex-col border-r border-[#006666] bg-[#006666] h-screen sticky top-0 transition-all duration-300 flex overflow-hidden shadow-lg ${
          isOpen ? "w-[250px]" : "w-[70px]"
        }`}
      >
        {/* Sidebar Header - updated design */}
        <div className="border-b border-[#007777] px-3 py-5 shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-yellow-300 font-black text-[#005f63] shrink-0 shadow-md">
            B
          </div>
          <div
            className={`transition-all duration-300 overflow-hidden ${
              isOpen ? "opacity-100 w-auto visible" : "opacity-0 w-0 invisible"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">
              BARANGAY PIAO
            </p>
            <h1 className="text-[15px] font-black text-white whitespace-nowrap leading-tight">
              e-Membership
            </h1>
          </div>
        </div>

        {/* Navigation Menu - updated hover & active styles */}
        <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
          <p
            className={`mb-3 px-3 text-sm font-semibold text-white/60 transition-opacity duration-300 ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            Staff Console
          </p>
          <div className="space-y-1.5">
            {NAV.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${
                    isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
                  } ${
                    isActive
                      ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]"
                      : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={`transition-all duration-300 whitespace-nowrap ${
                      isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer / Logout - updated */}
        <div className="border-t border-[#007777] p-2 shrink-0">
          <button
            className={`flex items-center w-full rounded-[20px] py-3 text-white/80 transition-all hover:bg-[#007777] hover:text-white hover:translate-x-1 ${
              isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
            }`}
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.href = "/";
            }}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span
              className={`transition-all duration-300 whitespace-nowrap ${
                isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
              }`}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ✅ NEW UPDATED HEADER — EXACTLY LIKE YOUR IMAGE + UNIFORM WITH MEMBER HEADER
import { SquareMenu } from "lucide-react";

function TopHeader({ memberName, role }: { memberName: string; role: string }) {
  return (
    <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-6 py-4">
      <div className="flex items-center gap-2">
        <SquareMenu className="h-5 w-5 text-gray-700" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 m-0">
          Barangay Staff Portal
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-xs text-gray-500">Signed in as</p>
          <p className="text-sm font-bold text-[#005f63]">{memberName}</p>
        </div>
        <div className="rounded-full bg-[#ff7a28] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow">
          {role}
        </div>
      </div>
    </div>
  );
}

// --------------------------
// APP SHELL
// --------------------------
function AppShell({ children, items, active, onSelect, name, role }: {
  children: React.ReactNode;
  items: NavItem[];
  active: string;
  onSelect: (key: string) => void;
  name: string;
  role: string;
}) {
  return (
    <div className="flex min-h-screen bg-[#fcfcf9] text-gray-900">
      <Sidebar active={active} setActive={onSelect} />
      <main className="flex-1">
        <TopHeader memberName={name} role={role} />
        <div className="h-[calc(100vh-73px)] overflow-y-auto smooth-scroll" style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}>
          <div className="space-y-5 p-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "scan", label: "QR Scanner", icon: ScanLine },
  { key: "residents", label: "Residents", icon: Users },
  { key: "memberships", label: "Memberships", icon: Award },
  { key: "events", label: "Events & Attendance", icon: CalendarDays },
  { key: "notify", label: "Notifications", icon: Bell },
  { key: "settings", label: "Settings", icon: Settings },
];

// --------------------------
// MAIN EXPORT COMPONENT
// --------------------------
export default function StaffDashboard() {
  const currentPath = window.location.pathname.replace('/', '');
  const [active, setActiveState] = useState(currentPath || "dashboard");
  const setActive = (page: string) => {
    const url = page === "dashboard" ? "/" : `/${page}`;
    window.history.pushState({}, "", url);
    setActiveState(page);
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace('/', '') || "dashboard";
      setActiveState(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const staff = { id: "STAFF-001", name: "Brgy. Captain", role: "STAFF / ADMIN" };

  const [upcomingEvents, setUpcomingEvents] = useState([
    { id: 1, title: "Barangay General Assembly", date: "2026-05-12 09:00", location: "Barangay Hall", description: "Quarterly assembly of all registered members." },
    { id: 2, title: "Community Clean-Up", date: "2026-05-13 06:00", location: "Town Plaza", description: "Weekly clean-up activity, all residents welcome. Bring gloves and brooms." },
    { id: 3, title: "Health Seminar", date: "2026-05-14 13:00", location: "Barangay Hall", description: "Free health talk & check-up for seniors and vulnerable groups." },
    { id: 4, title: "Youth Basketball League", date: "2026-05-11 08:00", location: "Covered Court", description: "Annual sports event for youth ages 15–21." },
    { id: 5, title: "Disaster Preparedness", date: "2026-05-15 10:00", location: "Multi-Purpose Hall", description: "Training & seminar for all households. Emergency kits will be distributed." },
  ]);

  const [pastEvents, setPastEvents] = useState([
    { id: 6, title: "Monthly Assembly", date: "2026-05-08 09:00", location: "Barangay Hall", description: "Regular monthly meeting of residents and officials." },
    { id: 7, title: "Tree Planting Activity", date: "2026-05-07 07:00", location: "Community Park", description: "Environmental activity for all members. Over 100 seedlings planted." },
    { id: 8, title: "Senior Citizen Forum", date: "2026-05-06 14:00", location: "Senior Center", description: "Forum on elderly care, benefits, and health services." },
  ]);

  const allEvents = useMemo(() => [...upcomingEvents, ...pastEvents], [upcomingEvents, pastEvents]);
  const handleDeleteEvent = (id: number) => {
    setUpcomingEvents(prev => prev.filter(e => e.id !== id));
    setPastEvents(prev => prev.filter(e => e.id !== id));
  };

  const attended = attendanceRecords.filter(r => r.status === "complete").length;
  const missed = attendanceRecords.filter(r => r.status === "missed").length;

  return (
    <div className="min-h-screen bg-[#fcfcf9] text-gray-900">
      <AppShell role={staff.role} name={staff.name} items={NAV} active={active} onSelect={setActive}>
        {active === "dashboard" && (
          <DashboardView
            memberName={staff.name.split(" ")[0]}
            membershipsCount={memberships.length}
            attendedCount={attended}
            missedCount={missed}
            setActive={setActive}
            notifications={notifications}
            upcomingEvents={upcomingEvents}
            pastEventsCount={pastEvents.length}
          />
        )}
        {active === "scan" && <ScanView />}
        {active === "residents" && <ResidentsView />}
        {active === "memberships" && <QRCodesView memberships={memberships} highlightText={highlightText} />}
        {active === "events" && (
          <EventsView
            allEvents={allEvents}
            upcomingEvents={upcomingEvents}
            pastEvents={pastEvents}
            onDeleteEvent={handleDeleteEvent}
            highlightText={highlightText}
          />
        )}
        {active === "notify" && <NotificationsView notifications={notifications} highlightText={highlightText} />}
        {active === "settings" && <SettingsView member={staff} />}
      </AppShell>

      <style>{`
        .smooth-scroll { scroll-behavior: smooth !important; -webkit-overflow-scrolling: touch; }
        .smooth-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .smooth-scroll::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .smooth-scroll::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
        .smooth-scroll::-webkit-scrollbar-thumb:hover { background: #aaa; }
        .shadow-b-sm { box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
      `}</style>
    </div>
  );
}

/* ---------------- UPDATED Dashboard ---------------- */
function DashboardView({ memberName, membershipsCount, attendedCount, missedCount, setActive, notifications, upcomingEvents, pastEventsCount }: any) {
  // Stats exactly like screenshot — removed Notifications, kept only Residents, Memberships, Events
  const stats = [
    { value: 8, label: "RESIDENTS", gradient: "from-orange-400 to-yellow-300" },
    { value: 4, label: "MEMBERSHIPS", gradient: "from-[#067a7a] to-[#5fd3d3]" },
    { value: 4, label: "EVENTS", gradient: "from-orange-400 to-yellow-300" }
  ];

  // Activity log exactly as in screenshot
  const recentActivities = [
    { action: "Scanned QR — Sign In", detail: "Maria Santos · General Assembly", staff: "Brgy. Captain", time: "2026-05-12 08:55" },
    { action: "Created Event", detail: "Senior Citizens Health Check", staff: "Brgy. Captain", time: "2026-05-06 11:02" },
    { action: "Sent Notification", detail: "General Assembly Reminder", staff: "Kagawad Lina", time: "2026-05-05 16:20" },
    { action: "Generated QR", detail: "SK Youth Council — 2 members", staff: "Brgy. Captain", time: "2026-05-05 10:11" },
    { action: "Added Resident", detail: "Liza Domingo (R-007)", staff: "Kagawad Lina", time: "2026-05-04 09:32" }
  ];

  return (
    <>
      {/* Header — same gradient, same style */}
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          STAFF CONSOLE
        </p>
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
        <p className="mt-2 text-base text-white/90">
          Manage residents, memberships, events, attendance and notifications.
        </p>
      </div>

      {/* Stats Cards — 3 columns now, same card style & hover */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item, idx) => (
          <button
            key={idx}
            onClick={() => {
              if (item.label === "RESIDENTS") setActive("residents");
              if (item.label === "MEMBERSHIPS") setActive("memberships");
              if (item.label === "EVENTS") setActive("events");
            }}
            className={`w-full rounded-[30px] bg-gradient-to-r ${item.gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]`}
          >
            <h2 className="text-5xl font-black">{item.value}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
              {item.label}
            </p>
          </button>
        ))}
      </div>

      {/* 2 Column Section: System QR + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        {/* Left: System QR Code */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">System QR Code</h2>
          <p className="text-[15px] mt-1 text-gray-600">Residents scan this code to open the membership portal on their phone.</p>

          <div className="mt-5 flex items-start gap-4">
            <div className="shrink-0">
              <FakeQR seed="BARangay-E-MEMBERSHIP-001" large />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#005f63]">Barangay e-Membership</p>
              <p className="text-sm text-gray-600 mt-1">Posted at the Barangay Hall lobby</p>
              <p className="text-sm text-gray-600 mt-1">Print and post in public places — residents scan to install.</p>
              <button className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-[30px] text-sm font-medium hover:bg-orange-600 transition">
                Download printable QR
              </button>
            </div>
          </div>
        </div>

        {/* Right: Recent Activity */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
        <h2 className="text-2xl font-black text-[#005f63]">Recent Activity</h2>
        <p className="text-[15px] mt-1 text-gray-600">Latest staff actions in the system.</p>

            <div className="mt-5 space-y-4 relative max-h-[260px] overflow-y-auto pr-2 smooth-scroll">
                {/* Teal line — now correctly aligned */}
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-teal-500/40"></div>

                {recentActivities.map((act, i) => (
                <div key={i} className="relative pl-6">
                    {/* Orange dot — perfectly centered on the line */}
                    <span className="absolute left-[4px] top-2 w-2 h-2 rounded-full bg-orange-400"></span>
                    <p className="font-semibold text-[#005f63]">{act.action}</p>
                    <p className="text-[11px] text-gray-600">{act.detail}</p>
                    <p className="text-[11px] text-gray-500">Staff: {act.staff} · {act.time}</p>
                </div>
                ))}
            </div>
        </div>
      </div>
    </>
  );
}

// ---------------- Scan ----------------
function ScanView() {
  const [eventId, setEventId] = useState(events[0].id);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry[]>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [closingTime, setClosingTime] = useState("");
  const [scanMode, setScanMode] = useState<"in" | "out">("in");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", membershipId: "" });

  const ev = events.find((e) => e.id === eventId)!;
  const requiredMs = ev.membershipId ? memberships.find((m) => m.id === ev.membershipId) : null;

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
    const r = residents.find((x) => x.id === residentId)!;
    const residentMemberships = memberships.filter(m => m.memberIds.includes(residentId)).map(m => m.id);

    let hasAccess = true;
    let reason = "Open event — all residents allowed";

    if (requiredMs) {
      hasAccess = residentMemberships.includes(requiredMs.id);
      reason = hasAccess
        ? `Verified: member of ${requiredMs.name}`
        : `Denied: requires ${requiredMs.name} membership`;
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

  // ✅ Helper: Check if Sign Out is allowed
  const isSignOutAllowed = (residentId: string) => {
    const record = attendance[eventId]?.find(e => e.residentId === residentId);
    if (!record || !record.timeIn) return false; // No sign-in yet

    // If no closing time set → allow immediately after sign-in
    if (!closingTime) return true;

    // Compare current time vs closing time
    const now = new Date();
    const [closeHour, closeMin] = closingTime.split(":").map(Number);
    const closeTimeObj = new Date();
    closeTimeObj.setHours(closeHour, closeMin, 0);

    return now >= closeTimeObj;
  };

  // ✅ Record Sign-In OR Sign-Out — with restriction logic
  const confirmAttendance = () => {
    if (!scan?.ok || !scan.hasAccess) return;

    setAttendance(prev => {
      const list = prev[eventId] ?? [];
      const existing = list.find(e => e.residentId === scan!.residentId);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (scanMode === "in") {
        // ✅ SIGN IN: only add if not exists
        if (existing) return prev;
        return {
          ...prev,
          [eventId]: [...list, {
            residentId: scan!.residentId,
            residentName: scan!.residentName,
            timeIn: now,
            timeOut: null,
            status: "in"
          }]
        };
      }

      if (scanMode === "out") {
        // ❌ Can't sign out if never signed in
        if (!existing || !existing.timeIn) {
          alert("You must Sign In first before Sign Out.");
          return prev;
        }
        // ❌ Can't sign out before allowed time
        if (!isSignOutAllowed(scan.residentId)) {
          alert(`Sign Out is only available after ${closingTime || "set closing time"}.`);
          return prev;
        }
        // ✅ Already has record → update timeOut
        return {
          ...prev,
          [eventId]: list.map(e =>
            e.residentId === scan!.residentId
              ? { ...e, timeOut: now, status: "complete" }
              : e
          )
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

  // ✅ Determine if Sign Out tab should be accessible
  const canAccessSignOut = () => {
    const records = attendance[eventId] ?? [];
    return records.some(r => r.timeIn && !r.timeOut);
  };

  return (
    <div className="space-y-6">
      {/* ✅ Fixed Header — same style */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm rounded-[10px]">
        <div>
          <h1 className="text-4xl font-black text-[#005f63]">QR Scanner</h1>
          <p className="text-sm text-[#667777] mt-1">Scan resident QR codes — sign in & sign out.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: Scanner */}
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
            {/* Camera View — ✅ Matches page background, slightly darker */}
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

            {/* Scan Mode Toggle — ✅ Sign Out disabled until eligible */}
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

            {/* ✅ Event Selector — WITH ADD EVENT OPTION */}
            <div>
            <Label className="text-[15px] tracking-wider text-gray-500 font-semibold">Select Event</Label>
            <Select
            value={eventId}
            onValueChange={(val: string) => {
                if (val === "add-new") {
                setShowAddEvent(true);
                } else {
                setEventId(val);
                }
            }}
            className={`mt-1.5 border-[#ddd5ca] rounded-[80px] text-[14px] [&_[data-selected]]:text-[#005f63] [&>span]:data-[state=closed]:text-[#005f63] transition-colors ${scanMode === "in" ? "text-[#005f63]" : "text-[#b86a00]"}`}
            >
                {events.map(e => (
                <SelectItem
                    key={e.id}
                    value={e.id}
                    className={`text-[14px] ${
                    // ✅ Open Event items (including Health Checkup) are ALWAYS #005f63 in the list
                    e.title.includes("Open Event") ? "text-[#005f63]" : "text-gray-700"
                    } ${
                    scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"
                    } data-[selected]:text-[#005f63]`} // ✅ When selected → also #005f63
                >
                    {e.title} {e.membershipId ? `· ${memberships.find(m => m.id === e.membershipId)?.name}` : "· Open Event"}
                </SelectItem>
                ))}
                {/* ✅ ADD NEW EVENT OPTION */}
                <SelectItem
                    value="add-new"
                    className={`font-medium text-[14px] ${
                        scanMode === "in" ? "text-teal-600 data-[highlighted]:bg-teal-100" : "text-orange-600 data-[highlighted]:bg-orange-100"
                    }`}
                 >
                    + Add New Event
                </SelectItem>
            </Select>

            {/* ✅ Add Event Form */}
            {showAddEvent && (
            <div className={`mt-3 p-3 border border-dashed rounded-[30px] space-y-2 ${
                scanMode === "in" ? "border-teal-300 bg-teal-50/50" : "border-orange-300 bg-orange-50/50"
            }`}>
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
                    {/* ✅ "Open Event (All can join)" → always #005f63 */}
                    <SelectItem
                        value=""
                        className={`rounded-[40px] text-[14px] text-[#005f63] ${
                            scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"
                        } data-[selected]:text-[#005f63]`}
                        >
                        Open Event (All can join)
                        </SelectItem>
                        {memberships.map(m => (
                        <SelectItem
                            key={m.id}
                            value={m.id}
                            className={`rounded-[40px] text-[14px] text-gray-700 ${
                            scanMode === "in" ? "data-[highlighted]:bg-teal-100" : "data-[highlighted]:bg-orange-100"
                            } data-[selected]:text-[#005f63]`}
                        >
                            {m.name}
                    </SelectItem>
                    ))}
                </Select>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={handleAddEvent}
                        className={`text-white rounded-[80px] text-[12px] transition-colors ${
                            scanMode === "in"
                            ? "bg-[#1c6364] hover:bg-[#238588] active:bg-[#185455]"
                            : "bg-[#d18513] hover:bg-[#ebaa48] active:bg-[#cc7a00]"
                        }`}
                        >
                        Save
                        </Button>
                        <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowAddEvent(false)}
                        className={`rounded-[80px] text-[12px] transition-colors ${
                            scanMode === "in"
                            ? "text-[#005f63] hover:bg-teal-100"
                            : "text-[#b86a00] hover:bg-orange-100"
                        }`}
                        >
                        Cancel
                    </Button>
                </div>
                </div>
            )}

            {requiredMs && (
                <p className={`mt-2 text-xs px-2 py-1 rounded-[40px] inline-flex items-center gap-1 transition-colors ${
                    scanMode === "in" ? "text-teal-700 bg-teal-50" : "text-orange-700 bg-orange-50"
                }`}>
                    <UserCheck size={12} /> Eligibility: <strong>{requiredMs.name}</strong> only
                </p>
                )}
            </div>

            {/* Closing Time */}
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
                {/* Set Button */}
                <Button
                    onClick={setEventCloseTime}
                    className={`rounded-[80px] h-10 text-[14px] transition-colors ${
                        scanMode === "in"
                        ? "bg-[#5b9b9e] hover:bg-[#0f7a7c] text-white"
                        : "bg-[#c9ab5a] hover:bg-[#fc9c0b] text-white"
                    }`}
                >
                    <Clock size={15} className="mr-1" /> Set
                </Button>
            </div>

            {/* Test Scan Buttons */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Test Scan (Select Resident)</p>
              <div className="flex flex-wrap gap-2">
                {residents.map(r => (
                    <Button
                        key={r.id}
                        variant="outline"
                        size="sm"
                        onClick={() => simulateScan(r.id)}
                        className={`rounded-[30px] transition-colors ${
                        scanMode === "in"
                            ? "border-teal-500/30 text-teal-700 hover:bg-teal-50"
                            : "border-orange-500/30 text-orange-700 hover:bg-orange-50"
                        }`}
                    >
                        {r.name}
                    </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Scan Result + Attendance List */}
        <div className="space-y-4">
          {/* Scan Result */}
          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white rounded-t-[30px]">
              <CardTitle className={`font-black transition-colors ${
                    scanMode === "in" ? "text-[#005f63]" : "text-[#005f63]"
                    }`}>
                    Scan Result
                </CardTitle>
            </CardHeader>
            <CardContent className="rounded-b-[30px]">
              {!scan ? (
                <div className="rounded-[30px] border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No scan performed yet.
                </div>
              ) : (
                <div className={`rounded-[30px] border p-4 transition-colors ${
                scan.hasAccess
                    ? scanMode === "in"
                    ? "border-teal-500/50 bg-teal-50"     // ✅ Sign In = Teal
                    : "border-orange-500/50 bg-orange-50" // ✅ Sign Out = Orange
                    : "border-red-500/40 bg-red-50"
                }`}>
                <div className="flex items-start gap-3">
                    {scan.hasAccess
                    ? (scanMode === "in"
                        ? <CheckCircle className="text-teal-600 shrink-0" size={20} />
                        : <CheckCircle className="text-orange-600 shrink-0" size={20} />)
                    : <XCircle className="text-red-600 shrink-0" size={20} />
                    }
                    <div>
                    <p className={`text-lg font-bold ${
                        scan.hasAccess
                        ? scanMode === "in" ? "text-teal-800" : "text-orange-800"
                        : "text-red-600"
                    }`}>
                        {scan.hasAccess ? `✓ ${scan.residentName}` : `✗ Denied — ${scan.residentName}`}
                    </p>
                      <p className="mt-1 text-sm text-gray-600">{scan.reason}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Their memberships: {scan.memberships.map(id => memberships.find(m => m.id === id)?.name).join(", ") || "None"}
                      </p>
                    </div>
                  </div>

                  {scan.hasAccess && (
                    <Button
                        onClick={confirmAttendance}
                        disabled={scanMode === "out" && !isSignOutAllowed(scan.residentId)}
                        className={`mt-3 w-full text-white rounded-[80px] transition-colors ${
                            scanMode === "in"
                            ? "bg-[#227a7a] hover:bg-[#439e9e]" // ✅ Sign In = Teal
                            : "bg-[#fd9a06] hover:bg-[#ffb444]" // ✅ Sign Out = Orange
                        } ${scanMode === "out" && !isSignOutAllowed(scan.residentId) ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                        Confirm {scanMode === "in" ? "Sign In" : "Sign Out"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attendance List — ✅ Shows even Sign-Out-only records */}
          <Card className="border-[#ddd5ca] rounded-[30px] shadow-sm">
            <CardHeader className="border-b border-[#ddd5ca] bg-white sticky top-0 z-10 rounded-t-[30px]">
              <CardTitle className={`font-black transition-colors ${
                scanMode === "in" ? "text-[#005f63]" : "text-[#005f63]"
                }`}>
                Attendance · {ev.title}
              </CardTitle>
              <CardDescription className="text-[#667777] mt-1">
                {attendance[eventId]?.length ?? 0} record(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto smooth-scroll rounded-b-[30px]">
              {!(attendance[eventId] ?? []).length ? (
                <p className="rounded-[30px] border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                  No attendees added yet.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {attendance[eventId]!.map((rec, i) => (
                    <div
                        key={rec.residentId}
                        className={`p-3 rounded-[30px] border flex items-center justify-between transition-colors ${
                            scanMode === "in" ? "bg-teal-50 border-teal-100" : "bg-orange-50 border-orange-100"
                        }`}
                    >
                      <div>
                        <p className="font-medium text-gray-800">{i + 1}. {rec.residentName}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-600">
                          <span className="flex items-center gap-1"><LogIn size={12} /> {rec.timeIn || "—"}</span>
                          <span className="flex items-center gap-1"><LogOut size={12} /> {rec.timeOut || "—"}</span>
                        </div>
                      </div>
                      <Badge
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rec.status === "complete" ? "bg-green-100 text-green-800" :
                          "bg-yellow-100 text-yellow-800"
                        }`}
                      >
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

function FakeQR({ seed, large }: { seed: string; large?: boolean }) {
  const cells = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 169 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 16) % 2 === 0;
    });
  }, [seed]);

  return (
    <div
      className={`grid gap-[2px] rounded-xl bg-white p-2 shadow ring-1 ring-gray-200 ${
        large ? "h-44 w-44" : "h-32 w-32"
      }`}
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
    >
      {cells.map((on, i) => (
        <div key={i} className={on ? "bg-[#095a5a]" : "bg-white"} />
      ))}
    </div>
  );
}

/* ---------------- Residents ---------------- */
// Available membership options
const availableMemberships = [
  "Verified Resident",
  "Women's Association",
  "Senior Citizen",
  "Health Worker",
  "Barangay Staff",
  "Peace & Order Team",
  "Treasurer",
  "Secretary"
];

function ResidentsView() {
  const [residentSearch, setResidentSearch] = useState("");
  const [residentFilter, setResidentFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewRecord, setViewRecord] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ✅ DATA — passwordChangedByUser = true → staff cannot see/edit password OR change role
  const [residentsData, setResidentsData] = useState([
    {
      id: "R-001",
      lastName: "Santos",
      firstName: "Maria",
      middleName: "Reyes",
      contactNumber: "0917-123-4567",
      memberships: "Verified Resident, Women's Association, Senior Citizen, Health Worker",
      role: "Resident",
      hasAccount: true,
      username: "R-001",
      password: "temp1234",
      passwordChangedByUser: false,
    },
    {
      id: "S-001",
      lastName: "Dela Cruz",
      firstName: "Juan",
      middleName: "Garcia",
      contactNumber: "0918-987-6543",
      memberships: "Barangay Staff, Peace & Order Team, Treasurer",
      role: "Staff",
      hasAccount: true,
      username: "S-001",
      password: "temp5678",
      passwordChangedByUser: true, // ✅ ROLE WILL BE LOCKED
    },
    {
      id: "R-002",
      lastName: "Reyes",
      firstName: "Ana",
      middleName: "Martinez",
      contactNumber: "0919-111-2222",
      memberships: "Senior Citizen, Health Worker",
      role: "Resident",
      hasAccount: false,
      username: "",
      password: "",
      passwordChangedByUser: false,
    },
  ]);

  // ✅ Helper: Auto-capitalize first letter of every word
  const capitalizeName = (value: string) => {
    return value
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // ✅ Helper: Format & validate contact number (11 digits only, auto add hyphens)
  const formatContactNumber = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 11);
    if (digitsOnly.length <= 4) return digitsOnly;
    if (digitsOnly.length <= 7) return `${digitsOnly.slice(0,4)}-${digitsOnly.slice(4)}`;
    return `${digitsOnly.slice(0,4)}-${digitsOnly.slice(4,7)}-${digitsOnly.slice(7)}`;
  };

  // ✅ NEW RESIDENT FORM — NO CREATE ACCOUNT SECTION
  const [newResident, setNewResident] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    hasMemberships: false,
    selectedMemberships: [] as string[],
  });

  // ✅ ADD FORM VALIDATION
  const validateAddForm = () => {
    const errors: Record<string, string> = {};

    if (!newResident.firstName.trim()) errors.firstName = "First name is required";
    if (!newResident.lastName.trim()) errors.lastName = "Last name is required";

    const rawDigits = newResident.contactNumber.replace(/\D/g, "");
    if (!rawDigits) {
      errors.contactNumber = "Contact number is required";
    } else if (rawDigits.length !== 11) {
      errors.contactNumber = "Must be exactly 11 digits";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ✅ ADD RESIDENT FUNCTION
  const handleAddResident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddForm()) return;

    // Generate new ID
    const newId = residentsData.length > 0
      ? `R-${String(Number(residentsData[residentsData.length - 1].id.split("-")[1]) + 1).padStart(3, "0")}`
      : "R-001";

    // Format memberships
    const membershipsString = newResident.hasMemberships
      ? newResident.selectedMemberships.join(", ")
      : "";

    setResidentsData(prev => [
      ...prev,
      {
        id: newId,
        firstName: newResident.firstName,
        middleName: newResident.middleName,
        lastName: newResident.lastName,
        contactNumber: newResident.contactNumber,
        memberships: membershipsString,
        role: "Resident",
        hasAccount: false, // new residents have NO account by default
        username: "",
        password: "",
        passwordChangedByUser: false,
      }
    ]);

    // Reset form
    setNewResident({
      firstName: "",
      middleName: "",
      lastName: "",
      contactNumber: "",
      hasMemberships: false,
      selectedMemberships: [],
    });
    setFormErrors({});
    setShowAddForm(false);
  };

  // ✅ EDIT FORM STATE
  const [editingResident, setEditingResident] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    hasMemberships: false,
    selectedMemberships: [] as string[],
    hasAccount: false,
    username: "",
    password: "",
    role: "Resident",
    passwordChangedByUser: false,
  });

  // ✅ EDIT FORM VALIDATION
  const validateEditForm = () => {
    const errors: Record<string, string> = {};

    if (!editingResident.firstName.trim()) errors.firstName = "First name is required";
    if (!editingResident.lastName.trim()) errors.lastName = "Last name is required";

    const rawDigits = editingResident.contactNumber.replace(/\D/g, "");
    if (!rawDigits) {
      errors.contactNumber = "Contact number is required";
    } else if (rawDigits.length !== 11) {
      errors.contactNumber = "Must be exactly 11 digits";
    }

    // If creating account → password required
    if (!editingResident.hasAccount && editingResident.password.trim()) {
      // creating account now
    }
    if (editingResident.hasAccount && !editingResident.passwordChangedByUser && !editingResident.password.trim()) {
      errors.password = "Password is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ✅ UPDATE RESIDENT
  const handleUpdateResident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord || !validateEditForm()) return;

    const updatedMemberships = editingResident.hasMemberships
      ? editingResident.selectedMemberships.join(", ")
      : "";

    setResidentsData((prev) => prev.map((resident) =>
      resident.id === editRecord
        ? {
            ...resident,
            firstName: editingResident.firstName,
            middleName: editingResident.middleName,
            lastName: editingResident.lastName,
            contactNumber: editingResident.contactNumber,
            memberships: updatedMemberships,
            // ✅ IF USER CHANGED PASSWORD → KEEP ORIGINAL ROLE, DO NOT UPDATE
            role: resident.passwordChangedByUser ? resident.role : editingResident.role,
            // ✅ If creating account now → set username = ID
            hasAccount: editingResident.hasAccount,
            username: editingResident.hasAccount ? resident.username || resident.id : "",
            password: resident.passwordChangedByUser
              ? resident.password
              : editingResident.password,
            passwordChangedByUser: resident.passwordChangedByUser,
          }
        : resident
    ));

    setEditRecord(null);
    setFormErrors({});
  };

  const handleDeleteResident = () => {
    if (!deleteRecord) return;
    setResidentsData((prev) => prev.filter((resident) => resident.id !== deleteRecord));
    setDeleteRecord(null);
  };

  // ✅ SEARCH + FILTER LOGIC
  const filteredResidents = useMemo(() => {
    let result = residentsData;

    if (residentFilter === "residents") result = result.filter(r => r.role === "Resident");
    if (residentFilter === "staff") result = result.filter(r => r.role === "Staff");
    if (residentFilter === "with-account") result = result.filter(r => r.hasAccount);
    if (residentFilter === "no-account") result = result.filter(r => !r.hasAccount);

    if (residentSearch.trim()) {
      const q = residentSearch.toLowerCase();
      result = result.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        r.firstName.toLowerCase().includes(q) ||
        r.middleName.toLowerCase().includes(q) ||
        r.contactNumber.toLowerCase().includes(q) ||
        r.memberships.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
      );
    }
    return result;
  }, [residentsData, residentFilter, residentSearch]);

  // ✅ PAGINATION
  const totalPages = useMemo(() => Math.ceil(filteredResidents.length / itemsPerPage), [filteredResidents]);
  const paginatedResidents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredResidents.slice(start, start + itemsPerPage);
  }, [filteredResidents, currentPage, itemsPerPage]);

  useMemo(() => setCurrentPage(1), [residentSearch, residentFilter]);

  // ✅ HIGHLIGHT TEXT FUNCTION
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
      const parts = text.split(regex);
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
        ) : part
      );
    } catch { return text; }
  };

  // ✅ Helper: get badge color for memberships
  const getMembershipBadgeStyle = (name: string) => {
    const colors = [
      "bg-teal-50 text-teal-800",
      "bg-orange-50 text-orange-800",
      "bg-blue-50 text-blue-800",
      "bg-purple-50 text-purple-800",
      "bg-amber-50 text-amber-800",
      "bg-emerald-50 text-emerald-800"
    ];
    const index = name.length % colors.length;
    return colors[index];
  };

  // ✅ Handle membership checkbox change
  const handleMembershipChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const value = e.target.value;
    if (isEdit) {
      setEditingResident(prev => {
        const updated = prev.selectedMemberships.includes(value)
          ? prev.selectedMemberships.filter(m => m !== value)
          : [...prev.selectedMemberships, value];
        return { ...prev, selectedMemberships: updated };
      });
    } else {
      setNewResident(prev => {
        const updated = prev.selectedMemberships.includes(value)
          ? prev.selectedMemberships.filter(m => m !== value)
          : [...prev.selectedMemberships, value];
        return { ...prev, selectedMemberships: updated };
      });
    }
  };

  // ✅ --- NEW FEATURE: CHANGE DETECTION & UNSAVED CHANGES PROMPT ---
  const [initialEditData, setInitialEditData] = useState<any>(null);
  const [initialAddData, setInitialAddData] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<"edit" | "add" | null>(null);

  // ✅ Detect changes
  const hasEditChanges = useMemo(() => {
    if (!initialEditData) return false;
    return JSON.stringify(initialEditData) !== JSON.stringify(editingResident);
  }, [initialEditData, editingResident]);

  const hasAddChanges = useMemo(() => {
    if (!initialAddData) return false;
    return JSON.stringify(initialAddData) !== JSON.stringify(newResident);
  }, [initialAddData, newResident]);

  // ✅ Updated: Load Edit Data + save initial state
  useEffect(() => {
    if (!editRecord) {
      setInitialEditData(null);
      return;
    }
    const resident = residentsData.find(r => r.id === editRecord);
    if (!resident) return;
    const initialState = {
      firstName: resident.firstName,
      middleName: resident.middleName,
      lastName: resident.lastName,
      contactNumber: resident.contactNumber,
      hasMemberships: resident.memberships.trim().length > 0,
      selectedMemberships: resident.memberships
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      hasAccount: resident.hasAccount,
      username: resident.username,
      password: resident.password,
      role: resident.role,
      passwordChangedByUser: resident.passwordChangedByUser,
    };
    setEditingResident(initialState);
    setInitialEditData(JSON.parse(JSON.stringify(initialState)));
  }, [editRecord, residentsData]);

  // ✅ Open Add Form & save initial state
  const handleOpenAddForm = () => {
    const emptyState = {
      firstName: "",
      middleName: "",
      lastName: "",
      contactNumber: "",
      hasMemberships: false,
      selectedMemberships: [] as string[],
    };
    setNewResident(emptyState);
    setInitialAddData(JSON.parse(JSON.stringify(emptyState)));
    setShowAddForm(true);
  };

  // ✅ Cancel handlers
  const handleCancelEdit = () => {
    if (hasEditChanges) {
      setShowCancelConfirm("edit");
    } else {
      setEditRecord(null);
      setFormErrors({});
    }
  };

  const handleCancelAdd = () => {
    if (hasAddChanges) {
      setShowCancelConfirm("add");
    } else {
      setShowAddForm(false);
      setFormErrors({});
    }
  };
  // ✅ --- END NEW FEATURE ---

  return (
    <div className="space-y-6">
      {/* ✅ HEADER + SEARCH BAR SECTION */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-[1200px]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-black text-[#005f63]">Residents Master List</h1>
              <p className="text-sm text-[#667777] mt-1">
                Manage all registered residents, staff, and their account status.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 w-[1580px]">
            <div className="flex-1">
              <SearchBar
                value={residentSearch}
                onChange={setResidentSearch}
                placeholder="Search by ID, name, contact, role or membership..."
              />
            </div>

            {/* ✅ FILTER DROPDOWN */}
            <div className="relative">
              <select
                value={residentFilter}
                onChange={(e) => setResidentFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Records</option>
                <option value="residents">Residents</option>
                <option value="staff">Staff</option>
                <option value="with-account">Has Account</option>
                <option value="no-account">No Account</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredResidents.length} of {residentsData.length} record(s) match — showing {itemsPerPage} per page.
          </p>
        </div>
      </div>

      {/* ✅ TABLE SECTION - BUTTON AT TOP RIGHT */}
      <div className="pl-1">
        <div className="flex justify-end mb-3">
          <button
            onClick={handleOpenAddForm}
            className="bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm"
          >
            + Add New Resident
          </button>
        </div>

        {/* ✅ UPDATED: Container with gradient border + rounded corners like your image */}
        <div className="relative rounded-[20px] bg-white shadow-lg overflow-hidden">
          {/* Gradient top border — your exact colors */}
          <div className="h-1 w-full bg-gradient-to-r from-[#3d9085] via-[#FFC107] to-[#00897B] absolute top-0 left-0 right-0"></div>

          {/* Inner content with padding */}
          <div className="p-5 pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eee8e0]">
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">ID</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Last Name</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">First Name</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Middle Name</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Contact Number</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Memberships</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Role</th>
                  <th className="text-left py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Has Account?</th>
                  <th className="text-right py-3 px-2 font-bold text-[#005f63] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResidents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-gray-500 italic">
                      No records match your search or filter.
                    </td>
                  </tr>
                ) : (
                  paginatedResidents.map((r) => {
                    const allMemberships = r.memberships ? r.memberships.split(",").map(m => m.trim()).filter(Boolean) : [];
                    const visibleMemberships = allMemberships.slice(0, 2);
                    const remainingCount = allMemberships.length - 2;

                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[#eee8e0] transition-all duration-200
                                  hover:bg-teal-50/100 hover:shadow-md hover:rounded-lg"
                      >
                        <td className="py-3 px-2 font-mono text-gray-700">{highlightText(r.id, residentSearch)}</td>
                        <td className="py-3 px-2 font-medium text-gray-800">{highlightText(r.lastName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-700">{highlightText(r.firstName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-700">{highlightText(r.middleName, residentSearch)}</td>
                        <td className="py-3 px-2 text-gray-600">{highlightText(r.contactNumber, residentSearch)}</td>

                        {/* ✅ MEMBERSHIPS — SHOW ONLY 2 + "+X MORE" */}
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {visibleMemberships.map((mName, idx) => (
                              <span
                                key={idx}
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(mName)}`}
                              >
                                {highlightText(mName, residentSearch)}
                              </span>
                            ))}
                            {remainingCount > 0 && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                +{remainingCount} more
                              </span>
                            )}
                            {allMemberships.length === 0 && <span className="text-gray-400 text-xs">None</span>}
                          </div>
                        </td>

                        {/* ✅ ROLE — BADGE STYLE */}
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            r.role === "Staff" ? "bg-orange-100 text-orange-800" : "bg-teal-50 text-teal-800"
                          }`}>
                            {highlightText(r.role, residentSearch)}
                            {r.passwordChangedByUser && <span className="ml-1 text-yellow-600 text-[10px] font-bold"></span>}
                          </span>
                        </td>

                        {/* ✅ HAS ACCOUNT — BADGE STYLE */}
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            r.hasAccount ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {r.hasAccount ? "✅ Yes" : "❌ No"}
                          </span>
                        </td>

                        {/* ✅ ACTIONS */}
                        <td className="py-3 px-2 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => setViewRecord(r.id)} className="p-2 rounded-full hover:bg-teal-50 transition" title="View">
                              <svg width="16" height="16" fill="none" stroke="#006666" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            <button onClick={() => setEditRecord(r.id)} className="p-2 rounded-full hover:bg-orange-50 transition" title="Edit">
                              <svg width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button onClick={() => setDeleteRecord(r.id)} className="p-2 rounded-full hover:bg-red-50 transition" title="Delete">
                              <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ✅ VIEW RECORD MODAL — POPUP */}
        {viewRecord && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Record Details</h2>
                <button onClick={() => setViewRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              {(() => {
                const r = residentsData.find(x => x.id === viewRecord)!;
                const allMemberships = r.memberships ? r.memberships.split(",").map(m => m.trim()).filter(Boolean) : [];
                return (
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <p className="mb-2"><strong className="text-[#005f63]">ID:</strong> {r.id}</p>
                      <p className="mb-2"><strong className="text-[#005f63]">Full Name:</strong> {r.lastName}, {r.firstName} {r.middleName}</p>
                      <p className="mb-2"><strong className="text-[#005f63]">Contact:</strong> {r.contactNumber}</p>
                      <p className="mb-2"><strong className="text-[#005f63]">Role:</strong> {r.role} {r.passwordChangedByUser && <span className="text-yellow-600 font-bold">(Locked)</span>}</p>
                      <p className="mb-2"><strong className="text-[#005f63]">Has Account:</strong> {r.hasAccount ? "Yes" : "No"}</p>
                      {r.hasAccount && (
                        <>
                          <p className="mb-2"><strong className="text-[#005f63]">Username:</strong> {r.username}</p>
                          <p className="mb-2">
                            <strong className="text-[#005f63]">Password:</strong>{" "}
                            {r.passwordChangedByUser ? "•••••••• (changed by user — hidden)" : r.password}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <strong className="text-[#005f63] block mb-2">Memberships:</strong>
                      <div className="flex flex-wrap gap-1.5">
                        {allMemberships.length > 0 ? allMemberships.map((m, i) => (
                          <span key={i} className={`px-2 py-1 rounded-full text-xs font-medium ${getMembershipBadgeStyle(m)}`}>
                            {m}
                          </span>
                        )) : <span className="text-gray-500">None</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ✅ EDIT MODAL — "Create Account" if no account yet — AUTO-FILL USERNAME WITH ACTUAL ID — ROLE LOCKED IF USER CHANGED PASSWORD */}
        {editRecord && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Edit Resident / Staff</h2>
                <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>

              <form onSubmit={handleUpdateResident} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={editingResident.firstName}
                      onChange={(e) => setEditingResident(prev => ({
                        ...prev,
                        firstName: capitalizeName(e.target.value)
                      }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors.firstName ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors.firstName && <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={editingResident.middleName}
                      onChange={(e) => setEditingResident(prev => ({
                        ...prev,
                        middleName: capitalizeName(e.target.value)
                      }))}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={editingResident.lastName}
                      onChange={(e) => setEditingResident(prev => ({
                        ...prev,
                        lastName: capitalizeName(e.target.value)
                      }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors.lastName ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors.lastName && <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                  <input
                    type="text"
                    required
                    value={editingResident.contactNumber}
                    onChange={(e) => setEditingResident(prev => ({
                      ...prev,
                      contactNumber: formatContactNumber(e.target.value)
                    }))}
                    className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                      formErrors.contactNumber ? "border-red-500" : "border-gray-200"
                    }`}
                    placeholder="09XX-XXX-XXXX"
                  />
                  {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
                </div>

                <div className="border-t border-b py-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingResident.hasMemberships}
                      onChange={(e) => setEditingResident(prev => ({ ...prev, hasMemberships: e.target.checked }))}
                      className="w-4 h-4 text-[#005f63]"
                    />
                    <span className="font-medium text-gray-700">Has Memberships?</span>
                  </label>
                  {editingResident.hasMemberships && (
                    <div className="mt-3 pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            value={mem}
                            checked={editingResident.selectedMemberships.includes(mem)}
                            onChange={(e) => handleMembershipChange(e, true)}
                            className="w-4 h-4 text-[#005f63]"
                          />
                          <span>{mem}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* ✅ ACCOUNT SECTION: "Create Account" if no account yet — AUTO-FILL USERNAME WITH ACTUAL ID — ROLE LOCKED */}
                <div className="border-b pb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingResident.hasAccount}
                      onChange={(e) => setEditingResident(prev => ({ ...prev, hasAccount: e.target.checked }))}
                      className="w-4 h-4 text-[#005f63]"
                      disabled={editingResident.hasAccount && editingResident.username !== ""}
                    />
                    <span className="font-medium text-gray-700">
                      {editingResident.hasAccount ? "Has Account" : "Create Account"}
                    </span>
                  </label>

                  {editingResident.hasAccount && (
                    <div className="mt-3 pl-6 space-y-3">
                      {/* ✅ Username — AUTO-FILLED WITH ACTUAL ID, fixed, cannot edit */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input
                          type="text"
                          value={editingResident.username || editRecord}
                          readOnly
                          className="w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2.5 text-gray-600"
                        />
                        <p className="text-xs text-gray-500 mt-1">* Username is automatically set to ID and cannot be changed</p>
                      </div>

                      {/* ✅ Password — editable only if NOT changed by user */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                        <input
                          type="text"
                          value={editingResident.passwordChangedByUser ? "••••••••" : editingResident.password}
                          onChange={(e) => !editingResident.passwordChangedByUser && setEditingResident(prev => ({ ...prev, password: e.target.value }))}
                          readOnly={editingResident.passwordChangedByUser}
                          className={`w-full rounded-full border px-4 py-2.5 ${
                            editingResident.passwordChangedByUser
                              ? "bg-gray-100 text-gray-500 border-gray-200"
                              : "border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                          }`}
                          placeholder={!editingResident.passwordChangedByUser ? "Enter temporary password" : ""}
                        />
                        {editingResident.passwordChangedByUser ? (
                          <p className="text-xs text-gray-500 mt-1">* Password already changed by user — cannot view or edit</p>
                        ) : (
                          formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                        )}
                      </div>

                      {/* ✅ ROLE — LOCKED / DISABLED IF USER CHANGED PASSWORD */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                        <select
                          required={editingResident.hasAccount}
                          value={editingResident.role}
                          onChange={(e) => setEditingResident(prev => ({ ...prev, role: e.target.value }))}
                          disabled={editingResident.passwordChangedByUser}
                          className={`w-full rounded-full border px-4 py-2.5 focus:outline-none ${
                            editingResident.passwordChangedByUser
                              ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed"
                              : "border-gray-200 focus:ring-2 focus:ring-[#005f63]/30"
                          }`}
                        >
                          <option value="Resident">Resident</option>
                          <option value="Staff">Staff</option>
                        </select>
                        {editingResident.passwordChangedByUser && (
                          <p className="text-xs text-[#44a5a2] mt-1 font-medium">Locked: User already changed password — role cannot be modified</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!hasEditChanges}
                    className={`px-5 py-2.5 rounded-full transition ${
                      hasEditChanges
                        ? "bg-[#005f63] text-white hover:bg-[#004d4d]"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ✅ DELETE CONFIRM MODAL */}
        {deleteRecord && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[30px] w-full max-w-lg p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xl font-black text-[#b91c1c]">Confirm Delete</p>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
                <button onClick={() => setDeleteRecord(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>
              <p className="text-sm text-gray-700 mb-5">
                Are you sure you want to delete record <strong>{deleteRecord}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteRecord(null)}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteResident}
                  className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ ADD NEW RESIDENT FORM — NO CREATE ACCOUNT SECTION */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-[#005f63]">Add New Resident / Staff</h2>
                <button onClick={handleCancelAdd} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button>
              </div>

              <form onSubmit={handleAddResident} className="space-y-4">
                {/* ✅ NAME FIELDS WITH AUTO-CAPITALIZATION */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={newResident.firstName}
                      onChange={(e) => setNewResident(prev => ({
                        ...prev,
                        firstName: capitalizeName(e.target.value)
                      }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors.firstName ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors.firstName && <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={newResident.middleName}
                      onChange={(e) => setNewResident(prev => ({
                        ...prev,
                        middleName: capitalizeName(e.target.value)
                      }))}
                      className="w-full rounded-full border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={newResident.lastName}
                      onChange={(e) => setNewResident(prev => ({
                        ...prev,
                        lastName: capitalizeName(e.target.value)
                      }))}
                      className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                        formErrors.lastName ? "border-red-500" : "border-gray-200"
                      }`}
                    />
                    {formErrors.lastName && <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>}
                  </div>
                </div>

                {/* ✅ CONTACT NUMBER - 11 DIGITS ONLY, AUTO-FORMAT */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                  <input
                    type="text"
                    required
                    value={newResident.contactNumber}
                    onChange={(e) => setNewResident(prev => ({
                      ...prev,
                      contactNumber: formatContactNumber(e.target.value)
                    }))}
                    className={`w-full rounded-full border px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 ${
                      formErrors.contactNumber ? "border-red-500" : "border-gray-200"
                    }`}
                    placeholder="09XX-XXX-XXXX"
                  />
                  {formErrors.contactNumber && <p className="text-red-500 text-xs mt-1">{formErrors.contactNumber}</p>}
                </div>

                {/* ✅ HAS MEMBERSHIPS ONLY — NO ACCOUNT OPTION */}
                <div className="border-t border-b py-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newResident.hasMemberships}
                      onChange={(e) => setNewResident(prev => ({...prev, hasMemberships: e.target.checked}))}
                      className="w-4 h-4 text-[#005f63]"
                    />
                    <span className="font-medium text-gray-700">Has Memberships?</span>
                  </label>

                  {newResident.hasMemberships && (
                    <div className="mt-3 pl-6 grid grid-cols-2 gap-2">
                      {availableMemberships.map((mem, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            value={mem}
                            checked={newResident.selectedMemberships.includes(mem)}
                            onChange={handleMembershipChange}
                            className="w-4 h-4 text-[#005f63]"
                          />
                          <span>{mem}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelAdd}
                    className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!hasAddChanges}
                    className={`px-5 py-2.5 rounded-full transition ${
                      hasAddChanges
                        ? "bg-[#005f63] text-white hover:bg-[#004d4d]"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Save Record
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

                {/* ✅ UNSAVED CHANGES CONFIRMATION */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
            <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Discard changes?</h3>
              <p className="text-sm text-gray-600 mb-6">
                You have unsaved changes. If you leave now, your changes will be lost.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelConfirm(null)}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                >
                  Keep Editing
                </button>
                <button
                  onClick={() => {
                    setShowCancelConfirm(null);
                    if (showCancelConfirm === "edit") {
                      setEditRecord(null);
                      setFormErrors({});
                    } else {
                      setShowAddForm(false);
                      setFormErrors({});
                    }
                  }}
                  className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ PAGINATION */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                  currentPage === i + 1
                    ? "bg-[#005f63] text-white shadow-sm"
                    : "bg-white border text-[#005f63] hover:bg-orange-50"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
            >
              Next
            </button>

            <span className="text-xs text-gray-600 ml-1.5">
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Memberships / QR Codes ---------------- */
function QRCodesView({ memberships, highlightText }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return memberships;
    const q = searchQuery.toLowerCase();
    return memberships.filter((m: any) =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.codeId?.toLowerCase().includes(q) ||
      m.note?.toLowerCase().includes(q)
    );
  }, [memberships, searchQuery]);

  const totalPages = useMemo(() => Math.ceil(filteredMemberships.length / itemsPerPage), [filteredMemberships, itemsPerPage]);
  const paginatedMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  useMemo(() => setCurrentPage(1), [searchQuery]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div>
          <h1 className="text-4xl font-black text-[#005f63]">Memberships & QR Codes</h1>
          <p className="text-sm text-[#667777] mt-1">Each membership type has a unique QR — manage and assign here.</p>
          <div className="mt-4">
            <Input value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)} placeholder="Search memberships by name, ID or description…" />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredMemberships.length} of {memberships.length} membership(s) match.
          </p>
        </div>
      </div>

      <div className="pl-1">
        {filteredMemberships.length === 0 ? (
          <p className="text-gray-500 italic">No memberships match your search.</p>
        ) : (
          <>
            <div className="flex flex-row flex-wrap gap-5">
              {paginatedMemberships.map((m: any) => (
                <div key={m.id} className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300">
                  <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#006666]">{highlightText(m.name, searchQuery)}</h2>
                        <p className="text-sm text-[#667777] mt-1">{highlightText(m.description, searchQuery)}</p>
                      </div>
                      {m.verified && (
                        <span className="bg-[#2cb7b7] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M20 6L9 17l-5-5" />
                          </svg> Verified
                        </span>
                                              )}
                    </div>

                    <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 items-start">
                      <div className="row-span-3 flex flex-col items-center gap-3">
                        <FakeQR seed={m.codeId || m.id} large />
                        <span className="text-xs font-mono font-bold text-gray-600">{highlightText(m.codeId || m.id, searchQuery)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Type</p>
                          <p className="font-medium text-gray-800 mt-0.5">{m.type || "Standard"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Validity</p>
                          <p className="font-medium text-gray-800 mt-0.5">{m.validity || "1 Year"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Members</p>
                          <p className="font-medium text-gray-800 mt-0.5">{m.memberIds.length} resident(s)</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${m.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {m.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</p>
                        <p className="text-sm text-gray-600 mt-0.5">{highlightText(m.note || "—", searchQuery)}</p>
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-700 hover:bg-teal-50">
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="border-orange-500/30 text-orange-700 hover:bg-orange-50">
                          <Users className="mr-1 h-3.5 w-3.5" /> Assign Residents
                        </Button>
                        <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-700 hover:bg-blue-50">
                          <Download className="mr-1 h-3.5 w-3.5" /> Export QR
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  ←
                </Button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <Button
                    key={i}
                    variant={currentPage === i + 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(i + 1)}
                    className={`h-8 w-8 p-0 ${currentPage === i + 1 ? "bg-[#005f63] hover:bg-[#004a4d]" : ""}`}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}



// ─── EVENTS & ATTENDANCE ───────────────────────────────────────────
interface MyEvent {
  id: number | string;
  title: string;
  date: string;
  location: string;
  description: string;
  membershipId?: string;
  membershipName?: string;
}

interface EventsViewProps {
  allEvents: MyEvent[];
  upcomingEvents: MyEvent[];
  pastEvents: MyEvent[];
  onDeleteEvent: (id: number | string) => void;
  highlightText: (text: string, query: string) => React.ReactNode;
  residents?: any[];
  memberships?: any[];
  attendanceRecords?: any[];
}

// ✅ Mock Data
const mockResidents = [
  { id: "res1", name: "Juan Dela Cruz", membershipIds: ["mem1"] },
  { id: "res2", name: "Maria Santos", membershipIds: ["mem1", "mem2"] },
  { id: "res3", name: "Roberto Reyes", membershipIds: ["mem2"] },
  { id: "res4", name: "Ana Garcia", membershipIds: ["mem3"] },
  { id: "res5", name: "Luis Torres", membershipIds: [] }, // No membership
  { id: "res6", name: "Elena Cruz", membershipIds: ["mem1", "mem3"] },
];

const mockMemberships = [
  { id: "mem1", name: "Women's Club" },
  { id: "mem2", name: "Youth Organization" },
  { id: "mem3", name: "Senior Citizens Group" },
];

const mockAttendanceRecords = [
  // Event 1 records
  { eventId: "EVT-1", residentId: "res1", timeIn: "08:05 AM", timeOut: "11:30 AM" }, // Complete
  { eventId: "EVT-1", residentId: "res2", timeIn: "08:15 AM", timeOut: "" }, // Incomplete
  { eventId: "EVT-1", residentId: "res6", timeIn: "", timeOut: "11:00 AM" }, // Incomplete
  // Event 2 records
  { eventId: "EVT-2", residentId: "res3", timeIn: "09:00 AM", timeOut: "01:00 PM" }, // Complete
  { eventId: "EVT-2", residentId: "res2", timeIn: "09:10 AM", timeOut: "" }, // Incomplete
  // Event 3 records
  { eventId: "EVT-3", residentId: "res4", timeIn: "07:45 AM", timeOut: "04:15 PM" }, // Complete
  { eventId: "EVT-3", residentId: "res5", timeIn: "", timeOut: "" }, // Missed
];

// ✅ Named export — NO duplicate default
export function EventsView({
  allEvents,
  upcomingEvents,
  pastEvents,
  onDeleteEvent,
  highlightText,
  residents = mockResidents,
  memberships = mockMemberships,
  attendanceRecords = mockAttendanceRecords,
}: EventsViewProps) {
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [viewEv, setViewEv] = useState<MyEvent | null>(null);
  const [showAttendance, setShowAttendance] = useState<MyEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<number | string | null>(null); // for delete confirmation

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    description: "",
    membershipId: "",
  });

  // ✅ Attendance search & filter state
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("all");

  // ✅ Custom highlight function with YELLOW background
  const highlightAttendanceText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={i} className="bg-yellow-300 text-black rounded-sm px-0.5">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // 1. Filter the events
  const filteredEvents = useMemo(() => {
    let result = allEvents;

    if (eventFilter === "upcoming") {
      result = upcomingEvents;
    } else if (eventFilter === "past") {
      result = pastEvents;
    }

    if (eventSearch.trim()) {
      const q = eventSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.date.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    // SORT: NEWEST / LATEST DATE FIRST
    result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }, [allEvents, upcomingEvents, pastEvents, eventFilter, eventSearch]);

  // 2. Group the events by date — SAME AS MEMBER PAGE
  const groupedEvents = useMemo(() => {
    const groups: Record<string, MyEvent[]> = {};
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    filteredEvents.forEach((e) => {
      const eventDate = new Date(e.date);
      const dateOnly = e.date.split(" ")[0];

      let sectionKey: string;

      if (eventFilter === "all") {
        if (eventDate >= today && eventDate <= oneWeekFromNow) {
          sectionKey = "📅 This Week";
        } else {
          sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }
      } else {
        sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      if (!groups[sectionKey]) groups[sectionKey] = [];
      groups[sectionKey].push(e);
    });

    const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === "📅 This Week") return -1;
      if (keyB === "📅 This Week") return 1;
      return new Date(keyB).getTime() - new Date(keyA).getTime();
    });

    return Object.fromEntries(sortedGroups);
  }, [filteredEvents, eventFilter]);

  // ─── CREATE EVENT ───────────────────────────────────────────
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const fullDate = `${newEvent.date} ${newEvent.time}`;
    const membershipName = newEvent.membershipId
      ? memberships.find((m: any) => m.id === newEvent.membershipId)?.name
      : "Open Event (All Residents)";

    const eventToAdd: MyEvent = {
      id: `EVT-${Date.now()}`,
      title: newEvent.title,
      date: fullDate,
      location: newEvent.location,
      description: newEvent.description,
      membershipId: newEvent.membershipId || "",
      membershipName: membershipName,
    };

    if (new Date(fullDate) >= new Date()) {
      upcomingEvents.unshift(eventToAdd);
    } else {
      pastEvents.unshift(eventToAdd);
    }
    allEvents.unshift(eventToAdd);

    // reset form
    setNewEvent({ title: "", date: "", time: "", location: "", description: "", membershipId: "" });
  };

  // ─── DELETE CONFIRMATION HANDLERS ─────────────────────────────
  const confirmDelete = () => {
    if (eventToDelete !== null) {
      onDeleteEvent(eventToDelete);
      setEventToDelete(null);
    }
  };

  const cancelDelete = () => {
    setEventToDelete(null);
  };

  // ─── GET MEMBERS BELONGING TO SELECTED MEMBERSHIP ────────────
  const getMembersForEvent = (event: MyEvent) => {
    if (!event.membershipId) {
      // Open Event → all residents
      return residents;
    }
    // Only residents with this membershipId (supports single or multiple memberships)
    return residents.filter((r: any) =>
      Array.isArray(r.membershipIds)
        ? r.membershipIds.includes(event.membershipId)
        : r.membershipId === event.membershipId
    );
  };

  // ─── GET FULL ATTENDANCE LIST: ALL ELIGIBLE MEMBERS ────────────
  const getFullAttendanceList = (eventId: string | number, eligibleMembers: any[]) => {
    const recordsForEvent = attendanceRecords.filter((a: any) => a.eventId === eventId);

    return eligibleMembers.map((member: any) => {
      const record = recordsForEvent.find((r: any) => r.residentId === member.id);
      return {
        residentId: member.id,
        residentName: member.name,
        timeIn: record?.timeIn || "",
        timeOut: record?.timeOut || "",
      };
    });
  };

  // ─── GET ATTENDANCE STATUS — MATCH MEMBER PAGE COLORS ────────────
  const getAttendanceStatus = (record: any) => {
    if (record.timeIn && record.timeOut) {
      return { label: "Complete" };
    } else if (record.timeIn || record.timeOut) {
      return { label: "Incomplete" };
    } else {
      return { label: "Missed" };
    }
  };

  // ✅ Filter & search attendance records
  const getFilteredAttendance = (fullList: any[]) => {
    return fullList.filter((record) => {
      const matchesSearch = record.residentName.toLowerCase().includes(attendanceSearch.toLowerCase());
      const status = getAttendanceStatus(record).label.toLowerCase();
      const matchesStatus = attendanceStatusFilter === "all" || status === attendanceStatusFilter;
      return matchesSearch && matchesStatus;
    });
  };

  return (
    <div className="space-y-6">
      {/* ✅ HEADER, SEARCH & FILTER */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <h1 className="text-4xl font-black text-[#005f63]">Events & Attendance</h1>
          <p className="mt-1 text-sm text-[#667777]">Filter and view all, upcoming, and past events.</p>

          <div className="mt-4 flex items-center gap-4 w-full">
            <div className="flex-1">
              <SearchBar
                value={eventSearch}
                onChange={setEventSearch}
                placeholder="Search events by title, date, location or description..."
              />
            </div>

            <div className="relative">
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Events</option>
                <option value="upcoming">Upcoming Events</option>
                <option value="past">Past Events</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {allEvents.length} event(s) match
          </p>
        </div>
      </div>

      {/* ✅ NEW LAYOUT: 50% LEFT FIXED FORM | 50% RIGHT SCROLLABLE EVENTS */}
      <div className="flex gap-6 items-start px-1 w-full h-[calc(100vh-180px)]">
        {/* ✅ LEFT SIDE: CREATE EVENT FORM — FIXED / NOT SCROLLABLE */}
        <div className="w-1/2 h-100%">
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-md h-full overflow-hidden">
            <h2 className="text-xl font-bold text-[#005f63] mb-4">Create New Event</h2>

            <form onSubmit={handleCreateEvent} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Members</label>
                <select
                  value={newEvent.membershipId}
                  onChange={(e) => setNewEvent({ ...newEvent, membershipId: e.target.value })}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                >
                  <option value="">📢 Open Event (All residents)</option>
                  {memberships.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      🎯 {m.name}
                    </option>
                  ))}
                </select>
                {/* ✅ DYNAMIC TEXT CHANGES BASED ON SELECTED OPTION */}
                <p className="text-xs text-gray-500 mt-1">
                  {newEvent.membershipId
                    ? `* Only members of "${memberships.find((m) => m.id === newEvent.membershipId)?.name || "this group"}" will be included`
                    : "* All registered residents will be included"}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-full bg-[#3c9b9e] text-white font-bold hover:bg-[#2a6b6b] transition"
                >
                  Post Event
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ✅ RIGHT SIDE: EVENTS LIST — SCROLLABLE ONLY */}
        <div className="w-1/2 h-full overflow-y-auto pr-2">
          {filteredEvents.length === 0 ? (
            <p className="text-gray-500 italic">No events match your search or filter.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
                <div key={dateLabel}>
                  <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">{dateLabel}</h3>
                  <div className="grid gap-5 md:grid-cols-1">
                    {eventsInGroup.map((e) => {
                      const eligibleMembers = getMembersForEvent(e);
                      const attendanceList = getFullAttendanceList(e.id, eligibleMembers);
                      const signedIn = attendanceList.filter((a: any) => a.timeIn).length;
                      const signedOut = attendanceList.filter((a: any) => a.timeOut).length;

                      return (
                        <div
                          key={e.id}
                          className="relative rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200"
                        >
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            {/* ✅ VIEW ICON — TEAL COLOR */}
                            <button
                              onClick={() => setViewEv(e)}
                              className="rounded-full p-2 text-[#005f63] hover:bg-[#005f63]/10 transition-colors"
                              title="View Details"
                            >
                              <Eye className="h-[18px] w-[18px]" />
                            </button>

                            {/* ✅ DELETE ICON — RED COLOR + CONFIRMATION */}
                            <button
                              onClick={() => setEventToDelete(e.id)}
                              className="p-2 rounded-full hover:bg-red-100 transition"
                              title="Delete"
                            >
                              <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>

                          <h2 className="pr-8 text-lg font-bold text-[#005f63]">{highlightText(e.title, eventSearch)}</h2>
                          <p className="mt-1 text-sm text-gray-500">
                            {highlightText(e.date, eventSearch)} · {highlightText(e.location, eventSearch)}
                          </p>
                          <p className="mt-3 text-[14px] text-gray-700">{highlightText(e.description, eventSearch)}</p>

                          <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500">
                            <span className="inline-block w-2 h-2 rounded-full bg-[#4eb4b8] mr-1"></span> {signedIn} Signed In |{" "}
                            <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span> {signedOut} Signed Out |{" "}
                            <span className="font-medium">{e.membershipName || "Open Event"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ✅ DELETE CONFIRMATION MODAL */}
      {eventToDelete !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">This will be permanently deleted.</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this event? This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={cancelDelete}
                className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ VIEW EVENT DETAILS MODAL */}
      {viewEv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">{viewEv.title}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {viewEv.date} • {viewEv.location}
                </p>
              </div>
              <button onClick={() => setViewEv(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{viewEv.description || "—"}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-teal-50 rounded-xl p-3">
                  <p className="text-xs text-teal-600 font-medium">Membership Type</p>
                  <p className="font-bold text-teal-800">{viewEv.membershipName || "Open Event"}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-xs text-green-600 font-medium">Signed In</p>
                  <p className="font-bold text-green-800">
                    {getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeIn).length}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3">
                  <p className="text-xs text-orange-600 font-medium">Signed Out</p>
                  <p className="font-bold text-orange-800">
                    {getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeOut).length}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAttendance(viewEv)}
                className="w-full bg-[#005f63] hover:bg-[#004a4d] text-white py-2.5 rounded-full font-medium transition"
              >
                View Attendance List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ ATTENDANCE LIST MODAL — LARGE SIZE, NOT FULL SCREEN + SEARCH & FILTER + YELLOW HIGHLIGHT */}
      {showAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-[95%] max-w-5xl h-[65vh] rounded-3xl shadow-2xl overflow-auto relative">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">Attendance — {showAttendance.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{showAttendance.date}</p>
              </div>
              <button onClick={() => setShowAttendance(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-6">
              {/* ✅ FIXED SEARCH BAR & FILTER ABOVE TABLE */}
              <div className="sticky top-0 z-20 bg-white pb-4 mb-4 border-b border-gray-100 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[250px]">
                  <SearchBar
                    value={attendanceSearch}
                    onChange={setAttendanceSearch}
                    placeholder="Search resident name..."
                  />
                </div>
                <div className="relative">
                  <select
                    value={attendanceStatusFilter}
                    onChange={(e) => setAttendanceStatusFilter(e.target.value)}
                    className="h-12 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="complete">Complete</option>
                    <option value="incomplete">Incomplete</option>
                    <option value="missed">Missed</option>
                  </select>
                  <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                  <svg
                    className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="rounded-xl border border-[#ddd5ca] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8f6f2]">
                    <tr>
                      <th className="text-left p-4 font-medium text-[#005f63]">Resident Name</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Time In</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Time Out</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const eligibleMembers = getMembersForEvent(showAttendance);
                      const fullList = getFullAttendanceList(showAttendance.id, eligibleMembers);
                      const filteredList = getFilteredAttendance(fullList);

                      return filteredList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-gray-500 italic">
                            No matching records found.
                          </td>
                        </tr>
                      ) : (
                        filteredList.map((record: any, i: number) => {
                          const status = getAttendanceStatus(record);
                          return (
                            <tr key={i} className="border-t">
                              <td className="p-4">{highlightAttendanceText(record.residentName, attendanceSearch)}</td>
                              <td className="p-4">
                                {record.timeIn ? (
                                  <span className="text-teal-700 flex items-center gap-1">
                                    <LogIn size={12} /> {record.timeIn}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-4">
                                {record.timeOut ? (
                                  <span className="text-orange-700 flex items-center gap-1">
                                    <LogOut size={12} /> {record.timeOut}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-4">
                                <span
                                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                    status.label === "Complete"
                                      ? "bg-teal-100 text-teal-800"
                                      : status.label === "Incomplete"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {status.label.charAt(0).toUpperCase() + status.label.slice(1)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



/* ---------------- Notifications ---------------- */
function NotificationsView({ notifications }: any) {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((n: any) => !n.read);
    if (filter === "alerts") return items.filter((n: any) => n.type === "alert");
    if (filter === "info") return items.filter((n: any) => n.type === "info");
    return items;
  }, [items, filter]);

  const markAllRead = () => setItems((prev: any[]) => prev.map((n: any) => ({ ...n, read: true })));
  const markRead = (id: string) => setItems((prev: any[]) => prev.map((n: any) => n.id === id ? { ...n, read: true } : n));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#005f63]">Notifications & Announcements</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead}>Mark all as read</Button>
          <Button className="bg-orange-500 text-white hover:bg-orange-600" size="sm">New Announcement</Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          { key: "all", label: `All (${items.length})` },
          { key: "unread", label: `Unread (${items.filter((n: any) => !n.read).length})` },
          { key: "alerts", label: "Alerts" },
          { key: "info", label: "Info" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${filter === f.key ? "border-[#005f63] text-[#005f63]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          No notifications here.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n: any) => (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              className={`rounded-lg border p-4 transition-all cursor-pointer hover:shadow ${n.read ? "bg-white border-gray-200" : "bg-teal-50/50 border-teal-200"}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === "alert" ? "bg-red-500" : "bg-teal-500"}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${n.read ? "text-gray-800" : "text-[#005f63]"}`}>{n.title}</h3>
                    <span className="text-xs text-gray-500">{n.date}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{n.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsView({ member }: any) {
  const [form, setForm] = useState(member);
  const [activeSec, setActiveSec] = useState("account");

  const sections = [
    { key: "account", label: "Account Settings" },
    { key: "system", label: "System Preferences" },
        { key: "notif", label: "Notification Settings" },
    { key: "security", label: "Security & Access" },
  ];

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <div className="space-y-1">
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setActiveSec(sec.key)}
            className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${
              activeSec === sec.key
                ? "bg-[#005f63] text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        {activeSec === "account" && (
          <div className="space-y-5 max-w-lg">
            <h3 className="text-xl font-bold text-gray-800">Account Settings</h3>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Full Name</label>
                <Input
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Email Address</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, email: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Contact Number</label>
                <Input
                  value={form.contact}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, contact: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Role / Position</label>
                <Input value={form.role} disabled className="bg-gray-50" />
              </div>
            </div>
            <div className="pt-2">
              <Button className="bg-[#005f63] hover:bg-[#004a4d] text-white">Save Changes</Button>
            </div>
          </div>
        )}

        {activeSec === "system" && (
          <div className="space-y-5 max-w-lg">
            <h3 className="text-xl font-bold text-gray-800">System Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">Auto-save Data</p>
                  <p className="text-sm text-gray-500">Automatically save changes every 5 minutes</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#005f63]" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">Dark Mode</p>
                  <p className="text-sm text-gray-500">Switch system to dark color theme</p>
                </div>
                <input type="checkbox" className="w-4 h-4 accent-[#005f63]" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">Show Archived Records</p>
                  <p className="text-sm text-gray-500">Include archived residents in lists and search</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#005f63]" />
              </div>
              <div className="pt-2">
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Items per Page</label>
                <select className="w-full rounded-md border border-gray-300 px-3 py-2">
                  <option>10</option>
                  <option>20</option>
                  <option>50</option>
                  <option>100</option>
                </select>
              </div>
            </div>
            <div className="pt-2">
              <Button className="bg-[#005f63] hover:bg-[#004a4d] text-white">Save Preferences</Button>
            </div>
          </div>
        )}

        {activeSec === "notif" && (
          <div className="space-y-5 max-w-lg">
            <h3 className="text-xl font-bold text-gray-800">Notification Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">Email Notifications</p>
                  <p className="text-sm text-gray-500">Receive alerts and updates via email</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#005f63]" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">Event Reminders</p>
                  <p className="text-sm text-gray-500">Get notified before scheduled events</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#005f63]" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-800">System Alerts</p>
                  <p className="text-sm text-gray-500">Critical updates and error notifications</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#005f63]" />
              </div>
            </div>
            <div className="pt-2">
              <Button className="bg-[#005f63] hover:bg-[#004a4d] text-white">Save Notification Settings</Button>
            </div>
          </div>
        )}

        {activeSec === "security" && (
          <div className="space-y-5 max-w-lg">
            <h3 className="text-xl font-bold text-gray-800">Security & Access</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Current Password</label>
                <Input type="password" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">New Password</label>
                <Input type="password" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Confirm New Password</label>
                <Input type="password" />
              </div>
              <div className="pt-2 border-t border-gray-100 mt-4">
                <p className="font-medium text-gray-800 mb-2">Two-Factor Authentication</p>
                <p className="text-sm text-gray-500 mb-3">Add extra security to your account when logging in</p>
                <Button variant="outline" className="border-[#005f63] text-[#005f63] hover:bg-teal-50">Enable 2FA</Button>
              </div>
            </div>
            <div className="pt-2">
              <Button className="bg-[#005f63] hover:bg-[#004a4d] text-white">Update Password</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
