import React, { useState, useEffect, useMemo } from "react";
import { Filter, Users, Bell, X, Send } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

interface Membership {
    id: string | number;
    name: string;
    description: string;
}

interface Event {
    id: number;
    name: string;
    event_start: string;
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
            const response = await fetch('/notifications/staff?per_page=1000', {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                const notificationsData = Array.isArray(data) ? data : (data.data || []);
                setAllNotifications(notificationsData);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

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

    // ✅ For card view: DD/MM/YYYY
    const formatDateCard = (dateStr: string): string => {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // ✅ For modal view: DD MMM YYYY, HH:MM am/pm
    const formatDateModal = (dateStr: string): string => {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleString('en-US', { month: 'short' });
        const year = d.getFullYear();
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `${day} ${month} ${year}, ${time}`;
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
                        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">Notifications & Announcements</h1>
                        <p className="text-xs sm:text-sm text-[#667777] mt-1">View all announcements sent to residents.</p>
                    </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4 w-full">
                    <div className="flex-1">
                        <SearchBar
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Search notifications by title or message..."
                        />
                    </div>

                    <div className="flex gap-3 items-stretch">
                        <div className="relative h-full">
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                            >
                                <option value="all">All Notifications</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="past">Past</option>
                            </select>
                            <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">To:</span>
                            <div className="relative h-full">
                                <select
                                    value={targetFilter}
                                    onChange={(e) => setTargetFilter(e.target.value)}
                                    className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                                >
                                    <option value="all-residents">All Residents</option>
                                    {memberships.map((m: Membership) => (
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
                    {filteredNotifications.length} notification(s) found — showing {itemsPerPage} per page
                </p>

                {/* Pagination & Add Button Row — same as Membership page */}
                <div className="flex items-center justify-between mt-8">
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                               disabled={currentPage === 1}
                                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                            >
                                ←
                            </button>
                            <div className="flex gap-2 flex-wrap justify-center">
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`h-8 w-8 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                                                currentPage === pageNum
                                                    ? "bg-[#005f63] text-white shadow-sm"
                                                    : "border border-gray-300 bg-white text-[#005f63] hover:bg-[#005f63] hover:text-white hover:border-[#005f63]"
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                {totalPages > 5 && currentPage < totalPages - 2 && (
                                    <>
                                        <span className="text-gray-400">...</span>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-semibold hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                                        >
                                            {totalPages}
                                        </button>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                            >
                                →
                            </button>
                        </div>
                    )}
                    <div></div>
                </div>
            </div>

            {/* Scrollable Content Area - Only notifications scroll */}
            <div className="flex-1 overflow-y-auto px-1 sm:px-2 pb-4">
                {filteredNotifications.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                        <Bell size={40} className="mx-auto mb-3 text-[#005f63]/40" />
                        <p>No notifications match your current filters.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {paginatedNotifications.map((n) => {
                            const { title, actualMessage } = parseMessage(n);
                            const targetText = n.target_name || 'All Residents';

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
                                                    <span className="font-medium text-gray-800 shrink-0 text-xs sm:text-sm">To:</span>
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
                                        {/* ✅ Card date: DD/MM/YYYY */}
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

            {/* ✅ Notification Detail Modal — exact format you requested */}
            {selectedNotification && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl transform transition-all">
                        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl z-10">
                            <h3 className="text-lg font-bold text-[#005f63]">Notification Details</h3>
                            <button
                                onClick={() => setSelectedNotification(null)}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <X size={18} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {/* Recipient: not bold | Sent icon + datetime aligned right */}
                            <div className="flex items-center justify-between w-full">
                                <span className="text-gray-800">
                                    Recipient: {selectedNotification.target_name || 'All Residents'}
                                </span>
                                <div className="flex items-center gap-2 text-gray-600">
                                    <Send size={16} />
                                    {/* ✅ Modal date: DD MMM YYYY, HH:MM am/pm */}
                                    <span className="text-sm">{formatDateModal(selectedNotification.created_at)}</span>
                                </div>
                            </div>

                            {/* There is an upcoming [Event Title] on [Event Date]. [Message] — with space before title */}
                            <div className="text-gray-800 leading-relaxed">
                                <span className="ml-1">There will be an upcoming </span>
                                <span className="font-medium">
                                    {selectedNotification.event?.name || parseMessage(selectedNotification).title}
                                </span>
                                {selectedNotification.event && (
                                    <>
                                        <span> on </span>
                                        <span className="font-medium">{formatDateCard(selectedNotification.event.event_start)}</span>
                                        <span>. </span>
                                    </>
                                )}
                                <span>{parseMessage(selectedNotification).actualMessage}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
