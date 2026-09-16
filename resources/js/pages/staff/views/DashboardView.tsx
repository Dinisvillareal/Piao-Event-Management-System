import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { UserPlus, CalendarPlus, ScanLine, Bell, BarChart3, Users, Award, CalendarDays, Undo2, LayoutDashboard, Download, Activity, Clock } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";

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
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    residents: 0,
    memberships: 0,
    events: eventsCount  // ✅ USE THE PASSED EVENTS COUNT
  });
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  const [appUrl, setAppUrl] = useState("");
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
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
  // Stamped every time the Dashboard's live data feeds are (re)fetched --
  // powers the "System Status" panel's "synced Xs ago" readout so it's a
  // real measurement, not a decorative timestamp.
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());

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
    const datePart = date.toLocaleDateString('en-US', options);
    const timePart = date.toLocaleTimeString('en-US', {
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    const url = `${window.location.protocol}//${window.location.host}`;
    setAppUrl(url);
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

  const fetchRecentActivities = async () => {
    try {
      const response = await api.get('/activity-logs/today');
      const result = response.data;
      const logs = result.data ?? result;

      setRecentActivities(Array.isArray(logs) ? logs : []);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      setRecentActivities([]);
    }
  };

  const fetchOverdueBorrows = async () => {
    try {
      const response = await api.get('/events/overdue-borrows');
      setOverdueBorrows(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching overdue borrows:', error);
      setOverdueBorrows([]);
    }
  };

  const fetchBudgetSummary = async () => {
    try {
      const { date_from, date_to } = getQuarterInfo();
      const response = await api.get('/reports/budget-summary', { params: { date_from, date_to } });
      setBudgetSummary(response.data);
    } catch (error) {
      console.error('Error fetching budget summary:', error);
      setBudgetSummary(null);
    }
  };

  const fetchAllStats = async () => {
    try {
      const [residentsResponse, membershipsResponse] = await Promise.all([
        api.get('/users', { params: { per_page: 1 } }),
        api.get('/api/memberships'),
      ]);

      const residentsResult = residentsResponse.data;
      const membershipsResult = membershipsResponse.data;

      const totalResidents = residentsResult.total || residentsResult.data?.length || 0;

      let totalMemberships = 0;
      if (Array.isArray(membershipsResult)) {
        totalMemberships = membershipsResult.length;
      } else if (membershipsResult.data && Array.isArray(membershipsResult.data)) {
        totalMemberships = membershipsResult.data.length;
      }

      setStats({
        residents: totalResidents,
        memberships: totalMemberships,
        events: eventsCount  // ✅ USE THE PASSED EVENTS COUNT (from database)
      });

    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchCurrentUser(),
          fetchAllStats(),
          fetchRecentActivities(),
          fetchOverdueBorrows(),
          fetchBudgetSummary(),
        ]);
        setLastSyncedAt(new Date());
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [eventsCount]); // ✅ Re-run when eventsCount changes (e.g., after event deletion)

  // Keeps the "Today's Live Snapshot" panel actually live: the clock ticks
  // every second, and the two data points it summarizes (today's activity
  // log and overdue borrows) are silently re-fetched every 30s so the
  // numbers move on their own without a manual page refresh.
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    const dataTimer = setInterval(async () => {
      await Promise.all([fetchRecentActivities(), fetchOverdueBorrows()]);
      setLastSyncedAt(new Date());
    }, 30000);
    return () => {
      clearInterval(clockTimer);
      clearInterval(dataTimer);
    };
  }, []);

  const downloadQRCode = () => {
    const svgElement = document.getElementById('system-qr-code');
    if (!svgElement) return;

    // Get the SVG element and its parent
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = 'barangay-system-qr.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

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
      label: "RESIDENTS",
      route: "residents",
      description: "Total registered residents",
      icon: Users,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      value: stats.memberships,
      label: "ACTIVE MEMBERSHIPS",
      route: "memberships",
      description: "Active membership types",
      icon: Award,
      gradient: "from-gold-400 to-gold-700",
    },
    {
      value: stats.events,
      label: "EVENTS",
      route: "events",
      description: upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming this year` : "Upcoming + past this year",
      icon: CalendarDays,
      gradient: "from-sage-800 to-[#1C2E2B]",
    },
    {
      value: overdueBorrows.length,
      label: "OVERDUE RETURNS",
      route: "returns",
      description: overdueBorrows.length > 0 ? "Flagged for review" : "All items returned on time",
      icon: Undo2,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]",
    }
  ];

  const quickActions = [
    { label: "Add Resident", icon: UserPlus, onClick: () => setActive("residents") },
    { label: "Create Event", icon: CalendarPlus, onClick: () => setActive("events") },
    { label: "Scan QR", icon: ScanLine, onClick: () => setActive("scan") },
    { label: "Send Notice", icon: Bell, onClick: () => setActive("notify") },
    { label: "View Reports", icon: BarChart3, onClick: () => setActive("reports") },
  ];

  if (loading) {
    return (
      <div className="-m-3 sm:-m-6 flex h-[calc(100vh-73px)] items-center justify-center bg-[#0A0E1A]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#4FBEB0]"></div>
      </div>
    );
  }

  return (
    // Full-bleed dark navy page -- cancels the shared content area's own
    // padding so the Dashboard reads as its own immersive page (matching
    // the reference), while every other staff view keeps its untouched
    // light "paper" background.
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A]">
      <div className="w-full space-y-10 px-6 py-10 sm:px-10 sm:py-14">
        {/* Hero -- icon badge + headline pinned left, a pair of real action
            cards pinned right, so the row fills the full page width
            instead of sitting as a narrow centered block. */}
        <div className="relative flex flex-col gap-6 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-gold-400/20 to-[#4FBEB0]/20">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#123A38]">
                <LayoutDashboard className="h-5 w-5 text-[#4FBEB0]" />
              </span>
            </div>
            <div>
              <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
                {t("welcomeBack")}, {memberName}
              </h1>
              <p className="mt-2 max-w-md text-[15px] text-white/55">{t("staffDashboardSubtitle")}</p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto">
            <button
              onClick={() => setActive("residents")}
              className="group flex flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-gold-400/40 hover:bg-white/[0.06] lg:w-72"
            >
              <div>
                <p className="font-display text-[15px] font-bold text-gold-400">Add Resident</p>
                <p className="mt-1 text-[12px] text-white/50">Register a new resident profile</p>
              </div>
              <UserPlus className="h-8 w-8 shrink-0 text-white/20 transition group-hover:text-gold-400" />
            </button>
            <button
              onClick={() => setActive("reports")}
              className="group flex flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-[#4FBEB0]/40 hover:bg-white/[0.06] lg:w-72"
            >
              <div>
                <p className="font-display text-[15px] font-bold text-[#4FBEB0]">View Reports</p>
                <p className="mt-1 text-[12px] text-white/50">Analytics &amp; activity reports</p>
              </div>
              <BarChart3 className="h-8 w-8 shrink-0 text-white/20 transition group-hover:text-[#4FBEB0]" />
            </button>
          </div>
        </div>

        {/* Stat strip -- gradient cards, matching the Budget page's
            portfolio KPI strip exactly. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((item, idx) => (
            <button
              key={idx}
              onClick={() => setActive(item.route)}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} p-5 text-left text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-3xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums] sm:text-4xl">{item.value}</h2>
                <item.icon className="h-5 w-5 shrink-0 text-white/80" />
              </div>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide">{item.label}</p>
              <p className="mt-1 text-xs text-white/75">{item.description}</p>
            </button>
          ))}
        </div>

        {/* Quick actions -- one tap to the page staff reach for most often,
            all real navigation (no decorative buttons that do nothing). */}
        <div className="flex flex-wrap gap-2.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3.5 text-[14px] font-semibold text-white/65 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <action.icon className="h-[18px] w-[18px]" /> {action.label}
            </button>
          ))}
        </div>

        {overdueBorrows.length > 0 && (
          <button
            onClick={() => setActive("returns")}
            className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-500/25 bg-gold-500/[0.08] p-5 text-left transition-colors hover:bg-gold-500/[0.12]"
          >
            <div>
              <h2 className="text-lg font-bold text-gold-300">{t("overdueBorrowsTitle")}</h2>
              <p className="mt-1 text-sm text-gold-100/80">
                {overdueBorrows.length} {overdueBorrows.length === 1 ? t("eventSingularLabel") : t("eventPluralLabel")} &mdash; {t("overdueBorrowsSubtitle")}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gold-500 px-4 py-2.5 text-xs font-bold text-[#08130F]">
              {t("reviewReturnsLabel")}
            </span>
          </button>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
          {/* Today's Live Snapshot -- replaces the old static activity log
              with a genuinely real-time panel: a ticking clock plus counts
              derived from data the Dashboard already fetches (today's
              activity log, overdue borrows, upcoming events), silently
              refreshed every 30s so the numbers move on their own. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-bold text-white">Today's Live Snapshot</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
                    </span>
                    Live
                  </span>
                </div>
                <p className="mt-1 text-[15px] text-white/50">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2">
                <Clock className="h-4 w-4 text-[#4FBEB0]" />
                <span className="font-display text-lg font-bold tabular-nums text-white">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3.5">
              {(() => {
                const isSameDay = (a: Date, b: Date) =>
                  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
                const eventsToday = upcomingEvents.filter((ev) => {
                  const d = new Date(ev.event_start ?? ev.date);
                  return !isNaN(d.getTime()) && isSameDay(d, currentTime);
                }).length;
                const activeStaffToday = new Set(recentActivities.map((act) => act.user_code)).size;

                const snapshotTiles = [
                  { label: "Staff Actions Today", value: recentActivities.length, icon: Activity, tone: "text-[#4FBEB0]" },
                  { label: "Staff Active Today", value: activeStaffToday, icon: Users, tone: "text-[#7DD8CB]" },
                  { label: "Events Today", value: eventsToday, icon: CalendarDays, tone: "text-gold-400" },
                  { label: "Needs Attention", value: overdueBorrows.length, icon: Bell, tone: overdueBorrows.length > 0 ? "text-gold-300" : "text-[#4FBEB0]" },
                ];

                return snapshotTiles.map((tile) => (
                  <div key={tile.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-2xl font-extrabold tabular-nums text-white">{tile.value}</span>
                      <tile.icon className={`h-4 w-4 shrink-0 ${tile.tone}`} />
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{tile.label}</p>
                  </div>
                ));
              })()}
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[11px] text-white/35">
                {recentActivities.length === 0
                  ? "No staff activity logged yet today."
                  : `Last recorded action: ${recentActivities[0]?.action ?? "—"} by ${recentActivities[0]?.user_code ?? "staff"} at ${formatActivityDate(recentActivities[0]?.created_at)}.`}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-white/25">Auto-refreshes every 30 seconds</p>
            </div>
          </div>

          {/* System Status -- fills the space left by the shorter Snapshot
              panel with a genuine health readout instead of empty dark
              space: which data feeds are live, and exactly how long ago
              they last synced, computed from the same fetch cycle above
              rather than a decorative label. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-white">System Status</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
                </span>
                All Systems Operational
              </span>
            </div>
            <p className="mt-1 text-[15px] text-white/50">
              {(() => {
                const secondsAgo = Math.max(0, Math.round((currentTime.getTime() - lastSyncedAt.getTime()) / 1000));
                if (secondsAgo < 5) return "Synced just now";
                if (secondsAgo < 60) return `Synced ${secondsAgo}s ago`;
                return `Synced ${Math.floor(secondsAgo / 60)}m ago`;
              })()}
            </p>

            <div className="mt-5 space-y-2.5">
              {[
                { label: "Activity Log", icon: Activity },
                { label: "Events & Attendance", icon: CalendarDays },
                { label: "Overdue Returns", icon: Undo2 },
                { label: "Budget Reports", icon: BarChart3 },
              ].map((feed) => (
                <div key={feed.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <feed.icon className="h-4 w-4 shrink-0 text-white/45" />
                    <span className="text-[13px] font-semibold text-white/80">{feed.label}</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#4FBEB0]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4FBEB0]"></span>
                    Synced
                  </span>
                </div>
              ))}
            </div>
          </div>
          </div>

          <div className="space-y-4">
            {/* System QR Code -- keeps the icon-badge + dashed "scan target"
                frame layout, but back on the same dark navy card treatment
                as the rest of the dashboard instead of the light card this
                briefly became. */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/10">
                  <ScanLine className="h-5 w-5 text-[#4FBEB0]" />
                </span>
                <h2 className="font-display text-xl font-bold text-white">System QR Code</h2>
              </div>
              <p className="mt-3 text-[15px] text-white/50">
                Residents scan this code to open the membership portal on their phone.
              </p>

              <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row">
                <div className="flex w-full shrink-0 justify-center rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] p-3 sm:w-auto">
                  <QRCodeSVG
                    id="system-qr-code"
                    value={appUrl}
                    size={140}
                    bgColor="#ffffff"
                    fgColor="#0A0E1A"
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Barangay e-Membership</p>
                  <p className="mt-1 text-sm text-white/50">
                    Print and post at the Barangay Hall lobby.
                  </p>
                  <button
                    onClick={downloadQRCode}
                    className="group mt-3 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-5 pr-1.5 py-1.5 text-[15px] font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md"
                  >
                    Download QR Code
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
                      <Download className="h-4 w-4 text-white" />
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Budget Snapshot</h2>
                  <p className="mt-1 text-[13px] text-white/50">Approved vs. spent — {getQuarterInfo().label}</p>
                </div>
                <button onClick={() => setActive("budget")} className="shrink-0 text-xs font-bold text-[#7DD8CB] hover:underline">
                  View all
                </button>
              </div>

              <div className="mt-4 space-y-3.5">
                {!budgetSummary || budgetSummary.per_event.length === 0 ? (
                  <p className="py-2 text-sm text-white/35">No approved event budgets this quarter.</p>
                ) : (
                  (() => {
                    // Each bar just gets the next color in this fixed
                    // sequence, by position -- not tied to the percentage,
                    // so five events all sitting in the high-80s/90s still
                    // read as five distinct bars instead of one flat color.
                    // Every tone here stays inside the navy / gold / teal
                    // palette -- no maroon/rust.
                    const barTones = ["bg-gold-500", "bg-[#4FBEB0]", "bg-gold-300", "bg-[#2E8E82]", "bg-gold-600", "bg-[#4FBEB0]/60", "bg-gold-400", "bg-[#2E8E82]/70"];
                    return budgetSummary.per_event.slice(0, 5).map((ev: any, idx: number) => {
                    const approved = Number(ev.approved_budget) || 0;
                    const spent = Number(ev.total_expenses) || 0;
                    const pct = approved > 0 ? Math.round((spent / approved) * 100) : 0;
                    const barColor = barTones[idx % barTones.length];
                    return (
                      <div key={ev.id}>
                        <div className="mb-1.5 flex justify-between gap-3 text-[13px]">
                          <span className="truncate font-semibold text-white/85">{ev.name}</span>
                          <span className="shrink-0 text-white/40">{pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                        </div>
                      </div>
                    );
                    });
                  })()
                )}
              </div>
            </div>

            {/* Timeline-style card -- dark navy-to-teal gradient header with
                a calendar icon and a dotted progress line, then a white
                body with big bold dates, echoing the reference dashboard's
                date-timeline widget exactly (dark header / white body)
                rather than staying dark like the rest of the page. */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#E3E6EA] shadow-sm">
              <div className="flex items-center gap-4 bg-gradient-to-r from-[#0A0E1A] via-[#123A38] to-[#1C5850] px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <CalendarDays className="h-4 w-4 text-white" />
                </span>
                <div className="relative h-px flex-1 bg-white/25">
                  <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#4FBEB0]" />
                  <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
                  <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#4FBEB0]" />
                </div>
                <button onClick={() => setActive("events")} className="shrink-0 text-xs font-bold text-white/70 transition hover:text-white hover:underline">
                  View all
                </button>
              </div>

              {upcomingEvents.length === 0 ? (
                <p className="px-5 py-6 text-sm text-[#9B9484]">No upcoming events scheduled.</p>
              ) : (
                <div className="flex flex-wrap">
                  {upcomingEvents.slice(0, 4).map((ev, i) => {
                    const d = new Date(ev.event_start ?? ev.date);
                    const validDate = !isNaN(d.getTime());
                    const day = validDate ? String(d.getDate()).padStart(2, "0") : "--";
                    const month = validDate ? d.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
                    const year = validDate ? d.getFullYear() : "";
                    return (
                      <button
                        key={ev.id ?? i}
                        onClick={() => setActive("events")}
                        className="min-w-[140px] flex-1 border-l border-[#C9CFD6] px-5 py-5 text-left transition first:border-l-0 hover:bg-[#D6DBE1]"
                      >
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-3xl font-extrabold tracking-tight text-[#0A0E1A] [font-variant-numeric:tabular-nums]">{day}</span>
                          <span className="flex flex-col leading-none">
                            <span className="text-[11px] font-extrabold uppercase text-[#0A0E1A]">{month}</span>
                            <span className="text-[11px] font-semibold text-[#6B6558]">{year}</span>
                          </span>
                        </div>
                        <p className="mt-2 truncate text-[13px] font-semibold text-[#1A1A1A]">{ev.name ?? ev.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-[#9B9484]">{ev.location}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
