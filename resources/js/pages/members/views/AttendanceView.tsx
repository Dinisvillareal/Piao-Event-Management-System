import { useState, useMemo, useEffect } from "react";
import { Filter } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import { useLanguage } from "../../../i18n/LanguageContext";

// ✅ Exported so Members.tsx can import and reuse it
export interface AttendanceRecord {
  id: number;
  eventId?: number;
  eventTitle: string;
  eventDate: string;
  location: string;
  timeIn: string;
  timeOut: string;
  status: string;
}

// Minimal shape needed to resolve which membership(s) an attendance
// record's underlying event belongs to -- Members.tsx's `allEvents`
// carries a lot more than this, but this is all we read here.
interface EventLite {
  id: number;
  membership_ids?: number[];
}

interface AttendanceViewProps {
  attendanceRecords: AttendanceRecord[];
  highlightText: (text: string, query: string) => React.ReactNode;
  allEvents?: EventLite[];
  userMemberships?: { id: number; name: string }[];
}

export default function AttendanceView({ attendanceRecords, highlightText, allEvents = [], userMemberships = [] }: AttendanceViewProps) {
  const { t } = useLanguage();
  const statusLabel = (status: string) => {
    if (status === "complete") return t("statusComplete");
    if (status === "incomplete") return t("statusIncomplete");
    return t("statusMissed");
  };

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Only show the membership filter when the member actually has more
  // than one membership type -- with zero or exactly one, every record
  // (or none) already belongs to the same membership, so the filter
  // would have nothing meaningful to narrow down.
  const showMembershipFilter = userMemberships.length > 1;

  // ✅ Format the event datetime to "YYYY-MM-DD · H:MM AM/PM"
  const formatEventDateTime = (datetimeStr: string): string => {
    if (!datetimeStr) return "";
    
    const date = new Date(datetimeStr);
    if (isNaN(date.getTime())) return datetimeStr;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const formattedTime = `${hours}:${minutes} ${ampm}`;
    
    return `${formattedDate} · ${formattedTime}`;
  };

  // ✅ Format time only (for timeIn/timeOut)
  const formatTimeOnly = (datetimeStr: string): string => {
    if (!datetimeStr) return "";
    
    const date = new Date(datetimeStr);
    if (isNaN(date.getTime())) return datetimeStr;
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    
    return `${hours}:${minutes} ${ampm}`;
  };

  const filteredAttendance = useMemo(() => {
    let result = attendanceRecords;

    if (attendanceFilter !== "all") {
      result = result.filter((rec) => rec.status === attendanceFilter);
    }

    if (showMembershipFilter && membershipFilter !== "all") {
      const selectedId = Number(membershipFilter);
      result = result.filter((rec) => {
        const event = allEvents.find((e) => e.id === rec.eventId);
        return event?.membership_ids?.includes(selectedId);
      });
    }

    if (attendanceSearch.trim()) {
      const q = attendanceSearch.toLowerCase();
      result = result.filter((rec) =>
        rec.eventTitle.toLowerCase().includes(q) ||
        rec.eventDate.toLowerCase().includes(q) ||
        rec.location.toLowerCase().includes(q) ||
        rec.timeIn?.toLowerCase().includes(q) ||
        rec.timeOut?.toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    return result;
  }, [attendanceRecords, attendanceFilter, membershipFilter, showMembershipFilter, allEvents, attendanceSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredAttendance.length / itemsPerPage);
  const paginatedAttendance = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAttendance, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [attendanceSearch, attendanceFilter, membershipFilter]);

  return (
    <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      {/* Not sticky -- matches every other converted page (Inventory,
          Budget, Returns, Activity Logs, Archive, Reports); a sticky
          header here previously fought with this full-bleed dark wrapper. */}
      <div className="pt-2 pb-4 px-1">
        <div className="w-full pr-4">
          <h1 className="text-4xl font-black text-white">{t("attendanceRecords")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("attendanceSubtitle")}</p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <SearchBar
                  value={attendanceSearch}
                  onChange={setAttendanceSearch}
                  placeholder={t("searchAttendancePlaceholder")}
                  dark
                />
              </div>
              <FilterDropdown
                value={attendanceFilter}
                onChange={setAttendanceFilter}
                options={[
                  { value: "all", label: t("allRecords") },
                  { value: "complete", label: t("completeInOut") },
                  { value: "incomplete", label: t("incompleteInOut") },
                  { value: "missed", label: t("missedNoRecord") },
                ]}
                className="h-11 pl-10 pr-8 shrink-0"
                icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
              />

              {showMembershipFilter && (
                <FilterDropdown
                  value={membershipFilter}
                  onChange={setMembershipFilter}
                  options={[
                    { value: "all", label: t("allMembershipsOption") },
                    ...userMemberships.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: String(m.id), label: m.name })),
                  ]}
                  className="h-11 min-w-[220px] pl-10 pr-8 shrink-0"
                  panelWidthPx={280}
                  icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                  dark
                  searchable
                  searchPlaceholder={t("search")}
                  noResultsLabel={t("noMatchesFoundLabel")}
                />
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-white/40">
            {filteredAttendance.length} of {attendanceRecords.length} {t("recordsMatchCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
          </p>

          {/* PAGINATION - ← 1 → RIGHT SIDE */}
          {totalPages > 1 && (
            <div className="flex justify-end mt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                >
                  ←
                </button>

                <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
                  {currentPage}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ATTENDANCE LIST */}
      <div className="pl-1 space-y-3">
        {filteredAttendance.length === 0 ? (
          <p className="text-white/40 italic">{t("noAttendanceMatch")}</p>
        ) : (
          <>
            {paginatedAttendance.map((rec) => {
              const formattedEventDateTime = formatEventDateTime(rec.eventDate);
              const formattedTimeIn = formatTimeOnly(rec.timeIn);
              const formattedTimeOut = formatTimeOnly(rec.timeOut);

              return (
                <div
                  key={rec.id}
                  className="rounded-3xl border-l-4 border-gold-400 border-y border-r border-white/10 bg-white/[0.04] px-6 py-4 hover:bg-white/[0.06] transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-white">{highlightText(rec.eventTitle, attendanceSearch)}</h3>
                    <p className="text-[13px] text-white/40 mt-1">
                      {formattedEventDateTime} · {rec.location}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[13px] text-white/40">{t("timeInLabel")}</span>
                      <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                        rec.timeIn ? 'text-[#7DD8CB] bg-[#4FBEB0]/15' : 'text-white/30 bg-white/[0.05] italic'
                      }`}>
                        {formattedTimeIn || '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] text-white/40">{t("timeOutLabel")}</span>
                      <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                        rec.timeOut ? 'text-gold-300 bg-gold-400/15' : 'text-white/30 bg-white/[0.05] italic'
                      }`}>
                        {formattedTimeOut || '—'}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      rec.status === 'complete'
                        ? 'bg-[#4FBEB0]/15 text-[#7DD8CB]'
                        : rec.status === 'incomplete'
                        ? 'bg-gold-400/15 text-gold-300'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {statusLabel(rec.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
    </div>
  );
}