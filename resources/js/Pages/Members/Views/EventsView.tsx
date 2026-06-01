import { useState, useMemo } from "react";
import { Filter } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  description: string;
  membership_ids?: number[];
  memberships?: { id: number; name: string }[];
}

interface EventsViewProps {
  allEvents: Event[];
  allMemberships: { id: number; name: string }[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function EventsView({
  allEvents,
  allMemberships,
  highlightText,
}: EventsViewProps) {
  // Moved the search and filter state here!
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");

  // 1. Filter the events
  const filteredEvents = useMemo(() => {
    const today = new Date();
    let result = allEvents;

    if (eventFilter === "upcoming") {
      result = allEvents.filter((e) => new Date(e.date) >= today);
    } else if (eventFilter === "past") {
      result = allEvents.filter((e) => new Date(e.date) < today);
    }

    if (eventSearch.trim()) {
      const q = eventSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.date.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    // SORT: NEWEST / LATEST DATE FIRST
    result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }, [allEvents, eventFilter, eventSearch]);

  // 2. Group the events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof allEvents> = {};
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    filteredEvents.forEach((e) => {
      const eventDate = new Date(e.date);
      const dateOnly = e.date.split(" ")[0];

      let sectionKey: string;

      if (eventFilter === "all") {
        if (eventDate >= today && eventDate <= oneWeekFromNow) {
          sectionKey = "📅 This Week";
        } else {
          sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }
      } else {
        sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      if (!groups[sectionKey]) groups[sectionKey] = [];
      groups[sectionKey].push(e);
    });

    const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === "📅 This Week") return -1;
      if (keyB === "📅 This Week") return 1;
      return new Date(keyB).getTime() - new Date(keyA).getTime();
    });

    return Object.fromEntries(sortedGroups);
  }, [filteredEvents, eventFilter]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-[1200px]">
          <h1 className="text-4xl font-black text-[#005f63]">Events</h1>
          <p className="mt-1 text-sm text-[#667777]">
            Filter and view all, upcoming, and past events.
          </p>

          <div className="mt-4 flex items-center gap-4 w-[1580px]">
            <div className="flex-1">
              <SearchBar
                value={eventSearch}
                onChange={setEventSearch}
                placeholder="Search events by title, date, location or description..."
              />
            </div>

            <div className="relative">
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Events</option>
                <option value="upcoming">Upcoming Events</option>
                <option value="past">Past Events</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {allEvents.length} event(s) match
          </p>
        </div>
      </div>

      <div className="pl-1">
        {filteredEvents.length === 0 ? (
          <p className="text-gray-500 italic">No events match your search or filter.</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
              <div key={dateLabel}>
                <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">
                  {dateLabel}
                </h3>
                <div className="grid gap-5 md:grid-cols-2">
                  {eventsInGroup.map((e) => {
                    const memNames = Array.isArray(e.memberships) && e.memberships.length > 0
                      ? e.memberships.map((m) => m.name)
                      : Array.isArray(e.membership_ids)
                        ? e.membership_ids.map((id) => allMemberships.find((m) => m.id === id)?.name).filter(Boolean) as string[]
                        : [];

                    return (
                      <div
                        key={e.id}
                        className="relative rounded-2xl border-l-4 border-orange-400 bg-[#f8f3ee] p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200"
                      >
                        <h2 className="pr-8 text-lg font-bold text-[#005f63]">
                          {highlightText(e.title, eventSearch)}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                          {highlightText(e.date, eventSearch)} · {highlightText(e.location, eventSearch)}
                        </p>
                        <p className="mt-3 text-gray-700">
                          {highlightText(e.description, eventSearch)}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {memNames.length > 0 ? (
                            <>
                              <span className="rounded-full bg-[#005f63]/10 px-3 py-1 text-xs font-semibold text-[#005f63] border border-[#005f63]/20">
                                For: {memNames.join(", ")}
                              </span>
                              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 border border-green-100">
                                Included for your membership
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 border border-gray-200">
                              Open Event — All Residents
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}