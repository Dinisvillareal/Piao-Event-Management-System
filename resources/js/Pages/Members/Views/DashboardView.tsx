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

  const formatDate = (dateStr: string): string => {
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

  // Only show UNREAD notifications (read = false)
  const unreadNotifications = useMemo(() => {
    return [...notifications]
      .filter(n => !n.read)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [notifications]);

  const latestEvents = useMemo(() => {
    return [...upcomingEvents].slice(0, 5);
  }, [upcomingEvents]);

  return (
    <>
      <div className="rounded-[24px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
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
          onClick={() => setActive("qr")}
        />
        <SummaryCard
          value={attendedCount}
          title="Events Attended"
          gradient="from-[#067a7a] to-[#5fd3d3]"
          onClick={() => setActive("events")}
        />
        <SummaryCard
          value={missedCount}
          title="Events Missed"
          gradient="from-yellow-300 to-orange-400"
          onClick={() => setActive("events")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        
        {/* Latest Notifications - Only UNREAD notifications */}
        <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#005f63]">Latest Notifications</h2>
              <p className="mt-1 text-gray-600">Unread announcements from barangay staff.</p>
            </div>
            <button
              onClick={() => setActive("notify")}
              className="text-sm text-[#005f63] hover:underline font-medium transition-colors"
            >
              View all →
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
            style={{ maxHeight: "220px" }}
          >
            {unreadNotifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-base">No unread notifications</p>
                <p className="text-sm mt-1">You're all caught up!</p>
              </div>
            ) : (
              unreadNotifications.map((item) => {
                const { staffName, title, actualMessage } = parseMessage(item.message);
                
                return (
                  <div
                    key={item.id}
                    className="relative rounded-xl px-4 py-3 border-l-4 border-l-[#ecd862] bg-[#f7f2e8] transition-all duration-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0 flex items-center gap-2 text-sm flex-wrap">
                        {staffName && (
                          <span className="whitespace-nowrap shrink-0 font-bold text-gray-900">
                            {staffName}
                          </span>
                        )}
                        {staffName && <span className="text-gray-400 shrink-0">•</span>}
                        <span className="truncate font-bold text-[#005f63]">
                          {title}
                        </span>
                        {actualMessage && (
                          <>
                            <span className="text-gray-400 shrink-0">—</span>
                            <span className="truncate text-gray-700">
                              {actualMessage}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-xs shrink-0 whitespace-nowrap font-bold text-gray-700">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Events - Clickable */}
        <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#005f63]">Upcoming Events</h2>
              <p className="mt-1 text-gray-600">Events you're eligible to attend.</p>
            </div>
            <button
              onClick={() => setActive("events")}
              className="text-sm text-[#005f63] hover:underline font-medium transition-colors"
            >
              View all →
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
            style={{ maxHeight: "220px" }}
          >
            {latestEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-base">No upcoming events</p>
                <p className="text-sm mt-1">Check back later for updates</p>
              </div>
            ) : (
              latestEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setActive("events")}
                  className="rounded-xl border-l-4 border-orange-400 bg-[#f8f3ee] p-3 transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] cursor-pointer"
                >
                  <h3 className="text-base font-bold text-[#005f63] line-clamp-1">{e.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">{e.date} · {e.location}</p>
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{e.description}</p>
                </div>
              ))
            )}
            {pastEventsCount > 0 && (
              <p className="mt-3 text-sm text-gray-500 text-center">
                {pastEventsCount} past event(s) on record
              </p>
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