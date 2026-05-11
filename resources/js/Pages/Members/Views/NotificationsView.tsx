import { useState, useMemo } from "react";
import SearchBar from "../../../Components/UI/SearchBar";

interface Notification {
  id: number;
  title: string;
  body: string;
  sentAt: string;
}

interface NotificationsViewProps {
  notifications: Notification[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function NotificationsView({
  notifications,
  highlightText,
}: NotificationsViewProps) {
  // We moved the search state here!
  const [notificationSearch, setNotificationSearch] = useState("");

  // We moved the filtering logic here!
  const filteredNotifications = useMemo(() => {
    if (!notificationSearch.trim()) return notifications;
    return notifications.filter((n) =>
      n.title.toLowerCase().includes(notificationSearch.toLowerCase()) ||
      n.body.toLowerCase().includes(notificationSearch.toLowerCase()) ||
      n.sentAt.toLowerCase().includes(notificationSearch.toLowerCase())
    );
  }, [notifications, notificationSearch]);

  return (
    <div className="space-y-6">
      {/* FIXED HEADER & SEARCH AREA */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-[1200px]">
          <h1 className="text-4xl font-black text-[#005f63]">Notifications</h1>
          <p className="text-sm text-[#667777] mt-1">
            Official announcements, updates, and reminders from barangay staff.
          </p>

          <div className="mt-4 w-[1580px]">
            <SearchBar
              value={notificationSearch}
              onChange={setNotificationSearch}
              placeholder="Search notifications by title, message, or date…"
            />
            <p className="mt-2 text-xs text-gray-500">
              {filteredNotifications.length} of {notifications.length}{" "}
              notification(s) match.
            </p>
          </div>
        </div>
      </div>

      {/* NOTIFICATIONS LIST */}
      <div className="mt-6 space-y-4 pl-1">
        {filteredNotifications.length === 0 ? (
          <p className="text-gray-500 italic">No notifications match your search.</p>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border-l-4 border-yellow-400 bg-[#f7f2e8] p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300"
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-bold text-[#005f63]">
                  {highlightText(n.title, notificationSearch)}
                </h2>
                <span className="text-xs text-gray-500">
                  {highlightText(n.sentAt, notificationSearch)}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700">
                {highlightText(n.body, notificationSearch)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}