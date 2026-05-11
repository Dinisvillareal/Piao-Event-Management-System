import { useEffect, useMemo, useState } from "react";
import SearchBar from "../../Components/UI/SearchBar";
import SummaryCard from "../../Components/UI/SummaryCard";
import FakeQR from "../../Components/UI/FakeQR";
import Sidebar from "../../Components/Layout/Sidebar";
import TopHeader from "../../Components/Layout/TopHeader";
import SettingsView from "./Views/SettingsView";
import DashboardView from "./Views/DashboardView";
import QRCodesView from "./Views/QRCodesView";
import AttendanceView from "./Views/AttendanceView";
import NotificationsView from "./Views/NotificationsView";
import EventsView from "./Views/EventsView";
import {} from "lucide-react";

export default function MemberDashboard() {
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

  // ✅ Delete event handler
  const handleDeleteEvent = (id: number) => {
  setUpcomingEvents(prev => prev.filter(e => e.id !== id));
  setPastEvents(prev => prev.filter(e => e.id !== id));
};


  const attended = attendanceRecords.filter(r => r.status === "complete").length;
  const missed = attendanceRecords.filter(r => r.status === "missed").length;


  return (
    <div className="min-h-screen bg-[#fcfcf9] text-gray-900">
      <div className="flex min-h-screen">

        <Sidebar active={active} setActive={setActive} />

        {/* MAIN */}
        <main className="flex-1">


        <TopHeader memberName={member.name} />

          {/* CONTENT — ✅ Make main content scrollable so header stays fixed + smooth scroll */}
          <div
            className="h-[calc(100vh-73px)] overflow-y-auto smooth-scroll"
            style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}
          >
            <div className="space-y-5 p-5">
              {/* DASHBOARD */}
              {active === "dashboard" && (
                <DashboardView
                  memberName={member.name.split(" ")[0]}
                  membershipsCount={memberships.length}
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

             {/* ATTENDANCE PAGE */}
              {active === "attendance" && (
                <AttendanceView 
                  attendanceRecords={attendanceRecords} 
                  highlightText={highlightText} 
                />
              )}

              {/* EVENTS PAGE */}
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
