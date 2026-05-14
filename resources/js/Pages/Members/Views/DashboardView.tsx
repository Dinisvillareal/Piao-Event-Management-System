import SummaryCard from "../../../Components/UI/SummaryCard";

// We define the shape of our data so TypeScript knows what to expect
interface Notification {
  id: number;
  title: string;
  body: string;
  sentAt: string;
}

interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  description: string;
}

interface DashboardViewProps {
  memberName: string;
  membershipsCount: number;
  attendedCount: number;
  missedCount: number;
  setActive: (page: string) => void;
  notifications: Notification[];
  upcomingEvents: Event[];
  pastEventsCount: number;
}

export default function DashboardView({
  memberName,
  membershipsCount,
  attendedCount,
  missedCount,
  setActive,
  notifications,
  upcomingEvents,
  pastEventsCount,
}: DashboardViewProps) {
  return (
    <>
      <div className="rounded-[30px] bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300 p-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          Member Dashboard
        </p>
        {/* We make the name dynamic based on the prop! */}
        <h1 className="mt-2 text-4xl font-black">Welcome back, {memberName}! 👋</h1>
        <p className="mt-2 text-base text-white/90">
          You are signed in as a resident member.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          value={membershipsCount}
          title="Verified Memberships"
          gradient="from-orange-400 to-yellow-300"
          onClick={() => setActive("qr")}
        />
        <SummaryCard
          value={attendedCount}
          title="Events Attended"
          gradient="from-[#067a7a] to-[#5fd3d3]"
          onClick={() => setActive("events")}
        />
        <SummaryCard
          value={missedCount}
          title="Events Missed"
          gradient="from-yellow-300 to-orange-400"
          onClick={() => setActive("events")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">Latest Notifications</h2>
          <p className="text-[15px] mt-1 text-gray-600">Posts from your barangay staff.</p>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
            style={{ maxHeight: "220px", scrollBehavior: 'smooth', scrollbarWidth: 'thin' }}
          >
            {notifications.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border-l-4 border-yellow-400 bg-[#f7f2e8] p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-bold text-[#005f63]">{item.title}</h3>
                  <span className="text-xs text-gray-500">{item.sentAt}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-[#ddd5ca] bg-white p-5 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-black text-[#005f63]">Upcoming Events</h2>
          <p className="text-[15px] mt-1 text-gray-600">Events you're eligible to attend.</p>

          <div
            className="mt-5 space-y-3 overflow-y-auto pr-2 smooth-scroll"
            style={{ maxHeight: "220px", scrollBehavior: 'smooth', scrollbarWidth: 'thin' }}
          >
            {upcomingEvents.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
              >
                <h3 className="text-lg font-bold text-[#005f63]">{e.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{e.date} · {e.location}</p>
                <p className="mt-2 text-sm text-gray-700">{e.description}</p>
              </div>
            ))}
            <p className="mt-3 text-sm text-gray-500">{pastEventsCount} past event(s) on record.</p>
          </div>
        </div>
      </div>
    </>
  );
}
