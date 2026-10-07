import React, { useState, useEffect, useMemo, useRef } from "react";
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
  ArrowUpDown,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import StatCardSkeleton, { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";
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

// Dark-palette badge colors per module type -- teal for routine records,
// gold for scans/notifications (worth a glance), rust for auth/system
// events (the ones staff most want to be able to spot at a glance), same
// semantic mapping the light version used, just recolored for the dark
// navy/gold/teal system used everywhere else.
const MODULE_BADGE_STYLES: Record<string, string> = {
  system: "bg-[#8A3D2C]/25 text-[#E2A088] border border-[#8A3D2C]/40",
  scan: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  notification: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  event: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  resident: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  membership: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
};
const DEFAULT_MODULE_BADGE = "bg-white/10 text-white/60 border border-white/15";

// Same palette, applied to each feed item's icon roundel instead of a
// table badge -- keeps type recognizable at a glance in a scannable feed.
const MODULE_ICON_WRAP: Record<string, string> = {
  system: "bg-[#8A3D2C]/25 text-[#E2A088]",
  scan: "bg-gold-400/15 text-gold-300",
  notification: "bg-gold-400/15 text-gold-300",
  event: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  resident: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  membership: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
};
const DEFAULT_ICON_WRAP = "bg-white/10 text-white/60";

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
  const { t, locale } = useLanguage();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  // Page-open skeleton for the KPI strip (first load only -- never returns on polls).
  const statsLoading = usePageOpenSkeleton(loading);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  // Anchor at the very top of the page -- scrolled into view on every
  // pagination click so switching pages always lands the user back at the
  // top of the feed instead of leaving them wherever they'd scrolled to
  // on the previous page.
  const topRef = useRef<HTMLDivElement>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
  // Tags every fetch with an ever-increasing id so a slower, older
  // request can never overwrite what a newer one already returned. This
  // app fires more than one fetch per user action -- a filter/sort change
  // triggers this effect AND (when not already on page 1) a follow-up
  // page-reset re-fetch, and the 20-second background poll can already be
  // in flight when the user changes something -- so without this guard,
  // whichever response's network round-trip happens to land last wins,
  // even when it was the OLDER, now-stale request (e.g. switching to
  // "Oldest First" appearing to do nothing because a leftover
  // "Newest First" response for the previous selection lands afterward).
  const fetchRequestIdRef = useRef(0);

  const fetchActivities = async (page = 1, background = false) => {
    if (!background) setLoading(true);
    const requestId = ++fetchRequestIdRef.current;
    try {
      // Build query params with all filters
      const params = new URLSearchParams({
        page: String(page),
        search: searchQuery,
        type: filterType !== "all" ? filterType : "",
        date: selectedDate,
        sort: sortOrder,
      });

      const res = await fetch(`/activity-logs?${params.toString()}`);
      const json = await res.json();

      if (requestId !== fetchRequestIdRef.current) return; // superseded by a newer request

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
      if (requestId !== fetchRequestIdRef.current) return; // superseded by a newer request
      console.error("Error loading activity logs:", err);
      if (!background) {
        setActivities([]);
        setTotalPages(1);
        setTotalRecords(0);
      }
    } finally {
      if (requestId === fetchRequestIdRef.current && !background) setLoading(false);
    }
  };

  // Fetch when page, search, filter, or date changes
  useEffect(() => {
    fetchActivities(currentPage);
  }, [currentPage, searchQuery, filterType, selectedDate, sortOrder]);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, selectedDate, sortOrder]);

  // Quiet background poll -- keeps the log fresh without disturbing
  // whatever the staff member is currently reading or typing.
  useEffect(() => {
    const poll = setInterval(() => fetchActivities(currentPage, true), 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, filterType, selectedDate, sortOrder]);

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
      else label = new Date(key).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
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
  ].sort((a, b) => a.label.localeCompare(b.label));

  const sortOptions = [
    { value: "desc", label: t("newestFirstLabel") },
    { value: "asc", label: t("oldestFirstLabel") },
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
      <span className="absolute left-[15px] top-9 bottom-0 w-px bg-white/10" />
      <span className="absolute left-0 top-0 h-8 w-8 rounded-full bg-white/10 animate-pulse" />
      <div className="h-3.5 bg-white/10 rounded w-1/2 animate-pulse" />
      <div className="h-3 bg-white/10 rounded w-2/3 mt-2 animate-pulse" />
      <div className="h-3 bg-white/10 rounded w-1/3 mt-2 animate-pulse" />
    </div>
  );

  // Total count across all day-groups so the very last row in the feed
  // (and only that one) skips the connecting timeline line beneath it.
  const totalFeedItems = filteredActivities.length;
  let renderedFeedIndex = 0;

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events/Budget/Returns
        pages, so Activity Logs reads as part of the same system instead
        of the old light "paper" page. This page has no add/edit modal of
        its own, just the feed below. */}
    <div ref={topRef} className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("activitylogs")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("activityLogsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-white/40">&bull; {lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          if (statsLoading) return <StatCardSkeleton key={card.key} />;
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
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchActivitiesPlaceholder")}
              className="h-11 w-full rounded-xl border border-transparent bg-transparent pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterDropdown
            value={filterType}
            onChange={setFilterType}
            options={typeOptions}
            className="h-11 pl-10 pr-8"
            icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
            dark
          />
          <FilterDropdown
            value={sortOrder}
            onChange={(v) => setSortOrder(v as "desc" | "asc")}
            options={sortOptions}
            className="h-11 pl-10 pr-8"
            icon={<ArrowUpDown className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
            dark
          />
          <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 px-4" dark />
        </div>
      </div>

      <p className="text-xs text-white/45">
        {filteredActivities.length} {t("recordsFoundCount")} &bull; {t("showingLabel")} {itemsPerPage} {t("perPage")}
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {loading ? (
          <div>{Array(6).fill(0).map((_, i) => <SkeletonItem key={i} />)}</div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-12 text-center text-white/40">
            <Filter size={32} className="mx-auto mb-3 text-white/25" />
            {t("noActivityMatch")}
          </div>
        ) : (
          groupedActivities.map((group) => (
            <div key={group.key} className="mb-6 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wide text-white bg-white/10 rounded-full px-3 py-1 shrink-0">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div>
                {group.items.map((act) => {
                  renderedFeedIndex += 1;
                  const isLast = renderedFeedIndex === totalFeedItems;
                  const Icon = MODULE_ICONS[act.type ?? ""] ?? DEFAULT_MODULE_ICON;
                  const iconWrap = MODULE_ICON_WRAP[act.type ?? ""] ?? DEFAULT_ICON_WRAP;
                  const secondsAgo = Math.max(0, Math.floor((nowTick - new Date(act.created_at).getTime()) / 1000));
                  const isFresh = !isNaN(secondsAgo) && secondsAgo < 60;
                  const timeOfDay = new Date(act.created_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <div key={act.id} className={`relative pl-11 ${isLast ? "" : "pb-6"} group`}>
                      {!isLast && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-white/10" />}
                      <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full ${iconWrap}`}>
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="rounded-xl -mx-2 px-2 py-1.5 transition-colors group-hover:bg-white/[0.05]">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white">{act.action}</p>
                              {isFresh && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#4FBEB0]/15 text-[#7DD8CB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#4FBEB0] animate-pulse" />
                                  {t("newLabel")}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/50 mt-0.5">{act.description}</p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${MODULE_BADGE_STYLES[act.type ?? ""] ?? DEFAULT_MODULE_BADGE}`}>
                                {act.module}
                              </span>
                              <span className="text-xs text-white/40">{t("staffColon")} {act.user_code}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-white/70 whitespace-nowrap">{timeOfDay}</p>
                            <p className="text-[11px] text-white/40 mt-0.5 whitespace-nowrap">{relativeTimeLabel(act.created_at)}</p>
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
          <p className="text-sm text-white/45 text-center sm:text-left">
            {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >
              ←
            </button>
            <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
              {currentPage}
            </span>
            <button
              onClick={() => goToPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
    </>
  );
}
