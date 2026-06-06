import SummaryCard from "../../../Components/UI/SummaryCard";
import { useMemo } from "react";

interface Notification {
  id: number;
  title: string;
  message: string;
  created_at: string;
  is_updated: boolean;
  read: boolean;
}

interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  description: string;
}

interface DashboardViewProps {
  memberName: string;
  membershipsCount: number;
  attendedCount: number;
  missedCount: number;
  setActive: (page: string) => void;
  notifications: Notification[];
  upcomingEvents: Event[];
  pastEventsCount: number;
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function DashboardView({
  memberName,
  membershipsCount,
  attendedCount,
  missedCount,
  setActive,
  notifications,
  upcomingEvents,
  pastEventsCount,
  highlightText,
}: DashboardViewProps) {

  const formatDateCard = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const parseMessage = (message: string): { staffName: string; title: string; actualMessage: string } => {
    if (!message) return { staffName: '', title: '', actualMessage: '' };

    const parts = message.split(' • ');
    if (parts.length >= 2) {
      const staffName = parts[0];
      const rest = parts.slice(1).join(' • ');

      if (rest.includes(' — ')) {
        const restParts = rest.split(' — ');
        const title = restParts[0];
        const actualMessage = restParts.slice(1).join(' — ');
        return { staffName, title, actualMessage };
      }
      return { staffName, title: rest, actualMessage: '' };
    }
    return { staffName: '', title: message, actualMessage: '' };
  };

  // Show notifications from THIS WEEK only (Sunday to Saturday) - show 4 items
  const thisWeekNotifications = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
    endOfWeek.setHours(23, 59, 59, 999);
    
    return [...notifications]
      .filter(n => {
        const date = new Date(n.created_at);
        return date >= startOfWeek && date <= endOfWeek;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4); // ✅ Changed from 5 to 4
  }, [notifications]);

  // Show upcoming events - show 4 items
  const latestEvents = useMemo(() => {
    return [...upcomingEvents].slice(0, 4); // ✅ Changed from 5 to 4
  }, [upcomingEvents]);

  return (
    <>
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          Member Dashboard
        </p>
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}!</h1>
        <p className="mt-2 text-base text-white/90">
          You are signed in as a resident member.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          value={membershipsCount}
          title="Verified Memberships"
          gradient="from-orange-400 to-yellow-300"
          description="Membership programs you are enrolled in"
          onClick={() => setActive("qr")}
        />
        <SummaryCard
          value={attendedCount}
          title="Events Attended"
          gradient="from-[#067a7a] to-[#5fd3d3]"
          description="Events you have successfully checked in to"
          onClick={() => setActive("attendance")}
        />
        <SummaryCard
          value={upcomingEvents.length}
          title="Upcoming Events"
          gradient="from-yellow-300 to-orange-400"
          description="Events you're eligible to attend"
          onClick={() => setActive("events")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* This Week's Notifications Card */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-black text-[#005f63]">This Week's Notifications</h2>
              <p className="mt-1 text-gray-600">Latest announcements from this week.</p>
            </div>
            <button
              onClick={() => setActive("notify")}
              className="text-sm text-[#005f63] hover:underline font-medium transition-colors flex-shrink-0"
            >
              View all →
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll flex-1"
            style={{ maxHeight: "220px" }}
          >
            {thisWeekNotifications.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-base">No notifications this week</p>
                <p className="text-sm mt-1">Check back later for updates</p>
              </div>
            ) : (
              thisWeekNotifications.map((item) => {
                const { staffName, title, actualMessage } = parseMessage(item.message);

                return (
                  <div
                    key={item.id}
                    onClick={() => setActive("notify")}
                    className={`cursor-pointer relative rounded-2xl sm:rounded-3xl px-5 sm:px-6 py-4 sm:py-5 border-l-4 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.18)] hover:-translate-y-1 ${
                      !item.read 
                        ? 'border-l-[#ecd862] bg-[#f8f3ee] hover:bg-[#fef8e8]' 
                        : 'border-l-gray-300 bg-white hover:bg-gray-50'
                    } border-y border-r border-gray-200`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                          {staffName && (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-gray-700 break-words text-xs sm:text-sm ${!item.read ? 'font-medium' : ''}`}>
                                  {staffName}
                                </span>
                              </div>
                              <span className="text-gray-400 hidden sm:block">•</span>
                            </>
                          )}
                          <div className="flex-1 mt-1.5 sm:mt-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`font-semibold text-xs sm:text-sm ${
                                !item.read ? 'text-[#005f63] font-bold' : 'text-[#005f63]'
                              }`}>
                                {title}
                              </span>
                              {actualMessage && (
                                <>
                                  <span className="text-gray-400">—</span>
                                  <span className={`text-gray-600 break-words text-xs sm:text-sm ${
                                    !item.read ? 'font-medium' : ''
                                  }`}>
                                    {actualMessage}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className={`shrink-0 text-xs whitespace-nowrap ${
                        !item.read ? 'font-bold text-gray-700' : 'text-gray-500'
                      }`}>
                        {formatDateCard(item.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Events Card */}
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-black text-[#005f63]">Upcoming Events</h2>
              <p className="mt-1 text-gray-600">Events you're eligible to attend.</p>
            </div>
            <button
              onClick={() => setActive("events")}
              className="text-sm text-[#005f63] hover:underline font-medium transition-colors flex-shrink-0"
            >
              View all →
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll flex-1"
            style={{ maxHeight: "220px" }}
          >
            {latestEvents.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-base">No upcoming events</p>
                <p className="text-sm mt-1">Check back later for updates</p>
              </div>
            ) : (
              latestEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setActive("events")}
                  className="cursor-pointer rounded-3xl border-l-4 border-[#f8e67d] bg-white p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-[1px]"
                >
                  <h3 className="text-base font-bold text-[#005f63] line-clamp-1">{e.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">{e.date} · {e.location}</p>
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{e.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
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
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}