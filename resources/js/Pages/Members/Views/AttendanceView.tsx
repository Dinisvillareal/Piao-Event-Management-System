import { useState, useMemo } from "react";
import { Filter } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

// ✅ Exported so Members.tsx can import and reuse it
export interface AttendanceRecord {
  id: number;
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

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [attendancePage, setAttendancePage] = useState(1);
  const attendancePerPage = 20;

  useMemo(() => {
    setAttendancePage(1);
  }, [attendanceSearch, attendanceFilter]);

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
        rec.timeIn.toLowerCase().includes(q) ||
        rec.timeOut.toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    return result;
  }, [attendanceRecords, attendanceFilter, attendanceSearch]);

  const attendanceTotalPages = useMemo(() => {
    return Math.ceil(filteredAttendance.length / attendancePerPage);
  }, [filteredAttendance, attendancePerPage]);

  const paginatedAttendance = useMemo(() => {
    const startIndex = (attendancePage - 1) * attendancePerPage;
    return filteredAttendance.slice(startIndex, startIndex + attendancePerPage);
  }, [filteredAttendance, attendancePage, attendancePerPage]);

  return (
    <div className="space-y-6">
      {/* FIXED HEADER & SEARCH AREA */}
      <div className="sticky top-0 z-10 bg-[#fcfcf9] pt-2 pb-4 px-1 shadow-b-sm">
        <div className="w-full pr-4">
          <h1 className="text-4xl font-black text-[#005f63]">Attendance Records</h1>
          <p className="text-sm text-[#667777] mt-1">Your sign in / sign out history per event.</p>

          <div className="mt-4 flex items-center gap-4 w-full">
            <div className="flex-1">
              <SearchBar
                value={attendanceSearch}
                onChange={setAttendanceSearch}
                placeholder="Search attendance by event, date, location or time…"
              />
            </div>
            <div className="relative">
              <select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Records</option>
                <option value="complete">Complete (In & Out)</option>
                <option value="incomplete">Incomplete (Missing In/Out)</option>
                <option value="missed">Missed (No Record)</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredAttendance.length} of {attendanceRecords.length} record(s) match — showing 20 per page.
          </p>
        </div>
      </div>

      {/* ATTENDANCE LIST */}
      <div className="pl-1 space-y-3">
        {filteredAttendance.length === 0 ? (
          <p className="text-gray-500 italic">No attendance records match your search or filter.</p>
        ) : (
          <>
            {paginatedAttendance.map((rec) => (
              <div
                key={rec.id}
                className="rounded-3xl border-l-4 border-[#ecbd3b] bg-white px-6 py-4 shadow-[0_2px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200 flex items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#005f63]">{highlightText(rec.eventTitle, attendanceSearch)}</h3>
                  <p className="text-[13px] text-gray-500 mt-1">
                    {rec.eventDate} · {rec.location}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[13px] text-gray-500">In:</span>
                    <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                      rec.timeIn ? 'text-teal-700 bg-teal-50' : 'text-gray-400 bg-gray-50 italic'
                    }`}>
                      {rec.timeIn || '—'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] text-gray-500">Out:</span>
                    <span className={`ml-1.5 text-[13px] font-medium px-2 py-0.5 rounded-full ${
                      rec.timeOut ? 'text-orange-700 bg-orange-50' : 'text-gray-400 bg-gray-50 italic'
                    }`}>
                      {rec.timeOut || '—'}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    rec.status === 'complete'
                      ? 'bg-teal-100 text-teal-800'
                      : rec.status === 'incomplete'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}

            {/* PAGINATION */}
            {attendanceTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setAttendancePage(prev => Math.max(prev - 1, 1))}
                  disabled={attendancePage === 1}
                  className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                >
                  Previous
                </button>

                {Array.from({ length: attendanceTotalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setAttendancePage(i + 1)}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                      attendancePage === i + 1
                        ? "bg-[#005f63] text-white shadow-sm"
                        : "bg-white border text-[#005f63] hover:bg-orange-50"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}

                <button
                  onClick={() => setAttendancePage(prev => Math.min(prev + 1, attendanceTotalPages))}
                  disabled={attendancePage === attendanceTotalPages}
                  className="px-2.5 py-1.5 rounded-lg border bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 transition"
                >
                  Next
                </button>

                <span className="text-xs text-gray-600 ml-1.5">
                  Page {attendancePage} of {attendanceTotalPages}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
