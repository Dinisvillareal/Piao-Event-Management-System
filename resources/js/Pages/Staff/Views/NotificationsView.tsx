import React, { useState, useEffect, useMemo } from "react";
import { Filter, Users, Bell } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";

interface Membership {
    id: number;
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
    memberships: Membership[];
    highlightText: (text: string, query: string) => React.ReactNode;
}

export default function NotificationsView({ memberships, highlightText }: NotificationsViewProps) {
    const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [targetFilter, setTargetFilter] = useState<string>("all-residents");

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

    const formatDate = (dateStr: string): string => {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Parse message to extract event title and actual message
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
        <div className="space-y-6">
            <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
                <h1 className="text-4xl font-black text-[#005f63]">Notifications & Announcements</h1>
                <p className="mt-1 text-sm text-[#667777]">
                    View all announcements sent to residents.
                </p>

                <div className="mt-4 flex items-stretch gap-4 w-full">
                    <div className="flex-1">
                        <SearchBar
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Search notifications by title or message..."
                        />
                    </div>

                    <div className="flex gap-3">
                        <div className="relative h-full">
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                            >
                                <option value="all">All Notifications</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="past">Past</option>
                            </select>
                            <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                        </div>

                        <div className="relative h-full">
                            <select
                                value={targetFilter}
                                onChange={(e) => setTargetFilter(e.target.value)}
                                className="h-full pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-base shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
                            >
                                <option value="all-residents">All Residents</option>
                                {memberships.map((m: Membership) => (
                                    <option key={m.id} value={String(m.id)}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                            <Users className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
                        </div>
                    </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                    {filteredNotifications.length} notification(s) found
                </p>
            </div>

            <div className="px-1 space-y-2">
                {filteredNotifications.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                        <Bell size={40} className="mx-auto mb-3 text-[#005f63]/40" />
                        <p>No notifications match your current filters.</p>
                    </div>
                ) : (
                    filteredNotifications.map((n) => {
                        const { title, actualMessage } = parseMessage(n);
                        const targetText = n.target_name || 'All Residents';
                        
                        return (
                            <div
                                key={n.id}
                                className="relative rounded-3xl bg-white px-6 py-4 border-l-4 border-l-[#ecd862] border-y border-r border-gray-200 transition-all duration-300 ease-out hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.25)] hover:-translate-y-1 hover:bg-gray-50"
                            >
                                <div className="flex items-center justify-between gap-4 w-full min-h-[44px]">
                                    <div className="flex-1 min-w-0 flex items-center gap-2.5 text-base flex-wrap sm:flex-nowrap">
                                        <span className="font-medium text-gray-800 whitespace-nowrap shrink-0">To:</span>
                                        <span className="truncate text-gray-700">
                                            {highlightText(targetText, searchQuery)}
                                        </span>
                                        <span className="text-gray-400 shrink-0">•</span>
                                        <span className="truncate font-semibold text-[#005f63]">
                                            {highlightText(title, searchQuery)}
                                        </span>
                                        {actualMessage && (
                                            <>
                                                <span className="text-gray-400 shrink-0">—</span>
                                                <span className="truncate text-gray-600">
                                                    {highlightText(actualMessage, searchQuery)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-sm text-gray-500 whitespace-nowrap">
                                        {formatDate(n.created_at)}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}