import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Filter } from 'lucide-react';
import SearchBar from '../../../Components/UI/SearchBar';

interface TrashedItem {
  id: string | number;
  type: 'event' | 'resident' | 'membership' | 'notification';
  name: string;
  deletedAt: string;
  deletedBy: string;
  originalData?: any;
}

export default function ArchiveView() {
  const [allTrashedItems, setAllTrashedItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const formatTimeOnly = (dateTimeStr?: string) => {
    if (!dateTimeStr) return '';
    const match = dateTimeStr.match(/^(.*?)(\d{1,2}:\d{2}(:\d{2})?)(.*)$/);
    if (!match) return dateTimeStr;
    const [, beforeTime, timePart, , afterTime] = match;
    const [h, m, s = '00'] = timePart.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const newTime = `${hours}:${m}:${s} ${ampm}`;
    return `${beforeTime}${newTime}${afterTime}`;
  };

  const formatTime12Hour = (timeStr?: string) => {
    if (!timeStr) return '';
    const [h, m, s = '00'] = timeStr.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${hours}:${m}:${s} ${ampm}`;
  };

  const fetchArchivedItems = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/archived', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const normalized = data.map((item: any) => ({
          id: item.id,
          type: item.type === 'user' ? 'resident' : item.type,
          name: item.name || item.title || 'Unnamed',
          deletedAt: formatTimeOnly(item.deleted_at || item.deletedAt),
          deletedBy: item.deleted_by || item.deletedBy,
          originalData: item.original_data || item
        }));
        setAllTrashedItems(normalized);
      }
    } catch (error) {
      console.error('Error fetching archived items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: TrashedItem) => {
    if (!confirm(`Restore "${item.name}"?\n\nThis item will become active again.`)) return;

    setRestoringId(item.id);
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      const decodedToken = token ? decodeURIComponent(token) : '';

      // ✅ notification type sends as 'event' — id is already event_id from backend
      const restoreType = item.type === 'notification' ? 'event' : item.type;

      const response = await fetch('/api/archive/restore', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        },
        body: JSON.stringify({
          type: restoreType,
          id: item.id
        })
      });

      if (response.ok) {
        alert('Item restored successfully!');
        fetchArchivedItems();
      } else {
        const result = await response.json();
        alert(result.message || 'Failed to restore');
      }
    } catch (error) {
      console.error('Error restoring:', error);
      alert('An error occurred');
    } finally {
      setRestoringId(null);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = allTrashedItems;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.deletedBy.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allTrashedItems, typeFilter, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [typeFilter, searchQuery]);
  useEffect(() => { fetchArchivedItems(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fixed Header */}
      <div className="sticky top-0 z-40 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <div>
            <h1 className="text-4xl font-black text-[#005f63]">Trash / Archive</h1>
            <p className="mt-1 text-sm text-[#667777]">All deleted records are stored here. You can restore them.</p>
          </div>

          {/* Search and Filter Row */}
          <div className="mt-4 flex items-center gap-4 w-full">
            <div className="flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, type, or deleted by..."
              />
            </div>
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">All Types</option>
                <option value="membership">Memberships</option>
                <option value="event">Events</option>
                <option value="resident">Residents</option>
                <option value="notification">Notifications</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredItems.length} item(s) found — showing {itemsPerPage} per page
          </p>

          {totalPages > 1 && (
            <div className="flex justify-end mt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >←</button>
                <span className="h-8 w-8 rounded-full bg-[#005f63] text-white shadow-sm flex items-center justify-center text-sm font-semibold">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-gray-300 bg-white text-[#005f63] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005f63] hover:text-white hover:border-[#005f63] transition-all active:scale-95"
                >→</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="pl-1">
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#005f63]/20 bg-white p-10 text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p>No deleted items found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-[#005f63]">Type</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">Name / Title</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">Deleted At</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">Deleted By</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => (
                  <tr key={`${item.type}-${item.id}-${index}`} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.type === 'membership' ? 'bg-orange-100 text-orange-700' :
                        item.type === 'event'      ? 'bg-teal-100 text-teal-700' :
                        item.type === 'resident'   ? 'bg-green-100 text-green-700' :
                        item.type === 'notification' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-800">{item.name}</td>
                    <td className="p-3 text-gray-500">{item.deletedAt}</td>
                    <td className="p-3 text-gray-500">{item.deletedBy}</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={restoringId === item.id}
                        className="p-2 rounded-full hover:bg-orange-50 transition text-orange-600 active:bg-orange-100 disabled:opacity-50"
                        title="Restore"
                      >
                        {restoringId === item.id ? (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-orange-600"></div>
                        ) : (
                          <RefreshCw size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
