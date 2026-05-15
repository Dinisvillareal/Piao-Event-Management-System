import { useEffect, useMemo, useState } from "react";
import { Filter, MoreVertical, KeyRound, UserPlus, Eye, Pencil, Archive, LayoutDashboard, ScanLine, Users, Award, CalendarDays, Bell, Settings, ChevronLeft, ChevronRight, LogOut, User, Download, PlusCircle, Calendar, MapPin, Trash2 } from "lucide-react";

// --------------------------
// TYPES & MOCK DATA
// --------------------------
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

/* ---------------- Scan ---------------- */
type ScanResult = { ok: boolean; resident: string; sub: string };

function ScanView() {
  const [eventId, setEventId] = useState(events[0].id);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attendance, setAttendance] = useState<Record<string, string[]>>({});

  const ev = events.find((e) => e.id === eventId)!;
  const ms = ev.membershipId ? memberships.find((m) => m.id === ev.membershipId) : null;

  const simulateScan = (residentId: string) => {
    const r = residents.find((x) => x.id === residentId)!;
    if (!ms || ms.memberIds.includes(residentId)) {
      setScan({ ok: true, resident: r.name, sub: ms ? `Verified for ${ms.name}` : "Open event — allowed" });
    } else {
      setScan({ ok: false, resident: r.name, sub: `Not eligible — requires ${ms?.name}` });
    }
  };

  const confirmAttendance = () => {
    if (!scan?.ok) return;
    setAttendance(prev => {
      const list = prev[eventId] ?? [];
      if (list.includes(scan.resident)) return prev;
      return { ...prev, [eventId]: [...list, scan.resident] };
    });
    setScan(null);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>QR Scanner</CardTitle>
          <CardDescription>Scan resident QR codes to record attendance and verify membership.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border-2 border-dashed border-teal-500/50 bg-gradient-to-br from-teal-800/95 to-teal-600/80">
            <div className="absolute inset-6 rounded-lg border-2 border-yellow-400/80" />
            <div className="absolute inset-x-6 top-1/2 h-0.5 animate-pulse bg-orange-500 shadow-[0_0_18px_rgb(249,115,22)]" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
              Camera view · point at QR
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Select Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              {events.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title} {e.membershipId ? `· ${memberships.find(m => m.id === e.membershipId)?.name}` : "· Open"}
                </SelectItem>
              ))}
            </Select>
            <p className="mt-2 text-xs text-gray-500">
              {ms ? `Restricted: only ${ms.name}` : "Open: all residents"}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Simulate Scan</p>
            <div className="flex flex-wrap gap-2">
              {residents.map(r => (
                <Button key={r.id} variant="outline" size="sm" onClick={() => simulateScan(r.id)} className="border-teal-500/30">
                  {r.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Scan Result</CardTitle>
          </CardHeader>
          <CardContent>
            {!scan ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No scan performed yet.
              </div>
            ) : (
              <div className={`rounded-lg border p-4 ${scan.ok ? "border-teal-500/50 bg-teal-50" : "border-red-500/40 bg-red-50"}`}>
                <p className={`text-lg font-bold ${scan.ok ? "text-teal-800" : "text-red-600"}`}>
                  {scan.ok ? `✓ ${scan.resident}` : `✗ Denied — ${scan.resident}`}
                </p>
                <p className="mt-1 text-sm text-gray-600">{scan.sub}</p>
                {scan.ok && (
                  <Button
                    onClick={confirmAttendance}
                    className="mt-3 w-full bg-orange-500 text-white hover:bg-orange-600"
                  >
                    Confirm Attendance
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance List · {ev.title}</CardTitle>
            <CardDescription>Confirmed attendees for this event.</CardDescription>
          </CardHeader>
          <CardContent>
            {(attendance[eventId] ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                No attendees added yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(attendance[eventId] ?? []).map((name, i) => (
                  <li key={name} className="flex items-center justify-between rounded-md bg-teal-50 px-3 py-2">
                    <span>{i + 1}. {name}</span>
                    <span className="text-[11px] text-gray-500">{new Date().toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
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
function ResidentsView() {
  const [archived, setArchived] = useState<string[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return residents;
    const q = search.toLowerCase();
    return residents.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  }, [residents, search]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Residents Master List</CardTitle>
          <CardDescription>Manage all registered residents — add, edit, archive or view profiles.</CardDescription>
        </div>
        <Button className="bg-orange-500 text-white hover:bg-orange-600">
          <UserPlus className="mr-1 h-4 w-4" /> Add New Resident
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search residents by name, ID or address…" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Memberships</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const ms = memberships.filter(m => m.memberIds.includes(r.id));
              const isArchived = archived.includes(r.id);
              return (
                <TableRow key={r.id} className={isArchived ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.age}</TableCell>
                  <TableCell className="text-gray-600">{r.address}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ms.length === 0 && <span className="text-xs text-gray-500">—</span>}
                      {ms.map(m => (
                        <Badge key={m.id} className="border-0 bg-teal-50 text-teal-800">{m.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isArchived ? (
                      <Badge className="border-0 bg-gray-100 text-gray-600">Archived</Badge>
                    ) : (
                      <Badge className="border-0 bg-teal-50 text-teal-800">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" title="View" onClick={() => setView(r.id)}>
                        <Eye className="h-4 w-4 text-teal-700" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Edit">
                        <Pencil className="h-4 w-4 text-orange-500" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" title={isArchived ? "Restore" : "Archive"}
                        onClick={() => setArchived(prev =>
                          prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id]
                        )}
                      >
                        <Archive className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {view && (
          <div className="mt-4 rounded-xl border border-teal-500/30 bg-teal-50 p-4">
            <p className="text-xs uppercase tracking-wider text-teal-800">Resident Detail</p>
            {(() => {
              const r = residents.find(x => x.id === view)!;
              return (
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <p><strong>ID:</strong> {r.id}</p>
                  <p><strong>Name:</strong> {r.name}</p>
                  <p><strong>Age:</strong> {r.age}</p>
                  <p><strong>Contact:</strong> {r.contact}</p>
                  <p className="md:col-span-2"><strong>Address:</strong> {r.address}</p>
                </div>
              );
            })()}
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setView(null)}>
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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

/* ---------------- Events ---------------- */
function EventsView({ allEvents, upcomingEvents, pastEvents, onDeleteEvent, highlightText }: any) {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [searchEv, setSearchEv] = useState("");
  const [viewEv, setViewEv] = useState<any>(null);

  const displayedEvents = useMemo(() => {
    let list = activeTab === "upcoming" ? upcomingEvents : pastEvents;
    if (!searchEv.trim()) return list;
    const q = searchEv.toLowerCase();
    return list.filter((e: any) =>
      e.title.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.date.toLowerCase().includes(q)
    );
  }, [activeTab, upcomingEvents, pastEvents, searchEv]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#005f63]">Events & Activities</h2>
          <p className="text-sm text-gray-600">Manage barangay activities, attendance and eligibility rules.</p>
        </div>
        <Button className="bg-orange-500 text-white hover:bg-orange-600">
          <PlusCircle className="mr-1 h-4 w-4" /> Create New Event
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === "upcoming" ? "border-[#005f63] text-[#005f63]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Upcoming ({upcomingEvents.length})
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === "past" ? "border-[#005f63] text-[#005f63]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Past ({pastEvents.length})
          </button>
        </div>
        <Input
          value={searchEv}
          onChange={(e: any) => setSearchEv(e.target.value)}
          placeholder="Search events…"
          className="w-[240px]"
        />
      </div>

      {displayedEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          No events found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayedEvents.map((ev: any) => {
            const requiredMs = ev.membershipId ? memberships.find((m: any) => m.id === ev.membershipId) : null;
            return (
              <Card key={ev.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-2 bg-gradient-to-r from-teal-500 to-cyan-400" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-lg text-gray-800">{highlightText(ev.title, searchEv)}</h3>
                    <Badge variant={requiredMs ? "default" : "secondary"} className={requiredMs ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-700"}>
                      {requiredMs ? requiredMs.name : "Open"}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" /> {ev.date} · {ev.time || "TBA"}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" /> {ev.venue || "Barangay Hall"}
                    </p>
                  </div>

                  <p className="mt-3 text-sm text-gray-600 line-clamp-2">{ev.description || "No description provided."}</p>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setViewEv(ev)}>
                      <Eye className="h-4 w-4 text-teal-700" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Pencil className="h-4 w-4 text-orange-500" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteEvent(ev.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {viewEv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-[#005f63]">{viewEv.title}</h2>
              <button onClick={() => setViewEv(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500">Date & Time</p>
                  <p className="font-medium">{viewEv.date} — {viewEv.time || 'TBA'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">Venue</p>
                  <p className="font-medium">{viewEv.venue || 'Barangay Hall'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">Eligibility</p>
                  <p className="font-medium">{viewEv.membershipId ? memberships.find((m: any) => m.id === viewEv.membershipId)?.name : 'Open to all residents'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">Attendance Count</p>
                  <p className="font-medium">{attendanceRecords.filter((r: any) => r.eventTitle === viewEv.title).length} recorded</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Description</p>
                <p className="text-gray-700">{viewEv.description || 'No additional details.'}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setViewEv(null)}>Close</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white">View Attendance List</Button>
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
