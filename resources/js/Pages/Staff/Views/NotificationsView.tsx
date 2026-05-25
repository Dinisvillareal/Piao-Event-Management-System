import React, { useMemo, useState } from "react";
import { Filter, Users, Bell } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

function NotificationsView({ notifications, memberships, highlightText }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // all | upcoming | past
  const [targetFilter, setTargetFilter] = useState("all-residents"); // default to All residents
  const [selectedNotification, setSelectedNotification] = useState<any>(null); // for popup

  // ✅ Filter & search logic
  const filteredNotifications = useMemo(() => {
    let result = [...notifications];

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q)
      );
    }

    // 2. Date filter: All / Upcoming / Past
    const now = new Date();
    if (dateFilter === "upcoming") {
      result = result.filter((n) => new Date(n.sentAt) > now);
    } else if (dateFilter === "past") {
      result = result.filter((n) => new Date(n.sentAt) <= now);
    }

    // 3. Target membership filter
    if (targetFilter !== "all-residents") {
      result = result.filter((n) => n.targetMembershipId === targetFilter);
    }

    // Sort: newest first
    result.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    return result;
  }, [notifications, searchQuery, dateFilter, targetFilter]);

  // Format date to dd/mm/yyyy
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6">
      {/* ✅ FIXED HEADER — same style as member page */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de] shadow-b-sm">
        <div className="w-full">
          <h1 className="text-4xl font-black text-[#005f63]">Notifications & Announcements</h1>
          <p className="mt-1 text-sm text-[#667777]">View and filter all system notifications and announcements.</p>

          {/* ✅ SEARCH BAR + FILTERS — FULL VERTICAL ALIGNMENT (TOP ↔ BOTTOM) */}
          <div className="mt-4 flex items-stretch gap-4 w-full">
            {/* Search Bar — full height container */}
            <div className="flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search notifications by title or message..."
                className="h-full w-full rounded-full border border-[#005f63]/20"
              />
            </div>

            {/* Filters — SAME HEIGHT, PERFECT TOP-TO-BOTTOM ALIGNMENT */}
            <div className="flex gap-3">
              {/* Date filter */}
              <div className="relative h-full">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none whitespace-nowrap"
                >
                  <option value="all">All Notifications</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Past</option>
                </select>
                <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                <svg
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* ✅ Target Membership filter — shows "To:" by default, NOT in options; dropdown has All residents + memberships */}
              <div className="relative h-full">
                <select
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                  className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none whitespace-nowrap"
                >
                  {/* Only shows "To:" when closed; NOT an option in the list */}
                  <option value="all-residents" hidden>To:</option>
                  <option value="all-residents">All residents</option>
                  {memberships.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Users className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                <svg
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredNotifications.length} of {notifications.length} notification(s) match
          </p>
        </div>
      </div>

      {/* ✅ NOTIFICATIONS LIST — ORIGINAL GAP KEPT, strong pop-up hover effect, darker white background */}
      <div className="px-1 space-y-2">
        {filteredNotifications.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
            <Bell size={40} className="mx-auto mb-3 text-[#005f63]/40" />
            <p>No notifications match your current filters.</p>
          </div>
        ) : (
          filteredNotifications.map((n: any) => {
            // Get target name: All residents or specific membership
            const targetName = n.targetMembershipId
              ? memberships.find((m: any) => m.id === n.targetMembershipId)?.name || "Unknown Group"
              : "All residents";

            return (
              <div
                key={n.id}
                onClick={() => setSelectedNotification({ ...n, targetName })}
                className="relative rounded-3xl bg-white px-6 py-4 border-l-4 border-l-[#ecd862] border-y border-r border-gray-200 cursor-pointer transition-all duration-300 ease-out hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.25),0_10px_15px_-6px_rgba(0,0,0,0.10)] hover:-translate-y-1 hover:bg-gray-100"
              >
                <div className="flex items-center justify-between gap-4 w-full min-h-[44px]">
                  {/* ✅ LEFT SECTION: To → Title → Description — aligned in one line, proper text size */}
                  <div className="flex-1 min-w-0 flex items-center gap-2.5 text-base">
                    <span className="font-medium text-gray-800 whitespace-nowrap">To:</span>
                    <span className="text-gray-700 truncate">{highlightText(targetName, searchQuery)}</span>
                    <span className="text-gray-400">•</span>
                    <span className="font-semibold text-[#005f63] truncate">{highlightText(n.title, searchQuery)}</span>
                    <span className="text-gray-600 truncate">— {highlightText(n.body, searchQuery)}</span>
                  </div>

                  {/* ✅ RIGHT SECTION: Date — dd/mm/yyyy format */}
                  <div className="shrink-0 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(n.sentAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ✅ POPUP MODAL — shows full details when card is clicked */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border-l-6 border-l-[#ecd862]">
            {/* Header */}
            <div className="sticky top-0 bg-white px-8 py-5 border-b border-gray-100 flex justify-between items-center rounded-t-3xl">
              <h2 className="text-xl font-bold text-[#005f63]">Notification Details</h2>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="px-8 py-6 space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">To</label>
                <p className="text-base text-gray-800 font-medium">{selectedNotification.targetName}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">Title</label>
                <p className="text-lg font-semibold text-[#005f63]">{selectedNotification.title}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">Message</label>
                <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedNotification.body}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">Date Sent</label>
                <p className="text-base text-gray-600">{formatDate(selectedNotification.sentAt)}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-gray-100 text-right rounded-b-3xl">
              <button
                onClick={() => setSelectedNotification(null)}
                className="px-5 py-2 bg-[#005f63] text-white rounded-full hover:bg-[#004a4d] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationsView;
