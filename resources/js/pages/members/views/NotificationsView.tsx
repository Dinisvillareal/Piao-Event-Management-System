import { scrollListIntoView } from "../../../lib/scrollToList";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import { useState, useMemo, useEffect, useRef } from "react";
import SearchBar from "../../../components/ui/SearchBar";
import DatePicker from "../../../components/ui/DatePicker";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import FilterBar from "../../../components/ui/FilterBar";
import SpeedDial from "../../../components/ui/SpeedDial";
import { CheckCheck, Bell, X, Send, MapPin, Calendar, Clock, MessageSquare, FileText, Filter, Heart, MessageSquareReply } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { tc } from "../../../lib/contentTranslations";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";


interface Notification {
   id: number;
   title: string;
   message: string;
   created_at: string;
   is_updated: boolean;
   updated_at_notification: string | null;
   read: boolean;
   type?: string;
   event?: {
       id: number;
       name: string;
       description: string;
       location: string;
       event_start: string;
       event_end: string | null;
       deleted_at?: string | null;
   };
}


interface NotificationsViewProps {
   highlightText: (text: string, query: string) => React.ReactNode;
}


export default function NotificationsView({ highlightText }: NotificationsViewProps) {
   const { t, language, locale } = useLanguage();
   // Only the current page is held here; search, filters and paging are done by the server.
   const [notifications, setNotifications] = useState<Notification[]>([]);
   const [totalMatching, setTotalMatching] = useState(0);
   const [lastPage, setLastPage] = useState(1);
   const [badge, setBadge] = useState({ events: 0, feedback_unread: 0 });
   const [serverEventOptions, setServerEventOptions] = useState<{ value: string; label: string }[]>([]);
   // Announcements about events, and staff hearts/replies on the member's own feedback, are kept apart.
   const [tab, setTab] = useState<"notifications" | "feedback">("notifications");
   const [loading, setLoading] = useState(true);
   const [notificationSearch, setNotificationSearch] = useState("");
   const [dateFilter, setDateFilter] = useState("all"); // All / Upcoming / Past
   const [statusFilter, setStatusFilter] = useState("all"); // All / Read / Unread
   const [eventFilter, setEventFilter] = useState("all"); // All / one specific event
   const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
   const [showCancelledModal, setShowCancelledModal] = useState(false);
   const [currentPage, setCurrentPage] = useState(1);
   // Brief skeleton flash on every page switch, same as Activity Logs --
   // this list paginates client-side so there's nothing to actually wait
   // on, but the flash keeps page switches feeling consistent app-wide.
   const [selectedDate, setSelectedDate] = useState(""); // YYYY-MM-DD, matches the date shown on the card
   const [pageSwitchingRaw, setPageSwitching] = useState(false);
   const filterSwitching = useFilterSwitching([tab, notificationSearch, dateFilter, statusFilter, eventFilter, selectedDate]);
   const pageSwitching = pageSwitchingRaw || filterSwitching;
   const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const listTopRef = useRef<HTMLSpanElement | null>(null);
   const goToPage = (updater: number | ((p: number) => number)) => {
       setCurrentPage(updater as any);
     scrollListIntoView(listTopRef.current);
       setPageSwitching(true);
       if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current);
       pageSwitchTimer.current = setTimeout(() => setPageSwitching(false), 0);
   };
   useEffect(() => () => { if (pageSwitchTimer.current) clearTimeout(pageSwitchTimer.current); }, []);
   const itemsPerPage = 10;


   useEffect(() => {
       if (selectedNotification) {
           document.body.style.overflow = 'hidden';
       } else {
           document.body.style.overflow = 'unset';
       }
       return () => {
           document.body.style.overflow = 'unset';
       };
   }, [selectedNotification]);


   // Quietly re-checks for new notifications every 20s, the same live
   // polling pattern the staff portal's live dashboards use, so this
   // page keeps itself current instead of only ever loading once.
   useEffect(() => {
       const poll = setInterval(() => fetchNotificationsRef.current(true), 20000);
       return () => clearInterval(poll);
   }, []);

   // A new tab / search / filter starts again from page 1; any change reloads from the server.
   const notifFilterKey = `${tab}|${notificationSearch}|${dateFilter}|${statusFilter}|${eventFilter}|${selectedDate}`;
   const prevNotifFilterKey = useRef(notifFilterKey);
   useEffect(() => {
       if (prevNotifFilterKey.current !== notifFilterKey) {
           prevNotifFilterKey.current = notifFilterKey;
           if (currentPage !== 1) { setCurrentPage(1); return; }
       }
       const timer = setTimeout(() => fetchNotificationsRef.current(), 120);
       return () => clearTimeout(timer);
       // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [notifFilterKey, currentPage]);


   // `silent` skips the full-page spinner -- used by the 20s background poll
   // below, so new notifications simply appear instead of the whole page
   // flashing back to a loading state every 20 seconds.
   const notifSeq = useRef(0);
   const fetchNotifications = async (silent = false) => {
       const seq = ++notifSeq.current;
       if (!silent) setLoading(true);
       try {
           const qs = new URLSearchParams({ paged: '1', tab: tab === 'feedback' ? 'feedback' : 'events', page: String(currentPage), per_page: String(itemsPerPage) });
           if (notificationSearch.trim()) qs.set('search', notificationSearch.trim());
           if (dateFilter !== 'all') qs.set('date_filter', dateFilter);
           if (statusFilter !== 'all') qs.set('status', statusFilter);
           if (eventFilter !== 'all') qs.set('event', eventFilter);
           if (selectedDate) qs.set('date', selectedDate);
           const response = await fetch(`/notifications?${qs.toString()}`, {
               headers: {
                   'Accept': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               credentials: 'include'
           });


           if (response.ok) {
               const data = await response.json();
               if (seq !== notifSeq.current) return;
               if ((data.last_page ?? 1) < currentPage) {
                   setCurrentPage(Math.max(1, data.last_page));
                   return;
               }
               setNotifications(Array.isArray(data) ? data : (data.data || []));
               setTotalMatching(data.total ?? 0);
               setLastPage(data.last_page ?? 1);
               if (data.counts) setBadge(data.counts);
               setServerEventOptions(Array.isArray(data.event_options) ? data.event_options : []);
           }
       } catch (error) {
           console.error('Error fetching notifications:', error);
       } finally {
           if (seq === notifSeq.current) setLoading(false);
       }
   };
   const fetchNotificationsRef = useRef(fetchNotifications);
   fetchNotificationsRef.current = fetchNotifications;


   const getCsrfToken = () => {
       const token = document.cookie
           .split('; ')
           .find(row => row.startsWith('XSRF-TOKEN='));
       return token ? decodeURIComponent(token.split('=')[1]) : '';
   };


   const markAsRead = async (id: number) => {
       try {
           const token = getCsrfToken();

           const response = await fetch(`/notifications/${id}/read`, {
               method: 'PUT',
               headers: {
                   'Accept': 'application/json',
                   'Content-Type': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest',
                   'X-XSRF-TOKEN': token
               },
               credentials: 'include'
           });

           if (response.ok) {
               setNotifications(prev =>
                   prev.map(n =>
                       n.id === id ? { ...n, read: true } : n
                   )
               );
               window.dispatchEvent(new Event("member-notifications-changed"));
               fetchNotificationsRef.current(true); // refresh the tab badges (and any "Unread" filter)
           }
       } catch (error) {
           console.error('Error marking as read:', error);
       }
   };


   const handleNotificationClick = (notification: Notification) => {
       if (!notification.read) {
           markAsRead(notification.id);
       }

       // A heart or reply from staff opens the Events page, where it is shown.
       if (notification.type === 'feedback_reply') {
           window.dispatchEvent(new CustomEvent("member:open-page", { detail: { page: "events", eventId: notification.event?.id } }));
           return;
       }

       if (notification.type === 'event_deleted' || !notification.event || notification.event?.deleted_at) {
           setShowCancelledModal(true);
           return;
       }

       setSelectedNotification(notification);
   };


   const formatDateCard = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = String(d.getMonth() + 1).padStart(2, '0');
       const year = d.getFullYear();
       return `${day}/${month}/${year}`;
   };


   const formatDateModal = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString(locale, { month: 'short' });
       const year = d.getFullYear();
       const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
       return `${day} ${month} ${year}, ${time}`;
   };


   const formatEventDate = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString(locale, { month: 'short' });
       const year = d.getFullYear();
       return `${day} ${month} ${year}`;
   };


   const formatEventTime = (dateStr: string): string => {
       const d = new Date(dateStr);
       return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
   };


   const parseMessage = (message: string): { staffName: string; title: string; actualMessage: string } => {
       const parts = message.split(' • ');
       if (parts.length >= 2) {
           const staffName = parts[0];
           const rest = parts.slice(1).join(' • ');

           if (rest.includes(' — ')) {
               const restParts = rest.split(' — ');
               const title = restParts[0];
               const actualMessage = restParts.slice(1).join(' — ');
               return { staffName, title, actualMessage };
           }
           return { staffName, title: rest, actualMessage: '' };
       }
       return { staffName: '', title: message, actualMessage: '' };
   };


   const feedbackUnread = badge.feedback_unread;

   // One entry per event that has at least one notification in this tab, A-Z (from the server).
   const eventFilterOptions = useMemo(
       () => [{ value: "all", label: t("allEvents") }, ...serverEventOptions],
       // eslint-disable-next-line react-hooks/exhaustive-deps
       [serverEventOptions, language]
   );

   const filteredNotifications = { length: totalMatching };
   const totalPages = Math.max(1, lastPage);
   const paginatedNotifications = notifications;


   // The upcoming/past filter only applies to event announcements.
   useEffect(() => { if (tab === 'feedback') setDateFilter('all'); }, [tab]);



   const closeModal = () => {
       setSelectedNotification(null);
   };


   const handleBackdropClick = (e: React.MouseEvent) => {
       if (e.target === e.currentTarget) {
           closeModal();
       }
   };


   useEffect(() => {
       const handleEsc = (e: KeyboardEvent) => {
           if (e.key === 'Escape') {
               closeModal();
           }
       };
       if (selectedNotification) {
           document.addEventListener('keydown', handleEsc);
       }
       return () => document.removeEventListener('keydown', handleEsc);
   }, [selectedNotification]);


   const isEventDeleted = (notification: Notification) => {
       return notification.type === 'event_deleted' || !notification.event || notification.event?.deleted_at;
   };

   return (
       <div className="dash-canvas p-4 sm:p-8 h-[calc(100dvh-73px)] flex flex-col relative overflow-y-auto lg:overflow-visible">
           {/* Fixed Header - Never scrolls */}
           <div className="flex-shrink-0 pb-6 max-sm:pb-3">
               <div className="dash-card rounded-[32px] p-5 sm:p-6 flex items-center justify-between">
                   <div>
                       <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl page-title-gradient page-title-fit">{t("notify")}</h1>
                       <p className="mt-1.5 text-sm text-white/55 max-w-xl">
                           {t("notificationsSubtitle")}
                       </p>
                   </div>
                   {/* Genuinely live -- fetchNotifications(true) silently
                       re-polls every 20s (see effect above). */}
                   <span className="dash-tile dash-mint hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium" title={t("liveLabel")}>
                       <span className="relative flex h-2 w-2">
                           <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
                           <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
                       </span>
                       {t("liveLabel")}
                   </span>
               </div>


               {/* Switcher -- same pill buttons as the staff Notifications page. */}
               <SpeedDial
                   value={tab}
                   items={([
                       { key: "notifications", label: t("notify"), icon: Bell, count: badge.events },
                       { key: "feedback", label: t("memFeedbackTab"), icon: MessageSquare, count: feedbackUnread },
                   ] as const).map((p) => ({ key: p.key, label: p.label, icon: p.icon, count: loading ? undefined : p.count, onSelect: () => setTab(p.key) }))}
               />
               <div className="mt-4 flex flex-wrap items-center gap-2.5 max-sm:hidden">
                   {([
                       { key: "notifications", label: t("notify"), icon: <Bell className="h-4 w-4" />, count: badge.events, always: true },
                       { key: "feedback", label: t("memFeedbackTab"), icon: <MessageSquare className="h-4 w-4" />, count: feedbackUnread, always: false },
                   ] as const).map((p) => (
                       <button
                           key={p.key}
                           type="button"
                           onClick={() => setTab(p.key)}
                           className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition ${
                               tab === p.key
                                   ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] !text-white shadow-sm"
                                   : "dash-card text-white/60 hover:text-white"
                           }`}
                       >
                           {p.icon}
                           {p.label}
                           {(p.always || p.count > 0) && (
                               <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tab === p.key ? "bg-white/20 text-white" : "bg-white/10 text-white/70"}`}>
                                   {loading ? 0 : p.count > 99 ? "99+" : p.count}
                               </span>
                           )}
                       </button>
                   ))}
               </div>

               <div className="mt-4 dash-card tight-after rounded-[32px] p-4 sm:p-5">
                   <FilterBar
                       search={{ value: notificationSearch, onChange: setNotificationSearch, placeholder: t("searchNotificationsPlaceholder") }}
                       filters={[
                           {
                               key: "event", label: t("fltEvent"), value: eventFilter, onChange: setEventFilter, options: eventFilterOptions, searchable: true, minWidthClass: "max-w-[240px]",
                               icon: <Calendar className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />,
                           },
                           ...(tab !== "feedback" ? [{
                               key: "when", label: t("fltWhen"), value: dateFilter, onChange: setDateFilter,
                               options: [
                                   { value: "all", label: t("allNotifications") },
                                   { value: "ongoing", label: t("ongoingBadge") },
                                   { value: "upcoming", label: t("upcomingOption") },
                                   { value: "past", label: t("pastOption") },
                               ],
                           }] : []),
                           {
                               key: "read", label: t("statusColumn"), value: statusFilter, onChange: setStatusFilter,
                               options: [
                                   { value: "all", label: t("allStatus") },
                                   { value: "unread", label: t("unreadOption") },
                                   { value: "read", label: t("readOption") },
                               ],
                           },
                       ]}
                       count={loading || pageSwitching ? undefined : { shown: filteredNotifications.length }}
                       extraChips={selectedDate ? [{ key: "date", label: `${t("fltDateChip")}: ${new Date(selectedDate).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}`, onRemove: () => setSelectedDate("") }] : []}
                       onClearExtras={() => setSelectedDate("")}
                   >
                       <div className="h-11 shrink-0">
                           <DatePicker value={selectedDate} onChange={setSelectedDate} className="h-11 pl-4 pr-4 py-2.5" dark />
                       </div>
                   </FilterBar>
               </div>

               <p className="mt-2 text-xs text-white/40 max-sm:mt-0">{t("showingPerPage").replace("{n}", String(itemsPerPage))}</p>


               {/* PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
               <div className="flex justify-end mt-4 max-lg:mt-0">
                   {totalPages > 1 && (loading ? null : (
                       <div className="flex items-center gap-2 max-lg:fixed max-lg:bottom-5 max-lg:right-5 max-sm:right-auto max-sm:left-4 max-lg:z-40 max-lg:rounded-full max-lg:border max-lg:border-white/15 max-lg:bg-[#0A0E1A]/95 max-lg:px-3 max-lg:py-2 max-lg:shadow-2xl max-lg:backdrop-blur">
                           <button
                               onClick={() => goToPage(p => Math.max(1, p - 1))}
                               disabled={currentPage === 1}
                               className="h-8 w-8 dash-tile rounded-full text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                           >
                               ←
                           </button>

                           <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0B0F14] to-[#18212B] text-white border border-white/10 shadow-md flex items-center justify-center text-sm font-bold">
                               {currentPage}
                           </span>

                           <button
                               onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
                               disabled={currentPage === totalPages}
                               className="h-8 w-8 dash-tile rounded-full text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                           >
                               →
                           </button>
                       </div>
                   ))}
               </div>
           </div>


           {/* Scrollable Content Area - Only notifications scroll */}
           <div className="lg:flex-1 lg:overflow-y-auto pb-24 lg:pb-4">
               <span ref={listTopRef} className="block h-0 w-0 !m-0 scroll-mt-24" />
               {pageSwitching || loading ? (
                   <div className="space-y-3">
                       {Array.from({ length: 4 }).map((_, i) => (
                           <Skeleton key={i} className="h-20 rounded-2xl sm:rounded-3xl" />
                       ))}
                   </div>
               ) : filteredNotifications.length === 0 ? (
                   <div className="dash-tile rounded-[28px] border border-dashed border-white/15 p-10 text-center text-white/50">
                       <Bell size={40} className="mx-auto mb-3 text-white/20" />
                       <p>{t("noNotificationsMatch")}</p>
                   </div>
               ) : (
                   <div className="space-y-3">
                       {paginatedNotifications.map((n) => {
                           if (n.type === 'feedback_reply') {
                               const isLike = /liked/i.test(n.title);
                               const target = /response/i.test(n.title) ? "Response" : "Feedback";
                               const lines = (n.message || "").split(/\r?\n/);
                               const reply = !isLike ? lines.slice(1).join(" ").trim() : "";
                               return (
                                   <div
                                       key={n.id}
                                       role="button"
                                       tabIndex={0}
                                       onClick={() => handleNotificationClick(n)}
                                       onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNotificationClick(n); } }}
                                       className={`cursor-pointer relative dash-row dash-row-white rounded-[28px] px-5 sm:px-6 py-5 sm:py-6 hover:-translate-y-1 active:translate-y-0 active:scale-[0.985] active:duration-100 transition-all duration-250 ease-out hover:ring-1 hover:ring-[#4FBEB0]/60 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 ${
                                           n.read ? '' : 'ring-1 ring-[#F5C451]/60'
                                       }`}
                                   >
                                       <div className="flex items-center gap-4 w-full">
                                           <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isLike ? "bg-red-500/15 text-red-500" : "bg-[#4FBEB0]/15 text-[#2E8E82]"}`}>
                                               {isLike ? <Heart className="h-5 w-5 fill-red-400" /> : <MessageSquareReply className="h-5 w-5" />}
                                           </span>
                                           <div className="min-w-0 flex-1">
                                               <p className={`truncate text-sm ${n.read ? "font-semibold text-white/80" : "font-bold text-white"}`}>
                                                   {t(`memToast${isLike ? "Like" : "Reply"}${target}`)}
                                                   {n.event?.name && <span className="font-normal text-white/60"> {t("memToastOn")} <span className="font-semibold text-white/80">{n.event.name}</span></span>}
                                               </p>
                                               {reply && <p className="mt-1 truncate text-sm italic text-white/70">&ldquo;{reply}&rdquo;</p>}
                                           </div>
                                           <span className={`shrink-0 text-xs whitespace-nowrap ${n.read ? 'text-white/40' : 'font-bold text-white/70'}`}>{formatDateCard(n.created_at)}</span>
                                       </div>
                                   </div>
                               );
                           }
                           const isRead = n.read;
                           const isDeleted = isEventDeleted(n);
                           const parsed = parseMessage(n.message);
                           const cancelledName = n.type === 'event_deleted' ? ((n.title || '').split(/Event Cancelled:\s*/i)[1] || '').trim() : '';
                           const staffName = parsed.staffName || (isDeleted ? t("barangayStaffFallback") : '');
                           const title = cancelledName || parsed.title;
                           const actualMessage = cancelledName ? t("notifCancelledMsg") : parsed.actualMessage;

                           return (
                               <div
                                   key={n.id}
                                   onClick={() => handleNotificationClick(n)}
                                   className={`cursor-pointer relative dash-row dash-row-white rounded-[28px] px-5 sm:px-6 py-5 sm:py-6 hover:-translate-y-1 active:translate-y-0 active:scale-[0.985] active:duration-100 transition-all duration-250 ease-out hover:ring-1 hover:ring-[#4FBEB0]/60 ${
                                       isRead ? '' : 'ring-1 ring-[#F5C451]/60'
                                   }`}
                               >
                                   <div className="flex items-center justify-between gap-3 w-full">
                                       <span className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${isRead ? 'bg-[#2E8E82]/15 text-[#2E8E82] border-[#2E8E82]/30' : 'bg-[#F5C451]/20 text-[#B8860B] border-[#F5C451]/40'}`}>
                                           <Bell className="h-5 w-5" />
                                       </span>
                                       {/* Like the staff card: sender + date on the first row, then title and message on one line
                                           (cut off with "…"). The whole message opens when the card is tapped. */}
                                       <div className="min-w-0 flex-1">
                                           <div className="flex items-center justify-between gap-3">
                                               <p className="min-w-0 truncate text-sm text-white/70">
                                                   {staffName ? highlightText(staffName, notificationSearch) : ""}
                                               </p>
                                               <div className={`shrink-0 text-xs whitespace-nowrap text-right ${
                                                   !isRead && !isDeleted ? 'font-bold text-white/60' : 'text-white/40'
                                               }`}>
                                                   {formatDateCard(n.created_at)}
                                                   {isRead && (
                                                       <span className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-[#2E8E82]">
                                                           <CheckCheck size={13} />
                                                           {t("notifSeen")}
                                                       </span>
                                                   )}
                                               </div>
                                           </div>
                                           <p className="mt-1 truncate text-sm">
                                               <span className={`font-semibold text-[#7DD8CB] ${!isRead ? 'font-bold' : ''}`}>
                                                   {highlightText(title, notificationSearch)}
                                               </span>
                                               {actualMessage && (
                                                   <>
                                                       <span className="mx-1.5 text-white/30">—</span>
                                                       <span className={`text-white/60 ${!isRead && !isDeleted ? 'font-medium' : ''}`}>
                                                           {highlightText(actualMessage, notificationSearch)}
                                                       </span>
                                                   </>
                                               )}
                                           </p>
                                       </div>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               )}
           </div>


           {/* Notification Detail Modal — dark navy card matching the rest of
               the app's popups (StatusModal / ConfirmDialog) instead of the
               white card this used to be. */}
           {selectedNotification && selectedNotification.event && !selectedNotification.event.deleted_at && (
               <div className="notif-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                   <style>{`
                       @keyframes notif-overlay-in { from { opacity: 0 } to { opacity: 1 } }
                       @keyframes notif-pop-in { from { opacity: 0; transform: translateY(18px) scale(0.94) } to { opacity: 1; transform: translateY(0) scale(1) } }
                       .notif-overlay { animation: notif-overlay-in 180ms ease-out both }
                       .notif-pop { animation: notif-pop-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both }
                       @media (prefers-reduced-motion: reduce) { .notif-overlay, .notif-pop { animation: none } }
                   `}</style>
                   <div className="notif-pop bg-[#0A0E1A] border border-white/10 rounded-[24px] sm:rounded-[30px] w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl transform transition-all">
                       <div className="sticky top-0 bg-[#0A0E1A] px-6 py-5 sm:px-8 sm:py-6 border-b border-white/10 flex items-center justify-between rounded-t-[24px] sm:rounded-t-[30px] z-10">
                           <h3 className="text-xl sm:text-2xl font-black text-white">{t("notificationDetails")}</h3>
                           <button
                               onClick={closeModal}
                               className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 transition-colors"
                           >
                               <X size={22} className="text-white/50" />
                           </button>
                       </div>


                       <div className="px-6 py-6 sm:px-8 sm:py-7 space-y-5">
                           {/* Staff and Sent Info */}
                           <div className="flex items-center justify-between w-full">
                               <span className="text-[15px] sm:text-base font-medium text-white/80">
                                   {parseMessage(selectedNotification.message).staffName || t("barangayStaffFallback")}
                               </span>
                               <div className="flex items-center gap-2 text-white/50">
                                   <Send size={18} />
                                   <span className="text-sm sm:text-[15px]">{formatDateModal(selectedNotification.created_at)}</span>
                               </div>
                           </div>


                           {/* Event Details - Date, Time, Location, and Description */}
                           {selectedNotification.event && (
                               <div className="space-y-4 pt-5 border-t border-white/10">
                                   {/* Date */}
                                   <div className="flex items-start gap-3.5 sm:gap-4 text-white/70">
                                       <Calendar size={20} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-[15px] sm:text-base leading-relaxed">
                                           <span className="font-medium text-white">{t("dateColon")}</span>{' '}
                                           <span>{formatEventDate(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Time */}
                                   <div className="flex items-start gap-3.5 sm:gap-4 text-white/70">
                                       <Clock size={20} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-[15px] sm:text-base leading-relaxed">
                                           <span className="font-medium text-white">{t("timeColon")}</span>{' '}
                                           <span>{formatEventTime(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Location */}
                                   {selectedNotification.event.location && (
                                       <div className="flex items-start gap-3.5 sm:gap-4 text-white/70">
                                           <MapPin size={20} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                           <div className="text-[15px] sm:text-base leading-relaxed">
                                               <span className="font-medium text-white">{t("locationColon")}</span>{' '}
                                               <span>{tc(selectedNotification.event.location, language as any)}</span>
                                           </div>
                                       </div>
                                   )}

                                   {/* Event Description */}
                                   {selectedNotification.event.description && (
                                       <div className="flex items-start gap-3.5 sm:gap-4 text-white/70">
                                           <FileText size={20} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                           <div className="text-[15px] sm:text-base leading-relaxed">
                                               <span className="font-medium text-white">{t("eventDetailsColon")}</span>
                                               <p className="text-white/55 mt-1">{tc(selectedNotification.event.description, language as any)}</p>
                                           </div>
                                       </div>
                                   )}
                               </div>
                           )}


                           {/* Message Content */}
                           <div className="space-y-2 pt-5 border-t border-white/10">
                               <div className="flex items-start gap-3.5 sm:gap-4 text-white/70">
                                   <MessageSquare size={20} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                   <div className="text-[15px] sm:text-base leading-relaxed">
                                       <span className="font-medium text-white">{t("messageColon")}</span>
                                       <p className="text-white/70 mt-1">
                                           {parseMessage(selectedNotification.message).actualMessage || selectedNotification.message}
                                       </p>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
           )}

           <StatusModal
               open={showCancelledModal}
               type="warning"
               title={t("eventCancelledTitle")}
               message={t("eventCancelledAlert")}
               okLabel={t("okLabel")}
               onClose={() => setShowCancelledModal(false)}
           />
       </div>
   );
}