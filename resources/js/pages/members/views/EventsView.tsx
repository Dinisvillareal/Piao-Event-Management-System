import { useState, useMemo, useEffect, useRef } from "react";
import { Filter, Star, Pencil, CheckCircle } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import api, { apiErrorMessage } from "../../../lib/api";

const THIS_WEEK_KEY = "__THIS_WEEK__";

interface Event {
  id: number;
  title: string;
  date: string;
  event_end?: string | null;
  location: string;
  description: string;
  membership_ids?: number[];
  memberships?: { id: number; name: string }[];
}

interface AttendanceRecord {
  eventId?: number;
  status: string;
}

interface FeedbackEntry {
  id: number;
  event_id: number;
  rating: number;
  comment: string | null;
}

interface EventsViewProps {
  allEvents: Event[];
  allMemberships: { id: number; name: string }[];
  userMemberships: { id: number; name: string }[];
  highlightText: (text: string, query: string) => React.ReactNode;
  attendanceRecords?: AttendanceRecord[];
  myFeedback?: FeedbackEntry[];
  onFeedbackSubmitted?: (entry: FeedbackEntry) => void;
}

export default function EventsView({
  allEvents,
  allMemberships,
  userMemberships,
  highlightText,
  attendanceRecords = [],
  myFeedback = [],
  onFeedbackSubmitted,
}: EventsViewProps) {
  const { t, locale } = useLanguage();
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  // Brief skeleton flash on every page switch, same as Activity Logs --
  // this list paginates client-side so there's nothing to actually wait
  // on, but the flash keeps page switches feeling consistent app-wide.
  const [pageSwitching, setPageSwitching] = useState(false);
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
  };
  useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
  const itemsPerPage = 6;

  // ─── Reviews module (Past events only) ───────────────────────────────────
  // A resident can rate an event once they've signed in AND either (a)
  // they also signed out (status "complete"), or (b) the event's own
  // end time has already passed -- even if they forgot to sign out.
  // (b) exists so a resident who genuinely attended the whole event
  // isn't permanently locked out of feedback just for forgetting to tap
  // out again; without it, "incomplete" would stay that way forever.
  // Neither branch fires before the event has actually happened, and
  // "Missed" (never signed in) never shows a review affordance. The
  // backend enforces the same rule independently on submit.
  const [reviewingEventId, setReviewingEventId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [justSubmittedEventId, setJustSubmittedEventId] = useState<number | null>(null);

  // Brief inline confirmation after a successful submit -- clears itself so
  // it does not linger indefinitely once the resident has seen it.
  useEffect(() => {
    if (justSubmittedEventId === null) return;
    const timer = setTimeout(() => setJustSubmittedEventId(null), 4000);
    return () => clearTimeout(timer);
  }, [justSubmittedEventId]);

  const getAttendanceForEvent = (eventId: number) =>
    attendanceRecords.find((r) => Number(r.eventId) === Number(eventId));

  const getFeedbackForEvent = (eventId: number) =>
    myFeedback.find((f) => Number(f.event_id) === Number(eventId));

  const canReviewEvent = (eventId: number) => {
    const attendance = getAttendanceForEvent(eventId);
    if (!attendance) return false;
    if (attendance.status === "complete") return true;
    if (attendance.status !== "incomplete") return false;

    // Signed in but not signed out -- still reviewable once the event's
    // own end time has passed. No event_end configured means we can't
    // confirm the event has ended, so it stays not-yet-reviewable.
    const event = allEvents.find((ev) => ev.id === eventId);
    if (!event?.event_end) return false;
    return new Date(event.event_end).getTime() <= Date.now();
  };

  const startReview = (eventId: number) => {
    const existing = getFeedbackForEvent(eventId);
    setReviewingEventId(eventId);
    setReviewRating(existing?.rating ?? 0);
    setReviewComment(existing?.comment ?? "");
    setReviewHoverRating(0);
    setReviewError(null);
    setJustSubmittedEventId(null);
  };

  const cancelReview = () => {
    setReviewingEventId(null);
    setReviewRating(0);
    setReviewComment("");
    setReviewError(null);
  };

  const submitReview = async (eventId: number) => {
    if (reviewRating < 1) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const res = await api.post("/feedback", {
        event_id: eventId,
        rating: reviewRating,
        comment: reviewComment || undefined,
      });
      const saved = res.data?.feedback;
      onFeedbackSubmitted?.({
        id: saved?.id ?? Date.now(),
        event_id: eventId,
        rating: reviewRating,
        comment: reviewComment || null,
      });
      setReviewingEventId(null);
      setJustSubmittedEventId(eventId);
    } catch (err) {
      setReviewError(apiErrorMessage(err, t("submitReviewFailed")));
    } finally {
      setSubmittingReview(false);
    }
  };

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
        sectionKey = new Date(dateOnly).toLocaleDateString(locale, {
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
    <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      {/* Not sticky -- matches every other converted page. */}
      <div className="px-1 pt-2 pb-4">
        <div className="w-full">
          <h1 className="text-4xl font-black text-white">{t("eventsAndAttendance")}</h1>
          <p className="mt-1 text-sm text-white/50">
            {t("eventsSubtitle")}
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <SearchBar
                  value={eventSearch}
                  onChange={setEventSearch}
                  placeholder={t("searchEventsPlaceholder")}
                  dark
                />
              </div>

              <FilterDropdown
                value={eventFilter}
                onChange={setEventFilter}
                options={[
                  { value: "all", label: t("allEvents") },
                  { value: "upcoming", label: t("upcomingEvents") },
                  { value: "past", label: t("pastEvents") },
                ]}
                className="h-11 pl-10 pr-8 shrink-0"
                icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                dark
              />

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
            </div>
          </div>

          <p className="mt-2 text-xs text-white/40">
            {filteredEvents.length} of {allEvents.length} {t("eventsMatchCount")}
          </p>

          {/* PAGINATION - ← 1 → RIGHT SIDE BELOW SEARCH BAR */}
          {totalPages > 1 && (
            <div className="flex justify-end mt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                >
                  ←
                </button>

                <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
                  {currentPage}
                </span>

                <button
                  onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
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

      <div className="pl-1">
        {pageSwitching ? (
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <p className="text-white/40 italic">{t("noEventsMatch")}</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
              <div key={dateLabel}>
                <h3 className="mb-4 border-b border-white/10 pb-2 text-lg font-bold text-white">
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
                        className="relative rounded-3xl border-l-4 border-gold-400 border-y border-r border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.06] transition-all duration-200"
                      >
                        <div className="absolute top-4 right-4 flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isUpcoming ? "bg-gold-400" : "bg-[#4FBEB0]"
                            }`}
                          />
                          <span className="text-xs font-medium text-white/50">
                            {isUpcoming ? t("upcomingBadge") : t("pastBadge")}
                          </span>
                        </div>

                        <h2 className="pr-20 text-base font-bold text-white">
                          {highlightText(e.title, eventSearch)}
                        </h2>

                        <p className="mt-1 text-sm text-white/40">
                          {highlightText(dateOnly, eventSearch)} · {timeOnly}
                        </p>

                        <p className="mt-1 text-sm text-white/40">
                          {highlightText(e.location, eventSearch)}
                        </p>

                        <p className="mt-3 text-sm text-white/70">
                          {highlightText(e.description, eventSearch)}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {memNames.length > 0 ? (
                            <>
                              <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
                                {t("forLabel")} {memNames.join(", ")}
                              </span>
                              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/50 border border-white/10">
                                {t("includedInMembership")}
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
                              {t("openEventAllResidents")}
                            </span>
                          )}
                        </div>

                        {/* Feedback module -- gated by canReviewEvent(), not
                            the Upcoming/Past date badge above: a resident
                            with a Complete attendance record (signed in AND
                            signed out) has necessarily already attended and
                            the event has ended, regardless of how the
                            event's own date field compares to "now" (test
                            data / clock skew can otherwise make an attended
                            event still read as "Upcoming"). An Incomplete
                            record (signed in, not yet out) still gets the
                            affordance once the event's own end time has
                            passed, so forgetting to tap out never
                            permanently blocks feedback. Missed / no
                            attendance record at all never does -- matches
                            the backend's own attendanceIsReviewable() gate. */}
                        {canReviewEvent(e.id) && (() => {
                          const feedback = getFeedbackForEvent(e.id);
                          const isReviewing = reviewingEventId === e.id;
                          return (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              {isReviewing ? (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">{t("rateThisEventLabel")}</p>
                                  <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <button
                                        key={n}
                                        type="button"
                                        onMouseEnter={() => setReviewHoverRating(n)}
                                        onMouseLeave={() => setReviewHoverRating(0)}
                                        onClick={() => setReviewRating(n)}
                                        className="p-0.5"
                                      >
                                        <Star size={22} className={(reviewHoverRating || reviewRating) >= n ? "text-gold-400 fill-gold-400" : "text-white/20"} />
                                      </button>
                                    ))}
                                  </div>
                                  <textarea
                                    value={reviewComment}
                                    onChange={(ev) => setReviewComment(ev.target.value)}
                                    placeholder={t("optionalCommentPlaceholder")}
                                    rows={2}
                                    className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                                  />
                                  {reviewError && <p className="mt-1 text-xs text-red-400">{reviewError}</p>}
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => submitReview(e.id)}
                                      disabled={reviewRating < 1 || submittingReview}
                                      className="flex-1 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold py-2 disabled:opacity-50 transition"
                                    >
                                      {submittingReview ? t("submittingLabel") : t("submitReviewButton")}
                                    </button>
                                    <button type="button" onClick={cancelReview} disabled={submittingReview} className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition">
                                      {t("cancelLabel")}
                                    </button>
                                  </div>
                                </div>
                              ) : feedback ? (
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-1.5">{t("yourRatingLabel")}</p>
                                      <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((n) => (
                                          <Star key={n} size={16} className={feedback.rating >= n ? "text-gold-400 fill-gold-400 shrink-0" : "text-white/15 shrink-0"} />
                                        ))}
                                      </div>
                                      {feedback.comment && <p className="mt-1 text-xs text-white/40 truncate">"{feedback.comment}"</p>}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => startReview(e.id)}
                                      title={t("editReviewTitle")}
                                      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/15 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/10 transition"
                                    >
                                      <Pencil className="h-3 w-3" /> {t("editLabel")}
                                    </button>
                                  </div>
                                  {justSubmittedEventId === e.id && (
                                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#7DD8CB]">
                                      <CheckCircle className="h-3.5 w-3.5" /> {t("feedbackSavedConfirmation")}
                                    </p>
                                  )}
                                </div>
                              ) : (

                                <button
                                  type="button"
                                  onClick={() => startReview(e.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold px-4 py-2 hover:bg-white/10 transition"
                                >
                                  <Star className="h-4 w-4" /> {t("rateThisEventButton")}
                                </button>
                              )}
                            </div>
                          );
                        })()}
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
    </div>
  );
}