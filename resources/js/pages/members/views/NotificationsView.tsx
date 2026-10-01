import { useState, useMemo, useEffect, useRef } from "react";
import SearchBar from "../../../components/ui/SearchBar";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import { Bell, X, Send, MapPin, Calendar, Clock, MessageSquare, FileText, AlertTriangle, Filter } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
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
   const { t } = useLanguage();
   const [notifications, setNotifications] = useState<Notification[]>([]);
   const [loading, setLoading] = useState(true);
   const [notificationSearch, setNotificationSearch] = useState("");
   const [dateFilter, setDateFilter] = useState("all"); // All / Upcoming / Past
   const [statusFilter, setStatusFilter] = useState("all"); // All / Read / Unread
   const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
   const [showCancelledModal, setShowCancelledModal] = useState(false);
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


   useEffect(() => {
       fetchNotifications();
       // Quietly re-checks for new notifications every 20s, the same live
       // polling pattern the staff portal's live dashboards use, so this
       // page keeps itself current instead of only ever loading once.
       const poll = setInterval(() => fetchNotifications(true), 20000);
       return () => clearInterval(poll);
   }, []);


   // `silent` skips the full-page spinner -- used by the 20s background poll
   // below, so new notifications simply appear instead of the whole page
   // flashing back to a loading state every 20 seconds.
   const fetchNotifications = async (silent = false) => {
       if (!silent) setLoading(true);
       try {
           const response = await fetch('/notifications', {
               headers: {
                   'Accept': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               credentials: 'include'
           });


           if (response.ok) {
               const data = await response.json();
               setNotifications(Array.isArray(data) ? data : (data.data || []));
           }
       } catch (error) {
           console.error('Error fetching notifications:', error);
       } finally {
           setLoading(false);
       }
   };


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
           }
       } catch (error) {
           console.error('Error marking as read:', error);
       }
   };


   const handleNotificationClick = (notification: Notification) => {
       if (!notification.read) {
           markAsRead(notification.id);
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
       const month = d.toLocaleString('en-US', { month: 'short' });
       const year = d.getFullYear();
       const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
       return `${day} ${month} ${year}, ${time}`;
   };


   const formatEventDate = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString('en-US', { month: 'short' });
       const year = d.getFullYear();
       return `${day} ${month} ${year}`;
   };


   const formatEventTime = (dateStr: string): string => {
       const d = new Date(dateStr);
       return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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


   const filteredNotifications = useMemo(() => {
       let filtered = [...notifications];

       // Search filter
       if (notificationSearch.trim()) {
           const q = notificationSearch.toLowerCase();
           filtered = filtered.filter((n) =>
               n.title.toLowerCase().includes(q) ||
               n.message.toLowerCase().includes(q)
           );
       }

       // Date filter: All / Upcoming / Past
       if (dateFilter !== 'all') {
           const now = new Date();
           if (dateFilter === 'upcoming') {
               filtered = filtered.filter(n =>
                   n.event?.event_start && new Date(n.event.event_start) > now
               );
           } else if (dateFilter === 'past') {
               filtered = filtered.filter(n =>
                   n.event?.event_start && new Date(n.event.event_start) < now
               );
           }
       }

       // Status filter: All / Unread
       if (statusFilter === 'unread') {
           filtered = filtered.filter(n => !n.read);
       }

       return filtered;
   }, [notifications, notificationSearch, dateFilter, statusFilter]);


   // Pagination logic
   const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
   const paginatedNotifications = useMemo(() => {
       const startIndex = (currentPage - 1) * itemsPerPage;
       return filteredNotifications.slice(startIndex, startIndex + itemsPerPage);
   }, [filteredNotifications, currentPage, itemsPerPage]);


   // Reset to first page when filters change
   useEffect(() => {
       setCurrentPage(1);
   }, [notificationSearch, dateFilter, statusFilter]);


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


   if (loading) {
       return (
           <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 space-y-6">
               <div className="space-y-2">
                   <Skeleton className="h-8 w-56" />
                   <Skeleton className="h-4 w-64" />
               </div>
               <Skeleton className="h-11 w-full rounded-xl" />
               <div className="space-y-3">
                   {Array.from({ length: 4 }).map((_, i) => (
                       <Skeleton key={i} className="h-20 rounded-2xl sm:rounded-3xl" />
                   ))}
               </div>
           </div>
       );
   }


   return (
       <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 h-[calc(100vh-73px)] flex flex-col relative">
           {/* Fixed Header - Never scrolls */}
           <div className="flex-shrink-0 pt-2 pb-6 px-1 sm:px-2">
               <div className="flex items-center justify-between">
                   <div>
                       <h1 className="text-2xl sm:text-4xl font-black text-white">{t("notify")}</h1>
                       <p className="text-xs sm:text-sm text-white/50 mt-1">
                           {t("notificationsSubtitle")}
                       </p>
                   </div>
                   {/* Genuinely live -- fetchNotifications(true) silently
                       re-polls every 20s (see effect above). */}
                   <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/50" title={t("liveLabel")}>
                       <span className="relative flex h-2 w-2">
                           <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
                           <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
                       </span>
                       {t("liveLabel")}
                   </span>
               </div>


               <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                   <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                       <div className="flex-1 min-w-[220px]">
                           <SearchBar
                               value={notificationSearch}
                               onChange={setNotificationSearch}
                               placeholder={t("searchNotificationsPlaceholder")}
                               dark
                           />
                       </div>

                       <div className="flex gap-3">
                           {/* Date Filter */}
                           <FilterDropdown
                               value={dateFilter}
                               onChange={setDateFilter}
                               options={[
                                   { value: "all", label: t("allNotifications") },
                                   { value: "upcoming", label: t("upcomingOption") },
                                   { value: "past", label: t("pastOption") },
                               ]}
                               className="h-11 pl-10 pr-8 shrink-0"
                               icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                               dark
                           />

                           {/* Status Filter */}
                           <FilterDropdown
                               value={statusFilter}
                               onChange={setStatusFilter}
                               options={[
                                   { value: "all", label: t("allStatus") },
                                   { value: "unread", label: t("unreadOption") },
                               ]}
                               className="h-11 pl-10 pr-8 shrink-0"
                               icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
                               dark
                           />
                       </div>
                   </div>
               </div>

               <p className="mt-2 text-xs text-white/40">
                   {filteredNotifications.length} {t("notificationsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
               </p>


               {/* PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
               <div className="flex justify-end mt-4">
                   {totalPages > 1 && (
                       <div className="flex items-center gap-2">
                           <button
                               onClick={() => goToPage(p => Math.max(1, p - 1))}
                               disabled={currentPage === 1}
                               className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
                           >
                               ←
                           </button>

                           <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
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
                   )}
               </div>
           </div>


           {/* Scrollable Content Area - Only notifications scroll */}
           <div className="flex-1 overflow-y-auto px-1 sm:px-2 pb-4">
               {pageSwitching ? (
                   <div className="space-y-3">
                       {Array.from({ length: 4 }).map((_, i) => (
                           <Skeleton key={i} className="h-20 rounded-2xl sm:rounded-3xl" />
                       ))}
                   </div>
               ) : filteredNotifications.length === 0 ? (
                   <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-white/40">
                       <Bell size={40} className="mx-auto mb-3 text-white/20" />
                       <p>{t("noNotificationsMatch")}</p>
                   </div>
               ) : (
                   <div className="space-y-3">
                       {paginatedNotifications.map((n) => {
                           const isRead = n.read;
                           const isDeleted = isEventDeleted(n);
                           const { staffName, title, actualMessage } = parseMessage(n.message);

                           return (
                               <div
                                   key={n.id}
                                   onClick={() => handleNotificationClick(n)}
                                   className={`cursor-pointer relative rounded-2xl sm:rounded-3xl px-5 sm:px-6 py-6 sm:py-7 border-l-4 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.35)] hover:-translate-y-1 ${
                                       isDeleted
                                           ? 'border-l-white/20 bg-white/[0.02] opacity-75 cursor-not-allowed hover:bg-white/[0.02]'
                                           : isRead
                                               ? 'border-l-white/15 bg-white/[0.04] hover:bg-white/[0.06]'
                                               : 'border-l-gold-400 bg-gold-400/10 hover:bg-gold-400/[0.15]'
                                   } border-y border-r border-white/10`}
                               >
                                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                       <div className="flex-1 min-w-0">
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                                               {staffName && !isDeleted && (
                                                   <>
                                                       <div className="flex items-center gap-2 flex-wrap">
                                                           <span className="text-white/60 break-words text-xs sm:text-sm">
                                                               {highlightText(staffName, notificationSearch)}
                                                           </span>
                                                       </div>
                                                       <span className="text-white/30 hidden sm:block">•</span>
                                                   </>
                                               )}

                                               <div className="flex-1 mt-1.5 sm:mt-0">
                                                   <div className="flex flex-wrap items-center gap-1.5">
                                                       <span className={`font-semibold text-xs sm:text-sm ${
                                                           !isRead && !isDeleted
                                                               ? 'text-white font-bold'
                                                               : isDeleted
                                                                   ? 'text-white/40 line-through'
                                                                   : 'text-white/80'
                                                       }`}>
                                                           {highlightText(title, notificationSearch)}
                                                       </span>
                                                       {actualMessage && !isDeleted && (
                                                           <>
                                                               <span className="text-white/30">—</span>
                                                               <span className={`text-white/50 break-words text-xs sm:text-sm ${
                                                                   !isRead && !isDeleted ? 'font-medium' : ''
                                                               }`}>
                                                                   {highlightText(actualMessage, notificationSearch)}
                                                               </span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                           </div>
                                           {isDeleted && (
                                               <div className="flex items-center gap-2 mt-2">
                                                   <AlertTriangle size={14} className="text-white/40" />
                                                   <span className="text-xs text-white/40">{t("eventCancelledNote")}</span>
                                               </div>
                                           )}
                                       </div>

                                       <div className={`shrink-0 text-xs whitespace-nowrap ${
                                           !isRead && !isDeleted ? 'font-bold text-white/70' : 'text-white/40'
                                       }`}>
                                           {formatDateCard(n.created_at)}
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
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                   <div className="bg-[#0A0E1A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl transform transition-all">
                       <div className="sticky top-0 bg-[#0A0E1A] px-6 py-4 border-b border-white/10 flex items-center justify-between rounded-t-3xl z-10">
                           <h3 className="text-lg font-bold text-white">{t("notificationDetails")}</h3>
                           <button
                               onClick={closeModal}
                               className="p-2 rounded-full hover:bg-white/10 transition-colors"
                           >
                               <X size={18} className="text-white/50" />
                           </button>
                       </div>


                       <div className="px-6 py-5 space-y-4">
                           {/* Staff and Sent Info */}
                           <div className="flex items-center justify-between w-full">
                               <span className="text-sm text-white/70">
                                   {parseMessage(selectedNotification.message).staffName || t("barangayStaffFallback")}
                               </span>
                               <div className="flex items-center gap-2 text-white/50">
                                   <Send size={16} />
                                   <span className="text-sm">{formatDateModal(selectedNotification.created_at)}</span>
                               </div>
                           </div>


                           {/* Event Details - Date, Time, Location, and Description */}
                           {selectedNotification.event && (
                               <div className="space-y-3 pt-2 border-t border-white/10">
                                   {/* Date */}
                                   <div className="flex items-start gap-3 text-white/70">
                                       <Calendar size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium text-white">{t("dateColon")}</span>{' '}
                                           <span>{formatEventDate(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Time */}
                                   <div className="flex items-start gap-3 text-white/70">
                                       <Clock size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium text-white">{t("timeColon")}</span>{' '}
                                           <span>{formatEventTime(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Location */}
                                   {selectedNotification.event.location && (
                                       <div className="flex items-start gap-3 text-white/70">
                                           <MapPin size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium text-white">{t("locationColon")}</span>{' '}
                                               <span>{selectedNotification.event.location}</span>
                                           </div>
                                       </div>
                                   )}

                                   {/* Event Description */}
                                   {selectedNotification.event.description && (
                                       <div className="flex items-start gap-3 text-white/70">
                                           <FileText size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium text-white">{t("eventDetailsColon")}</span>
                                               <p className="text-white/50 mt-1">{selectedNotification.event.description}</p>
                                           </div>
                                       </div>
                                   )}
                               </div>
                           )}


                           {/* Message Content */}
                           <div className="space-y-2 pt-2 border-t border-white/10">
                               <div className="flex items-start gap-3 text-white/70">
                                   <MessageSquare size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                   <div className="text-sm">
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