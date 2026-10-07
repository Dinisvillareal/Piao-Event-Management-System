import React, { useState, useEffect, useMemo, useRef } from "react";
import { Filter, Users, Bell, X, Send, MapPin, Calendar, Clock, MessageSquare, FileText, Smartphone, Home } from "lucide-react";
import SearchBar from "../../../components/ui/SearchBar";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import Skeleton from "../../../components/ui/Skeleton";
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
                       const { t, locale } = useLanguage();
   const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
   const [loading, setLoading] = useState<boolean>(true);
   const [searchQuery, setSearchQuery] = useState<string>("");
   const [dateFilter, setDateFilter] = useState<string>("all");
   const [targetFilter, setTargetFilter] = useState<string>("all-residents");
   const [currentPage, setCurrentPage] = useState<number>(1);
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
       const month = d.toLocaleString(locale, { month: 'short' });
       const year = d.getFullYear();
       const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
       return `${day} ${month} ${year}, ${time}`;
   };


   // Format event date for modal display (without time)
   const formatEventDate = (dateStr: string): string => {
       const d = new Date(dateStr);
       const day = String(d.getDate()).padStart(2, '0');
       const month = d.toLocaleString(locale, { month: 'short' });
       const year = d.getFullYear();
       return `${day} ${month} ${year}`;
   };


   // Format event time for modal display
   const formatEventTime = (dateStr: string): string => {
       const d = new Date(dateStr);
       return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
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


   const dateFilterOptions = [
       { value: "all", label: t("allNotifications") },
       { value: "upcoming", label: t("upcomingOption") },
       { value: "past", label: t("pastOption") },
   ];

   const targetFilterOptions = useMemo(() => [
       { value: "all-residents", label: t("allResidentsOption") },
       ...memberships
           .slice()
           .sort((a: Membership, b: Membership) => a.name.localeCompare(b.name))
           .map((m: Membership) => ({ value: String(m.id), label: m.name })),
   ], [memberships, t]);

   if (loading) {
       // Skeleton shaped like the real page -- title, search/filter row,
       // then a stack of notification-card placeholders -- instead of a
       // bare centered spinner.
       return (
           <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 space-y-6">
               <div className="space-y-2">
                   <Skeleton className="h-8 w-72" />
                   <Skeleton className="h-4 w-56" />
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
       <div className="-m-3 sm:-m-6 h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8 flex flex-col relative">
           {/* Fixed Header - Never scrolls */}
           <div className="flex-shrink-0 pb-6 px-1 sm:px-2 shadow-b-sm">
               <div className="flex items-center justify-between">
                   <div>
                       <h1 className="text-2xl sm:text-4xl font-black text-white">{t("notificationsAndAnnouncements")}</h1>
                       <p className="text-xs sm:text-sm text-white/50 mt-1">{t("staffNotificationsSubtitle")}</p>
                   </div>
               </div>


               <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4 w-full">
                   <div className="flex-1">
                       <SearchBar
                           value={searchQuery}
                           onChange={setSearchQuery}
                           placeholder={t("searchNotificationsPlaceholder")}
                           dark
                       />
                   </div>


                   <div className="flex flex-wrap gap-3 items-stretch">
                       <FilterDropdown
                           value={dateFilter}
                           onChange={setDateFilter}
                           options={dateFilterOptions}
                           className="h-full pl-10 pr-8"
                           icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 pointer-events-none" />}
                           dark
                       />

                       <div className="flex items-center gap-2">
                           <span className="text-sm font-medium text-white/60">{t("toColon")}</span>
                           <FilterDropdown
                               value={targetFilter}
                               onChange={setTargetFilter}
                               options={targetFilterOptions}
                               align="right"
                               panelWidthPx={256}
                               className="h-full pl-10 pr-8"
                               icon={<Users className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 pointer-events-none" />}
                               dark
                           />
                       </div>
                   </div>
               </div>


               <p className="mt-2 text-xs text-white/40">
                   {filteredNotifications.length} {t("notificationsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
               </p>


               {/* ✅ PAGINATION - ← 1 → STYLE */}
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

                           <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-semibold">
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
                   <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-white/50">
                       <Bell size={40} className="mx-auto mb-3 text-white/20" />
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
                                   className="cursor-pointer relative rounded-2xl sm:rounded-3xl bg-white/[0.04] px-5 sm:px-6 py-6 sm:py-7 border-l-4 border-l-gold-400 border-y border-r border-white/10 transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.35)] hover:-translate-y-1 hover:bg-white/[0.07]"
                               >
                                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                       <div className="flex-1 min-w-0">
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm">
                                               <div className="flex items-center gap-2 flex-wrap">
                                                   <span className="font-medium text-white shrink-0 text-xs sm:text-sm">{t("toColon")}</span>
                                                   <span className="text-white/70 break-words text-xs sm:text-sm">
                                                       {highlightText(targetText, searchQuery)}
                                                   </span>
                                               </div>
                                               <span className="text-white/30 hidden sm:block">•</span>
                                               <div className="flex-1 mt-1.5 sm:mt-0">
                                                   <div className="flex flex-wrap items-center gap-1.5">
                                                       <span className="font-semibold text-[#7DD8CB] text-xs sm:text-sm">
                                                           {highlightText(title, searchQuery)}
                                                       </span>
                                                       {actualMessage && (
                                                           <>
                                                               <span className="text-white/30">—</span>
                                                               <span className="text-white/60 break-words text-xs sm:text-sm">
                                                                   {highlightText(actualMessage, searchQuery)}
                                                               </span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                           </div>
                                       </div>
                                       {/* Card date: DD/MM/YYYY */}
                                       <div className="shrink-0 text-xs text-white/40 whitespace-nowrap">
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
               <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                   <div className="flex items-center gap-2 mb-1">
                       <Smartphone className="h-5 w-5 text-white/40" />
                       <h2 className="text-lg font-bold text-white">{t("householdSmsDeliveries")}</h2>
                   </div>
                   <p className="text-xs text-white/50 mb-4">
                       {t("householdSmsDesc")}
                   </p>
                   {smsLoading ? (
                       <div className="space-y-2">
                           {Array.from({ length: 3 }).map((_, i) => (
                               <Skeleton key={i} className="h-[52px] rounded-2xl" />
                           ))}
                       </div>
                   ) : smsLogs.length === 0 ? (
                       <p className="text-sm text-white/40 italic text-center py-6">{t("noSmsSentYet")}</p>
                   ) : (
                       <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                           {smsLogs.map((log: any) => (
                               <div key={log.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
                                   <div className="min-w-0 flex items-center gap-2">
                                       {log.user?.is_household_head && <span title={t("householdHeadTitle")}><Home className="h-4 w-4 text-orange-400 shrink-0" /></span>}
                                       <div className="min-w-0">
                                           <p className="text-sm font-medium text-white truncate">
                                               {log.user ? `${log.user.first_name} ${log.user.last_name}` : log.to_number} · {log.to_number}
                                           </p>
                                           <p className="text-xs text-white/40 truncate">{log.event?.name ?? "—"}</p>
                                       </div>
                                   </div>
                                   <span className={`px-2 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                                       log.status === 'sent' ? 'bg-green-100 text-green-800'
                                       : log.status === 'failed' ? 'bg-red-500/15 text-red-400'
                                       : 'bg-white/10 text-white/50'
                                   }`}>
                                       {log.status === 'simulated' ? t("loggedNoGateway") : log.status}
                                   </span>
                               </div>
                           ))}
                       </div>
                   )}
               </div>
           </div>


           {/* Notification Detail Modal — dark navy card matching the rest of
               the app's popups (StatusModal / ConfirmDialog) instead of the
               white card this used to be. */}
           {selectedNotification && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                   <div className="bg-[#0A0E1A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl transform transition-all">
                       <div className="sticky top-0 bg-[#0A0E1A] px-6 py-4 border-b border-white/10 flex items-center justify-between rounded-t-3xl z-10">
                           <h3 className="text-lg font-bold text-white">{t("notificationDetails")}</h3>
                           <button
                               onClick={() => setSelectedNotification(null)}
                               className="p-2 rounded-full hover:bg-white/10 transition-colors"
                           >
                               <X size={18} className="text-white/50" />
                           </button>
                       </div>


                       <div className="px-6 py-5 space-y-4">
                           {/* Recipient and Sent Info */}
                           <div className="flex items-center justify-between w-full">
                               <span className="text-sm text-white/70">
                                   {t("recipientColon")} {selectedNotification.target_name || t("allResidentsOption")}
                               </span>
                               <div className="flex items-center gap-2 text-white/50">
                                   <Send size={16} className="text-[#4FBEB0]" />
                                   <span className="text-sm">{formatDateModal(selectedNotification.created_at)}</span>
                               </div>
                           </div>


                           {/* Event Details */}
                           {selectedNotification.event && (
                               <div className="space-y-3 pt-2 border-t border-white/10">
                                   <div className="flex items-start gap-3 text-white/70">
                                       <Calendar size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium text-white">{t("dateColon")}</span>{' '}
                                           <span>{formatEventDate(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   <div className="flex items-start gap-3 text-white/70">
                                       <Clock size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                       <div className="text-sm">
                                           <span className="font-medium text-white">{t("timeColon")}</span>{' '}
                                           <span>{formatEventTime(selectedNotification.event.event_start)}</span>
                                       </div>
                                   </div>

                                   {selectedNotification.event.location && (
                                       <div className="flex items-start gap-3 text-white/70">
                                           <MapPin size={16} className="text-[#4FBEB0] mt-0.5 flex-shrink-0" />
                                           <div className="text-sm">
                                               <span className="font-medium text-white">{t("locationColon")}</span>{' '}
                                               <span>{selectedNotification.event.location}</span>
                                           </div>
                                       </div>
                                   )}

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