import React, { useState, useEffect, useRef } from "react";
import { Search, Filter } from "lucide-react";

type Activity = {
  id: number;
  action: string;
  module: string;
  description: string;
  user_code: string;
  created_at: string;
  type?: "event" | "resident" | "membership" | "notification" | "scan" | "system";
};

export default function ActivityLogsView() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const itemsPerPage = 20;
  const containerRef = useRef<HTMLDivElement>(null);

  // =========================
  // FORMAT DATE (FORMAL STYLE)
  // =========================
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);

    const datePart = date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });

    const timePart = date.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    return `${datePart} • ${timePart}`;
  };

  // =========================
  // MAP MODULE TO TYPE
  // =========================
  const mapType = (module: string): Activity["type"] => {
    switch (module) {
      case "Events":
        return "event";
      case "User":
        return "resident";
      case "Membership":
        return "membership";
      case "Authentication":
        return "system";
      case "QR":
        return "scan";
      case "Notifications":
        return "notification";
      default:
        return "system";
    }
  };

  // =========================
  // FETCH DATA
  // =========================
  const fetchActivities = async (page = 1) => {
    try {
      const res = await fetch(`/activity-logs?page=${page}&limit=${itemsPerPage}`);
      const json = await res.json();
      const logs = json.data ?? json ?? [];

      if (!Array.isArray(logs)) {
        throw new Error("Invalid API response format");
      }

      const formatted: Activity[] = logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        module: log.module,
        description: log.description,
        user_code: log.user_code,
        created_at: log.created_at,
        type: mapType(log.module),
      }));

      // ✅ FIXED SORT (newest first)
      const sorted = formatted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );

      if (page === 1) {
        setActivities(sorted);
      } else {
        setActivities((prev) => [...prev, ...sorted]);
      }

      setHasMore(sorted.length === itemsPerPage);
    } catch (err) {
      console.error("Error loading activity logs:", err);
      if (page === 1) setActivities([]);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchActivities(1);
  }, []);

  // =========================
  // SCROLL DETECTION
  // =========================
  const handleScroll = () => {
    if (!containerRef.current || loading || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // When user is near bottom
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setIsLoadingMore(true);
      const nextPage = Math.floor(activities.length / itemsPerPage) + 1;
      fetchActivities(nextPage);
    }
  };

  // =========================
  // FILTER + SEARCH
  // =========================
  const filteredActivities = activities.filter((act) => {
    const search = searchQuery.toLowerCase();

    const matchesSearch =
      act.action.toLowerCase().includes(search) ||
      act.description.toLowerCase().includes(search) ||
      act.user_code.toLowerCase().includes(search) ||
      act.module.toLowerCase().includes(search);

    const matchesType = filterType === "all" || act.type === filterType;

    return matchesSearch && matchesType;
  });

  // =========================
  // SKELETON LOADING ITEM
  // =========================
  const SkeletonItem = () => (
    <div className="relative pl-8 pb-6 animate-pulse">
      <span className="absolute left-[7px] top-2 h-full w-[1.5px] bg-teal-200"></span>
      <span className="absolute left-[4px] top-2 w-[8px] h-[8px] rounded-full bg-orange-200 z-10"></span>
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-2/5"></div>
    </div>
  );

  // =========================
  // INITIAL LOADING UI
  // =========================
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
         <h1 className="text-4xl font-black text-[#005f63]">Activity Logs</h1>
          <p className="mt-1 text-sm text-[#667777]">
            Complete record of all actions and changes made in the system.
          </p>

          <div className="mt-4 flex items-stretch gap-4 w-full">
            <div className="flex-1">
              <div className="w-full h-10 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
            <div className="flex gap-3">
              <div className="w-[140px] h-10 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Loading records...
          </p>
        </div>

        <div className="px-1 space-y-0">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <SkeletonItem key={i} />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER — MATCHES NOTIFICATIONS PAGE */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <h1 className="text-4xl font-black text-[#005f63]">Activity Logs </h1>
        <p className="mt-1 text-sm text-[#667777]">
          Complete record of all actions and changes made in the system.
        </p>

        {/* SEARCH + FILTER — SAME LAYOUT & STYLE */}
        <div className="mt-4 flex items-stretch gap-4 w-full">
          <div className="flex-1">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search activities by action, description, user or module..."
                className="w-full pl-10 pr-4 py-3.5 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative h-full">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-full pl-10 pr-8 py-3.5 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Activities</option>
                <option value="event">Events</option>
                <option value="resident">Residents</option>
                <option value="membership">Memberships</option>
                <option value="notification">Notifications</option>
                <option value="scan">QR Scans</option>
                <option value="system">System / Auth</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {filteredActivities.length} record(s) found
        </p>
      </div>

      {/* ACTIVITY LIST — SCROLLABLE */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="px-1 space-y-0 max-h-[70vh] overflow-y-auto pr-2"
      >
        {filteredActivities.map((act, index) => (
          <div
            key={act.id}
            className={`relative pl-8 ${
              index !== filteredActivities.length - 1 ? "pb-6" : ""
            }`}
          >
            {/* Connected Line */}
            {index !== filteredActivities.length - 1 && (
              <span className="absolute left-[7px] top-2 h-full w-[1.5px] bg-teal-300"></span>
            )}

            {/* Dot */}
            <span className="absolute left-[4px] top-2 w-[8px] h-[8px] rounded-full bg-orange-400 z-10"></span>

            {/* Action — slightly bigger */}
            <p className="text-base font-semibold text-[#005f63] leading-tight">
              {act.action}
            </p>

            {/* Module & Description — slightly bigger */}
            <p className="text-sm text-gray-600 mt-0.5">
              {act.module} — {act.description}
            </p>

            {/* Staff — slightly bigger */}
            <p className="text-sm text-gray-500 mt-0.5">Staff: {act.user_code}</p>

            {/* Date — slightly bigger */}
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDateTime(act.created_at)}
            </p>
          </div>
        ))}

        {/* Loading more skeleton */}
        {isLoadingMore && (
          <>
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </>
        )}

        {!hasMore && activities.length > 0 && (
          <p className="text-center text-sm text-gray-500 py-4">
            — End of records —
          </p>
        )}
      </div>
    </div>
  );
}
