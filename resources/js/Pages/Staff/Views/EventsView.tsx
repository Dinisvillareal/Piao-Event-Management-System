import React, { useEffect, useMemo, useState } from "react";
import { Filter, Eye, XCircle, LogIn, LogOut, ChevronLeft, ChevronRight, Archive } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

interface MyEvent {
  id: number | string;
  title: string;
  date: string;
  event_start?: string;
  startDate?: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  notificationMessage?: string;
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
  const [formOpen, setFormOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const itemsPerPage = 6;

  const [localEvents, setLocalEvents] = useState<MyEvent[]>(allEvents);

  // Helper functions for current week (Monday to Sunday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? 6 : day - 1); // Monday is 1, Sunday is 0
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getEndOfWeek = (date: Date) => {
    const d = getStartOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  useEffect(() => {
    setLocalEvents(allEvents);
  }, [allEvents]);

  const refreshEventsFromAPI = async () => {
    try {
      const response = await fetch('/events-data', {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      const result = await response.json();
      
      if (result.data) {
        const formattedEvents = result.data.map((dbEvent: any) => {
          const membershipIds = Array.isArray(dbEvent.membership_ids) ? dbEvent.membership_ids : [];
          const startDate = dbEvent.event_start?.split(' ')[0] ?? '';
          const endDate = dbEvent.event_end?.split(' ')[0] ?? startDate;
          const startTime = dbEvent.event_start?.split(' ')[1]?.slice(0, 5) ?? '';
          const endTime = dbEvent.event_end?.split(' ')[1]?.slice(0, 5) ?? '';

          return {
            id: dbEvent.id,
            title: dbEvent.name,
            date: dbEvent.event_start,
            event_start: dbEvent.event_start,
            startDate,
            endDate,
            startTime,
            endTime,
            location: dbEvent.location,
            description: dbEvent.description,
            membershipIds,
            membershipName: 'Open to all',
          };
        });
        
        setLocalEvents(formattedEvents);
      }
    } catch (error) {
      console.error("Error refreshing events:", error);
    }
  };

  useEffect(() => {
    const handleRefresh = () => {
      refreshEventsFromAPI();
      setEventSearch("");
      setCurrentPage(1);
      setEventFilter("all");
    };

    window.addEventListener('refreshEvents', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshEvents', handleRefresh);
    };
  }, []);

  const [liveAttendances, setLiveAttendances] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!localEvents || localEvents.length === 0) return;

    const fetchAttendance = async () => {
      for (const event of localEvents) {
        if (liveAttendances[event.id]) continue;

        try {
          const response = await fetch(`/events/${event.id}/attendances`, {
            headers: {
              "Accept": "application/json",
              "X-Requested-With": "XMLHttpRequest"
            }
          });

          if (response.ok) {
            const data = await response.json();
            const formatted = data.map((record: any) => ({
              eventId: event.id,
              residentId: record.user_id,
              residentName: record.user ? `${record.user.first_name} ${record.user.last_name}` : `User #${record.user_id}`,
              timeIn: record.time_in,
              timeOut: record.time_out
            }));

            setLiveAttendances(prev => ({ ...prev, [event.id]: formatted }));
          }
        } catch (error) {
          console.error("Failed to fetch live attendance for event:", error);
        }
      }
    };

    fetchAttendance();
  }, [localEvents]);

  const getXsrfToken = () => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("XSRF-TOKEN="));
    return token ? decodeURIComponent(token.split("=")[1]) : "";
  };

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    description: "",
    notificationMessage: "",
    targetMembership: "all",
  });

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("all");

  const formatTime = (timeStr: string | undefined): string => {
    if (!timeStr) return "";
    const [hour, minute] = timeStr.split(':');
    let hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    if (hourNum > 12) hourNum = hourNum - 12;
    if (hourNum === 0) hourNum = 12;
    return `${hourNum}:${minute} ${ampm}`;
  };

  const highlightAttendanceText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={i} className="bg-yellow-300 text-black rounded-sm px-0.5">{part}</span>
      ) : (
        part
      )
    );
  };

  const parseEventDate = (value: string) => {
    if (!value) return new Date(0);
    let dateStr = value;
    if (value.includes(" ")) {
      dateStr = value.split(" ")[0];
    }
    if (value.includes("T")) {
      dateStr = value.split("T")[0];
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date(0) : date;
  };

  const getEventStatus = (event: MyEvent) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let dateValue = event.event_start || event.date || event.startDate;
    if (!dateValue) {
      return { label: "Upcoming", color: "bg-yellow-100 text-yellow-800" };
    }
    let dateStr = dateValue;
    if (typeof dateValue === 'string' && dateValue.includes(" ")) {
      dateStr = dateValue.split(" ")[0];
    }
    if (dateValue.includes("T")) {
      dateStr = dateValue.split("T")[0];
    }
    const eventDate = new Date(dateStr);
    if (isNaN(eventDate.getTime())) {
      return { label: "Upcoming", color: "bg-yellow-100 text-yellow-800" };
    }
    eventDate.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      return { label: "Past", color: "bg-teal-100 text-teal-800" };
    }
    return { label: "Upcoming", color: "bg-yellow-100 text-yellow-800" };
  };

  const getFilterStatus = (event: MyEvent, filter: string): boolean => {
    const status = getEventStatus(event);
    if (filter === "all") return true;
    if (filter === "upcoming") return status.label === "Upcoming";
    if (filter === "past") return status.label === "Past";
    return true;
  };

  const filteredEvents = useMemo(() => {
    let result = [...localEvents];
    result = result.filter(event => getFilterStatus(event, eventFilter));
    if (eventSearch.trim()) {
      const q = eventSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.date && e.date.toLowerCase().includes(q)) ||
          e.location.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [localEvents, eventFilter, eventSearch]);

  // Sort events so "This Week" events come FIRST (based on current calendar week)
  const sortedFilteredEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getStartOfWeek(today);
    const weekEnd = getEndOfWeek(today);

    return [...filteredEvents].sort((a, b) => {
      let dateA = a.date || a.event_start || a.startDate || "";
      let dateB = b.date || b.event_start || b.startDate || "";
      
      if (dateA.includes(" ")) dateA = dateA.split(" ")[0];
      if (dateA.includes("T")) dateA = dateA.split("T")[0];
      if (dateB.includes(" ")) dateB = dateB.split(" ")[0];
      if (dateB.includes("T")) dateB = dateB.split("T")[0];
      
      const eventDateA = new Date(dateA);
      const eventDateB = new Date(dateB);
      eventDateA.setHours(0, 0, 0, 0);
      eventDateB.setHours(0, 0, 0, 0);
      
      const isThisWeekA = !isNaN(eventDateA.getTime()) && eventDateA >= weekStart && eventDateA <= weekEnd;
      const isThisWeekB = !isNaN(eventDateB.getTime()) && eventDateB >= weekStart && eventDateB <= weekEnd;
      
      if (isThisWeekA && !isThisWeekB) return -1;
      if (!isThisWeekA && isThisWeekB) return 1;
      
      return eventDateB.getTime() - eventDateA.getTime();
    });
  }, [filteredEvents]);

  const totalPages = Math.ceil(sortedFilteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedFilteredEvents.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedFilteredEvents, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [eventSearch, eventFilter]);

  // Group events with correct "This Week" calculation (calendar week, not next 7 days)
  const groupedEvents = useMemo(() => {
    const groups: Record<string, MyEvent[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getStartOfWeek(today);
    const weekEnd = getEndOfWeek(today);

    paginatedEvents.forEach((e) => {
      let dateString = e.date || e.event_start || e.startDate || "";
      if (dateString.includes(" ")) {
        dateString = dateString.split(" ")[0];
      }
      if (dateString.includes("T")) {
        dateString = dateString.split("T")[0];
      }
      
      const eventDate = new Date(dateString);
      eventDate.setHours(0, 0, 0, 0);
      const dateOnly = dateString;
      
      let sectionKey: string;

      if (!isNaN(eventDate.getTime()) && eventDate >= weekStart && eventDate <= weekEnd) {
        sectionKey = "📅 This Week";
      } else if (!isNaN(eventDate.getTime()) && eventDate.getTime() !== 0) {
        sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
      } else {
        sectionKey = "Unknown Date";
      }

      if (!groups[sectionKey]) groups[sectionKey] = [];
      groups[sectionKey].push(e);
    });

    const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === "📅 This Week") return -1;
      if (keyB === "📅 This Week") return 1;
      if (keyA === "Unknown Date") return 1;
      if (keyB === "Unknown Date") return -1;
      const dateA = new Date(keyA);
      const dateB = new Date(keyB);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime();
      }
      return 0;
    });

    return Object.fromEntries(sortedGroups);
  }, [paginatedEvents]);

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const membershipIds = newEvent.targetMembership === "all" ? [] : [newEvent.targetMembership];
    const payload: any = {
      name: newEvent.title,
      description: newEvent.description,
      notification_message: newEvent.notificationMessage,
      location: newEvent.location,
      event_start: `${newEvent.date} ${newEvent.time}:00`,
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
      const savedMembershipIdsRaw = Array.isArray(savedEvent.membership_ids) ? savedEvent.membership_ids : [];
      const savedMembershipIds = savedMembershipIdsRaw.map((id: any) => String(id));

      const membershipNamesFromPayload = Array.isArray(savedEvent.memberships)
        ? savedEvent.memberships.map((m: any) => String(m.name))
        : [];

      const membershipNames = membershipNamesFromPayload.length
        ? membershipNamesFromPayload
        : memberships
            .filter((m: any) => savedMembershipIds.includes(String(m.id)))
            .map((m: any) => String(m.name));

      const formattedEvent: MyEvent = {
        id: savedEvent.id,
        title: savedEvent.name,
        date: savedEvent.event_start,
        event_start: savedEvent.event_start,
        startDate: savedEvent.event_start?.split(" ")[0] ?? newEvent.date,
        endDate: savedEvent.event_end?.split(" ")[0] ?? newEvent.date,
        startTime: newEvent.time,
        endTime: newEvent.time,
        location: savedEvent.location,
        description: savedEvent.description,
        notificationMessage: savedEvent.notification_message ?? newEvent.notificationMessage,
        membershipIds: savedMembershipIds,
        membershipNames: membershipNames.length > 0 ? [membershipNames[0]] : [],
      };

      if (editingEvent) {
        setLocalEvents((prev) => prev.map((ev) => (ev.id === editingEvent.id ? formattedEvent : ev)));
        setEditingEvent(null);
      } else {
        setLocalEvents((prev) => [formattedEvent, ...prev]);
      }

      setNewEvent({
        title: "", date: "", time: "", location: "", description: "",
        notificationMessage: "", targetMembership: "all"
      });

      if (onCreateEvent) onCreateEvent(formattedEvent);
      alert(editingEvent ? "Event updated successfully!" : "Event created successfully!");

    } catch (error) {
      console.error("Failed to save event:", error);
      alert("Failed to save event");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditEvent = (event: MyEvent) => {
    if (editingEvent || isSubmitting) return;
    let eventDate = "";
    let eventTime = "";

    if (event.event_start) {
      const dateObj = new Date(event.event_start);
      eventDate = dateObj.toISOString().split('T')[0];
      eventTime = dateObj.toTimeString().slice(0, 5);
    } else if (event.date) {
      const parts = event.date.split(' ');
      eventDate = parts[0];
      eventTime = parts[1] ? parts[1].substring(0, 5) : "09:00";
    } else if (event.startDate && event.startTime) {
      eventDate = event.startDate;
      eventTime = event.startTime;
    }

    const currentMembershipId = event.membershipIds && event.membershipIds.length > 0 ? String(event.membershipIds[0]) : "all";

    setEditingEvent(event);
    setFormOpen(true);
    setNewEvent({
      title: event.title,
      date: eventDate,
      time: eventTime,
      location: event.location,
      description: event.description,
      notificationMessage: event.notificationMessage || "",
      targetMembership: currentMembershipId,
    });
  };

  const cancelEdit = () => {
    if (isSubmitting) return;
    setEditingEvent(null);
    setNewEvent({
      title: "", date: "", time: "", location: "", description: "",
      notificationMessage: "", targetMembership: "all"
    });
  };

  const confirmDelete = () => {
    if (eventToDelete !== null) {
      onDeleteEvent(eventToDelete);
      setEventToDelete(null);
    }
  };

  const cancelDelete = () => setEventToDelete(null);

  const getMembersForEvent = (event: MyEvent) => {
    const membershipIds = event.membershipIds || [];
    if (membershipIds.length === 0) return residents;
    return residents.filter((r: any) => {
      if (Array.isArray(r.membershipIds))
        return r.membershipIds.some((id: any) => membershipIds.includes(id));
      return membershipIds.includes(r.membershipId);
    });
  };

  const getFullAttendanceList = (eventId: string | number, eligibleMembers: any[]) => {
    const recordsForEvent = liveAttendances[eventId] || attendanceRecords.filter((a: any) => a.eventId === eventId);
    const combinedList = recordsForEvent.map((record: any) => ({
      residentId: record.residentId,
      residentName: record.residentName,
      timeIn: record.timeIn || "",
      timeOut: record.timeOut || ""
    }));

    eligibleMembers.forEach((member: any) => {
      if (!combinedList.some(item => item.residentId === member.id)) {
        const memberName = member.name || (member.first_name ? `${member.first_name} ${member.last_name}` : `Resident #${member.id}`);
        combinedList.push({
          residentId: member.id,
          residentName: memberName,
          timeIn: "",
          timeOut: ""
        });
      }
    });
    return combinedList;
  };

  const getAttendanceStatus = (record: any) => {
    if (record.timeIn && record.timeOut) return { label: "Complete" };
    if (record.timeIn || record.timeOut) return { label: "Incomplete" };
    return { label: "Missed" };
  };

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
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <div>
            <h1 className="text-4xl font-black text-[#005f63]">Events & Attendance</h1>
            <p className="mt-1 text-sm text-[#667777]">Filter and view all, upcoming, and past events.</p>
          </div>

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
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm appearance-none"
              >
                <option value="all">All Events</option>
                <option value="upcoming">Upcoming Events</option>
                <option value="past">Past Events</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>
          
          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {localEvents.length} event(s) match
          </p>

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

      <div className="relative flex gap-6 items-start px-1 w-full h-[calc(100vh-180px)]">
        <button onClick={() => setFormOpen(!formOpen)} className={`absolute top-2 z-50 bg-[#359ca0] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#2a7d82] ${formOpen ? "left-[calc(50%-18px)]" : "left-0"}`}>
          {formOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className={`transition-all duration-300 overflow-hidden shrink-0 ${formOpen ? "w-1/2 opacity-100" : "w-0 opacity-0"}`}>
          <div className="bg-white rounded-3xl border-gray-200 p-5 shadow-md h-full overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-[#005f63] mb-4">{editingEvent ? "Edit Event" : "Create New Event"}</h2>
            <form onSubmit={handleSaveEvent} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label><input type="text" required value={newEvent.title} placeholder="Barangay General Assembly" onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" required value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label><input type="time" required value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Location *</label><input type="text" required value={newEvent.location} placeholder="Barangay Hall" onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={newEvent.description} placeholder="Attendance is a must!" onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm" rows={3} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Message</label><textarea value={newEvent.notificationMessage} placeholder="Bring your QR Code." onChange={(e) => setNewEvent({ ...newEvent, notificationMessage: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm" rows={2} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Target Members *</label><select value={newEvent.targetMembership} onChange={(e) => setNewEvent({ ...newEvent, targetMembership: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm bg-white"><option value="all">All Residents</option>{memberships.map((m: any) => (<option key={m.id} value={String(m.id)}>{m.name}</option>))}</select></div>
              <div className="pt-2 flex gap-2"><button type="submit" disabled={isSubmitting} className={`flex-1 py-2.5 rounded-full font-bold ${isSubmitting ? 'bg-gray-400' : 'bg-[#359ca0] hover:bg-[#2a7d82] text-white'}`}>{isSubmitting ? "Saving..." : (editingEvent ? "Update Event" : "Post Event")}</button>{editingEvent && <button type="button" onClick={cancelEdit} disabled={isSubmitting} className="px-6 py-2.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600">Cancel</button>}</div>
            </form>
          </div>
        </div>

        <div className={`h-full overflow-y-auto pr-2 transition-all duration-300 ${formOpen ? "w-1/2" : "w-full pl-6"}`}>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-500 italic">No events match your search or filter.</p></div>
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
                      const displayMembershipLabel = (e.membershipNames && e.membershipNames.length > 0) ? e.membershipNames.join(", ") : (e as any).membershipName || "Open Event";
                      return (
                        <div key={e.id} className="relative rounded-2xl border-l-4 border-[#f8e67d] bg-white p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)]">
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>{status.label}</span>
                            <button onClick={() => startEditEvent(e)} disabled={isSubmitting || !!editingEvent} className="rounded-full p-2 text-orange-500 hover:bg-orange-100" title="Edit"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                            <button onClick={() => setViewEv(e)} className="rounded-full p-2 text-[#005f63] hover:bg-[#005f63]/10" title="View Details"><Eye className="h-[18px] w-[18px]" /></button>
                            <button onClick={() => setEventToDelete(e.id)} className="p-2 rounded-full hover:bg-red-100" title="Delete"><Archive className="h-4 w-4 text-red-500" /></button>
                          </div>
                          <h2 className="pr-32 text-base font-bold text-[#005f63]">{highlightText(e.title, eventSearch)}</h2>
                          <p className="mt-1 text-sm text-gray-500">{e.startDate && e.endDate ? (e.startDate === e.endDate ? e.startDate : `${e.startDate} - ${e.endDate}`) : e.date || ""} · {formatTime(e.startTime)}</p>
                          <p className="mt-1 text-sm text-gray-500">{highlightText(e.location, eventSearch)}</p>
                          <p className="mt-2 text-[14px] text-gray-700">{highlightText(e.description, eventSearch)}</p>
                          <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-[#4eb4b8] mr-1"></span>{signedIn} Signed In | <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span>{signedOut} Signed Out<span className="ml-2 font-medium">• {displayMembershipLabel}</span></div>
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

      {eventToDelete !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">This will be permanently deleted.</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this event? This action cannot be undone.</p>
            <div className="flex justify-center gap-3"><button onClick={cancelDelete} className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100">Cancel</button><button onClick={confirmDelete} className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700">Yes, Delete</button></div>
          </div>
        </div>
      )}

      {viewEv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><div><h2 className="text-2xl font-black text-[#005f63]">{viewEv.title}</h2><p className="text-sm text-gray-600 mt-1">{viewEv.startDate || viewEv.date} · {formatTime(viewEv.startTime)}</p><p className="text-sm text-gray-600">{viewEv.location}</p></div><button onClick={() => setViewEv(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button></div>
            <div className="space-y-4"><div className={`px-3 py-2 rounded-full inline-block text-sm font-semibold ${getEventStatus(viewEv).color}`}>{getEventStatus(viewEv).label}</div><div><h4 className="font-semibold text-gray-700 mb-1">Description</h4><p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{viewEv.description || "—"}</p></div>{viewEv.notificationMessage && (<div><h4 className="font-semibold text-gray-700 mb-1">Notification Preview</h4><p className="text-sm text-teal-700 bg-teal-50 p-3 rounded-xl">{viewEv.notificationMessage}</p></div>)}<div className="grid grid-cols-3 gap-3 text-center"><div className="bg-teal-50 rounded-xl p-3"><p className="text-xs text-teal-600 font-medium">Target Members</p><p className="font-bold text-teal-800 text-sm">{(viewEv.membershipNames && viewEv.membershipNames.length > 0) ? viewEv.membershipNames.join(", ") : "Open Event"}</p></div><div className="bg-green-50 rounded-xl p-3"><p className="text-xs text-green-600 font-medium">Signed In</p><p className="font-bold text-green-800">{getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeIn).length}</p></div><div className="bg-orange-50 rounded-xl p-3"><p className="text-xs text-orange-600 font-medium">Signed Out</p><p className="font-bold text-orange-800">{getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeOut).length}</p></div></div><button onClick={() => setShowAttendance(viewEv)} className="w-full bg-[#f3b94e] hover:bg-[#ff9736] text-white py-2.5 rounded-full font-medium">View Attendance List</button></div>
          </div>
        </div>
      )}

      {showAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-[95%] max-w-5xl h-[65vh] rounded-3xl shadow-2xl overflow-auto relative">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-gray-200"><div><h2 className="text-2xl font-black text-[#005f63]">Attendance — {showAttendance.title}</h2><p className="text-sm text-gray-600 mt-1">{showAttendance.date}</p></div><button onClick={() => setShowAttendance(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button></div>
            <div className="p-6">
              <div className="sticky top-0 z-20 bg-white pb-4 mb-4 border-b border-gray-100 flex flex-wrap gap-4 items-center"><div className="flex-1 min-w-[250px]"><SearchBar value={attendanceSearch} onChange={setAttendanceSearch} placeholder="Search resident name..." /></div><div className="relative"><select value={attendanceStatusFilter} onChange={(e) => setAttendanceStatusFilter(e.target.value)} className="h-12 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm"><option value="all">All Status</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="missed">Missed</option></select><Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70" /></div></div>
              <div className="rounded-xl border border-[#ddd5ca] overflow-hidden"><table className="w-full text-sm"><thead className="bg-[#f8f6f2]"><tr><th className="text-left p-4 font-medium text-[#005f63]">Resident Name</th><th className="text-left p-4 font-medium text-[#005f63]">Time In</th><th className="text-left p-4 font-medium text-[#005f63]">Time Out</th><th className="text-left p-4 font-medium text-[#005f63]">Status</th></tr></thead><tbody>{(() => { const eligibleMembers = getMembersForEvent(showAttendance); const fullList = getFullAttendanceList(showAttendance.id, eligibleMembers); const filteredList = getFilteredAttendance(fullList); return filteredList.length === 0 ? (<tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">No matching records found.</td></tr>) : (filteredList.map((record: any, i: number) => { const status = getAttendanceStatus(record); return (<tr key={i} className="border-t"><td className="p-4">{highlightAttendanceText(record.residentName, attendanceSearch)}</td><td className="p-4">{record.timeIn ? <span className="text-teal-700 flex items-center gap-1"><LogIn size={12} /> {record.timeIn}</span> : "—"}</td><td className="p-4">{record.timeOut ? <span className="text-orange-700 flex items-center gap-1"><LogOut size={12} /> {record.timeOut}</span> : "—"}</td><td className="p-4"><span className={`text-xs font-semibold px-3 py-1 rounded-full ${status.label === "Complete" ? "bg-teal-100 text-teal-800" : status.label === "Incomplete" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{status.label}</span></td></tr>); })); })()}</tbody></table></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}