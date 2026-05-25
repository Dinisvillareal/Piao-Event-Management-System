import React from "react";

export default function NotificationsView({ notifications, highlightText }: any) {
  return (
    <div className="space-y-3">
      {notifications.map((n: any) => (
        <div key={n.id} className="p-4 bg-white border rounded-2xl shadow-sm">
          <p className="font-bold text-[#005f63]">{highlightText(n.title, "")}</p>
          <p className="text-sm text-gray-600">{n.body}</p>
        </div>
      ))}
    </div>
  );
}