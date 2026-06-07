import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Filter, Calendar } from "lucide-react";

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
  const [selectedDate, setSelectedDate] = useState<string>(""); // ✅ Single date only
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1); // ✅ Pagination
  const itemsPerPage = 20; // ✅ CHANGED: now 20 per page
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
      const res = await fetch(`/activity-logs?page=${page}&limit=1000`); // Fetch all for client-side filtering
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

      setActivities(sorted);
      setHasMore(false); // We fetch all at once for pagination

    } catch (err) {
      console.error("Error loading activity logs:", err);
      setActivities([]);
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
  // FILTER + SEARCH + SINGLE DATE ✅
  // =========================
  const filteredActivities = useMemo(() => {
    let filtered = [...activities];

    // Search filter
    const search = searchQuery.toLowerCase();
    filtered = filtered.filter((act) =>
      act.action.toLowerCase().includes(search) ||
      act.description.toLowerCase().includes(search) ||
      act.user_code.toLowerCase().includes(search) ||
      act.module.toLowerCase().includes(search)
    );

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter((act) => act.type === filterType);
    }

    // ✅ SINGLE DATE FILTER — exact date only
    if (selectedDate) {
      const chosen = new Date(selectedDate);
      chosen.setHours(0, 0, 0, 0);
      const nextDay = new Date(chosen);
      nextDay.setDate(chosen.getDate() + 1);

      filtered = filtered.filter((act) => {
        const actDate = new Date(act.created_at);
        return actDate >= chosen && actDate < nextDay;
      });
    }

    return filtered;
  }, [activities, searchQuery, filterType, selectedDate]);

  // =========================
  // ✅ PAGINATION LOGIC (20 PER PAGE)
  // =========================
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredActivities.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredActivities, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, selectedDate]);

  // Handle scroll for the activity list container (load next page client-side)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (isLoadingMore || !hasMore) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120 && currentPage < totalPages) {
      setIsLoadingMore(true);
      setCurrentPage((p) => Math.min(totalPages, p + 1));
      setIsLoadingMore(false);
    }
  };

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

        {/* SEARCH + FILTERS — SAME LAYOUT & STYLE ✅ SINGLE DATE ONLY */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4 w-full">
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

          <div className="flex flex-wrap gap-3">
            {/* TYPE FILTER */}
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

            {/* ✅ SINGLE DATE CALENDAR INPUT */}
            <div className="relative h-full">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-full pl-10 pr-4 py-3.5 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30"
              />
              <Calendar className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {filteredActivities.length} record(s) found — showing {itemsPerPage} per page
        </p>

        {/* ✅ PAGINATION — EXACTLY LIKE NOTIFICATIONS PAGE */}
        <div className="flex justify-end mt-4">
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                ←
              </button>

              <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                {currentPage}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ACTIVITY LIST — SCROLLABLE */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="px-1 space-y-0 max-h-[70vh] overflow-y-auto pr-2"
      >
        {paginatedActivities.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
            <Filter size={40} className="mx-auto mb-3 text-[#005f63]/40" />
            <p>No activity records match your current filters.</p>
          </div>
        ) : (
          paginatedActivities.map((act, index) => (
            <div
              key={act.id}
              className={`relative pl-8 ${
                index !== paginatedActivities.length - 1 ? "pb-6" : ""
              }`}
            >
              {/* Connected Line */}
              {index !== paginatedActivities.length - 1 && (
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
          ))
        )}

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
