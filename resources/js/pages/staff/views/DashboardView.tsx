import KpiCard from "../../../components/ui/KpiCard";
import { renderSystemQrPoster } from "../../../lib/systemQrPoster";
import { SYSTEM_URL } from "../../../lib/siteUrl";
import { useClockFormat } from "../../../lib/clockFormat";
import React, { useState, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { UserPlus, CalendarPlus, ScanLine, Bell, BarChart3, Users, Award, CalendarDays, Undo2, Download, Activity, Clock, ArrowUpRight, Plus } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";

import { tc } from "../../../lib/contentTranslations";
import Portal from "../../../components/ui/Portal";
import FeedWarning from "../../../components/ui/FeedWarning";
import { useFeedHealth, useVisiblePoll } from "../../../hooks/useLiveFeeds";
interface DashboardViewProps {
  setActive: (route: string) => void;
  membershipsCount: number;
  eventsCount: number;  // ✅ ADD THIS - now required
  notifications?: any[];
  upcomingEvents?: any[];
  pastEventsCount?: number;
}

export default function DashboardView({
  membershipsCount,
  eventsCount,           // ✅ ADD THIS
  setActive,
  upcomingEvents = [],
  pastEventsCount = 0
}: DashboardViewProps) {
  const { t, locale, language } = useLanguage();
  // Headline numbers, all worked out by the server (GET /dashboard/stats) so they
  // match the Residents / Memberships / Events pages and the Activity Log exactly.
  const [stats, setStats] = useState({
    residents: 0,
    memberships: 0,
    events: eventsCount,
    eventsToday: 0,
    actionsToday: 0,
    activeStaffToday: 0,
  });
  const [lastAction, setLastAction] = useState<{ action: string; user_code: string; created_at: string } | null>(null);
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  // The skeleton shows for the first load only; later re-fetches (e.g. when
  // the events count arrives or changes) refresh the numbers silently.
  const loadedOnceRef = useRef(false);
  const [appUrl, setAppUrl] = useState("");
  // Events that already ended but still hold borrowed inventory --
  // nothing in the system releases these on its own (see
  // EventController::overdueBorrows), so the Dashboard surfaces them
  // directly instead of relying on staff noticing the Inventory badge.
  const [overdueBorrows, setOverdueBorrows] = useState<any[]>([]);
  // Real approved-vs-spent figures for this quarter's events, from the
  // same endpoint the Reports > Budget report uses -- no invented
  // category breakdown, just the actual per-event numbers staff already
  // record in Budget & Expenses.
  const [budgetSummary, setBudgetSummary] = useState<{ per_event: any[] } | null>(null);
  // Ticks every second purely for the live clock in the "Today's Live
  // Snapshot" panel -- everything else in that panel is real fetched data,
  // this just proves the panel is actually live rather than a static
  // screenshot of "recent activity".
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockHour12, toggleClockHour12] = useClockFormat();
  // Which feeds failed on their last try, and when everything last loaded cleanly --
  // powers the "synced Xs ago" readout, which only moves forward when NOTHING failed,
  // so it never claims "synced just now" while a feed is actually down.
  const { failedCount, lastOkAt: lastSyncedAt, report, completeCycle } = useFeedHealth();
  const [retrying, setRetrying] = useState(false);

  const getCsrfToken = () => {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];
    return token ? decodeURIComponent(token) : '';
  };

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    };
    const datePart = date.toLocaleDateString(locale, options);
    const timePart = date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `${datePart} • ${timePart}`;
  };

  // Short "Sep 20" style date used in the compact upcoming-events list --
  // the events themselves already show their full date once opened, this
  // panel is just a glanceable pointer to what's coming up next.
  const formatShortDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  };

  // Current calendar quarter as a date_from/date_to pair for the budget
  // endpoint, plus a "Q3 2026" label so the panel's subtitle matches
  // exactly what it's showing instead of an unqualified "this quarter".
  const getQuarterInfo = () => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    const toISO = (d: Date) => d.toISOString().split('T')[0];
    return { date_from: toISO(start), date_to: toISO(end), label: `Q${q + 1} ${now.getFullYear()}` };
  };

  useEffect(() => {
    setAppUrl(SYSTEM_URL);
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/me');
      const user = response.data;

      let formattedName = "Staff";
      if (user.first_name && user.last_name) {
        formattedName = `${user.first_name} ${user.last_name}`;
      } else if (user.first_name) {
        formattedName = user.first_name;
      } else if (user.name) {
        formattedName = user.name;
      }

      setMemberName(formattedName);

    } catch (error) {
      console.error('Error fetching current user:', error);
      setMemberName("Staff");
    }
  };

  // Every feed below keeps the numbers it already has when a refresh fails (instead of
  // wiping them to 0 / empty, which looked like "nothing is overdue" when the server was
  // simply unreachable) and reports the failure so the page can say so.
  const fetchOverdueBorrows = async () => {
    try {
      const response = await api.get('/events/overdue-borrows');
      setOverdueBorrows(Array.isArray(response.data) ? response.data : []);
      report('overdue', true);
    } catch (error) {
      console.error('Error fetching overdue borrows:', error);
      report('overdue', false);
    }
  };

  const fetchBudgetSummary = async () => {
    try {
      const { date_from, date_to } = getQuarterInfo();
      const response = await api.get('/reports/budget-summary', { params: { date_from, date_to } });
      setBudgetSummary(response.data);
      report('budget', true);
    } catch (error) {
      console.error('Error fetching budget summary:', error);
      report('budget', false);
    }
  };

  const fetchAllStats = async () => {
    try {
      const { data } = await api.get('/dashboard/stats');
      setStats({
        residents: Number(data.residents) || 0,
        memberships: Number(data.memberships) || 0,
        events: Number(data.events) || 0,
        eventsToday: Number(data.events_today) || 0,
        actionsToday: Number(data.actions_today) || 0,
        activeStaffToday: Number(data.active_staff_today) || 0,
      });
      setLastAction(data.last_action ?? null);
      report('stats', true);
    } catch (error) {
      console.error('Error fetching stats:', error);
      report('stats', false);
    }
  };

  const refreshFeeds = async () => {
    await Promise.all([fetchAllStats(), fetchOverdueBorrows(), fetchBudgetSummary()]);
    completeCycle();
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (!loadedOnceRef.current) setLoading(true);
      try {
        await Promise.all([fetchCurrentUser(), refreshFeeds()]);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        loadedOnceRef.current = true;
        setLoading(false);
      }
    };

    loadDashboard();
  }, [eventsCount]); // Re-run when an event is added / deleted so the cards follow straight away.

  // Keeps the *whole* Dashboard live: the clock ticks every second, and every data feed the
  // page shows -- the headline cards, today's staff activity, overdue borrows and the quarterly
  // budget summary -- is silently re-fetched every 30s. The 30s refresh pauses while the tab is
  // hidden and runs straight away when it is shown again.
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useVisiblePoll(() => { void refreshFeeds(); }, 30000);

  const retryFeeds = async () => {
    setRetrying(true);
    try { await refreshFeeds(); } finally { setRetrying(false); }
  };

  // Download itself is unchanged -- only wrapped with a confirm step before
  // it runs and a success popup once the file has actually been written,
  // matching the confirm-then-report pattern used for every other
  // destructive/generating action across the app (ConfirmDialog + StatusModal).
  const [showQrDownloadConfirm, setShowQrDownloadConfirm] = useState(false);
  const [showQrDownloadSuccess, setShowQrDownloadSuccess] = useState(false);

  // Builds the print-ready A4 poster (2480 x 3508 px) around the system QR.
  // The QR is drawn once into a hidden 1200px canvas and used directly.
  // The canvas is tracked in state (not looked up by id) because the card can
  // mount after the page's first render -- the preview must start once it exists.
  const [qrEl, setQrEl] = useState<HTMLCanvasElement | null>(null);
  const buildQrPoster = async (): Promise<HTMLCanvasElement | null> => {
    if (!qrEl || !appUrl) return null;
    return renderSystemQrPoster({ qr: qrEl, url: appUrl });
  };

  // The card shows the real poster (a lighter copy), not just the bare QR.
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [showPosterPreview, setShowPosterPreview] = useState(false);
  useEffect(() => {
    if (!appUrl || !qrEl) return;
    let cancelled = false;
    (async () => {
      try {
        // Let the dashboard paint first; the poster drawing is a heavy, one-off job.
        await new Promise((r) => window.setTimeout(r, 50));
        if (cancelled) return;
        const poster = await buildQrPoster();
        if (!poster || cancelled) return;
        const small = document.createElement('canvas');
        small.width = 1240;
        small.height = 1754;
        const sctx = small.getContext('2d');
        if (!sctx) return;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(poster, 0, 0, small.width, small.height);
        if (!cancelled) setPosterPreview(small.toDataURL('image/jpeg', 0.88));
      } catch (err) {
        console.error('QR poster preview failed:', err);
        if (!cancelled) setPosterFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [appUrl, qrEl]); // eslint-disable-line react-hooks/exhaustive-deps

  const performQrDownload = async () => {
    try {
      const poster = await buildQrPoster();
      if (!poster) return;
      const blob: Blob | null = await new Promise((res) => poster.toBlob(res, 'image/png'));
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = href;
      downloadLink.download = 'barangay-piao-qr-poster.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.setTimeout(() => URL.revokeObjectURL(href), 2000);
      setShowQrDownloadSuccess(true);
    } catch (err) {
      console.error('QR poster download failed:', err);
    }
  };

  const downloadQRCode = () => setShowQrDownloadConfirm(true);

  // Every caption below is either static copy or a real, already-fetched
  // count -- no invented period-over-period percentages, since the system
  // doesn't track historical snapshots to compute a real "+4.2%" from.
  // Same gradient-card language as the Budget page's portfolio KPI strip
  // (sage / gold / dark sage / maroon), in the same left-to-right order,
  // so the two stat strips read as one consistent system instead of the
  // old plain-white cards here vs. gradient cards there. Overdue Returns
  // gets the maroon "needs attention" tone, same role as "Events Over
  // Budget" plays in the Budget strip.
  const statsCards = [
    {
      value: stats.residents,
      label: t("residents"),
      route: "residents",
      description: t("dashTotalResidentsDesc"),
      icon: Users,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      value: stats.memberships,
      label: t("dashActiveMemberships"),
      route: "memberships",
      description: t("dashActiveMembershipTypesDesc"),
      icon: Award,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      value: stats.events,
      label: t("events"),
      route: "events",
      description: upcomingEvents.length > 0 ? t("dashUpcomingThisYear").replace("{n}", String(upcomingEvents.length)) : t("dashUpcomingPastThisYear"),
      icon: CalendarDays,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      value: overdueBorrows.length,
      label: t("dashOverdueReturns"),
      route: "returns",
      description: overdueBorrows.length > 0 ? t("dashFlaggedReview") : t("dashAllReturnedOnTime"),
      icon: Undo2,
      gradient: "from-sage-400 to-sage-700",
    }
  ];

  const quickActions: { label: string; icon: any; onClick: () => void }[] = [
    { label: t("dashAddResident"), icon: UserPlus, onClick: () => setActive("residents") },
    { label: t("dashCreateEvent"), icon: CalendarPlus, onClick: () => setActive("events") },
    { label: t("dashScanQr"), icon: ScanLine, onClick: () => setActive("scan") },
    { label: t("dashSendNotice"), icon: Bell, onClick: () => setActive("notify") },
    { label: t("dashViewReports"), icon: BarChart3, onClick: () => setActive("reports") },
  ];

  if (loading) {
    // Skeleton shaped like the real page below -- hero (avatar + two text
    // lines, two action cards) then the 4-card stat strip -- instead of a
    // bare spinner, so the page's actual layout is visible immediately and
    // nothing jumps around once the real numbers arrive.
    return (
      <div className="dash-canvas -m-3 sm:-m-6 min-h-[calc(100dvh-73px)] px-6 py-8 sm:px-10 sm:py-9">
        <div className="w-full space-y-10">
          <div className="relative flex flex-col gap-6 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
              <div className="space-y-2.5">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
            <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto">
              <Skeleton className="h-[76px] flex-1 rounded-2xl lg:w-72" />
              <Skeleton className="h-[76px] flex-1 rounded-2xl lg:w-72" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Sync state shown next to the clock in the header.
  const secondsSinceSync = Math.max(0, Math.round((currentTime.getTime() - lastSyncedAt.getTime()) / 1000));
  const syncText =
    secondsSinceSync < 5 ? t("dashSyncedJustNow")
    : secondsSinceSync < 60 ? t("dashSyncedSecondsAgo").replace("{n}", String(secondsSinceSync))
    : t("dashSyncedMinutesAgo").replace("{n}", String(Math.floor(secondsSinceSync / 60)));

  const liveBadge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#7DD8CB]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
      </span>
      {t("liveLabel")}
    </span>
  );

  return (
    // Full-bleed "bento" page: pill bars on top, then cards of different weights (dark pill, white cards,
    // a live-gradient panel, a ticket-style QR card and one deep-green card).
    <div className="dash-canvas -m-3 sm:-m-6 min-h-[calc(100dvh-73px)]">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {/* Row 1: dark brand pill + white action pill */}
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
                {memberName}
              </span>
            </p>
          </div>

          {/* Phones: the five quick actions as one row of icon buttons (Scan QR highlighted). */}
          <div className="dash-card grid grid-cols-5 gap-2 rounded-[28px] p-3 sm:hidden">
            {[0, 1, 3, 4, 2].map((i) => {
              const action = quickActions[i];
              const primary = i === 2;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  title={action.label}
                  aria-label={action.label}
                  className={`flex h-12 items-center justify-center rounded-2xl transition active:scale-95 ${primary ? "bg-[#2E8E82] !text-white shadow-sm" : "bg-white/[0.04] text-[#2E8E82]"}`}
                >
                  <action.icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>

          <div className="dash-card max-sm:hidden grid grid-cols-3 items-stretch gap-2 rounded-[28px] p-3 sm:flex sm:flex-nowrap sm:items-center sm:gap-x-1 sm:gap-y-2 sm:rounded-[36px]">
            {[quickActions[0], quickActions[1], quickActions[3]].map((action, i) => (
              <React.Fragment key={action.label}>
                {i > 0 && <span className="hidden h-7 w-px shrink-0 bg-white/10 sm:block" />}
                <button
                  onClick={action.onClick}
                  className="flex min-h-[76px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/[0.04] px-1.5 text-center text-xs font-semibold leading-tight text-white/85 transition hover:bg-white/[0.06] sm:min-h-12 sm:flex-row sm:gap-2.5 sm:rounded-full sm:bg-transparent sm:px-4 sm:text-sm"
                >
                  <action.icon className="h-5 w-5 shrink-0 text-[#2E8E82]" />
                  <span className="w-full truncate sm:w-auto">{action.label}</span>
                </button>
              </React.Fragment>
            ))}
            <div className="col-span-3 grid grid-cols-2 gap-2 sm:contents">
            <button
              onClick={quickActions[4].onClick}
              className="dash-tile flex min-h-12 min-w-0 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold text-white/85 sm:ml-2 sm:px-5"
            >
              {React.createElement(quickActions[4].icon, { className: "h-4 w-4 text-[#2E8E82]" })}
              {quickActions[4].label}
            </button>
            <button
              onClick={quickActions[2].onClick}
              className="flex min-h-12 min-w-0 shrink-0 items-center justify-center gap-2 rounded-full bg-[#2E8E82] px-4 text-sm font-bold !text-white shadow-sm sm:px-6 transition hover:bg-[#267a70] active:scale-[0.98]"
            >
              {quickActions[2].label}
            </button>
            </div>
          </div>
        </div>

        <FeedWarning failedCount={failedCount} lastOkAt={lastSyncedAt} onRetry={retryFeeds} retrying={retrying} />

        {/* Row 2: attention card + live clock panel (left), greeting + events + stat cards (right) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="dash-card flex flex-col rounded-[32px] p-3">
            <div className="flex flex-1 flex-col p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] px-3 py-1.5 text-xs font-bold text-white">
                  <Undo2 className="h-3.5 w-3.5 text-[#F5C451]" />
                  {overdueBorrows.length > 0 ? `${overdueBorrows.length} ${t("dashFlaggedReview")}` : t("dashAllReturnedOnTime")}
                </span>
                <button
                  type="button"
                  onClick={() => setActive("returns")}
                  aria-label={t("reviewReturnsLabel")}
                  title={t("reviewReturnsLabel")}
                  className="dash-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/80"
                >
                  <ArrowUpRight className="h-5 w-5" />
                </button>
              </div>
              <h2 className="mt-8 font-display text-2xl font-extrabold leading-tight text-white">
                {overdueBorrows.length > 0 ? t("overdueBorrowsTitle") : t("dashAllReturnedOnTime")}
              </h2>
              {overdueBorrows.length > 0 && (
                <p className="mt-2 text-sm text-white/55">
                  {overdueBorrows.length} {overdueBorrows.length === 1 ? t("eventSingularLabel") : t("eventPluralLabel")} &mdash; {t("overdueBorrowsSubtitle")}
                </p>
              )}
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
                <h2 className="font-display text-2xl font-extrabold leading-tight text-white">{t("dashUpcomingTitle")}</h2>

                {upcomingEvents.length === 0 ? (
                  <p className="mt-5 rounded-2xl bg-white/[0.04] px-5 py-6 text-sm text-white/45">{t("dashNoUpcomingEvents")}</p>
                ) : (
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {upcomingEvents.slice(0, 3).map((ev, i) => {
                      const d = new Date(ev.event_start ?? ev.date);
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
                              <span className="block truncate text-[15px] font-bold text-white">{tc(ev.name ?? ev.title, language as any)}</span>
                              <span className={`mt-0.5 block truncate text-xs ${first ? "text-white/60" : "text-white/50"}`}>
                                {valid && `${d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`}
                                {ev.location ? ` · ${tc(ev.location, language as any)}` : ""}
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
                    {t("dashCreateEvent")}
                  </button>
                  <button onClick={() => setActive("events")} className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-white/75 transition hover:text-white">
                    {t("dashViewAll")}
                  </button>
                </div>
              </div>

              <div className="dash-card flex min-w-0 flex-col gap-3 rounded-[26px] p-3">
                <div className="report-stagger grid grid-cols-2 gap-3">
                  {statsCards.map((item, idx) => (
                    <KpiCard key={idx} value={item.value} label={item.label} description={item.description} icon={item.icon} gradient={item.gradient} plain delay={idx * 70} className="!shadow-[0_14px_34px_rgba(15,23,42,0.18)]" onClick={() => setActive(item.route)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Legend-style pill: today's live numbers */}
            <div className="dash-tile dash-mint mx-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl px-4 py-3.5 sm:rounded-full sm:px-5 sm:py-3">
              <div className="w-full sm:w-auto">{liveBadge}</div>
              <div className="grid w-full grid-cols-3 gap-2 sm:contents">
              {[
                { label: t("dashStaffActionsToday"), value: stats.actionsToday, dot: "bg-[#2E8E82]" },
                { label: t("dashStaffActiveToday"), value: stats.activeStaffToday, dot: "bg-[#F5C451]" },
                { label: t("dashEventsToday"), value: stats.eventsToday, dot: "bg-[#146088]" },
              ].map((x) => (
                <span key={x.label} className="inline-flex min-w-0 flex-col-reverse items-start gap-0.5 text-[11px] font-semibold leading-tight text-white/75 sm:flex-row sm:items-center sm:gap-2 sm:text-xs">
                  <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${x.dot}`} />{x.label}</span>
                  <span className="font-display text-xl font-extrabold tabular-nums text-white sm:text-sm">{x.value}</span>
                </span>
              ))}
              </div>
              <span className="w-full text-[11px] leading-snug text-white/40 sm:ml-auto sm:w-auto">
                {!lastAction
                  ? t("dashNoStaffActivity")
                  : t("dashLastAction")
                      .replace("{action}", String(lastAction?.action ?? "—"))
                      .replace("{user}", String(lastAction?.user_code ?? "staff"))
                      .replace("{time}", formatActivityDate(lastAction?.created_at ?? ""))}
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: ticket-style QR card + deep-green budget card */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="dash-card relative flex flex-col overflow-hidden rounded-[32px] sm:flex-row">
            {/* The QR itself stays in the page (hidden) -- the poster is built from it. */}
            <QRCodeCanvas
              ref={setQrEl}
              id="system-qr-code"
              style={{ display: "none" }}
              value={appUrl || " "}
              size={1200}
              bgColor="#ffffff"
              fgColor="#0A0E1A"
              level="H"
              includeMargin={true}
            />
            <div className="flex items-center justify-center p-6 max-sm:order-2 sm:w-64 sm:shrink-0">
              <button
                type="button"
                onClick={() => posterPreview && setShowPosterPreview(true)}
                aria-label={t("dashViewPoster")}
                className="group relative w-full max-w-[13rem] overflow-hidden rounded-2xl bg-white/[0.03] p-1.5 transition hover:ring-2 hover:ring-[#4FBEB0]/60"
              >
                {posterPreview ? (
                  <img src={posterPreview} alt={t("dashSystemQrCode")} className="mx-auto aspect-[1240/1754] w-full rounded-lg object-contain shadow-md" />
                ) : posterFailed ? (
                  <div className="mx-auto flex aspect-[1240/1754] w-full items-center justify-center rounded-lg bg-white/[0.04] p-4 text-center text-sm text-white/50">{t("dashPosterPreviewUnavailable")}</div>
                ) : (
                  <Skeleton className="mx-auto aspect-[1240/1754] w-full rounded-lg" />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">{t("dashViewPoster")}</span>
              </button>
            </div>

            {/* Ticket perforation: dashed line with two notches */}
            <div className="relative hidden w-0 sm:block">
              <span className="absolute inset-y-0 left-0 border-l-2 border-dashed border-white/15" />
              <span className="dash-canvas absolute -left-3 -top-3 h-6 w-6 rounded-full border border-white/10" />
              <span className="dash-canvas absolute -bottom-3 -left-3 h-6 w-6 rounded-full border border-white/10" />
            </div>
            <div className="order-3 border-t-2 border-dashed border-white/15 sm:hidden" />

            <div className="flex min-w-0 flex-1 flex-col justify-center text-center max-sm:contents sm:p-8 sm:text-left">
              <div className="max-sm:order-1 max-sm:px-5 max-sm:pt-6 max-sm:text-center">
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#2E8E82]/25 bg-[#4FBEB0]/15">
                  <ScanLine className="h-5 w-5 text-[#2E8E82]" />
                </span>
                <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">{t("dashSystemQrCode")}</h2>
              </div>
              <p className="mt-3 text-sm text-white/55 sm:text-[15px]">{t("dashSystemQrDesc")}</p>
              </div>
              <p className="mt-4 rounded-2xl bg-white/[0.05] px-4 py-3 max-sm:order-4 max-sm:mx-5 text-xs text-white/55 sm:text-sm">{t("dashPrintPostHall")}</p>
              <button
                onClick={downloadQRCode}
                className="btn-live-navy group mt-5 inline-flex max-sm:order-4 max-sm:mx-5 max-sm:mb-5 items-center justify-between gap-3 sm:w-fit sm:justify-start rounded-full border border-[#1E3A5F] bg-[#1E3A5F] py-1.5 pl-5 pr-1.5 text-[15px] font-semibold text-white shadow-md transition-all duration-500 ease-out hover:border-[#274A77] hover:bg-[#274A77] hover:shadow-md active:scale-95"
              >
                {t("dashDownloadQrPoster")}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors duration-300 ease-out group-hover:bg-white/30">
                  <Download className="h-4 w-4 text-white" />
                </span>
              </button>
            </div>
          </div>

          <div className="dash-card relative flex flex-col overflow-hidden rounded-[32px] p-6 sm:p-8">
            <span className="pointer-events-none absolute -bottom-12 -right-12 h-56 w-56 rounded-full border border-dashed border-white/10" />
            <span className="pointer-events-none absolute -bottom-4 -right-4 h-32 w-32 rounded-full border border-dashed border-white/10" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-white">{t("dashBudgetSnapshot")}</h2>
                <p className="mt-1 text-[13px] text-white/50">{t("dashApprovedVsSpent").replace("{quarter}", getQuarterInfo().label)}</p>
              </div>
            </div>

            <div className="relative mt-5 flex-1 space-y-3.5">
              {!budgetSummary || budgetSummary.per_event.length === 0 ? (
                <p className="py-2 text-sm text-white/45">{t("dashNoApprovedBudgets")}</p>
              ) : (
                budgetSummary.per_event.slice(0, 5).map((ev: any, idx: number) => {
                  const approved = Number(ev.approved_budget) || 0;
                  const spent = Number(ev.total_expenses) || 0;
                  const pct = approved > 0 ? Math.round((spent / approved) * 100) : 0;
                  const barTones = ["bg-[#2E8E82]", "bg-[#F5C451]", "bg-[#4FBEB0]", "bg-[#F5C451]/75", "bg-[#2E8E82]/70"];
                  return (
                    <div key={ev.id}>
                      <div className="mb-1.5 flex justify-between gap-3 text-[13px]">
                        <span className="truncate font-semibold text-white">{tc(ev.name, language as any)}</span>
                        <span className="shrink-0 text-white/50">{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${barTones[idx % barTones.length]}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setActive("budget")}
              className="relative mt-6 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-gold-500 px-6 text-sm font-bold text-[#08130F] shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              {t("dashViewAll")}
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>

      <ConfirmDialog
        open={showQrDownloadConfirm}
        icon={<Download className="h-6 w-6" />}
        title={t("dashDownloadQrConfirmTitle")}
        body={t("dashDownloadQrConfirmBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("downloadLabel")}
        onCancel={() => setShowQrDownloadConfirm(false)}
        z={10100}
        onConfirm={() => {
          setShowQrDownloadConfirm(false);
          setShowPosterPreview(false);
          performQrDownload();
        }}
      />
      {showPosterPreview && posterPreview && (
        <Portal><div
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowPosterPreview(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={posterPreview} alt={t("dashSystemQrCode")} className="max-h-[88vh] w-auto rounded-xl shadow-2xl" />
            <div className="mt-3 flex justify-center gap-3">
              <button onClick={() => setShowQrDownloadConfirm(true)} className="rounded-full bg-sage-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sage-800">{t("dashDownloadQrPoster")}</button>
              <button onClick={() => setShowPosterPreview(false)} className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">{t("closeLabel")}</button>
            </div>
          </div>
        </div></Portal>
      )}
      <StatusModal
        open={showQrDownloadSuccess}
        type="success"
        title={t("dashDownloadComplete")}
        message={t("dashQrSavedMessage")}
        okLabel={t("okLabel")}
        onClose={() => setShowQrDownloadSuccess(false)}
      />
      </div>
    </div>
  );
}
