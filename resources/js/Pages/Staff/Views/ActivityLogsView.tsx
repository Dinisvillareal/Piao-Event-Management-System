import React, { useState, useEffect } from "react";
import { Search, Filter } from "lucide-react";

type Activity = {
  id: number;
  action: string;
  detail: string;
  staff: string;
  time: string;
  type?: "event" | "resident" | "membership" | "notification" | "scan" | "system";
};

export default function ActivityLogsView() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);

  // ✅ Simulated fetch — replace with real API call
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        // Example data — replace with /api/activity-logs in production
        const data: Activity[] = [
          { id: 1, action: "Scanned QR — Sign In", detail: "Maria Santos · General Assembly", staff: "Brgy. Captain", time: "2026-05-12 08:55", type: "scan" },
          { id: 2, action: "Created Event", detail: "Senior Citizens Health Check", staff: "Brgy. Captain", time: "2026-05-06 11:02", type: "event" },
          { id: 3, action: "Sent Notification", detail: "General Assembly Reminder", staff: "Kagawad Lina", time: "2026-05-05 16:20", type: "notification" },
          { id: 4, action: "Generated QR", detail: "SK Youth Council — 2 members", staff: "Brgy. Captain", time: "2026-05-05 10:11", type: "membership" },
          { id: 5, action: "Added Resident", detail: "Liza Domingo (R-007)", staff: "Kagawad Lina", time: "2026-05-04 09:32", type: "resident" },
          { id: 6, action: "Updated Membership", detail: "Senior Citizens — added 3 residents", staff: "Brgy. Captain", time: "2026-05-03 14:18", type: "membership" },
          { id: 7, action: "Deleted Event", detail: "Youth Sports Day", staff: "Brgy. Captain", time: "2026-05-02 17:45", type: "event" },
          { id: 8, action: "System Login", detail: "Staff session started", staff: "Brgy. Captain", time: "2026-05-01 07:00", type: "system" },
        ];

        // Sort newest first
        const sorted = data.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setActivities(sorted);
      } catch (err) {
        console.error("Error loading activity logs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  // Filter and search logic
  const filteredActivities = activities.filter((act) => {
    const matchesSearch =
      act.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.detail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.staff.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === "all" || act.type === filterType;

    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          SYSTEM HISTORY
        </p>
        <h1 className="mt-2 text-4xl font-black">Activity Logs 📋</h1>
        <p className="mt-2 text-base text-white/90">
          Complete record of all actions and changes made in the system.
        </p>
      </div>

      {/* Search & Filter Bar */}
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

      {/* Activity List — ✅ EXACT SAME DESIGN AS DASHBOARD RECENT ACTIVITY */}
      <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-6 hover:shadow-2xl transition-shadow duration-300">
        <h2 className="text-2xl font-black text-[#005f63] mb-4">All Activities</h2>

        <div className="space-y-4 relative max-h-[70vh] overflow-y-auto pr-2">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-teal-500/40"></div>

          {filteredActivities.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              No activities match your search or filter.
            </div>
          ) : (
            filteredActivities.map((act) => (
              <div key={act.id} className="relative pl-6">
                <span className="absolute left-[4px] top-2 w-2 h-2 rounded-full bg-orange-400"></span>
                <p className="font-semibold text-[#005f63]">{act.action}</p>
                <p className="text-[11px] text-gray-600">{act.detail}</p>
                <p className="text-[11px] text-gray-500">
                  Staff: {act.staff} · {act.time}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
