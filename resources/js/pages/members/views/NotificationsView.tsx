import { useState, useMemo, useEffect } from "react";
import SearchBar from "../../../components/ui/SearchBar";
import { Bell, X, Send, MapPin, Calendar, Clock, MessageSquare, FileText, AlertTriangle, Filter } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../../i18n/LanguageContext";


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
   }, []);


   const fetchNotifications = async () => {
       setLoading(true);
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

       // Status filter: All / Read / Unread
       if (statusFilter === 'read') {
           filtered = filtered.filter(n => n.read);
       } else if (statusFilter === 'unread') {
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
           <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
           </div>
       );
   }


   return (
       <div className="h-full flex flex-col relative">
           {/* Fixed Header - Never scrolls */}
           <div className="flex-shrink-0 bg-[#fcfcf9] pt-2 pb-6 px-1 sm:px-2 shadow-b-sm">
               <div className="flex items-center justify-between">
                   <div>
                       <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("notify")}</h1>
                       <p className="text-xs sm:text-sm text-[#667777] mt-1">
                           {t("notificationsSubtitle")}
                       </p>
                   </div>
               </div>


               <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4 w-full">
                   <div className="flex-1">
                       <SearchBar
                           value={notificationSearch}
                           onChange={setNotificationSearch}
                           placeholder={t("searchNotificationsPlaceholder")}
                       />
                   </div>

                   <div className="flex gap-3 items-stretch">
                       {/* Date Filter */}
                       <div className="relative h-full">
                           <select
                               value={dateFilter}
                               onChange={(e) => setDateFilter(e.target.value)}
                               className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                           >
                               <option value="all">{t("allNotifications")}</option>
                               <option value="upcoming">{t("upcomingOption")}</option>
                               <option value="past">{t("pastOption")}</option>
                           </select>
                           <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                       </div>

                       {/* Status Filter */}
                       <div className="relative h-full">
                           <select
                               value={statusFilter}
                               onChange={(e) => setStatusFilter(e.target.value)}
                               className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                           >
                               <option value="all">{t("allStatus")}</option>
                               <option value="read">{t("readOption")}</option>
                               <option value="unread">{t("unreadOption")}</option>
                           </select>
                           <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                       </div>
                   </div>
               </div>

               <p className="mt-2 text-xs text-gray-500">
                   {filteredNotifications.length} {t("notificationsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
               </p>


               {/* ✅ PAGINATION - ← 1 → STYLE (SINGLE NUMBER, RIGHT ALIGNED) */}
               <div className="flex justify-end mt-4">
                   {totalPages > 1 && (
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
                   )}
               </div>
           </div>


           {/* Scrollable Content Area - Only notifications scroll */}
           <div className="flex-1 overflow-y-auto px-1 sm:px-2 pb-4">
               {filteredNotifications.length === 0 ? (
                   <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                       <Bell size={40} className="mx-auto mb-3 text-[#005f63]/40" />
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
                                   className={`cursor-pointer relative rounded-2xl sm:rounded-3xl px-5 sm:px-6 py-6 sm:py-7 border-l-4 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.18)] hover:-translate-y-1 ${
                                       isDeleted
                                           ? 'border-l-gray-400 bg-gray-100 opacity-75 cursor-not-allowed hover:bg-gray-100'
                                           : isRead
                                               ? 'border-l-[#ecd862] bg-white hover:bg-gray-50'
                                               : 'border-l-[#ecd862] bg-[#f8f3ee] hover:bg-[#fef8e8]'
                                   } border-y border-r border-gray-200`}
                               >
                                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                       <div className="flex-1 min-w-0">
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                                               {staffName && !isDeleted && (
                                                   <>
                                                       <div className="flex items-center gap-2 flex-wrap">
                                                           <span className="text-gray-700 break-words text-xs sm:text-sm">
                                                               {highlightText(staffName, notificationSearch)}
                                                           </span>
                                                       </div>
                                                       <span className="text-gray-400 hidden sm:block">•</span>
                                                   </>
                                               )}

                                               <div className="flex-1 mt-1.5 sm:mt-0">
                                                   <div className="flex flex-wrap items-center gap-1.5">
                                                       <span className={`font-semibold text-xs sm:text-sm ${
                                                           !isRead && !isDeleted
                                                               ? 'text-[#005f63] font-bold'
                                                               : isDeleted
                                                                   ? 'text-gray-500 line-through'
                                                                   : 'text-[#005f63]'
                                                       }`}>
                                                           {highlightText(title, notificationSearch)}
                                                       </span>
                                                       {actualMessage && !isDeleted && (
                                                           <>
                                                               <span className="text-gray-400">—</span>
                                                               <span className={`text-gray-600 break-words text-xs sm:text-sm ${
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
                                                   <AlertTriangle size={14} className="text-gray-500" />
                                                   <span className="text-xs text-gray-500">{t("eventCancelledNote")}</span>
                                               </div>
                                           )}
                                       </div>

                                       <div className={`shrink-0 text-xs whitespace-nowrap ${
                                           !isRead && !isDeleted ? 'font-bold text-gray-700' : 'text-gray-500'
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


           {/* Notification Detail Modal — with same styling as NotificationView */}
           {selectedNotification && selectedNotification.event && !selectedNotification.event.deleted_at && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                   <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl transform transition-all">
                       <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl z-10">
                           <h3 className="text-lg font-bold text-[#005f63]">{t("notificationDetails")}</h3>
                           <button
                               onClick={closeModal}
                               className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                           >
                               <X size={18} className="text-gray-500" />
                           </button>
                       </div>


                       <div className="px-6 py-5 space-y-4">
                           {/* Staff and Sent Info */}
                           <div className="flex items-center justify-between w-full">
                               <span className="text-sm text-gray-800">
                                   {parseMessage(selectedNotification.message).staffName || t("barangayStaffFallback")}
                               </span>
                               <div className="flex items-center gap-2 text-gray-600">
                                   <Send size={16} />
                                   <span className="text-sm">{formatDateModal(selectedNotification.created_at)}</span>
                               </div>
                           </div>


                           {/* Event Details - Date, Time, Location, and Description */}
                           {selectedNotification.event && (
                               <div className="space-y-3 pt-2 border-t border-gray-100">
                                   {/* Date */}
                                   <div className="flex items-start gap-3 text-gray-700">
                                       <Calendar size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium">{t("dateColon")}</span>{' '}
                                           <span>{formatEventDate(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Time */}
                                   <div className="flex items-start gap-3 text-gray-700">
                                       <Clock size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium">{t("timeColon")}</span>{' '}
                                           <span>{formatEventTime(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {/* Location */}
                                   {selectedNotification.event.location && (
                                       <div className="flex items-start gap-3 text-gray-700">
                                           <MapPin size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium">{t("locationColon")}</span>{' '}
                                               <span>{selectedNotification.event.location}</span>
                                           </div>
                                       </div>
                                   )}

                                   {/* Event Description */}
                                   {selectedNotification.event.description && (
                                       <div className="flex items-start gap-3 text-gray-700">
                                           <FileText size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium">{t("eventDetailsColon")}</span>
                                               <p className="text-gray-600 mt-1">{selectedNotification.event.description}</p>
                                           </div>
                                       </div>
                                   )}
                               </div>
                           )}


                           {/* Message Content */}
                           <div className="space-y-2 pt-2 border-t border-gray-100">
                               <div className="flex items-start gap-3 text-gray-700">
                                   <MessageSquare size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                   <div className="text-sm">
                                       <span className="font-medium">{t("messageColon")}</span>
                                       <p className="text-gray-700 mt-1">
                                           {parseMessage(selectedNotification.message).actualMessage || selectedNotification.message}
                                       </p>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
           )}

           {showCancelledModal && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowCancelledModal(false)}>
                   <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
                       <div className="mb-4 text-orange-500 flex justify-center"><AlertTriangle size={40} /></div>
                       <h3 className="text-xl font-bold text-orange-600 mb-3">{t("eventCancelledTitle")}</h3>
                       <p className="text-[15px] text-gray-600 mb-5">{t("eventCancelledAlert")}</p>
                       <button
                           onClick={() => setShowCancelledModal(false)}
                           className="px-6 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white transition"
                       >
                           {t("okLabel")}
                       </button>
                   </div>
               </div>
           )}
       </div>
   );
}