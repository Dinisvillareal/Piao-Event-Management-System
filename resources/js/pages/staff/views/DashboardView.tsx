import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { UserPlus, CalendarPlus, ScanLine, Bell, BarChart3, Users, Award, CalendarDays, Undo2 } from "lucide-react";
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
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [eventsCount]); // ✅ Re-run when eventsCount changes (e.g., after event deletion)

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
  const statsCards = [
    {
      value: stats.residents,
      label: "RESIDENTS",
      route: "residents",
      description: "Total registered residents",
      icon: Users,
      gradient: "from-sage-400 to-sage-700"
    },
    {
      value: stats.memberships,
      label: "ACTIVE MEMBERSHIPS",
      route: "memberships",
      description: "Active membership types",
      icon: Award,
      gradient: "from-gold-400 to-gold-700"
    },
    {
      value: stats.events,
      label: "EVENTS",
      route: "events",
      description: upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming this year` : "Upcoming + past this year",
      icon: CalendarDays,
      gradient: "from-sage-800 to-[#1C2E2B]"
    },
    {
      value: overdueBorrows.length,
      label: "OVERDUE RETURNS",
      route: "returns",
      description: overdueBorrows.length > 0 ? "Flagged for review" : "All items returned on time",
      icon: Undo2,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]"
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
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sage-700">{t("staffConsole")}</p>
          <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("welcomeBack")}, {memberName}</h1>
          <p className="mt-1.5 text-sm text-[#6B6558] max-w-md">{t("staffDashboardSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setActive("reports")}
            className="inline-flex items-center gap-2 rounded-full border border-[#E6E0D3] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#5C574A] hover:border-[#DED5C0] hover:text-[#1A1A1A] transition-colors"
          >
            View Reports
          </button>
          <button
            onClick={() => setActive("residents")}
            className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#2E2E2E] transition-colors"
          >
            <UserPlus className="h-4 w-4" /> Add Resident
          </button>
        </div>
      </div>

      {/* Stat strip -- each card its own gradient so the four numbers are
          easy to tell apart at a glance; Overdue Returns gets its own
          rust tone rather than reusing sage, gold or the dark events
          green. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {statsCards.map((item, idx) => (
          <button
            key={idx}
            onClick={() => setActive(item.route)}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} p-6 text-left text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">{item.value}</h2>
              <item.icon className="h-6 w-6 text-white/40 shrink-0" />
            </div>
            <p className="mt-3 text-[13px] font-bold uppercase tracking-wide">{item.label}</p>
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
            className="inline-flex items-center gap-2 rounded-full border border-[#E6E0D3] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#5C574A] hover:border-[#A2C9BC] hover:bg-sage-50 hover:text-sage-800 transition-colors"
          >
            <action.icon className="h-4 w-4" /> {action.label}
          </button>
        ))}
      </div>

      {overdueBorrows.length > 0 && (
        <button
          onClick={() => setActive("returns")}
          className="w-full text-left rounded-2xl border border-[#F0D7CE] bg-[#FBEDE9] p-5 flex items-center justify-between gap-4 flex-wrap hover:bg-[#F6DED5] transition-colors"
        >
          <div>
            <h2 className="text-lg font-bold text-[#8A3D2C]">{t("overdueBorrowsTitle")}</h2>
            <p className="text-sm text-[#8A3D2C]/80 mt-1">
              {overdueBorrows.length} {overdueBorrows.length === 1 ? t("eventSingularLabel") : t("eventPluralLabel")} &mdash; {t("overdueBorrowsSubtitle")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#B5533E] text-white text-xs font-semibold px-4 py-2.5">
            {t("reviewReturnsLabel")}
          </span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 hover:shadow-md transition-shadow duration-300">
          <h2 className="font-display text-xl font-bold text-[#1A1A1A]">
            Recent Activity
          </h2>

          <p className="text-[15px] mt-1 text-[#6E6A60]">
            Latest staff actions in the system.
          </p>

          <div className="mt-5 max-w-xl max-h-[320px] overflow-y-auto pr-2">
            {recentActivities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No recent activity to display
              </div>
            ) : (
              recentActivities.map((act, i) => (
                <div
                  key={i}
                  className={`relative pl-8 ${
                    i !== recentActivities.length - 1 ? "pb-6" : ""
                  }`}
                >
                  {i !== recentActivities.length - 1 && (
                    <span className="absolute left-[8px] top-2 h-full w-[2px] bg-sage-200"></span>
                  )}

                  <span className="absolute left-[4px] top-2 w-[10px] h-[10px] rounded-full bg-gold-400 z-10"></span>

                  <p className="text-[14px] font-semibold text-[#1A1A1A] leading-tight">
                    {act.action}
                  </p>

                  <p className="text-[11px] text-gray-600">
                    {act.module} — {act.description}
                  </p>

                  <p className="text-[11px] text-gray-500">
                    Staff: {act.user_code}
                  </p>

                  <p className="text-[11px] text-gray-500">
                    {formatActivityDate(act.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 hover:shadow-md transition-shadow duration-300">
            <h2 className="font-display text-xl font-bold text-[#1A1A1A]">System QR Code</h2>
            <p className="text-[15px] mt-1 text-[#6E6A60]">
              Residents scan this code to open the membership portal on their phone.
            </p>

            <div className="mt-5 flex flex-col sm:flex-row items-start gap-4">
              <div className="shrink-0 flex justify-center w-full sm:w-auto">
                <QRCodeSVG
                  id="system-qr-code"
                  value={appUrl}
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#33534E"
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[#1A1A1A]">Barangay e-Membership</p>
                <p className="text-sm text-[#6E6A60] mt-1">
                  Print and post at the Barangay Hall lobby.
                </p>
                <button
                  onClick={downloadQRCode}
                  className="mt-3 bg-[#1A1A1A] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#2E2E2E] transition"
                >
                  Download QR Code
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-[#1A1A1A]">Budget Snapshot</h2>
                <p className="text-[13px] mt-1 text-[#6E6A60]">Approved vs. spent — {getQuarterInfo().label}</p>
              </div>
              <button onClick={() => setActive("budget")} className="text-xs font-bold text-sage-700 hover:underline shrink-0">
                View all
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              {!budgetSummary || budgetSummary.per_event.length === 0 ? (
                <p className="text-sm text-[#9B9484] py-2">No approved event budgets this quarter.</p>
              ) : (
                (() => {
                  // Each bar just gets the next color in this fixed
                  // sequence, by position -- not tied to the percentage,
                  // so five events all sitting in the high-80s/90s still
                  // read as five distinct bars instead of one flat color.
                  const barTones = ["bg-sage-500", "bg-sage-800", "bg-gold-500", "bg-sage-400", "bg-[#B5533E]", "bg-sage-600", "bg-sage-300", "bg-sage-700"];
                  return budgetSummary.per_event.slice(0, 5).map((ev: any, idx: number) => {
                  const approved = Number(ev.approved_budget) || 0;
                  const spent = Number(ev.total_expenses) || 0;
                  const pct = approved > 0 ? Math.round((spent / approved) * 100) : 0;
                  const barColor = barTones[idx % barTones.length];
                  return (
                    <div key={ev.id}>
                      <div className="flex justify-between gap-3 text-[13px] mb-1.5">
                        <span className="font-semibold text-[#1A1A1A] truncate">{ev.name}</span>
                        <span className="text-[#6B6558] shrink-0">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#E6E0D3] overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                      </div>
                    </div>
                  );
                  });
                })()
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#1A1A1A]">Upcoming Events</h2>
              <button onClick={() => setActive("events")} className="text-xs font-bold text-sage-700 hover:underline">
                View all
              </button>
            </div>

            <div className="mt-4">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-[#9B9484] py-4">No upcoming events scheduled.</p>
              ) : (
                upcomingEvents.slice(0, 4).map((ev, i) => (
                  <button
                    key={ev.id ?? i}
                    onClick={() => setActive("events")}
                    className={`w-full text-left flex items-center justify-between gap-3 py-3 ${
                      i !== Math.min(upcomingEvents.length, 4) - 1 ? "border-b border-[#E6E0D3]" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{ev.name ?? ev.title}</p>
                      <p className="text-[11px] text-[#9B9484] mt-0.5 truncate">{ev.location}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-sage-700 bg-sage-50 rounded-full px-2.5 py-1">
                      {formatShortDate(ev.event_start ?? ev.date)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
