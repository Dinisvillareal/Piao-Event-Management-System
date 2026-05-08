import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  SquareMenu,
  KeyRound,
} from "lucide-react";

export default function MemberDashboard() {
  const [active, setActive] = useState("dashboard");

  const member = {
    id: "PR-1001",
    name: "Maria Santos",
  };

  const memberships = [
    {
      id: "m1",
      name: "Verified Resident",
      description: "Official barangay resident membership.",
    },
  ];

  const notifications = [
    {
      id: 1,
      title: "General Assembly Reminder",
      body: "Please attend the General Assembly on May 12, 9:00 AM at the Barangay Hall.",
      sentAt: "2026-05-05 16:20",
    },
    {
      id: 2,
      title: "Bring your QR code",
      body: "Always bring your QR code for attendance scanning.",
      sentAt: "2026-05-04 10:00",
    },
    {
      id: 3,
      title: "Sports Fest open registration",
      body: "SK Youth Sports Fest registration is now open.",
      sentAt: "2026-05-02 09:15",
    },
  ];

  const upcomingEvents = [
    {
      id: 1,
      title: "Barangay General Assembly",
      date: "2026-05-12 09:00",
      location: "Barangay Hall",
      description: "Quarterly assembly of all registered members.",
    },
  ];

  const pastEvents = [];

  const attended = 1;
  const missed = 0;

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Codes", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
<aside className="hidden w-[250px] flex-col border-r border-[#ddd5ca] bg-white md:flex">
  {/* LOGO */}
  <div className="border-b border-[#ddd5ca] px-5 py-5">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-400 font-black text-black">
        B
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#005f63]/70">
          Barangay Piao
        </p>

        <h1 className="text-xl font-black text-[#005f63]">
          e-Membership
        </h1>
      </div>
    </div>
  </div>

  {/* NAVIGATION */}
  <div className="flex-1 px-2 py-5">
    <p className="mb-3 px-3 text-sm font-semibold text-[#005f63]/70">
      Member Area
    </p>

    <div className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 ${
              active === item.key
                ? "bg-gradient-to-r from-orange-300 via-orange-200 to-yellow-200 text-[#005f63] shadow-[0_8px_25px_rgba(150,146,60,0.35)] font-bold scale-[1.02]"
                : "text-[#005f63] hover:bg-orange-100 hover:shadow-md"
            }`}
          >
            <Icon className="h-5 w-5" />

            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  </div>

  {/* SIGN OUT */}
  <div className="border-t border-[#ddd5ca] p-2">
    <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[#005f63] transition hover:bg-orange-100">
      <LogOut className="h-5 w-5" />

      <span className="font-medium">Sign out</span>
    </button>
  </div>
</aside>

        {/* MAIN */}
        <main className="flex-1">
          {/* TOP HEADER */}
          <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-6 py-4">
            {/* LEFT */}
            <div className="flex items-center gap-3">
              <SquareMenu className="h-5 w-5 text-gray-700" />

              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                  Resident Member Portal
                </p>

                <h2 className="font-bold text-[#005f63]">
                  Dashboard
                </h2>
              </div>
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  Signed in as
                </p>

                <p className="text-sm font-bold text-[#005f63]">
                  Maria Santos
                </p>
              </div>

              <div className="rounded-full bg-[#2cb7b7] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow">
                Member · Resident
              </div>
            </div>
          </div>

          {/* CONTENT */}
            <div className="space-y-5 p-5">
            {/* DASHBOARD */}
            {active === "dashboard" && (
                <>
                {/* HERO */}
                <div className="rounded-[24px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                    Member Dashboard
                    </p>

                    <h1 className="mt-2 text-4xl font-black">
                    Welcome back, Maria!
                    </h1>

                    <p className="mt-2 text-base text-white/90">
                    You are signed in as a resident member.
                    </p>
                </div>

                {/* SUMMARY */}
                <div className="grid gap-4 md:grid-cols-3">
                    <SummaryCard
                    value={memberships.length}
                    title="Verified Memberships"
                    gradient="from-orange-400 to-yellow-300"
                    />

                    <SummaryCard
                    value={attended}
                    title="Events Attended"
                    gradient="from-[#18b5b5] to-[#5fd3d3]"
                    />

                    <SummaryCard
                    value={missed}
                    title="Events Missed"
                    gradient="from-yellow-300 to-orange-400"
                    />
                </div>

                {/* LOWER CARDS */}
                <div className="grid gap-4 lg:grid-cols-2">
                    {/* NOTIFICATIONS */}
                    <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-black text-[#005f63]">
                        Latest Notifications
                    </h2>

                    <p className="mt-1 text-gray-600">
                        Posts from your barangay staff.
                    </p>

                    <div className="mt-5 space-y-3">
                        {notifications.map((item) => (
                        <div
                            key={item.id}
                            className="rounded-2xl border-l-4 border-yellow-400 bg-[#f7f2e8] p-3"
                        >
                            <div className="flex items-start justify-between gap-4">
                            <h3 className="text-lg font-bold text-[#005f63]">
                                {item.title}
                            </h3>

                            <span className="text-xs text-gray-500">
                                {item.sentAt}
                            </span>
                            </div>

                            <p className="mt-2 text-sm text-gray-700">
                            {item.body}
                            </p>
                        </div>
                        ))}
                    </div>
                    </div>

                    {/* UPCOMING EVENTS */}
                    <div className="rounded-[22px] border border-[#ddd5ca] bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-black text-[#005f63]">
                        Upcoming Events
                    </h2>

                    <p className="mt-1 text-gray-600">
                        Events you're eligible to attend.
                    </p>

                    <div className="mt-5">
                        {upcomingEvents.map((e) => (
                        <div
                            key={e.id}
                            className="rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-3"
                        >
                            <h3 className="text-lg font-bold text-[#005f63]">
                            {e.title}
                            </h3>

                            <p className="mt-1 text-sm text-gray-500">
                            {e.date} · {e.location}
                            </p>

                            <p className="mt-2 text-sm text-gray-700">
                            {e.description}
                            </p>
                        </div>
                        ))}

                        <p className="mt-5 text-sm text-gray-500">
                        {pastEvents.length} past event(s) on record.
                        </p>
                    </div>
                    </div>
                </div>
                </>
            )}

            {/* QR */}
            {active === "qr" && (
              <div>
                <h1 className="text-4xl font-black text-[#005f63]">
                  My QR Codes
                </h1>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {memberships.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-3xl border bg-white p-6 shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-[#005f63]">
                            {m.name}
                          </h2>

                          <p className="text-sm text-gray-500">
                            {m.description}
                          </p>
                        </div>

                        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
                          Verified
                        </span>
                      </div>

                      <div className="mt-6 flex items-center gap-5">
                        <FakeQR seed={`${member.id}-${m.id}`} />

                        <div>
                          <p className="font-semibold text-[#005f63]">
                            QR ID
                          </p>

                          <p className="text-xs text-gray-500">
                            {member.id}-{m.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ATTENDANCE */}
            {active === "attendance" && (
              <div>
                <h1 className="text-4xl font-black text-[#005f63]">
                  Attendance
                </h1>

                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl border bg-white p-5 shadow">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-[#005f63]">
                          Community Assembly
                        </h2>

                        <p className="text-sm text-gray-500">
                          April 20, 2026 · Barangay Hall
                        </p>
                      </div>

                      <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
                        Attended
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EVENTS */}
            {active === "events" && (
              <div>
                <h1 className="text-4xl font-black text-[#005f63]">
                  Events
                </h1>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {upcomingEvents.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-3xl border bg-white p-5 shadow"
                    >
                      <h2 className="font-bold text-[#005f63]">
                        {e.title}
                      </h2>

                      <p className="mt-1 text-sm text-gray-500">
                        {e.date} · {e.location}
                      </p>

                      <p className="mt-3 text-gray-700">
                        {e.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {active === "notify" && (
              <div>
                <h1 className="text-4xl font-black text-[#005f63]">
                  Notifications
                </h1>

                <div className="mt-6 space-y-4">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-3xl border-l-4 border-orange-400 bg-white p-5 shadow"
                    >
                      <div className="flex justify-between gap-3">
                        <h2 className="font-bold text-[#005f63]">
                          {n.title}
                        </h2>

                        <span className="text-xs text-gray-500">
                          {n.sentAt}
                        </span>
                      </div>

                      <p className="mt-2 text-gray-700">
                        {n.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SETTINGS */}
            {active === "settings" && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* PASSWORD */}
                <div className="rounded-3xl border bg-white p-6 shadow">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-orange-500" />

                    <h2 className="text-3xl font-black text-[#005f63]">
                      Change Password
                    </h2>
                  </div>

                  <div className="mt-6 space-y-4">
                    <input
                      type="password"
                      placeholder="Current Password"
                      className="w-full rounded-2xl border px-4 py-3"
                    />

                    <input
                      type="password"
                      placeholder="New Password"
                      className="w-full rounded-2xl border px-4 py-3"
                    />

                    <input
                      type="password"
                      placeholder="Confirm Password"
                      className="w-full rounded-2xl border px-4 py-3"
                    />

                    <button className="w-full rounded-2xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-400">
                      Update Password
                    </button>
                  </div>
                </div>

                {/* PROFILE */}
                <div className="rounded-3xl border bg-white p-6 shadow">
                  <h2 className="text-3xl font-black text-[#005f63]">
                    Profile
                  </h2>

                  <div className="mt-6 space-y-4">
                    <input
                      type="text"
                      defaultValue={member.name}
                      className="w-full rounded-2xl border px-4 py-3"
                    />

                    <input
                      type="text"
                      defaultValue="0917-111-1001"
                      className="w-full rounded-2xl border px-4 py-3"
                    />

                    <input
                      type="text"
                      disabled
                      defaultValue="Member · Resident"
                      className="w-full rounded-2xl border bg-gray-100 px-4 py-3"
                    />

                    <button className="w-full rounded-2xl border py-3 font-semibold text-[#005f63] hover:bg-gray-100">
                      Save Profile
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({
  value,
  title,
  gradient,
}: {
  value: number;
  title: string;
  gradient: string;
}) {
  return (
    <div
      className={`rounded-[26px] bg-gradient-to-r ${gradient} p-5 text-white shadow-lg`}
    >
      <h2 className="text-6xl font-black">
        {value}
      </h2>

      <p className="mt-2 text-sm font-semibold uppercase tracking-wide">
        {title}
      </p>
    </div>
  );
}

function FakeQR({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0;

    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }

    return Array.from({ length: 169 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 16) % 2 === 0;
    });
  }, [seed]);

  return (
    <div
      className="grid h-32 w-32 gap-[2px] rounded-lg bg-white p-2 shadow"
      style={{
        gridTemplateColumns: "repeat(13, minmax(0,1fr))",
      }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          className={on ? "bg-[#005f63]" : "bg-white"}
        />
      ))}
    </div>
  );
}
