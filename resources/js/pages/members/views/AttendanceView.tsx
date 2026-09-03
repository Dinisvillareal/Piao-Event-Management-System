import { useState, useMemo, useEffect } from "react";
import { Filter } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
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

interface AttendanceViewProps {
  attendanceRecords: AttendanceRecord[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function AttendanceView({ attendanceRecords, highlightText }: AttendanceViewProps) {
  const { t } = useLanguage();
  const statusLabel = (status: string) => {
    if (status === "complete") return t("statusComplete");
    if (status === "incomplete") return t("statusIncomplete");
    return t("statusMissed");
  };

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
  }, [attendanceRecords, attendanceFilter, attendanceSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredAttendance.length / itemsPerPage);
  const paginatedAttendance = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAttendance, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [attendanceSearch, attendanceFilter]);

  return (
    <div className="space-y-6">
      {/* FIXED HEADER & SEARCH AREA */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-full pr-4">
          <h1 className="text-4xl font-black text-[#005f63]">{t("attendanceRecords")}</h1>
          <p className="text-sm text-[#667777] mt-1">{t("attendanceSubtitle")}</p>

          <div className="mt-4 flex items-center gap-4 w-full">
            <div className="flex-1">
              <SearchBar
                value={attendanceSearch}
                onChange={setAttendanceSearch}
                placeholder={t("searchAttendancePlaceholder")}
              />
            </div>
            <div className="relative">
              <select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">{t("allRecords")}</option>
                <option value="complete">{t("completeInOut")}</option>
                <option value="incomplete">{t("incompleteInOut")}</option>
                <option value="missed">{t("missedNoRecord")}</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          
          <p className="mt-2 text-xs text-gray-500">
            {filteredAttendance.length} of {attendanceRecords.length} {t("recordsMatchCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
          </p>

          {/* ✅ PAGINATION - ← 1 → RIGHT SIDE */}
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

      {/* ATTENDANCE LIST */}
      <div className="pl-1 space-y-3">
        {filteredAttendance.length === 0 ? (
          <p className="text-gray-500 italic">{t("noAttendanceMatch")}</p>
        ) : (
          <>
            {paginatedAttendance.map((rec) => {
              const formattedEventDateTime = formatEventDateTime(rec.eventDate);
              const formattedTimeIn = formatTimeOnly(rec.timeIn);
              const formattedTimeOut = formatTimeOnly(rec.timeOut);

              return (
                <div
                  key={rec.id}
                  className="rounded-3xl border-l-4 border-[#ecbd3b] bg-white px-6 py-4 shadow-[0_2px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200 flex items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-[#005f63]">{highlightText(rec.eventTitle, attendanceSearch)}</h3>
                    <p className="text-[13px] text-gray-500 mt-1">
                      {formattedEventDateTime} · {rec.location}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[13px] text-gray-500">{t("timeInLabel")}</span>
                      <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                        rec.timeIn ? 'text-teal-700 bg-teal-50' : 'text-gray-400 bg-gray-50 italic'
                      }`}>
                        {formattedTimeIn || '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] text-gray-500">{t("timeOutLabel")}</span>
                      <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                        rec.timeOut ? 'text-orange-700 bg-orange-50' : 'text-gray-400 bg-gray-50 italic'
                      }`}>
                        {formattedTimeOut || '—'}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      rec.status === 'complete'
                        ? 'bg-teal-100 text-teal-800'
                        : rec.status === 'incomplete'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
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
  );
}