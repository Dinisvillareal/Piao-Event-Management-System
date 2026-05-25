import React from "react";
import StaffFakeQR from "../StaffFakeQR"; // ✅ Using the Staff specific QR!

export default function DashboardView({ memberName, membershipsCount, setActive }: any) {
  const stats = [
    { value: 8, label: "RESIDENTS", key: "residents", gradient: "from-orange-400 to-yellow-300" },
    { value: membershipsCount, label: "MEMBERSHIPS", key: "memberships", gradient: "from-[#067a7a] to-[#5fd3d3]" },
    { value: 4, label: "EVENTS", key: "events", gradient: "from-orange-400 to-yellow-300" }
  ];

  const recentActivities = [
    { action: "Scanned QR — Sign In", detail: "Maria Santos · General Assembly", staff: "Brgy. Captain", time: "2026-05-12 08:55" },
    { action: "Created Event", detail: "Senior Citizens Health Check", staff: "Brgy. Captain", time: "2026-05-06 11:02" },
    { action: "Sent Notification", detail: "General Assembly Reminder", staff: "Kagawad Lina", time: "2026-05-05 16:20" },
    { action: "Generated QR", detail: "SK Youth Council — 2 members", staff: "Brgy. Captain", time: "2026-05-05 10:11" },
    { action: "Added Resident", detail: "Liza Domingo (R-007)", staff: "Kagawad Lina", time: "2026-05-04 09:32" }
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">STAFF CONSOLE</p>
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-4">
        {stats.map((item, idx) => (
          <button
            key={idx}
            onClick={() => setActive(item.key)}
            className={`w-full rounded-[30px] bg-gradient-to-r ${item.gradient} p-5 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-sm`}
          >
            <h2 className="text-5xl font-black">{item.value}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide">{item.label}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">System QR Code</h2>
          <p className="text-[15px] mt-1 text-gray-600">Residents scan this code to open the membership portal on their phone.</p>
          <div className="mt-5 flex items-start gap-4">
            <div className="shrink-0">
              <StaffFakeQR seed="BARangay-E-MEMBERSHIP-001" large />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#005f63]">Barangay e-Membership</p>
              <p className="text-sm text-gray-600 mt-1">Posted at the Barangay Hall lobby</p>
              <button className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-[30px] text-sm font-medium hover:bg-orange-600 transition">
                Download printable QR
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">Recent Activity</h2>
          <div className="mt-5 space-y-4 relative max-h-[260px] overflow-y-auto pr-2 smooth-scroll">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-teal-500/40"></div>
            {recentActivities.map((act, i) => (
              <div key={i} className="relative pl-6">
                <span className="absolute left-[4px] top-2 w-2 h-2 rounded-full bg-orange-400"></span>
                <p className="font-semibold text-[#005f63]">{act.action}</p>
                <p className="text-[11px] text-gray-600">{act.detail}</p>
                <p className="text-[11px] text-gray-500">Staff: {act.staff} · {act.time}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}