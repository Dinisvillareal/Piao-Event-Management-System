import Portal from "../../../components/ui/Portal";
import { scrollListIntoView } from "../../../lib/scrollToList";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import { matchesSearch } from "../../../lib/search";
import { makeEventTiming, STATUS_META } from "../../../lib/eventTiming";
import FormSelect from "../../../components/ui/FormSelect";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import FeedbackComment from "../../../components/ui/FeedbackComment";
import type { ResponseFields } from "../../../components/ui/FeedbackComment";
import {
  Filter, X, LogIn, LogOut, ChevronLeft, Archive,
  Package, Trash2, Star, Plus, Pencil, Calendar, MapPin, Clock, Search, ChevronDown,
  Megaphone, ClipboardList, Users, ArrowLeft, Save, Download, Printer, CheckCircle2, ChevronRight, Eye,
} from "lucide-react";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import FilterBar, { type ExtraChip } from "../../../components/ui/FilterBar";
import QuickTabs from "../../../components/ui/QuickTabs";
import DatePicker from "../../../components/ui/DatePicker";
import TimePicker from "../../../components/ui/TimePicker";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import NumberStepper from "../../../components/ui/NumberStepper";
import EventBudgetWorkspace from "../../../components/budget/EventBudgetWorkspace";
import Skeleton from "../../../components/ui/Skeleton";
import { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";
import SlideOutGhost from "../../../components/ui/SlideOutGhost";
import ReportOptionsModal, { type SectionDef, type AttendeeFilter } from "./ReportOptionsModal";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";

import { tc } from "../../../lib/contentTranslations";
// What can go on one event's printout / PDF / Word file. Keys must match the
// backend's allowed attendance sections (ReportController::buildExportPayload).
const EVENT_REPORT_SECTIONS: SectionDef[] = [
  { key: "summary", labelKey: "rptSecSummary", descKey: "rptSecSummaryAtt" },
  { key: "age", labelKey: "rptSecAge", descKey: "rptSecAgeDesc" },
  { key: "events", labelKey: "rptSecEvents", descKey: "rptSecEventsDesc" },
  { key: "records", labelKey: "rptSecRecords", descKey: "rptSecRecordsDesc" },
  { key: "message", labelKey: "rptSecMessage", descKey: "rptSecMessageDesc", group: "other" },
];

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
  // How many different inventory items this event took (still out or already returned) -- known as soon as the events load.
  inventoryCount?: number;
  // Feedback + non-attendance reasons received for this event.
  feedbackCount?: number;
  // How many attendance rows the event has -- known as soon as the events load.
  attendanceCount?: number;
  borrowedItems?: { inventoryItemId: string; name: string; quantity: number; units: Record<string, number> }[];
}

interface BorrowableInventoryItem {
  id: number | string;
  name: string;
  quantity: number;
  condition: string;
  // In-stock units per condition (they add up to `quantity`).
  new_quantity?: number;
  good_quantity?: number;
  fair_quantity?: number;
  poor_quantity?: number;
  storage_location?: string | null;
}

// One borrowed item in the Create/Edit Event form. `units` is how many of each
// condition staff picked (kept as strings, like the other form fields);
// `quantity` is always their sum.
type BorrowRow = { inventoryItemId: string; quantity: string; units: Record<string, string> };

const BORROW_CONDITIONS = [
  { key: "new_quantity", label: "conditionNew", chip: "bg-[#4FBEB0]/20 text-[#7DD8CB]" },
  { key: "good_quantity", label: "conditionGood", chip: "bg-[#4FBEB0]/10 text-[#7DD8CB]" },
  { key: "fair_quantity", label: "conditionFair", chip: "bg-gold-400/15 text-gold-300" },
  { key: "poor_quantity", label: "conditionPoor", chip: "bg-[#8A3D2C]/25 text-[#E2A088]" },
] as const;

interface EventsViewProps {
  allEvents: MyEvent[];
  onDeleteEvent: (id: number | string) => Promise<void>;
  onCreateEvent?: (event: MyEvent) => void;
  highlightText: (text: string, query: string) => React.ReactNode;
  residents?: any[];
  memberships?: any[];
  attendanceRecords?: any[];
  loading?: boolean;
  // Asks the page to open one event on a given tab (used by the bell notifications).
  openRequest?: { eventId: number; tab: string; sub?: string; nonce: number } | null;
  onOpenRequestHandled?: () => void;
}

export function EventsView({
  allEvents,
  onDeleteEvent,
  onCreateEvent,
  highlightText,
  residents = [],
  memberships = [],
  attendanceRecords = [],
  loading = false,
  openRequest = null,
  onOpenRequestHandled,
}: EventsViewProps) {
  const { t, locale, language } = useLanguage();
  const eventStatusLabel = (label: string) => (label === "CheckIn" ? t("checkInOpenLabel") : label === "Upcoming" ? t("upcomingBadge") : label === "Ongoing" ? t("ongoingBadge") : t("pastBadge"));
  // The card/detail-view chip reads "Completed" for a finished event instead
  // of "Past" -- "Past" stays as-is everywhere else (filter dropdown option,
  // etc.) since that wording is still correct there.
  const eventStatusChipLabel = (label: string) => (label === "Past" ? t("completedBadge") : eventStatusLabel(label));
  const statusPillClasses = (label: string, dark = false) => {
    if (dark) {
      if (label === "CheckIn") return "bg-sky-400/15 text-sky-300";
      if (label === "Upcoming") return "bg-[#4FBEB0]/15 text-[#7DD8CB]";
      if (label === "Ongoing") return "bg-gold-400/15 text-gold-300";
      return "bg-white/10 text-white/50";
    }
    if (label === "Upcoming") return "bg-sage-50 text-sage-700";
    if (label === "Ongoing") return "bg-gold-50 text-gold-700";
    return "bg-[#E6E0D3]/70 text-[#6B7280]";
  };
  const statusDotClasses = (label: string, dark = false) => {
    if (dark) {
      if (label === "CheckIn") return "bg-sky-400 animate-pulse";
      if (label === "Upcoming") return "bg-[#4FBEB0]";
      if (label === "Ongoing") return "bg-gold-400";
      return "bg-[#8A8474]";
    }
    if (label === "Upcoming") return "bg-sage-600";
    if (label === "Ongoing") return "bg-gold-600";
    return "bg-[#8A8474]";
  };
  const attendanceStatusLabel = (label: string) => {
    if (label === "Complete") return t("statusComplete");
    if (label === "Incomplete") return t("statusIncomplete");
    if (label === "Upcoming") return t("upcomingBadge");
    if (label === "Ongoing") return t("ongoingBadge");
    return t("statusMissed");
  };
  const { relativeLabel } = makeEventTiming(t);
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  // Quick tabs (Today / This week / Has feedback) and sort, on top of the status + membership + date filters.
  const [eventTab, setEventTab] = useState<"all" | "today" | "week" | "feedback">("all");
  const [eventSort, setEventSort] = useState("default");
  const [viewEv, setViewEv] = useState<MyEvent | null>(null);
  // Tab to land on when the detail view opens (set by a bell notification).
  const pendingSubRef = useRef<"ratings" | "reasons" | null>(null);
  const pendingTabRef = useRef<"overview" | "attendance" | "inventory" | "budget" | "feedback" | null>(null);
  // Which of the 4 tabs (Overview / Attendance / Budget / Feedback) is
  // showing in the full-page event detail view.
  const [detailTab, setDetailTab] = useState<"overview" | "attendance" | "inventory" | "budget" | "feedback">("overview");
  // UC-16 (staff side): the ratings/comments residents left for this
  // event -- fetched from /feedback/event/{id} (backend already existed,
  // it just wasn't wired into any staff screen yet).
  type FeedbackRow = ResponseFields & { rating: number; comment: string | null; user?: { first_name: string; last_name: string } };
  type AbsenceRow = ResponseFields & { reason: string; comment: string | null; user?: { first_name: string; last_name: string } };
  const [eventFeedback, setEventFeedback] = useState<FeedbackRow[]>([]);
  const [eventAbsences, setEventAbsences] = useState<AbsenceRow[]>([]);
  const [feedbackSubTab, setFeedbackSubTab] = useState<"ratings" | "reasons">("ratings");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  // The event's Inventory tab: what it borrowed, what is still out, and what
  // came back (and in which condition) -- from /events/{id}/inventory.
  type EventInventoryRow = {
    inventory_item_id: number; name: string; photo_url?: string | null; total: number; status: "borrowed" | "partial" | "returned";
    out: number; out_units: Record<string, number>; returned: number; returned_units: Record<string, number>;
  };
  const [eventInventory, setEventInventory] = useState<{
    items: EventInventoryRow[];
    returns: { id: number; name: string; photo_url?: string | null; evidence_photo_urls?: string[]; quantity: number; units: Record<string, number>; released_by: string | null; released_at: string }[];
  }>({ items: [], returns: [] });
  const [eventInventoryLoading, setEventInventoryLoading] = useState(false);
  // Full-size look at an item photo or a return's evidence photo (prev/next, Esc closes).
  const [invPhoto, setInvPhoto] = useState<{ url: string; name: string; urls: string[] } | null>(null);
  const stepInvPhoto = (dir: 1 | -1) => setInvPhoto((cur) => {
    if (!cur || cur.urls.length < 2) return cur;
    const i = Math.max(0, cur.urls.indexOf(cur.url));
    return { ...cur, url: cur.urls[(i + dir + cur.urls.length) % cur.urls.length] };
  });
  useEffect(() => {
    if (!invPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInvPhoto(null);
      else if (e.key === "ArrowRight") stepInvPhoto(1);
      else if (e.key === "ArrowLeft") stepInvPhoto(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [invPhoto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [feedbackCurrentPage, setFeedbackCurrentPage] = useState(1);

  // A new feedback arrived for the event on screen: refresh its Feedback tab live.
  useEffect(() => {
    const onFeedback = (e: Event) => {
      const id = (e as CustomEvent).detail?.eventId;
      if (!viewEv || id == null || String(viewEv.id) !== String(id)) return;
      api.get(`/feedback/event/${viewEv.id}`).then((res) => setEventFeedback(res.data ?? [])).catch(() => {});
      api.get(`/feedback/absence/event/${viewEv.id}`).then((res) => setEventAbsences(res.data ?? [])).catch(() => {});
    };
    window.addEventListener("staff:feedback-received", onFeedback);
    return () => window.removeEventListener("staff:feedback-received", onFeedback);
  }, [viewEv?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedbackItemsPerPage = 5;


  useEffect(() => {
    if (!viewEv) {
      setEventFeedback([]);
      setEventAbsences([]);
      setEventInventory({ items: [], returns: [] });
      return;
    }
    setDetailTab(pendingTabRef.current ?? "overview");
    pendingTabRef.current = null;
    setAttendanceCurrentPage(1);
    setAttendanceSearch("");
    setAttendanceStatusFilter("all");

    let cancelled = false;
    setFeedbackLoading(true);
    setFeedbackCurrentPage(1);
    setFeedbackSubTab(pendingSubRef.current ?? "ratings");
    pendingSubRef.current = null;
    api.get(`/feedback/absence/event/${viewEv.id}`)
      .then((res) => { if (!cancelled) setEventAbsences(res.data ?? []); })
      .catch(() => { if (!cancelled) setEventAbsences([]); });
    api.get(`/feedback/event/${viewEv.id}`)
      .then((res) => { if (!cancelled) setEventFeedback(res.data ?? []); })
      .catch(() => { if (!cancelled) setEventFeedback([]); })
      .finally(() => { if (!cancelled) setFeedbackLoading(false); });

    setEventInventoryLoading(true);
    api.get(`/events/${viewEv.id}/inventory`)
      .then((res) => { if (!cancelled) setEventInventory({ items: res.data?.items ?? [], returns: res.data?.returns ?? [] }); })
      .catch(() => { if (!cancelled) setEventInventory({ items: [], returns: [] }); })
      .finally(() => { if (!cancelled) setEventInventoryLoading(false); });


    return () => { cancelled = true; };
  }, [viewEv?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedbackTotalPages = Math.max(1, Math.ceil(eventFeedback.length / feedbackItemsPerPage));
  const paginatedFeedback = useMemo(() => {
    const start = (feedbackCurrentPage - 1) * feedbackItemsPerPage;
    return eventFeedback.slice(start, start + feedbackItemsPerPage);
  }, [eventFeedback, feedbackCurrentPage]);
  const averageRating = eventFeedback.length > 0 ? eventFeedback.reduce((sum, f) => sum + f.rating, 0) / eventFeedback.length : 0;

  const [eventToDelete, setEventToDelete] = useState<number | string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<MyEvent | null>(null);
  const [originalEventForm, setOriginalEventForm] = useState<string>("");
  // Whether the Add/Edit Event modal is open (renamed in spirit from the old
  // "formOpen" toggle for the persistent side panel this replaced).
  const [formOpen, setFormOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash whenever the page number is switched, same as the
  // Activity Logs page (which re-fetches per page). This list paginates
  // client-side over already-loaded data, so there's nothing to actually
  // wait on -- the flash is purely so switching pages always feels the same.
  const [pageSwitchingRaw, setPageSwitching] = useState(false);
  const filterSwitching = useFilterSwitching([eventSearch, eventFilter, membershipFilter, selectedDate, eventTab, eventSort]);
  const pageSwitching = pageSwitchingRaw || filterSwitching;
  // Page-open skeleton -- `loading` is only true during Staff's very first
  // fetch, so without this, opening Events later showed the cards instantly.
  const openSkeleton = usePageOpenSkeleton(loading);
  // While the page is still showing its skeleton the counters read 0, not the
  // numbers of a list that has not loaded yet.
  const countsLoading = openSkeleton || loading;
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTopRef = useRef<HTMLSpanElement | null>(null);
  const goToPage = (page: number) => {
    setCurrentPage(page);
    scrollListIntoView(listTopRef.current);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
  // Same brief flash inside an event's detail view (tab switch, attendance /
  // feedback page switch).
  const [detailSwitching, setDetailSwitching] = useState(false);
  const detailSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashDetail = () => {
    setDetailSwitching(true);
    if (detailSwitchTimer.current) clearTimeout(detailSwitchTimer.current);
    detailSwitchTimer.current = setTimeout(() => setDetailSwitching(false), 350);
  };
  useEffect(() => () => { if (detailSwitchTimer.current) clearTimeout(detailSwitchTimer.current); }, []);
  // Opening an event also flashes the detail skeleton, same as switching tabs.
  useEffect(() => { if (viewEv?.id) flashDetail(); }, [viewEv?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Bell notification -> open that event on the requested tab. Waits for the
  // events to be loaded, then clears the request so it only fires once.
  useEffect(() => {
    if (!openRequest) return;
    const tabs = ["overview", "attendance", "inventory", "budget", "feedback"] as const;
    const tab = (tabs as readonly string[]).includes(openRequest.tab) ? (openRequest.tab as (typeof tabs)[number]) : "overview";
    const subTab = openRequest.sub === "reasons" ? "reasons" : "ratings";
    if (viewEv && String(viewEv.id) === String(openRequest.eventId)) {
      setDetailTab(tab);
      if (tab === "feedback") setFeedbackSubTab(subTab);
      onOpenRequestHandled?.();
      return;
    }
    const target = localEvents.find((e) => String(e.id) === String(openRequest.eventId));
    if (!target) return; // events still loading -- runs again when they arrive
    pendingTabRef.current = tab;
    pendingSubRef.current = tab === "feedback" ? subTab : null;
    setViewEv(target);
    onOpenRequestHandled?.();
  }, [openRequest, localEvents]); // eslint-disable-line react-hooks/exhaustive-deps


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

  // "HH:MM" for right now in the browser's local time -- used as the
  // time inputs' floor whenever the selected event date is today, so the
  // picker itself won't offer an already-passed time (matches the
  // call_time_start >= now guard the backend now also enforces).
  const getCurrentTimeString = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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

  // "All residents" when the event is open to everyone, otherwise the
  // actual membership group name(s) (e.g. "Pantawid Pamilya", "Walang
  // Gutom") joined together -- the same two states shown on the card
  // footer and in the Overview tab's Coverage stat.
  const getCoverageLabel = (e: MyEvent): string => {
    const names = getMembershipNames(e);
    return names.length === 0 ? t("allResidentsCoverageLabel") : names.join(", ");
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
      attendanceCount: typeof dbEvent.attendances_count === "number" ? dbEvent.attendances_count : undefined,
      inventoryCount: typeof dbEvent.inventory_items_count === "number" ? dbEvent.inventory_items_count : undefined,
      feedbackCount: typeof dbEvent.feedback_count === "number" ? dbEvent.feedback_count : undefined,
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
        ? dbEvent.borrowed_items.map((bi: any) => {
            const units: Record<string, number> = {
              New: Number(bi.new_quantity) || 0,
              Good: Number(bi.good_quantity) || 0,
              Fair: Number(bi.fair_quantity) || 0,
              Poor: Number(bi.poor_quantity) || 0,
            };
            // Borrows made before units were split count toward the item's main condition.
            const rest = (Number(bi.quantity) || 0) - Object.values(units).reduce((a, b) => a + b, 0);
            if (rest > 0) units[units[bi.inventory_item?.condition] !== undefined ? bi.inventory_item.condition : "Good"] += rest;
            return {
              inventoryItemId: String(bi.inventory_item_id),
              name: bi.inventory_item?.name ?? "",
              quantity: Number(bi.quantity) || 0,
              units,
            };
          })
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
      setMembershipFilter("all");
      setSelectedDate("");
    };

    window.addEventListener('refreshEvents', handleRefresh);
    return () => {
      window.removeEventListener('refreshEvents', handleRefresh);
    };
  }, []);

  const [liveAttendances, setLiveAttendances] = useState<Record<string, any[]>>({});

  // Only the event being viewed needs its attendance list, so fetch just that
  // one (instead of every event one-by-one). Cached copy shows instantly while
  // a fresh one loads in the background.
  useEffect(() => {
    if (!viewEv?.id) return;
    const event = viewEv;
    let cancelled = false;

    (async () => {
      try {
        const response = await api.get(`/events/${event.id}/attendances`);
        const formatted = (response.data as any[]).map((record: any) => ({
          eventId: event.id,
          residentId: record.user_id,
          residentName: record.user ? `${record.user.first_name} ${record.user.last_name}` : `User #${record.user_id}`,
          userCode: record.user?.user_code ?? "",
          timeIn: record.time_in,
          timeOut: record.time_out
        }));
        if (!cancelled) setLiveAttendances(prev => ({ ...prev, [event.id]: formatted }));
      } catch (error) {
        console.error("Failed to fetch live attendance for event:", error);
      }
    })();

    return () => { cancelled = true; };
  }, [viewEv?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time-ish refresh: this app has no websocket/push layer, so a
  // second staff member adding/editing/attending an event elsewhere is
  // picked up here via light polling plus a refetch whenever this tab
  // regains focus or becomes visible again, matching the same pattern used
  // on the Memberships page. Paused while the Add/Edit modal or a delete
  // confirmation is open so a background refresh never yanks state out from
  // under an in-progress edit.
  const anyModalOpen = formOpen || eventToDelete !== null;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;

  useEffect(() => {
    const poll = setInterval(() => {
      if (anyModalOpenRef.current) return;
      refreshEventsFromAPI();
    }, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !anyModalOpenRef.current) {
        refreshEventsFromAPI();
      }
    };
    const handleFocus = () => {
      if (!anyModalOpenRef.current) {
        refreshEventsFromAPI();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

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
    borrowedItems: [] as BorrowRow[],
  });

  const blankEventForm = {
    title: "", date: "", time: "", endTime: "", callTimeStart: "", callTimeEnd: "", location: "", description: "",
    notificationMessage: "", targetMembership: "all", approvedBudget: "", postToFacebook: false, borrowedItems: [] as BorrowRow[],
  };

  // Whether the currently-selected event date is today -- used below to
  // reject an already-passed time the moment it's picked, rather than
  // only catching it on submit.
  const isEventDateToday = newEvent.date === getTodayString();

  // Per-field inline "that time already passed" messages for the four
  // time inputs. Deliberately NOT using the native `min` attribute for
  // this (we tried that first) -- on this Electron/Chromium build, an
  // empty <input type="time"> with `min` set would auto-fill itself from
  // min the moment it was focused/stepped, but mis-rendered the AM/PM
  // segment (showed e.g. "08:11 AM" for a min of 20:11/8:11 PM), so the
  // field silently ended up holding a real PAST value that looked like a
  // small, easy-to-miss discrepancy rather than an obviously invalid one.
  // Rejecting the change in JS and never writing the bad value into state
  // sidesteps that entirely, on any browser.
  const [timeFieldErrors, setTimeFieldErrors] = useState<{
    time?: string; endTime?: string; callTimeStart?: string; callTimeEnd?: string;
  }>({});

  const handleTimeFieldChange = (
    field: "time" | "endTime" | "callTimeStart" | "callTimeEnd",
    value: string
  ) => {
    // getCurrentTimeString() is re-read on every keystroke/step, not
    // cached, so this stays correct even if the form's been open a while.
    if (value && isEventDateToday && value <= getCurrentTimeString()) {
      setTimeFieldErrors((prev) => ({ ...prev, [field]: t("timeAlreadyPassedError") }));
      return; // reject -- never write an already-passed time into state
    }
    setTimeFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setNewEvent({ ...newEvent, [field]: value });
  };

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

  // Same idea per condition: units of this item this event already holds.
  const availableUnitsFor = (itemId: string, label: string): number => {
    const item = borrowableItems.find((it) => String(it.id) === String(itemId));
    const key = BORROW_CONDITIONS.find((c) => c.label === `condition${label}`)?.key;
    const inStock = key && item ? Number(item[key] ?? 0) : 0;
    const own = (editingEvent?.borrowedItems ?? []).find((bi) => String(bi.inventoryItemId) === String(itemId))?.units?.[label] ?? 0;
    return inStock + own;
  };

  const availableStockFor = (itemId: string): number => {
    const base = borrowableItems.find((it) => String(it.id) === String(itemId))?.quantity ?? 0;
    return base + (originalBorrowedMap.get(String(itemId)) ?? 0);
  };

  const addBorrowRow = (itemId: string) => {
    if (!itemId) return;
    if (newEvent.borrowedItems.some((r) => r.inventoryItemId === itemId)) return;
    // Start with one unit from the condition that has the most stock; staff
    // then choose how many of each condition they want.
    const best = BORROW_CONDITIONS.map((c) => c.label.replace("condition", "")).reduce(
      (top, label) => (availableUnitsFor(itemId, label) > availableUnitsFor(itemId, top) ? label : top),
      "Good"
    );
    const units: Record<string, string> = { New: "0", Good: "0", Fair: "0", Poor: "0" };
    units[best] = "1";
    setNewEvent((prev) => ({ ...prev, borrowedItems: [...prev.borrowedItems, { inventoryItemId: itemId, quantity: "1", units }] }));
    setBorrowItemToAdd("");
  };

  const updateBorrowUnits = (itemId: string, label: string, raw: string) => {
    const max = availableUnitsFor(itemId, label);
    const value = raw === "" ? 0 : Math.max(0, Math.min(max, Math.round(Number(raw)) || 0));
    setNewEvent((prev) => ({
      ...prev,
      borrowedItems: prev.borrowedItems.map((r) => {
        if (r.inventoryItemId !== itemId) return r;
        const units = { ...r.units, [label]: String(value) };
        const total = Object.values(units).reduce((a, b) => a + (Number(b) || 0), 0);
        return { ...r, units, quantity: String(total) };
      }),
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
  // Skeleton flash on every search/status change, and always jump back to
  // page 1 -- otherwise a filter applied from page 3 left the table empty
  // (page 3 of a 1-page result), which looked like the filter did nothing.
  const attendanceFiltering = useFilterSwitching([attendanceSearch, attendanceStatusFilter]);
  useEffect(() => { setAttendanceCurrentPage(1); }, [attendanceSearch, attendanceStatusFilter]);

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
    const upcoming = { label: "Upcoming" as const, color: "bg-sage-50 text-sage-700" };
    const ongoing = { label: "Ongoing" as const, color: "bg-gold-50 text-gold-700" };
    const past = { label: "Past" as const, color: "bg-[#E6E0D3]/70 text-[#6B7280]" };

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

  // Display-only: an upcoming event whose sign-in window (call time start)
  // has already opened reads "Check-in open". Filters/locking still use the
  // real Upcoming/Ongoing/Past status.
  const chipKey = (event: MyEvent, label: string) => {
    if (label !== "Upcoming") return label;
    const open = parseEventDateTime(event.call_time_start);
    return open && new Date() >= open ? "CheckIn" : label;
  };

  const isEventLocked = (label: "Upcoming" | "Ongoing" | "Past") => label === "Past" || label === "Ongoing";

  const getFilterStatus = (event: MyEvent, filter: string): boolean => {
    const status = getEventStatus(event);
    if (filter === "all") return true;
    if (filter === "upcoming") return status.label === "Upcoming";
    if (filter === "ongoing") return status.label === "Ongoing";
    if (filter === "past") return status.label === "Past";
    return true;
  };

  // Everything except the Ongoing/Upcoming/Past tab, so the tab counts stay
  // truthful for the current search / membership / date.
  const baseScopedEvents = useMemo(() => {
    let result = [...localEvents];

    if (membershipFilter !== "all") {
      result = result.filter((e) =>
        (e.membershipIds || []).some((id) => String(id) === membershipFilter)
      );
    }

    if (eventSearch.trim()) {
      result = result.filter((e) =>
        matchesSearch(eventSearch, e.title, e.date, e.location, e.description)
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
  }, [localEvents, membershipFilter, eventSearch, selectedDate]);

  // Quick-tab tests. "Today" = the event runs at any point today; "This week"
  // = it starts Monday-Sunday of the current week; "Has feedback" = at least
  // one rating or non-attendance reason came in.
  const eventTabTest = (tab: typeof eventTab, e: MyEvent): boolean => {
    if (tab === "all") return true;
    if (tab === "feedback") return (e.feedbackCount ?? 0) > 0;
    const start = parseEventDateTime(e.event_start) ?? parseEventDateTime(e.date) ?? parseEventDateTime(e.startDate);
    if (!start) return false;
    const end = parseEventDateTime(e.event_end) ?? start;
    const now = new Date();
    if (tab === "today") {
      const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
      const d1 = new Date(d0); d1.setDate(d0.getDate() + 1);
      return start < d1 && end >= d0;
    }
    const w0 = new Date(now); w0.setHours(0, 0, 0, 0); w0.setDate(w0.getDate() - ((w0.getDay() + 6) % 7));
    const w1 = new Date(w0); w1.setDate(w0.getDate() + 7);
    return start >= w0 && start < w1;
  };
  const eventTabCounts = useMemo(() => ({
    all: baseScopedEvents.length,
    today: baseScopedEvents.filter((e) => eventTabTest("today", e)).length,
    week: baseScopedEvents.filter((e) => eventTabTest("week", e)).length,
    feedback: baseScopedEvents.filter((e) => eventTabTest("feedback", e)).length,
  }), [baseScopedEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedEvents = useMemo(
    () => baseScopedEvents.filter((e) => eventTabTest(eventTab, e)),
    [baseScopedEvents, eventTab] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filteredEvents = useMemo(
    () => scopedEvents.filter((event) => getFilterStatus(event, eventFilter)),
    [scopedEvents, eventFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const statusCounts = useMemo(() => {
    const c = { all: scopedEvents.length, ongoing: 0, upcoming: 0, past: 0 };
    scopedEvents.forEach((e) => {
      const l = getEventStatus(e).label;
      if (l === "Ongoing") c.ongoing++;
      else if (l === "Upcoming") c.upcoming++;
      else c.past++;
    });
    return c;
  }, [scopedEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ongoing first, then Upcoming (soonest first), then Past (most recent first).
  const sortedFilteredEvents = useMemo(() => {
    const order = { Ongoing: 0, Upcoming: 1, Past: 2 } as const;
    const startOf = (e: MyEvent) => (parseEventDateTime(e.event_start) ?? parseEventDateTime(e.date) ?? parseEventDateTime(e.startDate))?.getTime() ?? 0;
    return [...filteredEvents]
      .map((e) => ({ e, label: getEventStatus(e).label, start: startOf(e) }))
      .sort((x, y) => {
        if (order[x.label] !== order[y.label]) return order[x.label] - order[y.label];
        // Sections stay grouped by status; the sort picks the order inside each one.
        if (eventSort === "soonest") return x.start - y.start;
        if (eventSort === "latest") return y.start - x.start;
        if (eventSort === "name-az") return String(x.e.title).localeCompare(String(y.e.title));
        return x.label === "Past" ? y.start - x.start : x.start - y.start;
      })
      .map((x) => x.e);
  }, [filteredEvents, eventSort]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(sortedFilteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedFilteredEvents.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedFilteredEvents, currentPage, itemsPerPage]);

  // The cards on the visible page show an attendee count, so load just those
  // few events' attendance, in parallel, once each (cached afterwards).
  const requestedAttendance = useRef<Set<string>>(new Set());
  useEffect(() => {
    paginatedEvents.forEach((event) => {
      const key = String(event.id);
      if (requestedAttendance.current.has(key) || liveAttendances[event.id]) return;
      requestedAttendance.current.add(key);
      api.get(`/events/${event.id}/attendances`)
        .then((response) => {
          const formatted = (response.data as any[]).map((record: any) => ({
            eventId: event.id,
            residentId: record.user_id,
            residentName: record.user ? `${record.user.first_name} ${record.user.last_name}` : `User #${record.user_id}`,
            userCode: record.user?.user_code ?? "",
            timeIn: record.time_in,
            timeOut: record.time_out
          }));
          setLiveAttendances(prev => ({ ...prev, [event.id]: formatted }));
        })
        .catch(() => requestedAttendance.current.delete(key));
    });
  }, [paginatedEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters / search changing flashes the list skeleton too (not on first mount).
  const filtersMounted = useRef(false);
  useEffect(() => {
    setCurrentPage(1);
    if (!filtersMounted.current) { filtersMounted.current = true; return; }
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  }, [eventSearch, eventFilter, membershipFilter, selectedDate, eventTab, eventSort]);

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

    if (newEvent.callTimeStart && newEvent.time && newEvent.callTimeStart === newEvent.time) {
      // Call Time Start must be strictly earlier than the event's own
      // Start Time -- equal would leave a zero-length sign-in window
      // (e.g. event starts 7:00, call time can't also be 7:00). Matches
      // the backend's before:event_start rule (was before_or_equal).
      setErrorMessage(t("callTimeEqualsStartError"));
      setShowErrorModal(true);
      return;
    }

    {
      // The earliest moment in the whole event window is Call Time Start
      // (it's required to be < the event's own Start Time), so checking
      // it here catches a past Start Time too. Runs for both create and
      // edit now -- editing an Upcoming event into a past time was never
      // actually blocked before, only creating one was.
      //
      // When editing, only flag this if the earliest time is actually
      // being CHANGED to a past value -- it's normal for an Upcoming
      // event's Call Time (sign-in opens) to have already passed while
      // the event itself hasn't started yet, and that alone must not
      // block unrelated edits (e.g. fixing the description). Matches the
      // same "only if changed" rule the backend now enforces.
      const earliestTimeField = newEvent.callTimeStart || newEvent.time;
      const selectedDateTime = new Date(`${newEvent.date}T${earliestTimeField}`);
      const now = new Date();

      let earliestTimeUnchanged = false;
      if (editingEvent) {
        const timeOnly = (value?: string) => (value ? new Date(value).toTimeString().slice(0, 5) : "");
        const originalDate = editingEvent.event_start
          ? new Date(editingEvent.event_start).toISOString().split("T")[0]
          : editingEvent.date;
        const originalEarliest = editingEvent.call_time_start
          ? timeOnly(editingEvent.call_time_start)
          : (editingEvent.callStartTime || editingEvent.startTime || "");
        earliestTimeUnchanged = originalDate === newEvent.date && originalEarliest === earliestTimeField;
      }

      if (earliestTimeField && !isNaN(selectedDateTime.getTime()) && selectedDateTime < now && !earliestTimeUnchanged) {
        const formattedDate = selectedDateTime.toLocaleDateString(locale, {
          month: "long", day: "numeric", year: "numeric"
        });
        const formattedTime = selectedDateTime.toLocaleTimeString(locale, {
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
        .map((r) => ({
          inventory_item_id: Number(r.inventoryItemId),
          quantity: Number(r.quantity),
          // Exactly the units staff picked, per condition.
          conditions: Object.fromEntries(Object.entries(r.units).map(([k, v]) => [k, Number(v) || 0])),
        })),
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

      const wasEditing = !!editingEvent;
      setEditingEvent(null);
      setFormOpen(false);
      setNewEvent(blankEventForm);
      setTimeFieldErrors({});

      if (onCreateEvent && savedEvent) {
        onCreateEvent(formatDbEvent(savedEvent));
      }

      // If this save was made from inside the detail view, keep it open on
      // the freshly-saved copy instead of dumping the user back to the grid.
      if (viewEv && savedEvent?.id && String(savedEvent.id) === String(viewEv.id)) {
        setViewEv(formatDbEvent(savedEvent));
      }

      setSuccessMessage(wasEditing ? t("eventUpdatedSuccess") : t("eventCreatedSuccess"));
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
        setTimeFieldErrors({});
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddEventModal = () => {
    if (editingEvent || isSubmitting) return;
    setNewEvent(blankEventForm);
    setTimeFieldErrors({});
    setFormOpen(true);
  };

  const startEditEvent = (event: MyEvent) => {
    if (isSubmitting) return;
    const status = getEventStatus(event);
    if (isEventLocked(status.label)) return;
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
      borrowedItems: (event.borrowedItems ?? []).map((bi) => ({
        inventoryItemId: bi.inventoryItemId,
        quantity: String(bi.quantity),
        units: Object.fromEntries(Object.entries(bi.units ?? {}).map(([k, v]) => [k, String(v)])) as Record<string, string>,
      })),
    };
    setNewEvent(initialForm);
    setOriginalEventForm(JSON.stringify(initialForm));
    setTimeFieldErrors({});
  };

  // Nothing to submit if editing an event and the form still matches what
  // was loaded (title, schedule, borrowed items, everything).
  const isEventFormUnchanged = editingEvent
    ? JSON.stringify(newEvent) === originalEventForm
    : JSON.stringify(newEvent) === JSON.stringify(blankEventForm); // new event: nothing entered yet

  const closeEventModal = () => {
    if (isSubmitting) return;
    setFormOpen(false);
    setEditingEvent(null);
    setNewEvent(blankEventForm);
    setTimeFieldErrors({});
  };

  const confirmDelete = async () => {
    if (eventToDelete === null) return;
    const id = eventToDelete;
    try {
      await onDeleteEvent(id);
      setLocalEvents(prev => prev.filter(e => e.id !== id));
      setEventToDelete(null);
      // If the deleted event was the one open in the detail view, go back
      // to the grid instead of leaving a dead event on screen.
      if (viewEv && String(viewEv.id) === String(id)) setViewEv(null);
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
      eventId: eventId,
      residentId: record.residentId,
      residentName: record.residentName,
      userCode: record.userCode || eligibleMembers.find((m: any) => m.id === record.residentId)?.user_code || "",
      timeIn: record.timeIn || "",
      timeOut: record.timeOut || ""
    }));

    eligibleMembers.forEach((member: any) => {
      if (!combinedList.some(item => item.residentId === member.id)) {
        const memberName = member.name || (member.first_name ? `${member.first_name} ${member.last_name}` : `Resident #${member.id}`);
        combinedList.push({
          eventId: eventId,
          residentId: member.id,
          residentName: memberName,
          userCode: member.user_code || "",
          timeIn: "",
          timeOut: ""
        });
      }
    });

    // Sort: Complete -> Incomplete -> Missed (who actually attended first),
    // then last name A-Z inside each group so a name is easy to find.
    const rank = (r: any) => (r.timeIn && r.timeOut ? 0 : r.timeIn || r.timeOut ? 1 : 2);
    const lastName = (name: string) => {
      const parts = String(name ?? "").trim().split(/\s+/);
      return (parts[parts.length - 1] || "").toLowerCase();
    };
    combinedList.sort((x: any, y: any) =>
      rank(x) - rank(y) ||
      lastName(x.residentName).localeCompare(lastName(y.residentName)) ||
      String(x.residentName).localeCompare(String(y.residentName))
    );

    return combinedList;
  };
  // "No scan" only means Missed once the event is over: before it starts the
  // row reads Upcoming, and while it is running, Ongoing.
  const getAttendanceStatus = (record: any) => {
    if (record.timeIn && record.timeOut) return { label: "Complete" };
    if (record.timeIn || record.timeOut) return { label: "Incomplete" };
    const ev = viewEv;
    if (ev) {
      const phase = getEventStatus(ev).label;
      if (phase === "Upcoming") return { label: "Upcoming" };
      if (phase === "Ongoing") return { label: "Ongoing" };
    }
    return { label: "Missed" };
  };

  // The status filter only offers what can exist for this event right now:
  // an event that hasn't started offers Upcoming (never Missed), a running one
  // offers Ongoing, and only a finished one offers Missed.
  const attendanceFilterOptions = (() => {
    const phase = viewEv ? getEventStatus(viewEv).label : "Past";
    const pending = phase === "Upcoming"
      ? [{ value: "upcoming", label: t("upcomingBadge") }]
      : phase === "Ongoing"
        ? [{ value: "ongoing", label: t("ongoingBadge") }]
        : [{ value: "missed", label: t("statusMissed") }];
    return [
      { value: "all", label: t("allStatus") },
      { value: "complete", label: t("statusComplete") },
      { value: "incomplete", label: t("statusIncomplete") },
      ...pending,
    ];
  })();

  const getFilteredAttendance = (fullList: any[]) => {
    return fullList.filter((record) => {
      const matchesName = matchesSearch(attendanceSearch, record.residentName, record.userCode);
      const status = getAttendanceStatus(record).label.toLowerCase();
      const offered = attendanceFilterOptions.some((o) => o.value === attendanceStatusFilter);
      const matchesStatus = attendanceStatusFilter === "all" || !offered || status === attendanceStatusFilter;
      return matchesName && matchesStatus;
    });
  };

  // Attendance tab data -- keyed off the event currently open in the detail
  // view (`viewEv`) instead of a separate modal's own state, now that the
  // attendance table lives inside the Attendance tab rather than its own
  // popup.
  const paginatedAttendance = useMemo(() => {
    if (!viewEv) return [];
    const eligibleMembers = getMembersForEvent(viewEv);
    const fullList = getFullAttendanceList(viewEv.id, eligibleMembers);
    const filtered = getFilteredAttendance(fullList);
    const startIndex = (attendanceCurrentPage - 1) * attendanceItemsPerPage;
    return filtered.slice(startIndex, startIndex + attendanceItemsPerPage);
  }, [viewEv, attendanceSearch, attendanceStatusFilter, attendanceCurrentPage, liveAttendances]); // eslint-disable-line react-hooks/exhaustive-deps

  const attendanceTotalPages = useMemo(() => {
    if (!viewEv) return 0;
    const eligibleMembers = getMembersForEvent(viewEv);
    const fullList = getFullAttendanceList(viewEv.id, eligibleMembers);
    const filtered = getFilteredAttendance(fullList);
    return Math.ceil(filtered.length / attendanceItemsPerPage);
  }, [viewEv, attendanceSearch, attendanceStatusFilter, liveAttendances]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullAttendanceCountForTab = useMemo(() => {
    if (!viewEv) return 0;
    // Residents and the attendance rows arrive a moment after the event opens;
    // the server's own count is there from the start, so the tab never
    // begins at 0 and climbs.
    return Math.max(getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).length, viewEv.attendanceCount ?? 0);
  }, [viewEv, liveAttendances]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Budget tab -------------------------------------------------------
  // The tab embeds the shared EventBudgetWorkspace (the very same component
  // the Budget & Expenses page uses), so an event's budget and expenses are
  // managed in one place and can be edited from either page. This just keeps
  // this page's copy of the event in step when the approved budget changes
  // there, so the Overview tile and the Edit Event form never show a stale
  // figure.
  const handleBudgetSummary = (summary: { approved_budget: number | string | null }) => {
    if (!viewEv) return;
    const next = summary.approved_budget === null || summary.approved_budget === undefined ? null : Number(summary.approved_budget);
    const cur = viewEv.approvedBudget === null || viewEv.approvedBudget === undefined ? null : Number(viewEv.approvedBudget);
    if (next === cur) return;
    const id = String(viewEv.id);
    setViewEv((prev) => (prev && String(prev.id) === id ? { ...prev, approvedBudget: next } : prev));
    setLocalEvents((prev) => prev.map((e) => (String(e.id) === id ? { ...e, approvedBudget: next } : e)));
  };

  // ---- Generate Report (per event) -- same Print & Export Options flow as
  // Reports & Analytics, scoped to the event open in the detail view.
  const [reportMode, setReportMode] = useState<"print" | "download" | null>(null);
  const [reportSections, setReportSections] = useState<string[]>(EVENT_REPORT_SECTIONS.map((x) => x.key));
  const [reportAttendeeFilter, setReportAttendeeFilter] = useState<AttendeeFilter>("all");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportConfirm, setReportConfirm] = useState<"pdf" | "word" | null>(null);
  const [reportSuccess, setReportSuccess] = useState<"pdf" | "word" | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const openEventReport = (mode: "print" | "download") => {
    setReportSections(EVENT_REPORT_SECTIONS.map((x) => x.key));
    // Start from what the Attendance tab is showing: filtered to "Missed" -> the
    // report starts on "Absent" (the other statuses have no exact match, so "All").
    setReportAttendeeFilter(attendanceStatusFilter === "missed" ? "absent" : "all");
    setReportMode(mode);
  };

  const fetchEventReportBlob = async (format: "pdf" | "word") => {
    if (!viewEv) throw new Error("no event");
    const params: Record<string, string> = {
      type: "attendance",
      event_id: String(viewEv.id),
      sections: reportSections.join(","),
    };
    if (reportSections.includes("records")) {
      params.event_ids = String(viewEv.id);
      params.attendee_filter = reportAttendeeFilter;
    }
    const response = await api.get(`/reports/export/${format}`, { params, responseType: "blob" });
    const mime = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return new Blob([response.data], { type: mime });
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const reportFileBase = () =>
    `${String(viewEv?.title ?? "event").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "event"}-report`;

  const isPhoneOrTabletDevice = () => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  };

  // Desktop: the report is rendered by the browser itself in a hidden frame
  // on this very page and the print dialog opens straight away -- no new tab
  // and no blob: address. Printing the browser's own HTML (instead of a PDF
  // inside a frame) is what lets the page margins be exact, with no blank
  // band at the top. Phones/tablets can't print a hidden frame reliably, so
  // they open the PDF in the device's viewer instead (same as Reports).
  const handleEventReportPrint = async () => {
    const mobile = isPhoneOrTabletDevice();
    const win = mobile ? window.open("", "_blank") : null;
    setReportBusy(true);
    try {
      if (mobile) {
        const blob = await fetchEventReportBlob("pdf");
        const url = URL.createObjectURL(blob);
        if (win && !win.closed) win.location.href = url;
        else saveBlob(blob, `${reportFileBase()}.pdf`);
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
        setReportMode(null);
        return;
      }
      const params: Record<string, string> = {
        type: "attendance",
        event_id: String(viewEv?.id ?? ""),
        sections: reportSections.join(","),
      };
      if (reportSections.includes("records")) {
        params.event_ids = String(viewEv?.id ?? "");
        params.attendee_filter = reportAttendeeFilter;
      }
      const response = await api.get("/reports/export/html", { params, responseType: "text", transformResponse: (d: any) => d });
      const html = String(response.data);
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
      frame.onload = () => {
        window.setTimeout(async () => {
          try {
            // Wait for the seal image / fonts so the preview is complete.
            await (frame.contentDocument as any)?.fonts?.ready;
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            const blob = await fetchEventReportBlob("pdf");
            saveBlob(blob, `${reportFileBase()}.pdf`);
          }
          window.setTimeout(() => frame.remove(), 60000);
        }, 400);
      };
      frame.srcdoc = html;
      document.body.appendChild(frame);
      setReportMode(null);
    } catch {
      win?.close();
      setReportError(t("downloadFailedMessage"));
    } finally {
      setReportBusy(false);
    }
  };

  const handleEventReportDownload = async (format: "pdf" | "word") => {
    setReportBusy(true);
    try {
      const blob = await fetchEventReportBlob(format);
      saveBlob(blob, `${reportFileBase()}.${format === "pdf" ? "pdf" : "docx"}`);
      setReportMode(null);
      setReportSuccess(format);
    } catch {
      setReportError(t("downloadFailedMessage"));
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {viewEv ? (
        (() => {
          const status = getEventStatus(viewEv);
          const locked = isEventLocked(status.label);
          const coverageNames = getMembershipNames(viewEv);
          const coverageDisplay = coverageNames.length === 0 ? t("allResidentsCoverageLabel") : coverageNames.join(", ");
          const signedInCount = getFullAttendanceList(viewEv.id, getMembersForEvent(viewEv)).filter((a: any) => a.timeIn || a.timeOut).length;

          const tabs: { key: typeof detailTab; label: string; count?: number }[] = [
            { key: "overview", label: t("overviewTabLabel") },
            { key: "attendance", label: t("attendanceTabLabel"), count: fullAttendanceCountForTab },
            { key: "inventory", label: t("inventoryTabLabel"), count: eventInventoryLoading ? (viewEv.inventoryCount ?? 0) : (eventInventory.items.length || viewEv.inventoryCount || 0) },
            { key: "budget", label: t("budgetTabLabel") },
            { key: "feedback", label: t("feedbackTabLabel"), count: eventFeedback.length },
          ];

          return (
            // Full-bleed dark navy wrapper -- same technique and palette as
            // the list view right below this (and the Dashboard/Residents/
            // Households pages), so the event detail reads as part of the
            // same system instead of the light page it used to be.
            <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
            <div className="space-y-6">
              <button
                onClick={() => setViewEv(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white transition"
              >
                <ChevronLeft className="h-4 w-4" /> {t("backToEventsLabel")}
              </button>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-white break-words">{viewEv.title}</h1>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${statusPillClasses(chipKey(viewEv, status.label), true)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses(chipKey(viewEv, status.label), true)}`} />
                      {eventStatusChipLabel(chipKey(viewEv, status.label))}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold-300 shrink-0" /> {viewEv.location}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-gold-300 shrink-0" />
                      {(viewEv.startDate || viewEv.date)} · {formatTime12Hour(viewEv.startTime)}{viewEv.endTime ? ` – ${formatTime12Hour(viewEv.endTime)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startEditEvent(viewEv)}
                    disabled={isSubmitting || locked}
                    title={locked ? (status.label === "Ongoing" ? t("ongoingEventLockedHint") : t("pastEventLockedHint")) : t("editTitle")}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Pencil className="h-4 w-4" /> {t("editTitle")}
                  </button>
                  <button
                    onClick={() => setEventToDelete(viewEv.id)}
                    disabled={locked}
                    title={locked ? (status.label === "Ongoing" ? t("ongoingEventLockedHint") : t("pastEventLockedHint")) : t("deleteTitle")}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-white/[0.04] px-5 py-2.5 text-[15px] font-semibold text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Archive className="h-4 w-4" /> {t("deleteTitle")}
                  </button>
                </div>
              </div>

              <div className="border-b border-white/10 flex gap-6 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { if (tab.key !== detailTab) flashDetail(); setDetailTab(tab.key); }}
                    className={`pb-3 px-1 text-[15px] font-semibold border-b-2 whitespace-nowrap transition ${
                      detailTab === tab.key ? "border-[#4FBEB0] text-[#4FBEB0]" : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
                  </button>
                ))}
              </div>

              {detailTab === "overview" && (
                <div className="space-y-5">
                  {detailSwitching && (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-4 w-2/3" />
                        <div className="pt-4 mt-4 border-t border-white/10 space-y-3">
                          <Skeleton className="h-3 w-36" />
                          <Skeleton className="h-11 w-full rounded-xl" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[0, 1, 2].map((k) => (
                          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col items-center gap-2.5">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-5 w-20" />
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Skeleton className="h-11 w-52 rounded-full" />
                        <Skeleton className="h-11 w-44 rounded-full" />
                        <Skeleton className="h-11 w-11 rounded-full" />
                      </div>
                    </>
                  )}
                  <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-5 ${detailSwitching ? "hidden" : ""}`}>
                    <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">{t("descriptionLabel")}</h3>
                    <p className="text-[15px] text-white leading-relaxed whitespace-pre-wrap">{viewEv.description || t("noDescription")}</p>
                    {viewEv.notificationMessage && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <h4 className="text-[13px] font-bold uppercase tracking-wide text-[#7DD8CB] mb-1.5">{t("notificationPreview")}</h4>
                        <p className="text-[15px] text-[#7DD8CB] bg-[#4FBEB0]/10 rounded-xl p-3">{viewEv.notificationMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Solid-colored to match the Dashboard's Residents / Active
                      Memberships / Overdue Returns stat cards -- same three
                      colors, just flat instead of the Dashboard's gradient.
                      These already read fine on the dark page, so only the
                      surrounding surfaces needed to change. */}
                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${detailSwitching ? "hidden" : ""}`}>
                    <div className="rounded-2xl bg-sage-700 p-4 text-center">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-white/90">{t("coverageStatLabel")}</p>
                      <p className="mt-1.5 text-base font-bold text-white break-words">{coverageDisplay}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailTab("budget")}
                      title={t("budgetTabLabel")}
                      className="rounded-2xl bg-gradient-to-br from-gold-500 to-gold-700 p-4 text-center transition hover:brightness-110 active:scale-[0.99]"
                    >
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-white/90">{t("approvedBudgetStatLabel")}</p>
                      <p className="mt-1.5 text-base font-bold text-white">
                        {viewEv.approvedBudget !== null && viewEv.approvedBudget !== undefined ? `₱${Number(viewEv.approvedBudget).toLocaleString()}` : "—"}
                      </p>
                    </button>
                    <div className="rounded-2xl bg-[#5C2A1E] p-4 text-center">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-white/90">{t("attendeesStatLabel")}</p>
                      <p className="mt-1.5 text-base font-bold text-white">{signedInCount}</p>
                    </div>
                  </div>

                  <div className={`flex flex-wrap gap-3 ${detailSwitching ? "hidden" : ""}`}>
                    <button
                      type="button"
                      disabled
                      title={t("featureComingSoonHint")}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-white/40 px-4 py-2.5 text-[15px] font-semibold opacity-70 cursor-not-allowed"
                    >
                      <Megaphone className="h-4 w-4" /> {t("broadcastSmsButton")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEventReport("print")}
                      className="inline-flex items-center gap-2 rounded-full bg-[#1E3A5F] px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-[#274A77] active:scale-95"
                    >
                      <ClipboardList className="h-4 w-4" /> {t("generateReportButton")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEventReport("download")}
                      title={t("downloadReportLabel")}
                      aria-label={t("downloadReportLabel")}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/[0.12] active:scale-95"
                    >
                      <Download className="h-5 w-5" />
                    </button>

                    <ReportOptionsModal
                      open={reportMode !== null}
                      mode={reportMode ?? "print"}
                      reportLabel={viewEv.title}
                      sections={EVENT_REPORT_SECTIONS}
                      selected={reportSections}
                      onSelectedChange={setReportSections}
                      recordEvents={[{
                        id: String(viewEv.id),
                        name: viewEv.title,
                        date: viewEv.date,
                        status: status.label,
                        eligible: fullAttendanceCountForTab,
                        attended: signedInCount,
                      }]}
                      recordIds={[String(viewEv.id)]}
                      onRecordIdsChange={() => {}}
                      attendeeFilter={reportAttendeeFilter}
                      onAttendeeFilterChange={setReportAttendeeFilter}
                      busy={reportBusy}
                      onClose={() => setReportMode(null)}
                      onPrint={handleEventReportPrint}
                      onDownload={(format) => setReportConfirm(format)}
                      t={t}
                    />
                    <ConfirmDialog
                      open={reportConfirm !== null}
                      icon={<Download className="h-9 w-9" />}
                      title={t("confirmDownloadReportTitle")}
                      body={reportConfirm === "word" ? t("confirmDownloadReportBodyWord") : t("confirmDownloadReportBodyPdf")}
                      cancelLabel={t("cancelLabel")}
                      confirmLabel={t("downloadLabel")}
                      z={9999}
                      onCancel={() => setReportConfirm(null)}
                      onConfirm={() => {
                        const format = reportConfirm;
                        setReportConfirm(null);
                        if (format) handleEventReportDownload(format);
                      }}
                    />
                    <StatusModal
                      open={reportSuccess !== null}
                      type="success"
                      title={t("downloadSuccessTitle")}
                      message={reportSuccess === "word" ? t("downloadSuccessWordMessage") : t("downloadSuccessPdfMessage")}
                      okLabel={t("okLabel")}
                      onClose={() => setReportSuccess(null)}
                    />
                    <StatusModal
                      open={reportError !== null}
                      type="error"
                      title={t("errorLabel")}
                      message={reportError ?? ""}
                      okLabel={t("okLabel")}
                      onClose={() => setReportError(null)}
                    />
                  </div>
                </div>
              )}

              {detailTab === "attendance" && (
                <div className="space-y-4">
                  {/* Same search bar card/input pattern as the Residents,
                      Households, Memberships and main Events search --
                      the status filter sits alongside it, unchanged. */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                      <div className="relative flex-1 min-w-[220px]">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <input
                          type="text"
                          value={attendanceSearch}
                          onChange={(e) => setAttendanceSearch(e.target.value)}
                          placeholder={t("searchResidentNamePlaceholder")}
                          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-[4.5rem] text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                        />
                        {attendanceSearch && (
                          <button
                            type="button"
                            onClick={() => setAttendanceSearch("")}
                            aria-label="Clear search"
                            title="Clear"
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/10 bg-[#0A0E1A] px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#161C2E]"
                          >
                            {t("clearLabel")}
                          </button>
                        )}
                      </div>
                      <div className="shrink-0">
                        <FilterDropdown
                          value={attendanceStatusFilter}
                          onChange={setAttendanceStatusFilter}
                          options={attendanceFilterOptions}
                          className="h-11 pl-9 pr-8"
                          icon={<Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                          dark
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 w-full overflow-x-auto">
                    <table className="w-full text-base min-w-[680px]">
                      <thead className="bg-white/[0.06] sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-5 py-4 text-[15px] font-bold text-white w-[20%]">{t("idNumberColumn")}</th>
                          <th className="text-left px-5 py-4 text-[15px] font-bold text-white w-[28%]">{t("residentNameColumn")}</th>
                          <th className="text-left px-5 py-4 text-[15px] font-bold text-white w-[20%]">{t("timeInColumn")}</th>
                          <th className="text-left px-5 py-4 text-[15px] font-bold text-white w-[20%]">{t("timeOutColumn")}</th>
                          <th className="text-left px-5 py-4 text-[15px] font-bold text-white w-[12%]">{t("statusColumn")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailSwitching || attendanceFiltering ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <tr key={`sk-${i}`} className="border-t border-white/[0.06]">
                              <td className="px-5 py-4"><Skeleton className="h-4 w-8" /></td>
                              <td className="px-5 py-4"><Skeleton className="h-4 w-3/4" /></td>
                              <td className="px-5 py-4"><Skeleton className="h-4 w-20" /></td>
                              <td className="px-5 py-4"><Skeleton className="h-4 w-20" /></td>
                              <td className="px-5 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                            </tr>
                          ))
                        ) : paginatedAttendance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-white/40 italic bg-white/[0.03]">
                              {t("noMatchingRecords")}
                            </td>
                          </tr>
                        ) : (
                          paginatedAttendance.map((record: any, i: number) => {
                            const recStatus = getAttendanceStatus(record);
                            let statusColor = "text-white/50 bg-white/10";
                            if (recStatus.label === "Complete") statusColor = "text-[#7DD8CB] bg-[#4FBEB0]/15";
                            if (recStatus.label === "Incomplete") statusColor = "text-gold-300 bg-gold-400/15";
                            if (recStatus.label === "Missed") statusColor = "text-red-400 bg-red-500/15";
                            if (recStatus.label === "Upcoming") statusColor = "text-[#9CC4FF] bg-[#6BA8FF]/15";
                            if (recStatus.label === "Ongoing") statusColor = "text-[#7DD8CB] bg-[#4FBEB0]/15";

                            return (
                              <tr key={i} className="border-t border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                                <td className="px-5 py-5 font-mono text-[15px] text-white/80">{record.userCode ? highlightAttendanceText(record.userCode, attendanceSearch) : "—"}</td>
                                <td className="px-5 py-5 text-white">{highlightAttendanceText(record.residentName, attendanceSearch)}</td>
                                <td className="px-5 py-5 text-white">
                                  {record.timeIn ? (
                                    <span className="flex items-center gap-2">
                                      <LogIn className="h-[18px] w-[18px] text-[#4FBEB0]" />
                                      {formatTime12Hour(record.timeIn)}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-5 py-5 text-white">
                                  {record.timeOut ? (
                                    <span className="flex items-center gap-2">
                                      <LogOut className="h-[18px] w-[18px] text-red-400" />
                                      {formatTime12Hour(record.timeOut)}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-5 py-5">
                                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
                                    {attendanceStatusLabel(recStatus.label)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2 text-xs text-white/40">
                    {t("pageOfLabel")} {attendanceCurrentPage} {t("ofPagesLabel")} {Math.max(1, attendanceTotalPages)} • {paginatedAttendance.length} {t("recordsShownLabel")}
                  </p>

                  {/* PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
                  <div className="flex justify-end mt-4">
                    {attendanceTotalPages > 1 && (detailSwitching || attendanceFiltering ? null : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { flashDetail(); setAttendanceCurrentPage(p => Math.max(1, p - 1)); }}
                            disabled={attendanceCurrentPage === 1}
                            className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                          >
                            ←
                          </button>
                          <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
                            {attendanceCurrentPage}
                          </span>
                          <button
                            onClick={() => { flashDetail(); setAttendanceCurrentPage(p => Math.min(attendanceTotalPages, p + 1)); }}
                            disabled={attendanceCurrentPage === attendanceTotalPages}
                            className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                          >
                            →
                          </button>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "inventory" && (
                <div className="space-y-5">
                  {eventInventoryLoading || detailSwitching ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
                      {[0, 1, 2].map((k) => <Skeleton key={k} className="h-16 w-full rounded-xl" />)}
                    </div>
                  ) : eventInventory.items.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/55">
                      {t("eventInventoryEmpty")}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {([
                          { key: "borrowed", label: t("eventInventoryBorrowed"), value: eventInventory.items.reduce((a, r) => a + r.total, 0), bg: "bg-sage-700", Icon: Package },
                          { key: "out", label: t("eventInventoryStillOut"), value: eventInventory.items.reduce((a, r) => a + r.out, 0), bg: "bg-gold-600", Icon: Clock },
                          { key: "back", label: t("eventInventoryReturned"), value: eventInventory.items.reduce((a, r) => a + r.returned, 0), bg: "bg-sage-800", Icon: CheckCircle2 },
                        ] as const).map(({ key, label, value, bg, Icon }) => (
                          <div key={key} className={`rounded-2xl ${bg} px-5 py-5 flex items-center gap-4`}>
                            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-white/20">
                              <Icon className="h-6 w-6 text-white" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold uppercase tracking-wide text-white/85">{label}</p>
                              <p className="text-3xl font-black text-white leading-none mt-1">{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        {eventInventory.items.map((row) => {
                          const pct = row.total > 0 ? Math.round((row.returned / row.total) * 100) : 0;
                          return (
                            <div key={row.inventory_item_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                              <div className="flex flex-wrap items-center gap-3">
                                {row.photo_url ? (
                                  <button
                                    type="button"
                                    onClick={() => setInvPhoto({ url: row.photo_url!, name: tc(row.name, language as any), urls: [row.photo_url!] })}
                                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 hover:border-[#4FBEB0]/60 transition"
                                  >
                                    <img src={row.photo_url} alt={row.name} className="h-full w-full object-cover" />
                                    <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur"><Eye className="h-3 w-3" /></span>
                                  </button>
                                ) : (
                                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15">
                                    <Package className="h-6 w-6 text-[#7DD8CB]" />
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-bold text-white truncate">{tc(row.name, language as any)}</p>
                                  <p className="text-xs text-white/50">
                                    {t("eventInventoryReturned")}: <span className="font-bold text-white">{row.returned}</span> / {row.total}
                                  </p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  row.status === "returned" ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : row.status === "partial" ? "bg-gold-400/15 text-gold-300" : "bg-[#8A3D2C]/25 text-[#E2A088]"
                                }`}>
                                  {row.status === "returned" ? t("eventInventoryStatusReturned") : row.status === "partial" ? t("eventInventoryStatusPartial") : t("eventInventoryStatusBorrowed")}
                                </span>
                              </div>

                              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-[#4FBEB0] transition-all" style={{ width: `${pct}%` }} />
                              </div>

                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {([["out", t("eventInventoryStillOut")], ["returned", t("eventInventoryReturned")]] as const).map(([k, title]) => {
                                  const units = k === "out" ? row.out_units : row.returned_units;
                                  const total = k === "out" ? row.out : row.returned;
                                  return (
                                    <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold uppercase tracking-wide text-white/55">{title}</p>
                                        <p className="text-sm font-bold text-white">{total}</p>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[26px]">
                                        {total === 0 ? (
                                          <span className="text-sm text-white/40">{k === "out" ? t("eventInventoryNoneOut") : t("eventInventoryNoneBack")}</span>
                                        ) : (
                                          BORROW_CONDITIONS.filter((c) => (units[c.label.replace("condition", "")] ?? 0) > 0).map((c) => (
                                            <span key={c.key} className={`rounded-full px-3 py-1 text-xs font-semibold ${c.chip}`}>
                                              {units[c.label.replace("condition", "")]} {t(c.label)}
                                            </span>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {eventInventory.returns.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                          <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#7DD8CB] mb-3">{t("eventInventoryReturnLog")}</h3>
                          <div className="space-y-3">
                            {eventInventory.returns.map((r) => {
                              const photos = r.evidence_photo_urls ?? [];
                              const itemName = tc(r.name, language as any);
                              return (
                                <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-start gap-4">
                                  {r.photo_url ? (
                                    <button
                                      type="button"
                                      onClick={() => setInvPhoto({ url: r.photo_url!, name: itemName, urls: [r.photo_url!] })}
                                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 hover:border-[#4FBEB0]/60 transition"
                                    >
                                      <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" />
                                    <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur"><Eye className="h-3 w-3" /></span>
                                    </button>
                                  ) : (
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15">
                                      <Package className="h-6 w-6 text-[#7DD8CB]" />
                                    </span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                      <p className="text-base font-bold text-white truncate">{r.quantity}&times; {itemName}</p>
                                      <span className="text-xs text-white/45">
                                        {r.released_by ? `${r.released_by} \u00b7 ` : ""}{new Date(r.released_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      {BORROW_CONDITIONS.filter((c) => (r.units[c.label.replace("condition", "")] ?? 0) > 0).map((c) => (
                                        <span key={c.key} className={`rounded-full px-3 py-1 text-xs font-semibold ${c.chip}`}>
                                          {r.units[c.label.replace("condition", "")]} {t(c.label)}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="mt-3">
                                      <p className="text-xs font-bold uppercase tracking-wide text-white/45 mb-1.5">{t("evidencePhotoLabel")}</p>
                                      {photos.length === 0 ? (
                                        <span className="text-sm text-white/40">{t("eventInventoryNoPhoto")}</span>
                                      ) : (
                                        <div className="relative inline-block shrink-0">
                                          <div className="h-11 w-11 rounded-full overflow-hidden border border-white/15">
                                            <img src={photos[0]} alt="" className="h-full w-full object-cover" />
                                          </div>
                                          {photos.length > 1 && (
                                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#4FBEB0] text-[#0A0E1A] text-[10px] font-bold flex items-center justify-center">
                                              {photos.length}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => setInvPhoto({ url: photos[0], name: `${itemName} \u00b7 ${t("evidencePhotoLabel")}`, urls: photos })}
                                            title={t("viewPhotoLabel")}
                                            className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#0A0E1A] border border-white/20 text-white/60 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
                                          >
                                            <Eye className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {detailTab === "budget" && (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
                  <EventBudgetWorkspace
                    event={viewEv}
                    showHeader={false}
                    onSummary={handleBudgetSummary}
                    reloadToken={String(viewEv.approvedBudget ?? "")}
                  />
                </div>
              )}

              {detailTab === "feedback" && (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2.5">
                    {([
                      { key: "ratings", label: t("absTabRatings"), count: eventFeedback.length },
                      { key: "reasons", label: t("absTabReasons"), count: eventAbsences.length },
                    ] as const).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setFeedbackSubTab(tab.key)}
                        className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition ${
                          feedbackSubTab === tab.key ? "bg-sage-700 text-white shadow-sm" : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        {tab.label}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${feedbackSubTab === tab.key ? "bg-white/20" : "bg-white/10"}`}>{tab.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className={feedbackSubTab === "ratings" ? "space-y-5" : "hidden"}>
                  {feedbackLoading || detailSwitching ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 flex flex-col items-center">
                      <Skeleton className="h-10 w-16" />
                      <Skeleton className="mt-2 h-3 w-28" />
                      <div className="mt-3 flex justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Skeleton key={n} className="h-5 w-5 rounded-md" />
                        ))}
                      </div>
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
                      <p className="text-4xl font-black text-white">{averageRating > 0 ? averageRating.toFixed(1) : "—"}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/45">{t("averageRatingLabel")}</p>
                      <div className="mt-2.5 flex justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => {
                          // Whole, half or empty star (4.5 -> four and a half).
                          const rounded = Math.round(averageRating * 2) / 2;
                          const fill = Math.max(0, Math.min(1, rounded - (n - 1)));
                          return (
                            <span key={n} className="relative inline-block h-5 w-5">
                              <Star className="absolute inset-0 h-5 w-5 text-white/15" />
                              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                                <Star className="h-5 w-5 max-w-none text-amber-400 fill-amber-400" />
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-xs text-white/45">{eventFeedback.length} {t("ratingsCountLabel")}</p>
                    </div>
                  )}

                  {feedbackLoading || detailSwitching ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-start gap-3">
                          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/4" />
                            <Skeleton className="h-3 w-4/5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : eventFeedback.length === 0 ? (
                    <p className="text-sm text-white/40 italic bg-white/[0.03] rounded-2xl p-6 text-center">{t("noFeedbackYetLabel")}</p>
                  ) : (
                    <div className="space-y-2">
                      {paginatedFeedback.map((f) => {
                        const name = f.user ? `${f.user.first_name} ${f.user.last_name}` : t("unknownItemLabel");
                        const initials = f.user ? `${f.user.first_name?.charAt(0) ?? ""}${f.user.last_name?.charAt(0) ?? ""}` : "?";
                        return (
                          <div key={f.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            {/* <FeedbackComment
                              role="staff"
                              kind="rating"
                              item={f}
                              author={f.user ?? null}
                              comment={f.comment}
                              header={
                                <span className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? "text-amber-400 fill-amber-400" : "text-white/15"}`} />
                                  ))}
                                </span>
                              }
                              onChange={(patch) => setEventFeedback((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))}
                            /> */}
                            <FeedbackComment
                              entry={f}
                              role="staff"
                              member={f.user ?? null}
                              onChange={(patch) => setEventFeedback((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))}
                            />
                          </div>
                        );
                      })}

                      <p className="mt-2 text-xs text-white/40">
                        {t("pageOfLabel")} {feedbackCurrentPage} {t("ofPagesLabel")} {feedbackTotalPages} • {eventFeedback.length} {t("recordsShownLabel")}
                      </p>

                      {/* PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
                      <div className="flex justify-end mt-4">
                        {feedbackTotalPages > 1 && (detailSwitching ? null : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { flashDetail(); setFeedbackCurrentPage(p => Math.max(1, p - 1)); }}
                                disabled={feedbackCurrentPage === 1}
                                className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                              >
                                ←
                              </button>
                              <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
                                {feedbackCurrentPage}
                              </span>
                              <button
                                onClick={() => { flashDetail(); setFeedbackCurrentPage(p => Math.min(feedbackTotalPages, p + 1)); }}
                                disabled={feedbackCurrentPage === feedbackTotalPages}
                                className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                              >
                                →
                              </button>
                            </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>

                  {feedbackSubTab === "reasons" && (
                    <div className="space-y-4">
                      {eventAbsences.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{t("absSummary")}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(eventAbsences.reduce<Record<string, number>>((acc, r) => { acc[r.reason] = (acc[r.reason] ?? 0) + 1; return acc; }, {}))
                              .sort((a, b) => b[1] - a[1])
                              .map(([reason, n]) => (
                                <span key={reason} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-sm text-white">
                                  {t(`absReason_${reason}`)}
                                  <span className="rounded-full bg-[#4FBEB0]/20 px-2 py-0.5 text-xs font-bold text-[#7DD8CB]">{n}</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                      {eventAbsences.length === 0 ? (
                        <p className="text-sm text-white/40 italic bg-white/[0.03] rounded-2xl p-6 text-center">{t("absNoneYet")}</p>
                      ) : (
                        <div className="space-y-2">
                          {eventAbsences.map((r) => {
                            const name = r.user ? `${r.user.first_name} ${r.user.last_name}` : t("unknownItemLabel");
                            const initials = r.user ? `${r.user.first_name?.charAt(0) ?? ""}${r.user.last_name?.charAt(0) ?? ""}` : "?";
                            return (
                              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                {/* <FeedbackComment
                                  role="staff"
                                  kind="absence"
                                  item={r}
                                  author={r.user ?? null}
                                  comment={r.comment}
                                  header={<span className="inline-block rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-0.5 text-xs font-semibold text-gold-300">{t(`absReason_${r.reason}`)}</span>}
                                  onChange={(patch) => setEventAbsences((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                                /> */}
                                <FeedbackComment
                                  entry={r}
                                  role="staff"
                                  member={r.user ?? null}
                                  onChange={(patch) => setEventAbsences((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          );
        })()
      ) : (
        <>
          {/* Full-bleed dark navy wrapper -- matches the Dashboard/Residents/
              Households/Memberships background and palette. The Add/Edit
              Event modal further down stays in the original light theme,
              same scoping used on those pages. */}
          <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
          <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("events")}</h1>
              <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("eventsPageSubtitle")}</p>
            </div>
            <button
              type="button"
              onClick={openAddEventModal}
              disabled={openSkeleton || loading || pageSwitching}
              className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2 py-2 text-base font-semibold text-white shadow-sm transition-all duration-500 ease-out hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:shadow-md shrink-0 disabled:pointer-events-none disabled:opacity-50"
            >
              {t("postEvent")}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-500 ease-out group-hover:bg-white/15">
                <Plus className="h-5 w-5 text-white" />
              </span>
            </button>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
            <QuickTabs
              value={eventTab}
              onChange={(k) => setEventTab(k as typeof eventTab)}
              tabs={[
                { key: "all", label: t("tabAll"), count: countsLoading ? 0 : eventTabCounts.all },
                { key: "today", label: t("tabToday"), count: countsLoading ? 0 : eventTabCounts.today },
                { key: "week", label: t("tabThisWeek"), count: countsLoading ? 0 : eventTabCounts.week },
                { key: "feedback", label: t("tabNeedsFeedback"), count: countsLoading ? 0 : eventTabCounts.feedback },
              ]}
            />
            <FilterBar
              search={{ value: eventSearch, onChange: setEventSearch, placeholder: t("searchEventsPlaceholder") }}
              filters={[
                {
                  key: "status", label: t("statusColumn"), value: eventFilter, onChange: setEventFilter,
                  options: [
                    { value: "all", label: `${t("allEvents")} (${countsLoading ? 0 : statusCounts.all})` },
                    { value: "ongoing", label: `${t("ongoingEvents")} (${countsLoading ? 0 : statusCounts.ongoing})` },
                    { value: "upcoming", label: `${t("upcomingEvents")} (${countsLoading ? 0 : statusCounts.upcoming})` },
                    { value: "past", label: `${t("pastEvents")} (${countsLoading ? 0 : statusCounts.past})` },
                  ],
                },
                {
                  key: "membership", label: t("fltMembership"), value: membershipFilter, onChange: setMembershipFilter, searchable: true, minWidthClass: "min-w-[220px]",
                  icon: <Users className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />,
                  options: [
                    { value: "all", label: t("allMembershipsOption") },
                    ...memberships.slice().sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))).map((m: any) => ({ value: String(m.id), label: m.name })),
                  ],
                },
              ]}
              sort={{
                value: eventSort, onChange: setEventSort,
                options: [
                  { value: "default", label: t("sortEventDefault") },
                  { value: "soonest", label: t("sortEventSoonest") },
                  { value: "latest", label: t("sortEventLatest") },
                  { value: "name-az", label: t("sortNameAZ") },
                ],
              }}
              count={{ shown: countsLoading ? 0 : filteredEvents.length, total: countsLoading ? 0 : localEvents.length }}
              extraChips={[
                ...(eventTab !== "all" ? [{ key: "tab", label: eventTab === "today" ? t("tabToday") : eventTab === "week" ? t("tabThisWeek") : t("tabNeedsFeedback"), onRemove: () => setEventTab("all") }] : []),
                ...(selectedDate ? [{ key: "date", label: `${t("fltDateChip")}: ${new Date(selectedDate).toLocaleDateString(language === "tl" ? "fil-PH" : language === "ceb" ? "fil-PH" : "en-PH", { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => setSelectedDate("") }] : []),
              ] as ExtraChip[]}
              onClearExtras={() => { setSelectedDate(""); setEventTab("all"); }}
            >
              <div className="h-11 shrink-0">
                <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 pl-4 pr-4 py-2.5" dark />
              </div>
            </FilterBar>
          </div>

          <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/40">
              {t("showingLabel")} {itemsPerPage} {t("perPage")}
            </p>
            {totalPages > 1 && ((openSkeleton || filterSwitching || loading) ? null : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                >
                  ←
                </button>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-700 text-sm font-bold text-white shadow-sm">
                  {currentPage}
                </span>
                <button
                  onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                >
                  →
                </button>
              </div>
            ))}
          </div>

          <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
          {loading || pageSwitching || openSkeleton ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.04] py-5 pl-7 pr-5">
                    <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                      <Skeleton className="mt-3 h-3 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-3/5" />
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : paginatedEvents.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-sm text-white/50">
              {t("noEventsMatchStaff")}
            </div>
          ) : (
            <div className="space-y-8">
              {(["Ongoing", "Upcoming", "Past"] as const).map((sectionKey) => {
                const items = paginatedEvents.filter((ev) => getEventStatus(ev).label === sectionKey);
                if (items.length === 0) return null;
                const meta = STATUS_META[sectionKey];
                return (
                  <section key={sectionKey}>
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className={`h-2 w-2 rounded-full ${meta.dot} ${sectionKey === "Ongoing" ? "animate-pulse" : ""}`} />
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${meta.text}`}>{eventStatusLabel(sectionKey)}</h3>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">{statusCounts[sectionKey.toLowerCase() as "ongoing" | "upcoming" | "past"]}</span>
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] text-white/35">{t(meta.hint)}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {items.map((e) => {
                        const status = getEventStatus(e);
                        const locked = isEventLocked(status.label);
                        const eligibleMembers = getMembersForEvent(e);
                        const attendanceList = getFullAttendanceList(e.id, eligibleMembers);
                        const signedIn = attendanceList.filter((a: any) => a.timeIn || a.timeOut).length;
                        const startDt = parseEventDateTime(e.event_start) ?? parseEventDateTime(e.date) ?? parseEventDateTime(e.startDate);
                        const rel = relativeLabel(e, status.label);

                        return (
                          <div
                            key={e.id}
                            onClick={() => setViewEv(e)}
                            className="group relative flex cursor-pointer gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-6 pr-4 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06]"
                          >
                            <span className={`absolute inset-y-0 left-0 w-1.5 ${meta.accent}`} />

                            <div className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl bg-white/10">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#7DD8CB]">
                                {startDt ? startDt.toLocaleDateString(locale, { month: "short" }) : "—"}
                              </span>
                              <span className="mt-0.5 text-2xl font-bold leading-none text-white">{startDt ? startDt.getDate() : "—"}</span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h2 className="min-w-0 break-words text-base font-bold leading-snug text-white">
                                  {highlightText(tc(e.title, language as any), eventSearch)}
                                </h2>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); startEditEvent(e); }}
                                    disabled={isSubmitting || locked}
                                    title={locked ? (status.label === "Ongoing" ? t("ongoingEventLockedHint") : t("pastEventLockedHint")) : t("editTitle")}
                                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); setEventToDelete(e.id); }}
                                    disabled={locked}
                                    title={locked ? (status.label === "Ongoing" ? t("ongoingEventLockedHint") : t("pastEventLockedHint")) : t("deleteTitle")}
                                    className="rounded-full p-1.5 text-white/50 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Archive className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {rel && <p className={`mt-0.5 text-xs font-semibold ${meta.text}`}>{rel}</p>}

                              <p className="mt-2.5 flex items-center gap-2 text-sm text-white/55">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                                <span className="truncate">{highlightText(tc(e.location, language as any), eventSearch)}</span>
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-sm text-white/55">
                                <Clock className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                                <span className="truncate">
                                  {(e.startDate && e.endDate ? (e.startDate === e.endDate ? e.startDate : `${e.startDate} - ${e.endDate}`) : e.date || "")} · {formatTime12Hour(e.startTime)}{e.endTime ? ` – ${formatTime12Hour(e.endTime)}` : ""}
                                </span>
                              </p>

                              <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/10 pt-3.5 text-[13px] text-white/50">
                                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {signedIn} {t("attendeesCountLabel")}</span>
                                <span className="truncate font-medium" title={getCoverageLabel(e)}>{getCoverageLabel(e)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          </div>
          </div>
        </>
      )}

      {/* Add / Edit Event Page -- right-anchored slide-over drawer, same
          mechanic as the Residents Profile slide-over (dimmed backdrop,
          slides in from the right edge, ~half the page wide) instead of a
          full content-area take-over. Same dark background + logo
          watermark, same title/back link treatment, same section header
          and input styling, same full-width Save button inside -- only the
          outer positioning/animation changed. Same fields, same handlers. */}
      {formOpen && createPortal(
        <>
          <style>{`
            @keyframes eventFormSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
            .event-form-slide-in { animation: eventFormSlideIn 280ms ease-out; }
          `}</style>
          <SlideOutGhost />
          <div className="fixed inset-0 bg-black/80 z-50" onClick={closeEventModal} />
          <div className="resident-form-panel event-form-slide-in fixed inset-y-0 right-0 z-50 w-full sm:w-1/2 bg-[#0A0E1A] border-l border-white/10 shadow-2xl overflow-y-auto">
          <img
            src="/logo-removebg-preview.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none fixed z-0 bottom-[-4rem] right-[-4rem] h-[28rem] w-[28rem] sm:h-[40rem] sm:w-[40rem] object-contain opacity-[0.06]"
          />

          <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pb-0 pt-10 sm:px-12 sm:pt-14">
            <button
              type="button"
              onClick={closeEventModal}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 text-base font-semibold text-white hover:opacity-70 transition mb-8 disabled:opacity-50"
            >
              <ArrowLeft className="h-5 w-5" /> {t("cancelLabel")}
            </button>

            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white text-center tracking-tight">
              {editingEvent ? t("editEventTitle") : t("createNewEvent")}
            </h1>
            <p className="mt-3 text-base text-white/60 text-center max-w-md mx-auto">
              {editingEvent ? t("editEventModalSubtitle") : t("newEventModalSubtitle")}
            </p>

            <form onSubmit={handleSaveEvent} noValidate className="mt-10 flex flex-1 flex-col space-y-10">
              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("eventDetailsLabel")}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("eventTitleRequired")}</label>
                    <input
                      type="text"
                      required
                      value={newEvent.title}
                      placeholder={t("eventTitlePlaceholder")}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      className="w-full rounded-full border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("dateRequired")}</label>
                    <DatePicker
                      value={newEvent.date}
                      onChange={(iso) => setNewEvent({ ...newEvent, date: iso })}
                      className="px-5 py-3.5"
                      min={getTodayString()}
                      required
                      dark
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("startTimeRequired")}</label>
                      <TimePicker required value={newEvent.time} onChange={(v) => handleTimeFieldChange("time", v)} className="px-5 py-3.5" error={!!timeFieldErrors.time} dark />
                      {timeFieldErrors.time && <p className="mt-1 text-sm text-red-400">{timeFieldErrors.time}</p>}
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-white mb-1.5">{t("endTimeLabel")}</label>
                      <TimePicker required value={newEvent.endTime} onChange={(v) => handleTimeFieldChange("endTime", v)} className="px-5 py-3.5" error={!!timeFieldErrors.endTime} dark />
                      {timeFieldErrors.endTime && <p className="mt-1 text-sm text-red-400">{timeFieldErrors.endTime}</p>}
                    </div>
                  </div>

                  {/* Call time: sign-in/out attendance window, separate from the event's own start/end */}
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-white/50">{t("callTimeSectionTitle")}</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">{t("callTimeStartLabel")}</label>
                        <TimePicker required value={newEvent.callTimeStart} onChange={(v) => handleTimeFieldChange("callTimeStart", v)} className="px-5 py-3.5" error={!!timeFieldErrors.callTimeStart} dark />
                        {timeFieldErrors.callTimeStart && <p className="mt-1 text-sm text-red-400">{timeFieldErrors.callTimeStart}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">{t("callTimeEndLabel")}</label>
                        <TimePicker required value={newEvent.callTimeEnd} onChange={(v) => handleTimeFieldChange("callTimeEnd", v)} className="px-5 py-3.5" error={!!timeFieldErrors.callTimeEnd} disabled={!newEvent.endTime} title={!newEvent.endTime ? t("setEndTimeFirstHint") : undefined} dark />
                        {timeFieldErrors.callTimeEnd && <p className="mt-1 text-sm text-red-400">{timeFieldErrors.callTimeEnd}</p>}
                      </div>
                    </div>
                    <p className="text-sm text-white/50">{t("callTimeHint")}</p>
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("locationRequired")}</label>
                    <input type="text" required value={newEvent.location} placeholder={t("locationPlaceholder")} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} className="w-full rounded-full border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70" />
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-bold uppercase tracking-wider text-white pb-3 border-b-2 border-white/40 mb-6">
                  {t("notificationBudgetLabel")}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("descriptionLabel")}</label>
                    <textarea value={newEvent.description} placeholder={t("descriptionPlaceholderEvent")} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full rounded-3xl border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 resize-none" rows={3} />
                  </div>
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("messageLabel")}</label>
                    <textarea value={newEvent.notificationMessage} placeholder={t("messagePlaceholder")} onChange={(e) => setNewEvent({ ...newEvent, notificationMessage: e.target.value })} className="w-full rounded-3xl border border-white/25 px-5 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 resize-none" rows={2} />
                  </div>
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("targetMembersRequired")}</label>
                    <div className="relative">
                      <FormSelect
                        value={newEvent.targetMembership}
                        onChange={(e) => setNewEvent({ ...newEvent, targetMembership: e.target.value })}
                        className="w-full appearance-none rounded-full border border-white/25 px-5 py-3.5 pr-11 text-base bg-white/10 text-white font-sans focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                      >
                        <option value="all" className="bg-[#0A0E1A] text-white">{t("allResidentsOption")}</option>
                        {memberships.map((m: any) => (<option key={m.id} value={String(m.id)} className="bg-[#0A0E1A] text-white">{m.name}</option>))}
                      </FormSelect>
                    </div>
                  </div>

                  {/* UC-8: Record Event Budget and Expenses */}
                  <div>
                    <label className="block text-base font-semibold text-white mb-1.5">{t("approvedBudgetOptional")}</label>
                    <NumberStepper
                      fullWidth
                      min={0}
                      step={0.01}
                      value={newEvent.approvedBudget}
                      onChange={(v) => setNewEvent({ ...newEvent, approvedBudget: v })}
                      placeholder={t("approvedBudgetPlaceholder")}
                      className="w-full rounded-full border border-white/25 pl-5 pr-8 py-3.5 text-base bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                    />
                    <p className="mt-1.5 text-sm text-white/60">{t("trackExpensesHint")}</p>
                  </div>

                  {/* Items borrowed from Inventory for this event -- excludes
                      Disposed/Lost stock (see InventoryController::borrowable()),
                      and deducts the chosen quantity from Inventory on save. */}
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-white/50" />
                      <p className="text-xs font-bold uppercase tracking-wide text-white/50">{t("borrowedItemsSectionTitle")}</p>
                    </div>

                    {newEvent.borrowedItems.length > 0 && (
                      <div className="space-y-2">
                        {newEvent.borrowedItems.map((row) => {
                          const total = Object.values(row.units).reduce((sum, v) => sum + (Number(v) || 0), 0);
                          return (
                            <div key={row.inventoryItemId} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">{getBorrowItemName(row.inventoryItemId)}</span>
                                <span className="shrink-0 text-xs text-white/60 [font-variant-numeric:tabular-nums]">
                                  {t("borrowTotalLabel")}: <span className="font-bold text-white">{total}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeBorrowRow(row.inventoryItemId)}
                                  className="text-white/50 hover:text-red-400 transition shrink-0"
                                  title={t("removeLabel")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {BORROW_CONDITIONS.map((c) => {
                                  const label = c.label.replace("condition", "");
                                  const max = availableUnitsFor(row.inventoryItemId, label);
                                  if (max <= 0) return null;
                                  return (
                                    <div key={c.key}>
                                      <span className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.chip}`}>{t(c.label)}</span>
                                      <div className="flex items-center gap-1.5">
                                        <NumberStepper
                                          min={0}
                                          max={max}
                                          value={row.units[label] ?? "0"}
                                          onChange={(raw) => updateBorrowUnits(row.inventoryItemId, label, raw)}
                                          className="w-16 rounded-full border border-white/20 bg-white/10 pl-2 pr-5 py-1 text-sm text-center text-white font-sans"
                                        />
                                        <span className="text-xs text-white/50 shrink-0">/ {max}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!borrowableItemsLoading && borrowableItems.filter((it) => it.quantity > 0).length === 0 ? (
                      <p className="text-sm text-white/50 italic">{t("noBorrowableItemsLabel")}</p>
                    ) : (
                      <SearchableSelect
                        onSelect={addBorrowRow}
                        disabled={borrowableItemsLoading}
                        placeholder={borrowableItemsLoading ? t("loadingLabel") : t("addBorrowedItemPlaceholder")}
                        noResultsLabel={t("noMatchingBorrowItemsLabel")}
                        options={borrowableItems
                          .filter((it) => it.quantity > 0)
                          .filter((it) => !newEvent.borrowedItems.some((r) => r.inventoryItemId === String(it.id)))
                          .map((it) => ({
                            value: String(it.id),
                            label: it.name,
                            hint: (() => {
                              const parts = BORROW_CONDITIONS.filter((c) => Number(it[c.key] ?? 0) > 0).map((c) => `${it[c.key]} ${t(c.label)}`);
                              return parts.length > 1 ? `(${it.quantity} ${t("availableStockShortLabel")}: ${parts.join(" · ")})` : `(${it.quantity} ${t("availableStockShortLabel")}${parts.length ? ` · ${t(BORROW_CONDITIONS.find((c) => Number(it[c.key] ?? 0) > 0)!.label)}` : ""})`;
                            })(),
                          }))}
                        dark
                      />
                    )}
                    <p className="text-sm text-white/50">{t("borrowedItemsHint")}</p>
                  </div>

                  {/* Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)" */}
                  {!editingEvent && (
                    <label className="flex items-center gap-2 cursor-pointer text-base">
                      <input
                        type="checkbox"
                        checked={newEvent.postToFacebook}
                        onChange={(e) => setNewEvent({ ...newEvent, postToFacebook: e.target.checked })}
                        className="w-5 h-5 text-[#4FBEB0]"
                      />
                      <span className="font-medium text-white">{t("alsoPostToFacebook")}</span>
                    </label>
                  )}
                </div>
              </section>

              <div className="!mt-auto" />
              <div className="sticky bottom-0 z-10 -mx-6 border-t border-white/10 bg-[#0A0E1A] px-6 py-4 sm:-mx-12 sm:px-12">
                <button
                  type="submit"
                  disabled={isSubmitting || isEventFormUnchanged}
                  title={isEventFormUnchanged ? t("noChangesToSaveHint") : undefined}
                  className={`group w-full inline-flex items-center justify-center gap-3 rounded-full border pl-6 pr-2 py-2 text-base font-semibold uppercase tracking-wide shadow-sm transition-all duration-500 ease-out ${
                    !isSubmitting && !isEventFormUnchanged
                      ? "border-[#1E3A5F] bg-[#1E3A5F] text-white hover:border-[#122436] hover:bg-[#122436] hover:shadow-md"
                      : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? t("savingLabel") : (editingEvent ? t("updateEvent") : t("postEvent"))}
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ease-out ${
                      !isSubmitting && !isEventFormUnchanged ? "bg-[#0A0E1A] group-hover:bg-white/15" : "bg-white/5"
                    }`}
                  >
                    <Save className={`h-5 w-5 ${!isSubmitting && !isEventFormUnchanged ? "text-white" : "text-white/20"}`} />
                  </span>
                </button>
              </div>
            </form>
          </div>
          </div>
        </>,
      document.body)}

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

      {/* Delete Event Confirm Modal */}
      {eventToDelete !== null && (
        <Portal><div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="mb-4 text-red-400 flex justify-center"><Trash2 size={36} /></div>
            <h3 className="text-lg font-bold text-red-400 mb-2">{t("confirmDeletionTitle")}</h3>
            <p className="text-[15px] text-white/50 mb-6">{t("confirmDeletionBody")}</p>
            <div className="flex justify-center gap-3">
              <button onClick={cancelDelete} className="px-5 py-2 rounded-full border border-white/15 text-white hover:bg-white/10 transition">{t("cancelLabel")}</button>
              <button onClick={confirmDelete} className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition">{t("yesDelete")}</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Result popups -- every Add / Update / Delete lands on one of these. */}
      <StatusModal
        open={showSuccessModal}
        type="success"
        title={t("successTitle")}
        message={successMessage}
        okLabel={t("okLabel")}
        onClose={() => setShowSuccessModal(false)}
        z={9999}
      />
      <StatusModal
        open={showErrorModal}
        type="error"
        title={t("errorTitle")}
        message={errorMessage}
        okLabel={t("okLabel")}
        onClose={() => setShowErrorModal(false)}
        z={9999}
      />
      <StatusModal
        open={deleteErrorMessage !== null}
        type="error"
        title={t("errorTitle")}
        message={deleteErrorMessage ?? ""}
        okLabel={t("okLabel")}
        onClose={() => setDeleteErrorMessage(null)}
        z={9999}
      />
      {invPhoto && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10001] px-4"
          onClick={() => setInvPhoto(null)}
        >
          <div
            className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] text-[11px] font-bold uppercase tracking-wide px-3 py-1 shrink-0">
                  <Eye className="h-3 w-3" />
                  {t("viewPhotoLabel")}
                </span>
                <span className="text-sm font-medium text-white truncate">{invPhoto.name}</span>
              </div>
              <button onClick={() => setInvPhoto(null)} className="text-white/50 hover:text-white p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative flex-1 overflow-auto bg-black/40 flex items-center justify-center p-6">
              <img src={invPhoto.url} alt={invPhoto.name} className="max-w-full max-h-[65vh] rounded-xl shadow-2xl" />
              {invPhoto.urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => stepInvPhoto(-1)}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepInvPhoto(1)}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white/80">
                    {Math.max(0, invPhoto.urls.indexOf(invPhoto.url)) + 1} / {invPhoto.urls.length}
                  </span>
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              {invPhoto.urls.length > 1 ? (
                <div className="flex items-center gap-2">
                  {invPhoto.urls.map((u, i) => (
                    <button
                      key={u + i}
                      type="button"
                      onClick={() => setInvPhoto({ ...invPhoto, url: u })}
                      className={`h-10 w-10 overflow-hidden rounded-lg border transition ${u === invPhoto.url ? "border-[#7DD8CB]" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <button
                onClick={() => setInvPhoto(null)}
                className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold transition"
              >
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
