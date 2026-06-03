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
  const [member, setMember] = useState({ 
    id: "", 
    name: "", 
    first_name: "", 
    last_name: "",
    user_code: "" 
  });
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);
  const [userMembershipsCount, setUserMembershipsCount] = useState(0);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attended, setAttended] = useState(0);
  const [missed, setMissed] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [pastEvents, setPastEvents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const parseApiDate = (value: string) => {
    if (!value) return new Date(0);
    return new Date(value.replace(" ", "T"));
  };

  const allEvents = useMemo(() => [
    ...(Array.isArray(upcomingEvents) ? upcomingEvents : []),
    ...(Array.isArray(pastEvents) ? pastEvents : [])
  ], [upcomingEvents, pastEvents]);

  // Helper function to safely parse JSON responses
  const safeJsonParse = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error("Expected JSON but got:", contentType);
      throw new Error("Server returned HTML instead of JSON");
    }
    return response.json();
  };

  // Fetch notifications function (reusable)
  const fetchNotifications = async () => {
    try {
      const response = await fetch('/notifications', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await safeJsonParse(response);
        const notificationsData = data.data || data || [];
        setNotifications(notificationsData.map((notification: any) => ({
          id: notification.id,
          title: notification.title,
          message: notification.message || notification.body,
          created_at: notification.created_at,
          is_updated: notification.is_updated,
          read: notification.read || false,
          updated_at_notification: notification.updated_at_notification,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  // ─── POPSTATE (browser back/forward) ────────────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace('/', '') || "dashboard";
      setActiveState(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ─── REFETCH NOTIFICATIONS WHEN RETURNING TO DASHBOARD ───────────────────────
  useEffect(() => {
    if (active === "dashboard") {
      fetchNotifications();
    }
  }, [active]);

  // ─── FETCH LOGGED-IN USER ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/me', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 419) {
          localStorage.clear();
          sessionStorage.clear();
          document.cookie.split(";").forEach((cookie) => {
            document.cookie = cookie
              .replace(/^ +/, "")
              .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
          });
          window.location.href = "/";
          return null;
        }
        if (!res.ok) {
          throw new Error("Authentication failed");
        }
        return safeJsonParse(res);
      })
      .then((user) => {
        if (!user) return;
        setMember({
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          first_name: user.first_name,
          last_name: user.last_name,
          user_code: user.user_code || ''
        });
      })
      .catch((err) => {
        console.error("Failed to fetch user:", err);
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/";
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // ─── FETCH ALL MEMBERSHIP TYPES (for QR Codes view) ─────────────────────────
  useEffect(() => {
    fetch('/api/memberships', {
      credentials: 'include',
      headers: { 
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeJsonParse(res);
        setMemberships(data.data || data || []);
      })
      .catch(err => {
        console.error('Failed to fetch memberships:', err);
        setMemberships([]);
      });
  }, []);

  // ─── FETCH EVENTS ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/events-data', {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeJsonParse(res);
        if (!data?.data) {
          console.error('No events returned:', data);
          return;
        }

        const now = new Date();

        const formattedEvents = data.data.map((event: any) => ({
          id: event.id,
          title: event.name,
          date: event.event_start,
          event_start: event.event_start,
          event_end: event.event_end,
          location: event.location,
          description: event.description,
          membership_ids: Array.isArray(event.membership_ids) ? event.membership_ids : [],
          memberships: Array.isArray(event.memberships) ? event.memberships : [],
          notificationMessage: event.notification_message,
          membershipNames: event.memberships?.map((m: any) => m.name) || [],
          startDate: event.event_start?.split(" ")[0],
          startTime: new Date(event.event_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));

        const upcoming = formattedEvents.filter((e: any) => parseApiDate(e.date) >= now);
        const past = formattedEvents.filter((e: any) => parseApiDate(e.date) < now);

        setUpcomingEvents(upcoming);
        setPastEvents(past);
      })
      .catch((err) => console.error('Failed to fetch events:', err));
  }, []);

  // ─── FETCH NOTIFICATIONS (initial) ──────────────────────────────────────────
  useEffect(() => {
    fetchNotifications();
  }, []);

  // ─── FETCH USER'S MEMBERSHIP COUNT ──────────────────────────────────────────
  useEffect(() => {
    if (!member.id) return;

    fetch(`/membership-residents/${member.id}?per_page=100`, {
      credentials: 'include',
      headers: { 
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeJsonParse(res);
        setUserMembershipsCount(data.total || data.memberships?.length || 0);
      })
      .catch(err => console.error('Failed to fetch user memberships count:', err));
  }, [member.id]);

  // ─── FETCH ATTENDANCE RECORDS ────────────────────────────────────────────────
  useEffect(() => {
    if (!member.id) return;

    const cacheKey = `attendance_cache_${member.id}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      setAttendanceRecords(parsedData.records);
      setAttended(parsedData.attended);
      setMissed(parsedData.missed);
    }

    fetch(`/attendance/${member.id}`, {
      credentials: 'include',
      headers: { 
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeJsonParse(res);
        if (!Array.isArray(data)) return;

        const records: AttendanceRecord[] = data.map((item: any) => ({
          id: item.id,
          eventTitle: item.event?.name ?? '—',
          eventDate: item.event?.event_start ?? '',
          location: item.event?.location ?? '—',
          timeIn: item.time_in ?? '',
          timeOut: item.time_out ?? '',
          status: (!item.time_in && !item.time_out) ? 'missed' : (item.status?.toLowerCase() ?? 'incomplete'),
        }));

        const attendedCount = records.filter(r => r.status === 'complete').length;
        const missedCount = records.filter(r => r.status === 'missed').length;

        setAttendanceRecords(records);
        setAttended(attendedCount);
        setMissed(missedCount);

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
                  highlightText={highlightText}
                />
              )}

              {/* MY QR CODES */}
              {active === "qr" && (
                <QRCodesView
                  highlightText={highlightText}
                  userId={member.id}
                  userCode={member.user_code}
                  fullName={member.name}
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
                  highlightText={highlightText}
                  allMemberships={memberships}
                />
              )}

              {/* NOTIFICATIONS */}
              {active === "notify" && (
                <NotificationsView
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