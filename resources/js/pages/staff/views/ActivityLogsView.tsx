import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Activity as ActivityIcon,
  Eye,
  Clock,
  ShieldAlert,
  Calendar,
  User,
  Users,
  Bell,
  QrCode,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import DatePicker from "../../../components/ui/DatePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";

type Activity = {
  id: number;
  action: string;
  module: string;
  description: string;
  user_code: string;
  created_at: string;
  type?: "event" | "resident" | "membership" | "notification" | "scan" | "system";
};

const itemsPerPage = 20;

// Badge colors per module type -- sage for routine records, gold for
// scans/notifications (worth a glance), maroon for auth/system events
// (the ones staff most want to be able to spot at a glance).
const MODULE_BADGE_STYLES: Record<string, string> = {
  system: "bg-[#8A3D2C]/10 text-[#5C2A1E] border border-[#8A3D2C]/30",
  scan: "bg-gold-50 text-gold-700 border border-gold-200",
  notification: "bg-gold-50 text-gold-700 border border-gold-200",
  event: "bg-sage-50 text-sage-700 border border-sage-200",
  resident: "bg-sage-50 text-sage-700 border border-sage-200",
  membership: "bg-sage-50 text-sage-700 border border-sage-200",
};
const DEFAULT_MODULE_BADGE = "bg-[#F1EEE5] text-[#37423F] border border-[#E6E0D3]";

// Same palette, applied to each feed item's icon roundel instead of a
// table badge -- keeps type recognizable at a glance in a scannable feed.
const MODULE_ICON_WRAP: Record<string, string> = {
  system: "bg-[#8A3D2C]/10 text-[#5C2A1E]",
  scan: "bg-gold-50 text-gold-700",
  notification: "bg-gold-50 text-gold-700",
  event: "bg-sage-50 text-sage-700",
  resident: "bg-sage-50 text-sage-700",
  membership: "bg-sage-50 text-sage-700",
};
const DEFAULT_ICON_WRAP = "bg-[#F1EEE5] text-[#37423F]";

const MODULE_ICONS: Record<string, typeof ActivityIcon> = {
  system: ShieldAlert,
  scan: QrCode,
  notification: Bell,
  event: Calendar,
  resident: User,
  membership: Users,
};
const DEFAULT_MODULE_ICON = ActivityIcon;

export default function ActivityLogsView() {
  const { t } = useLanguage();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Real-time refresh -- other staff generate activity constantly, so this
  // polls quietly in the background rather than relying on a manual
  // refresh. `background` skips the loading skeleton so the table doesn't
  // flash/reset scroll position every 20s; it's only shown on first load
  // or when a filter changes.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // =========================
  // MAP MODULE TO TYPE
  // =========================
  const mapType = (module: string): Activity["type"] => {
    switch (module) {
      case "Events": return "event";
      case "User": return "resident";
      case "Membership": return "membership";
      case "Authentication": return "system";
      case "QR": return "scan";
      case "Notifications": return "notification";
      default: return "system";
    }
  };

  // =========================
  // ✅ FETCH — send ALL filters to backend
  // =========================
  const fetchActivities = async (page = 1, background = false) => {
    if (!background) setLoading(true);
    try {
      // Build query params with all filters
      const params = new URLSearchParams({
        page: String(page),
        search: searchQuery,
        type: filterType !== "all" ? filterType : "",
        date: selectedDate,
      });

      const res = await fetch(`/activity-logs?${params.toString()}`);
      const json = await res.json();

      const logs = json.data ?? [];

      const formatted: Activity[] = logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        module: log.module,
        description: log.description,
        user_code: log.user_code,
        created_at: log.created_at,
        type: mapType(log.module),
      }));

      setActivities(formatted);
      setTotalPages(json.last_page || 1); // ✅ Now reflects filtered total
      setTotalRecords(typeof json.total === "number" ? json.total : formatted.length);
      setLastUpdated(new Date());

    } catch (err) {
      console.error("Error loading activity logs:", err);
      if (!background) {
        setActivities([]);
        setTotalPages(1);
        setTotalRecords(0);
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  // Fetch when page, search, filter, or date changes
  useEffect(() => {
    fetchActivities(currentPage);
  }, [currentPage, searchQuery, filterType, selectedDate]);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, selectedDate]);

  // Quiet background poll -- keeps the log fresh without disturbing
  // whatever the staff member is currently reading or typing.
  useEffect(() => {
    const poll = setInterval(() => fetchActivities(currentPage, true), 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, filterType, selectedDate]);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsSinceUpdate = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated.getTime()) / 1000)) : null;
  const lastUpdatedLabel =
    secondsSinceUpdate === null
      ? ""
      : secondsSinceUpdate < 5
      ? t("updatedJustNowLabel")
      : secondsSinceUpdate < 60
      ? t("updatedSecondsAgoLabel").replace("{n}", String(secondsSinceUpdate))
      : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(secondsSinceUpdate / 60)));

  // =========================
  // ✅ NOW: NO client-side filtering — backend does it
  // =========================
  const filteredActivities = useMemo(() => {
    return activities;
  }, [activities]);

  // At-a-glance stats for the page currently in view -- the log itself is
  // paginated server-side, so "shown" describes this page while "total"
  // uses the server-reported grand total.
  const stats = useMemo(() => {
    const systemEvents = filteredActivities.filter((a) => a.type === "system").length;
    const latestAt = filteredActivities[0]?.created_at;
    return { systemEvents, latestAt };
  }, [filteredActivities]);

  const relativeTimeLabel = (dateString?: string) => {
    if (!dateString) return "--";
    const then = new Date(dateString).getTime();
    if (isNaN(then)) return "--";
    const diffSec = Math.max(0, Math.floor((nowTick - then) / 1000));
    if (diffSec < 60) return t("justNowLabel");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t("minutesAgoShortLabel").replace("{n}", String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("hoursAgoShortLabel").replace("{n}", String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    return t("daysAgoShortLabel").replace("{n}", String(diffDay));
  };

  // Groups the current page's activities into day buckets (Today /
  // Yesterday / a formatted date) in their existing (newest-first) order,
  // so the feed reads like a real activity stream instead of a flat list.
  const groupedActivities = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yesterdayKey = yest.toDateString();

    const order: string[] = [];
    const map = new Map<string, Activity[]>();
    filteredActivities.forEach((act) => {
      const d = new Date(act.created_at);
      const key = isNaN(d.getTime()) ? "unknown" : d.toDateString();
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(act);
    });

    return order.map((key) => {
      let label: string;
      if (key === "unknown") label = t("unknownDateLabel");
      else if (key === todayKey) label = t("todayLabel");
      else if (key === yesterdayKey) label = t("yesterdayLabel");
      else label = new Date(key).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
      return { key, label, items: map.get(key)! };
    });
  }, [filteredActivities, t]);

  const typeOptions = [
    { value: "all", label: t("allActivities") },
    { value: "event", label: t("events") },
    { value: "membership", label: t("memberships") },
    { value: "notification", label: t("notify") },
    { value: "scan", label: t("qrScansOption") },
    { value: "resident", label: t("residents") },
    { value: "system", label: t("systemAuthOption") },
    { value: "inventory", label: t("inventory") },
    { value: "budget", label: t("budget") },
    { value: "household", label: t("households") },
    { value: "profiling", label: t("profilingSettingsOption") },
    { value: "archive", label: t("archiveActivityOption") },
  ];

  const statCards: Array<{
    key: string;
    label: string;
    desc: string;
    value: number | string;
    icon: typeof ActivityIcon;
    gradient: string;
    isText?: boolean;
  }> = [
    {
      key: "total",
      label: t("totalLoggedActivitiesStatLabel"),
      desc: t("totalLoggedActivitiesStatDesc"),
      value: totalRecords,
      icon: ActivityIcon,
      gradient: "from-sage-800 to-[#1C2E2B]",
    },
    {
      key: "page",
      label: t("shownThisPageStatLabel"),
      desc: t("shownThisPageStatDesc"),
      value: filteredActivities.length,
      icon: Eye,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      key: "latest",
      label: t("latestActivityStatLabel"),
      desc: t("latestActivityStatDesc"),
      value: relativeTimeLabel(stats.latestAt),
      icon: Clock,
      gradient: "from-gold-400 to-gold-700",
      isText: true,
    },
    {
      key: "security",
      label: t("securityAuthEventsStatLabel"),
      desc: t("securityAuthEventsStatDesc"),
      value: stats.systemEvents,
      icon: ShieldAlert,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]",
    },
  ];

  const SkeletonItem = () => (
    <div className="relative pl-11 pb-6 last:pb-0">
      <span className="absolute left-[15px] top-9 bottom-0 w-px bg-[#F1EEE5]" />
      <span className="absolute left-0 top-0 h-8 w-8 rounded-full bg-[#F1EEE5] animate-pulse" />
      <div className="h-3.5 bg-[#F1EEE5] rounded w-1/2 animate-pulse" />
      <div className="h-3 bg-[#F1EEE5] rounded w-2/3 mt-2 animate-pulse" />
      <div className="h-3 bg-[#F1EEE5] rounded w-1/3 mt-2 animate-pulse" />
    </div>
  );

  // Total count across all day-groups so the very last row in the feed
  // (and only that one) skips the connecting timeline line beneath it.
  const totalFeedItems = filteredActivities.length;
  let renderedFeedIndex = 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1A1A1A]">{t("activitylogs")}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">{t("activityLogsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#E6E0D3] bg-white px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-600" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-sage-700">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-[#9C9584]">&bull; {lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white`}>
              <div className="flex items-start justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide">{card.label}</span>
                <Icon className="h-5 w-5 text-white/40" />
              </div>
              <p
                className={`mt-2 font-display font-extrabold tracking-tight [font-variant-numeric:tabular-nums] ${
                  card.isText ? "text-xl lg:text-2xl" : "text-2xl lg:text-3xl"
                }`}
              >
                {card.value}
              </p>
              <p className="mt-1 text-xs text-white/75">{card.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 rounded-2xl border border-[#E6E0D3] bg-white p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9C9584]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchActivitiesPlaceholder")}
              className="h-11 w-full rounded-xl border border-transparent bg-transparent pl-10 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#9C9584] focus:outline-none focus:ring-2 focus:ring-sage-700/20 focus:border-sage-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterDropdown
            value={filterType}
            onChange={setFilterType}
            options={typeOptions}
            className="h-11 pl-10 pr-8"
            icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-700/70 pointer-events-none" />}
          />
          <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 px-4" />
        </div>
      </div>

      <p className="text-xs text-[#6B7280]">
        {filteredActivities.length} {t("recordsFoundCount")} &bull; {t("showingLabel")} {itemsPerPage} {t("perPage")}
      </p>

      <div className="rounded-2xl border border-[#E6E0D3] bg-white p-5 sm:p-6">
        {loading ? (
          <div>{Array(6).fill(0).map((_, i) => <SkeletonItem key={i} />)}</div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-12 text-center text-[#6B7280]">
            <Filter size={32} className="mx-auto mb-3 text-[#9C9584]" />
            {t("noActivityMatch")}
          </div>
        ) : (
          groupedActivities.map((group) => (
            <div key={group.key} className="mb-6 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wide text-[#1A1A1A] bg-[#F1EEE5] rounded-full px-3 py-1 shrink-0">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-[#E6E0D3]" />
              </div>

              <div>
                {group.items.map((act) => {
                  renderedFeedIndex += 1;
                  const isLast = renderedFeedIndex === totalFeedItems;
                  const Icon = MODULE_ICONS[act.type ?? ""] ?? DEFAULT_MODULE_ICON;
                  const iconWrap = MODULE_ICON_WRAP[act.type ?? ""] ?? DEFAULT_ICON_WRAP;
                  const secondsAgo = Math.max(0, Math.floor((nowTick - new Date(act.created_at).getTime()) / 1000));
                  const isFresh = !isNaN(secondsAgo) && secondsAgo < 60;
                  const timeOfDay = new Date(act.created_at).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <div key={act.id} className={`relative pl-11 ${isLast ? "" : "pb-6"} group`}>
                      {!isLast && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-[#E6E0D3]" />}
                      <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full ${iconWrap}`}>
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="rounded-xl -mx-2 px-2 py-1.5 transition-colors group-hover:bg-sage-50/60">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-[#1A1A1A]">{act.action}</p>
                              {isFresh && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                  <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
                                  {t("newLabel")}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#6B7280] mt-0.5">{act.description}</p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${MODULE_BADGE_STYLES[act.type ?? ""] ?? DEFAULT_MODULE_BADGE}`}>
                                {act.module}
                              </span>
                              <span className="text-xs text-[#9C9584]">{t("staffColon")} {act.user_code}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-[#37423F] whitespace-nowrap">{timeOfDay}</p>
                            <p className="text-[11px] text-[#9C9584] mt-0.5 whitespace-nowrap">{relativeTimeLabel(act.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <p className="text-sm text-[#6B7280] text-center sm:text-left">
            {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-800 hover:text-white hover:border-sage-800 transition-all active:scale-95"
            >
              ←
            </button>
            <span className="h-8 w-8 rounded-full bg-sage-800 text-white shadow-sm flex items-center justify-center text-sm font-semibold">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded-full border border-[#E6E0D3] bg-white text-sage-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sage-800 hover:text-white hover:border-sage-800 transition-all active:scale-95"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
