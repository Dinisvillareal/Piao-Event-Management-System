import { useState, useMemo, useEffect } from "react";
import SearchBar from "../../../Components/UI/SearchBar";
import { Bell, XCircle, AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";

interface Notification {
    id: number;
    title: string;
    message: string;
    created_at: string;
    is_updated: boolean;
    updated_at_notification: string | null;
    read: boolean;
    type?: string; // Add this for event_deleted type
    event?: {
        id: number;
        name: string;
        description: string;
        location: string;
        event_start: string;
        event_end: string | null;
        deleted_at?: string | null; // For soft-deleted events
    };
}

interface NotificationsViewProps {
    highlightText: (text: string, query: string) => React.ReactNode;
}

export default function NotificationsView({ highlightText }: NotificationsViewProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [notificationSearch, setNotificationSearch] = useState("");
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

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
        
        // ✅ Check if event is deleted before opening modal
        if (notification.type === 'event_deleted' || !notification.event || notification.event?.deleted_at) {
            alert('⚠️ We apologize for the inconvenience.\n\nThis event has been cancelled or deleted.\nNo further details are available.');
            return;
        }
        
        setSelectedNotification(notification);
    };

    const formatDate = (dateStr: string): string => {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const formatTime = (dateStr: string): string => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        if (!notificationSearch.trim()) return notifications;
        const q = notificationSearch.toLowerCase();
        return notifications.filter((n) =>
            n.title.toLowerCase().includes(q) ||
            n.message.toLowerCase().includes(q)
        );
    }, [notifications, notificationSearch]);

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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    // ✅ Check if event is deleted for styling
    const isEventDeleted = (notification: Notification) => {
        return notification.type === 'event_deleted' || !notification.event || notification.event?.deleted_at;
    };

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
                <h1 className="text-4xl font-black text-[#005f63]">Notifications</h1>
                <p className="mt-1 text-sm text-[#667777]">
                    Official announcements, updates, and reminders from barangay staff.
                </p>

                <div className="mt-4">
                    <SearchBar
                        value={notificationSearch}
                        onChange={setNotificationSearch}
                        placeholder="Search notifications by title or message..."
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        {filteredNotifications.length} of {notifications.length} notification(s) match
                    </p>
                </div>
            </div>

            <div className="px-1 space-y-2">
                {filteredNotifications.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
                        <Bell size={40} className="mx-auto mb-3 text-[#005f63]/40" />
                        <p>No notifications found.</p>
                    </div>
                ) : (
                    filteredNotifications.map((n) => {
                        const isRead = n.read;
                        const isDeleted = isEventDeleted(n);
                        const { staffName, title, actualMessage } = parseMessage(n.message);
                        
                        return (
                            <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                className={`relative rounded-3xl px-6 py-4 border-l-4 transition-all duration-300 ease-out ${
                                    isDeleted 
                                        ? 'border-l-gray-400 bg-gray-100 opacity-75 cursor-not-allowed'
                                        : 'border-l-[#ecd862] cursor-pointer hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.25)] hover:-translate-y-1'
                                } border-y border-r border-gray-200 ${
                                    !isRead && !isDeleted
                                        ? 'bg-[#f7f2e8] hover:bg-[#fef8e8]'
                                        : 'bg-white hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-4 w-full min-h-[44px]">
                                    <div className="flex-1 min-w-0 flex items-center gap-2.5 text-base flex-wrap sm:flex-nowrap">
                                        {isDeleted && (
                                            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full flex items-center gap-1 shrink-0">
                                                <AlertTriangle size={12} />
                                                Cancelled
                                            </span>
                                        )}
                                        
                                        {staffName && !isDeleted && (
                                            <span className={`whitespace-nowrap shrink-0 ${!isRead ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                                                {highlightText(staffName, notificationSearch)}
                                            </span>
                                        )}
                                        
                                        {staffName && !isDeleted && <span className="text-gray-400 shrink-0">•</span>}
                                        
                                        <span className={`truncate ${!isRead && !isDeleted ? 'font-bold text-[#005f63]' : isDeleted ? 'text-gray-500 line-through' : 'font-semibold text-[#005f63]'}`}>
                                            {highlightText(title, notificationSearch)}
                                        </span>
                                        
                                        {actualMessage && !isDeleted && (
                                            <>
                                                <span className="text-gray-400 shrink-0">—</span>
                                                <span className={`truncate ${!isRead ? 'text-gray-800' : 'text-gray-600'}`}>
                                                    {highlightText(actualMessage, notificationSearch)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className={`shrink-0 text-sm whitespace-nowrap ${!isRead && !isDeleted ? 'font-bold text-gray-700' : 'text-gray-400'}`}>
                                        {formatDate(n.created_at)}
                                    </div>
                                </div>
                                
                                {isDeleted && (
                                    <p className="text-sm text-gray-400 mt-2 pl-2">
                                        This event has been cancelled. We apologize for the inconvenience.
                                    </p>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Event Details Modal - Only shows for non-deleted events */}
            {selectedNotification && selectedNotification.event && !selectedNotification.event.deleted_at && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-0"
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
                    onClick={handleBackdropClick}
                >
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl relative mx-4 sm:mx-auto">
                        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center rounded-t-3xl z-10">
                            <h2 className="text-xl font-bold text-[#005f63]">Notification Details</h2>
                            <button
                                onClick={closeModal}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <h3 className="text-2xl font-black text-[#005f63]">
                                    {selectedNotification.event.name}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {formatDate(selectedNotification.event.event_start)} at {formatTime(selectedNotification.event.event_start)}
                                </p>
                                <p className="text-sm text-gray-500">
                                    📍 {selectedNotification.event.location}
                                </p>
                            </div>

                            <div className="pt-2">
                                <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
                                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">
                                    {selectedNotification.event.description || "No description provided."}
                                </p>
                            </div>

                            <div className="pt-2">
                                <h4 className="font-semibold text-gray-700 mb-1">Notification Message</h4>
                                <p className="text-sm text-teal-700 bg-teal-50 p-3 rounded-xl border border-teal-100">
                                    {parseMessage(selectedNotification.message).actualMessage || selectedNotification.message}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}