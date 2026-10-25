import KpiCard from "../../../components/ui/KpiCard";
import { scrollListIntoView } from "../../../lib/scrollToList";
import SaveButton from "../../../components/ui/SaveButton";
import FormDrawer, { FormSection } from "../../../components/ui/FormDrawer";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import { matchesSearch } from "../../../lib/search";
import { highlightMatches } from "../../../lib/highlight";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Undo2, CheckCircle2, PackageX, X, RotateCcw, Pencil, Search, Package, Clock, History, Camera, Eye, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import api, { apiErrorMessage } from "../../../lib/api";
import DatePicker from "../../../components/ui/DatePicker";
import FilterBar from "../../../components/ui/FilterBar";
import NumberStepper from "../../../components/ui/NumberStepper";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import PhotoGallery, { PhotoItem, photoItemsFromUrls, appendPhotoFields, photoItemsChanged } from "../../../components/ui/PhotoGallery";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import StatCardSkeleton, { usePageOpenSkeleton } from "../../../components/ui/StatCardSkeleton";

import { tc } from "../../../lib/contentTranslations";
import PagerSkeleton from "../../../components/ui/PagerSkeleton";
interface OverdueEventItem {
  id: number;
  name: string;
  quantity: number;
  // Units still out, per condition (New / Good / Fair / Poor).
  units?: Record<string, number>;
}

// Conditions a returned unit can come back in -- staff pick how many of each.
const RETURN_CONDITIONS = [
  { label: "New", key: "conditionNew", chip: "bg-[#4FBEB0]/20 text-[#7DD8CB]" },
  { label: "Good", key: "conditionGood", chip: "bg-[#4FBEB0]/10 text-[#7DD8CB]" },
  { label: "Fair", key: "conditionFair", chip: "bg-gold-400/15 text-gold-300" },
  { label: "Poor", key: "conditionPoor", chip: "bg-[#8A3D2C]/25 text-[#E2A088]" },
] as const;

const sumUnits = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + (Number(b) || 0), 0);

// What is still out after `returned` came back: the same conditions first,
// then the largest remaining one -- mirrors HasConditionUnits::takeOutMatching.
const remainingAfterReturn = (out: Record<string, number>, returned: Record<string, number>): Record<string, number> => {
  const now: Record<string, number> = { ...out };
  let left = 0;
  Object.entries(returned).forEach(([label, n]) => {
    const cut = Math.min(Number(n) || 0, now[label] ?? 0);
    now[label] = (now[label] ?? 0) - cut;
    left += (Number(n) || 0) - cut;
  });
  Object.keys(now).sort((a, b) => now[b] - now[a]).forEach((label) => {
    if (left <= 0) return;
    const cut = Math.min(left, now[label]);
    now[label] -= cut;
    left -= cut;
  });
  return now;
};

interface OverdueEvent {
  id: number;
  name: string;
  ended_at: string;
  items: OverdueEventItem[];
}

interface RecentRelease {
  id: number;
  event_id: number;
  event_name: string;
  item_name: string;
  quantity: number;
  // Condition each returned unit came back in.
  units?: Record<string, number>;
  // Most this release can be raised to: already released + still borrowed.
  max_quantity: number;
  // Most of each condition this return can hold: already returned + still out.
  max_units?: Record<string, number>;
  released_by: string | null;
  released_at: string;
  evidence_photo_url: string | null;
  // Every evidence photo, cover first.
  evidence_photo_urls: string[];
}

const ITEMS_PER_PAGE = 6;
const RELEASES_PER_PAGE = 5;

// Events that have already ended but still hold borrowed inventory --
// nothing in the system releases these on its own (see
// EventController::overdueBorrows / releaseBorrowedItem). This page is
// the dedicated home for that queue; the Dashboard only shows a short
// summary that links back here.
export default function ReturnsView() {
  const { t, locale, language } = useLanguage();
  const [events, setEvents] = useState<OverdueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Page-open skeleton for the KPI strip (first load only -- never returns on polls).
  const statsLoading = usePageOpenSkeleton(loading);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [endedDate, setEndedDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash on every page switch, same as Activity Logs --
  // this table paginates client-side so there's nothing to actually wait
  // on, but the flash keeps page switches feeling consistent app-wide.
  const [pageSwitchingRaw, setPageSwitching] = useState(false);
  const filterSwitching = useFilterSwitching([search, endedDate]);
  const pageSwitching = pageSwitchingRaw || filterSwitching;
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTopRef = useRef<HTMLSpanElement | null>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    scrollListIntoView(listTopRef.current);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
  // Which of the two panels is showing. They are two stages of ONE flow:
  // Pending Returns (borrowed items still out) -> Release (with evidence
  // photo) -> Recently Released (logged as returned to Inventory). A wrong entry
  // is fixed right there with Edit (quantity / replace photo); lowering the
  // quantity sends the difference straight back to Pending.
  const [activeTab, setActiveTab] = useState<"pending" | "released">("pending");
  // Switching panels flashes the skeleton briefly, same as a page switch.
  const switchTab = (tab: "pending" | "released") => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  // Highlights for the "where did it go?" moment after a release / undo:
  // newly logged releases glow in Recently Released, and the event that
  // just received items back glows in Pending Returns.
  const [flashReleaseIds, setFlashReleaseIds] = useState<number[]>([]);
  const [flashEventIds, setFlashEventIds] = useState<number[]>([]);
  const [jumpToEventId, setJumpToEventId] = useState<number | null>(null);
  const knownReleaseIdsRef = useRef<Set<number>>(new Set());
  // Result popup shown after a release / edit, with a one-click jump to the
  // other half of the flow.
  const [flowToast, setFlowToast] = useState<{
    title: string;
    message: string;
    target: "pending" | "released";
    tone: "ok" | "warn";
  } | null>(null);
  // How many units to release per item, keyed by borrow-record id --
  // staff can give back fewer than the full borrowed quantity.
  // Per item: how many units come back in each condition (starts from what
  // was borrowed, so a plain return gives everything back as it went out).
  const [releaseUnits, setReleaseUnits] = useState<Record<number, Record<string, number>>>({});

  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [releasingItemId, setReleasingItemId] = useState<number | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<{ eventId: number; item: OverdueEventItem; qty: number } | null>(null);

  // Bulk release -- a checkbox per item (checked by default) plus one
  // "Release Selected" action, instead of making staff click "Release"
  // once per line for an event with many borrowed item types. Unchecking
  // an item leaves it out of the batch entirely (still borrowed, released
  // individually later) rather than forcing an all-or-nothing release.
  const [selectedItemIds, setSelectedItemIds] = useState<Record<number, boolean>>({});
  const [confirmReleaseAll, setConfirmReleaseAll] = useState(false);
  const [bulkReleasing, setBulkReleasing] = useState(false);

  // Evidence photo attached per borrowed item before it can be released --
  // required proof the item physically came back, same "required photo"
  // rule as Inventory items. Keyed by borrow-record id so Release Selected
  // (which releases several items in one batch) still needs one photo per
  // item, not one shared photo for the whole batch.
  // Evidence photos per borrowed item (up to 5 each), keyed by borrow row id.
  const [releasePhotos, setReleasePhotos] = useState<Record<number, PhotoItem[]>>({});
  // Full-size view of a photo -- either a freshly-chosen evidence photo or
  // an already-saved one from a past release/undo -- same modal (and same
  // "VIEW PHOTO" badge + card + gold Close button) as Inventory's own photo
  // viewer, for a consistent look across the app.
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string; urls?: string[] } | null>(null);
  // Prev/next through a record's photos (wraps around) + ←/→ keys, Esc closes.
  const stepViewingPhoto = (dir: 1 | -1) => {
    setViewingPhoto((cur) => {
      if (!cur || !cur.urls || cur.urls.length < 2) return cur;
      const i = Math.max(0, cur.urls.indexOf(cur.url));
      return { ...cur, url: cur.urls[(i + dir + cur.urls.length) % cur.urls.length] };
    });
  };
  useEffect(() => {
    if (!viewingPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") stepViewingPhoto(1);
      else if (e.key === "ArrowLeft") stepViewingPhoto(-1);
      else if (e.key === "Escape") setViewingPhoto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingPhoto]);

  // Recent releases -- lets staff catch and fix a mis-entered quantity
  // ("I meant to release 2, not 3") without touching Inventory's raw
  // stock count by hand. See EventController::recentReleases()/undoRelease().
  const [recentReleases, setRecentReleases] = useState<RecentRelease[]>([]);
  const [recentReleasesLoading, setRecentReleasesLoading] = useState(true);
  const [recentReleasesPage, setRecentReleasesPage] = useState(1);
  const [recentReleasesTotalPages, setRecentReleasesTotalPages] = useState(1);
  const [recentReleasesTotal, setRecentReleasesTotal] = useState(0);
  // The release being edited in the Edit Return modal -- fix the quantity
  // and/or replace the saved evidence photo in place.
  const [editTarget, setEditTarget] = useState<RecentRelease | null>(null);
  const [confirmEditSave, setConfirmEditSave] = useState(false);
  const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false);
  const [editUnits, setEditUnits] = useState<Record<string, number>>({ New: 0, Good: 0, Fair: 0, Poor: 0 });
  // A replacement photo, only when one was picked; otherwise the saved
  // photo is kept as-is (no new photo is ever demanded for an edit).
  const [editPhotos, setEditPhotos] = useState<PhotoItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  // "Move all back to Pending" -- reverses the whole release, no photo.
  const [confirmMoveBack, setConfirmMoveBack] = useState<RecentRelease | null>(null);

  // Real-time refresh -- the overdue-borrows queue can change any time
  // another staff member releases an item, so this polls quietly in the
  // background rather than relying on a manual refresh. `background`
  // skips the full-page spinner so the table doesn't flash/reset scroll
  // position every 20s; it's only shown on the very first load.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchOverdue = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await api.get("/events/overdue-borrows");
      setEvents(Array.isArray(response.data) ? response.data : []);
      setLastUpdated(new Date());
    } catch {
      if (!background) setError(t("loadReturnsFailed"));
    } finally {
      if (!background) setLoading(false);
    }
  };

  const fetchRecentReleases = async (page = recentReleasesPage, background = false, searchTerm = search, highlightNew = false) => {
    if (!background) setRecentReleasesLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const response = await api.get(`/events/borrowed-items/releases/recent?${params.toString()}`);
      const payload = response.data;
      const rows: RecentRelease[] = Array.isArray(payload?.data) ? payload.data : [];
      if (highlightNew) {
        const fresh = rows.filter((r) => !knownReleaseIdsRef.current.has(r.id)).map((r) => r.id);
        if (fresh.length > 0) setFlashReleaseIds(fresh);
      }
      rows.forEach((r) => knownReleaseIdsRef.current.add(r.id));
      setRecentReleases(rows);
      setRecentReleasesPage(payload?.current_page ?? 1);
      setRecentReleasesTotalPages(Math.max(1, payload?.last_page ?? 1));
      setRecentReleasesTotal(payload?.total ?? 0);
    } catch {
      // Silent -- this panel is a convenience, not the page's core data;
      // a failed refresh just leaves the previous list showing.
    } finally {
      if (!background) setRecentReleasesLoading(false);
    }
  };

  // The background poll needs to know, on every tick, whether a modal is
  // currently open (so it can skip refreshing under someone's feet) and
  // which release-panel page is showing -- but reading those directly
  // would mean re-running this whole effect (and its foreground,
  // spinner-showing fetches) every time the modal opens or closes, which
  // is exactly the "loading flashes every time I open/close the modal"
  // annoyance this replaced. A ref sidesteps that: it's kept up to date
  // every render without ever forcing the effect below to re-subscribe.
  const pollGateRef = useRef({ selectedEventId, confirmRelease, editTarget, confirmMoveBack, recentReleasesPage, search });
  useEffect(() => {
    pollGateRef.current = { selectedEventId, confirmRelease, editTarget, confirmMoveBack, recentReleasesPage, search };
  });

  useEffect(() => {
    // Foreground (spinner-showing) fetch -- intentionally only ever runs
    // once, on mount, not on every modal open/close. The Recently Released
    // panel's own first load is handled by the
    // debounced search effect below (it fires on mount too, since `search`
    // starts out defined).
    fetchOverdue();
    const poll = setInterval(() => {
      const gate = pollGateRef.current;
      if (gate.selectedEventId === null && gate.confirmRelease === null && gate.editTarget === null && gate.confirmMoveBack === null) {
        fetchOverdue(true);
        fetchRecentReleases(gate.recentReleasesPage, true, gate.search);
      }
    }, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsSinceUpdate = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated.getTime()) / 1000)) : null;
  const lastUpdatedLabel =
    secondsSinceUpdate === null
      ? ""
      : secondsSinceUpdate < 5
      ? t("updatedJustNowLabel")
      : secondsSinceUpdate < 60
      ? t("updatedSecondsAgoLabel").replace("{n}", String(secondsSinceUpdate))
      : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(secondsSinceUpdate / 60)));

  // Portfolio-wide KPIs across every overdue event currently queued --
  // gives staff the scale of the backlog before drilling into any one
  // event's line items.
  const stats = useMemo(() => {
    const totalUnits = events.reduce((sum, ev) => sum + ev.items.reduce((s, it) => s + it.quantity, 0), 0);
    const distinctItems = new Set<string>();
    events.forEach((ev) => ev.items.forEach((it) => distinctItems.add(it.name)));
    let oldestDays = 0;
    const now = Date.now();
    events.forEach((ev) => {
      const ended = new Date(ev.ended_at).getTime();
      if (!isNaN(ended)) {
        const days = Math.floor((now - ended) / (1000 * 60 * 60 * 24));
        if (days > oldestDays) oldestDays = days;
      }
    });
    return { totalEvents: events.length, totalUnits, distinctItems: distinctItems.size, oldestDays };
  }, [events]);

  const daysOverdue = (endedAt: string) => {
    const ended = new Date(endedAt).getTime();
    if (isNaN(ended)) return 0;
    return Math.max(0, Math.floor((Date.now() - ended) / (1000 * 60 * 60 * 24)));
  };

  // Ended-date range filter -- comparing plain "yyyy-mm-dd" slices keeps
  // this independent of time-of-day/timezone formatting.
  const filteredEvents = useMemo(() => {
    const q = search.trim();
    return events.filter((ev) => {
      if (q) {
        const matchesEvent = matchesSearch(q, ev.name);
        const matchesItem = ev.items.some((it) => matchesSearch(q, it.name));
        if (!matchesEvent && !matchesItem) return false;
      }
      if (endedDate && ev.ended_at.slice(0, 10) !== endedDate) return false;
      return true;
    });
  }, [events, search, endedDate]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEvents = filteredEvents.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, endedDate]);

  // The same search box also searches Recently Released
  // (by event or item name), same as it does for the table above --
  // debounced so typing doesn't fire a request per keystroke, and since
  // that panel is fetched page-by-page from the server (unlike the
  // table's in-memory filter), a new search always jumps back to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecentReleases(1, false, search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // After items move back to Pending, bring the event that just got its items back into view
  // (it may sit on another page of Pending Returns).
  useEffect(() => {
    if (jumpToEventId === null) return;
    const idx = filteredEvents.findIndex((ev) => ev.id === jumpToEventId);
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / ITEMS_PER_PAGE) + 1);
      setJumpToEventId(null);
    }
  }, [jumpToEventId, filteredEvents]);

  // Highlights only start fading once the person is actually looking at
  // the tab they point to.
  useEffect(() => {
    if (activeTab !== "released" || flashReleaseIds.length === 0) return;
    const timer = setTimeout(() => setFlashReleaseIds([]), 4500);
    return () => clearTimeout(timer);
  }, [activeTab, flashReleaseIds]);
  useEffect(() => {
    if (activeTab !== "pending" || flashEventIds.length === 0) return;
    const timer = setTimeout(() => setFlashEventIds([]), 4500);
    return () => clearTimeout(timer);
  }, [activeTab, flashEventIds]);
  const goToToastTarget = () => {
    if (!flowToast) return;
    setSelectedEventId(null);
    switchTab(flowToast.target);
    setFlowToast(null);
  };

  // From a Recently Released row: jump to that event's remaining items.
  const focusEventInPending = (eventId: number) => {
    setFlashEventIds([eventId]);
    setJumpToEventId(eventId);
    switchTab("pending");
  };

  const modalEvent = events.find((ev) => ev.id === selectedEventId) ?? null;

  const defaultUnits = (item: OverdueEventItem): Record<string, number> =>
    item.units && sumUnits(item.units) === item.quantity ? { New: 0, Good: 0, Fair: 0, Poor: 0, ...item.units } : { New: 0, Good: item.quantity, Fair: 0, Poor: 0 };
  const unitsFor = (item: OverdueEventItem) => releaseUnits[item.id] ?? defaultUnits(item);
  const qtyFor = (item: OverdueEventItem) => sumUnits(unitsFor(item));

  // Each condition is capped so the total never exceeds what is still out.
  const setUnitFor = (item: OverdueEventItem, label: string, value: number) => {
    const current = unitsFor(item);
    const others = sumUnits(current) - (current[label] ?? 0);
    const clamped = Math.max(0, Math.min(item.quantity - others, Math.floor(value) || 0));
    setReleaseUnits((prev) => ({ ...prev, [item.id]: { ...current, [label]: clamped } }));
  };

  // Nothing is ticked when the dialog opens -- staff choose what to release
  // (or press Select All) so a bulk release is always deliberate.
  // A single-item event is ticked automatically -- there is nothing to choose.
  const isItemSelected = (item: OverdueEventItem) => selectedItemIds[item.id] ?? (modalEvent?.items.length === 1);
  // Fresh, unticked list every time a release dialog opens or closes.
  useEffect(() => { setSelectedItemIds({}); }, [selectedEventId]);

  const toggleItemSelected = (item: OverdueEventItem) => {
    setSelectedItemIds((prev) => ({ ...prev, [item.id]: !isItemSelected(item) }));
  };

  const selectedCount = modalEvent ? modalEvent.items.filter(isItemSelected).length : 0;
  const allItemsSelected = modalEvent ? modalEvent.items.length > 0 && modalEvent.items.every(isItemSelected) : false;
  // Every selected item needs its own evidence photo before a bulk release
  // can go through -- see the evidence photo strip on each row below.
  const selectedMissingPhoto = modalEvent
    ? modalEvent.items.filter(isItemSelected).some((it) => !(releasePhotos[it.id]?.length))
    : false;

  const toggleSelectAll = () => {
    if (!modalEvent) return;
    const next = !allItemsSelected;
    setSelectedItemIds((prev) => {
      const copy = { ...prev };
      modalEvent.items.forEach((it) => {
        copy[it.id] = next;
      });
      return copy;
    });
  };

  const setReleasePhotosFor = (itemId: number, items: PhotoItem[]) =>
    setReleasePhotos((prev) => ({ ...prev, [itemId]: items }));

  // Clears an item's evidence photos once its release went through.
  const removeReleasePhoto = (itemId: number) => {
    setReleasePhotos((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const releaseOneItem = async (eventId: number, item: OverdueEventItem, qty: number) => {
    const photos = (releasePhotos[item.id] ?? []).filter((p) => p.file);
    if (photos.length === 0 || qty <= 0) return;
    const returned = unitsFor(item);
    setConfirmRelease(null);
    setReleasingItemId(item.id);
    try {
      const fd = new FormData();
      fd.append("quantity", String(qty));
      Object.entries(returned).forEach(([label, n]) => fd.append(`conditions[${label}]`, String(n)));
      photos.forEach((p) => fd.append("photos[]", p.file as File));
      await api.post(`/events/${eventId}/borrowed-items/${item.id}/release`, fd);
      removeReleasePhoto(item.id);
      setEvents((prev) =>
        prev
          .map((ev) =>
            ev.id === eventId
              ? {
                  ...ev,
                  items: ev.items
                    .map((it) =>
                      it.id === item.id
                        ? { ...it, quantity: it.quantity - qty, units: remainingAfterReturn(defaultUnits(it), returned) }
                        : it
                    )
                    .filter((it) => it.quantity > 0),
                }
              : ev
          )
          .filter((ev) => ev.items.length > 0)
      );
      setReleaseUnits((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setFlowToast({
        title: t("returnSuccessTitle"),
        message: t("returnSuccessMessage").replace("{qty}", String(qty)).replace("{item}", tc(item.name, language as any)),
        target: "released",
        tone: "ok",
      });
      // The new release is always the newest, so it belongs on page 1
      // regardless of which page of the panel was showing before.
      fetchRecentReleases(1, true, search, true);
    } catch {
      setError(t("releaseItemsFailed"));
    } finally {
      setReleasingItemId(null);
    }
  };

  const releaseSelectedItems = async (event: OverdueEvent) => {
    setConfirmReleaseAll(false);
    // Snapshot which items are checked, their current Qty-field values, and
    // their attached evidence photo up front -- the in-flight requests
    // below will progressively mutate `events` (and therefore
    // modalEvent.items) as each one resolves. An item missing its photo is
    // left out entirely (the button above is disabled while any selected
    // item lacks one, so this is just a safety net).
    const jobs = event.items
      .filter(isItemSelected)
      .map((item) => ({ item, qty: qtyFor(item), returned: unitsFor(item), photos: (releasePhotos[item.id] ?? []).filter((p) => p.file) }))
      .filter((job) => job.photos.length > 0 && job.qty > 0);
    if (jobs.length === 0) return;
    setBulkReleasing(true);
    try {
      const results = await Promise.allSettled(
        jobs.map(({ item, qty, returned, photos }) => {
          const fd = new FormData();
          fd.append("quantity", String(qty));
          Object.entries(returned).forEach(([label, n]) => fd.append(`conditions[${label}]`, String(n)));
          photos.forEach((p) => fd.append("photos[]", p.file as File));
          return api.post(`/events/${event.id}/borrowed-items/${item.id}/release`, fd);
        })
      );
      const succeededIds = new Set(jobs.filter((_, i) => results[i].status === "fulfilled").map(({ item }) => item.id));
      const anyFailed = results.some((r) => r.status === "rejected");
      succeededIds.forEach((id) => removeReleasePhoto(id));

      setEvents((prev) =>
        prev
          .map((ev) =>
            ev.id === event.id
              ? {
                  ...ev,
                  items: ev.items
                    .map((it) => {
                      const job = jobs.find((j) => j.item.id === it.id);
                      return job && succeededIds.has(it.id)
                        ? { ...it, quantity: it.quantity - job.qty, units: remainingAfterReturn(defaultUnits(it), job.returned) }
                        : it;
                    })
                    .filter((it) => it.quantity > 0),
                }
              : ev
          )
          .filter((ev) => ev.items.length > 0)
      );
      setReleaseUnits((prev) => {
        const next = { ...prev };
        succeededIds.forEach((id) => delete next[id]);
        return next;
      });
      setSelectedItemIds((prev) => {
        const next = { ...prev };
        succeededIds.forEach((id) => delete next[id]);
        return next;
      });

      if (succeededIds.size > 0) {
        setFlowToast({
          title: t("bulkReleaseSuccessTitle"),
          message: anyFailed
            ? t("bulkReleasePartialFailureMessage")
            : t("bulkReleaseSuccessMessage").replace("{event}", tc(event.name, language as any)),
          target: "released",
          tone: anyFailed ? "warn" : "ok",
        });
        fetchRecentReleases(1, true, search, true);
      } else {
        setError(t("releaseItemsFailed"));
      }
    } catch {
      setError(t("releaseItemsFailed"));
    } finally {
      setBulkReleasing(false);
    }
  };

  const openEdit = (release: RecentRelease) => {
    setError(null);
    setEditUnits(unitsOfRelease(release));
    setEditPhotos(photoItemsFromUrls(release.evidence_photo_urls?.length ? release.evidence_photo_urls : release.evidence_photo_url ? [release.evidence_photo_url] : []));
    setEditTarget(release);
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setConfirmDiscardEdit(false);
    setEditTarget(null);
    setEditPhotos([]);
  };

  // Closing with unsaved edits asks first; closing with none just closes.
  const requestCloseEdit = () => {
    if (savingEdit || !editTarget) return;
    const hasChanges =
      unitsChanged(editTarget, editUnits) ||
      photoItemsChanged(editPhotos, editTarget.evidence_photo_urls?.length ?? (editTarget.evidence_photo_url ? 1 : 0));
    if (hasChanges) setConfirmDiscardEdit(true);
    else closeEdit();
  };

  const unitsOfRelease = (release: RecentRelease): Record<string, number> =>
    release.units && sumUnits(release.units) === release.quantity
      ? { New: 0, Good: 0, Fair: 0, Poor: 0, ...release.units }
      : { New: 0, Good: release.quantity, Fair: 0, Poor: 0 };

  const unitsChanged = (release: RecentRelease, units: Record<string, number>) => {
    const base = unitsOfRelease(release);
    return RETURN_CONDITIONS.some((c) => (units[c.label] ?? 0) !== (base[c.label] ?? 0));
  };

  // Each condition is capped by what that condition can hold, and the total
  // never goes past what the event actually borrowed.
  const setEditUnit = (release: RecentRelease, label: string, value: number) => {
    const others = sumUnits(editUnits) - (editUnits[label] ?? 0);
    const cap = Math.min(release.max_units?.[label] ?? release.max_quantity, release.max_quantity - others);
    const clamped = Math.max(0, Math.min(cap, Math.floor(value) || 0));
    setEditUnits((prev) => ({ ...prev, [label]: clamped }));
  };

  // Where the change lands, so the hand-off is honest: lowering the quantity
  // sends items back to Pending Returns; anything else stays in the log.
  const saveEdit = async () => {
    setConfirmEditSave(false);
    if (!editTarget) return;
    const release = editTarget;
    const qty = sumUnits(editUnits);
    if (qty < 1) return;
    setSavingEdit(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("quantity", String(qty));
      RETURN_CONDITIONS.forEach((c) => fd.append(`conditions[${c.label}]`, String(editUnits[c.label] ?? 0)));
      appendPhotoFields(fd, editPhotos);
      await api.post(`/events/borrowed-items/releases/${release.id}/update`, fd);
      const movedBack = qty < release.quantity ? release.quantity - qty : 0;
      setEditTarget(null);
      setEditPhotos([]);
      if (movedBack > 0) {
        setFlowToast({
          title: t("editReturnSuccessTitle"),
          message: t("editMovedBackMessage").replace("{qty}", String(movedBack)).replace("{item}", tc(release.item_name, language as any)),
          target: "pending",
          tone: "ok",
        });
        setFlashEventIds([release.event_id]);
        setJumpToEventId(release.event_id);
      } else {
        setFlowToast({
          title: t("editReturnSuccessTitle"),
          message: t("editReturnSuccessMessage").replace("{item}", tc(release.item_name, language as any)).replace("{event}", tc(release.event_name, language as any)),
          target: "released",
          tone: "ok",
        });
        setFlashReleaseIds([release.id]);
      }
      // Quantities on both sides may have changed -- refresh both quietly.
      fetchOverdue(true);
      fetchRecentReleases(recentReleasesPage, true);
    } catch (err) {
      setError(apiErrorMessage(err, t("editReturnFailedMessage")));
    } finally {
      setSavingEdit(false);
    }
  };

  // Full reversal -- the whole release goes back to Pending Returns. No new
  // photo: the release's own evidence stays on record.
  const moveAllBack = async (release: RecentRelease) => {
    setConfirmMoveBack(null);
    setSavingEdit(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("quantity", String(release.quantity));
      await api.post(`/events/borrowed-items/releases/${release.id}/undo`, fd);
      setEditTarget(null);
      setEditPhotos([]);
      setFlowToast({
        title: t("undoReleaseSuccessTitle"),
        message: t("editMovedBackMessage").replace("{qty}", String(release.quantity)).replace("{item}", release.item_name),
        target: "pending",
        tone: "ok",
      });
      setFlashEventIds([release.event_id]);
      setJumpToEventId(release.event_id);
      fetchOverdue(true);
      const nextPage = recentReleases.length <= 1 && recentReleasesPage > 1 ? recentReleasesPage - 1 : recentReleasesPage;
      fetchRecentReleases(nextPage, true);
    } catch (err) {
      setError(apiErrorMessage(err, t("undoReleaseFailedMessage")));
    } finally {
      setSavingEdit(false);
    }
  };

  const formatEndedAt = (value: string) => {
    try {
      return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return value;
    }
  };

  const relativeTimeLabel = (dateString?: string) => {
    if (!dateString) return "--";
    const then = new Date(dateString).getTime();
    if (isNaN(then)) return "--";
    const diffSec = Math.max(0, Math.floor((nowTick - then) / 1000));
    if (diffSec < 60) return t("justNowLabel");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t("minutesAgoShortLabel").replace("{n}", String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("hoursAgoShortLabel").replace("{n}", String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    return t("daysAgoShortLabel").replace("{n}", String(diffDay));
  };

  const statCards = [
    {
      key: "overdue",
      label: t("overdueEventsStatLabel"),
      desc: t("overdueEventsStatDesc"),
      value: stats.totalEvents,
      icon: PackageX,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]",
    },
    {
      key: "units",
      label: t("itemsStillOutStatLabel"),
      desc: t("itemsStillOutStatDesc"),
      value: stats.totalUnits,
      icon: Package,
      gradient: "from-gold-400 to-gold-700",
    },
    {
      key: "types",
      label: t("distinctItemTypesStatLabel"),
      desc: t("distinctItemTypesStatDesc"),
      value: stats.distinctItems,
      icon: Undo2,
      gradient: "from-sage-400 to-sage-700",
    },
    {
      key: "oldest",
      label: t("oldestOverdueStatLabel"),
      desc: t("oldestOverdueStatDesc"),
      value: stats.oldestDays,
      icon: Clock,
      gradient: "from-sage-800 to-[#1C2E2B]",
    },
  ];

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events/Budget pages, so
        Returns reads as part of the same system instead of the old light
        "paper" page. The Release Items modal is darkened along with the
        page (it's this page's core action, same treatment as the
        Households/Inventory/Budget Edit modals); the confirm and success
        modals further below stay on their original light theme, same
        scoping used everywhere else. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("returnsTitle")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("returnsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-white/40">&bull; {lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className="report-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card, idx) =>
          statsLoading ? (
            <StatCardSkeleton key={card.key} />
          ) : (
            <KpiCard key={card.key} value={card.value} label={card.label} description={card.desc} icon={card.icon} gradient={card.gradient} delay={idx * 70} />
          )
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: t("searchReturnsPlaceholder") }}
          extraChips={endedDate ? [{ key: "ended", label: `${t("filterEndedDateLabel").replace(/:\s*$/, "")}: ${new Date(endedDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => { setEndedDate(""); goToPage(1); } }] : []}
          onClearExtras={() => { setEndedDate(""); goToPage(1); }}
        >
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs font-semibold text-white/50">{t("filterEndedDateLabel")}</span>
            <div className="h-11">
              <DatePicker value={endedDate} onChange={(v: string) => { setEndedDate(v); goToPage(1); }} className="h-11 px-4" dark />
            </div>
          </div>
        </FilterBar>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Flow switcher -- Pending Returns and Recently Released are the two
          stages of one return process (Pending -> Release -> Released ->
          Undo -> back to Pending), so both pills always show a live count
          and an arrow between them makes the direction of travel obvious. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => switchTab("pending")}
          className={`inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${
            activeTab === "pending"
              ? "bg-sage-700 text-white shadow-sm"
              : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <PackageX className="h-[18px] w-[18px]" />
          {t("pendingReturnsTitle")}
          <span
            className={`inline-flex h-[22px] min-w-[1.4rem] items-center justify-center rounded-full px-2 text-xs font-bold ${
              activeTab === "pending" ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
            }`}
          >
            {filteredEvents.length}
          </span>
        </button>
        <ArrowRight className="h-[18px] w-[18px] text-white/25 hidden sm:block" />
        <button
          type="button"
          onClick={() => switchTab("released")}
          className={`inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${
            activeTab === "released"
              ? "bg-sage-700 text-white shadow-sm"
              : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <History className="h-[18px] w-[18px]" />
          {t("recentlyReleasedTitle")}
          <span
            className={`inline-flex h-[22px] min-w-[1.4rem] items-center justify-center rounded-full px-2 text-xs font-bold ${
              activeTab === "released" ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
            }`}
          >
            {recentReleasesTotal}
          </span>
        </button>
      </div>

      {/* Pending Returns -- its own bordered card with a persistent header
          (icon + title + hint), only rendered while its pill button above
          is the active one. */}
      {activeTab === "pending" && (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center gap-3">
          <PackageX className="h-5 w-5 text-white/40" />
          <div>
            <p className="text-base font-bold text-white">{t("pendingReturnsTitle")}</p>
            <p className="text-[13px] text-white/40">{t("pendingReturnsHint")}</p>
          </div>
        </div>

        <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
        {loading || pageSwitching ? (
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20 ml-auto hidden sm:block" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-[#4FBEB0] mb-3" />
            <p className="text-white font-semibold">{t("noOverdueReturns")}</p>
            <p className="text-sm text-white/45 mt-1">{t("noOverdueReturnsHint")}</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-white font-semibold">{t("noResultsForFilterLabel")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-3.5 px-5 text-left text-xs font-bold uppercase tracking-wide text-white">{t("eventColumnLabel")}</th>
                    <th className="py-3.5 px-5 text-left text-xs font-bold uppercase tracking-wide text-white">{t("endedOnColumnLabel")}</th>
                    <th className="py-3.5 px-5 text-left text-xs font-bold uppercase tracking-wide text-white">{t("daysOverdueColumnLabel")}</th>
                    <th className="py-3.5 px-5 text-left text-xs font-bold uppercase tracking-wide text-white">{t("itemsColumnLabel")}</th>
                    <th className="py-3.5 px-5 text-right text-xs font-bold uppercase tracking-wide text-white">{t("actionColumnLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => {
                    const days = daysOverdue(ev.ended_at);
                    return (
                      <tr
                        key={ev.id}
                        className={`border-b border-white/[0.06] last:border-0 transition-colors duration-700 ${
                          flashEventIds.includes(ev.id) ? "bg-[#4FBEB0]/15 shadow-[inset_3px_0_0_#4FBEB0]" : "hover:bg-white/[0.05]"
                        }`}
                      >
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#8A3D2C]/25 shrink-0">
                              <PackageX className="h-5 w-5 text-[#E2A088]" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate">{highlightMatches(tc(ev.name, language as any), search)}</p>
                              {flashEventIds.includes(ev.id) && (
                                <p className="text-[11px] font-bold uppercase tracking-wide text-[#7DD8CB] mt-0.5">{t("backInPendingChipLabel")}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-white/60 whitespace-nowrap">{formatEndedAt(ev.ended_at)}</td>
                        <td className="py-4 px-5">
                          <span className="inline-flex items-center rounded-full bg-[#8A3D2C]/25 text-[#E2A088] border border-[#8A3D2C]/40 px-3 py-1 text-[13px] font-bold">
                            {t("daysOverdueBadge").replace("{n}", String(days))}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-white/50">
                          <ul className="space-y-0.5">
                            {ev.items.map((it) => (
                              <li key={it.id} className="text-[13px]">{it.quantity}&times; {tc(it.name, language as any)}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => setSelectedEventId(ev.id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            <Undo2 className="h-4 w-4" />
                            {t("reviewLabel")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && ((pageSwitching || loading) ? <PagerSkeleton withLabel className="px-4 sm:px-5 py-3.5 border-t border-white/10" /> : (
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 sm:px-5 py-3.5 border-t border-white/10">
                <p className="text-sm text-white/45 text-center sm:text-left">
                  {t("pageOfLabel")} {safePage} {t("ofPagesLabel")} {totalPages} &bull; {loading || pageSwitching ? 0 : filteredEvents.length} {t("recordsShownLabel")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &larr;
                  </button>
                  <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
                    {safePage}
                  </span>
                  <button
                    onClick={() => goToPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      )}

      {/* Recently Released -- the return log, and where a mis-entered
          quantity or wrong photo is corrected (Edit).
          Shown regardless of whether the source event still has other
          items outstanding (an event that's fully released drops off the
          table above entirely, so this can't live nested inside that
          event's own modal -- it has to stand on its own). Only rendered
          while its pill button above is the active one, same as Pending
          Returns, so the two never appear stacked together. */}
      {activeTab === "released" && (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center gap-3">
          <History className="h-5 w-5 text-white/40" />
          <div>
            <p className="text-base font-bold text-white">{t("recentlyReleasedTitle")}</p>
            <p className="text-[13px] text-white/40">{t("recentlyReleasedHint")}</p>
          </div>
        </div>
        {recentReleasesLoading || pageSwitching ? (
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : recentReleases.length === 0 ? (
          <p className="px-5 py-6 text-sm text-white/40 text-center">
            {search.trim() ? t("noResultsForFilterLabel") : t("noRecentReleasesLabel")}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.06]">
              {recentReleases.map((r) => (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-4 flex-wrap transition-colors duration-700 ${
                    flashReleaseIds.includes(r.id) ? "bg-[#4FBEB0]/15 shadow-[inset_3px_0_0_#4FBEB0]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Thumbnail of the evidence photo taken when this item
                        was released, if one was attached -- click to view
                        it full-size before deciding whether to edit. */}
                    {r.evidence_photo_url ? (
                      // Same two-layer structure as Inventory's table thumbnail:
                      // the circle is just a static photo frame (its own
                      // overflow-hidden so the photo doesn't spill past it), and
                      // the "view" eye badge is a sibling positioned over its
                      // corner, not a clipped child -- nesting it inside the
                      // overflow-hidden circle cut the badge in half.
                      <div className="relative shrink-0">
                        <div className="h-11 w-11 rounded-full overflow-hidden border border-white/15">
                          <img src={r.evidence_photo_url} alt="" className="h-full w-full object-cover" />
                        </div>
                        {r.evidence_photo_urls?.length > 1 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#4FBEB0] text-[#0A0E1A] text-[10px] font-bold flex items-center justify-center">
                            {r.evidence_photo_urls.length}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingPhoto({ url: r.evidence_photo_url as string, name: r.item_name, urls: r.evidence_photo_urls })}
                          title={t("viewEvidenceLabel")}
                          className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#0A0E1A] border border-white/20 text-white/60 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
                        >
                          <Eye className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="shrink-0 h-11 w-11 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/20">
                        <Eye className="h-[18px] w-[18px]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[15px] text-white truncate">
                        {r.quantity}&times; {highlightMatches(tc(r.item_name, language as any), search)} <span className="text-white/40">&bull;</span> {highlightMatches(tc(r.event_name, language as any), search)}
                      </p>
                      <p className="text-[13px] text-white/40 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#4FBEB0]/15 text-[#7DD8CB] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("returnedChipLabel")}
                        </span>
                        {RETURN_CONDITIONS.filter((c) => (r.units?.[c.label] ?? 0) > 0).map((c) => (
                          <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums] ${c.chip}`}>
                            {r.units?.[c.label]} {t(c.key)}
                          </span>
                        ))}
                        <span>
                          {relativeTimeLabel(r.released_at)}
                          {r.released_by && <> &bull; {t("releasedByPrefixLabel")} {r.released_by}</>}
                        </span>
                        {events.some((ev) => ev.id === r.event_id) && (
                          <button
                            type="button"
                            onClick={() => focusEventInPending(r.event_id)}
                            className="inline-flex items-center gap-1 text-[#E2A088] hover:text-white font-semibold transition"
                          >
                            &bull; {t("eventStillPendingLabel")}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(r)}
                    className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-white text-[15px] font-bold px-6 py-2.5 transition"
                  >
                    <Pencil className="h-4 w-4" />
                    {t("editLabel")}
                  </button>
                </li>
              ))}
            </ul>
            {recentReleasesTotalPages > 1 && ((recentReleasesLoading || pageSwitching) ? <PagerSkeleton withLabel className="px-4 sm:px-5 py-3.5 border-t border-white/10" /> : (
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center px-4 sm:px-5 py-3.5 border-t border-white/10">
                <p className="text-sm text-white/45 text-center sm:text-left">
                  {t("pageOfLabel")} {recentReleasesPage} {t("ofPagesLabel")} {recentReleasesTotalPages} &bull; {recentReleasesLoading || pageSwitching ? 0 : recentReleasesTotal} {t("recordsShownLabel")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchRecentReleases(Math.max(1, recentReleasesPage - 1))}
                    disabled={recentReleasesPage === 1}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &larr;
                  </button>
                  <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
                    {recentReleasesPage}
                  </span>
                  <button
                    onClick={() => fetchRecentReleases(Math.min(recentReleasesTotalPages, recentReleasesPage + 1))}
                    disabled={recentReleasesPage === recentReleasesTotalPages}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      )}

      </div>
      </div>

      {/* Release Items modal -- dark navy card, same treatment as the
          Households/Inventory/Budget core edit modals, since releasing
          items is this page's main action rather than a peripheral
          confirm/success alert. */}
      {modalEvent && createPortal(
        <FormDrawer
          z="z-[9999]"
          title={tc(modalEvent.name, language as any)}
          subtitle={<span className="text-[#E2A088]">{t("endedOnLabel")} {formatEndedAt(modalEvent.ended_at)}</span>}
          onClose={() => setSelectedEventId(null)}
          footer={
            <div className="space-y-2">
              <SaveButton
                type="button"
                icon={Undo2}
                className="w-full"
                onClick={() => setConfirmReleaseAll(true)}
                active={!(selectedCount === 0 || bulkReleasing || selectedMissingPhoto)}
              >
                {bulkReleasing ? t("releasingSelectedLabel") : `${t("releaseSelectedLabel")} (${selectedCount})`}
              </SaveButton>
              {selectedCount > 0 && selectedMissingPhoto && (
                <p className="text-center text-xs text-gold-300/80">{t("releaseEvidenceHint")}</p>
              )}
            </div>
          }
        >
          <FormSection title={t("secItemsToRelease")} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white/60">{t("releaseEachItemHint")}</p>
                <p className="text-sm text-gold-300/80 mt-1">{t("releaseEvidenceHint")}</p>
              </div>
              {modalEvent.items.length > 1 && (
                <label className="shrink-0 flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allItemsSelected}
                    onChange={toggleSelectAll}
                    className="h-5 w-5 rounded border-white/25 bg-white/[0.03] accent-[#4FBEB0]"
                  />
                  {t("selectAllLabel")}
                </label>
              )}
            </div>

            {modalEvent.items.map((it) => (
              <div key={it.id} className="rounded-2xl border border-white/25 bg-white/10 p-5 space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-3 min-w-0 cursor-pointer select-none">
                    {/* Unchecked items are simply left out of "Release
                        Selected" below -- the item itself, and its own
                        Release button, are unaffected either way. */}
                    <input
                      type="checkbox"
                      checked={isItemSelected(it)}
                      onChange={() => toggleItemSelected(it)}
                      className="h-5 w-5 shrink-0 rounded border-white/25 bg-white/[0.03] accent-[#4FBEB0]"
                    />
                    <span className="text-lg font-bold text-white truncate">{it.quantity}&times; {tc(it.name, language as any)}</span>
                  </label>
                  <div className="flex items-center gap-3 ml-auto">
                    <span className="text-sm text-white/60 [font-variant-numeric:tabular-nums]">
                      {t("borrowTotalLabel")}: <span className="font-bold text-white">{qtyFor(it)}</span> / {it.quantity}
                    </span>
                  </div>
                </div>

                {/* Which condition each returned unit comes back in -- starts
                    from what was borrowed; change it if something came back
                    worn or damaged. Goes back into Inventory exactly like this. */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-white/80">{t("returnConditionLabel")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {RETURN_CONDITIONS.map((c) => (
                      <div key={c.label}>
                        <span className={`mb-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.chip}`}>{t(c.key)}</span>
                        <NumberStepper
                          min={0}
                          max={it.quantity}
                          fullWidth
                          value={String(unitsFor(it)[c.label] ?? 0)}
                          onChange={(v) => setUnitFor(it, c.label, Number(v))}
                          className="w-full rounded-full border border-white/25 bg-white/10 pl-4 pr-8 py-3 text-base font-sans text-white focus:border-[#4FBEB0]/50 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evidence photos for THIS item -- up to 5. */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-white/80">{t("evidencePhotoLabel")} *</p>
                  <PhotoGallery
                    compact
                    items={releasePhotos[it.id] ?? []}
                    onChange={(items) => setReleasePhotosFor(it.id, items)}
                    onPreview={(photo) => setViewingPhoto({ url: photo.url, name: it.name, urls: (releasePhotos[it.id] ?? []).map((x) => x.url) })}
                    onError={setError}
                    emptyLabel={t("attachEvidenceLabel")}
                  />
                </div>
              </div>
            ))}

            <p className="text-sm text-white/50">{t("evidencePhotoLabel")}: {t("fileHintPhotos")}</p>
          </FormSection>
        </FormDrawer>,
        document.body
      )}

      <ConfirmDialog
        open={confirmEditSave}
        icon={<Pencil size={32} />}
        title={t("confirmUpdateReturnTitle")}
        body={t("confirmUpdateReturnBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setConfirmEditSave(false)}
        onConfirm={saveEdit}
        z={10001}
      />

      <ConfirmDialog
        open={confirmRelease !== null}
        icon={<Undo2 size={32} />}
        title={t("confirmReturnTitle")}
        body={
          confirmRelease
            ? t("confirmReturnBody").replace("{qty}", String(confirmRelease.qty)).replace("{item}", tc(confirmRelease.item.name, language as any))
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("confirmReturnLabel")}
        onCancel={() => setConfirmRelease(null)}
        onConfirm={() => confirmRelease && releaseOneItem(confirmRelease.eventId, confirmRelease.item, confirmRelease.qty)}
        tone="danger"
        z={10000}
      />

      <ConfirmDialog
        open={confirmReleaseAll}
        icon={<Undo2 size={32} />}
        title={t("confirmReleaseSelectedTitle")}
        body={
          modalEvent
            ? t("confirmReleaseSelectedBody").replace("{n}", String(selectedCount)).replace("{event}", tc(modalEvent.name, language as any))
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("confirmReleaseSelectedLabel")}
        onCancel={() => setConfirmReleaseAll(false)}
        onConfirm={() => modalEvent && releaseSelectedItems(modalEvent)}
        tone="danger"
        z={10000}
      />

      {/* Edit Return modal -- correct a return right where it's logged:
          change how many came back, or swap the evidence photo. Nothing is
          undone and no second photo is required; lowering the quantity just
          sends the difference back to Pending Returns. */}
      {editTarget && (() => {
        const qty = sumUnits(editUnits);
        const changed = unitsChanged(editTarget, editUnits) || photoItemsChanged(editPhotos, editTarget.evidence_photo_urls?.length ?? (editTarget.evidence_photo_url ? 1 : 0));
        const delta = qty - editTarget.quantity;
        // Same sizing and card style as the Release Items modal, so both
        // return dialogs feel like one family.
        return createPortal(
          <FormDrawer
            z="z-[9999]"
            title={t("editReturnTitle")}
            subtitle={<span className="text-[#7DD8CB]">{editTarget.item_name} &bull; {editTarget.event_name}</span>}
            onClose={() => !savingEdit && requestCloseEdit()}
            footer={
              <div className="space-y-3">
                <SaveButton type="button" className="w-full" onClick={() => setConfirmEditSave(true)} active={!(savingEdit || !changed || editPhotos.length === 0 || qty < 1)}>
                  {savingEdit ? t("savingLabel") : t("saveChangesLabel")}
                </SaveButton>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setConfirmMoveBack(editTarget)}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#E2A088] hover:text-white disabled:opacity-50 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("moveBackToPendingLabel")}
                  </button>
                </div>
              </div>
            }
          >
            <FormSection title={t("returnConditionLabel")} className="space-y-4">
              <p className="text-sm text-white/60">{t("editReturnHint")}</p>
              <p className="text-sm text-white/60">
                {t("borrowTotalLabel")}: <span className="font-bold text-white">{qty}</span> / {editTarget.max_quantity}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RETURN_CONDITIONS.map((c) => {
                  const cap = Math.min(editTarget.max_units?.[c.label] ?? editTarget.max_quantity, editTarget.max_quantity);
                  return (
                    <div key={c.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/25 bg-white/10 px-3.5 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.chip}`}>{t(c.key)}</span>
                        <span className="text-xs text-white/45">/ {cap}</span>
                      </div>
                      <NumberStepper
                        min={0}
                        max={cap}
                        value={String(editUnits[c.label] ?? 0)}
                        onChange={(v) => setEditUnit(editTarget, c.label, Number(v))}
                        className="w-20 rounded-xl border border-white/25 bg-white/10 pl-3 pr-6 py-2 text-base text-center text-white focus:border-[#4FBEB0]/50 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/20"
                      />
                    </div>
                  );
                })}
              </div>
              {delta !== 0 && (
                <p className={`flex items-center gap-2 text-sm font-semibold ${delta < 0 ? "text-[#E2A088]" : "text-[#7DD8CB]"}`}>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                  {delta < 0
                    ? t("editMovesBackHint").replace("{n}", String(-delta))
                    : t("editReleasesMoreHint").replace("{n}", String(delta))}
                </p>
              )}
            </FormSection>

            <FormSection title={t("evidencePhotoLabel")} className="space-y-3">
              <PhotoGallery
                items={editPhotos}
                onChange={setEditPhotos}
                onPreview={(photo) => setViewingPhoto({ url: photo.url, name: editTarget.item_name, urls: editPhotos.map((x) => x.url) })}
                onError={setError}
              />
              {editPhotos.length === 0 && (
                <p className="text-sm text-[#E2A088]">{t("returnNeedsPhotoHint")}</p>
              )}
              <p className="text-sm text-white/50">{t("keepPhotoHint")}</p>
              <p className="text-sm text-white/50">{t("fileHintPhotos")}</p>
              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
              )}
            </FormSection>
          </FormDrawer>,
          document.body
        );
      })()}

      <ConfirmDialog
        open={confirmDiscardEdit}
        icon={<AlertTriangle size={36} />}
        title={t("unsavedChangesTitle")}
        body={t("unsavedChangesMessage")}
        cancelLabel={t("stayButton")}
        confirmLabel={t("discardCloseButton")}
        onCancel={() => setConfirmDiscardEdit(false)}
        onConfirm={closeEdit}
        z={10000}
      />

      <ConfirmDialog
        open={confirmMoveBack !== null}
        icon={<RotateCcw size={32} />}
        title={t("moveBackConfirmTitle")}
        body={
          confirmMoveBack
            ? t("moveBackConfirmBody")
                .replace("{qty}", String(confirmMoveBack.quantity))
                .replace("{item}", confirmMoveBack.item_name)
                .replace("{event}", confirmMoveBack.event_name)
            : ""
        }
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("moveBackConfirmLabel")}
        onCancel={() => setConfirmMoveBack(null)}
        onConfirm={() => confirmMoveBack && moveAllBack(confirmMoveBack)}
        tone="danger"
        z={10000}
      />

      {/* Result popup -- same success modal used everywhere else in the app,
          with a second button that jumps to the other half of the flow
          (e.g. straight to Recently Released after a release). Sits above
          the Release Items / Edit Return modals so it shows over them. */}
      <StatusModal
        open={flowToast !== null}
        type={flowToast?.tone === "warn" ? "warning" : "success"}
        title={flowToast?.title ?? ""}
        message={flowToast?.message ?? ""}
        okLabel={t("okLabel")}
        onClose={() => setFlowToast(null)}
        secondaryLabel={flowToast?.target === "released" ? t("viewInReleasedLabel") : flowToast?.target === "pending" ? t("viewInPendingLabel") : undefined}
        onSecondary={goToToastTarget}
        z={10002}
      />

      {/* Full-size evidence photo viewer -- an already-saved photo from a
          past release (Recently Released's
          thumbnail) or a photo just picked for a release / edit. Same card, "VIEW PHOTO" badge, and gold Close button
          as Inventory's own photo viewer (InventoryView.tsx), so viewing a
          photo looks and behaves the same everywhere in the app. z above
          the Release Items modal (9999) and the confirm/success dialogs
          (10000) so it can be opened from either. */}
      {viewingPhoto && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10001] px-4"
          onClick={() => setViewingPhoto(null)}
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
                <span className="text-sm font-medium text-white truncate">{viewingPhoto.name}</span>
              </div>
              <button onClick={() => setViewingPhoto(null)} className="text-white/50 hover:text-white p-1 shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative flex-1 overflow-auto bg-black/40 flex items-center justify-center p-6">
              <img src={viewingPhoto.url} alt={viewingPhoto.name} className="max-w-full max-h-[65vh] rounded-xl shadow-2xl" />
              {viewingPhoto.urls && viewingPhoto.urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => stepViewingPhoto(-1)}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepViewingPhoto(1)}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white/80">
                    {Math.max(0, viewingPhoto.urls.indexOf(viewingPhoto.url)) + 1} / {viewingPhoto.urls.length}
                  </span>
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              {viewingPhoto.urls && viewingPhoto.urls.length > 1 ? (
                <div className="flex items-center gap-2">
                  {viewingPhoto.urls.map((u, i) => (
                    <button
                      key={u + i}
                      type="button"
                      onClick={() => setViewingPhoto({ ...viewingPhoto, url: u })}
                      className={`h-10 w-10 overflow-hidden rounded-lg border transition ${u === viewingPhoto.url ? "border-[#7DD8CB]" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <button
                onClick={() => setViewingPhoto(null)}
                className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold transition"
              >
                {t("closeLabel")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
