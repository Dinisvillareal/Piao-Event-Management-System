//LAST WORKING IMPLEMENTATION
// import { useEffect, useMemo, useState } from "react";
// import Sidebar from "../../components/layout/Sidebar";
import { highlightMatches } from "../../lib/highlight";
// import TopHeader from "../../components/layout/TopHeader";
// import SettingsView from "./views/SettingsView";
// import DashboardView from "./views/DashboardView";
// import QRCodesView from "./views/QRCodesView";
// import AttendanceView, { AttendanceRecord } from "./views/AttendanceView";
// import NotificationsView from "./views/NotificationsView";
// import EventsView from "./views/EventsView";
// import OfflineBanner from "../../components/ui/OfflineBanner";
// import FeedbackPrompt from "../../components/ui/FeedbackPrompt";
// import Skeleton from "../../components/ui/Skeleton";
// import api from "../../lib/api";

// export default function MemberDashboard() {
//   const currentPath = window.location.pathname.replace('/', '');
//   const [active, setActiveState] = useState(currentPath || "dashboard");
//   const [member, setMember] = useState({
//     id: "",
//     name: "",
//     first_name: "",
//     last_name: "",
//     user_code: ""
//   });
//   const [loading, setLoading] = useState(true);
//   const [memberships, setMemberships] = useState([]);
//   const [userMemberships, setUserMemberships] = useState<any[]>([]);
//   const [userMembershipsCount, setUserMembershipsCount] = useState(0);
//   const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
//   const [myFeedback, setMyFeedback] = useState<{ id: number; event_id: number; rating: number; comment: string | null }[]>([]);
//   const [attended, setAttended] = useState(0);
//   const [missed, setMissed] = useState(0);
//   const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
//   const [pastEvents, setPastEvents] = useState<any[]>([]);
//   const [notifications, setNotifications] = useState<any[]>([]);
//   const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

//   const parseApiDate = (value: string) => {
//     if (!value) return new Date(0);
//     return new Date(value.replace(" ", "T"));
//   };

//   const allEvents = useMemo(() => [
//     ...(Array.isArray(upcomingEvents) ? upcomingEvents : []),
//     ...(Array.isArray(pastEvents) ? pastEvents : [])
//   ], [upcomingEvents, pastEvents]);

//   // Helper function to safely parse JSON responses
//   const safeJsonParse = async (response: Response) => {
//     const contentType = response.headers.get("content-type");
//     if (!contentType || !contentType.includes("application/json")) {
//       console.error("Expected JSON but got:", contentType);
//       throw new Error("Server returned HTML instead of JSON");
//     }
//     return response.json();
//   };

//   // Fetch notifications function (reusable)
//   const fetchNotifications = async () => {
//     try {
//       const response = await api.get('/notifications');
//       const data = response.data;
//       {
//         const notificationsData = data.data || data || [];
//         setNotifications(notificationsData.map((notification: any) => ({
//           id: notification.id,
//           title: notification.title,
//           message: notification.message || notification.body,
//           created_at: notification.created_at,
//           is_updated: notification.is_updated,
//           read: notification.read || false,
//           updated_at_notification: notification.updated_at_notification,
//         })));
//       }
//     } catch (error) {
//       console.error('Failed to fetch notifications:', error);
//     }
//   };

//   // ─── POPSTATE (browser back/forward) ────────────────────────────────────────
//   useEffect(() => {
//     const handlePopState = () => {
//       const path = window.location.pathname.replace('/', '') || "dashboard";
//       setActiveState(path);
//     };
//     window.addEventListener("popstate", handlePopState);
//     return () => window.removeEventListener("popstate", handlePopState);
//   }, []);

//   // ─── REFETCH NOTIFICATIONS WHEN RETURNING TO DASHBOARD ───────────────────────
//   useEffect(() => {
//     if (active === "dashboard") {
//       fetchNotifications();
//     }
//   }, [active]);

//   // ─── LIVE NOTIFICATION POLLING (Notifications page) ─────────────────────────
//   // Quietly re-checks for new notifications every 20s while the member is on
//   // the Notifications page -- the Dashboard's own notification refresh is
//   // folded into the broader "LIVE DASHBOARD POLLING" effect further down, so
//   // it doesn't run twice while the member is on the Dashboard.
//   useEffect(() => {
//     if (active !== "notify") return;
//     const poll = setInterval(fetchNotifications, 20000);
//     return () => clearInterval(poll);
//   }, [active]);

//   // ─── FETCH LOGGED-IN USER ────────────────────────────────────────────────────
//   useEffect(() => {
//     api.get('/me')
//       .then((res) => {
//         const user = res.data;
//         setMember({
//           id: user.id,
//           name: `${user.first_name} ${user.last_name}`,
//           first_name: user.first_name,
//           last_name: user.last_name,
//           user_code: user.user_code || ''
//         });
//       })
//       .catch((err) => {
//         // The shared axios instance already redirects to "/" on 401/419.
//         console.error("Failed to fetch user:", err);
//       })
//       .finally(() => {
//         setLoading(false);
//       });
//   }, []);

//   // ─── FETCH ALL MEMBERSHIP TYPES (for QR Codes view) ─────────────────────────
//   useEffect(() => {
//     api.get('/api/memberships')
//       .then((res) => {
//         const data = res.data;
//         setMemberships(data.data || data || []);
//       })
//       .catch(err => {
//         console.error('Failed to fetch memberships:', err);
//         setMemberships([]);
//       });
//   }, []);

//   // Fetch events function (reusable -- also re-run by the live dashboard poll below)
//   const fetchEvents = async () => {
//     // ✅ NEW: Get portal mode from storage
//     const portalMode = localStorage.getItem("portalMode") || sessionStorage.getItem("portalMode") || "member";

//     try {
//       const res = await api.get('/events-data', { headers: { 'X-Portal-Mode': portalMode } });
//       const data = res.data;
//       if (!data?.data) {
//         console.error('No events returned:', data);
//         return;
//       }

//       const now = new Date();

//       const formattedEvents = data.data.map((event: any) => ({
//         id: event.id,
//         title: event.name,
//         date: event.event_start,
//         event_start: event.event_start,
//         event_end: event.event_end,
//         location: event.location,
//         description: event.description,
//         membership_ids: Array.isArray(event.membership_ids) ? event.membership_ids : [],
//         memberships: Array.isArray(event.memberships) ? event.memberships : [],
//         notificationMessage: event.notification_message,
//         membershipNames: event.memberships?.map((m: any) => m.name) || [],
//         startDate: event.event_start?.split(" ")[0],
//         startTime: new Date(event.event_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
//       }));

//       const upcoming = formattedEvents.filter((e: any) => parseApiDate(e.date) >= now);
//       const past = formattedEvents.filter((e: any) => parseApiDate(e.date) < now);

//       setUpcomingEvents(upcoming);
//       setPastEvents(past);
//     } catch (err) {
//       console.error('Failed to fetch events:', err);
//     }
//   };

//   // Fetch the signed-in member's own membership count (reusable)
//   const fetchUserMembershipsCount = async (memberId: string) => {
//     try {
//       const res = await api.get(`/membership-residents/${memberId}`, { params: { per_page: 100 } });
//       const data = res.data;
//       setUserMembershipsCount(data.total || data.memberships?.length || 0);
//       setUserMemberships(Array.isArray(data.memberships) ? data.memberships : []);
//     } catch (err) {
//       console.error('Failed to fetch user memberships count:', err);
//     }
//   };

//   // Fetch the signed-in member's attendance records (reusable)
//   const fetchAttendanceRecords = async (memberId: string) => {
//     try {
//       const res = await api.get(`/attendance/${memberId}`);
//       const data = res.data;
//       if (!Array.isArray(data)) return;

//       const records: AttendanceRecord[] = data.map((item: any) => ({
//         id: item.id,
//         eventId: item.eventId,
//         eventTitle: item.eventTitle ?? '—',      // ✅ Direct property
//         eventDate: item.eventDate ?? '',          // ✅ Direct property
//         location: item.location ?? '—',           // ✅ Direct property
//         timeIn: item.timeIn ?? '',
//         timeOut: item.timeOut ?? '',
//         status: (!item.timeIn && !item.timeOut) ? 'missed' : (item.status?.toLowerCase() ?? 'incomplete'),
//       }));

//       const attendedCount = records.filter(r => r.status === 'complete').length;
//       const missedCount = records.filter(r => r.status === 'missed').length;

//       setAttendanceRecords(records);
//       setAttended(attendedCount);
//       setMissed(missedCount);

//       sessionStorage.setItem(`attendance_cache_${memberId}`, JSON.stringify({
//         records: records,
//         attended: attendedCount,
//         missed: missedCount
//       }));
//     } catch (err) {
//       console.error('Failed to fetch attendance:', err);
//     }
//   };

//   // ─── FETCH EVENTS (initial) ──────────────────────────────────────────────────
//   useEffect(() => {
//     fetchEvents();
//   }, []);

//   // ─── FETCH NOTIFICATIONS (initial) ──────────────────────────────────────────
//   useEffect(() => {
//     fetchNotifications();
//   }, []);

//   // ─── FETCH USER'S MEMBERSHIP COUNT (initial) ────────────────────────────────
//   useEffect(() => {
//     if (!member.id) return;
//     fetchUserMembershipsCount(member.id);
//   }, [member.id]);

//   // ─── FETCH ATTENDANCE RECORDS (initial, seeded from session cache first) ────
//   useEffect(() => {
//     if (!member.id) return;

//     const cacheKey = `attendance_cache_${member.id}`;
//     const cachedData = sessionStorage.getItem(cacheKey);
//     if (cachedData) {
//       const parsedData = JSON.parse(cachedData);
//       setAttendanceRecords(parsedData.records);
//       setAttended(parsedData.attended);
//       setMissed(parsedData.missed);
//     }

//     fetchAttendanceRecords(member.id);
//   }, [member.id]);

//   // ─── LIVE DASHBOARD POLLING ──────────────────────────────────────────────────
//   // Keeps the *whole* Dashboard live, not just notifications: while the member
//   // is on the Dashboard, notifications, the events list, membership count and
//   // attendance/check-ins are all quietly re-fetched every 20s, so every number
//   // and card on the page moves on its own -- no manual refresh, no need to
//   // leave and come back -- mirroring the staff portal's own live dashboards.
//   useEffect(() => {
//     if (active !== "dashboard") return;
//     const poll = setInterval(() => {
//       fetchNotifications();
//       fetchEvents();
//       if (member.id) {
//         fetchUserMembershipsCount(member.id);
//         fetchAttendanceRecords(member.id);
//       }
//     }, 20000);
//     return () => clearInterval(poll);
//   }, [active, member.id]);

//   // ─── FETCH MY OWN EVENT FEEDBACK (drives the reviews module on Events) ─────
//   useEffect(() => {
//     if (!member.id) return;

//     api.get('/feedback/mine')
//       .then((res) => setMyFeedback(Array.isArray(res.data) ? res.data : []))
//       .catch((err) => console.error('Failed to fetch my feedback:', err));
//   }, [member.id]);

//   // ─── NAVIGATION ────────────────────────────────────────────────────────────
//   const setActive = (page: string) => {
//     const url = page === "dashboard" ? "/" : `/${page}`;
//     window.history.pushState({}, "", url);
//     setActiveState(page);
//   };

//   // ─── HIGHLIGHT MATCHED SEARCH TEXT ───────────────────────────────────────────
//   const highlightText = (text: string, query: string) => highlightMatches(text, query);

//   // ─── LOADING SCREEN ───────────────────────────────────────────────────────────
//   if (loading) {
//     // Generic dashboard-shell skeleton (header + a KPI strip + a content
//     // block) -- the actual layout isn't known yet at this point (still
//     // waiting to hear back who's signed in), so this is a reasonable
//     // stand-in shape rather than an exact match of any one page.
//     return (
//       <div className="min-h-screen bg-[#0A0E1A] p-6 sm:p-10">
//         <div className="mx-auto max-w-5xl space-y-8">
//           <div className="flex items-center gap-4">
//             <Skeleton className="h-12 w-12 rounded-full" />
//             <div className="space-y-2">
//               <Skeleton className="h-4 w-40" />
//               <Skeleton className="h-3 w-28" />
//             </div>
//           </div>
//           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//             {Array.from({ length: 4 }).map((_, i) => (
//               <Skeleton key={i} className="h-24 rounded-2xl" />
//             ))}
//           </div>
//           <Skeleton className="h-64 rounded-2xl" />
//         </div>
//       </div>
//     );
//   }

//   // ─── RENDER ──────────────────────────────────────────────────────────────────
//   return (
//     <div className="min-h-screen bg-[#0A0E1A] text-white">
//       <div className="flex min-h-screen">
//         <Sidebar
//           active={active}
//           setActive={setActive}
//           mobileOpen={mobileSidebarOpen}
//           onCloseMobile={() => setMobileSidebarOpen(false)}
//         />

//         <main className="flex-1 min-w-0">
//           <TopHeader memberName={member.name} onMenuClick={() => setMobileSidebarOpen(true)} userId={member.id} />
//           <OfflineBanner />
//           <FeedbackPrompt />

//           <div
//             className="h-[calc(100vh-73px)] overflow-y-auto smooth-scroll"
//             style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}
//           >
//             <div className="space-y-5 p-3 sm:p-5">

//               {/* DASHBOARD */}
//               {active === "dashboard" && (
//                 <DashboardView
//                   memberName={member.first_name}
//                   fullName={member.name}
//                   userId={member.id}
//                   userCode={member.user_code}
//                   membershipsCount={userMembershipsCount}
//                   attendedCount={attended}
//                   missedCount={missed}
//                   attendanceRecords={attendanceRecords}
//                   setActive={setActive}
//                   notifications={notifications}
//                   upcomingEvents={upcomingEvents}
//                   pastEventsCount={pastEvents.length}
//                   highlightText={highlightText}
//                 />
//               )}

//               {/* MY QR CODES */}
//               {active === "qr" && (
//                 <QRCodesView
//                   highlightText={highlightText}
//                   userId={member.id}
//                   userCode={member.user_code}
//                   fullName={member.name}
//                 />
//               )}

//               {/* ATTENDANCE */}
//               {active === "attendance" && (
//                 <AttendanceView
//                   attendanceRecords={attendanceRecords}
//                   highlightText={highlightText}
//                   allEvents={allEvents}
//                   userMemberships={userMemberships}
//                 />
//               )}

//               {/* EVENTS */}
//               {active === "events" && (
//                 <EventsView
//                   allEvents={allEvents}
//                   highlightText={highlightText}
//                   allMemberships={memberships}
//                   userMemberships={userMemberships}
//                   attendanceRecords={attendanceRecords}
//                   myFeedback={myFeedback}
//                   onFeedbackSubmitted={(entry) =>
//                     setMyFeedback((prev) => {
//                       const rest = prev.filter((f) => f.event_id !== entry.event_id);
//                       return [...rest, entry];
//                     })
//                   }
//                 />
//               )}

//               {/* NOTIFICATIONS */}
//               {active === "notify" && (
//                 <NotificationsView
//                   highlightText={highlightText}
//                 />
//               )}

//               {/* SETTINGS */}
//               {active === "settings" && (
//                 <SettingsView member={member} />
//               )}

//             </div>
//           </div>
//         </main>
//       </div>

//       <style>{`
//         .smooth-scroll {
//           scroll-behavior: smooth !important;
//           -webkit-overflow-scrolling: touch;
//         }
//         .smooth-scroll::-webkit-scrollbar {
//           width: 6px;
//           height: 6px;
//         }
//         .smooth-scroll::-webkit-scrollbar-track {
//           background: #f1f1f1;
//           border-radius: 10px;
//         }
//         .smooth-scroll::-webkit-scrollbar-thumb {
//           background: #ccc;
//           border-radius: 10px;
//         }
//         .smooth-scroll::-webkit-scrollbar-thumb:hover {
//           background: #aaa;
//         }
//         .shadow-b-sm {
//           box-shadow: 0 2px 4px rgba(0,0,0,0.05);
//         }
//       `}</style>
//     </div>
//   );
// }


import { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/layout/Sidebar";
import TopHeader from "../../components/layout/TopHeader";
import SettingsView from "./views/SettingsView";
import DashboardView from "./views/DashboardView";
import QRCodesView from "./views/QRCodesView";
import AttendanceView, { AttendanceRecord } from "./views/AttendanceView";
import NotificationsView from "./views/NotificationsView";
import EventsView from "./views/EventsView";
import OfflineBanner from "../../components/ui/OfflineBanner";
import FeedbackPrompt from "../../components/ui/FeedbackPrompt";
import Skeleton from "../../components/ui/Skeleton";
import api from "../../lib/api";

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
  const [userMemberships, setUserMemberships] = useState<any[]>([]);
  const [userMembershipsCount, setUserMembershipsCount] = useState(0);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [myFeedback, setMyFeedback] = useState<{ id: number; event_id: number; rating: number; comment: string | null }[]>([]);
  const [attended, setAttended] = useState(0);
  const [missed, setMissed] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [pastEvents, setPastEvents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const parseApiDate = (value: string) => {
    if (!value) return new Date(0);
    return new Date(value.replace(" ", "T"));
  };

  const allEvents = useMemo(() => [
    ...(Array.isArray(upcomingEvents) ? upcomingEvents : []),
    ...(Array.isArray(pastEvents) ? pastEvents : [])
  ], [upcomingEvents, pastEvents]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      const data = response.data;
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
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace('/', '') || "dashboard";
      setActiveState(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (active === "dashboard") fetchNotifications();
  }, [active]);

  useEffect(() => {
    if (active !== "notify") return;
    const poll = setInterval(fetchNotifications, 20000);
    return () => clearInterval(poll);
  }, [active]);

  // Keeps the sidebar's unread badge live on every page: loads once, re-checks
  // every 20s, and refreshes right away when the Notifications page marks
  // something read (it fires "member-notifications-changed").
  // The badge number comes from the server's own unread count. Counting rows of
  // GET /notifications is wrong: that endpoint is paginated (unread first), so the
  // count was capped at one page and, after reading some, the next unread rows slid
  // in and the badge never went down.
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadNotificationCount(Number(res.data?.count) || 0);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    const poll = setInterval(() => { fetchNotifications(); fetchUnreadCount(); }, 20000);
    const onChanged = () => { fetchNotifications(); fetchUnreadCount(); };
    window.addEventListener("member-notifications-changed", onChanged);
    return () => {
      clearInterval(poll);
      window.removeEventListener("member-notifications-changed", onChanged);
    };
  }, []);

  useEffect(() => {
    api.get('/me')
      .then((res) => {
        const user = res.data;
        setMember({
          id: user.id,
          name: `${user.first_name} ${user.last_name}${user.suffix ? `, ${user.suffix}` : ''}`,
          first_name: user.first_name,
          last_name: user.last_name,
          user_code: user.user_code || ''
        });
      })
      .catch((err) => console.error("Failed to fetch user:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get('/api/memberships')
      .then((res) => {
        const data = res.data;
        setMemberships(data.data || data || []);
      })
      .catch(err => {
        console.error('Failed to fetch memberships:', err);
        setMemberships([]);
      });
  }, []);

  const fetchEvents = async () => {
    const portalMode = localStorage.getItem("portalMode") || sessionStorage.getItem("portalMode") || "member";
    try {
      const res = await api.get('/events-data', { headers: { 'X-Portal-Mode': portalMode } });
      const data = res.data;
      if (!data?.data) return;
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
      setUpcomingEvents(formattedEvents.filter((e: any) => parseApiDate(e.date) >= now));
      setPastEvents(formattedEvents.filter((e: any) => parseApiDate(e.date) < now));
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  const fetchUserMembershipsCount = async (memberId: string) => {
    try {
      const res = await api.get(`/membership-residents/${memberId}`, { params: { per_page: 100 } });
      const data = res.data;
      setUserMembershipsCount(data.total || data.memberships?.length || 0);
      setUserMemberships(Array.isArray(data.memberships) ? data.memberships : []);
    } catch (err) {
      console.error('Failed to fetch user memberships count:', err);
    }
  };

  const fetchAttendanceRecords = async (memberId: string) => {
    try {
      const res = await api.get(`/attendance/${memberId}`);
      const data = res.data;
      if (!Array.isArray(data)) return;
      const records: AttendanceRecord[] = data.map((item: any) => ({
        id: item.id,
        eventId: item.eventId,
        eventTitle: item.eventTitle ?? '—',
        eventDate: item.eventDate ?? '',
        location: item.location ?? '—',
        timeIn: item.timeIn ?? '',
        timeOut: item.timeOut ?? '',
        status: (!item.timeIn && !item.timeOut) ? 'missed' : (item.status?.toLowerCase() ?? 'incomplete'),
      }));
      const attendedCount = records.filter(r => r.status === 'complete').length;
      const missedCount = records.filter(r => r.status === 'missed').length;
      setAttendanceRecords(records);
      setAttended(attendedCount);
      setMissed(missedCount);
      sessionStorage.setItem(`attendance_cache_${memberId}`, JSON.stringify({
        records, attended: attendedCount, missed: missedCount
      }));
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    }
  };

  useEffect(() => { fetchEvents(); }, []);
  useEffect(() => { fetchNotifications(); }, []);

  useEffect(() => {
    if (!member.id) return;
    fetchUserMembershipsCount(member.id);
  }, [member.id]);

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
    fetchAttendanceRecords(member.id);
  }, [member.id]);

  useEffect(() => {
    if (active !== "dashboard") return;
    const poll = setInterval(() => {
      fetchNotifications();
      fetchEvents();
      if (member.id) {
        fetchUserMembershipsCount(member.id);
        fetchAttendanceRecords(member.id);
      }
    }, 20000);
    return () => clearInterval(poll);
  }, [active, member.id]);

  useEffect(() => {
    if (!member.id) return;
    api.get('/feedback/mine')
      .then((res) => setMyFeedback(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error('Failed to fetch my feedback:', err));
  }, [member.id]);

  const setActive = (page: string) => {
    const url = page === "dashboard" ? "/" : `/${page}`;
    window.history.pushState({}, "", url);
    setActiveState(page);
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
      ) : (part)
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] p-6 sm:p-10">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      <div className="flex min-h-screen">
        <Sidebar
          active={active}
          setActive={setActive}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          userName={member.name}
          userRole="Member"
          badges={{ notify: unreadNotificationCount }}
        />

        <main className="flex-1 min-w-0 flex flex-col">
          <TopHeader memberName={member.name} onMenuClick={() => setMobileSidebarOpen(true)} userId={member.id} />
          <OfflineBanner />
          <FeedbackPrompt />

          {/* ================================================================
              THE ACTUAL FIX:
              The outer wrapper no longer scrolls itself. It just bounds the
              height. Each view below is now the ONLY scroll container, which
              is what allows its flex-shrink-0 header (containing the
              pagination) to stay pinned while only the list scrolls.
              ================================================================ */}
          <div className="h-[calc(100vh-73px)] overflow-hidden flex-1">
            <div className="h-full">
              {active === "dashboard" && (
                <DashboardView
                  memberName={member.first_name}
                  fullName={member.name}
                  userId={member.id}
                  userCode={member.user_code}
                  membershipsCount={userMembershipsCount}
                  attendedCount={attended}
                  missedCount={missed}
                  attendanceRecords={attendanceRecords}
                  setActive={setActive}
                  notifications={notifications}
                  upcomingEvents={upcomingEvents}
                  pastEventsCount={pastEvents.length}
                  highlightText={highlightText}
                />
              )}

              {active === "qr" && (
                <QRCodesView
                  highlightText={highlightText}
                  userId={member.id}
                  userCode={member.user_code}
                  fullName={member.name}
                />
              )}

              {active === "attendance" && (
                <AttendanceView
                  attendanceRecords={attendanceRecords}
                  highlightText={highlightText}
                  allEvents={allEvents}
                  userMemberships={userMemberships}
                />
              )}

              {active === "events" && (
                <EventsView
                  allEvents={allEvents}
                  highlightText={highlightText}
                  allMemberships={memberships}
                  userMemberships={userMemberships}
                  attendanceRecords={attendanceRecords}
                  myFeedback={myFeedback}
                  onFeedbackSubmitted={(entry) =>
                    setMyFeedback((prev) => {
                      const rest = prev.filter((f) => f.event_id !== entry.event_id);
                      return [...rest, entry];
                    })
                  }
                />
              )}

              {active === "notify" && (
                <NotificationsView highlightText={highlightText} />
              )}

              {active === "settings" && (
                <SettingsView member={member} />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}