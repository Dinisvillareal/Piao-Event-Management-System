import { useEffect, useMemo, useState } from "react";
import Sidebar from "../../Components/Layout/Sidebar";
import TopHeader from "../../Components/Layout/TopHeader";
import SettingsView from "./Views/SettingsView";
import DashboardView from "./Views/DashboardView";
import QRCodesView from "./Views/QRCodesView";
import AttendanceView, { AttendanceRecord } from "./Views/AttendanceView";
import NotificationsView from "./Views/NotificationsView";
import EventsView from "./Views/EventsView";

export default function MemberDashboard() {
  const currentPath = window.location.pathname.replace('/', '');
  const [active, setActiveState] = useState(currentPath || "dashboard");
  const [member, setMember] = useState({ id: "", name: "", first_name: "", last_name: "" });
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);
  const [userMembershipsCount, setUserMembershipsCount] = useState(0);

  // ✅ Properly typed — no more never[] error
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attended, setAttended] = useState(0);
  const [missed, setMissed] = useState(0);

  const [upcomingEvents, setUpcomingEvents] = useState([
    {
      id: 1,
      title: "Barangay General Assembly",
      date: "2026-05-12 09:00",
      location: "Barangay Hall",
      description: "Quarterly assembly of all registered members.",
    },
    {
      id: 2,
      title: "Community Clean-Up",
      date: "2026-05-13 06:00",
      location: "Town Plaza",
      description: "Weekly clean-up activity, all residents welcome. Bring gloves and brooms.",
    },
    {
      id: 3,
      title: "Health Seminar",
      date: "2026-05-14 13:00",
      location: "Barangay Hall",
      description: "Free health talk & check-up for seniors and vulnerable groups.",
    },
    {
      id: 4,
      title: "Youth Basketball League",
      date: "2026-05-11 08:00",
      location: "Covered Court",
      description: "Annual sports event for youth ages 15–21.",
    },
    {
      id: 5,
      title: "Disaster Preparedness",
      date: "2026-05-15 10:00",
      location: "Multi-Purpose Hall",
      description: "Training & seminar for all households. Emergency kits will be distributed.",
    },
  ]);

  const [pastEvents, setPastEvents] = useState([
    {
      id: 6,
      title: "Monthly Assembly",
      date: "2026-05-08 09:00",
      location: "Barangay Hall",
      description: "Regular monthly meeting of residents and officials.",
    },
    {
      id: 7,
      title: "Tree Planting Activity",
      date: "2026-05-07 07:00",
      location: "Community Park",
      description: "Environmental activity for all members. Over 100 seedlings planted.",
    },
    {
      id: 8,
      title: "Senior Citizen Forum",
      date: "2026-05-06 14:00",
      location: "Senior Center",
      description: "Forum on elderly care, benefits, and health services.",
    },
  ]);

  const allEvents = useMemo(() => [...upcomingEvents, ...pastEvents], [upcomingEvents, pastEvents]);

  // ─── POPSTATE (browser back/forward) ────────────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace('/', '') || "dashboard";
      setActiveState(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ─── FETCH LOGGED-IN USER ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/me', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(res => res.json())
    .then(user => {
      setMember({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        first_name: user.first_name,
        last_name: user.last_name
      });
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to fetch user:', err);
      setLoading(false);
    });
  }, []);

  // ─── FETCH ALL MEMBERSHIP TYPES (for QR Codes view) ─────────────────────────
  useEffect(() => {
    fetch('/memberships', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      setMemberships(data.data);
    })
    .catch(err => {
      console.error('Failed to fetch memberships:', err);
    });
  }, []);

  // ─── FETCH USER'S MEMBERSHIP COUNT (for Dashboard summary card) ──────────────
  useEffect(() => {
    if (!member.id) return;

    fetch(`/membership-residents/${member.id}/memberships?per_page=100`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      setUserMembershipsCount(data.total || data.memberships?.length || 0);
    })
    .catch(err => console.error('Failed to fetch user memberships count:', err));
  }, [member.id]);

  // ─── FETCH ATTENDANCE RECORDS ────────────────────────────────────────────────
 useEffect(() => {
    if (!member.id) return;

    // 1. UNIQUE CACHE KEY: Tie the cache to this specific user's ID
    const cacheKey = `attendance_cache_${member.id}`;

    // 2. CHECK CACHE FIRST: Do we have saved data in sessionStorage?
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
      // If yes, instantly load it into the state! No spinner!
      const parsedData = JSON.parse(cachedData);
      setAttendanceRecords(parsedData.records);
      setAttended(parsedData.attended);
      setMissed(parsedData.missed);
    }

    // 3. BACKGROUND FETCH: Secretly ask Laravel for fresh data anyway
    fetch(`/attendance/${member.id}`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data)) return;

      const records: AttendanceRecord[] = data.map((item: any) => ({
        id: item.id,
        eventTitle: item.event?.name ?? '—',
        eventDate: item.event?.event_start ?? '',
        location: item.event?.location ?? '—',
        timeIn: item.time_in ?? '',
        timeOut: item.time_out ?? '',
        status: (!item.time_in && !item.time_out) ? 'missed' : item.status?.toLowerCase() ?? 'incomplete',
      }));

      const attendedCount = records.filter(r => r.status === 'complete').length;
      const missedCount = records.filter(r => r.status === 'missed').length;

      // Update the React UI with the fresh data
      setAttendanceRecords(records);
      setAttended(attendedCount);
      setMissed(missedCount);

      // 4. UPDATE CACHE: Save this fresh data back into the browser's memory for next time
      sessionStorage.setItem(cacheKey, JSON.stringify({
        records: records,
        attended: attendedCount,
        missed: missedCount
      }));
    })
    .catch(err => console.error('Failed to fetch attendance:', err));
  }, [member.id]);

  // ─── NAVIGATION ──────────────────────────────────────────────────────────────
  const setActive = (page: string) => {
    const url = page === "dashboard" ? "/" : `/${page}`;
    window.history.pushState({}, "", url);
    setActiveState(page);
  };

  // ─── HIGHLIGHT MATCHED SEARCH TEXT ───────────────────────────────────────────
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

  // ─── DELETE EVENT ─────────────────────────────────────────────────────────────
  const handleDeleteEvent = (id: number) => {
    setUpcomingEvents(prev => prev.filter(e => e.id !== id));
    setPastEvents(prev => prev.filter(e => e.id !== id));
  };

  // ─── NOTIFICATIONS (hardcoded) ────────────────────────────────────────────────
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

  // ─── LOADING SCREEN ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fcfcf9]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#fcfcf9] text-gray-900">
      <div className="flex min-h-screen">
        <Sidebar active={active} setActive={setActive} />

        <main className="flex-1">
          <TopHeader memberName={member.name} />

          <div
            className="h-[calc(100vh-73px)] overflow-y-auto smooth-scroll"
            style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}
          >
            <div className="space-y-5 p-5">

              {/* DASHBOARD */}
              {active === "dashboard" && (
                <DashboardView
                  memberName={member.first_name}
                  membershipsCount={userMembershipsCount}
                  attendedCount={attended}
                  missedCount={missed}
                  setActive={setActive}
                  notifications={notifications}
                  upcomingEvents={upcomingEvents}
                  pastEventsCount={pastEvents.length}
                />
              )}

              {/* MY QR CODES */}
              {active === "qr" && (
                <QRCodesView
                  memberships={memberships}
                  highlightText={highlightText}
                />
              )}

              {/* ATTENDANCE */}
              {active === "attendance" && (
                <AttendanceView
                  attendanceRecords={attendanceRecords}
                  highlightText={highlightText}
                />
              )}

              {/* EVENTS */}
              {active === "events" && (
                <EventsView
                  allEvents={allEvents}
                  upcomingEvents={upcomingEvents}
                  pastEvents={pastEvents}
                  onDeleteEvent={handleDeleteEvent}
                  highlightText={highlightText}
                />
              )}

              {/* NOTIFICATIONS */}
              {active === "notify" && (
                <NotificationsView
                  notifications={notifications}
                  highlightText={highlightText}
                />
              )}

              {/* SETTINGS */}
              {active === "settings" && (
                <SettingsView member={member} />
              )}

            </div>
          </div>
        </main>
      </div>

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