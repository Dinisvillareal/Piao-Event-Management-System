import React, { useEffect, useMemo, useState, useRef } from "react";
import { Filter, Eye, XCircle, LogIn, LogOut, ChevronLeft, ChevronRight, Archive, CheckCircle, AlertCircle, Package, Trash2, Star, Plus, Pencil } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import DatePicker from "../../../components/ui/DatePicker";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";

interface MyEvent {
  id: number | string;
  title: string;
  date: string;
  event_start?: string;
  event_end?: string;
  call_time_start?: string;
  call_time_end?: string;
  startDate?: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  callStartTime?: string;
  callEndTime?: string;
  location: string;
  description: string;
  notificationMessage?: string;
  membershipIds?: (string | number)[];
  membershipNames?: string[];
  approvedBudget?: number | string | null;
  borrowedItems?: { inventoryItemId: string; name: string; quantity: number }[];
}

interface BorrowableInventoryItem {
  id: number | string;
  name: string;
  quantity: number;
  condition: string;
  storage_location?: string | null;
}

interface EventsViewProps {
  allEvents: MyEvent[];
  onDeleteEvent: (id: number | string) => Promise<void>;
  onCreateEvent?: (event: MyEvent) => void;
  highlightText: (text: string, query: string) => React.ReactNode;
  residents?: any[];
  memberships?: any[];
  attendanceRecords?: any[];
}

const THIS_WEEK_KEY = "📅 This Week";
const UNKNOWN_DATE_KEY = "__UNKNOWN_DATE__";

export function EventsView({
  allEvents,
  onDeleteEvent,
  onCreateEvent,
  highlightText,
  residents = [],
  memberships = [],
  attendanceRecords = [],
}: EventsViewProps) {
  const { t } = useLanguage();
  const eventStatusLabel = (label: string) => (label === "Upcoming" ? t("upcomingBadge") : label === "Ongoing" ? t("ongoingBadge") : t("pastBadge"));
  const attendanceStatusLabel = (label: string) => {
    if (label === "Complete") return t("statusComplete");
    if (label === "Incomplete") return t("statusIncomplete");
    return t("statusMissed");
  };
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [viewEv, setViewEv] = useState<MyEvent | null>(null);
  // UC-16 (staff side): the ratings/comments residents left for this
  // event -- fetched from /feedback/event/{id} (backend already existed,
  // it just wasn't wired into any staff screen yet).
  const [eventFeedback, setEventFeedback] = useState<{ id: number; rating: number; comment: string | null; user?: { first_name: string; last_name: string } }[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackCurrentPage, setFeedbackCurrentPage] = useState(1);
  const feedbackItemsPerPage = 5;

  useEffect(() => {
    if (!viewEv) {
      setEventFeedback([]);
      return;
    }
    let cancelled = false;
    setFeedbackLoading(true);
    setFeedbackCurrentPage(1);
    api.get(`/feedback/event/${viewEv.id}`)
      .then((res) => { if (!cancelled) setEventFeedback(res.data ?? []); })
      .catch(() => { if (!cancelled) setEventFeedback([]); })
      .finally(() => { if (!cancelled) setFeedbackLoading(false); });
    return () => { cancelled = true; };
  }, [viewEv]);
  const feedbackTotalPages = Math.max(1, Math.ceil(eventFeedback.length / feedbackItemsPerPage));
  const paginatedFeedback = useMemo(() => {
    const start = (feedbackCurrentPage - 1) * feedbackItemsPerPage;
    return eventFeedback.slice(start, start + feedbackItemsPerPage);
  }, [eventFeedback, feedbackCurrentPage]);
  const [showAttendance, setShowAttendance] = useState<MyEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<number | string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<MyEvent | null>(null);
  const [originalEventForm, setOriginalEventForm] = useState<string>("");
  const [formOpen, setFormOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const itemsPerPage = 6;

  const [attendanceCurrentPage, setAttendanceCurrentPage] = useState(1);
  const attendanceItemsPerPage = 10;

  const initialLoadDone = useRef(false);
  const [localEvents, setLocalEvents] = useState<MyEvent[]>([]);

  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? 6 : day - 1);
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

  const getTodayString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getMembershipName = (id: any) => {
    const found = memberships.find((m: any) => String(m.id) === String(id));
    return found ? found.name : null;
  };

  const getMembershipNames = (e: MyEvent): string[] => {
    if (e.membershipNames && e.membershipNames.length > 0) return e.membershipNames;
    if (e.membershipIds && e.membershipIds.length > 0) {
      return e.membershipIds.map((id) => getMembershipName(id)).filter(Boolean) as string[];
    }
    return [];
  };

  const formatDbEvent = (dbEvent: any): MyEvent => {
    let membershipIds: any[] = [];
    if (Array.isArray(dbEvent.membership_ids)) {
      membershipIds = dbEvent.membership_ids;
    } else if (typeof dbEvent.membership_ids === 'string' && dbEvent.membership_ids.startsWith('[')) {
      try { membershipIds = JSON.parse(dbEvent.membership_ids); } catch (e) {}
    } else if (dbEvent.membership_id) {
      membershipIds = [dbEvent.membership_id];
    }

    const startDate = dbEvent.event_start?.split(' ')[0] ?? '';
    const endDate = dbEvent.event_end?.split(' ')[0] ?? startDate;
    const startTime = dbEvent.event_start?.split(' ')[1]?.slice(0, 5) ?? '';
    const endTime = dbEvent.event_end?.split(' ')[1]?.slice(0, 5) ?? '';
    const callStartTime = dbEvent.call_time_start?.split(' ')[1]?.slice(0, 5) ?? '';
    const callEndTime = dbEvent.call_time_end?.split(' ')[1]?.slice(0, 5) ?? '';

    return {
      id: dbEvent.id,
      title: dbEvent.name,
      date: dbEvent.event_start,
      event_start: dbEvent.event_start,
      event_end: dbEvent.event_end,
      call_time_start: dbEvent.call_time_start,
      call_time_end: dbEvent.call_time_end,
      startDate,
      endDate,
      startTime,
      endTime,
      callStartTime,
      callEndTime,
      location: dbEvent.location,
      description: dbEvent.description,
      notificationMessage: dbEvent.notification_message ?? '',
      membershipIds,
      membershipNames: [],
      approvedBudget: dbEvent.approved_budget ?? null,
      borrowedItems: Array.isArray(dbEvent.borrowed_items)
        ? dbEvent.borrowed_items.map((bi: any) => ({
            inventoryItemId: String(bi.inventory_item_id),
            name: bi.inventory_item?.name ?? "",
            quantity: Number(bi.quantity) || 0,
          }))
        : [],
    };
  };

  const refreshEventsFromAPI = async () => {
    try {
      const response = await api.get('/events-data');
      const result = response.data;

      const rawEvents = Array.isArray(result.data)
        ? result.data
        : (result.data?.data ?? []);

      if (rawEvents.length > 0 || initialLoadDone.current) {
        setLocalEvents(rawEvents.map(formatDbEvent));
      }
    } catch (error) {
      console.error("Error refreshing events:", error);
    }
  };

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      if (allEvents.length > 0) {
        setLocalEvents(allEvents);
      }
      refreshEventsFromAPI();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialLoadDone.current && allEvents.length > 0) {
      setLocalEvents(allEvents);
    }
  }, [allEvents]);

  useEffect(() => {
    const handleRefresh = () => {
      refreshEventsFromAPI();
      setEventSearch("");
      setCurrentPage(1);
      setEventFilter("all");
      setSelectedDate("");
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
          const response = await api.get(`/events/${event.id}/attendances`);
          const data = response.data;
          const formatted = data.map((record: any) => ({
            eventId: event.id,
            residentId: record.user_id,
            residentName: record.user ? `${record.user.first_name} ${record.user.last_name}` : `User #${record.user_id}`,
            timeIn: record.time_in,
            timeOut: record.time_out
          }));

          setLiveAttendances(prev => ({ ...prev, [event.id]: formatted }));
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
    endTime: "",
    callTimeStart: "",
    callTimeEnd: "",
    location: "",
    description: "",
    notificationMessage: "",
    targetMembership: "all",
    approvedBudget: "",
    postToFacebook: false,
    borrowedItems: [] as { inventoryItemId: string; quantity: string }[],
  });

  // UC-9 tie-in: items borrowed from Inventory for this event. Fetched
  // once (excludes Disposed/Lost condition -- see InventoryController::
  // borrowable()) and reused for both Create and Edit, since they share
  // one form.
  const [borrowableItems, setBorrowableItems] = useState<BorrowableInventoryItem[]>([]);
  const [borrowableItemsLoading, setBorrowableItemsLoading] = useState(true);
  const [borrowItemToAdd, setBorrowItemToAdd] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/inventory/borrowable")
      .then((res) => { if (!cancelled) setBorrowableItems(res.data ?? []); })
      .catch(() => { if (!cancelled) setBorrowableItems([]); })
      .finally(() => { if (!cancelled) setBorrowableItemsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // When editing, the item's current stock in `borrowableItems` already
  // has THIS event's own borrow deducted from it (the backend only
  // returns it when the event is saved) -- add that amount back per item
  // so the quantity cap reflects what's really available to re-select.
  const originalBorrowedMap = useMemo(() => {
    const map = new Map<string, number>();
    (editingEvent?.borrowedItems ?? []).forEach((bi) => map.set(String(bi.inventoryItemId), bi.quantity));
    return map;
  }, [editingEvent]);

  const availableStockFor = (itemId: string): number => {
    const base = borrowableItems.find((it) => String(it.id) === String(itemId))?.quantity ?? 0;
    return base + (originalBorrowedMap.get(String(itemId)) ?? 0);
  };

  const addBorrowRow = (itemId: string) => {
    if (!itemId) return;
    if (newEvent.borrowedItems.some((r) => r.inventoryItemId === itemId)) return;
    setNewEvent((prev) => ({ ...prev, borrowedItems: [...prev.borrowedItems, { inventoryItemId: itemId, quantity: "1" }] }));
    setBorrowItemToAdd("");
  };

  const updateBorrowQuantity = (itemId: string, quantity: string) => {
    setNewEvent((prev) => ({
      ...prev,
      borrowedItems: prev.borrowedItems.map((r) => (r.inventoryItemId === itemId ? { ...r, quantity } : r)),
    }));
  };

  const removeBorrowRow = (itemId: string) => {
    setNewEvent((prev) => ({ ...prev, borrowedItems: prev.borrowedItems.filter((r) => r.inventoryItemId !== itemId) }));
  };

  const getBorrowItemName = (itemId: string): string => {
    const fromList = borrowableItems.find((it) => String(it.id) === itemId);
    if (fromList) return fromList.name;
    const fromEditing = (editingEvent?.borrowedItems ?? []).find((bi) => bi.inventoryItemId === itemId);
    return fromEditing?.name || t("unknownItemLabel");
  };

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("all");

  const formatTime12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return "";

    let timePart = timeStr;
    if (timeStr.includes(" ")) {
      timePart = timeStr.split(" ")[1];
    }
    if (timePart.length < 5) return timeStr;

    const [hour, minute] = timePart.slice(0, 5).split(':');
    let hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    if (hourNum > 12) hourNum -= 12;
    if (hourNum === 0) hourNum = 12;

    if (timeStr.includes(" ")) {
      const datePart = timeStr.split(" ")[0];
      return `${datePart} ${hourNum}:${minute} ${ampm}`;
    }
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

  // Three real states now instead of just Upcoming/Past -- an event that
  // has started but hasn't ended yet (its own event_start/event_end, not
  // just the sign-in/out call-time window) reads as "Ongoing" rather than
  // staying "Upcoming" all the way through, or flipping straight to
  // "Past" the moment its date turns over.
  const parseEventDateTime = (value?: string | null): Date | null => {
    if (!value) return null;
    const iso = value.includes("T") ? value : value.replace(" ", "T");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  };

  const getEventStatus = (event: MyEvent): { label: "Upcoming" | "Ongoing" | "Past"; color: string } => {
    const now = new Date();
    const upcoming = { label: "Upcoming" as const, color: "bg-teal-100 text-teal-800" };
    const ongoing = { label: "Ongoing" as const, color: "bg-amber-100 text-amber-800" };
    const past = { label: "Past" as const, color: "bg-amber-50 text-amber-700" };

    const start = parseEventDateTime(event.event_start) ?? parseEventDateTime(event.date) ?? parseEventDateTime(event.startDate);
    if (!start) return upcoming;

    // Prefer the event's own end time, then the attendance window's
    // close, then (for legacy records with neither) end-of-day on the
    // start date so a record with no end info at all doesn't read as
    // "Ongoing" forever.
    let end = parseEventDateTime(event.event_end) ?? parseEventDateTime(event.call_time_end);
    if (!end) {
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    }

    if (now < start) return upcoming;
    if (now > end) return past;
    return ongoing;
  };

  const getFilterStatus = (event: MyEvent, filter: string): boolean => {
    const status = getEventStatus(event);
    if (filter === "all") return true;
    if (filter === "upcoming") return status.label === "Upcoming";
    if (filter === "ongoing") return status.label === "Ongoing";
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

    if (selectedDate) {
      const chosen = new Date(selectedDate);
      chosen.setHours(0, 0, 0, 0);
      const nextDay = new Date(chosen);
      nextDay.setDate(chosen.getDate() + 1);

      result = result.filter((e) => {
        let dateValue = e.event_start || e.date || e.startDate;
        if (!dateValue) return false;
        if (typeof dateValue === 'string' && dateValue.includes(" ")) {
          dateValue = dateValue.split(" ")[0];
        }
        if (dateValue.includes("T")) {
          dateValue = dateValue.split("T")[0];
        }
        const eventDate = new Date(dateValue);
        return eventDate >= chosen && eventDate < nextDay;
      });
    }

    return result;
  }, [localEvents, eventFilter, eventSearch, selectedDate]);

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
  }, [eventSearch, eventFilter, selectedDate]);

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
        sectionKey = UNKNOWN_DATE_KEY;
      }

      if (!groups[sectionKey]) groups[sectionKey] = [];
      groups[sectionKey].push(e);
    });

    const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (keyA === THIS_WEEK_KEY) return -1;
      if (keyB === THIS_WEEK_KEY) return 1;
      if (keyA === UNKNOWN_DATE_KEY) return 1;
      if (keyB === UNKNOWN_DATE_KEY) return -1;
      const dateA = new Date(keyA);
      const dateB = new Date(keyB);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime();
      }
      return 0;
    });

    return Object.fromEntries(sortedGroups);
  }, [paginatedEvents]);

  // Runs the field-level checks that used to live at the top of the old
  // handleSaveEvent, then -- if they pass -- opens the confirm step
  // instead of saving right away. The actual request now happens in
  // performSaveEvent, only once the user confirms.
  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!newEvent.date) {
      setErrorMessage(t("eventDateRequiredError"));
      setShowErrorModal(true);
      return;
    }

    if (!editingEvent) {
      const selectedDateTime = new Date(`${newEvent.date}T${newEvent.time}`);
      const now = new Date();
      if (selectedDateTime < now) {
        const formattedDate = selectedDateTime.toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric"
        });
        const formattedTime = selectedDateTime.toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", hour12: true
        });
        setErrorMessage(`${t("pastDateTimeError")} (${formattedDate}, ${formattedTime}) ${t("pastDateTimeErrorSuffix")}`);
        setShowErrorModal(true);
        return;
      }
    }

    if (newEvent.approvedBudget.trim() !== "") {
      const budgetValue = Number(newEvent.approvedBudget);
      if (!Number.isFinite(budgetValue) || budgetValue < 0) {
        setErrorMessage(t("invalidAmountError"));
        setShowErrorModal(true);
        return;
      }
    }

    setShowSaveConfirm(true);
  };

  const performSaveEvent = async () => {
    setShowSaveConfirm(false);
    if (isSubmitting) return;
    setIsSubmitting(true);

    const membershipIds = newEvent.targetMembership === "all" ? [] : [newEvent.targetMembership];

    const payload: any = {
      name: newEvent.title,
      description: newEvent.description,
      notification_message: newEvent.notificationMessage,
      location: newEvent.location,
      event_start: `${newEvent.date} ${newEvent.time}:00`,
      event_end: newEvent.endTime ? `${newEvent.date} ${newEvent.endTime}:00` : null,
      call_time_start: newEvent.callTimeStart ? `${newEvent.date} ${newEvent.callTimeStart}:00` : null,
      call_time_end: newEvent.callTimeEnd ? `${newEvent.date} ${newEvent.callTimeEnd}:00` : null,
      membership_ids: membershipIds,
      approved_budget: newEvent.approvedBudget !== "" ? newEvent.approvedBudget : null,
      borrowed_items: newEvent.borrowedItems
        .filter((r) => r.inventoryItemId && Number(r.quantity) > 0)
        .map((r) => ({ inventory_item_id: Number(r.inventoryItemId), quantity: Number(r.quantity) })),
    };
    // Adviser recommendation: "2 in 1 — Facebook Page" (only relevant on create)
    if (!editingEvent && newEvent.postToFacebook) {
      payload.post_to_facebook = true;
    }

    try {
      const response = await api.request({
        url: editingEvent ? `/events/${editingEvent.id}` : "/events",
        method: editingEvent ? "PUT" : "POST",
        data: payload,
      });
      const result = response.data;
      await refreshEventsFromAPI();

      const savedEvent = result.event ?? result;
      if (savedEvent?.id) {
        setLiveAttendances(prev => {
          const updated = { ...prev };
          delete updated[savedEvent.id];
          return updated;
        });
      }

      if (editingEvent) {
        setEditingEvent(null);
      }

      setNewEvent({
        title: "", date: "", time: "", endTime: "", callTimeStart: "", callTimeEnd: "", location: "", description: "",
        notificationMessage: "", targetMembership: "all", approvedBudget: "", postToFacebook: false, borrowedItems: [],
      });

      if (onCreateEvent && savedEvent) {
        onCreateEvent(formatDbEvent(savedEvent));
      }

      setSuccessMessage(editingEvent ? t("eventUpdatedSuccess") : t("eventCreatedSuccess"));
      setShowSuccessModal(true);

    } catch (error: any) {
      console.error("Failed to save event:", error);
      setErrorMessage(error?.response?.data?.message || t("saveEventFailed"));
      setShowErrorModal(true);
      // A rejected edit reverts the form to what was actually loaded --
      // "Go Back" on the error popup should mean back to the real event,
      // not leave whatever half-invalid values were just typed sitting
      // in the fields.
      if (editingEvent && originalEventForm) {
        setNewEvent(JSON.parse(originalEventForm));
      }
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

    // Call time / end time all share the event's own date -- only the
    // time-of-day differs, so just pull HH:MM back out of each timestamp.
    const timeOnly = (value?: string) => (value ? new Date(value).toTimeString().slice(0, 5) : "");
    const eventEndTime = event.event_end ? timeOnly(event.event_end) : (event.endTime || "");
    const callStart = event.call_time_start ? timeOnly(event.call_time_start) : (event.callStartTime || "");
    const callEnd = event.call_time_end ? timeOnly(event.call_time_end) : (event.callEndTime || "");

    const currentMembershipId = event.membershipIds && event.membershipIds.length > 0 ? String(event.membershipIds[0]) : "all";

    setEditingEvent(event);
    setFormOpen(true);
    const initialForm = {
      title: event.title,
      date: eventDate,
      time: eventTime,
      endTime: eventEndTime,
      callTimeStart: callStart,
      callTimeEnd: callEnd,
      location: event.location,
      description: event.description,
      notificationMessage: event.notificationMessage || "",
      targetMembership: currentMembershipId,
      approvedBudget: event.approvedBudget !== null && event.approvedBudget !== undefined ? String(event.approvedBudget) : "",
      postToFacebook: false,
      borrowedItems: (event.borrowedItems ?? []).map((bi) => ({ inventoryItemId: bi.inventoryItemId, quantity: String(bi.quantity) })),
    };
    setNewEvent(initialForm);
    setOriginalEventForm(JSON.stringify(initialForm));
  };

  // Nothing to submit if editing an event and the form still matches what
  // was loaded (title, schedule, borrowed items, everything).
  const isEventFormUnchanged = !!editingEvent && JSON.stringify(newEvent) === originalEventForm;

  const cancelEdit = () => {
    if (isSubmitting) return;
    setEditingEvent(null);
    setNewEvent({
      title: "", date: "", time: "", endTime: "", callTimeStart: "", callTimeEnd: "", location: "", description: "",
      notificationMessage: "", targetMembership: "all", approvedBudget: "", postToFacebook: false, borrowedItems: [],
    });
  };

  const confirmDelete = async () => {
    if (eventToDelete === null) return;
    const id = eventToDelete;
    try {
      await onDeleteEvent(id);
      setLocalEvents(prev => prev.filter(e => e.id !== id));
      setEventToDelete(null);
      setSuccessMessage(t("eventDeletedSuccess"));
      setShowSuccessModal(true);
    } catch (error: any) {
      setEventToDelete(null);
      setDeleteErrorMessage(error?.response?.data?.message || t("deleteEventFailed"));
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
    eventId: eventId, // ✅ keep this for existing records
    residentId: record.residentId,
    residentName: record.residentName,
    timeIn: record.timeIn || "",
    timeOut: record.timeOut || ""
  }));

  eligibleMembers.forEach((member: any) => {
    if (!combinedList.some(item => item.residentId === member.id)) {
      const memberName = member.name || (member.first_name ? `${member.first_name} ${member.last_name}` : `Resident #${member.id}`);
      combinedList.push({
        eventId: eventId, // ✅ ADDED THIS — fixes the error
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

  const paginatedAttendance = useMemo(() => {
    if (!showAttendance) return [];
    const eligibleMembers = getMembersForEvent(showAttendance);
    const fullList = getFullAttendanceList(showAttendance.id, eligibleMembers);
    const filtered = getFilteredAttendance(fullList);
    const startIndex = (attendanceCurrentPage - 1) * attendanceItemsPerPage;
    return filtered.slice(startIndex, startIndex + attendanceItemsPerPage);
  }, [showAttendance, attendanceSearch, attendanceStatusFilter, attendanceCurrentPage]);

  const attendanceTotalPages = useMemo(() => {
    if (!showAttendance) return 0;
    const eligibleMembers = getMembersForEvent(showAttendance);
    const fullList = getFullAttendanceList(showAttendance.id, eligibleMembers);
    const filtered = getFilteredAttendance(fullList);
    return Math.ceil(filtered.length / attendanceItemsPerPage);
  }, [showAttendance, attendanceSearch, attendanceStatusFilter]);

  useEffect(() => {
    if (!showAttendance) setAttendanceCurrentPage(1);
  }, [showAttendance]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("eventsAndAttendance")}</h1>
            <p className="mt-1 text-sm text-[#667777]">{t("staffEventsSubtitle")}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 w-full">
            <div className="flex-1 min-w-[250px]">
              <SearchBar
                value={eventSearch}
                onChange={setEventSearch}
                placeholder={t("searchEventsPlaceholder")}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <FilterDropdown
                value={eventFilter}
                onChange={setEventFilter}
                options={[
                  { value: "all", label: t("allEvents") },
                  { value: "upcoming", label: t("upcomingEvents") },
                  { value: "ongoing", label: t("ongoingEvents") },
                  { value: "past", label: t("pastEvents") },
                ]}
                className="h-14 pl-10 pr-9"
                icon={<Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />}
              />

              <div className="h-14">
                <DatePicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                  className="h-14 pl-4 pr-4 py-3.5"
                />
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredEvents.length} of {localEvents.length} {t("eventsMatchCount")}
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

      <div className="relative flex flex-col lg:flex-row gap-6 items-start px-1 w-full h-auto lg:h-[calc(100vh-180px)]">
        <button onClick={() => setFormOpen(!formOpen)} className={`absolute top-2 z-50 bg-[#359ca0] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#2a7d82] ${formOpen ? "right-2 lg:right-auto lg:left-[calc(50%-18px)]" : "left-0"}`}>
          {formOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className={`transition-all duration-300 overflow-hidden shrink-0 ${formOpen ? "w-full lg:w-1/2 opacity-100" : "w-0 opacity-0"}`}>
          <div className="bg-white rounded-3xl border-gray-200 p-5 shadow-md h-full overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-[#005f63] mb-4">{editingEvent ? t("editEventTitle") : t("createNewEvent")}</h2>
            <form onSubmit={handleSaveEvent} noValidate className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("eventTitleRequired")}</label><input type="text" required value={newEvent.title} placeholder={t("eventTitlePlaceholder")} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("dateRequired")}</label>
                <DatePicker
                  value={newEvent.date}
                  onChange={(iso) => setNewEvent({ ...newEvent, date: iso })}
                  className="px-4 py-2"
                  min={getTodayString()}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("startTimeRequired")}</label><input type="time" required value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("endTimeLabel")}</label><input type="time" required value={newEvent.endTime} onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              </div>

              {/* Call time: sign-in/out attendance window, separate from the event's own start/end */}
              <div className="rounded-2xl border border-dashed border-[#005f63]/25 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("callTimeSectionTitle")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("callTimeStartLabel")}</label>
                    <input type="time" required value={newEvent.callTimeStart} onChange={(e) => setNewEvent({ ...newEvent, callTimeStart: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("callTimeEndLabel")}</label>
                    <input type="time" required value={newEvent.callTimeEnd} onChange={(e) => setNewEvent({ ...newEvent, callTimeEnd: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" disabled={!newEvent.endTime} title={!newEvent.endTime ? t("setEndTimeFirstHint") : undefined} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">{t("callTimeHint")}</p>
              </div>

              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("locationRequired")}</label><input type="text" required value={newEvent.location} placeholder={t("locationPlaceholder")} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label><textarea value={newEvent.description} placeholder={t("descriptionPlaceholderEvent")} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm" rows={3} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("messageLabel")}</label><textarea value={newEvent.notificationMessage} placeholder={t("messagePlaceholder")} onChange={(e) => setNewEvent({ ...newEvent, notificationMessage: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm" rows={2} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("targetMembersRequired")}</label><select value={newEvent.targetMembership} onChange={(e) => setNewEvent({ ...newEvent, targetMembership: e.target.value })} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm bg-white"><option value="all">{t("allResidentsOption")}</option>{memberships.map((m: any) => (<option key={m.id} value={String(m.id)}>{m.name}</option>))}</select></div>

              {/* UC-8: Record Event Budget and Expenses */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("approvedBudgetOptional")}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newEvent.approvedBudget}
                  onChange={(e) => setNewEvent({ ...newEvent, approvedBudget: e.target.value })}
                  placeholder={t("approvedBudgetPlaceholder")}
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-gray-400">{t("trackExpensesHint")}</p>
              </div>

              {/* Items borrowed from Inventory for this event -- excludes
                  Disposed/Lost stock (see InventoryController::borrowable()),
                  and deducts the chosen quantity from Inventory on save. */}
              <div className="rounded-2xl border border-dashed border-[#005f63]/25 p-3 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-[#005f63]/70" />
                  <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">{t("borrowedItemsSectionTitle")}</p>
                </div>

                {newEvent.borrowedItems.length > 0 && (
                  <div className="space-y-2">
                    {newEvent.borrowedItems.map((row) => {
                      const max = Math.max(0, availableStockFor(row.inventoryItemId));
                      return (
                        <div key={row.inventoryItemId} className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2">
                          <span className="flex-1 text-sm text-gray-700 truncate">{getBorrowItemName(row.inventoryItemId)}</span>
                          <input
                            type="number"
                            min={1}
                            max={max}
                            value={row.quantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const clamped = raw === "" ? "" : String(Math.max(1, Math.min(max || 1, Math.round(Number(raw)) || 1)));
                              updateBorrowQuantity(row.inventoryItemId, clamped);
                            }}
                            className="w-16 rounded-full border border-gray-200 px-2 py-1 text-sm text-center"
                          />
                          <span className="text-[11px] text-gray-400 shrink-0">/ {max} {t("availableStockShortLabel")}</span>
                          <button
                            type="button"
                            onClick={() => removeBorrowRow(row.inventoryItemId)}
                            className="text-gray-400 hover:text-red-500 transition shrink-0"
                            title={t("removeLabel")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!borrowableItemsLoading && borrowableItems.filter((it) => it.quantity > 0).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">{t("noBorrowableItemsLabel")}</p>
                ) : (
                  <SearchableSelect
                    onSelect={addBorrowRow}
                    disabled={borrowableItemsLoading}
                    placeholder={borrowableItemsLoading ? t("loadingLabel") : t("addBorrowedItemPlaceholder")}
                    noResultsLabel={t("noMatchingBorrowItemsLabel")}
                    options={borrowableItems
                      // Out-of-stock items can't actually be borrowed --
                      // don't list them just to have staff pick one and
                      // hit the quantity-exceeds-stock error.
                      .filter((it) => it.quantity > 0)
                      .filter((it) => !newEvent.borrowedItems.some((r) => r.inventoryItemId === String(it.id)))
                      .map((it) => ({
                        value: String(it.id),
                        label: it.name,
                        hint: `(${it.quantity} ${t("availableStockShortLabel")})`,
                      }))}
                  />
                )}
                <p className="text-[11px] text-gray-400">{t("borrowedItemsHint")}</p>
              </div>

              {/* Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)" */}
              {!editingEvent && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={newEvent.postToFacebook}
                    onChange={(e) => setNewEvent({ ...newEvent, postToFacebook: e.target.checked })}
                    className="w-4 h-4 text-[#005f63]"
                  />
                  <span className="font-medium text-gray-700">{t("alsoPostToFacebook")}</span>
                </label>
              )}

              <div className="pt-2 flex gap-2"><button type="submit" disabled={isSubmitting || isEventFormUnchanged} title={isEventFormUnchanged ? t("noChangesToSaveHint") : undefined} className="flex-1 py-2.5 rounded-full font-bold bg-[#359ca0] hover:bg-[#2a7d82] text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#359ca0]">{isSubmitting ? t("savingLabel") : (editingEvent ? t("updateEvent") : t("postEvent"))}</button>{editingEvent && <button type="button" onClick={cancelEdit} disabled={isSubmitting} className="px-6 py-2.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600">{t("cancelLabel")}</button>}</div>
            </form>
          </div>
        </div>

        <div className={`overflow-y-auto pr-2 transition-all duration-300 ${formOpen ? "hidden lg:block lg:w-1/2 h-full" : "w-full pl-6 h-auto lg:h-full"}`}>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-500 italic">{t("noEventsMatchStaff")}</p></div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
                <div key={dateLabel}>
                  <h3 className="mb-4 border-b border-gray-200 pb-2 text-lg font-bold text-[#005f63]">{dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel === UNKNOWN_DATE_KEY ? t("unknownDateLabel") : dateLabel}</h3>
                  <div className="grid gap-5 md:grid-cols-1">
                    {eventsInGroup.map((e) => {
                      const eligibleMembers = getMembersForEvent(e);
                      const attendanceList = getFullAttendanceList(e.id, eligibleMembers);
                      const signedIn = attendanceList.filter((a: any) => a.timeIn).length;
                      const signedOut = attendanceList.filter((a: any) => a.timeOut).length;
                      const status = getEventStatus(e);
                      const eventMembershipNames = getMembershipNames(e);
                      const displayMembershipLabel = eventMembershipNames.length > 0 ? eventMembershipNames.join(", ") : t("openEventLabel");
                      return (
                        <div key={e.id} className="relative rounded-2xl border-l-4 border-[#f8e67d] bg-white p-5 shadow-[0_5px_6px_rgba(0,0,0,0.10)]">
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>{eventStatusLabel(status.label)}</span>
                            {/* Editing/archiving stops making sense once an
                                event is Ongoing (it's actively happening --
                                changing it now would be confusing) or Past
                                (already finished), same idea as a closed
                                budget line. */}
                            {(() => {
                              const isLocked = status.label === "Past" || status.label === "Ongoing";
                              const lockedHint = status.label === "Ongoing" ? t("ongoingEventLockedHint") : t("pastEventLockedHint");
                              return (
                                <>
                                  <button onClick={() => startEditEvent(e)} disabled={isSubmitting || !!editingEvent || isLocked} className="rounded-full p-2 text-orange-500 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={isLocked ? lockedHint : t("editTitle")}><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                                  <button onClick={() => setViewEv(e)} className="rounded-full p-2 text-[#005f63] hover:bg-[#005f63]/10" title={t("viewDetailsTitle")}><Eye className="h-[18px] w-[18px]" /></button>
                                  <button onClick={() => setEventToDelete(e.id)} disabled={isLocked} className="p-2 rounded-full hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={isLocked ? lockedHint : t("deleteTitle")}><Archive className="h-4 w-4 text-red-500" /></button>
                                </>
                              );
                            })()}
                          </div>
                          <h2 className="pr-32 text-base font-bold text-[#005f63]">{highlightText(e.title, eventSearch)}</h2>
                          <p className="mt-1 text-sm text-gray-500">{e.startDate && e.endDate ? (e.startDate === e.endDate ? e.startDate : `${e.startDate} - ${e.endDate}`) : e.date || ""} · {formatTime12Hour(e.startTime)}</p>
                          <p className="mt-1 text-sm text-gray-500">{highlightText(e.location, eventSearch)}</p>
                          <p className="mt-2 text-[14px] text-gray-700">{highlightText(e.description, eventSearch)}</p>
                          <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-[#4eb4b8] mr-1"></span>{signedIn} {t("signedInLabel")} | <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span>{signedOut} {t("signedOutLabel")}<span className="ml-2 font-medium">• {displayMembershipLabel}</span></div>
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

      <ConfirmDialog
        open={showSaveConfirm}
        icon={editingEvent ? <Pencil size={32} /> : <Plus size={32} />}
        title={editingEvent ? t("confirmUpdateEventTitle") : t("confirmAddEventTitle")}
        body={editingEvent ? t("confirmUpdateEventBody") : t("confirmAddEventBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={editingEvent ? t("yesUpdate") : t("yesAdd")}
        onCancel={() => setShowSaveConfirm(false)}
        onConfirm={performSaveEvent}
      />

      {/* ✅ CUSTOM DELETE MODAL — NO BROWSER DEFAULT */}
      {eventToDelete !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
            <h3 className="text-lg font-bold text-red-600 mb-2">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{t("confirmDeletionBody")}</p>
            <div className="flex justify-center gap-3"><button onClick={cancelDelete} className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100">{t("cancelLabel")}</button><button onClick={confirmDelete} className="px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700">{t("yesDelete")}</button></div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setShowSuccessModal(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[#005f63] flex justify-center">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{successMessage}</p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setShowErrorModal(false)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-center text-red-500">
              <XCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("saveEventFailed")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => setShowErrorModal(false)}
              className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
            >
              {t("goBack")}
            </button>
          </div>
        </div>
      )}

      {/* Delete failure modal -- was a native alert(), replaced to match the
          rest of the app's popup template. */}
      {deleteErrorMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setDeleteErrorMessage(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-center text-red-500">
              <AlertCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{deleteErrorMessage}</p>
            <button
              onClick={() => setDeleteErrorMessage(null)}
              className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {viewEv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><div><h2 className="text-2xl font-black text-[#005f63]">{viewEv.title}</h2><p className="text-sm text-gray-600 mt-1">{viewEv.startDate || viewEv.date} · {formatTime12Hour(viewEv.startTime)}</p><p className="text-sm text-gray-600">{viewEv.location}</p></div><button onClick={() => setViewEv(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={20} /></button></div>
            <div className="space-y-4"><div className={`px-3 py-2 rounded-full inline-block text-sm font-semibold ${getEventStatus(viewEv).color}`}>{eventStatusLabel(getEventStatus(viewEv).label)}</div><div><h4 className="font-semibold text-gray-700 mb-1">{t("descriptionLabel")}</h4><p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{viewEv.description || "—"}</p></div>{viewEv.notificationMessage && (<div><h4 className="font-semibold text-gray-700 mb-1">{t("notificationPreview")}</h4><p className="text-sm text-teal-700 bg-teal-50 p-3 rounded-xl">{viewEv.notificationMessage}</p></div>)}{viewEv.approvedBudget !== null && viewEv.approvedBudget !== undefined && (<p className="text-sm text-gray-600">{t("approvedBudgetColon")} <strong className="text-[#005f63]">₱{Number(viewEv.approvedBudget).toLocaleString()}</strong></p>)}<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center"><div className="bg-teal-50 rounded-xl p-3"><p className="text-xs text-teal-600 font-medium">{t("targetMembersLabel")}</p><p className="font-bold text-teal-800 text-sm">{(() => { const n = getMembershipNames(viewEv); return n.length > 0 ? n.join(", ") : t("openEventLabel"); })()}</p></div><div className="bg-green-50 rounded-xl p-3"><p className="text-xs text-green-600 font-medium">{t("signedInLabel")}</p><p className="font-bold text-green-800">{getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeIn).length}</p></div>
            <div className="bg-orange-50 rounded-xl p-3"><p className="text-xs text-orange-600 font-medium">{t("signedOutLabel")}</p><p className="font-bold text-orange-800">{getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeOut).length}</p></div></div><button onClick={() => setShowAttendance(viewEv)} className="w-full bg-[#f3b94e] hover:bg-[#ff9736] text-white py-2.5 rounded-full font-medium">{t("viewAttendanceList")}</button>
            {/* UC-16: residents' post-event ratings/comments -- previously
                collected but never shown anywhere in the staff portal. */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-400" /> {t("residentFeedbackLabel")}</h4>
              {feedbackLoading ? (
                <p className="text-xs text-gray-400 italic">{t("loadingLabel")}</p>
              ) : eventFeedback.length === 0 ? (
                <p className="text-xs text-gray-400 italic bg-gray-50 rounded-xl p-3">{t("noFeedbackYetLabel")}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {paginatedFeedback.map((f) => (
                      <div key={f.id} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-700 truncate">{f.user ? `${f.user.first_name} ${f.user.last_name}` : t("unknownItemLabel")}</span>
                          <span className="flex items-center gap-0.5 shrink-0">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                            ))}
                          </span>
                        </div>
                        {f.comment && <p className="mt-1 text-xs text-gray-600">{f.comment}</p>}
                      </div>
                    ))}
                  </div>
                  {feedbackTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-gray-500">
                        {t("pageOfLabel")} {feedbackCurrentPage} {t("ofPagesLabel")} {feedbackTotalPages} • {eventFeedback.length} {t("recordsShownLabel")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setFeedbackCurrentPage(p => Math.max(1, p - 1))}
                          disabled={feedbackCurrentPage === 1}
                          className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                        >
                          ←
                        </button>
                        <span className="h-7 w-7 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-xs font-semibold">
                          {feedbackCurrentPage}
                        </span>
                        <button
                          onClick={() => setFeedbackCurrentPage(p => Math.min(feedbackTotalPages, p + 1))}
                          disabled={feedbackCurrentPage === feedbackTotalPages}
                          className="h-7 w-7 rounded-full border border-gray-300 bg-white text-[#005f63] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {showAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-[95%] max-w-6xl h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-white z-20 flex items-center justify-between p-6 border-b border-gray-200 rounded-t-3xl shrink-0">
              <div>
                <h2 className="text-2xl font-black text-[#005f63]">{t("attendanceDashPrefix")} {showAttendance.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{showAttendance.date}</p>
              </div>
              <button onClick={() => setShowAttendance(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
            </div>

            <div className="bg-white z-20 pb-4 mb-4 border-b border-gray-100 px-6 pt-2 flex flex-wrap gap-4 items-center shrink-0">
              <div className="flex-1 min-w-[250px]">
                <SearchBar
                  value={attendanceSearch}
                  onChange={setAttendanceSearch}
                  placeholder={t("searchResidentNamePlaceholder")}
                />
              </div>
              <FilterDropdown
                value={attendanceStatusFilter}
                onChange={setAttendanceStatusFilter}
                options={[
                  { value: "all", label: t("allStatus") },
                  { value: "complete", label: t("statusComplete") },
                  { value: "incomplete", label: t("statusIncomplete") },
                  { value: "missed", label: t("statusMissed") },
                ]}
                className="h-12 pl-10 pr-8"
                icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />}
              />
            </div>

            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              <div className="rounded-xl border border-[#ddd5ca] w-full overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-[#f8f6f2] sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-4 font-medium text-[#005f63] w-[30%]">{t("residentNameColumn")}</th>
                      <th className="text-left p-4 font-medium text-[#005f63] w-[25%]">{t("timeInColumn")}</th>
                      <th className="text-left p-4 font-medium text-[#005f63] w-[25%]">{t("timeOutColumn")}</th>
                      <th className="text-left p-4 font-medium text-[#005f63] w-[15%]">{t("statusColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAttendance.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-gray-500 italic">
                          {t("noMatchingRecords")}
                        </td>
                      </tr>
                    ) : (
                                            paginatedAttendance.map((record: any, i: number) => {
                        const status = getAttendanceStatus(record);
                        let statusColor = "text-gray-600 bg-gray-100";
                        if (status.label === "Complete") statusColor = "text-green-700 bg-green-100";
                        if (status.label === "Incomplete") statusColor = "text-yellow-700 bg-yellow-100";
                        if (status.label === "Missed") statusColor = "text-red-700 bg-red-100";

                        return (
                          <tr key={i} className="border-t border-[#ddd5ca] hover:bg-[#fcfaf6] transition-colors">
                            <td className="p-4 text-gray-800">{highlightAttendanceText(record.residentName, attendanceSearch)}</td>
                            <td className="p-4 text-gray-700">
                              {record.timeIn ? (
                                <span className="flex items-center gap-2">
                                  <LogIn className="h-4 w-4 text-green-600" />
                                  {formatTime12Hour(record.timeIn)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-4 text-gray-700">
                              {record.timeOut ? (
                                <span className="flex items-center gap-2">
                                  <LogOut className="h-4 w-4 text-red-600" />
                                  {formatTime12Hour(record.timeOut)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                {attendanceStatusLabel(status.label)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {attendanceTotalPages > 1 && (
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-6">
                  <p className="text-sm text-gray-600 text-center sm:text-left">
                    {t("pageOfLabel")} {attendanceCurrentPage} {t("ofPagesLabel")} {attendanceTotalPages} • {paginatedAttendance.length} {t("recordsShownLabel")}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAttendanceCurrentPage(p => Math.max(1, p - 1))}
                      disabled={attendanceCurrentPage === 1}
                      className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                    >
                      ←
                    </button>
                    <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                      {attendanceCurrentPage}
                    </span>
                    <button
                      onClick={() => setAttendanceCurrentPage(p => Math.min(attendanceTotalPages, p + 1))}
                      disabled={attendanceCurrentPage === attendanceTotalPages}
                      className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
