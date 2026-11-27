import { useClockFormat } from "../../../lib/clockFormat";
import KpiCard from "../../../components/ui/KpiCard";
import Skeleton from "../../../components/ui/Skeleton";
import React, { useEffect, useMemo, useRef, useState } from "react";
import IdCardFlip from "../../../components/ui/IdCardFlip";
import { renderMemberIdCardSides } from "../../../lib/memberIdCard";
import { useBarangayOfficials } from "../../../lib/barangayOfficials";
import { QRCodeCanvas } from "qrcode.react";
import { Award, CheckCircle2, CalendarDays, Clock, QrCode, ClipboardCheck, Bell as BellIcon, AlertCircle, Settings as SettingsIcon, ArrowUpRight } from "lucide-react";
import type { AttendanceRecord } from "./AttendanceView";
import { useLanguage } from "../../../i18n/LanguageContext";
import { tc } from "../../../lib/contentTranslations";
import FeedWarning from "../../../components/ui/FeedWarning";

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
  /** True until events / attendance first load -- shows the skeleton layout. */
  loading?: boolean;
  /** How many data feeds failed on their last refresh (0 = all good), and the retry for them. */
  failedFeeds?: number;
  lastUpdatedAt?: Date;
  onRetryFeeds?: () => void;
  retryingFeeds?: boolean;
}

/**
 * Page header shared by the loaded dashboard and its skeleton, so the title
 * block never changes (or disappears) while the data underneath loads.
 * Title type matches the staff dashboard's "Welcome back" headline.
 */
function MemberDashboardHeader({ memberName, loading = false }: { memberName: string; loading?: boolean }) {
  const { t } = useLanguage();
  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-80 max-w-full sm:h-10" />
        <Skeleton className="mt-3 h-4 w-64 max-w-full" />
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7DD8CB]">{t("memberDashboard")}</p>
        {/* "Live" pulse -- the page quietly re-polls every 20s (see Members.tsx). */}
        <span className="inline-flex items-center gap-1.5 dash-tile rounded-full px-2.5 py-1 text-[11px] font-medium text-white/50" title={t("liveLabel")}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]" />
          </span>
          {t("liveLabel")}
        </span>
      </div>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-white sm:text-4xl">
        {t("welcomeBack")}, {memberName}
      </h1>
      <p className="mt-2 max-w-md text-[15px] text-white/55">{t("signedInAsResident")}</p>
    </div>
  );
}

/**
 * Skeleton shaped exactly like the loaded member dashboard: header, three
 * stat cards, "My activity" + QR panels, then the notifications + upcoming
 * events lists. Used both while the account loads and while the first
 * events / attendance fetch lands, so the page never jumps.
 */
export function MemberDashboardSkeleton({ memberName = "" }: { memberName?: string }) {
  const { t } = useLanguage();
  const panel = "dash-card rounded-[32px] p-5 sm:p-6";
  return (
    <div className="h-[calc(100dvh-73px)] overflow-y-auto dash-canvas p-4 sm:p-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="px-2">
            <p className="text-sm font-semibold text-white/55">{t("welcomeBack")}</p>
            {memberName ? (
              <p className="truncate font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{memberName}</p>
            ) : (
              <Skeleton className="mt-2 h-9 w-56 max-w-full" />
            )}
          </div>
          <Skeleton className="h-[72px] rounded-[36px]" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className={`${panel} space-y-4`}>
            <Skeleton className="h-7 w-40 rounded-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-6 h-32 rounded-[26px]" />
          </div>
          <div className={`${panel} space-y-4`}>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-[24px]" />
                ))}
              </div>
            </div>
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={`${panel} space-y-3`}>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-[72px] w-full rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
  loading = false,
  failedFeeds = 0,
  lastUpdatedAt = new Date(),
  onRetryFeeds = () => {},
  retryingFeeds = false,
}: DashboardViewProps) {
  const { t, language, locale } = useLanguage();

  // Ticks every second purely for the live clock in the "My Activity" panel
  // below, the same real-time touch the staff portal's own Dashboard uses --
  // everything else in that panel is real fetched data (notifications,
  // attendance, upcoming events), this just proves the panel is genuinely
  // live rather than a static snapshot.
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockHour12, toggleClockHour12] = useClockFormat();
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

  // The next 4 upcoming events, soonest first.
  const latestEvents = useMemo(() => {
    const time = (e: any) => {
      const n = new Date(e.event_start ?? e.date).getTime();
      return isNaN(n) ? Infinity : n;
    };
    return [...upcomingEvents].sort((a, b) => time(a) - time(b)).slice(0, 4);
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
    // user_id is deliberately NOT in the QR; the scanner resolves by user_code.
    return JSON.stringify({ user_code: userCode, name: fullName });
  }, [userId, userCode, fullName]);

  // The same ID card the "My QR Code" page shows (front, turning to the back), not just a plain QR.
  const captainName = useBarangayOfficials().captain?.name ?? "";
  const [contactNumber, setContactNumber] = useState("");
  const hiResQrRef = useRef<HTMLDivElement>(null);
  const [cardSides, setCardSides] = useState<{ front: string; back: string } | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetch(`/membership-residents/${userId}?per_page=1`, {
      credentials: "include", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setContactNumber(d.contact_number || ""); })
      .catch(() => {});
  }, [userId]);
  useEffect(() => {
    if (loading || !userId || !userCode || !fullName) { setCardSides(null); return; }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      const canvas = hiResQrRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      renderMemberIdCardSides(canvas, fullName, userCode, contactNumber, captainName).then((out) => {
        if (!cancelled && out) setCardSides({ front: out.front.toDataURL("image/png", 1.0), back: out.back.toDataURL("image/png", 1.0) });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, [loading, userId, userCode, fullName, contactNumber, captainName]);

  if (loading) return <MemberDashboardSkeleton memberName={fullName || memberName} />;

  const liveBadge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2E8E82]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]" />
      </span>
      {t("liveLabel")}
    </span>
  );

  const quickActions: { label: string; icon: any; onClick: () => void }[] = [
    { label: t("attendance"), icon: ClipboardCheck, onClick: () => setActive("attendance") },
    { label: t("events"), icon: CalendarDays, onClick: () => setActive("events") },
    { label: t("notify"), icon: BellIcon, onClick: () => setActive("notify") },
    { label: t("settings"), icon: SettingsIcon, onClick: () => setActive("settings") },
  ];

  const featuredEvents = latestEvents.slice(0, 3);
  const lastNotification = [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <>
      {/* Same "bento" layout as the staff Overview: greeting + action pill, attention card + live clock,
          upcoming events + stat cards, then the QR code and this week's notifications. */}
      <div className="min-h-[calc(100dvh-73px)] overflow-y-auto bg-[#0A0E1A] p-4 sm:p-8 text-white">
        <div className="mx-auto w-full max-w-[1600px] space-y-5">
          {/* Row 1: greeting + action pill */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex min-w-0 flex-col justify-center px-2">
              <p className="text-sm font-semibold text-white/55">{t("welcomeBack")}</p>
              <p className="truncate font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                <span
                  style={{
                    backgroundImage: "linear-gradient(90deg, #F6D365 0%, #A9C98A 28%, #5BBBA6 55%, #2A8A93 78%, #146088 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                  }}
                >
                  {fullName || memberName}
                </span>
              </p>
            </div>

            {/* Phones: the five quick actions as one row of icon buttons (QR highlighted), like the staff dashboard. */}
            <div className="dash-card grid grid-cols-5 gap-2 rounded-[28px] p-3 sm:hidden">
              {[
                { ...quickActions[0], primary: false },
                { ...quickActions[1], primary: false },
                { ...quickActions[2], primary: false },
                { ...quickActions[3], primary: false },
                { label: t("qr"), icon: QrCode, onClick: () => setActive("qr"), primary: true },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  title={action.label}
                  aria-label={action.label}
                  className={`relative flex h-12 items-center justify-center rounded-2xl transition active:scale-95 ${action.primary ? "bg-[#2E8E82] !text-white shadow-sm" : "bg-white/[0.04] text-[#2E8E82]"}`}
                >
                  <action.icon className="h-5 w-5" />
                  {action.icon === BellIcon && unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F5C451] px-1 text-[10px] font-extrabold text-[#0B0F14]">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="dash-card max-sm:hidden flex flex-wrap items-center gap-x-1 gap-y-2 rounded-[36px] p-3 sm:flex-nowrap">
              {quickActions.slice(0, 3).map((action, i) => (
                <React.Fragment key={action.label}>
                  {i > 0 && <span className="hidden h-7 w-px shrink-0 bg-white/10 sm:block" />}
                  <button
                    onClick={action.onClick}
                    className="dash-tile relative flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full px-3 text-sm font-semibold text-white/85 transition sm:px-4"
                  >
                    <action.icon className="h-5 w-5 shrink-0 text-[#2E8E82]" />
                    <span className="truncate">{action.label}</span>
                    {action.icon === BellIcon && unreadCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F5C451] px-1.5 text-[11px] font-extrabold text-[#0B0F14]">{unreadCount}</span>
                    )}
                  </button>
                </React.Fragment>
              ))}
              <button
                onClick={quickActions[3].onClick}
                className="dash-tile flex min-h-12 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold text-white/85 sm:ml-2"
              >
                <SettingsIcon className="h-4 w-4 text-[#2E8E82]" />
                {quickActions[3].label}
              </button>
              <button
                onClick={() => setActive("qr")}
                className="flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#2E8E82] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#267a70] active:scale-[0.98]"
              >
                <QrCode className="h-4 w-4" />
                {t("qr")}
              </button>
            </div>
          </div>

          <FeedWarning failedCount={failedFeeds} lastOkAt={lastUpdatedAt} onRetry={onRetryFeeds} retrying={retryingFeeds} />

          {/* Row 2: attention card + live clock (left), upcoming events + stat cards (right) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div className="dash-card flex flex-col rounded-[32px] p-3">
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] px-3 py-1.5 text-xs font-bold text-white">
                    <BellIcon className="h-3.5 w-3.5 text-[#F5C451]" />
                    {unreadCount} {t("unreadNotificationsTile")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActive("notify")}
                    aria-label={t("notify")}
                    title={t("notify")}
                    className="dash-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/80"
                  >
                    <ArrowUpRight className="h-5 w-5" />
                  </button>
                </div>
                <h2 className="mt-8 font-display text-2xl font-extrabold leading-tight text-white">
                  {lastNotification ? parseMessage(lastNotification.message).title || t("thisWeekNotifications") : t("noNotificationsThisWeek")}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm text-white/55">
                  {lastNotification ? parseMessage(lastNotification.message).actualMessage || t("thisWeekNotificationsDesc") : t("checkBackLater")}
                </p>
              </div>
              <div className="dash-hero-live relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#F6D365] to-[#146088] p-5 text-[#0B2A3A]">
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/30 blur-3xl" />
                <p className="relative text-sm font-medium text-[#0B2A3A]/75">
                  {currentTime.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
                <button
                  type="button"
                  onClick={toggleClockHour12}
                  title={clockHour12 ? "24-hour" : "12-hour"}
                  aria-label={clockHour12 ? "Switch to 24-hour clock" : "Switch to 12-hour clock"}
                  className="relative mt-3 flex w-fit cursor-pointer select-none items-center gap-2.5 rounded-full bg-white/45 px-5 py-2.5 transition hover:bg-white/60 active:scale-[0.98]"
                >
                  <Clock className="h-4 w-4 text-[#0B2A3A]" />
                  <span className="font-display text-xl font-bold tabular-nums text-[#0B2A3A]">
                    {currentTime.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: clockHour12 })}
                  </span>
                </button>
              </div>
            </div>

            <div className="dash-card rounded-[32px] p-3">
              <div className="grid grid-cols-1 gap-5 p-3 xl:grid-cols-2">
                <div className="flex min-w-0 flex-col">
                  <h2 className="font-display text-2xl font-extrabold leading-tight text-white">{t("upcomingEvents")}</h2>

                  {featuredEvents.length === 0 ? (
                    <p className="mt-5 rounded-2xl bg-white/[0.04] px-5 py-6 text-sm text-white/45">{t("noUpcomingEvents")}</p>
                  ) : (
                    <ul className="mt-5 flex flex-col gap-2.5">
                      {featuredEvents.map((ev, i) => {
                        const d = new Date((ev as any).event_start ?? ev.date);
                        const valid = !isNaN(d.getTime());
                        const first = i === 0;
                        const daysLeft = valid ? Math.max(0, Math.ceil((d.getTime() - currentTime.getTime()) / 86400000)) : 0;
                        const ring = valid ? Math.max(0.06, Math.min(1, 1 - daysLeft / 30)) : 0.06;
                        const circ = 2 * Math.PI * 22;
                        return (
                          <li key={ev.id ?? i}>
                            <button
                              onClick={() => setActive("events")}
                              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.99] ${
                                first ? "featured-glass bg-gradient-to-br from-[#0B0F14] to-[#18212B] text-white shadow-[0_14px_30px_-16px_rgba(8,12,20,0.8)] hover:brightness-110" : "dash-tile hover:border-[#4FBEB0]/50"
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-bold text-white">{tc(ev.title, language as any)}</span>
                                <span className={`mt-0.5 block truncate text-xs ${first ? "text-white/60" : "text-white/50"}`}>
                                  {valid && `${d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })} \u00B7 ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`}
                                  {ev.location ? ` \u00B7 ${tc(ev.location, language as any)}` : ""}
                                </span>
                              </span>
                              {valid && (
                                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                                  <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
                                    <circle cx="26" cy="26" r="22" fill="none" stroke={first ? "rgba(255,255,255,0.18)" : "rgba(46,142,130,0.18)"} strokeWidth="4" />
                                    <circle cx="26" cy="26" r="22" fill="none" stroke={first ? "#F5C451" : "#2E8E82"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${circ * ring} ${circ}`} />
                                  </svg>
                                  <span className="relative text-[11px] font-extrabold text-white">{daysLeft}d</span>
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="mt-5 flex items-center gap-3">
                    <button onClick={() => setActive("events")} className="inline-flex min-h-11 items-center rounded-full bg-[#2E8E82] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#267a70] active:scale-[0.98]">
                      {t("events")}
                    </button>
                    <button onClick={() => setActive("events")} className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-white/75 transition hover:text-white">
                      {t("dashViewAll")}
                    </button>
                  </div>
                </div>

                <div className="dash-card flex min-w-0 flex-col gap-3 rounded-[26px] p-3">
                  <div className="report-stagger grid grid-cols-2 gap-3">
                    <KpiCard value={membershipsCount} label={t("verifiedMemberships")} description={t("membershipsDesc")} icon={Award} gradient="from-sage-400 to-sage-700" delay={0} className="!shadow-[0_14px_34px_rgba(15,23,42,0.18)]" onClick={() => setActive("qr")} />
                    <KpiCard value={attendedCount} label={t("eventsAttended")} description={t("eventsAttendedDesc")} icon={CheckCircle2} gradient="from-sage-400 to-sage-700" delay={70} className="!shadow-[0_14px_34px_rgba(15,23,42,0.18)]" onClick={() => setActive("attendance")} />
                    <KpiCard value={upcomingEvents.length} label={t("upcomingEvents")} description={t("upcomingEventsDesc")} icon={CalendarDays} gradient="from-sage-400 to-sage-700" delay={140} className="!shadow-[0_14px_34px_rgba(15,23,42,0.18)]" onClick={() => setActive("events")} />
                    <KpiCard value={missedCount} label={t("missedCheckInsTile")} icon={AlertCircle} gradient="from-sage-400 to-sage-700" delay={210} className="!shadow-[0_14px_34px_rgba(15,23,42,0.18)]" onClick={() => setActive("attendance")} />
                  </div>
                </div>
              </div>

              {/* Legend-style pill: live numbers */}
              <div className="dash-tile dash-mint mx-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl px-4 py-3.5 sm:rounded-full sm:px-5 sm:py-3">
                <div className="w-full sm:w-auto">{liveBadge}</div>
                <div className="grid w-full grid-cols-3 gap-2 sm:contents">
                  {[
                    { label: t("unreadNotificationsTile"), value: unreadCount, dot: "bg-[#2E8E82]" },
                    { label: t("nextEventInTile"), value: daysUntilNextEvent !== null ? `${daysUntilNextEvent}d` : "\u2014", dot: "bg-[#F5C451]" },
                    { label: t("lastCheckInTile"), value: lastCheckIn ? formatDateCard(lastCheckIn.eventDate) : "\u2014", dot: "bg-[#146088]" },
                  ].map((x) => (
                    <span key={x.label} className="inline-flex min-w-0 flex-col-reverse items-start gap-0.5 text-[11px] font-semibold leading-tight text-white/75 sm:flex-row sm:items-center sm:gap-2 sm:text-xs">
                      <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${x.dot}`} />{x.label}</span>
                      <span className={`font-display font-extrabold tabular-nums text-white sm:text-sm ${String(x.value).length > 4 ? "text-sm" : "text-xl"}`}>{x.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: QR code + this week's notifications */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* My QR Code -- a live preview of the same code shown on the full
            QR page, so residents can glance at it without leaving the
            Dashboard; mirrors the staff Dashboard's own System QR Code
            card. */}
        <div className="dash-card rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#2E8E82]/25 bg-[#4FBEB0]/15">
              <QrCode className="h-5 w-5 text-[#2E8E82]" />
            </span>
            <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">{t("qr")}</h2>
          </div>
          <p className="mt-3 text-sm text-white/55 sm:text-[15px]">
            {t("qrPageSubtitle")}
          </p>

          {/* Side-by-side, same layout as the staff Dashboard's own System
              QR Code panel -- code fixed on one side, details + action next
              to it, instead of one big centered stack with a lot of empty
              space around it. */}
          <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row">
            <div className="w-full shrink-0 sm:w-[280px]">
              {qrData && (
                <div ref={hiResQrRef} aria-hidden="true" style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }}>
                  <QRCodeCanvas value={qrData} size={720} level="H" bgColor="#ffffff" fgColor="#052e16" includeMargin={true} />
                </div>
              )}
              {cardSides ? (
                <IdCardFlip
                  frontUrl={cardSides.front}
                  backUrl={cardSides.back}
                  alt={fullName || "Member ID"}
                  autoFlip
                  intervalMs={10000}
                  onClick={() => setActive("qr")}
                  title={t("clickToViewFull")}
                  className="w-full"
                />
              ) : qrData ? (
                <div className="w-full animate-pulse rounded-2xl bg-white/5" style={{ aspectRatio: "1011 / 638" }} />
              ) : (
                <div className="flex w-full items-center justify-center rounded-2xl bg-white/5 text-white/30" style={{ aspectRatio: "1011 / 638" }}>
                  <QrCode className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">{fullName}</p>
              <p className="mt-1 text-sm text-white/50">{t("showQrToStaffCaption")}</p>
              <button
                onClick={() => setActive("qr")}
                className="btn-live-navy group mt-3 inline-flex items-center gap-3 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] pl-5 pr-1.5 py-1.5 text-[15px] font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#274A77] hover:bg-[#274A77] hover:shadow-md"
              >
                {t("viewFullQrCode")}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors duration-500 ease-out group-hover:bg-white/25">
                  <QrCode className="h-4 w-4 text-white" />
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* This Week's Notifications Card */}
        <div className="dash-card rounded-[28px] p-5 sm:p-6 flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#2E8E82]/25 bg-[#4FBEB0]/15">
                <BellIcon className="h-5 w-5 text-[#2E8E82]" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">{t("thisWeekNotifications")}</h2>
                <p className="mt-0.5 text-sm text-white/50">{t("thisWeekNotificationsDesc")}</p>
              </div>
            </div>
            <button
              onClick={() => setActive("notify")}
              className="-mr-2 inline-flex min-h-10 items-center px-2 text-sm text-[#7DD8CB] hover:underline font-semibold transition-colors flex-shrink-0"
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
                const parsedMsg = parseMessage(item.message);
                const staffName = parsedMsg.staffName;
                const { title, actualMessage } = parsedMsg;

                return (
                  <div
                    key={item.id}
                    onClick={() => setActive("notify")}
                    className={`cursor-pointer relative rounded-2xl sm:rounded-3xl px-5 sm:px-6 py-4 sm:py-5 border-l-4 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.35)] hover:-translate-y-1 ${
                      !item.read
                        ? 'border-l-gold-400 bg-gold-400/10 hover:bg-gold-400/[0.15] dash-shadow'
                        : 'border-l-white/15 dash-row'
                    } border-y border-r border-transparent`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                          {staffName && (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-white/60 break-words text-sm ${!item.read ? 'font-medium' : ''}`}>
                                  {staffName}
                                </span>
                              </div>
                              <span className="text-white/30 hidden sm:block">•</span>
                            </>
                          )}
                          <div className="flex-1 mt-1.5 sm:mt-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`font-semibold text-sm ${
                                !item.read ? 'text-white font-bold' : 'text-white/80'
                              }`}>
                                {title}
                              </span>
                              {actualMessage && (
                                <>
                                  <span className="text-white/30">—</span>
                                  <span className={`text-white/50 break-words text-sm ${
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