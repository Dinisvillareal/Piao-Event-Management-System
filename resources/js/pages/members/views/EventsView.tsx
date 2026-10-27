//LATEST WORKING IMPLEMENTATION
// import { useState, useMemo, useEffect, useRef } from "react";
// import { Filter, Star, Pencil, CheckCircle } from "lucide-react";
// import SearchBar from "../../../components/ui/SearchBar";
// import FilterDropdown from "../../../components/ui/FilterDropdown";
// import Skeleton from "../../../components/ui/Skeleton";
// import { useLanguage } from "../../../i18n/LanguageContext";
// import api, { apiErrorMessage } from "../../../lib/api";

// const THIS_WEEK_KEY = "__THIS_WEEK__";

// interface Event {
//   id: number;
//   title: string;
//   date: string;
//   event_end?: string | null;
//   location: string;
//   description: string;
//   membership_ids?: number[];
//   memberships?: { id: number; name: string }[];
// }

// interface AttendanceRecord {
//   eventId?: number;
//   status: string;
// }

// interface FeedbackEntry {
//   id: number;
//   event_id: number;
//   rating: number;
//   comment: string | null;
// }

// interface EventsViewProps {
//   allEvents: Event[];
//   allMemberships: { id: number; name: string }[];
//   userMemberships: { id: number; name: string }[];
//   highlightText: (text: string, query: string) => React.ReactNode;
//   attendanceRecords?: AttendanceRecord[];
//   myFeedback?: FeedbackEntry[];
//   onFeedbackSubmitted?: (entry: FeedbackEntry) => void;
// }

// export default function EventsView({
//   allEvents,
//   allMemberships,
//   userMemberships,
//   highlightText,
//   attendanceRecords = [],
//   myFeedback = [],
//   onFeedbackSubmitted,
// }: EventsViewProps) {
//   const { t } = useLanguage();
//   const [eventSearch, setEventSearch] = useState("");
//   const [eventFilter, setEventFilter] = useState("all");
//   const [membershipFilter, setMembershipFilter] = useState("all");
//   const [currentPage, setCurrentPage] = useState(1);
//   // Brief skeleton flash on every page switch, same as Activity Logs --
//   // this list paginates client-side so there's nothing to actually wait
//   // on, but the flash keeps page switches feeling consistent app-wide.
//   const [pageSwitching, setPageSwitching] = useState(false);
//   const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const goToPage = (updater: number | ((p: number) => number)) => {
//     setCurrentPage(updater as any);
//     setPageSwitching(true);
//     if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
//     pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
//   };
//   useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
//   const itemsPerPage = 6;

//   // ─── Reviews module (Past events only) ───────────────────────────────────
//   // A resident can rate an event once they've signed in AND either (a)
//   // they also signed out (status "complete"), or (b) the event's own
//   // end time has already passed -- even if they forgot to sign out.
//   // (b) exists so a resident who genuinely attended the whole event
//   // isn't permanently locked out of feedback just for forgetting to tap
//   // out again; without it, "incomplete" would stay that way forever.
//   // Neither branch fires before the event has actually happened, and
//   // "Missed" (never signed in) never shows a review affordance. The
//   // backend enforces the same rule independently on submit.
//   const [reviewingEventId, setReviewingEventId] = useState<number | null>(null);
//   const [reviewRating, setReviewRating] = useState(0);
//   const [reviewHoverRating, setReviewHoverRating] = useState(0);
//   const [reviewComment, setReviewComment] = useState("");
//   const [submittingReview, setSubmittingReview] = useState(false);
//   const [reviewError, setReviewError] = useState<string | null>(null);
//   const [justSubmittedEventId, setJustSubmittedEventId] = useState<number | null>(null);

//   // Brief inline confirmation after a successful submit -- clears itself so
//   // it does not linger indefinitely once the resident has seen it.
//   useEffect(() => {
//     if (justSubmittedEventId === null) return;
//     const timer = setTimeout(() => setJustSubmittedEventId(null), 4000);
//     return () => clearTimeout(timer);
//   }, [justSubmittedEventId]);

//   const getAttendanceForEvent = (eventId: number) =>
//     attendanceRecords.find((r) => Number(r.eventId) === Number(eventId));

//   const getFeedbackForEvent = (eventId: number) =>
//     myFeedback.find((f) => Number(f.event_id) === Number(eventId));

//   const canReviewEvent = (eventId: number) => {
//     const attendance = getAttendanceForEvent(eventId);
//     if (!attendance) return false;
//     if (attendance.status === "complete") return true;
//     if (attendance.status !== "incomplete") return false;

//     // Signed in but not signed out -- still reviewable once the event's
//     // own end time has passed. No event_end configured means we can't
//     // confirm the event has ended, so it stays not-yet-reviewable.
//     const event = allEvents.find((ev) => ev.id === eventId);
//     if (!event?.event_end) return false;
//     return new Date(event.event_end).getTime() <= Date.now();
//   };

//   const startReview = (eventId: number) => {
//     const existing = getFeedbackForEvent(eventId);
//     setReviewingEventId(eventId);
//     setReviewRating(existing?.rating ?? 0);
//     setReviewComment(existing?.comment ?? "");
//     setReviewHoverRating(0);
//     setReviewError(null);
//     setJustSubmittedEventId(null);
//   };

//   const cancelReview = () => {
//     setReviewingEventId(null);
//     setReviewRating(0);
//     setReviewComment("");
//     setReviewError(null);
//   };

//   const submitReview = async (eventId: number) => {
//     if (reviewRating < 1) return;
//     setSubmittingReview(true);
//     setReviewError(null);
//     try {
//       const res = await api.post("/feedback", {
//         event_id: eventId,
//         rating: reviewRating,
//         comment: reviewComment || undefined,
//       });
//       const saved = res.data?.feedback;
//       onFeedbackSubmitted?.({
//         id: saved?.id ?? Date.now(),
//         event_id: eventId,
//         rating: reviewRating,
//         comment: reviewComment || null,
//       });
//       setReviewingEventId(null);
//       setJustSubmittedEventId(eventId);
//     } catch (err) {
//       setReviewError(apiErrorMessage(err, t("submitReviewFailed")));
//     } finally {
//       setSubmittingReview(false);
//     }
//   };

//   // Format time function
//   const formatTime = (dateTimeStr: string): string => {
//     if (!dateTimeStr) return "";
    
//     const date = new Date(dateTimeStr);
//     if (isNaN(date.getTime())) return "";
    
//     let hours = date.getHours();
//     const minutes = date.getMinutes();
//     const ampm = hours >= 12 ? 'PM' : 'AM';
//     hours = hours % 12;
//     if (hours === 0) hours = 12;
//     const minutesStr = minutes.toString().padStart(2, '0');
    
//     return `${hours}:${minutesStr} ${ampm}`;
//   };

//   // Format date only (YYYY-MM-DD)
//   const formatDateOnly = (dateTimeStr: string): string => {
//     if (!dateTimeStr) return "";
//     return dateTimeStr.split(" ")[0];
//   };

//   // Helper functions for current week (Sunday to Saturday)
//   const getStartOfWeek = (date: Date) => {
//     const d = new Date(date);
//     const day = d.getDay();
//     d.setDate(d.getDate() - day);
//     d.setHours(0, 0, 0, 0);
//     return d;
//   };

//   const getEndOfWeek = (date: Date) => {
//     const d = getStartOfWeek(date);
//     d.setDate(d.getDate() + 6);
//     d.setHours(23, 59, 59, 999);
//     return d;
//   };

//   const filteredEvents = useMemo(() => {
//     const today = new Date();
//     let result = [...allEvents];

//     if (eventFilter === "upcoming") {
//       result = result.filter((e) => new Date(e.date) >= today);
//     } else if (eventFilter === "past") {
//       result = result.filter((e) => new Date(e.date) < today);
//     }

//     if (membershipFilter !== "all") {
//       const selectedId = Number(membershipFilter);
//       result = result.filter((e) =>
//         e.membership_ids?.includes(selectedId)
//       );
//     }

//     if (eventSearch.trim()) {
//       const q = eventSearch.toLowerCase();
//       result = result.filter(
//         (e) =>
//           e.title.toLowerCase().includes(q) ||
//           e.date.toLowerCase().includes(q) ||
//           e.location.toLowerCase().includes(q) ||
//           e.description.toLowerCase().includes(q)
//       );
//     }

//     result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

//     return result;
//   }, [allEvents, eventFilter, membershipFilter, eventSearch]);

//   // Pagination
//   const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
//   const paginatedEvents = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredEvents, currentPage, itemsPerPage]);

//   // Reset to page 1 when filters change
//   useEffect(() => {
//     setCurrentPage(1);
//   }, [eventSearch, eventFilter, membershipFilter]);

//   const groupedEvents = useMemo(() => {
//     const groups: Record<string, typeof allEvents> = {};
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const weekStart = getStartOfWeek(today);
//     const weekEnd = getEndOfWeek(today);

//     paginatedEvents.forEach((e) => {
//       const eventDate = new Date(e.date);
//       eventDate.setHours(0, 0, 0, 0);
//       const dateOnly = e.date.split(" ")[0];

//       let sectionKey: string;
      
//       if (eventDate >= weekStart && eventDate <= weekEnd) {
//         sectionKey = THIS_WEEK_KEY;
//       } else {
//         sectionKey = new Date(dateOnly).toLocaleDateString("en-US", {
//           weekday: "long",
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         });
//       }

//       if (!groups[sectionKey]) groups[sectionKey] = [];
//       groups[sectionKey].push(e);
//     });

//     const sortedGroups = Object.entries(groups).sort(([keyA], [keyB]) => {
//       if (keyA === THIS_WEEK_KEY) return -1;
//       if (keyB === THIS_WEEK_KEY) return 1;
//       return new Date(keyB).getTime() - new Date(keyA).getTime();
//     });

//     return Object.fromEntries(sortedGroups);
//   }, [paginatedEvents]);

//   return (
//     <div className="-m-3 sm:-m-5 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
//     <div className="space-y-6">
//       {/* Not sticky -- matches every other converted page. */}
//       <div className="px-1 pt-2 pb-4">
//         <div className="w-full">
//           <h1 className="text-4xl font-black text-white">{t("eventsAndAttendance")}</h1>
//           <p className="mt-1 text-sm text-white/50">
//             {t("eventsSubtitle")}
//           </p>

//           <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
//             <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
//               <div className="flex-1 min-w-[220px]">
//                 <SearchBar
//                   value={eventSearch}
//                   onChange={setEventSearch}
//                   placeholder={t("searchEventsPlaceholder")}
//                   dark
//                 />
//               </div>

//               <FilterDropdown
//                 value={eventFilter}
//                 onChange={setEventFilter}
//                 options={[
//                   { value: "all", label: t("allEvents") },
//                   { value: "upcoming", label: t("upcomingEvents") },
//                   { value: "past", label: t("pastEvents") },
//                 ]}
//                 className="h-11 pl-10 pr-8 shrink-0"
//                 icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
//                 dark
//               />

//               <FilterDropdown
//                 value={membershipFilter}
//                 onChange={setMembershipFilter}
//                 options={[
//                   { value: "all", label: t("allMembershipsOption") },
//                   ...userMemberships.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: String(m.id), label: m.name })),
//                 ]}
//                 className="h-11 min-w-[220px] pl-10 pr-8 shrink-0"
//                 panelWidthPx={280}
//                 icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
//                 dark
//                 searchable
//                 searchPlaceholder={t("search")}
//                 noResultsLabel={t("noMatchesFoundLabel")}
//               />
//             </div>
//           </div>

//           <p className="mt-2 text-xs text-white/40">
//             {filteredEvents.length} of {allEvents.length} {t("eventsMatchCount")}
//           </p>

//           {/* PAGINATION - ← 1 → RIGHT SIDE BELOW SEARCH BAR */}
//           {totalPages > 1 && (
//             <div className="flex justify-end mt-4">
//               <div className="flex items-center gap-2">
//                 <button
//                   onClick={() => goToPage(p => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   ←
//                 </button>

//                 <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
//                   {currentPage}
//                 </span>

//                 <button
//                   onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage === totalPages}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   →
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="pl-1">
//         {pageSwitching ? (
//           <div className="grid gap-5 md:grid-cols-2">
//             {Array.from({ length: 4 }).map((_, i) => (
//               <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
//                 <Skeleton className="h-4 w-2/3" />
//                 <Skeleton className="h-3 w-1/2" />
//                 <Skeleton className="h-3 w-1/3" />
//               </div>
//             ))}
//           </div>
//         ) : filteredEvents.length === 0 ? (
//           <p className="text-white/40 italic">{t("noEventsMatch")}</p>
//         ) : (
//           <div className="space-y-8">
//             {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
//               <div key={dateLabel}>
//                 <h3 className="mb-4 border-b border-white/10 pb-2 text-lg font-bold text-white">
//                   {dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel}
//                 </h3>
//                 <div className="grid gap-5 md:grid-cols-2">
//                   {eventsInGroup.map((e) => {
//                     const today = new Date();
//                     const isUpcoming = new Date(e.date) >= today;
//                     const memNames = Array.isArray(e.memberships) && e.memberships.length > 0
//                       ? e.memberships.map((m) => m.name)
//                       : Array.isArray(e.membership_ids)
//                         ? e.membership_ids.map((id) => allMemberships.find((m) => m.id === id)?.name).filter(Boolean) as string[]
//                         : [];

//                     const dateOnly = formatDateOnly(e.date);
//                     const timeOnly = formatTime(e.date);

//                     return (
//                       <div
//                         key={e.id}
//                         className="relative rounded-3xl border-l-4 border-gold-400 border-y border-r border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.06] transition-all duration-200"
//                       >
//                         <div className="absolute top-4 right-4 flex items-center gap-1.5">
//                           <span
//                             className={`w-2.5 h-2.5 rounded-full ${
//                               isUpcoming ? "bg-gold-400" : "bg-[#4FBEB0]"
//                             }`}
//                           />
//                           <span className="text-xs font-medium text-white/50">
//                             {isUpcoming ? t("upcomingBadge") : t("pastBadge")}
//                           </span>
//                         </div>

//                         <h2 className="pr-20 text-base font-bold text-white">
//                           {highlightText(e.title, eventSearch)}
//                         </h2>

//                         <p className="mt-1 text-sm text-white/40">
//                           {highlightText(dateOnly, eventSearch)} · {timeOnly}
//                         </p>

//                         <p className="mt-1 text-sm text-white/40">
//                           {highlightText(e.location, eventSearch)}
//                         </p>

//                         <p className="mt-3 text-sm text-white/70">
//                           {highlightText(e.description, eventSearch)}
//                         </p>

//                         <div className="mt-4 flex flex-wrap items-center gap-2">
//                           {memNames.length > 0 ? (
//                             <>
//                               <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
//                                 {t("forLabel")} {memNames.join(", ")}
//                               </span>
//                               <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/50 border border-white/10">
//                                 {t("includedInMembership")}
//                               </span>
//                             </>
//                           ) : (
//                             <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
//                               {t("openEventAllResidents")}
//                             </span>
//                           )}
//                         </div>

//                         {/* Feedback module -- gated by canReviewEvent(), not
//                             the Upcoming/Past date badge above: a resident
//                             with a Complete attendance record (signed in AND
//                             signed out) has necessarily already attended and
//                             the event has ended, regardless of how the
//                             event's own date field compares to "now" (test
//                             data / clock skew can otherwise make an attended
//                             event still read as "Upcoming"). An Incomplete
//                             record (signed in, not yet out) still gets the
//                             affordance once the event's own end time has
//                             passed, so forgetting to tap out never
//                             permanently blocks feedback. Missed / no
//                             attendance record at all never does -- matches
//                             the backend's own attendanceIsReviewable() gate. */}
//                         {canReviewEvent(e.id) && (() => {
//                           const feedback = getFeedbackForEvent(e.id);
//                           const isReviewing = reviewingEventId === e.id;
//                           return (
//                             <div className="mt-4 pt-4 border-t border-white/10">
//                               {isReviewing ? (
//                                 <div>
//                                   <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">{t("rateThisEventLabel")}</p>
//                                   <div className="flex items-center gap-1">
//                                     {[1, 2, 3, 4, 5].map((n) => (
//                                       <button
//                                         key={n}
//                                         type="button"
//                                         onMouseEnter={() => setReviewHoverRating(n)}
//                                         onMouseLeave={() => setReviewHoverRating(0)}
//                                         onClick={() => setReviewRating(n)}
//                                         className="p-0.5"
//                                       >
//                                         <Star size={22} className={(reviewHoverRating || reviewRating) >= n ? "text-gold-400 fill-gold-400" : "text-white/20"} />
//                                       </button>
//                                     ))}
//                                   </div>
//                                   <textarea
//                                     value={reviewComment}
//                                     onChange={(ev) => setReviewComment(ev.target.value)}
//                                     placeholder={t("optionalCommentPlaceholder")}
//                                     rows={2}
//                                     className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
//                                   />
//                                   {reviewError && <p className="mt-1 text-xs text-red-400">{reviewError}</p>}
//                                   <div className="mt-2 flex gap-2">
//                                     <button
//                                       type="button"
//                                       onClick={() => setConfirmReviewEventId(e.id)}
//                                       disabled={reviewRating < 1 || submittingReview}
//                                       className="flex-1 rounded-full bg-gold-400 hover:bg-gold-300 text-[#08130F] text-sm font-bold py-2 disabled:opacity-50 transition"
//                                     >
//                                       {submittingReview ? t("submittingLabel") : t("submitReviewButton")}
//                                     </button>
//                                     <button type="button" onClick={cancelReview} disabled={submittingReview} className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition">
//                                       {t("cancelLabel")}
//                                     </button>
//                                   </div>
//                                 </div>
//                               ) : feedback ? (
//                                 <div>
//                                   <div className="flex items-center justify-between gap-2">
//                                     <div className="min-w-0">
//                                       <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-1.5">{t("yourRatingLabel")}</p>
//                                       <div className="flex items-center gap-1">
//                                         {[1, 2, 3, 4, 5].map((n) => (
//                                           <Star key={n} size={16} className={feedback.rating >= n ? "text-gold-400 fill-gold-400 shrink-0" : "text-white/15 shrink-0"} />
//                                         ))}
//                                       </div>
//                                       {feedback.comment && <p className="mt-1 text-xs text-white/40 truncate">"{feedback.comment}"</p>}
//                                     </div>
//                                     <button
//                                       type="button"
//                                       onClick={() => startReview(e.id)}
//                                       title={t("editReviewTitle")}
//                                       className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/15 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/10 transition"
//                                     >
//                                       <Pencil className="h-3 w-3" /> {t("editLabel")}
//                                     </button>
//                                   </div>
//                                   {justSubmittedEventId === e.id && (
//                                     <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#7DD8CB]">
//                                       <CheckCircle className="h-3.5 w-3.5" /> {t("feedbackSavedConfirmation")}
//                                     </p>
//                                   )}
//                                 </div>
//                               ) : (

//                                 <button
//                                   type="button"
//                                   onClick={() => startReview(e.id)}
//                                   className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold px-4 py-2 hover:bg-white/10 transition"
//                                 >
//                                   <Star className="h-4 w-4" /> {t("rateThisEventButton")}
//                                 </button>
//                               )}
//                             </div>
//                           );
//                         })()}
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//     </div>
//   );
// }

//LATEST WORKING IMPLEMENTATION
// import { scrollListIntoView } from "../../../lib/scrollToList";
// import useFilterSwitching from "../../../hooks/useFilterSwitching";
// import { useState, useMemo, useEffect, useRef } from "react";
// import { Filter, Star, Pencil, CheckCircle, X, HelpCircle, Lock } from "lucide-react";
// import FeedbackComment from "../../../components/ui/FeedbackComment";
// import type { ResponseFields } from "../../../components/ui/FeedbackComment";
// import { ABSENCE_REASON_KEYS } from "../../../lib/absence";
// import SearchBar from "../../../components/ui/SearchBar";
// import DatePicker from "../../../components/ui/DatePicker";
// import FilterDropdown from "../../../components/ui/FilterDropdown";
// import FilterBar from "../../../components/ui/FilterBar";
// import Skeleton from "../../../components/ui/Skeleton";
// import { useLanguage } from "../../../i18n/LanguageContext";
// import { tc } from "../../../lib/contentTranslations";
// import api, { apiErrorMessage } from "../../../lib/api";
// import { matchesSearch } from "../../../lib/search";
// import ConfirmDialog from "../../../components/ui/ConfirmDialog";
// import StatusModal from "../../../components/ui/StatusModal";

// const THIS_WEEK_KEY = "__THIS_WEEK__";

// interface Event {
//   id: number;
//   title: string;
//   date: string;
//   event_end?: string | null;
//   location: string;
//   description: string;
//   membership_ids?: number[];
//   memberships?: { id: number; name: string }[];
// }

// interface AttendanceRecord {
//   eventId?: number;
//   status: string;
// }

// interface FeedbackEntry extends ResponseFields {
//   id: number;
//   event_id: number;
//   rating: number;
//   comment: string | null;
//   edits_count?: number;
//   staff_liked_at?: string | null;
//   staff_reply?: string | null;
//   staff_replied_at?: string | null;
//   /** Epoch ms until the member may still edit (set client-side from the server's seconds-left). */
//   edit_until?: number;
// }

// export interface AbsenceEntry extends ResponseFields {
//   id: number;
//   event_id: number;
//   reason: string;
//   comment: string | null;
//   edits_count?: number;
//   staff_liked_at?: string | null;
//   staff_reply?: string | null;
//   staff_replied_at?: string | null;
//   edit_until?: number;
// }

// interface EventsViewProps {
//   allEvents: Event[];
//   allMemberships: { id: number; name: string }[];
//   userMemberships: { id: number; name: string }[];
//   highlightText: (text: string, query: string) => React.ReactNode;
//   attendanceRecords?: AttendanceRecord[];
//   myFeedback?: FeedbackEntry[];
//   onFeedbackSubmitted?: (entry: FeedbackEntry) => void;
//   myAbsences?: AbsenceEntry[];
//   onAbsenceSubmitted?: (entry: AbsenceEntry) => void;
//   /** An event the member was sent here to see (from a notification card). */
//   focusEventId?: number | null;
//   onFocusHandled?: () => void;
//   /** The signed-in member, for the avatar and name on their own comment. */
//   member?: { first_name?: string | null; last_name?: string | null } | null;
//   feedbackRules?: { close_after_hours: number; edit_window_minutes: number };
//   /** True until the first events fetch lands -- shows the skeleton grid. */
//   loading?: boolean;
// }

// export default function EventsView({
//   allEvents,
//   allMemberships,
//   userMemberships,
//   highlightText,
//   attendanceRecords = [],
//   myFeedback = [],
//   onFeedbackSubmitted,
//   myAbsences = [],
//   onAbsenceSubmitted,
//   focusEventId = null,
//   onFocusHandled,
//   member = null,
//   feedbackRules = { close_after_hours: 12, edit_window_minutes: 30 },
//   loading = false,
// }: EventsViewProps) {
//   const { t, language, locale } = useLanguage();
//   const [confirmReviewEventId, setConfirmReviewEventId] = useState<number | null>(null);
//   const [reviewSavedOpen, setReviewSavedOpen] = useState(false);
//   const [reviewSavedKind, setReviewSavedKind] = useState<"added" | "updated">("added");
//   const [confirmCancelReviewOpen, setConfirmCancelReviewOpen] = useState(false);
//   const [eventSearch, setEventSearch] = useState("");
//   const [eventFilter, setEventFilter] = useState("all");
//   const [membershipFilter, setMembershipFilter] = useState("all");
//   const [selectedDate, setSelectedDate] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   const [pageSwitchingRaw, setPageSwitching] = useState(false);
//   const filterSwitching = useFilterSwitching([eventSearch, eventFilter, membershipFilter, selectedDate]);
//   const pageSwitching = pageSwitchingRaw || filterSwitching;
//   const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const listTopRef = useRef<HTMLSpanElement | null>(null);
//   const goToPage = (updater: number | ((p: number) => number)) => {
//     setCurrentPage(updater as any);
//     scrollListIntoView(listTopRef.current);
//     setPageSwitching(true);
//     if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
//     pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
//   };
//   useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
//   const itemsPerPage = 6;

//   const [reviewingEventId, setReviewingEventId] = useState<number | null>(null);
//   const [reviewRating, setReviewRating] = useState(0);
//   const [reviewHoverRating, setReviewHoverRating] = useState(0);
//   const [reviewComment, setReviewComment] = useState("");
//   const [submittingReview, setSubmittingReview] = useState(false);
//   const [reviewError, setReviewError] = useState<string | null>(null);
//   const [justSubmittedEventId, setJustSubmittedEventId] = useState<number | null>(null);

//   useEffect(() => {
//     if (justSubmittedEventId === null) return;
//     const timer = setTimeout(() => setJustSubmittedEventId(null), 4000);
//     return () => clearTimeout(timer);
//   }, [justSubmittedEventId]);

//   // Re-evaluates the open / locked states while the page is open.
//   const [nowMs, setNowMs] = useState(() => Date.now());
//   useEffect(() => {
//     const h = setInterval(() => setNowMs(Date.now()), 15000);
//     return () => clearInterval(h);
//   }, []);
//   const closesAtMs = (ev: Event) => {
//     const end = new Date(ev.event_end || ev.date).getTime();
//     return end ? end + feedbackRules.close_after_hours * 3600000 : 0;
//   };
//   const windowOpen = (ev: Event) => !closesAtMs(ev) || nowMs < closesAtMs(ev);
//   const canEdit = (entry?: { edit_until?: number } | null) => !!entry && nowMs < (entry.edit_until ?? 0);
//   const fmtTime = (ms: number) => new Date(ms).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

//   const getAttendanceForEvent = (eventId: number) =>
//     attendanceRecords.find((r) => Number(r.eventId) === Number(eventId));

//   const getFeedbackForEvent = (eventId: number) =>
//     myFeedback.find((f) => Number(f.event_id) === Number(eventId));

//   const canReviewEvent = (eventId: number) => {
//     const attendance = getAttendanceForEvent(eventId);
//     if (!attendance) return false;
//     if (attendance.status === "complete") return true;
//     if (attendance.status !== "incomplete") return false;
//     const event = allEvents.find((ev) => ev.id === eventId);
//     if (!event?.event_end) return false;
//     return new Date(event.event_end).getTime() <= Date.now();
//   };

//   // "Why couldn't you attend?" -- for finished events the member has no
//   // check-in for (and that are meant for them).
//   const getAbsenceForEvent = (eventId: number) => myAbsences.find((r) => Number(r.event_id) === Number(eventId));
//   const canGiveReason = (ev: Event) => {
//     const att = getAttendanceForEvent(ev.id);
//     if (att && att.status !== "missed") return false;
//     const end = new Date(ev.event_end || ev.date).getTime();
//     if (!end || end > Date.now()) return false;
//     if (ev.membership_ids?.length && !userMemberships.some((m) => ev.membership_ids!.includes(m.id))) return false;
//     return !!getAbsenceForEvent(ev.id) || windowOpen(ev);
//   };
//   const [reasonEventId, setReasonEventId] = useState<number | null>(null);
//   const [reasonKey, setReasonKey] = useState("");
//   const [reasonComment, setReasonComment] = useState("");
//   const [submittingReason, setSubmittingReason] = useState(false);
//   const [reasonError, setReasonError] = useState<string | null>(null);
//   const startReason = (eventId: number) => {
//     const existing = getAbsenceForEvent(eventId);
//     setReasonEventId(eventId);
//     setReasonKey(existing?.reason ?? "");
//     setReasonComment(existing?.comment ?? "");
//     setReasonError(null);
//   };
//   const submitReason = async (eventId: number) => {
//     if (!reasonKey) return;
//     setSubmittingReason(true);
//     setReasonError(null);
//     try {
//       const res = await api.post("/feedback/absence", { event_id: eventId, reason: reasonKey, comment: reasonComment.trim() || undefined });
//       const saved = res.data?.absence;
//       onAbsenceSubmitted?.({
//         ...(getAbsenceForEvent(eventId) ?? {}),
//         id: saved?.id ?? Date.now(),
//         event_id: eventId,
//         reason: reasonKey,
//         comment: reasonComment.trim() || null,
//         updated_at: new Date().toISOString(),
//         edits_count: (() => {
//           const prevA = getAbsenceForEvent(eventId);
//           return (prevA?.edits_count ?? 0) + (prevA && (prevA.reason !== reasonKey || (prevA.comment ?? "") !== (reasonComment.trim() || "")) ? 1 : 0);
//         })(),
//         edit_until: getAbsenceForEvent(eventId)?.edit_until ?? Date.now() + feedbackRules.edit_window_minutes * 60000,
//       });
//       setReasonEventId(null);
//     } catch (err) {
//       setReasonError(apiErrorMessage(err, t("absFailed")));
//     } finally {
//       setSubmittingReason(false);
//     }
//   };

//   const startReview = (eventId: number) => {
//     const existing = getFeedbackForEvent(eventId);
//     setReviewingEventId(eventId);
//     setReviewRating(existing?.rating ?? 0);
//     setReviewComment(existing?.comment ?? "");
//     setReviewHoverRating(0);
//     setReviewError(null);
//     setJustSubmittedEventId(null);
//   };

//   const cancelReview = () => {
//     setReviewingEventId(null);
//     setReviewRating(0);
//     setReviewComment("");
//     setReviewError(null);
//   };

//   const submitReview = async (eventId: number) => {
//     setConfirmReviewEventId(null);
//     if (reviewRating < 1) return;
//     const wasEdit = !!getFeedbackForEvent(eventId);
//     setSubmittingReview(true);
//     setReviewError(null);
//     try {
//       const res = await api.post("/feedback", {
//         event_id: eventId,
//         rating: reviewRating,
//         comment: reviewComment || undefined,
//       });
//       const saved = res.data?.feedback;
//       const prev = getFeedbackForEvent(eventId);
//       onFeedbackSubmitted?.({
//         ...(prev ?? {}),
//         id: saved?.id ?? Date.now(),
//         event_id: eventId,
//         rating: reviewRating,
//         comment: reviewComment || null,
//         updated_at: new Date().toISOString(),
//         edits_count: (prev?.edits_count ?? 0) + (prev && (prev.rating !== reviewRating || (prev.comment ?? "") !== (reviewComment.trim() || "")) ? 1 : 0),
//         edit_until: prev?.edit_until ?? Date.now() + feedbackRules.edit_window_minutes * 60000,
//       });
//       setReviewingEventId(null);
//       setJustSubmittedEventId(eventId);
//       setReviewSavedKind(wasEdit ? "updated" : "added");
//       setReviewSavedOpen(true);
//     } catch (err) {
//       setReviewError(apiErrorMessage(err, t("submitReviewFailed")));
//     } finally {
//       setSubmittingReview(false);
//     }
//   };

//   const formatTime = (dateTimeStr: string): string => {
//     if (!dateTimeStr) return "";
//     const date = new Date(dateTimeStr);
//     if (isNaN(date.getTime())) return "";
//     let hours = date.getHours();
//     const minutes = date.getMinutes();
//     const ampm = hours >= 12 ? 'PM' : 'AM';
//     hours = hours % 12;
//     if (hours === 0) hours = 12;
//     return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
//   };

//   const formatDateOnly = (dateTimeStr: string): string => {
//     if (!dateTimeStr) return "";
//     return dateTimeStr.split(" ")[0];
//   };

//   const getStartOfWeek = (date: Date) => {
//     const d = new Date(date);
//     const day = d.getDay();
//     d.setDate(d.getDate() - day);
//     d.setHours(0, 0, 0, 0);
//     return d;
//   };

//   const getEndOfWeek = (date: Date) => {
//     const d = getStartOfWeek(date);
//     d.setDate(d.getDate() + 6);
//     d.setHours(23, 59, 59, 999);
//     return d;
//   };

//   const filteredEvents = useMemo(() => {
//     const today = new Date();
//     let result = [...allEvents];
//     if (eventFilter === "upcoming") result = result.filter((e) => new Date(e.date) >= today);
//     else if (eventFilter === "past") result = result.filter((e) => new Date(e.date) < today);

//     if (membershipFilter !== "all") {
//       const selectedId = Number(membershipFilter);
//       result = result.filter((e) => e.membership_ids?.includes(selectedId));
//     }

//     if (eventSearch.trim()) {
//       result = result.filter((e) =>
//         matchesSearch(eventSearch, e.title, e.date, e.location, e.description)
//       );
//     }

//     // Date filter: keep only events that start on the picked day.
//     if (selectedDate) {
//       result = result.filter((e) => String(e.date || "").split(/[ T]/)[0] === selectedDate);
//     }

//     // Order the WHOLE list before it is paginated, so page 1 always opens with
//     // what matters now and the order never shuffles between pages:
//     //   1. This week, still to come / happening  -- soonest first
//     //   2. This week, already finished           -- most recent first
//     //   3. Later than this week                  -- soonest first
//     //   4. Before this week                      -- most recent first
//     const nowMs = Date.now();
//     const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
//     const wkStart = getStartOfWeek(dayStart).getTime();
//     const wkEnd = getEndOfWeek(dayStart).getTime();
//     const startMs = (e: { date: string }) => new Date(e.date).getTime() || 0;
//     const endMs = (e: { date: string; event_end?: string | null }) => {
//       const end = e.event_end ? new Date(e.event_end).getTime() : NaN;
//       return Number.isNaN(end) ? startMs(e) : end;
//     };
//     const bucket = (e: { date: string; event_end?: string | null }) => {
//       const st = startMs(e);
//       if (st >= wkStart && st <= wkEnd) return endMs(e) >= nowMs ? 0 : 1;
//       return st > wkEnd ? 2 : 3;
//     };
//     result.sort((a, b) => {
//       const ba = bucket(a), bb = bucket(b);
//       if (ba !== bb) return ba - bb;
//       return (ba === 0 || ba === 2) ? startMs(a) - startMs(b) : startMs(b) - startMs(a);
//     });
//     return result;
//   }, [allEvents, eventFilter, membershipFilter, eventSearch, selectedDate]);

//   const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
//   const paginatedEvents = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredEvents, currentPage, itemsPerPage]);

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [eventSearch, eventFilter, membershipFilter, selectedDate]);

//   // Arriving from a notification card: clear the filters, open the page that
//   // holds the event, scroll to it and flash it so it is easy to spot.
//   const [focusTick, setFocusTick] = useState(0);
//   const [flashId, setFlashId] = useState<number | null>(null);
//   const pendingFocus = useRef<number | null>(null);
//   useEffect(() => {
//     if (focusEventId == null || loading) return;
//     if (allEvents.some((ev) => ev.id === focusEventId)) {
//       pendingFocus.current = focusEventId;
//       setEventSearch("");
//       setEventFilter("all");
//       setMembershipFilter("all");
//       setSelectedDate("");
//       setFocusTick((n) => n + 1);
//     }
//     onFocusHandled?.();
//   }, [focusEventId, loading]); // eslint-disable-line react-hooks/exhaustive-deps
//   useEffect(() => {
//     const id = pendingFocus.current;
//     if (id == null) return;
//     pendingFocus.current = null;
//     const idx = filteredEvents.findIndex((ev) => ev.id === id);
//     if (idx < 0) return;
//     setCurrentPage(Math.floor(idx / itemsPerPage) + 1);
//     setFlashId(id);
//   }, [focusTick, filteredEvents]); // eslint-disable-line react-hooks/exhaustive-deps
//   useEffect(() => {
//     if (flashId == null) return;
//     const scroll = setTimeout(() => {
//       document.querySelector(`[data-event-id="${flashId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
//     }, 250);
//     const clear = setTimeout(() => setFlashId(null), 3500);
//     return () => { clearTimeout(scroll); clearTimeout(clear); };
//   }, [flashId]);

//   const groupedEvents = useMemo(() => {
//     const groups: Record<string, typeof allEvents> = {};
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const weekStart = getStartOfWeek(today);
//     const weekEnd = getEndOfWeek(today);

//     paginatedEvents.forEach((e) => {
//       const eventDate = new Date(e.date);
//       eventDate.setHours(0, 0, 0, 0);
//       const dateOnly = e.date.split(" ")[0];
//       let sectionKey: string;
//       if (eventDate >= weekStart && eventDate <= weekEnd) sectionKey = THIS_WEEK_KEY;
//       else sectionKey = new Date(dateOnly).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
//       if (!groups[sectionKey]) groups[sectionKey] = [];
//       groups[sectionKey].push(e);
//     });

//     // The events arrive already in their final order (see filteredEvents), and
//     // object keys keep insertion order -- so the sections do too.
//     return groups;
//   }, [paginatedEvents]);

//   return (
//     // <div className="h-full bg-[#0A0E1A] p-4 sm:p-8 flex flex-col"> e rollback ni if dili mugana just below ani
//     <div className="h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8 flex flex-col overflow-y-auto lg:overflow-hidden">
//       {/* Fixed Header */}
//       <div className="flex-shrink-0 pb-6">
//         <div className="w-full">
//           <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("eventsAndAttendance")}</h1>
//           <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("eventsSubtitle")}</p>

//           <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
//             <FilterBar
//               search={{ value: eventSearch, onChange: setEventSearch, placeholder: t("searchEventsPlaceholder") }}
//               filters={[
//                 {
//                   key: "status", label: t("statusColumn"), value: eventFilter, onChange: setEventFilter,
//                   options: [
//                     { value: "all", label: t("allEvents") },
//                     { value: "upcoming", label: t("upcomingEvents") },
//                     { value: "past", label: t("pastEvents") },
//                   ],
//                 },
//                 {
//                   key: "membership", label: t("fltMembership"), value: membershipFilter, onChange: setMembershipFilter, searchable: true, minWidthClass: "min-w-[220px]",
//                   options: [
//                     { value: "all", label: t("allMembershipsOption") },
//                     ...userMemberships.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: String(m.id), label: m.name })),
//                   ],
//                 },
//               ]}
//               count={loading || pageSwitching ? undefined : { shown: filteredEvents.length, total: allEvents.length }}
//               extraChips={selectedDate ? [{ key: "date", label: `${t("fltDateChip")}: ${new Date(selectedDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => setSelectedDate("") }] : []}
//               onClearExtras={() => setSelectedDate("")}
//             >
//               <div className="h-11 shrink-0">
//                 <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 pl-4 pr-4 py-2.5" dark />
//               </div>
//             </FilterBar>
//           </div>

//           {/* PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
//           <div className="flex justify-end mt-4 max-lg:mt-0">
//             {totalPages > 1 && (loading ? null : (
//               <div className="flex items-center gap-2 max-lg:fixed max-lg:bottom-5 max-lg:right-5 max-lg:z-40 max-lg:rounded-full max-lg:border max-lg:border-white/15 max-lg:bg-[#0A0E1A]/95 max-lg:px-3 max-lg:py-2 max-lg:shadow-2xl max-lg:backdrop-blur">
//                 <button
//                   onClick={() => goToPage(p => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   ←
//                 </button>

//                 <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">
//                   {currentPage}
//                 </span>

//                 <button
//                   onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage === totalPages}
//                   className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
//                 >
//                   →
//                 </button>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       {/* Scrollable body — min-h-0 makes overflow-y-auto actually work inside flex-col */}
//       <div className="lg:flex-1 lg:overflow-y-auto lg:min-h-0 pb-24 lg:pb-4">
//         <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
//         {pageSwitching || loading ? (
//           <div className="grid gap-5 md:grid-cols-2">
//             {Array.from({ length: 4 }).map((_, i) => (
//               <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
//                 <Skeleton className="h-4 w-2/3" />
//                 <Skeleton className="h-3 w-1/2" />
//                 <Skeleton className="h-3 w-1/3" />
//               </div>
//             ))}
//           </div>
//         ) : filteredEvents.length === 0 ? (
//           <p className="text-white/40 italic">{t("noEventsMatch")}</p>
//         ) : (
//           <div className="space-y-8">
//             {Object.entries(groupedEvents).map(([dateLabel, eventsInGroup]) => (
//               <div key={dateLabel}>
//                 <h3 className="mb-4 border-b border-white/10 pb-2 text-lg font-bold text-white">
//                   {dateLabel === THIS_WEEK_KEY ? t("thisWeekLabel") : dateLabel}
//                 </h3>
//                 <div className="grid gap-5 md:grid-cols-2">
//                   {eventsInGroup.map((e) => {
//                     const today = new Date();
//                     const isUpcoming = new Date(e.date) >= today;
//                     const memNames = Array.isArray(e.memberships) && e.memberships.length > 0
//                       ? e.memberships.map((m) => m.name)
//                       : Array.isArray(e.membership_ids)
//                         ? e.membership_ids.map((id) => allMemberships.find((m) => m.id === id)?.name).filter(Boolean) as string[]
//                         : [];
//                     const dateOnly = formatDateOnly(e.date);
//                     const endTimeOnly = e.event_end ? formatTime(e.event_end) : "";
//                     const timeOnly = `${formatTime(e.date)}${endTimeOnly ? ` – ${endTimeOnly}` : ""}`;

//                     return (
//                       <div key={e.id} data-event-id={e.id} className={`relative rounded-3xl border-l-4 border-gold-400 border-y border-r p-5 transition-all duration-500 ${flashId === e.id ? "border-[#4FBEB0] bg-[#4FBEB0]/10 ring-2 ring-[#4FBEB0]/60" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"}`}>
//                         <div className="absolute top-4 right-4 flex items-center gap-1.5">
//                           <span className={`w-2.5 h-2.5 rounded-full ${isUpcoming ? "bg-gold-400" : "bg-[#4FBEB0]"}`} />
//                           <span className="text-xs font-medium text-white/50">{isUpcoming ? t("upcomingBadge") : t("pastBadge")}</span>
//                         </div>

//                         <h2 className="pr-20 text-base font-bold text-white">{highlightText(tc(e.title, language as any), eventSearch)}</h2>
//                         <p className="mt-1 text-sm text-white/40">{highlightText(dateOnly, eventSearch)} · {timeOnly}</p>
//                         <p className="mt-1 text-sm text-white/40">{highlightText(tc(e.location, language as any), eventSearch)}</p>
//                         <p className="mt-3 text-sm text-white/70">{highlightText(tc(e.description, language as any), eventSearch)}</p>

//                         <div className="mt-4 flex flex-wrap items-center gap-2">
//                           {memNames.length > 0 ? (
//                             <>
//                               <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
//                                 {t("forLabel")} {memNames.join(", ")}
//                               </span>
//                               <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/50 border border-white/10">
//                                 {t("includedInMembership")}
//                               </span>
//                             </>
//                           ) : (
//                             <span className="rounded-full bg-[#4FBEB0]/15 px-3 py-1 text-xs font-semibold text-[#7DD8CB] border border-[#4FBEB0]/25">
//                               {t("openEventAllResidents")}
//                             </span>
//                           )}
//                         </div>

//                         {canReviewEvent(e.id) && (() => {
//                           const feedback = getFeedbackForEvent(e.id);
//                           const isReviewing = reviewingEventId === e.id;
//                           // Add: dirty once there is anything to save. Edit: dirty only if the
//                           // rating or comment actually differs from what is already saved.
//                           const reviewDirty = feedback
//                             ? reviewRating !== feedback.rating || reviewComment.trim() !== (feedback.comment ?? "").trim()
//                             : reviewRating > 0 || reviewComment.trim() !== "";
//                           return (
//                             <div className="mt-4 pt-4 border-t border-white/10">
//                               {isReviewing ? (
//                                 <div>
//                                   <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">{t("rateThisEventLabel")}</p>
//                                   <div className="flex items-center gap-1">
//                                     {[1, 2, 3, 4, 5].map((n) => (
//                                       <button key={n} type="button"
//                                         onMouseEnter={() => setReviewHoverRating(n)}
//                                         onMouseLeave={() => setReviewHoverRating(0)}
//                                         onClick={() => setReviewRating(n)} className="p-0.5">
//                                         <Star size={22} className={(reviewHoverRating || reviewRating) >= n ? "text-gold-400 fill-gold-400" : "text-white/20"} />
//                                       </button>
//                                     ))}
//                                   </div>
//                                   <textarea value={reviewComment} onChange={(ev) => setReviewComment(ev.target.value)}
//                                     placeholder={t("optionalCommentPlaceholder")} rows={2}
//                                     className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70" />
//                                   {reviewError && <p className="mt-1 text-xs text-red-400">{reviewError}</p>}
//                                   <div className="mt-2 flex gap-2">
//                                     <button type="button" onClick={() => setConfirmReviewEventId(e.id)} disabled={reviewRating < 1 || submittingReview || !reviewDirty}
//                                       className="flex-1 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold py-2 disabled:opacity-50 transition">
//                                       {submittingReview ? t("submittingLabel") : t("submitReviewButton")}
//                                     </button>
//                                     <button type="button" onClick={() => (reviewDirty ? setConfirmCancelReviewOpen(true) : cancelReview())} disabled={submittingReview}
//                                       className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition">
//                                       {t("cancelLabel")}
//                                     </button>
//                                   </div>
//                                 </div>
//                               ) : feedback ? (
//                                 <div>
//                                   <FeedbackComment
//                                     role="member"
//                                     kind="rating"
//                                     item={feedback}
//                                     author={member}
//                                     comment={feedback.comment}
//                                     header={
//                                       <div className="flex items-center gap-1">
//                                         {[1, 2, 3, 4, 5].map((n) => (
//                                           <Star key={n} size={16} className={feedback.rating >= n ? "text-gold-400 fill-gold-400 shrink-0" : "text-white/15 shrink-0"} />
//                                         ))}
//                                       </div>
//                                     }
//                                     actions={
//                                       canEdit(feedback) ? (
//                                         <button type="button" onClick={() => startReview(e.id)} title={t("editReviewTitle")} className="font-semibold text-white/55 transition hover:text-white hover:underline">
//                                           {t("editLabel")}
//                                         </button>
//                                       ) : (
//                                         <span title={t("fbLockedHint").replace("{n}", String(feedbackRules.edit_window_minutes))} className="inline-flex items-center gap-1 text-white/35">
//                                           <Lock className="h-3 w-3" /> {t("fbLocked")}
//                                         </span>
//                                       )
//                                     }
//                                     footer={
//                                       <>
//                                         {canEdit(feedback) && <p className="mt-1 px-1 text-[11px] text-white/40">{t("fbEditUntil").replace("{time}", fmtTime(feedback.edit_until!))}</p>}
//                                         {justSubmittedEventId === e.id && (
//                                           <p className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-[#7DD8CB]">
//                                             <CheckCircle className="h-3.5 w-3.5" /> {t("feedbackSavedConfirmation")}
//                                           </p>
//                                         )}
//                                       </>
//                                     }
//                                     onChange={(patch) => onFeedbackSubmitted?.({ ...feedback, ...patch })}
//                                   />
//                                 </div>
//                               ) : (
//                                 windowOpen(e) ? (
//                                   <div>
//                                     <button type="button" onClick={() => startReview(e.id)}
//                                       className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold px-4 py-2 hover:bg-white/10 transition">
//                                       <Star className="h-4 w-4" /> {t("rateThisEventButton")}
//                                     </button>
//                                     <p className="mt-2 text-[11px] text-white/40">{t("fbOpenUntil").replace("{time}", fmtTime(closesAtMs(e)))}</p>
//                                   </div>
//                                 ) : (
//                                   <p className="flex items-center gap-1.5 text-xs text-white/45"><Lock className="h-3.5 w-3.5" /> {t("fbClosedNote").replace("{n}", String(feedbackRules.close_after_hours))}</p>
//                                 )
//                               )}
//                             </div>
//                           );
//                         })()}

//                         {canGiveReason(e) && (() => {
//                           const absence = getAbsenceForEvent(e.id);
//                           const editing = reasonEventId === e.id || !absence;
//                           return (
//                             <div className="mt-4 pt-4 border-t border-white/10">
//                               {editing ? (
//                                 <div>
//                                   <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">
//                                     <HelpCircle className="h-3.5 w-3.5" /> {t("absTitle")}
//                                   </p>
//                                   <p className="mt-1 text-xs text-white/45">{t("absSubtitle")}</p>
//                                   {!absence && <p className="mt-1 text-[11px] text-white/35">{t("fbOpenUntil").replace("{time}", fmtTime(closesAtMs(e)))}</p>}
//                                   <div className="mt-3 flex flex-wrap gap-2">
//                                     {ABSENCE_REASON_KEYS.map((k) => {
//                                       const on = reasonEventId === e.id && reasonKey === k;
//                                       return (
//                                         <button
//                                           key={k}
//                                           type="button"
//                                           onClick={() => { if (reasonEventId !== e.id) startReason(e.id); setReasonKey(k); }}
//                                           className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? "border-[#4FBEB0] bg-[#4FBEB0]/15 text-[#7DD8CB]" : "border-white/15 text-white/65 hover:bg-white/10"}`}
//                                         >
//                                           {t(`absReason_${k}`)}
//                                         </button>
//                                       );
//                                     })}
//                                   </div>
//                                   {reasonEventId === e.id && (
//                                     <>
//                                       <textarea
//                                         value={reasonComment}
//                                         onChange={(ev) => setReasonComment(ev.target.value)}
//                                         placeholder={t("absCommentPlaceholder")}
//                                         rows={2}
//                                         maxLength={500}
//                                         className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
//                                       />
//                                       {reasonError && <p className="mt-1 text-xs text-red-400">{reasonError}</p>}
//                                       <div className="mt-2 flex gap-2">
//                                         <button
//                                           type="button"
//                                           onClick={() => submitReason(e.id)}
//                                           disabled={!reasonKey || submittingReason || (!!absence && reasonKey === absence.reason && reasonComment.trim() === (absence.comment ?? "").trim())}
//                                           className="flex-1 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold py-2 disabled:opacity-50 transition"
//                                         >
//                                           {submittingReason ? t("submittingLabel") : t("absSubmit")}
//                                         </button>
//                                         {absence && (
//                                           <button type="button" onClick={() => setReasonEventId(null)} disabled={submittingReason} className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition">
//                                             {t("cancelLabel")}
//                                           </button>
//                                         )}
//                                       </div>
//                                     </>
//                                   )}
//                                 </div>
//                               ) : (
//                                 <div>
//                                   <FeedbackComment
//                                     role="member"
//                                     kind="absence"
//                                     item={absence!}
//                                     author={member}
//                                     comment={absence!.comment}
//                                     header={<span className="inline-block rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-0.5 text-xs font-semibold text-gold-300">{t(`absReason_${absence!.reason}`)}</span>}
//                                     actions={
//                                       canEdit(absence) ? (
//                                         <button type="button" onClick={() => startReason(e.id)} className="font-semibold text-white/55 transition hover:text-white hover:underline">
//                                           {t("editLabel")}
//                                         </button>
//                                       ) : (
//                                         <span title={t("fbLockedHint").replace("{n}", String(feedbackRules.edit_window_minutes))} className="inline-flex items-center gap-1 text-white/35">
//                                           <Lock className="h-3 w-3" /> {t("fbLocked")}
//                                         </span>
//                                       )
//                                     }
//                                     footer={canEdit(absence) ? <p className="mt-1 px-1 text-[11px] text-white/40">{t("fbEditUntil").replace("{time}", fmtTime(absence!.edit_until!))}</p> : undefined}
//                                     onChange={(patch) => onAbsenceSubmitted?.({ ...absence!, ...patch })}
//                                   />
//                                 </div>
//                               )}
//                             </div>
//                           );
//                         })()}
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       <ConfirmDialog
//         open={confirmReviewEventId !== null}
//         icon={<Star size={32} />}
//         title={confirmReviewEventId !== null && getFeedbackForEvent(confirmReviewEventId) ? t("confirmUpdateReviewTitle") : t("confirmAddReviewTitle")}
//         body={confirmReviewEventId !== null && getFeedbackForEvent(confirmReviewEventId) ? t("confirmUpdateReviewBody") : t("confirmAddReviewBody")}
//         cancelLabel={t("cancelLabel")}
//         confirmLabel={confirmReviewEventId !== null && getFeedbackForEvent(confirmReviewEventId) ? t("yesUpdateReview") : t("yesAddReview")}
//         onCancel={() => setConfirmReviewEventId(null)}
//         onConfirm={() => confirmReviewEventId !== null && submitReview(confirmReviewEventId)}
//       />
//       <ConfirmDialog
//         open={confirmCancelReviewOpen}
//         icon={<X size={32} />}
//         title={t("confirmCancelReviewTitle")}
//         body={t("confirmCancelReviewBody")}
//         cancelLabel={t("keepEditingLabel")}
//         confirmLabel={t("yesCancelReview")}
//         tone="danger"
//         onCancel={() => setConfirmCancelReviewOpen(false)}
//         onConfirm={() => { setConfirmCancelReviewOpen(false); cancelReview(); }}
//       />
//       <StatusModal
//         open={reviewSavedOpen}
//         type="success"
//         title={t("successTitle")}
//         message={reviewSavedKind === "updated" ? t("reviewUpdatedSuccess") : t("reviewAddedSuccess")}
//         okLabel={t("okLabel")}
//         onClose={() => setReviewSavedOpen(false)}
//       />
//     </div>
//   );
// }

import { scrollListIntoView } from "../../../lib/scrollToList";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Filter,
  Star,
  Pencil,
  CheckCircle,
  X,
  HelpCircle,
  Lock,
  Trash2,
} from "lucide-react";
import FeedbackComment from "../../../components/ui/FeedbackComment";
import type { ResponseFields } from "../../../components/ui/FeedbackComment";
import { ABSENCE_REASON_KEYS } from "../../../lib/absence";
import SearchBar from "../../../components/ui/SearchBar";
import DatePicker from "../../../components/ui/DatePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import FilterBar from "../../../components/ui/FilterBar";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import { tc } from "../../../lib/contentTranslations";
import api, { apiErrorMessage } from "../../../lib/api";
import { matchesSearch } from "../../../lib/search";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";

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

interface FeedbackEntry extends ResponseFields {
  id: number;
  event_id: number;
  rating: number;
  comment: string | null;
  edits_count?: number;
  staff_liked_at?: string | null;
  staff_reply?: string | null;
  staff_replied_at?: string | null;
  is_locked?: boolean;
  edit_until?: number;
  edit_window_minutes?: number;
}

export interface AbsenceEntry extends ResponseFields {
  id: number;
  event_id: number;
  reason: string;
  comment: string | null;
  edits_count?: number;
  staff_liked_at?: string | null;
  staff_reply?: string | null;
  staff_replied_at?: string | null;
  edit_until?: number;
}

interface EventsViewProps {
  allEvents: Event[];
  allMemberships: { id: number; name: string }[];
  userMemberships: { id: number; name: string }[];
  highlightText: (text: string, query: string) => React.ReactNode;
  attendanceRecords?: AttendanceRecord[];
  myFeedback?: FeedbackEntry[];
  onFeedbackSubmitted?: (entry: FeedbackEntry) => void;
  myAbsences?: AbsenceEntry[];
  onAbsenceSubmitted?: (entry: AbsenceEntry) => void;
  focusEventId?: number | null;
  onFocusHandled?: () => void;
  member?: { first_name?: string | null; last_name?: string | null } | null;
  feedbackRules?: { close_after_hours: number; edit_window_minutes: number };
  loading?: boolean;
}

export default function EventsView({
  allEvents,
  allMemberships,
  userMemberships,
  highlightText,
  attendanceRecords = [],
  myFeedback = [],
  onFeedbackSubmitted,
  myAbsences = [],
  onAbsenceSubmitted,
  focusEventId,
  onFocusHandled,
  member,
  feedbackRules,
  loading = false,
}: EventsViewProps) {
  const { t, locale, language } = useLanguage();

  const listTopRef = useRef<HTMLDivElement>(null);

  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [pageSwitching, setPageSwitching] = useState(false);
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToPage = (updater: number | ((p: number) => number)) => {
    setCurrentPage(updater as any);
    setPageSwitching(true);
    if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 350);
    scrollListIntoView(listTopRef.current);
  };

  useEffect(
    () => () => {
      if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
    },
    []
  );

  const itemsPerPage = 6;

  const [reviewingEventId, setReviewingEventId] = useState<number | null>(null);

  const [removeTarget, setRemoveTarget] = useState<{ id: number; eventTitle: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // --- POPUP MODAL STATES ---
  const [showThankYou, setShowThankYou] = useState(false);
  const [showUpdated, setShowUpdated] = useState(false);
  const [isEditSubmit, setIsEditSubmit] = useState(false);

  // Live clock -- ticks every second so the countdown updates without refresh.
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [confirmReviewEventId, setConfirmReviewEventId] = useState<number | null>(null);

  // ---- LOCAL MIRROR STATE ----
  const [localFeedback, setLocalFeedback] = useState<FeedbackEntry[]>([]);
  const [localAbsences, setLocalAbsences] = useState<AbsenceEntry[]>([]);

  const [reasoningEventId, setReasoningEventId] = useState<number | null>(null);
  const [reasonKey, setReasonKey] = useState<string>("");
  const [reasonComment, setReasonComment] = useState("");
  const [submittingReason, setSubmittingReason] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [justSubmittedReasonEventId, setJustSubmittedReasonEventId] = useState<number | null>(null);

  useEffect(() => {
    if (justSubmittedReasonEventId === null) return;
    const timer = setTimeout(() => setJustSubmittedReasonEventId(null), 4000);
    return () => clearTimeout(timer);
  }, [justSubmittedReasonEventId]);

  const getAttendanceForEvent = (eventId: number) =>
    attendanceRecords.find((r) => Number(r.eventId) === Number(eventId));

  const getFeedbackForEvent = (eventId: number) =>
    localFeedback.find((f) => Number(f.event_id) === Number(eventId)) ??
    myFeedback.find((f) => Number(f.event_id) === Number(eventId));

  const getAbsenceForEvent = (eventId: number) =>
    localAbsences.find((a) => Number(a.event_id) === Number(eventId)) ??
    myAbsences.find((a) => Number(a.event_id) === Number(eventId));

  const canReviewEvent = (eventId: number) => {
    const attendance = getAttendanceForEvent(eventId);
    if (!attendance) return false;
    if (attendance.status === "complete") return true;
    if (attendance.status !== "incomplete") return false;

    const event = allEvents.find((ev) => ev.id === eventId);
    if (!event?.event_end) return false;
    return new Date(event.event_end).getTime() <= Date.now();
  };

  const canGiveReason = (ev: Event) => {
    // Mirror FeedbackController::eventIsOver(): event_end → call_time_end → end-of-day on start.
    const start = new Date(ev.date);
    if (isNaN(start.getTime())) return false;

    const end = ev.event_end
      ? new Date(ev.event_end)
      : (ev as any).call_time_end
      ? new Date((ev as any).call_time_end)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);

    if (Date.now() <= end.getTime()) return false; // event hasn't ended yet

    const attendance = getAttendanceForEvent(ev.id);
    if (attendance && (attendance.status === "complete" || attendance.status === "incomplete")) {
      return false; // they attended → rate instead
    }

    return !getAbsenceForEvent(ev.id); // not answered yet
  };

  const startReview = (eventId: number) => {
    const existing = getFeedbackForEvent(eventId);
    setReviewingEventId(eventId);
    setReviewRating(existing?.rating ?? 0);
    setReviewComment(existing?.comment ?? "");
    setReviewHoverRating(0);
    setReviewError(null);
    setIsEditSubmit(!!existing);
  };

  const cancelReview = () => {
    setReviewingEventId(null);
    setReviewRating(0);
    setReviewComment("");
    setReviewError(null);
    setIsEditSubmit(false);
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
      if (saved) {
        const entry = {
          ...saved,
          edit_until: Date.now() + (saved.edit_seconds_left ?? 0) * 1000,
          is_locked: (saved.edit_seconds_left ?? 0) <= 0,
          edit_window_minutes: saved.edit_window_minutes,
        } as FeedbackEntry;

        onFeedbackSubmitted?.(entry);

        setLocalFeedback((prev) => [
          ...prev.filter((f) => Number(f.event_id) !== Number(entry.event_id)),
          entry,
        ]);

        // SHOW THE CORRECT POPUP
        if (isEditSubmit) {
          setShowUpdated(true);
        } else {
          setShowThankYou(true);
        }
      }
      setReviewingEventId(null);
      setConfirmReviewEventId(null);
      setIsEditSubmit(false);
    } catch (err) {
      setReviewError(apiErrorMessage(err, t("submitReviewFailed")));
    } finally {
      setSubmittingReview(false);
    }
  };

  const startReason = (eventId: number) => {
    const existing = getAbsenceForEvent(eventId);
    setReasoningEventId(eventId);
    setReasonKey(existing?.reason ?? "");
    setReasonComment(existing?.comment ?? "");
    setReasonError(null);
    setJustSubmittedReasonEventId(null);
  };

  const cancelReason = () => {
    setReasoningEventId(null);
    setReasonKey("");
    setReasonComment("");
    setReasonError(null);
  };

  const submitReason = async (eventId: number) => {
    if (!reasonKey) return;
    setSubmittingReason(true);
    setReasonError(null);
    try {
      const res = await api.post("/feedback/absence", {
        event_id: eventId,
        reason: reasonKey,
        comment: reasonComment || undefined,
      });
      const saved = res.data?.absence;
      if (saved) {
        const entry = {
          ...saved,
          edit_until: Date.now() + (saved.edit_seconds_left ?? 0) * 1000,
        } as AbsenceEntry;

        onAbsenceSubmitted?.(entry);

        setLocalAbsences((prev) => [
          ...prev.filter((a) => Number(a.event_id) !== Number(entry.event_id)),
          entry,
        ]);
      }
      setReasoningEventId(null);
      setJustSubmittedReasonEventId(eventId);
    } catch (err) {
      setReasonError(apiErrorMessage(err, t("submitReasonFailed") || "Could not save your reason."));
    } finally {
      setSubmittingReason(false);
    }
  };

  const formatTime = (dateTimeStr: string): string => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return "";
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minutesStr = minutes.toString().padStart(2, "0");
    return `${hours}:${minutesStr} ${ampm}`;
  };

  const formatDateOnly = (dateTimeStr: string): string => {
    if (!dateTimeStr) return "";
    return dateTimeStr.split(" ")[0];
  };

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
      result = result.filter((e) => e.membership_ids?.includes(selectedId));
    }

    if (dateFilter) {
      result = result.filter((e) => (e.date ?? "").split(" ")[0] === dateFilter);
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
  }, [allEvents, eventFilter, membershipFilter, dateFilter, eventSearch]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEvents, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [eventSearch, eventFilter, membershipFilter, dateFilter]);

  const THIS_WEEK_KEY = "__THIS_WEEK__";
  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};
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

  useEffect(() => {
    if (focusEventId == null) return;
    onFocusHandled?.();
  }, [focusEventId, onFocusHandled]);

  return (
    <div
      ref={listTopRef}
      className="-m-3 sm:-m-5 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8"
    >
      <div className="space-y-6">
        <div className="px-1 pt-2 pb-4">
          <div className="w-full">
            <h1 className="text-4xl font-black text-white">{t("eventsAndAttendance")}</h1>
            <p className="mt-1 text-sm text-white/50">{t("eventsSubtitle")}</p>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
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
                  icon={
                    <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />
                  }
                  dark
                />

                <FilterDropdown
                  value={membershipFilter}
                  onChange={setMembershipFilter}
                  options={[
                    { value: "all", label: t("allMembershipsOption") },
                    ...userMemberships
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((m) => ({ value: String(m.id), label: m.name })),
                  ]}
                  className="h-11 min-w-[220px] pl-10 pr-8 shrink-0"
                  panelWidthPx={280}
                  icon={
                    <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />
                  }
                  dark
                  searchable
                  searchPlaceholder={t("search")}
                  noResultsLabel={t("noMatchesFoundLabel")}
                />

                <DatePicker
                  value={dateFilter}
                  onChange={setDateFilter}
                  placeholder={t("filterByDate") || "Filter by date"}
                  dark
                  className="h-11 shrink-0"
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-white/40">
              {filteredEvents.length} of {allEvents.length} {t("eventsMatchCount")}
            </p>

            {totalPages > 1 && (
              <div className="flex justify-end mt-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage((p) => Math.max(1, (p as number) - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                  >
                    ←
                  </button>

                  <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
                    {currentPage}
                  </span>

                  <button
                    onClick={() => goToPage((p) => Math.min(totalPages, (p as number) + 1))}
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
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3"
                >
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

                      const memNames =
                        Array.isArray(e.memberships) && e.memberships.length > 0
                          ? e.memberships.map((m) => m.name)
                          : Array.isArray(e.membership_ids)
                          ? (e.membership_ids
                              .map((id) => allMemberships.find((m) => m.id === id)?.name)
                              .filter(Boolean) as string[])
                          : [];

                      const dateOnly = formatDateOnly(e.date);
                      const timeOnly = formatTime(e.date);

                      const feedback = getFeedbackForEvent(e.id);
                      const absence = getAbsenceForEvent(e.id);
                      const isReviewing = reviewingEventId === e.id;
                      const isReasoning = reasoningEventId === e.id;

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
                            {highlightText(tc(e.title, language as any), eventSearch)}
                          </h2>

                          <p className="mt-1 text-sm text-white/40">
                            {highlightText(dateOnly, eventSearch)} · {timeOnly}
                          </p>

                          <p className="mt-1 text-sm text-white/40">
                            {highlightText(tc(e.location, language as any), eventSearch)}
                          </p>

                          <p className="mt-3 text-sm text-white/70">
                            {highlightText(tc(e.description, language as any), eventSearch)}
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

                          {canReviewEvent(e.id) && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              {isReviewing ? (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">
                                    {t("rateThisEventLabel")}
                                  </p>
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
                                        <Star
                                          size={22}
                                          className={
                                            (reviewHoverRating || reviewRating) >= n
                                              ? "text-gold-400 fill-gold-400"
                                              : "text-white/20"
                                          }
                                        />
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
                                  {reviewError && (
                                    <p className="mt-1 text-xs text-red-400">{reviewError}</p>
                                  )}
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmReviewEventId(e.id)}
                                      disabled={reviewRating < 1 || submittingReview}
                                      className="flex-1 rounded-full bg-gold-400 hover:bg-gold-300 text-[#08130F] text-sm font-bold py-2 disabled:opacity-50 transition"
                                    >
                                      {submittingReview
                                        ? t("submittingLabel")
                                        : t("submitReviewButton")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelReview}
                                      disabled={submittingReview}
                                      className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition"
                                    >
                                      {t("cancelLabel")}
                                    </button>
                                  </div>
                                </div>
                              ) : feedback ? (
                                <div>
                                  <FeedbackComment
                                    entry={feedback}
                                    role="member"
                                    member={member}
                                    locked={
                                      feedback.is_locked === true ||
                                      (feedback.edit_until !== undefined &&
                                        feedback.edit_until <= nowTick) ||
                                      (feedback.edit_seconds_left !== undefined &&
                                        feedback.edit_seconds_left <= 0)
                                    }
                                    onEditStart={() => startReview(e.id)}
                                    onRemove={() =>
                                      setRemoveTarget({
                                        id: feedback.id,
                                        eventTitle: e.title,
                                      })
                                    }
                                    onChange={(patch) => {
                                      onFeedbackSubmitted?.({
                                        ...feedback,
                                        ...patch,
                                      } as FeedbackEntry);
                                    }}
                                  />

                                  {(() => {
                                    if (!feedback.created_at || !feedback.edit_window_minutes) return null;
                                    const deadline = new Date(feedback.created_at).getTime() + (feedback.edit_window_minutes * 60_000);
                                    const liveSeconds = Math.max(0, Math.floor((deadline - nowTick) / 1000));
                                    if (liveSeconds <= 0) return null;
                                    const mins = Math.ceil(liveSeconds / 60);
                                    return (
                                      <p className="mt-2 text-xs font-medium text-[#7DD8CB]">
                                        {(t("editableForMinutes") || "Editable for {minutes} more minute(s)").replace(
                                          "{minutes}",
                                          String(mins)
                                        )}
                                      </p>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startReview(e.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold px-4 py-2 hover:bg-white/10 transition"
                                >
                                  <Star className="h-4 w-4" />
                                  {t("rateThisEventButton")}
                                </button>
                              )}
                            </div>
                          )}

                          {/* CHANGED: was `{canGiveReason(e) && (` -- now also renders when an absence entry already exists */}
                          {(canGiveReason(e) || absence) && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              {isReasoning ? (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB] mb-2">
                                    {t("whyCouldntAttend") || "Why couldn't you attend?"}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {ABSENCE_REASON_KEYS.map((k) => (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => setReasonKey(k)}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                          reasonKey === k
                                            ? "border-[#7DD8CB] bg-[#7DD8CB]/20 text-[#7DD8CB]"
                                            : "border-white/15 text-white/60 hover:bg-white/5"
                                        }`}
                                      >
                                        {t(`absenceReason_${k}`) || k}
                                      </button>
                                    ))}
                                  </div>
                                  <textarea
                                    value={reasonComment}
                                    onChange={(ev) => setReasonComment(ev.target.value)}
                                    placeholder={t("optionalCommentPlaceholder")}
                                    rows={2}
                                    className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                                  />
                                  {reasonError && (
                                    <p className="mt-1 text-xs text-red-400">{reasonError}</p>
                                  )}
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => submitReason(e.id)}
                                      disabled={!reasonKey || submittingReason}
                                      className="flex-1 rounded-full bg-gold-400 hover:bg-gold-300 text-[#08130F] text-sm font-bold py-2 disabled:opacity-50 transition"
                                    >
                                      {submittingReason
                                        ? t("submittingLabel")
                                        : t("submitButton") || "Submit"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelReason}
                                      disabled={submittingReason}
                                      className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition"
                                    >
                                      {t("cancelLabel")}
                                    </button>
                                  </div>
                                </div>
                              ) : absence ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1">
                                    Your reason
                                  </p>
                                  <p className="text-sm text-white">
                                    {absence.reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                  </p>
                                  {absence.comment && (
                                    <p className="mt-1 text-sm text-white/70">"{absence.comment}"</p>
                                  )}

                                  <div className="mt-3 flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startReason(e.id)}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/10 transition"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </button>

                                    {(absence.edits_count ?? 0) > 0 && (
                                      <span className="text-[11px] text-white/40">
                                        Edited · {absence.edits_count}×
                                      </span>
                                    )}
                                  </div>

                                  {justSubmittedReasonEventId === e.id && (
                                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#7DD8CB]">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      {t("reasonSavedConfirmation") || "Thank you for letting us know."}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startReason(e.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold px-4 py-2 hover:bg-white/10 transition"
                                >
                                  <HelpCircle className="h-4 w-4" />
                                  {t("couldntAttendButton") ||
                                    "I couldn't attend — tell us why"}
                                </button>
                              )}
                            </div>
                          )}
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
        open={!!removeTarget}
        icon={<Trash2 size={40} />}
        title={t("removeFeedbackTitle") || "Remove feedback?"}
        body={
          <>
            {(
              t("removeFeedbackBody") ||
              'This will remove your feedback for "{event}". This cannot be undone once the edit window closes.'
            ).replace("{event}", removeTarget?.eventTitle ?? "")}
          </>
        }
        cancelLabel={t("cancelLabel") || "Cancel"}
        confirmLabel={t("removeFeedback") || "Remove"}
        tone="danger"
        onCancel={() => {
          if (removeBusy) return;
          setRemoveTarget(null);
          setRemoveError(null);
        }}
        onConfirm={async () => {
          if (!removeTarget || removeBusy) return;
          setRemoveBusy(true);
          setRemoveError(null);
          try {
            await api.delete(`/feedback/${removeTarget.id}`);
            onFeedbackSubmitted?.({
              id: removeTarget.id,
              event_id: 0,
              rating: 0,
              comment: null,
              deleted_at: new Date().toISOString(),
            } as any);
            setLocalFeedback((prev) => prev.filter((f) => f.id !== removeTarget.id));
            setRemoveTarget(null);
          } catch (err) {
            setRemoveError(apiErrorMessage(err));
            setRemoveTarget(null);
          } finally {
            setRemoveBusy(false);
          }
        }}
      />

      {removeError && (
        <StatusModal
          open={true}
          type="error"
          title={t("errorTitle") || "Error"}
          message={removeError}
          okLabel={t("okLabel") || "OK"}
          onClose={() => setRemoveError(null)}
        />
      )}

      <ConfirmDialog
        open={confirmReviewEventId !== null}
        icon={<Star size={40} />}
        title={t("submitReviewConfirmTitle") || "Submit this review?"}
        body={
          t("submitReviewConfirmBody") ||
          "You can still edit or remove it for a short time after submitting."
        }
        cancelLabel={t("cancelLabel") || "Cancel"}
        confirmLabel={t("submitReviewButton") || "Submit"}
        tone="brand"
        onCancel={() => setConfirmReviewEventId(null)}
        onConfirm={() => {
          if (confirmReviewEventId !== null) {
            submitReview(confirmReviewEventId);
          }
        }}
      />

      {/* --- THANK YOU POPUP (New Submit) --- */}
      <StatusModal
        open={showThankYou}
        type="success"
        title={t("successTitle") || "Success"}
        message={t("feedbackSubmittedSuccess") || "Thank you for your feedback!"}
        okLabel={t("okLabel") || "OK"}
        onClose={() => setShowThankYou(false)}
      />

      {/* --- FEEDBACK UPDATED POPUP (Edit Submit) --- */}
      <StatusModal
        open={showUpdated}
        type="success"
        title={t("successTitle") || "Success"}
        message={t("feedbackUpdatedSuccess") || "Feedback updated successfully!"}
        okLabel={t("okLabel") || "OK"}
        onClose={() => setShowUpdated(false)}
      />
    </div>
  );
}