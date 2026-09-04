import React, { useState, useEffect, useMemo } from "react";
import { Filter, Users, Bell, X, Send, MapPin, Calendar, Clock, MessageSquare, FileText, Smartphone, Home } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";


interface Membership {
   id: string | number;
   name: string;
   description: string;
}


interface Event {
   id: number;
   name: string;
   description?: string;
   event_start: string;
   event_end?: string;
   location?: string;
   membership_ids: number[];
}


interface Notification {
   id: number;
   title: string;
   message: string;
   created_at: string;
   is_updated: boolean;
   updated_at_notification: string | null;
   target_name: string;
   target_membership_id: number | null;
   recipient_count: number;
   read: boolean;
   event?: Event;
}


interface NotificationsViewProps {
   memberships?: Membership[];
   highlightText: (text: string, query: string) => React.ReactNode;
}


export default function NotificationsView({ memberships = [], highlightText }: NotificationsViewProps) {
                       const { t } = useLanguage();
   const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
   const [loading, setLoading] = useState<boolean>(true);
   const [searchQuery, setSearchQuery] = useState<string>("");
   const [dateFilter, setDateFilter] = useState<string>("all");
   const [targetFilter, setTargetFilter] = useState<string>("all-residents");
   const [currentPage, setCurrentPage] = useState<number>(1);
   const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
   const itemsPerPage = 10;


   useEffect(() => {
       fetchAllNotifications();
   }, []);


   const fetchAllNotifications = async (): Promise<void> => {
       setLoading(true);
       try {
           const response = await api.get('/notifications/staff', { params: { per_page: 1000 } });
           const data = response.data;
           const notificationsData = Array.isArray(data) ? data : (data.data || []);
           setAllNotifications(notificationsData);
       } catch (error) {
           console.error('Error fetching notifications:', error);
       } finally {
           setLoading(false);
       }
   };

   // Adviser recommendation: "Notify by household — head of household — SMS
   // contact number per household" — a staff-facing view of what was sent.
   const [smsLogs, setSmsLogs] = useState<any[]>([]);
   const [smsLoading, setSmsLoading] = useState<boolean>(true);

   const fetchSmsLogs = async (): Promise<void> => {
       setSmsLoading(true);
       try {
           const response = await api.get('/notifications/sms-logs', { params: { per_page: 20 } });
           const data = response.data;
           setSmsLogs(Array.isArray(data) ? data : (data.data || []));
       } catch (error) {
           console.error('Error fetching SMS logs:', error);
       } finally {
           setSmsLoading(false);
       }
   };

   useEffect(() => {
       fetchSmsLogs();
   }, []);


   const filteredNotifications = useMemo(() => {
       let filtered = [...allNotifications];


       if (searchQuery.trim()) {
           const q = searchQuery.toLowerCase();
           filtered = filtered.filter(n =>
               n.title.toLowerCase().includes(q) ||
               n.message.toLowerCase().includes(q)
           );
       }


       if (dateFilter !== 'all') {
           const now = new Date();
           if (dateFilter === 'upcoming') {
               filtered = filtered.filter(n => {
                   if (!n.event?.event_start) return false;
                   return new Date(n.event.event_start) > now;
               });
           } else if (dateFilter === 'past') {
               filtered = filtered.filter(n => {
                   if (!n.event?.event_start) return false;
                   return new Date(n.event.event_start) < now;
               });
           }
       }


       if (targetFilter !== 'all-residents') {
           const targetId = parseInt(targetFilter);
           filtered = filtered.filter(n => {
               const membershipIds = n.event?.membership_ids || [];
               return membershipIds.includes(targetId);
           });
       }


       return filtered;
   }, [allNotifications, searchQuery, dateFilter, targetFilter]);


   // Pagination logic
   const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
   const paginatedNotifications = useMemo(() => {
       const startIndex = (currentPage - 1) * itemsPerPage;
       return filteredNotifications.slice(startIndex, startIndex + itemsPerPage);
   }, [filteredNotifications, currentPage, itemsPerPage]);


   // Reset to first page when filters change
   useEffect(() => {
       setCurrentPage(1);
   }, [searchQuery, dateFilter, targetFilter]);


   // For card view: DD/MM/YYYY
   const formatDateCard = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = String(d.getMonth() + 1).padStart(2, '0');
       const year = d.getFullYear();
       return `${day}/${month}/${year}`;
   };


   // For modal view: DD MMM YYYY, HH:MM am/pm
   const formatDateModal = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString('en-US', { month: 'short' });
       const year = d.getFullYear();
       const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
       return `${day} ${month} ${year}, ${time}`;
   };


   // Format event date for modal display (without time)
   const formatEventDate = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString('en-US', { month: 'short' });
       const year = d.getFullYear();
       return `${day} ${month} ${year}`;
   };


   // Format event time for modal display
   const formatEventTime = (dateStr: string): string => {
       const d = new Date(dateStr);
       return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
   };


   const parseMessage = (notification: Notification): { title: string; actualMessage: string } => {
       const message = notification.message;


       const parts = message.split(' • ');
       if (parts.length >= 2) {
           const rest = parts.slice(1).join(' • ');


           if (rest.includes(' — ')) {
               const restParts = rest.split(' — ');
               const title = restParts[0];
               const actualMessage = restParts.slice(1).join(' — ');
               return { title, actualMessage };
           }
           return { title: rest, actualMessage: '' };
       }
       return { title: message, actualMessage: '' };
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
                       <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("notificationsAndAnnouncements")}</h1>
                       <p className="text-xs sm:text-sm text-[#667777] mt-1">{t("staffNotificationsSubtitle")}</p>
                   </div>
               </div>


               <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4 w-full">
                   <div className="flex-1">
                       <SearchBar
                           value={searchQuery}
                           onChange={setSearchQuery}
                           placeholder={t("searchNotificationsPlaceholder")}
                       />
                   </div>


                   <div className="flex flex-wrap gap-3 items-stretch">
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


                       <div className="flex items-center gap-2">
                           <span className="text-sm font-medium text-gray-700">{t("toColon")}</span>
                           <div className="relative h-full">
                               <select
                                   value={targetFilter}
                                   onChange={(e) => setTargetFilter(e.target.value)}
                                   className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                               >
                                   <option value="all-residents">{t("allResidentsOption")}</option>
                                   {memberships.slice().sort((a: Membership, b: Membership) => a.name.localeCompare(b.name)).map((m: Membership) => (
                                       <option key={m.id} value={String(m.id)}>
                                           {m.name}
                                       </option>
                                   ))}
                               </select>
                               <Users className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                           </div>
                       </div>
                   </div>
               </div>


               <p className="mt-2 text-xs text-gray-500">
                   {filteredNotifications.length} {t("notificationsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
               </p>


               {/* ✅ PAGINATION - ← 1 → STYLE */}
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
                           const { title, actualMessage } = parseMessage(n);
                           const targetText = n.target_name || t("allResidentsOption");


                           return (
                               <div
                                   key={n.id}
                                   onClick={() => setSelectedNotification(n)}
                                   className="cursor-pointer relative rounded-2xl sm:rounded-3xl bg-white px-5 sm:px-6 py-6 sm:py-7 border-l-4 border-l-[#ecd862] border-y border-r border-gray-200 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.18)] hover:-translate-y-1 hover:bg-gray-50"
                               >
                                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                       <div className="flex-1 min-w-0">
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                                               <div className="flex items-center gap-2 flex-wrap">
                                                   <span className="font-medium text-gray-800 shrink-0 text-xs sm:text-sm">{t("toColon")}</span>
                                                   <span className="text-gray-700 break-words text-xs sm:text-sm">
                                                       {highlightText(targetText, searchQuery)}
                                                   </span>
                                               </div>
                                               <span className="text-gray-400 hidden sm:block">•</span>
                                               <div className="flex-1 mt-1.5 sm:mt-0">
                                                   <div className="flex flex-wrap items-center gap-1.5">
                                                       <span className="font-semibold text-[#005f63] text-xs sm:text-sm">
                                                           {highlightText(title, searchQuery)}
                                                       </span>
                                                       {actualMessage && (
                                                           <>
                                                               <span className="text-gray-400">—</span>
                                                               <span className="text-gray-600 break-words text-xs sm:text-sm">
                                                                   {highlightText(actualMessage, searchQuery)}
                                                               </span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                           </div>
                                       </div>
                                       {/* Card date: DD/MM/YYYY */}
                                       <div className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
                                           {formatDateCard(n.created_at)}
                                       </div>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               )}
           </div>

           {/* Adviser recommendation: household-head SMS delivery log */}
           <div className="px-1 sm:px-2 pb-6">
               <div className="rounded-3xl border border-[#ddd5ca] bg-white p-5">
                   <div className="flex items-center gap-2 mb-1">
                       <Smartphone className="h-5 w-5 text-[#005f63]" />
                       <h2 className="text-lg font-bold text-[#005f63]">{t("householdSmsDeliveries")}</h2>
                   </div>
                   <p className="text-xs text-gray-500 mb-4">
                       {t("householdSmsDesc")}
                   </p>
                   {smsLoading ? (
                       <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
                   ) : smsLogs.length === 0 ? (
                       <p className="text-sm text-gray-400 italic text-center py-6">{t("noSmsSentYet")}</p>
                   ) : (
                       <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                           {smsLogs.map((log: any) => (
                               <div key={log.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                                   <div className="min-w-0 flex items-center gap-2">
                                       {log.user?.is_household_head && <span title={t("householdHeadTitle")}><Home className="h-4 w-4 text-orange-500 shrink-0" /></span>}
                                       <div className="min-w-0">
                                           <p className="text-sm font-medium text-gray-800 truncate">
                                               {log.user ? `${log.user.first_name} ${log.user.last_name}` : log.to_number} · {log.to_number}
                                           </p>
                                           <p className="text-xs text-gray-500 truncate">{log.event?.name ?? "—"}</p>
                                       </div>
                                   </div>
                                   <span className={`px-2 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                                       log.status === 'sent' ? 'bg-green-100 text-green-800'
                                       : log.status === 'failed' ? 'bg-red-100 text-red-700'
                                       : 'bg-gray-100 text-gray-600'
                                   }`}>
                                       {log.status === 'simulated' ? t("loggedNoGateway") : log.status}
                                   </span>
                               </div>
                           ))}
                       </div>
                   )}
               </div>
           </div>


           {/* Notification Detail Modal */}
           {selectedNotification && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                   <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl transform transition-all">
                       <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl z-10">
                           <h3 className="text-lg font-bold text-[#005f63]">{t("notificationDetails")}</h3>
                           <button
                               onClick={() => setSelectedNotification(null)}
                               className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                           >
                               <X size={18} className="text-gray-500" />
                           </button>
                       </div>


                       <div className="px-6 py-5 space-y-4">
                           {/* Recipient and Sent Info */}
                           <div className="flex items-center justify-between w-full">
                               <span className="text-sm text-gray-800">
                                   {t("recipientColon")} {selectedNotification.target_name || t("allResidentsOption")}
                               </span>
                               <div className="flex items-center gap-2 text-gray-600">
                                   <Send size={16} className="text-[#005f63]" />
                                   <span className="text-sm">{formatDateModal(selectedNotification.created_at)}</span>
                               </div>
                           </div>


                           {/* Event Details */}
                           {selectedNotification.event && (
                               <div className="space-y-3 pt-2 border-t border-gray-100">
                                   <div className="flex items-start gap-3 text-gray-700">
                                       <Calendar size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium">{t("dateColon")}</span>{' '}
                                           <span>{formatEventDate(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   <div className="flex items-start gap-3 text-gray-700">
                                       <Clock size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium">{t("timeColon")}</span>{' '}
                                           <span>{formatEventTime(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {selectedNotification.event.location && (
                                       <div className="flex items-start gap-3 text-gray-700">
                                           <MapPin size={16} className="text-[#005f63] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium">{t("locationColon")}</span>{' '}
                                               <span>{selectedNotification.event.location}</span>
                                           </div>
                                       </div>
                                   )}

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
                                           {parseMessage(selectedNotification).actualMessage ||
                                            (selectedNotification.event?.name && selectedNotification.event.name)}
                                       </p>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
           )}
       </div>
   );
}