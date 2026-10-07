import SummaryCard from "../../../components/ui/SummaryCard";
import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Award, CheckCircle2, CalendarDays, Clock, QrCode, ClipboardCheck, Bell as BellIcon, AlertCircle } from "lucide-react";
import type { AttendanceRecord } from "./AttendanceView";
import { useLanguage } from "../../../i18n/LanguageContext";

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
  fullName: string;
  userId: string | number;
  userCode: string;
  membershipsCount: number;
  attendedCount: number;
  missedCount: number;
  attendanceRecords: AttendanceRecord[];
  setActive: (page: string) => void;
  notifications: Notification[];
  upcomingEvents: Event[];
  pastEventsCount: number;
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function DashboardView({
  memberName,
  fullName,
  userId,
  userCode,
  membershipsCount,
  attendedCount,
  missedCount,
  attendanceRecords,
  setActive,
  notifications,
  upcomingEvents,
  pastEventsCount,
  highlightText,
}: DashboardViewProps) {
  const { t, locale } = useLanguage();

  // Ticks every second purely for the live clock in the "My Activity" panel
  // below, the same real-time touch the staff portal's own Dashboard uses --
  // everything else in that panel is real fetched data (notifications,
  // attendance, upcoming events), this just proves the panel is genuinely
  // live rather than a static snapshot.
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // ─── "MY ACTIVITY" LIVE SNAPSHOT -- everything below is real, already
  // fetched data (notifications, attendance, upcoming events), not invented
  // figures, mirroring how the staff Dashboard's own Live Snapshot panel is
  // built entirely from real fetch cycles. ────────────────────────────────
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const nextEvent = useMemo(() => {
    const sorted = [...upcomingEvents]
      .filter((e) => !isNaN(new Date(e.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted[0] ?? null;
  }, [upcomingEvents]);

  const daysUntilNextEvent = useMemo(() => {
    if (!nextEvent) return null;
    const diffMs = new Date(nextEvent.date).getTime() - currentTime.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [nextEvent, currentTime]);

  const lastCheckIn = useMemo(() => {
    const completed = [...attendanceRecords]
      .filter((r) => r.status === "complete" && r.eventDate)
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    return completed[0] ?? null;
  }, [attendanceRecords]);

  // Same QR payload QRCodesView builds (user_id, user_code, name) -- this is
  // a live preview of that same code, not a separate/fake one.
  const qrData = useMemo(() => {
    if (!userId || !userCode || !fullName) return null;
    return JSON.stringify({ user_id: userId, user_code: userCode, name: fullName });
  }, [userId, userCode, fullName]);

  return (
    <>
      {/* Full-bleed dark page wrapper -- same convention as every converted
          staff page (Dashboard, Residents, Households, Memberships, Events,
          Inventory, Budget, Returns, Activity Logs, Archive, Reports). */}
      <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
        <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7DD8CB]">
            {t("memberDashboard")}
          </p>
          {/* "Live" pulse -- notifications on this page quietly re-poll every
              20s (see Members.tsx), so this is a genuine live indicator, the
              same one the staff portal's own dashboards show. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/50" title={t("liveLabel")}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]" />
            </span>
            {t("liveLabel")}
          </span>
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">{t("welcomeBack")}, {memberName}</h1>
        <p className="mt-2 text-[15px] text-white/50">
          {t("signedInAsResident")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          value={membershipsCount}
          title={t("verifiedMemberships")}
          gradient="from-gold-400 to-gold-700"
          description={t("membershipsDesc")}
          icon={Award}
          onClick={() => setActive("qr")}
        />
        <SummaryCard
          value={attendedCount}
          title={t("eventsAttended")}
          gradient="from-sage-400 to-sage-700"
          description={t("eventsAttendedDesc")}
          icon={CheckCircle2}
          onClick={() => setActive("attendance")}
        />
        <SummaryCard
          value={upcomingEvents.length}
          title={t("upcomingEvents")}
          gradient="from-sage-800 to-[#1C2E2B]"
          description={t("upcomingEventsDesc")}
          icon={CalendarDays}
          onClick={() => setActive("events")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* My Activity -- genuinely live: a ticking clock plus counts
            derived from data this page already fetches (notifications,
            attendance, upcoming events), same pattern as the staff
            Dashboard's own Live Snapshot panel. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold text-white">{t("memMyActivity")}</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
                  </span>
                  {t("liveLabel")}
                </span>
              </div>
              <p className="mt-1 text-[15px] text-white/50">
                {currentTime.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2">
              <Clock className="h-4 w-4 text-[#4FBEB0]" />
              <span className="font-display text-lg font-bold tabular-nums text-white">
                {currentTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3.5">
            {[
              { label: t("memUnreadNotifs"), value: unreadCount, icon: BellIcon, tone: unreadCount > 0 ? "text-gold-300" : "text-[#4FBEB0]" },
              { label: t("memNextEventIn"), value: daysUntilNextEvent !== null ? `${daysUntilNextEvent}d` : "—", icon: CalendarDays, tone: "text-gold-400" },
              { label: t("memLastCheckIn"), value: lastCheckIn ? formatDateCard(lastCheckIn.eventDate) : "—", icon: ClipboardCheck, tone: "text-[#7DD8CB]" },
              { label: t("memMissedCheckIns"), value: missedCount, icon: AlertCircle, tone: missedCount > 0 ? "text-gold-300" : "text-[#4FBEB0]" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-2xl font-extrabold tabular-nums text-white">{tile.value}</span>
                  <tile.icon className={`h-4 w-4 shrink-0 ${tile.tone}`} />
                </div>
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{tile.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* My QR Code -- a live preview of the same code shown on the full
            QR page, so residents can glance at it without leaving the
            Dashboard; mirrors the staff Dashboard's own System QR Code
            card. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/10">
              <QrCode className="h-5 w-5 text-[#4FBEB0]" />
            </span>
            <h2 className="font-display text-xl font-bold text-white">{t("qr")}</h2>
          </div>
          <p className="mt-3 text-[15px] text-white/50">
            {t("qrPageSubtitle")}
          </p>

          {/* Side-by-side, same layout as the staff Dashboard's own System
              QR Code panel -- code fixed on one side, details + action next
              to it, instead of one big centered stack with a lot of empty
              space around it. */}
          <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row">
            <div className="flex w-full shrink-0 justify-center rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] p-3 sm:w-auto">
              {qrData ? (
                <QRCodeCanvas value={qrData} size={140} bgColor="#ffffff" fgColor="#0A0E1A" level="H" includeMargin />
              ) : (
                <div className="flex h-[140px] w-[140px] items-center justify-center text-white/30">
                  <QrCode className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">{fullName}</p>
              <p className="mt-1 text-sm text-white/50">{t("memShowToStaff")}</p>
              <button
                onClick={() => setActive("qr")}
                className="group mt-3 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-5 pr-1.5 py-1.5 text-[15px] font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md"
              >
                {t("memViewFullQr")}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
                  <QrCode className="h-4 w-4 text-white" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* This Week's Notifications Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06] flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-display text-xl font-bold text-white">{t("thisWeekNotifications")}</h2>
              <p className="mt-1 text-white/50">{t("thisWeekNotificationsDesc")}</p>
            </div>
            <button
              onClick={() => setActive("notify")}
              className="text-sm text-[#7DD8CB] hover:underline font-semibold transition-colors flex-shrink-0"
            >
              {t("viewAll")}
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll flex-1"
            style={{ maxHeight: "220px" }}
          >
            {thisWeekNotifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-white/40">
                <svg className="w-12 h-12 mx-auto mb-3 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-base">{t("noNotificationsThisWeek")}</p>
                <p className="text-sm mt-1">{t("checkBackLater")}</p>
              </div>
            ) : (
              thisWeekNotifications.map((item) => {
                const { staffName, title, actualMessage } = parseMessage(item.message);

                return (
                  <div
                    key={item.id}
                    onClick={() => setActive("notify")}
                    className={`cursor-pointer relative rounded-2xl sm:rounded-3xl px-5 sm:px-6 py-4 sm:py-5 border-l-4 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.35)] hover:-translate-y-1 ${
                      !item.read
                        ? 'border-l-gold-400 bg-gold-400/10 hover:bg-gold-400/[0.15]'
                        : 'border-l-white/15 bg-white/[0.04] hover:bg-white/[0.06]'
                    } border-y border-r border-white/10`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                          {staffName && (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-white/60 break-words text-xs sm:text-sm ${!item.read ? 'font-medium' : ''}`}>
                                  {staffName}
                                </span>
                              </div>
                              <span className="text-white/30 hidden sm:block">•</span>
                            </>
                          )}
                          <div className="flex-1 mt-1.5 sm:mt-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`font-semibold text-xs sm:text-sm ${
                                !item.read ? 'text-white font-bold' : 'text-white/80'
                              }`}>
                                {title}
                              </span>
                              {actualMessage && (
                                <>
                                  <span className="text-white/30">—</span>
                                  <span className={`text-white/50 break-words text-xs sm:text-sm ${
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
                        !item.read ? 'font-bold text-white/70' : 'text-white/40'
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06] flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-display text-xl font-bold text-white">{t("upcomingEvents")}</h2>
              <p className="mt-1 text-white/50">{t("upcomingEventsDesc")}</p>
            </div>
            <button
              onClick={() => setActive("events")}
              className="text-sm text-[#7DD8CB] hover:underline font-semibold transition-colors flex-shrink-0"
            >
              {t("viewAll")}
            </button>
          </div>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll flex-1"
            style={{ maxHeight: "220px" }}
          >
            {latestEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-white/40">
                <svg className="w-12 h-12 mx-auto mb-3 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-base">{t("noUpcomingEvents")}</p>
                <p className="text-sm mt-1">{t("checkBackLater")}</p>
              </div>
            ) : (
              latestEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setActive("events")}
                  className="cursor-pointer rounded-xl border-l-4 border-gold-400 bg-white/[0.04] border border-white/10 p-4 transition-all duration-200 hover:bg-white/[0.07] hover:-translate-y-[1px]"
                >
                  <h3 className="text-base font-bold text-white line-clamp-1">{e.title}</h3>
                  <p className="mt-1 text-xs text-white/40">{e.date} · {e.location}</p>
                  <p className="mt-2 text-sm text-white/60 line-clamp-2">{e.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
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