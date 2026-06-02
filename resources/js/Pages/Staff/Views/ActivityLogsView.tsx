import React, { useState, useEffect } from "react";
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
      case "Event":
        return "event";
      case "User":
        return "resident";
      case "Membership":
        return "membership";
      case "Authentication":
        return "system";
      case "QR":
        return "scan";
      default:
        return "system";
    }
  };

  // =========================
  // FETCH DATA
  // =========================
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await fetch("/activity-logs");

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

        const sorted = formatted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );

        setActivities(sorted);
      } catch (err) {
        console.error("Error loading activity logs:", err);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

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

    const matchesType =
      filterType === "all" || act.type === filterType;

    return matchesSearch && matchesType;
  });

  // =========================
  // LOADING UI
  // =========================
  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          SYSTEM HISTORY
        </p>
        <h1 className="mt-2 text-4xl font-black">Activity Logs 📋</h1>
        <p className="mt-2 text-base text-white/90">
          Complete record of all actions and changes made in the system.
        </p>
      </div>

      {/* SEARCH + FILTER */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[20px] border border-[#ddd5ca] shadow-sm">

        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activities..."
            className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
          />
        </div>

        <div className="relative w-full sm:w-[200px]">
          <Filter className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005f63]/30 appearance-none bg-white"
          >
            <option value="all">All Activities</option>
            <option value="event">Events</option>
            <option value="resident">Residents</option>
            <option value="membership">Memberships</option>
            <option value="notification">Notifications</option>
            <option value="scan">QR Scans</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      {/* LIST */}
      <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-6 hover:shadow-2xl transition-shadow duration-300">

        <h2 className="text-2xl font-black text-[#005f63] mb-4">
          All Activities
        </h2>

<div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
  {filteredActivities.map((act) => (
    <div key={act.id} className="relative pl-8 pb-4">

      <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-teal-500/40"></div>

      <span className="absolute left-[3px] top-2 w-3 h-3 rounded-full bg-orange-400 z-10"></span>

      <p className="font-semibold text-[#005f63]">
        {act.action}
      </p>

      <p className="text-[11px] text-gray-600">
        {act.module} - {act.description}
      </p>

      <p className="text-[11px] text-gray-500">
        Staff: {act.user_code}
      </p>
        <p className="text-[11px] text-gray-500">
        {formatDateTime(act.created_at)}
      </p>

    </div>
  ))}
</div>
      </div>
    </div>
  );
}
