import React, { useEffect, useMemo, useState } from "react";

// --- LAYOUT IMPORTS ---
import Sidebar, { NAV, SETTINGS_NAV } from "./components/Sidebar";
import TopHeader from "./components/TopHeader";

// --- VIEW IMPORTS ---
import DashboardView from "./views/DashboardView";
import ScanView from "./views/ScanView";
import ResidentsView from "./views/ResidentsView";
import QRCodesView from "./views/QRCodesView";
import { EventsView } from "./views/EventsView";
import NotificationsView from "./views/NotificationsView";
import ActivityLogsView from "./views/ActivityLogsView";
import ArchiveView from "./views/ArchiveView";
import ReportsView from "./views/ReportsView";
import InventoryView from "./views/InventoryView";
import BudgetView from "./views/BudgetView";
import IntegrationsView from "./views/IntegrationsView";
import ProfilingSettingsView from "./views/ProfilingSettingsView";
import OfflineBanner from "../../components/ui/OfflineBanner";
import api from "../../lib/api";

// --- TYPES & MOCK DATA ---
export type Resident = { id: string; name: string; age: number; address: string; contact: string; };
export type Membership = { id: string; name: string; description: string; codeId?: string; note?: string; verified?: boolean; memberIds: string[]; };
export type Notification = { id: number; title: string; body: string; sentAt: string; };
export type AttendanceRecord = { id: number; eventTitle: string; eventDate: string; location: string; timeIn: string; timeOut: string; status: string; };
export type TrashedItem = {
  id: string | number;
  type: 'event' | 'resident' | 'membership' | 'notification';
  name: string;
  deletedAt: string;
  deletedBy: string;
};

export const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark> : part
  );
};

// --------------------------
// MAIN COMPONENT
// --------------------------
export default function StaffDashboard() {
  const getInitialActive = () => {
    const path = window.location.pathname;
    const lastSegment = path.split('/').pop() || "";
    const allNavItems = [...NAV, ...SETTINGS_NAV];
    // Match on the friendly URL "path" first (e.g. "notifications"), and
    // fall back to the internal "key" (e.g. "notify") so older bookmarked
    // or previously-shared /staff/... links still resolve correctly.
    const matched = allNavItems.find((item) => item.path === lastSegment || item.key === lastSegment);
    return matched ? matched.key : "dashboard";
  };

  const [active, setActiveState] = useState(getInitialActive());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [eventsCount, setEventsCount] = useState(0);
  const [upcomingEventsList, setUpcomingEventsList] = useState<any[]>([]);
  const [pastEventsCount, setPastEventsCount] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [allResidents, setAllResidents] = useState<any[]>([]);

  // State for refreshing events
  const [refreshEventsTrigger, setRefreshEventsTrigger] = useState(0);

  // ✅ ADD THIS - State for current logged-in user
  const [currentUser, setCurrentUser] = useState<any>(null);

  const setActive = (page: string, path?: string) => {
    window.history.pushState({}, "", `/admin/${path ?? page}`);
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

  const [membershipOptions, setMembershipOptions] = useState<Membership[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);

  const getMembershipName = (id: string | number | null | undefined) => {
    if (!id) return "";
    const found = membershipOptions.find((m) => String(m.id) === String(id));
    return found?.name || "";
  };

  const fetchEventsCount = async () => {
    try {
      const response = await api.get('/events-data');
      const result = response.data;

      if (result.data) {
        const now = new Date();
        const upcoming = result.data.filter((event: any) => new Date(event.event_start) >= now);
        const past = result.data.filter((event: any) => new Date(event.event_start) < now);

        setEventsCount(result.data.length);
        setUpcomingEventsList(upcoming);
        setPastEventsCount(past.length);
      }
    } catch (error) {
      console.error("Error fetching events count:", error);
      setEventsCount(0);
      setUpcomingEventsList([]);
      setPastEventsCount(0);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEventsCount();
  }, []);

  // ✅ ADD THIS - Fetch current logged-in user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await api.get('/me');
        setCurrentUser(response.data);
      } catch (error) {
        console.error('Error fetching current user:', error);
      }
    };

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const fetchMemberships = async () => {
      try {
        const response = await api.get('/api/memberships');
        const data = response.data;
        setMembershipOptions(data?.data ?? data ?? []);
      } catch (error) {
        console.error('Failed to fetch memberships:', error);
        setMembershipOptions([]);
      }
    };

    fetchMemberships();
  }, []);

  useEffect(() => {
    const fetchRealResidents = async () => {
      try {
        const response = await api.get('/membership-residents');
        setAllResidents(response.data);
      } catch (error) {
        console.error('Error fetching real residents:', error);
      }
    };

    fetchRealResidents();
  }, []);

  // Listen for refreshEvents from Archive
  useEffect(() => {
    const handleRefreshEvents = () => {
      console.log("🔄 Received refreshEvents - forcing events reload");
      setRefreshEventsTrigger(prev => prev + 1);
    };

    window.addEventListener('refreshEvents', handleRefreshEvents);

    return () => {
      window.removeEventListener('refreshEvents', handleRefreshEvents);
    };
  }, []);

  // Modified - Added refreshEventsTrigger to dependencies
  useEffect(() => {
    const fetchRealEvents = async () => {
      try {
        const response = await api.get('/events-data');
        const result = response.data;

        if (result.data) {
          const formattedEvents = result.data.map((dbEvent: any) => {
            let membershipIds: any[] = [];
          if (Array.isArray(dbEvent.membership_ids)) {
            membershipIds = dbEvent.membership_ids;
          } else if (typeof dbEvent.membership_ids === 'string' && dbEvent.membership_ids.startsWith('[')) {
            try { membershipIds = JSON.parse(dbEvent.membership_ids); } catch(e) {}
          } else if (dbEvent.membership_id) {
            membershipIds = [dbEvent.membership_id]; // Fallback to your old column
          }
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
              event_start: dbEvent.event_start,
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
  }, [membershipOptions, refreshEventsTrigger]);

  const handleDeleteEvent = async (id: string | number) => {
    if (!window.confirm('Delete this event? It will be moved to Trash.')) {
      return;
    }

    try {
      await api.delete(`/events/${id}`);

      setAllEvents((prev) => prev.filter((e) => e.id !== id));
      setEventsCount(prev => Math.max(0, prev - 1));

      alert('Event moved to Trash successfully!');
    } catch (error: any) {
      console.error('Error deleting event:', error);
      alert(error?.response?.data?.message || 'Error deleting event');
    }
  };

  // ✅ Get the display name from currentUser or fallback to staff.name
  const displayName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}`
    : staff.name;

  return (
    <div className="flex min-h-screen bg-[#fcfcf9] text-gray-900">
      <Sidebar
        active={active}
        setActive={setActive}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <main className="flex-1 min-w-0">
        <TopHeader
          memberName={displayName}
          role={staff.role}
          onMenuClick={() => setMobileSidebarOpen(true)}
          userId={currentUser?.id}
        />
        <OfflineBanner />

        <div className="h-[calc(100vh-73px)] overflow-y-auto p-3 sm:p-6 smooth-scroll">
          {active === "dashboard" && (
            <DashboardView
              membershipsCount={membershipOptions.length}
              eventsCount={eventsCount}
              upcomingEvents={upcomingEventsList}
              pastEventsCount={pastEventsCount}
              setActive={setActive}
            />
          )}
         {active === "scan" && <ScanView events={allEvents} residents={allResidents} memberships={membershipOptions} />}
          {active === "residents" && <ResidentsView />}
          {active === "memberships" && <QRCodesView highlightText={highlightText} />}
          {active === "events" && <EventsView allEvents={allEvents} onDeleteEvent={handleDeleteEvent} highlightText={highlightText} memberships={membershipOptions} />}
          {active === "notify" && <NotificationsView memberships={membershipOptions} highlightText={highlightText} />}
          {active === "reports" && <ReportsView memberships={membershipOptions} />}
          {active === "inventory" && <InventoryView />}
          {active === "budget" && <BudgetView allEvents={allEvents} />}
          {active === "activitylogs" && <ActivityLogsView />}
          {active === "archive" && <ArchiveView/>}
          {active === "integrations" && <IntegrationsView />}
          {active === "profiling" && <ProfilingSettingsView />}
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
