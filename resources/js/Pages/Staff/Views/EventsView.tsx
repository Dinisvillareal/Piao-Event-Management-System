import React, { useEffect, useMemo, useState } from "react";
import { Filter, Eye, XCircle, LogIn, LogOut } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

// ─── EVENTS & ATTENDANCE ───────────────────────────────────────────
interface MyEvent {
  id: number | string;
  title: string;
  date: string;
  startDate?: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  membershipIds?: (string | number)[];
  membershipNames?: string[];
}

interface EventsViewProps {
  allEvents: MyEvent[];
  onDeleteEvent: (id: number | string) => void;
  onCreateEvent?: (event: MyEvent) => void;
  highlightText: (text: string, query: string) => React.ReactNode;
  residents?: any[];
  memberships?: any[];
  attendanceRecords?: any[];
}

// ✅ Named export — NO duplicate default
export function EventsView({
  allEvents,
  onDeleteEvent,
  onCreateEvent,
  highlightText,
  residents = [],
  memberships = [],
  attendanceRecords = [],
}: EventsViewProps) {
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [viewEv, setViewEv] = useState<MyEvent | null>(null);
  const [showAttendance, setShowAttendance] = useState<MyEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<number | string | null>(null);
  const [editingEvent, setEditingEvent] = useState<MyEvent | null>(null);

  const [localEvents, setLocalEvents] = useState<MyEvent[]>(allEvents);

  useEffect(() => {
    setLocalEvents(allEvents);
  }, [allEvents]);

  const getXsrfToken = () => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("XSRF-TOKEN="));
    return token ? decodeURIComponent(token.split("=")[1]) : "";
  };

  const [newEvent, setNewEvent] = useState({
    title: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    location: "",
    description: "",
    membershipIds: [] as (string | number)[],
  });

  // ✅ Attendance search & filter state
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("all");

  // ✅ Custom highlight function with YELLOW background
  const highlightAttendanceText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={i} className="bg-yellow-300 text-black rounded-sm px-0.5">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const parseEventDate = (value: string) => {
    if (!value) return new Date(0);
    return new Date(value.replace(" ", "T"));
  };

  const upcomingEvents = useMemo(
    () => localEvents.filter((e) => parseEventDate(e.date) >= new Date()),
    [localEvents]
  );

  const pastEvents = useMemo(
    () => localEvents.filter((e) => parseEventDate(e.date) < new Date()),
    [localEvents]
  );

  // 1. Filter the events
  const filteredEvents = useMemo(() => {
    let result = localEvents;

    if (eventFilter === "upcoming") {
      result = upcomingEvents;
    } else if (eventFilter === "past") {
      result = pastEvents;
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
    result = [...result].sort((a, b) => parseEventDate(b.date).getTime() - parseEventDate(a.date).getTime());

    return result;
  }, [localEvents, upcomingEvents, pastEvents, eventFilter, eventSearch]);

  // 2. Group the events by date — SAME AS MEMBER PAGE
  const groupedEvents = useMemo(() => {
    const groups: Record<string, MyEvent[]> = {};
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    filteredEvents.forEach((e) => {
      const eventDate = parseEventDate(e.date);
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

  // ─── GET EVENT STATUS ───────────────────────────────────────────
  const getEventStatus = (event: MyEvent) => {
    const now = new Date();
    const eventStart = new Date(`${event.startDate || event.date}T${event.startTime}`);
    const eventEnd = new Date(`${event.endDate || event.date}T${event.endTime}`);

    if (now >= eventEnd) return { label: "Ended", color: "bg-red-100 text-red-800" };
    if (now >= eventStart) return { label: "Started", color: "bg-green-100 text-green-800" };
    return { label: "Upcoming", color: "bg-blue-100 text-blue-800" };
  };

  // ─── CREATE / UPDATE EVENT ───────────────────────────────────────────
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newEvent.endDate < newEvent.startDate) {
      alert("End date cannot be before start date.");
      return;
    }

    const membershipIds = newEvent.membershipIds.map((id) => Number(id)).filter((id) => !isNaN(id));
    const payload = {
      name: newEvent.title,
      description: newEvent.description,
      location: newEvent.location,
      event_start: `${newEvent.startDate} ${newEvent.startTime}:00`,
      event_end: `${newEvent.endDate} ${newEvent.endTime}:00`,
      membership_ids: membershipIds,
    };

    try {
      const response = await fetch(editingEvent ? `/events/${editingEvent.id}` : "/events", {
        method: editingEvent ? "PUT" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-XSRF-TOKEN": getXsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        alert(result.message || "Failed to save event");
        return;
      }

      const savedEvent = result.event ?? result;
      const savedMembershipIds = Array.isArray(savedEvent.membership_ids)
        ? savedEvent.membership_ids.map((id: any) => Number(id)).filter((id: any) => !isNaN(id))
        : [];
      const membershipNames = Array.isArray(savedEvent.memberships)
        ? savedEvent.memberships.map((m: any) => m.name)
        : memberships
            .filter((m: any) => savedMembershipIds.includes(m.id))
            .map((m: any) => m.name);

      const savedStartDate = savedEvent.event_start?.split(" ")[0] ?? newEvent.startDate;
      const savedEndDate = savedEvent.event_end?.split(" ")[0] ?? newEvent.endDate;
      const formattedEvent: MyEvent = {
        id: savedEvent.id,
        title: savedEvent.name,
        date: savedEvent.event_start,
        startDate: savedStartDate,
        endDate: savedEndDate,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        location: savedEvent.location,
        description: savedEvent.description,
        membershipIds: savedMembershipIds,
        membershipNames,
      };

      if (editingEvent) {
        setLocalEvents((prev) => prev.map((ev) => (ev.id === editingEvent.id ? formattedEvent : ev)));
        setEditingEvent(null);
      } else {
        setLocalEvents((prev) => [formattedEvent, ...prev]);
      }
    } catch (error) {
      console.error("Failed to save event:", error);
      alert("Failed to save event");
    } finally {
      setNewEvent({ title: "", startDate: "", endDate: "", startTime: "", endTime: "", location: "", description: "", membershipIds: [] });
    }
  };

  // ─── EDIT EVENT ───────────────────────────────────────────
  const startEditEvent = (event: MyEvent) => {
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      startDate: event.startDate || event.date,
      endDate: event.endDate || event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      description: event.description,
      membershipIds: event.membershipIds || [],
    });
  };

  const cancelEdit = () => {
    setEditingEvent(null);
    setNewEvent({ title: "", startDate: "", endDate: "", startTime: "", endTime: "", location: "", description: "", membershipIds: [] });
  };

  // ─── DELETE CONFIRMATION HANDLERS ─────────────────────────────
  const confirmDelete = () => {
    if (eventToDelete !== null) {
      onDeleteEvent(eventToDelete);
      setEventToDelete(null);
    }
  };

  const cancelDelete = () => {
    setEventToDelete(null);
  };

  // ─── GET MEMBERS BELONGING TO SELECTED MEMBERSHIPS ────────────
  const getMembersForEvent = (event: MyEvent) => {
    const membershipIds = event.membershipIds || [];
    if (membershipIds.length === 0) {
      // Open Event → all residents
      return residents;
    }

    return residents.filter((r: any) => {
      if (Array.isArray(r.membershipIds)) {
        return r.membershipIds.some((id: any) => membershipIds.includes(id));
      }
      return membershipIds.includes(r.membershipId);
    });
  };

  // ─── GET FULL ATTENDANCE LIST: ALL ELIGIBLE MEMBERS ────────────
  const getFullAttendanceList = (eventId: string | number, eligibleMembers: any[]) => {
    const recordsForEvent = attendanceRecords.filter((a: any) => a.eventId === eventId);

    return eligibleMembers.map((member: any) => {
      const record = recordsForEvent.find((r: any) => r.residentId === member.id);
      return {
        residentId: member.id,
        residentName: member.name,
        timeIn: record?.timeIn || "",
        timeOut: record?.timeOut || "",
      };
    });
  };

  // ─── GET ATTENDANCE STATUS — MATCH MEMBER PAGE COLORS ────────────
  const getAttendanceStatus = (record: any) => {
    if (record.timeIn && record.timeOut) {
      return { label: "Complete" };
    } else if (record.timeIn || record.timeOut) {
      return { label: "Incomplete" };
    } else {
      return { label: "Missed" };
    }
  };

  // ✅ Filter & search attendance records
  const getFilteredAttendance = (fullList: any[]) => {
    return fullList.filter((record) => {
      const matchesSearch = record.residentName.toLowerCase().includes(attendanceSearch.toLowerCase());
      const status = getAttendanceStatus(record).label.toLowerCase();
      const matchesStatus = attendanceStatusFilter === "all" || status === attendanceStatusFilter;
      return matchesSearch && matchesStatus;
    });
  };

  return (
    <div className="space-y-6">
      {/* ✅ HEADER, SEARCH & FILTER */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <h1 className="text-4xl font-black text-[#005f63]">Events & Attendance</h1>
          <p className="mt-1 text-sm text-[#667777]">Filter and view all, upcoming, and past events. This event module is dynamic for staff and updates immediately.</p>

          <div className="mt-4 flex items-center gap-4 w-full">
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
              <svg
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {allEvents.length} event(s) match
          </p>
        </div>
      </div>

      {/* ✅ NEW LAYOUT: 50% LEFT FIXED FORM | 50% RIGHT SCROLLABLE EVENTS */}
      <div className="flex gap-6 items-start px-1 w-full h-[calc(100vh-180px)]">
        {/* ✅ LEFT SIDE: CREATE EVENT FORM — FIXED / NOT SCROLLABLE */}
        <div className="w-1/2 h-100%">
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-md h-full overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-[#005f63] mb-4">{editingEvent ? "Edit Event" : "Create New Event"}</h2>

            <form onSubmit={handleSaveEvent} className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005f63]/30"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Membership Groups</label>
                <p className="text-xs text-gray-500 mb-2">Select any groups to target this event, or leave all unchecked to make it open to all residents.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {memberships.length > 0 ? (
                    memberships.map((m: any) => {
                      const id = String(m.id);
                      const checked = newEvent.membershipIds.map(String).includes(id);
                      return (
                        <label key={id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-[#005f63]/40 transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            value={id}
                            checked={checked}
                            onChange={(e) => {
                              const membershipId = e.target.value;
                              const selectedIds = newEvent.membershipIds.map(String);
                              const isSelected = selectedIds.includes(membershipId);
                              setNewEvent({
                                ...newEvent,
                                membershipIds: isSelected
                                  ? newEvent.membershipIds.filter((item) => String(item) !== membershipId)
                                  : [...newEvent.membershipIds, membershipId],
                              });
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-[#005f63] focus:ring-[#005f63]/50"
                          />
                          <span className="text-sm text-gray-700">{m.name}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-500">Loading membership groups...</p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-full bg-[#3c9b9e] text-white font-bold hover:bg-[#2a6b6b] transition"
                >
                  {editingEvent ? "Update Event" : "Post Event"}
                </button>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 py-2.5 rounded-full bg-gray-300 text-gray-700 font-bold hover:bg-gray-400 transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* ✅ RIGHT SIDE: EVENTS LIST — SCROLLABLE ONLY */}
        <div className="w-1/2 h-full overflow-y-auto pr-2">
          {filteredEvents.length === 0 ? (
            <p className="text-gray-500 italic">No events match your search or filter.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
                <div key={dateLabel}>
                  <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">{dateLabel}</h3>
                  <div className="grid gap-5 md:grid-cols-1">
                    {eventsInGroup.map((e) => {
                      const eligibleMembers = getMembersForEvent(e);
                      const attendanceList = getFullAttendanceList(e.id, eligibleMembers);
                      const signedIn = attendanceList.filter((a: any) => a.timeIn).length;
                      const signedOut = attendanceList.filter((a: any) => a.timeOut).length;
                      const status = getEventStatus(e);

                      return (
                        <div
                          key={e.id}
                          className="relative rounded-2xl border-l-4 border-orange-400 bg-white p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)] hover:shadow-[0_10px_18px_rgba(0,0,0,0.20)] transition-shadow duration-200"
                        >
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            {/* ✅ STATUS BADGE */}
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                              {status.label}
                            </span>

                            {/* ✅ EDIT BUTTON */}
                            <button
                              onClick={() => startEditEvent(e)}
                              className="rounded-full p-2 text-blue-600 hover:bg-blue-100 transition-colors"
                              title="Edit"
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>

                            {/* ✅ VIEW ICON — TEAL COLOR */}
                            <button
                              onClick={() => setViewEv(e)}
                              className="rounded-full p-2 text-[#005f63] hover:bg-[#005f63]/10 transition-colors"
                              title="View Details"
                            >
                              <Eye className="h-[18px] w-[18px]" />
                            </button>

                            {/* ✅ DELETE ICON — RED COLOR + CONFIRMATION */}
                            <button
                              onClick={() => setEventToDelete(e.id)}
                              className="p-2 rounded-full hover:bg-red-100 transition"
                              title="Delete"
                            >
                              <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>

                          <h2 className="pr-32 text-lg font-bold text-[#005f63]">{highlightText(e.title, eventSearch)}</h2>
                          <p className="mt-1 text-sm text-gray-500">
                            {highlightText(
                              e.startDate && e.endDate
                                ? e.startDate === e.endDate
                                  ? e.startDate
                                  : `${e.startDate} - ${e.endDate}`
                                : e.date,
                              eventSearch
                            )} · {e.startTime} to {e.endTime}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">{highlightText(e.location, eventSearch)}</p>
                          <p className="mt-2 text-[14px] text-gray-700">{highlightText(e.description, eventSearch)}</p>

                          <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500">
                            <span className="inline-block w-2 h-2 rounded-full bg-[#4eb4b8] mr-1"></span> {signedIn} Signed In |{" "}
                            <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span> {signedOut} Signed Out
                            {(e.membershipNames?.length || 0) > 0 ? (
                              <span className="ml-2 font-medium">
                                • {e.membershipNames?.join(", ")}
                              </span>
                            ) : (
                              <span className="ml-2 font-medium">• Open Event</span>
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

      {/* ✅ DELETE CONFIRMATION MODAL */}
      {eventToDelete !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">This will be permanently deleted.</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this event? This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={cancelDelete}
                className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ VIEW EVENT DETAILS MODAL */}
      {viewEv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">{viewEv.title}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {viewEv.date} • {viewEv.startTime} to {viewEv.endTime}
                </p>
                <p className="text-sm text-gray-600">{viewEv.location}</p>
              </div>
              <button onClick={() => setViewEv(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Status Badge */}
              {(() => {
                const status = getEventStatus(viewEv);
                return (
                  <div className={`px-3 py-2 rounded-full inline-block text-sm font-semibold ${status.color}`}>
                    {status.label}
                  </div>
                );
              })()}

              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{viewEv.description || "—"}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-teal-50 rounded-xl p-3">
                  <p className="text-xs text-teal-600 font-medium">Target Members</p>
                  <p className="font-bold text-teal-800 text-sm">
                    {(viewEv.membershipNames?.length || 0) > 0 ? viewEv.membershipNames?.join(", ") : "Open Event"}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-xs text-green-600 font-medium">Signed In</p>
                  <p className="font-bold text-green-800">
                    {getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeIn).length}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3">
                  <p className="text-xs text-orange-600 font-medium">Signed Out</p>
                  <p className="font-bold text-orange-800">
                    {getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeOut).length}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAttendance(viewEv)}
                className="w-full bg-[#005f63] hover:bg-[#004a4d] text-white py-2.5 rounded-full font-medium transition"
              >
                View Attendance List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ ATTENDANCE LIST MODAL — LARGE SIZE, NOT FULL SCREEN + SEARCH & FILTER + YELLOW HIGHLIGHT */}
      {showAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-[95%] max-w-5xl h-[65vh] rounded-3xl shadow-2xl overflow-auto relative">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">Attendance — {showAttendance.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{showAttendance.date}</p>
              </div>
              <button onClick={() => setShowAttendance(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-6">
              {/* ✅ FIXED SEARCH BAR & FILTER ABOVE TABLE */}
              <div className="sticky top-0 z-20 bg-white pb-4 mb-4 border-b border-gray-100 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[250px]">
                  <SearchBar
                    value={attendanceSearch}
                    onChange={setAttendanceSearch}
                    placeholder="Search resident name..."
                  />
                </div>
                <div className="relative">
                  <select
                    value={attendanceStatusFilter}
                    onChange={(e) => setAttendanceStatusFilter(e.target.value)}
                    className="h-12 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="complete">Complete</option>
                    <option value="incomplete">Incomplete</option>
                    <option value="missed">Missed</option>
                  </select>
                  <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                  <svg
                    className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="rounded-xl border border-[#ddd5ca] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8f6f2]">
                    <tr>
                      <th className="text-left p-4 font-medium text-[#005f63]">Resident Name</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Time In</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Time Out</th>
                      <th className="text-left p-4 font-medium text-[#005f63]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const eligibleMembers = getMembersForEvent(showAttendance);
                      const fullList = getFullAttendanceList(showAttendance.id, eligibleMembers);
                      const filteredList = getFilteredAttendance(fullList);

                      return filteredList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-gray-500 italic">
                            No matching records found.
                          </td>
                        </tr>
                      ) : (
                        filteredList.map((record: any, i: number) => {
                          const status = getAttendanceStatus(record);
                          return (
                            <tr key={i} className="border-t">
                              <td className="p-4">{highlightAttendanceText(record.residentName, attendanceSearch)}</td>
                              <td className="p-4">
                                {record.timeIn ? (
                                  <span className="text-teal-700 flex items-center gap-1">
                                    <LogIn size={12} /> {record.timeIn}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-4">
                                {record.timeOut ? (
                                  <span className="text-orange-700 flex items-center gap-1">
                                    <LogOut size={12} /> {record.timeOut}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-4">
                                <span
                                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                    status.label === "Complete"
                                      ? "bg-teal-100 text-teal-800"
                                      : status.label === "Incomplete"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {status.label.charAt(0).toUpperCase() + status.label.slice(1)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
