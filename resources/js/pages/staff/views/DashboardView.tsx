import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
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

  const statsCards = [
    {
      value: stats.residents,
      label: "RESIDENTS",
      gradient: "from-orange-400 to-yellow-300",
      route: "residents",
      description: "Total registered residents"
    },
    {
      value: stats.memberships,
      label: "MEMBERSHIPS",
      gradient: "from-[#067a7a] to-[#5fd3d3]",
      route: "memberships",
      description: "Active membership types"
    },
    {
      value: stats.events,
      label: "EVENTS",
      gradient: "from-orange-400 to-yellow-300",
      route: "events",
      description: "Total events (upcoming + past)"
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          {t("staffConsole")}
        </p>
        <h1 className="mt-2 text-4xl font-black">{t("welcomeBack")}, {memberName}! 👋</h1>
        <p className="mt-2 text-base text-white/90">
          {t("staffDashboardSubtitle")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {statsCards.map((item, idx) => (
          <button
            key={idx}
            onClick={() => setActive(item.route)}
            className={`group w-full rounded-[30px] bg-gradient-to-r ${item.gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]`}
          >
            <h2 className="text-4xl lg:text-5xl font-black">{item.value}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
              {item.label}
            </p>
            <p className="mt-1 text-xs text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
              {item.description}
            </p>
          </button>
        ))}
      </div>

      {overdueBorrows.length > 0 && (
        <button
          onClick={() => setActive("returns")}
          className="w-full text-left rounded-[30px] border border-red-200 bg-red-50 p-5 flex items-center justify-between gap-4 flex-wrap hover:bg-red-100/70 transition-colors"
        >
          <div>
            <h2 className="text-lg font-black text-red-700">{t("overdueBorrowsTitle")}</h2>
            <p className="text-sm text-red-700/80 mt-1">
              {overdueBorrows.length} {overdueBorrows.length === 1 ? t("eventSingularLabel") : t("eventPluralLabel")} &mdash; {t("overdueBorrowsSubtitle")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-red-600 text-white text-xs font-semibold px-4 py-2.5">
            {t("reviewReturnsLabel")}
          </span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">System QR Code</h2>
          <p className="text-[15px] mt-1 text-gray-600">
            Residents scan this code to open the membership portal on their phone.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row items-start gap-4">
            <div className="shrink-0 flex justify-center w-full sm:w-auto">
              <QRCodeSVG
                id="system-qr-code"
                value={appUrl}
                size={160}
                bgColor="#ffffff"
                fgColor="#005f63"
                level="H"
                includeMargin={true}
              />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#005f63]">Barangay e-Membership</p>
              <p className="text-sm text-gray-600 mt-1">Posted at the Barangay Hall lobby</p>
              <p className="text-sm text-gray-600 mt-1">
                Print and post in public places — residents scan to access.
              </p>
              <button
                onClick={downloadQRCode}
                className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-[30px] text-sm font-medium hover:bg-orange-600 transition"
              >
                Download QR Code
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">
            Recent Activity
          </h2>

          <p className="text-[15px] mt-1 text-gray-600">
            Latest staff actions in the system.
          </p>

          <div className="mt-5 max-h-[260px] overflow-y-auto pr-2">
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
                    <span className="absolute left-[8px] top-2 h-full w-[2px] bg-teal-300"></span>
                  )}

                  <span className="absolute left-[4px] top-2 w-[10px] h-[10px] rounded-full bg-orange-400 z-10"></span>

                  <p className="text-[14px] font-semibold text-[#005f63] leading-tight">
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
      </div>
    </div>
  );
}
