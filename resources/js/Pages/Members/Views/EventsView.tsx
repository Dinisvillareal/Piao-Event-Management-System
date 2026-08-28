import { useState, useMemo, useEffect } from "react";
import { Filter } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";
import { useLanguage } from "../../../i18n/LanguageContext";

const THIS_WEEK_KEY = "__THIS_WEEK__";

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
  userMemberships: { id: number; name: string }[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function EventsView({
  allEvents,
  allMemberships,
  userMemberships,
  highlightText,
}: EventsViewProps) {
  const { t } = useLanguage();
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Format time function
  const formatTime = (dateTimeStr: string): string => {
    if (!dateTimeStr) return "";
    
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return "";
    
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hours}:${minutesStr} ${ampm}`;
  };

  // Format date only (YYYY-MM-DD)
  const formatDateOnly = (dateTimeStr: string): string => {
    if (!dateTimeStr) return "";
    return dateTimeStr.split(" ")[0];
  };

  // Helper functions for current week (Sunday to Saturday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getEndOfWeek = (date: Date) => {
    const d = getStartOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const filteredEvents = useMemo(() => {
    const today = new Date();
    let result = [...allEvents];

    if (eventFilter === "upcoming") {
      result = result.filter((e) => new Date(e.date) >= today);
    } else if (eventFilter === "past") {
      result = result.filter((e) => new Date(e.date) < today);
    }

    if (membershipFilter !== "all") {
      const selectedId = Number(membershipFilter);
      result = result.filter((e) =>
        e.membership_ids?.includes(selectedId)
      );
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

    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }, [allEvents, eventFilter, membershipFilter, eventSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEvents, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [eventSearch, eventFilter, membershipFilter]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof allEvents> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getStartOfWeek(today);
    const weekEnd = getEndOfWeek(today);

    paginatedEvents.forEach((e) => {
      const eventDate = new Date(e.date);
      eventDate.setHours(0, 0, 0, 0);
      const dateOnly = e.date.split(" ")[0];

      let sectionKey: string;
      
      if (eventDate >= weekStart && eventDate <= weekEnd) {
        sectionKey = THIS_WEEK_KEY;
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
      if (keyA === THIS_WEEK_KEY) return -1;
      if (keyB === THIS_WEEK_KEY) return 1;
      return new Date(keyB).getTime() - new Date(keyA).getTime();
    });

    return Object.fromEntries(sortedGroups);
  }, [paginatedEvents]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <h1 className="text-4xl font-black text-[#005f63]">{t("eventsAndAttendance")}</h1>
          <p className="mt-1 text-sm text-[#667777]">
            {t("eventsSubtitle")}
          </p>

          <div className="mt-4 flex items-center gap-4 w-full">
            <div className="flex-1">
              <SearchBar
                value={eventSearch}
                onChange={setEventSearch}
                placeholder={t("searchEventsPlaceholder")}
              />
            </div>

            <div className="relative">
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">{t("allEvents")}</option>
                <option value="upcoming">{t("upcomingEvents")}</option>
                <option value="past">{t("pastEvents")}</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <div className="relative">
              <select
                value={membershipFilter}
                onChange={(e) => setMembershipFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">{t("allMembershipsOption")}</option>
                {userMemberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {allEvents.length} {t("eventsMatchCount")}
          </p>

          {/* ✅ PAGINATION - ← 1 → RIGHT SIDE BELOW SEARCH BAR */}
          {totalPages > 1 && (
            <div className="flex justify-end mt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  ←
                </button>
                
                <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                  {currentPage}
                </span>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pl-1">
        {filteredEvents.length === 0 ? (
          <p className="text-gray-500 italic">{t("noEventsMatch")}</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
              <div key={dateLabel}>
                <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">
                  {dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel}
                </h3>
                <div className="grid gap-5 md:grid-cols-2">
                  {eventsInGroup.map((e) => {
                    const today = new Date();
                    const isUpcoming = new Date(e.date) >= today;
                    const memNames = Array.isArray(e.memberships) && e.memberships.length > 0
                      ? e.memberships.map((m) => m.name)
                      : Array.isArray(e.membership_ids)
                        ? e.membership_ids.map((id) => allMemberships.find((m) => m.id === id)?.name).filter(Boolean) as string[]
                        : [];

                    const dateOnly = formatDateOnly(e.date);
                    const timeOnly = formatTime(e.date);

                    return (
                      <div
                        key={e.id}
                        className="relative rounded-3xl border-l-4 border-[#f8e67d] bg-white p-5 shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200"
                      >
                        <div className="absolute top-4 right-4 flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isUpcoming ? "bg-[#ffd448]" : "bg-[#4dacaf]"
                            }`}
                          />
                          <span className="text-xs font-medium text-gray-600">
                            {isUpcoming ? t("upcomingBadge") : t("pastBadge")}
                          </span>
                        </div>

                        <h2 className="pr-20 text-base font-bold text-[#005f63]">
                          {highlightText(e.title, eventSearch)}
                        </h2>
                        
                        <p className="mt-1 text-sm text-gray-500">
                          {highlightText(dateOnly, eventSearch)} · {timeOnly}
                        </p>
                        
                        <p className="mt-1 text-sm text-gray-500">
                          {highlightText(e.location, eventSearch)}
                        </p>
                        
                        <p className="mt-3 text-sm text-gray-700">
                          {highlightText(e.description, eventSearch)}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {memNames.length > 0 ? (
                            <>
                              <span className="rounded-full bg-[#005f63]/10 px-3 py-1 text-xs font-semibold text-[#005f63] border border-[#005f63]/20">
                                {t("forLabel")} {memNames.join(", ")}
                              </span>
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500 border border-gray-200">
                                {t("includedInMembership")}
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full bg-[#005f63]/10 px-3 py-1 text-xs font-semibold text-[#005f63] border border-[#005f63]/20">
                              {t("openEventAllResidents")}
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