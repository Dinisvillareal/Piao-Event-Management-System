import React from "react";

interface DashboardProps {
  memberName: string;
  membershipsCount: number;
  attendedCount: number;
  missedCount: number;
  setActive: (key: string) => void;
  notifications: any[];
  upcomingEvents: any[];
  pastEventsCount: number;
}

export default function DashboardView({ memberName, membershipsCount, setActive }: DashboardProps) {
  const stats = [
    { value: 8, label: "RESIDENTS", key: "residents" },
    { value: membershipsCount, label: "MEMBERSHIPS", key: "memberships" },
    { value: 4, label: "EVENTS", key: "events" }
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">STAFF CONSOLE</p>
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <button 
            key={s.label} 
            onClick={() => setActive(s.key)} 
            className="w-full rounded-[30px] bg-white p-5 text-left border shadow-sm hover:scale-[1.02] transition"
          >
            <h2 className="text-5xl font-black text-[#005f63]">{s.value}</h2>
            <p className="mt-2 text-sm font-semibold text-gray-500 uppercase">{s.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}