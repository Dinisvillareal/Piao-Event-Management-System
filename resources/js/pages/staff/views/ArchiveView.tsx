import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Filter, Search, Trash2, Layers, Clock, AlertTriangle } from 'lucide-react';
import FilterDropdown from '../../../components/ui/FilterDropdown';
import StatusModal from '../../../components/ui/StatusModal';
import { useLanguage } from "../../../i18n/LanguageContext";

interface TrashedItem {
  id: string | number;
  type: 'event' | 'resident' | 'membership' | 'notification' | 'age_bracket' | 'civil_status' | 'current_status' | 'inventory_item' | 'expense' | 'household';
  name: string;
  deletedAt: string;
  deletedAtRaw: string;
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
  current_status: "currentStatusesTitle",
  inventory_item: "inventory",
  expense: "expenseTypeLabel",
  household: "households",
};

// Same three-family palette used across the redesigned pages -- teal for
// people/community records, gold for events & communications, and a
// neutral white-on-navy tone for operational/financial records -- same
// semantic mapping as the light styles they replace, recolored for the
// dark navy/gold/teal system used everywhere else.
const TYPE_BADGE_STYLES: Record<TrashedItem["type"], string> = {
  resident: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  household: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  membership: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  age_bracket: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  civil_status: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  current_status: "bg-[#4FBEB0]/15 text-[#7DD8CB] border border-[#4FBEB0]/30",
  event: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  notification: "bg-gold-400/15 text-gold-300 border border-gold-400/30",
  inventory_item: "bg-white/10 text-white/60 border border-white/15",
  expense: "bg-white/10 text-white/60 border border-white/15",
};

export default function ArchiveView() {
  const { t } = useLanguage();
  const [allTrashedItems, setAllTrashedItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
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
  const itemsPerPage = 20;

  // State for modals
  const [restoreItem, setRestoreItem] = useState<TrashedItem | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Real-time refresh -- other staff can delete or restore records any
  // time, so this polls quietly in the background rather than relying on
  // a manual refresh. `background` skips the loading spinner so the table
  // doesn't flash/reset scroll position every 20s, and polling pauses
  // while any restore modal is open so the list doesn't shift under it.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

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

  const fetchArchivedItems = async (background = false) => {
    if (!background) setLoading(true);
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
        const normalized = data.map((item: any) => {
          const raw = item.deleted_at || item.deletedAt || '';
          return {
            id: item.id,
            type: item.type === 'user' ? 'resident' : item.type,
            name: item.name || item.title || 'Unnamed',
            deletedAt: formatTimeOnly(raw),
            deletedAtRaw: raw,
            deletedBy: item.deleted_by || item.deletedBy,
            originalData: item.original_data || item
          };
        });
        setAllTrashedItems(normalized);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching archived items:', error);
    } finally {
      if (!background) setLoading(false);
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

  // Quiet background poll -- paused while a restore/success/error modal is
  // open so the list doesn't reshuffle under the staff member's cursor.
  useEffect(() => {
    const poll = setInterval(() => {
      if (!restoreItem && !showSuccessModal && !showErrorModal) fetchArchivedItems(true);
    }, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreItem, showSuccessModal, showErrorModal]);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsSinceUpdate = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated.getTime()) / 1000)) : null;
  const lastUpdatedLabel =
    secondsSinceUpdate === null
      ? ""
      : secondsSinceUpdate < 5
      ? t("updatedJustNowLabel")
      : secondsSinceUpdate < 60
      ? t("updatedSecondsAgoLabel").replace("{n}", String(secondsSinceUpdate))
      : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(secondsSinceUpdate / 60)));

  // Portfolio-wide KPIs across every trashed record, independent of the
  // current search/type filter -- gives staff the scale of what's sitting
  // in the trash before they drill into any one type.
  const stats = useMemo(() => {
    const distinctTypes = new Set(allTrashedItems.map((i) => i.type)).size;
    let newestAt = 0;
    let oldestDays = 0;
    const now = Date.now();
    allTrashedItems.forEach((item) => {
      const d = new Date(item.deletedAtRaw).getTime();
      if (!isNaN(d)) {
        if (d > newestAt) newestAt = d;
        const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (days > oldestDays) oldestDays = days;
      }
    });
    return { totalItems: allTrashedItems.length, distinctTypes, newestAt: newestAt || null, oldestDays };
  }, [allTrashedItems]);

  const relativeTimeLabel = (timestamp: number | null) => {
    if (!timestamp) return "--";
    const diffSec = Math.max(0, Math.floor((nowTick - timestamp) / 1000));
    if (diffSec < 60) return t("justNowLabel");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t("minutesAgoShortLabel").replace("{n}", String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("hoursAgoShortLabel").replace("{n}", String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    return t("daysAgoShortLabel").replace("{n}", String(diffDay));
  };

  const typeOptions = [
    { value: 'all', label: t('allTypes') },
    { value: 'age_bracket', label: t('ageBracketsTitle') },
    { value: 'civil_status', label: t('civilStatusesTitle') },
    { value: 'current_status', label: t('currentStatusesTitle') },
    { value: 'event', label: t('events') },
    { value: 'expense', label: t('expenseTypeLabel') },
    { value: 'household', label: t('households') },
    { value: 'inventory_item', label: t('inventory') },
    { value: 'membership', label: t('memberships') },
    { value: 'notification', label: t('notify') },
    { value: 'resident', label: t('residents') },
  ];

  const statCards = [
    {
      key: "total",
      label: t("itemsInTrashStatLabel"),
      desc: t("itemsInTrashStatDesc"),
      value: stats.totalItems,
      icon: Trash2,
      gradient: "from-sage-800 to-[#1C2E2B]",
      isText: false,
    },
    {
      key: "types",
      label: t("distinctRecordTypesStatLabel"),
      desc: t("distinctRecordTypesStatDesc"),
      value: stats.distinctTypes,
      icon: Layers,
      gradient: "from-sage-400 to-sage-700",
      isText: false,
    },
    {
      key: "recent",
      label: t("mostRecentDeletionStatLabel"),
      desc: t("mostRecentDeletionStatDesc"),
      value: relativeTimeLabel(stats.newestAt),
      icon: Clock,
      gradient: "from-gold-400 to-gold-700",
      isText: true,
    },
    {
      key: "oldest",
      label: t("oldestInTrashStatLabel"),
      desc: t("oldestInTrashStatDesc"),
      value: stats.oldestDays,
      icon: AlertTriangle,
      gradient: "from-[#8A3D2C] to-[#5C2A1E]",
      isText: false,
    },
  ];

  const SkeletonRow = () => (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="p-3"><div className="h-5 bg-white/10 rounded-full w-20 animate-pulse" /></td>
      <td className="p-3"><div className="h-3.5 bg-white/10 rounded w-32 animate-pulse" /></td>
      <td className="p-3"><div className="h-3.5 bg-white/10 rounded w-40 animate-pulse" /></td>
      <td className="p-3"><div className="h-3.5 bg-white/10 rounded w-24 animate-pulse" /></td>
      <td className="p-3"><div className="h-6 w-6 bg-white/10 rounded-full animate-pulse" /></td>
    </tr>
  );

  return (
    <>
    {/* Full-bleed dark navy page -- same technique and palette as the
        Dashboard/Residents/Households/Memberships/Events/Budget/Returns/
        Activity Logs pages, so Archive reads as part of the same system
        instead of the old light "paper" page. The confirm/success/error
        modals further below stay on their original light theme, same
        scoping used everywhere else -- there's no core edit form on this
        page to darken along with it. */}
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("archive")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("archiveSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("liveLabel")}</span>
          {lastUpdatedLabel && <span className="text-xs text-white/40">&bull; {lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white`}>
              <div className="flex items-start justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wide">{card.label}</span>
                <Icon className="h-5 w-5 text-white/40" />
              </div>
              <p
                className={`mt-2 font-display font-extrabold tracking-tight [font-variant-numeric:tabular-nums] ${
                  card.isText ? "text-xl lg:text-2xl" : "text-2xl lg:text-3xl"
                }`}
              >
                {card.value}
              </p>
              <p className="mt-1 text-xs text-white/75">{card.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchArchivePlaceholder")}
              className="h-11 w-full rounded-xl border border-transparent bg-transparent pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
            />
          </div>
        </div>
        <FilterDropdown
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          align="right"
          className="h-11 pl-10 pr-8"
          icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
          dark
        />
      </div>

      <p className="text-xs text-white/45">
        {filteredItems.length} {t("itemsFoundCount")} &bull; {t("showingLabel")} {itemsPerPage} {t("perPage")}
      </p>

      {filteredItems.length === 0 && !loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center text-white/45">
          <svg className="w-16 h-16 mx-auto mb-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p>{t("noDeletedItems")}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("typeColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("nameTitleColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("deletedAtColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("deletedByColumn")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold uppercase tracking-wide text-white">{t("actionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {loading || pageSwitching ? (
                  Array(8).fill(0).map((_, i) => <SkeletonRow key={i} />)
                ) : (
                  paginatedItems.map((item, index) => (
                    <tr key={`${item.type}-${item.id}-${index}`} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.05] transition-colors">
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${TYPE_BADGE_STYLES[item.type] ?? "bg-white/10 text-white/60 border border-white/15"}`}>
                          {t(TYPE_LABEL_KEYS[item.type])}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">{item.name}</td>
                      <td className="py-3.5 px-4 text-white/60 whitespace-nowrap">{item.deletedAt}</td>
                      <td className="py-3.5 px-4 text-white/45">{item.deletedBy}</td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => setRestoreItem(item)}
                          disabled={restoringId === item.id}
                          className="p-2 rounded-full hover:bg-white/10 transition text-[#7DD8CB] active:bg-white/[0.15] disabled:opacity-50"
                          title={t("restoreTitle")}
                        >
                          {restoringId === item.id ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#4FBEB0]"></div>
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <p className="text-sm text-white/45 text-center sm:text-left">
            {t("pageOfLabel")} {currentPage} {t("ofPagesLabel")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >←</button>
            <span className="h-8 w-8 rounded-full bg-gold-400 text-[#08130F] shadow-sm flex items-center justify-center text-sm font-bold">
              {currentPage}
            </span>
            <button
              onClick={() => goToPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95"
            >→</button>
          </div>
        </div>
      )}
      </div>
      </div>

      {/* Restore Confirm Modal -- sage throughout (button, this confirm
          step, and the success modal below) since restoring is the
          positive/undo action here, not the app's usual save/delete. */}
      {restoreItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center text-sage-400 mb-3"><RefreshCw size={40} /></div>
            <h3 className="font-display text-xl font-bold text-white mb-3">{t("restoreItemModalTitle")}</h3>
            <p className="text-white/50 mb-5">
              {t("restoreConfirmPrefix")} <strong className="text-white">"{restoreItem.name}"</strong>{t("restoreConfirmSuffix")}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setRestoreItem(null)}
                className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition"
              >
                {t("cancelLabel")}
              </button>
              <button
                onClick={handleRestoreConfirm}
                className="px-5 py-2.5 rounded-full bg-sage-700 text-white hover:bg-sage-800 transition"
              >
                {t("yesRestore")}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusModal open={showSuccessModal} type="success" title={t("successTitle")} message={t("itemRestoredSuccess")} okLabel={t("okLabel")} onClose={() => setShowSuccessModal(false)} />
      <StatusModal open={showErrorModal} type="error" title={t("restoreFailedTitle")} message={errorMessage} okLabel={t("okLabel")} onClose={() => setShowErrorModal(false)} />
    </>
  );
}
