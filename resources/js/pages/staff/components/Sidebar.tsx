import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Users,
  Home,
  Award,
  CalendarDays,
  Bell,
  Settings,
  LogOut,
  FileText,
  Archive,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Package,
  Wallet,
  Link2,
  Tags,
  X as XIcon,
  IdCard,
  CalendarCheck,
  Boxes,
  Undo2,
  Search,
  SearchX,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";

// --- NAVIGATION CONFIG ---
export const NAV = [
  { key: "dashboard", path: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "scan", path: "scan", label: "QR Scanner", icon: ScanLine },
  { key: "residents", path: "residents", label: "Residents", icon: Users },
  { key: "households", path: "households", label: "Households", icon: Home },
  { key: "memberships", path: "memberships", label: "Memberships", icon: Award },
  { key: "events", path: "events", label: "Events & Attendance", icon: CalendarDays },
  { key: "notify", path: "notifications", label: "Notifications", icon: Bell },
  { key: "reports", path: "reports", label: "Reports & Analytics", icon: BarChart3 },
  { key: "inventory", path: "inventory", label: "Inventory", icon: Package },
  { key: "budget", path: "budget", label: "Budget & Expenses", icon: Wallet },
  { key: "returns", path: "returns", label: "Returns", icon: Undo2 },
];

export const SETTINGS_NAV = [
  { key: "activitylogs", path: "activity-logs", label: "Activity Logs", icon: FileText },
  { key: "archive", path: "archive", label: "Trash / Archive", icon: Archive },
  { key: "profiling", path: "age-status-categories", label: "Age & Status Categories", icon: Tags },
  { key: "integrations", path: "integrations", label: "Integrations", icon: Link2 },
];

// --- MODULE GROUPING ---
// The nav used to be one long flat list. It's now organized the same way
// Settings already was: a handful of collapsible modules, each bundling
// related pages together. Dashboard and Reports & Analytics stay as
// standalone top-level links (each is its own single destination, not a
// category), same as Settings' own trigger button below.
const NAV_BY_KEY: Record<string, typeof NAV[number]> = Object.fromEntries(NAV.map((item) => [item.key, item]));

// Each group icon is deliberately different from every icon used by its
// own children below -- reusing a child's icon (e.g. the Events & Check-in
// group and the Events item both showing a calendar) reads as a visual
// duplicate.
const NAV_GROUP_DEFS: { key: string; labelKey: string; icon: any; itemKeys: string[] }[] = [
  { key: "membershipGroup", labelKey: "navGroupMembership", icon: IdCard, itemKeys: ["residents", "households", "memberships"] },
  { key: "eventsGroup", labelKey: "navGroupEvents", icon: CalendarCheck, itemKeys: ["events", "scan", "notify"] },
  { key: "resourcesGroup", labelKey: "navGroupResources", icon: Boxes, itemKeys: ["inventory", "budget", "returns"] },
];

export const NAV_GROUPS = NAV_GROUP_DEFS.map((g) => ({
  ...g,
  items: g.itemKeys.map((k) => NAV_BY_KEY[k]).filter(Boolean),
}));

const STANDALONE_NAV_KEYS = ["dashboard", "reports"];
export const STANDALONE_NAV = STANDALONE_NAV_KEYS.map((k) => NAV_BY_KEY[k]).filter(Boolean);

interface SidebarProps {
  active: string;
  setActive: (key: string, path?: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ active, setActive, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { t } = useLanguage();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [navQuery, setNavQuery] = useState("");

  // Every real destination in the sidebar, flattened once, so the search
  // box below can filter across standalone links, every module's items,
  // and Settings' submenu all at the same time -- a real quick-jump, not
  // a decorative input that does nothing.
  const allNavItems = useMemo(
    () => [...STANDALONE_NAV, ...NAV_GROUPS.flatMap((g) => g.items), ...SETTINGS_NAV],
    []
  );
  const trimmedQuery = navQuery.trim().toLowerCase();
  const searchResults = trimmedQuery
    ? allNavItems.filter((item) => t(item.key).toLowerCase().includes(trimmedQuery) || item.label.toLowerCase().includes(trimmedQuery))
    : [];

  // Which module the currently active page lives under -- "settings" is
  // its own pseudo-group key here, matching the group SETTINGS_NAV renders
  // into below.
  const findGroupKeyForActive = (activeKey: string): string | null => {
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.key === activeKey));
    if (group) return group.key;
    if (SETTINGS_NAV.some((i) => i.key === activeKey)) return "settings";
    return null;
  };

  // Collapsible modules, same interaction as the pre-existing Settings
  // submenu -- closed by default, but whichever module the current page
  // belongs to starts open so navigating here directly doesn't hide it.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    const activeGroup = findGroupKeyForActive(active);
    if (activeGroup) initial[activeGroup] = true;
    return initial;
  });

  useEffect(() => {
    const activeGroup = findGroupKeyForActive(active);
    if (activeGroup) {
      setOpenGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const toggleGroup = (key: string) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  // Bolds + golds the matched substring inside a nav label while typing in
  // the search box (e.g. "das" in "Dashboard"), rather than just filtering
  // the list with no visual cue about what matched.
  const highlightMatch = (label: string, query: string) => {
    if (!query) return label;
    const idx = label.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return label;
    return (
      <>
        {label.slice(0, idx)}
        <span className="font-bold text-gold-400">{label.slice(idx, idx + query.length)}</span>
        {label.slice(idx + query.length)}
      </>
    );
  };

  const handleNavClick = (key: string, path?: string) => {
    setActive(key, path);
    setNavQuery("");
    onCloseMobile?.();
  };

  const doLogout = async () => {
    setLoggingOut(true);
    console.log('Logging out...');
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const decodedToken = token ? decodeURIComponent(token) : '';

      await fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': decodedToken
        }
      });

      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';

    } catch (err) {
      console.error('Logout error:', err);
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  const inactiveNav = "text-white/55 hover:bg-white/[0.06] hover:text-white";
  const activeNav = "bg-white/10 text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]";

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`w-[340px] flex-col bg-[#0A0E1A] h-screen fixed md:sticky top-0 z-40 flex overflow-hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <button
          onClick={onCloseMobile}
          className="md:hidden absolute top-4 right-4 z-10 text-white/50 hover:text-white"
        >
          <XIcon size={20} />
        </button>
        <div className="border-b border-white/10 px-4 py-5 shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 border border-white/15 font-black shrink-0 overflow-hidden">
            <img
              src="/logo-removebg-preview.png"
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7DD8CB] font-medium">BARANGAY PIAO</p>
            <h1 className="font-display text-[15px] font-bold text-white whitespace-nowrap leading-tight">e-Membership</h1>
          </div>
        </div>

        {/* Quick-jump search -- filters every real nav destination
            (standalone links, module items, and Settings' submenu) as you
            type, rather than sitting there decoratively. */}
        <div className="px-3 pt-4 shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pl-10 pr-3 text-[13.5px] text-white placeholder-white/35 transition focus:outline-none focus:border-[#4FBEB0] focus:ring-2 focus:ring-[#4FBEB0]/20"
            />
          </div>
        </div>

        <div className="flex-1 px-3 py-5 overflow-y-auto smooth-scroll">
          {trimmedQuery ? (
            <>
              <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                {searchResults.length > 0 ? "Search Results" : "No Matches"}
              </p>
              {searchResults.length > 0 ? (
                <div className="space-y-1.5">
                  {searchResults.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleNavClick(item.key, item.path)}
                      className={`flex items-center w-full rounded-xl border px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${
                        active === item.key ? `${activeNav} border-white/10` : `${inactiveNav} border-white/10`
                      }`}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="truncate flex-1 min-w-0 text-left">{highlightMatch(t(item.key), trimmedQuery)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-white/35">
                  <SearchX className="h-6 w-6" />
                  <p className="text-[13px]">Nothing matches "{navQuery}"</p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">{t("staffConsole")}</p>
              <div className="space-y-1.5">
                {/* STANDALONE LINKS -- Dashboard and Reports each go straight
                    to one page, so they stay flat instead of being wrapped in
                    a one-item module. */}
                {STANDALONE_NAV.map((item) => (
                  <button key={item.key} onClick={() => handleNavClick(item.key, item.path)} className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${active === item.key ? activeNav : inactiveNav}`}>
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="truncate flex-1 min-w-0 text-left">{t(item.key)}</span>
                  </button>
                ))}

                {/* MODULES -- same collapsible pattern as Settings below, just
                    generalized to every related group of pages. */}
                {NAV_GROUPS.map((group) => (
                  <div key={group.key} className="space-y-1">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${inactiveNav}`}
                    >
                      <group.icon className="h-5 w-5 shrink-0" />
                      <span className="truncate flex-1 min-w-0 text-left">{t(group.labelKey)}</span>
                      {openGroups[group.key] ? <ChevronUp size={16} className="text-white/35" /> : <ChevronDown size={16} className="text-white/35" />}
                    </button>

                    {openGroups[group.key] && (
                      <div className="pl-6 space-y-1 mt-1">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => handleNavClick(item.key, item.path)}
                            className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${active === item.key ? activeNav : inactiveNav}`}
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span className="truncate flex-1 min-w-0 text-left">{t(item.key)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* SETTINGS WITH SUBMENU */}
                <div className="space-y-1">
                  <button
                    onClick={() => toggleGroup("settings")}
                    className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${inactiveNav}`}
                  >
                    <Settings className="h-5 w-5 shrink-0" />
                    <span className="truncate flex-1 min-w-0 text-left">{t("settings")}</span>
                    {openGroups["settings"] ? <ChevronUp size={16} className="text-white/35" /> : <ChevronDown size={16} className="text-white/35" />}
                  </button>

                  {/* SUB NAVIGATION */}
                  {openGroups["settings"] && (
                    <div className="pl-6 space-y-1 mt-1">
                      {SETTINGS_NAV.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => handleNavClick(item.key, item.path)}
                          className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${active === item.key ? activeNav : inactiveNav}`}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          <span className="truncate flex-1 min-w-0 text-left">{t(item.key)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="border-t border-white/10 p-2 shrink-0">
          <button
            className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all ${inactiveNav}`}
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="truncate flex-1 min-w-0 text-left">{t("signOut")}</span>
          </button>
        </div>
      </aside>

      {/* Templated confirm modal, same pattern used for every delete action
          in the app -- logout is destructive to the current session so it
          gets the same "are you sure" treatment instead of firing instantly. */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#0A0E1A] p-6 text-center shadow-2xl">
            <div className="mb-4 flex justify-center text-[#4FBEB0]"><LogOut size={40} /></div>
            <h3 className="font-display text-xl font-bold text-white mb-3">{t("confirmLogoutTitle")}</h3>
            <p className="text-[15px] text-white/55 mb-5">{t("confirmLogoutMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowLogoutConfirm(false)} disabled={loggingOut} className="px-5 py-2.5 rounded-full border border-white/15 text-white/70 hover:bg-white/5 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={doLogout} disabled={loggingOut} className="px-5 py-2.5 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] text-[#08130F] font-bold hover:opacity-90 transition disabled:opacity-60">{t("yesLogoutButton")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
