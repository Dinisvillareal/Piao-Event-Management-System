import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  SquareMenu,
  KeyRound,
  Search,
  Filter,
  MoreVertical,
} from "lucide-react";

// SearchBar
function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#005f63]/70" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-full border border-[#005f63]/20 bg-white pl-12 pr-4 text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30"
      />
    </div>
  );
}

export default function MemberDashboard() {
  const [active, setActive] = useState("dashboard");

  // ✅ Search state — shared + separate for notifications + attendance + events
  const [searchQuery, setSearchQuery] = useState(""); // QR search
  const [notificationSearch, setNotificationSearch] = useState(""); // ✅ Notification search
  const [attendanceSearch, setAttendanceSearch] = useState(""); // ✅ Attendance search
  const [attendanceFilter, setAttendanceFilter] = useState("all"); // ✅ Filter: all | complete | incomplete | missed
  const [eventSearch, setEventSearch] = useState(""); // ✅ Events search
  const [eventFilter, setEventFilter] = useState("all"); // ✅ Events filter: all | upcoming | past
  const [eventMenuOpen, setEventMenuOpen] = useState<number | null>(null); // ✅ For 3-dot menu

  const [currentPage, setCurrentPage] = useState(1); // ✅ Pagination state
  const [attendancePage, setAttendancePage] = useState(1); // ✅ Attendance pagination
  const itemsPerPage = 6; // ✅ 6 QR cards per page
  const attendancePerPage = 20; // ✅ 20 attendance records per page

  const member = {
    id: "PR-1001",
    name: "Maria Santos",
  };

  // ✅ MEMBERSHIPS
  const memberships = [
    {
      id: "m1",
      name: "Verified Resident",
      description: "Official barangay resident membership.",
      codeId: "R-000-M-RES",
      note: "Use only for resident-only events and transactions.",
      verified: true,
    },
    {
      id: "m2",
      name: "Women's Association",
      description: "Barangay women's empowerment group.",
      codeId: "R-005-M-WOMEN",
      note: "Use only for Women's Association events.",
      verified: true,
    },
    {
      id: "m3",
      name: "Senior Citizen",
      description: "Official senior citizen membership.",
      codeId: "R-010-M-SENIOR",
      note: "Discounts and priority access for seniors.",
      verified: true,
    },
    {
      id: "m4",
      name: "SK Youth Member",
      description: "Registered Sangguniang Kabataan member.",
      codeId: "R-015-M-YOUTH",
      note: "Access to youth programs and activities.",
      verified: true,
    },
    {
      id: "m5",
      name: "PWD Member",
      description: "Official Person With Disability membership.",
      codeId: "R-020-M-PWD",
      note: "Priority lanes and government discounts.",
      verified: true,
    },
    {
      id: "m6",
      name: "Indigenous People",
      description: "Registered IP community member.",
      codeId: "R-025-M-IP",
      note: "Cultural rights and support programs.",
      verified: true,
    },
    {
      id: "m7",
      name: "Fisherfolk Sector",
      description: "Registered fisherfolk member.",
      codeId: "R-030-M-FISH",
      note: "Aid and support for fisherfolk community.",
      verified: true,
    },
    {
      id: "m8",
      name: "Agriculture Worker",
      description: "Registered agricultural worker member.",
      codeId: "R-035-M-AGRI",
      note: "Farming assistance and subsidy programs.",
      verified: true,
    },
    {
      id: "m9",
      name: "Health Worker",
      description: "Barangay health worker membership.",
      codeId: "R-040-M-HEALTH",
      note: "Eligible for health service benefits.",
      verified: true,
    },
    {
      id: "m10",
      name: "Peace & Order Team",
      description: "Barangay peace and order volunteer.",
      codeId: "R-045-M-PEACE",
      note: "Community safety and security duties.",
      verified: true,
    },
  ];

  // ✅ ATTENDANCE RECORDS
  const attendanceRecords = [
    {
      id: 1,
      eventTitle: "Barangay General Assembly",
      eventDate: "2026-05-12 09:00",
      location: "Barangay Hall",
      timeIn: "2026-05-12 08:55",
      timeOut: "2026-05-12 11:30",
      status: "complete", // complete | incomplete | missed
    },
    {
      id: 2,
      eventTitle: "Community Clean-Up",
      eventDate: "2026-05-15 06:00",
      location: "Town Plaza",
      timeIn: "2026-05-15 06:02",
      timeOut: "",
      status: "incomplete",
    },
    {
      id: 3,
      eventTitle: "Health Seminar",
      eventDate: "2026-05-20 13:00",
      location: "Barangay Hall",
      timeIn: "",
      timeOut: "",
      status: "missed",
    },
    {
      id: 4,
      eventTitle: "Youth Basketball League",
      eventDate: "2026-05-25 08:00",
      location: "Covered Court",
      timeIn: "2026-05-25 08:10",
      timeOut: "2026-05-25 12:00",
      status: "complete",
    },
    {
      id: 5,
      eventTitle: "Disaster Preparedness",
      eventDate: "2026-05-30 10:00",
      location: "Multi-Purpose Hall",
      timeIn: "",
      timeOut: "2026-05-30 12:30",
      status: "incomplete",
    },
    {
      id: 6,
      eventTitle: "Monthly Assembly",
      eventDate: "2026-04-20 09:00",
      location: "Barangay Hall",
      timeIn: "2026-04-20 08:50",
      timeOut: "2026-04-20 11:45",
      status: "complete",
    },
    {
      id: 7,
      eventTitle: "Tree Planting Activity",
      eventDate: "2026-04-10 07:00",
      location: "Community Park",
      timeIn: "",
      timeOut: "",
      status: "missed",
    },
    {
      id: 8,
      eventTitle: "Senior Citizen Forum",
      eventDate: "2026-04-05 14:00",
      location: "Senior Center",
      timeIn: "2026-04-05 14:05",
      timeOut: "",
      status: "incomplete",
    },
    {
      id: 9,
      eventTitle: "Women's Month Celebration",
      eventDate: "2026-03-25 08:00",
      location: "Covered Court",
      timeIn: "2026-03-25 08:15",
      timeOut: "2026-03-25 12:10",
      status: "complete",
    },
    {
      id: 10,
      eventTitle: "SK Leadership Training",
      eventDate: "2026-03-15 09:00",
      location: "Multi-Purpose Hall",
      timeIn: "",
      timeOut: "",
      status: "missed",
    },
  ];

  // ✅ Filter: works even with 1 letter
  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return memberships;
    return memberships.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.codeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.note.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [memberships, searchQuery]);

    // ✅ Attendance Filter + Search — NEWEST FIRST sorting
  const filteredAttendance = useMemo(() => {
    let result = attendanceRecords;

    // Filter by status
    if (attendanceFilter !== "all") {
      result = result.filter((rec) => rec.status === attendanceFilter);
    }

    // Filter by search
    if (attendanceSearch.trim()) {
      const q = attendanceSearch.toLowerCase();
      result = result.filter((rec) =>
        rec.eventTitle.toLowerCase().includes(q) ||
        rec.eventDate.toLowerCase().includes(q) ||
        rec.location.toLowerCase().includes(q) ||
        rec.timeIn.toLowerCase().includes(q) ||
        rec.timeOut.toLowerCase().includes(q)
      );
    }

    // ✅ SORT: NEWEST / LATEST DATE FIRST — same as Events & Notifications
    result = [...result].sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    return result;
  }, [attendanceRecords, attendanceFilter, attendanceSearch]);

  // ✅ Pagination logic
  const totalPages = useMemo(() => {
    return Math.ceil(filteredMemberships.length / itemsPerPage);
  }, [filteredMemberships, itemsPerPage]);

  const attendanceTotalPages = useMemo(() => {
    return Math.ceil(filteredAttendance.length / attendancePerPage);
  }, [filteredAttendance, attendancePerPage]);

  const paginatedMemberships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMemberships.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMemberships, currentPage, itemsPerPage]);

  const paginatedAttendance = useMemo(() => {
    const startIndex = (attendancePage - 1) * attendancePerPage;
    return filteredAttendance.slice(startIndex, startIndex + attendancePerPage);
  }, [filteredAttendance, attendancePage, attendancePerPage]);

  // ✅ Reset page when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useMemo(() => {
    setAttendancePage(1);
  }, [attendanceSearch, attendanceFilter]);

  // ✅ Highlight matched text yellow
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  };

  const notifications = [
    {
      id: 1,
      title: "General Assembly Reminder",
      body: "Please attend the General Assembly on May 12, 9:00 AM at the Barangay Hall.",
      sentAt: "2026-05-05 16:20",
    },
    {
      id: 2,
      title: "Bring your QR code",
      body: "Always bring your QR code for attendance scanning.",
      sentAt: "2026-05-04 10:00",
    },
    {
      id: 3,
      title: "Sports Fest open registration",
      body: "SK Youth Sports Fest registration is now open.",
      sentAt: "2026-05-02 09:15",
    },
    {
      id: 4,
      title: "Water Service Advisory",
      body: "Water interruption scheduled May 10 1PM–5PM in Poblacion area.",
      sentAt: "2026-05-01 09:45",
    },
    {
      id: 5,
      title: "New Benefit Available",
      body: "Senior citizens may now claim free medicine every Wednesday.",
      sentAt: "2026-04-30 14:30",
    },
    {
      id: 6,
      title: "Clean-Up Drive",
      body: "Join our community clean-up drive this Saturday, 6AM at the plaza.",
      sentAt: "2026-04-29 08:00",
    },
  ];

    // ✅ Filtered Notifications — same logic
  const filteredNotifications = useMemo(() => {
    if (!notificationSearch.trim()) return notifications;
    return notifications.filter((n) =>
      n.title.toLowerCase().includes(notificationSearch.toLowerCase()) ||
      n.body.toLowerCase().includes(notificationSearch.toLowerCase()) ||
      n.sentAt.toLowerCase().includes(notificationSearch.toLowerCase())
    );
  }, [notifications, notificationSearch]);

  const [upcomingEvents, setUpcomingEvents] = useState([
  {
    id: 1,
    title: "Barangay General Assembly",
    date: "2026-05-12 09:00", // ✅ This week
    location: "Barangay Hall",
    description: "Quarterly assembly of all registered members.",
  },
  {
    id: 2,
    title: "Community Clean-Up",
    date: "2026-05-13 06:00", // ✅ This week
    location: "Town Plaza",
    description: "Weekly clean-up activity, all residents welcome. Bring gloves and brooms.",
  },
  {
    id: 3,
    title: "Health Seminar",
    date: "2026-05-14 13:00", // ✅ This week
    location: "Barangay Hall",
    description: "Free health talk & check-up for seniors and vulnerable groups.",
  },
  {
    id: 4,
    title: "Youth Basketball League",
    date: "2026-05-11 08:00", // ✅ This week
    location: "Covered Court",
    description: "Annual sports event for youth ages 15–21.",
  },
  {
    id: 5,
    title: "Disaster Preparedness",
    date: "2026-05-15 10:00", // ✅ NEWEST date — This week
    location: "Multi-Purpose Hall",
    description: "Training & seminar for all households. Emergency kits will be distributed.",
  },
]);

const [pastEvents, setPastEvents] = useState([
  {
    id: 6,
    title: "Monthly Assembly",
    date: "2026-05-08 09:00", // ✅ Already passed
    location: "Barangay Hall",
    description: "Regular monthly meeting of residents and officials.",
  },
  {
    id: 7,
    title: "Tree Planting Activity",
    date: "2026-05-07 07:00", // ✅ Already passed
    location: "Community Park",
    description: "Environmental activity for all members. Over 100 seedlings planted.",
  },
  {
    id: 8,
    title: "Senior Citizen Forum",
    date: "2026-05-06 14:00", // ✅ Already passed
    location: "Senior Center",
    description: "Forum on elderly care, benefits, and health services.",
  },
]);

  // ✅ Combine all events
  const allEvents = useMemo(() => [...upcomingEvents, ...pastEvents], [upcomingEvents, pastEvents]);

    // ✅ Events Filter + Search — exactly same pattern as Attendance
  const filteredEvents = useMemo(() => {
    let result = allEvents;

    // Filter by category: all / upcoming / past
    if (eventFilter === "upcoming") {
      result = upcomingEvents;
    } else if (eventFilter === "past") {
      result = pastEvents;
    }

    // Filter by search keyword
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

    // ✅ SORT: NEWEST / LATEST DATE FIRST — same as Notifications
    result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }, [allEvents, upcomingEvents, pastEvents, eventFilter, eventSearch]);

    // ✅ Group events by date section — EXACT RULE YOU WANT:
  // - Filter = All → "This Week" for upcoming within 7 days, rest = full date
  // - Filter = Upcoming / Past → ALL use full date format, NO "This Week"
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof allEvents> = {};
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    filteredEvents.forEach((e) => {
      const eventDate = new Date(e.date);
      const dateOnly = e.date.split(" ")[0];

      let sectionKey: string;

      if (eventFilter === "all") {
        // Only show "This Week" when filter is "All"
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
        // When filter = Upcoming OR Past → ALL use full date format
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

    // ✅ SORT GROUPS: "This Week" always first, then NEWEST DATE GROUPS FIRST
    const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === "📅 This Week") return -1;
      if (keyB === "📅 This Week") return 1;
      // Reverse order → latest date first
      return new Date(keyB).getTime() - new Date(keyA).getTime();
    });

    return Object.fromEntries(sortedGroups);
  }, [filteredEvents, eventFilter]);

  // ✅ Delete event handler
  const handleDeleteEvent = (id: number) => {
    setUpcomingEvents(prev => prev.filter(e => e.id !== id));
    setPastEvents(prev => prev.filter(e => e.id !== id));
    setEventMenuOpen(null);
  };

  // ✅ Reset event page/search state when filter/search changes
  useMemo(() => {
    // reset any pagination here if added later
  }, [eventSearch, eventFilter]);

  const attended = attendanceRecords.filter(r => r.status === "complete").length;
  const missed = attendanceRecords.filter(r => r.status === "missed").length;

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Codes", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#fcfcf9] text-gray-900">
      <div className="flex min-h-screen">
        {/* ✅ UPDATED SIDEBAR — Fixed height, scrollable content, Sign Out fixed at bottom */}
        <aside className="hidden w-[250px] flex-col border-r border-[#ddd5ca] bg-[#fcfcf9] md:flex h-screen sticky top-0">
          <div className="border-b border-[#ddd5ca] px-5 py-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-400 font-black text-black">
                B
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#005f63]/70">
                  Barangay Piao
                </p>
                <h1 className="text-xl font-black text-[#005f63]">
                  e-Membership
                </h1>
              </div>
            </div>
          </div>

          {/* ✅ Scrollable navigation area */}
          <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
            <p className="mb-3 px-3 text-sm font-semibold text-[#005f63]/70">
              Member Area
            </p>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActive(item.key)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 ${
                      active === item.key
                        ? "bg-gradient-to-r from-orange-300 via-orange-200 to-yellow-200 text-[#005f63] shadow-[0_8px_25px_rgba(150,146,60,0.35)] font-bold scale-[1.02]"
                        : "text-[#005f63] hover:bg-orange-100 hover:shadow-md"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ✅ Fixed Sign Out — always stays at bottom, never moves */}
          <div className="border-t border-[#ddd5ca] p-2 shrink-0">
            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[#005f63] transition hover:bg-orange-100">
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Sign out</span>
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1">
          {/* TOP HEADER */}
          <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-6 py-4">
            <div className="flex items-center gap-2">
              <SquareMenu className="h-5 w-5 text-gray-700" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 m-0">
                Resident Member Portal
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Signed in as</p>
                <p className="text-sm font-bold text-[#005f63]">Maria Santos</p>
              </div>
              <div className="rounded-full bg-[#2cb7b7] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow">
                Member · Resident
              </div>
            </div>
          </div>

          {/* CONTENT — ✅ Make main content scrollable so header stays fixed + smooth scroll */}
          <div
            className="h-[calc(100vh-73px)] overflow-y-auto smooth-scroll"
            style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}
          >
            <div className="space-y-5 p-5">
              {/* DASHBOARD */}
              {active === "dashboard" && (
                <>
                  <div className="rounded-[24px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                      Member Dashboard
                    </p>
                    <h1 className="mt-2 text-4xl font-black">Welcome back, Maria!</h1>
                    <p className="mt-2 text-base text-white/90">
                      You are signed in as a resident member.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <SummaryCard
                      value={memberships.length}
                      title="Verified Memberships"
                      gradient="from-orange-400 to-yellow-300"
                      onClick={() => setActive("qr")}
                    />
                    <SummaryCard
                      value={attended}
                      title="Events Attended"
                      gradient="from-[#18b5b5] to-[#5fd3d3]"
                      onClick={() => setActive("events")}
                    />
                    <SummaryCard
                      value={missed}
                      title="Events Missed"
                      gradient="from-yellow-300 to-orange-400"
                      onClick={() => setActive("events")}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* ✅ LATEST NOTIFICATIONS — SCROLLABLE + HOVER SHADOW + SMOOTH SCROLL */}
                    <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
                      <h2 className="text-2xl font-black text-[#005f63]">Latest Notifications</h2>
                      <p className="mt-1 text-gray-600">Posts from your barangay staff.</p>

                      <div
                        className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
                        style={{ maxHeight: "220px", scrollBehavior: 'smooth', scrollbarWidth: 'thin' }}
                      >
                        {filteredNotifications.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border-l-4 border-yellow-400 bg-[#f7f2e8] p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <h3 className="text-lg font-bold text-[#005f63]">{item.title}</h3>
                              <span className="text-xs text-gray-500">{item.sentAt}</span>
                            </div>
                            <p className="mt-2 text-sm text-gray-700">{item.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ✅ UPCOMING EVENTS — SAME: SCROLLABLE + HOVER SHADOW + SMOOTH SCROLL */}
                    <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
                      <h2 className="text-2xl font-black text-[#005f63]">Upcoming Events</h2>
                      <p className="mt-1 text-gray-600">Events you're eligible to attend.</p>

                      <div
                        className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
                        style={{ maxHeight: "220px", scrollBehavior: 'smooth', scrollbarWidth: 'thin' }}
                      >
                        {upcomingEvents.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
                          >
                            <h3 className="text-lg font-bold text-[#005f63]">{e.title}</h3>
                            <p className="mt-1 text-sm text-gray-500">{e.date} · {e.location}</p>
                            <p className="mt-2 text-sm text-gray-700">{e.description}</p>
                          </div>
                        ))}
                        <p className="mt-3 text-sm text-gray-500">{pastEvents.length} past event(s) on record.</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

                            {/* ✅ MY QR CODES — ✅ HEADER + SEARCH BAR FIXED / STICKY */}
              {active === "qr" && (
                <div className="space-y-6">
                  {/* ✅ FIXED HEADER & SEARCH AREA — STICKY, NEVER SCROLL AWAY */}
                  <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
                    <div className="w-[1200px]">
                      <h1 className="text-4xl font-black text-[#005f63]">My QR Codes</h1>
                      <p className="text-sm text-[#667777] mt-1">Each membership has its own unique QR. Show the right one at the right event.</p>

                      {/* ✅ BIG & VERY LONG SEARCH BAR */}
                      <div className="mt-4 w-[1580px]">
                        <SearchBar
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search your memberships by name, description, or ID…"
                        />
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {filteredMemberships.length} of {memberships.length} membership(s) match.
                      </p>
                    </div>
                  </div>

                  {/* ✅ SCROLLABLE QR CARDS AREA */}
                  <div className="pl-1">
                    {filteredMemberships.length === 0 ? (
                      <p className="text-gray-500 italic">No memberships match your search.</p>
                    ) : (
                      <>
                        <div className="flex flex-row flex-wrap gap-5">
                          {paginatedMemberships.map((m) => (
                            <div
                              key={m.id}
                              className="rounded-3xl border border-gray-200 bg-white overflow-hidden w-[780px] shrink-0 hover:shadow-2xl transition-shadow duration-300"
                            >
                              <div className="h-1.5 bg-gradient-to-r from-[#ff7a28] via-[#ff9a3c] to-[#ffd33d]"></div>
                              <div className="p-5">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h2 className="text-base font-bold text-[#006666]">
                                      {highlightText(m.name, searchQuery)}
                                    </h2>
                                    <p className="text-sm text-[#667777] mt-1">
                                      {highlightText(m.description, searchQuery)}
                                    </p>
                                  </div>
                                  <span className="bg-[#2cb7b7] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    Verified
                                  </span>
                                </div>

                                <div className="mt-6 flex items-center gap-4">
                                  <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-md">
                                    <FakeQR seed={m.codeId} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-[#0f5050]">Code ID</p>
                                    <p className="text-xs text-[#365f5f] mt-1">
                                      {highlightText(m.codeId, searchQuery)}
                                    </p>
                                    <p className="text-xs text-[#1e2c2c] mt-2">
                                      {highlightText(m.note, searchQuery)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ✅ PAGINATION — SMALLER FONTS + SMALLER BUTTONS + CENTERED */}
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
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ✅ ATTENDANCE PAGE — ✅ SAME SEARCH BAR + FILTER + EXACT DESIGN FROM SCREENSHOT + ORANGE BORDER + CREAM BG */}
              {active === "attendance" && (
                <div className="space-y-6">
                  {/* ✅ FIXED HEADER & SEARCH AREA — STICKY, NEVER SCROLL AWAY */}
                  <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
                    <div className="w-[1200px]">
                      <h1 className="text-4xl font-black text-[#005f63]">Attendance Records</h1>
                      <p className="text-sm text-[#667777] mt-1">Your sign in / sign out history per event.</p>

                      {/* ✅ SEARCH BAR + FILTER ROW */}
                      <div className="mt-4 flex items-center gap-4 w-[1580px]">
                        <div className="flex-1">
                          <SearchBar
                            value={attendanceSearch}
                            onChange={setAttendanceSearch}
                            placeholder="Search attendance by event, date, location or time…"
                          />
                        </div>
                        {/* ✅ FILTER DROPDOWN */}
                        <div className="relative">
                          <select
                            value={attendanceFilter}
                            onChange={(e) => setAttendanceFilter(e.target.value)}
                            className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                          >
                            <option value="all">All Records</option>
                            <option value="complete">Complete (In & Out)</option>
                            <option value="incomplete">Incomplete (Missing In/Out)</option>
                            <option value="missed">Missed (No Record)</option>
                          </select>
                          <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                          <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {filteredAttendance.length} of {attendanceRecords.length} record(s) match — showing 20 per page.
                      </p>
                    </div>
                  </div>

                  {/* ✅ ATTENDANCE LIST — EXACT DESIGN FROM YOUR SCREENSHOT: ORANGE LEFT BORDER, CREAM BACKGROUND */}
                  <div className="pl-1 space-y-3">
                    {filteredAttendance.length === 0 ? (
                      <p className="text-gray-500 italic">No attendance records match your search or filter.</p>
                    ) : (
                      <>
                        {paginatedAttendance.map((rec) => (
                          <div
                            key={rec.id}
                            className="rounded-2xl border-l-4 border-orange-400 bg-[#faf8f4] px-6 py-4 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200 flex items-center justify-between gap-4"
                          >
                            {/* Left side: Event info */}
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-[#005f63]">{highlightText(rec.eventTitle, attendanceSearch)}</h3>
                              <p className="text-sm text-gray-500 mt-1">
                                {rec.eventDate} · {rec.location}
                              </p>
                            </div>

                            {/* Right side: Time labels — EXACT STYLE FROM IMAGE */}
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <span className="text-xs text-gray-500">In:</span>
                                <span className={`ml-1.5 text-sm font-medium px-2 py-0.5 rounded-full ${
                                  rec.timeIn ? 'text-teal-700 bg-teal-50' : 'text-gray-400 bg-gray-50 italic'
                                }`}>
                                  {rec.timeIn || '—'}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-gray-500">Out:</span>
                                <span className={`ml-1.5 text-sm font-medium px-2 py-0.5 rounded-full ${
                                  rec.timeOut ? 'text-orange-700 bg-orange-50' : 'text-gray-400 bg-gray-50 italic'
                                }`}>
                                  {rec.timeOut || '—'}
                                </span>
                              </div>
                              {/* Status badge */}
                              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                rec.status === 'complete'
                                  ? 'bg-teal-100 text-teal-800'
                                  : rec.status === 'incomplete'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
                              </span>
                            </div>
                          </div>
                        ))}

                        {/* ✅ ATTENDANCE PAGINATION — 20 RECORDS PER PAGE */}
                        {attendanceTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-8">
                            <button
                              onClick={() => setAttendancePage(prev => Math.max(prev - 1, 1))}
                              disabled={attendancePage === 1}
                              className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                            >
                              Previous
                            </button>

                            {Array.from({ length: attendanceTotalPages }, (_, i) => (
                              <button
                                key={i + 1}
                                onClick={() => setAttendancePage(i + 1)}
                                className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                                  attendancePage === i + 1
                                    ? "bg-[#005f63] text-white shadow-sm"
                                    : "bg-white border text-[#005f63] hover:bg-orange-50"
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}

                            <button
                              onClick={() => setAttendancePage(prev => Math.min(prev + 1, attendanceTotalPages))}
                              disabled={attendancePage === attendanceTotalPages}
                              className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                            >
                              Next
                            </button>

                            <span className="text-xs text-gray-600 ml-1.5">
                              Page {attendancePage} of {attendanceTotalPages}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ✅ EVENTS PAGE — WITH FIXED HEADER + SEARCH + FILTER */}
                {active === "events" && (
                <div className="space-y-6">
                    {/* ✅ FIXED HEADER & SEARCH AREA — SAME AS ATTENDANCE */}
                    <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
                    <div className="w-[1200px]">
                        <h1 className="text-4xl font-black text-[#005f63]">
                        Events
                        </h1>

                        <p className="mt-1 text-sm text-[#667777]">
                        Filter and view all, upcoming, and past events.
                        </p>

                        {/* ✅ SEARCH + FILTER */}
                        <div className="mt-4 flex items-center gap-4 w-[1580px]">
                        <div className="flex-1">
                            <SearchBar
                            value={eventSearch}
                            onChange={setEventSearch}
                            placeholder="Search events by title, date, location or description..."
                            />
                        </div>

                        {/* ✅ FILTER */}
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
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                            </svg>
                        </div>
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                        {filteredEvents.length} of {allEvents.length} event(s) match
                        </p>
                    </div>
                    </div>

                    {/* ✅ EVENTS LIST */}
                    <div className="pl-1">
                    {filteredEvents.length === 0 ? (
                        <p className="text-gray-500 italic">
                        No events match your search or filter.
                        </p>
                    ) : (
                        <div className="space-y-8">
                        {Object.entries(groupedEvents).map(
                            ([dateLabel, eventsInGroup]) => (
                            <div key={dateLabel}>
                                {/* ✅ DATE LABEL */}
                                <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">
                                {dateLabel}
                                </h3>

                                <div className="grid gap-5 md:grid-cols-2">
                                {eventsInGroup.map((e) => (
                                <div
                                    key={e.id}
                                    className="relative rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200"
                                >
                                    {/* ✅ 3 DOT MENU */}
                                    <div className="absolute top-4 right-4">
                                    <button
                                        onClick={() =>
                                        setEventMenuOpen(
                                            eventMenuOpen === e.id ? null : e.id
                                        )
                                        }
                                        className="rounded-full p-2 transition-colors hover:bg-gray-100"
                                    >
                                        <MoreVertical className="h-5 w-5 text-gray-600" />
                                    </button>

                                    {eventMenuOpen === e.id && (
                                        <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border bg-white shadow-lg">
                                        <button
                                            onClick={() => handleDeleteEvent(e.id)}
                                            className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-200 "
                                        >
                                            Delete
                                        </button>
                                        </div>
                                    )}
                                    </div>

                                    <h2 className="pr-8 text-lg font-bold text-[#005f63]">
                                    {highlightText(e.title, eventSearch)}
                                    </h2>

                                    <p className="mt-1 text-sm text-gray-500">
                                    {highlightText(e.date, eventSearch)} ·{" "}
                                    {highlightText(e.location, eventSearch)}
                                    </p>

                                    <p className="mt-3 text-gray-700">
                                    {highlightText(e.description, eventSearch)}
                                    </p>
                                </div>
                                ))}
                                                                </div>
                                                            </div>
                                                            )
                                                        )}
                        </div>
                    )}
                    </div>
                </div>
                )}

              {/* ✅ NOTIFICATIONS — WITH SEARCH BAR SAME AS QR PAGE */}
              {active === "notify" && (
                <div className="space-y-6">
                  {/* ✅ FIXED HEADER & SEARCH AREA — STICKY */}
                  <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
                    <div className="w-[1200px]">
                      <h1 className="text-4xl font-black text-[#005f63]">Notifications</h1>
                      <p className="text-sm text-[#667777] mt-1">Official announcements, updates, and reminders from barangay staff.</p>

                      {/* ✅ BIG & VERY LONG SEARCH BAR */}
                      <div className="mt-4 w-[1580px]">
                        <SearchBar
                          value={notificationSearch}
                          onChange={setNotificationSearch}
                          placeholder="Search notifications by title, message, or date…"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          {filteredNotifications.length} of {notifications.length} notification(s) match.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4 pl-1">
                    {filteredNotifications.map((n) => (
                        <div
                            key={n.id}
                            className="rounded-2xl border-l-4 border-yellow-400 bg-[#f7f2e8] p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300"
                        >
                            <div className="flex justify-between gap-3">
                            <h2 className="font-bold text-[#005f63]">
                                {highlightText(n.title, notificationSearch)}
                            </h2>
                            <span className="text-xs text-gray-500">
                                {highlightText(n.sentAt, notificationSearch)}
                            </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-700">
                            {highlightText(n.body, notificationSearch)}
                            </p>
                        </div>
                        ))}
                  </div>
                </div>
              )}

                            {/* SETTINGS */}
              {active === "settings" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* CHANGE PASSWORD */}
                  <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
                    {/* ✅ TOP GRADIENT BORDER — same as your image */}
                    <div className="h-1.5 bg-gradient-to-r from-[#ffd33d] via-[#ff9a3c] to-[#28f1ff]"></div>
                    <div className="p-6">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-orange-500" />
                        <h2 className="text-3xl font-black text-[#005f63]">Change Password</h2>
                      </div>
                      <div className="mt-6 space-y-4">
                        <input
                          type="password"
                          placeholder="Current Password"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <input
                          type="password"
                          placeholder="New Password"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <input
                          type="password"
                          placeholder="Confirm Password"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <button className="w-full rounded-xl bg-[#f8a02c] py-3 font-semibold text-white hover:bg-[#fcbd6c] transition-colors">
                          Update Password
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* PROFILE SETTINGS */}
                  <div className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300">
                    {/* ✅ TOP GRADIENT BORDER — same as your image */}
                    <div className="h-1.5 bg-gradient-to-r from-[#28f1ff] via-[#ff9a3c] to-[#ffd33d]"></div>
                    <div className="p-6">
                      <h2 className="text-3xl font-black text-[#005f63]">Profile</h2>
                      <div className="mt-6 space-y-4">
                        <input
                          type="text"
                          defaultValue={member.name}
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <input
                          type="text"
                          defaultValue="0917-111-1001"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <input
                          type="text"
                          disabled
                          defaultValue="Member · Resident"
                          className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-600"
                        />
                        <button className="w-full rounded-xl bg-[#2cb7b7] py-3 font-semibold text-white hover:bg-[#41d1d1] transition-colors">
                          Save Profile
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ✅ GLOBAL SMOOTH SCROLL STYLES */}
      <style>{`
        .smooth-scroll {
          scroll-behavior: smooth !important;
          -webkit-overflow-scrolling: touch;
        }
        .smooth-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .smooth-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .smooth-scroll::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 10px;
        }
        .smooth-scroll::-webkit-scrollbar-thumb:hover {
          background: #aaa;
        }
        .shadow-b-sm {
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
}

// SUMMARY CARD COMPONENT
function SummaryCard({
  value,
  title,
  gradient,
  onClick,
}: {
  value: number;
  title: string;
  gradient: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-[20px] bg-gradient-to-r ${gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]`}
    >
      <h2 className="text-5xl font-black">
        {value}
      </h2>
      <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
        {title}
      </p>
    </button>
  );
}


function FakeQR({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    // 15x15 grid — exactly matches the design
    return Array.from({ length: 225 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 16) % 2 === 0;
    });
  }, [seed]);

  return (
    <div
      className="grid h-40 w-40 gap-[1.5px] rounded-xl bg-white"
      style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          className={on ? "bg-[#095a5a] rounded-[1px]" : "bg-white"}
        />
      ))}
    </div>
  );
}
