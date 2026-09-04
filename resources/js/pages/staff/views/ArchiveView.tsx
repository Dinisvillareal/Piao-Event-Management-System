import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Filter, XCircle, CheckCircle } from 'lucide-react';
import SearchBar from '../../../components/ui/SearchBar';
import { useLanguage } from "../../../i18n/LanguageContext";

interface TrashedItem {
  id: string | number;
  type: 'event' | 'resident' | 'membership' | 'notification' | 'age_bracket' | 'civil_status' | 'inventory_item' | 'expense';
  name: string;
  deletedAt: string;
  deletedBy: string;
  originalData?: any;
}

const TYPE_LABEL_KEYS: Record<TrashedItem["type"], string> = {
  event: "events",
  resident: "residents",
  membership: "memberships",
  notification: "notify",
  age_bracket: "ageBracketsTitle",
  civil_status: "civilStatusesTitle",
  inventory_item: "inventory",
  expense: "expenseTypeLabel",
};

export default function ArchiveView() {
  const { t } = useLanguage();
  const [allTrashedItems, setAllTrashedItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // State for modals
  const [restoreItem, setRestoreItem] = useState<TrashedItem | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleRestoreConfirm = async () => {
    if (!restoreItem) return;

    setRestoringId(restoreItem.id);
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];
      const decodedToken = token ? decodeURIComponent(token) : '';

      const restoreType = restoreItem.type === 'notification' ? 'event' : restoreItem.type;

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
          id: restoreItem.id
        })
      });

      if (response.ok) {
        fetchArchivedItems();
        // Show success modal instead of alert
        setShowSuccessModal(true);
      } else {
        const result = await response.json();
        setErrorMessage(result.message || t("restoreItemFailedDefault"));
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('Error restoring:', error);
      setErrorMessage(t("restoreErrorOccurred"));
      setShowErrorModal(true);
    } finally {
      setRestoringId(null);
      setRestoreItem(null); // Close confirmation modal
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
      <div className="sticky top-0 z-20 bg-[#fcfcf9] px-1 pt-2 pb-4 border-b border-[#ece7de]">
        <div className="w-full">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("archive")}</h1>
            <p className="mt-1 text-sm text-[#667777]">{t("archiveSubtitle")}</p>
          </div>

          {/* Search and Filter Row */}
          <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 w-full">
            <div className="flex-1 min-w-[220px]">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={t("searchArchivePlaceholder")}
              />
            </div>
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-14 pl-10 pr-8 rounded-full border border-[#005f63]/20 bg-white text-sm shadow-sm focus:border-[#005f63]/40 focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none"
              >
                <option value="all">{t("allTypes")}</option>
                <option value="age_bracket">{t("ageBracketsTitle")}</option>
                <option value="civil_status">{t("civilStatusesTitle")}</option>
                <option value="event">{t("events")}</option>
                <option value="expense">{t("expenseTypeLabel")}</option>
                <option value="inventory_item">{t("inventory")}</option>
                <option value="membership">{t("memberships")}</option>
                <option value="notification">{t("notify")}</option>
                <option value="resident">{t("residents")}</option>
              </select>
              <Filter className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#005f63]/70 pointer-events-none" />
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {filteredItems.length} {t("itemsFoundCount")} — {t("showingLabel")} {itemsPerPage} {t("perPage")}
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
            <p>{t("noDeletedItems")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left p-3 font-medium text-[#005f63]">{t("typeColumn")}</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">{t("nameTitleColumn")}</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">{t("deletedAtColumn")}</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">{t("deletedByColumn")}</th>
                  <th className="text-left p-3 font-medium text-[#005f63]">{t("actionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => (
                  <tr key={`${item.type}-${item.id}-${index}`} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.type === 'membership'    ? 'bg-orange-600 text-white' :
                        item.type === 'event'         ? 'bg-amber-600 text-white'  :
                        item.type === 'resident'      ? 'bg-green-600 text-white'  :
                        item.type === 'notification'  ? 'bg-blue-600 text-white'   :
                        item.type === 'age_bracket'   ? 'bg-indigo-600 text-white' :
                        item.type === 'inventory_item' ? 'bg-violet-600 text-white' :
                        item.type === 'civil_status'  ? 'bg-fuchsia-600 text-white' :
                        item.type === 'expense'       ? 'bg-rose-600 text-white'   :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {t(TYPE_LABEL_KEYS[item.type])}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-800">{item.name}</td>
                    <td className="p-3 text-gray-500">{item.deletedAt}</td>
                    <td className="p-3 text-gray-500">{item.deletedBy}</td>
                    <td className="p-3">
                      <button
                        onClick={() => setRestoreItem(item)}
                        disabled={restoringId === item.id}
                        className="p-2 rounded-full hover:bg-green-50 transition text-green-600 active:bg-green-100 disabled:opacity-50"
                        title={t("restoreTitle")}
                      >
                        {restoringId === item.id ? (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-green-600"></div>
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

      {/* Restore Confirm Modal -- green throughout (button, this confirm
          step, and the success modal below) since restoring is the
          positive/undo action here, not the app's usual save/delete. */}
      {restoreItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="flex justify-center text-green-600 mb-3"><RefreshCw size={40} /></div>
            <h3 className="text-xl font-bold text-green-600 mb-3">{t("restoreItemModalTitle")}</h3>
            <p className="text-gray-600 mb-5">
              {t("restoreConfirmPrefix")} <strong>"{restoreItem.name}"</strong>{t("restoreConfirmSuffix")}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setRestoreItem(null)}
                className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
              >
                {t("cancelLabel")}
              </button>
              <button
                onClick={handleRestoreConfirm}
                className="px-5 py-2.5 rounded-full bg-green-600 text-white hover:bg-green-700 transition"
              >
                {t("yesRestore")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal -- green because "restore" is the action being
          confirmed here (bring-back / undo), not a plain save -- matches
          the green already used for the "active/restored" state badge
          above instead of the app's usual teal/amber. */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="flex justify-center text-green-600 mb-3">
              <CheckCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-green-600 mb-2">{t("successTitle")}</h3>
            <p className="text-gray-600 mb-5">{t("itemRestoredSuccess")}</p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="px-5 py-2.5 rounded-full bg-green-600 text-white hover:bg-green-700 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="flex justify-center text-red-500 mb-3">
              <XCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("restoreFailedTitle")}</h3>
            <p className="text-gray-600 mb-5">{errorMessage}</p>
            <button
              onClick={() => setShowErrorModal(false)}
              className="px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
            >
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
