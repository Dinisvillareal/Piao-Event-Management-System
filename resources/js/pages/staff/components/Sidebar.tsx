import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Users,
  Home,
  Award,
  CalendarDays,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
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
// duplicate, especially in the collapsed icon-only rail where there's no
// label left to tell the two apart.
const NAV_GROUP_DEFS: { key: string; labelKey: string; icon: any; itemKeys: string[] }[] = [
  { key: "membershipGroup", labelKey: "navGroupMembership", icon: IdCard, itemKeys: ["residents", "households", "memberships"] },
  { key: "eventsGroup", labelKey: "navGroupEvents", icon: CalendarCheck, itemKeys: ["events", "scan", "notify"] },
  { key: "resourcesGroup", labelKey: "navGroupResources", icon: Boxes, itemKeys: ["inventory", "budget"] },
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
  const [isOpen, setIsOpen] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  const handleNavClick = (key: string, path?: string) => {
    setActive(key, path);
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

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onCloseMobile} />
      )}

      <button onClick={() => setIsOpen(!isOpen)} className={`hidden md:flex fixed top-4 z-[45] bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#005555] ${isOpen ? "left-[235px]" : "left-[50px]"}`}>
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      <aside
        className={`flex-col border-r border-[#006666] bg-[#006666] h-screen fixed md:sticky top-0 z-40 transition-all duration-300 flex overflow-hidden shadow-lg ${isOpen ? "md:w-[250px]" : "md:w-[70px]"} w-[250px] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <button
          onClick={onCloseMobile}
          className="md:hidden absolute top-4 right-4 z-10 text-white/80 hover:text-white"
        >
          <XIcon size={20} />
        </button>
        <div className="border-b border-[#007777] px-3 py-5 shrink-0 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent font-black shrink-0 shadow-md overflow-hidden">
            <img
            src="/logo-removebg-preview.png"
            alt="Logo"
            className="w-full h-full object-contain"
            />
        </div>
        <div className={`transition-all duration-300 overflow-hidden ${isOpen ? "opacity-100 w-auto visible" : "opacity-0 w-0 invisible"}`}>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">BARANGAY PIAO</p>
            <h1 className="text-[15px] font-black text-white whitespace-nowrap leading-tight">e-Membership</h1>
        </div>
        </div>
        <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
          <p className={`mb-3 px-3 text-sm font-semibold text-white/60 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>{t("staffConsole")}</p>
          <div className="space-y-1.5">
            {/* STANDALONE LINKS -- Dashboard and Reports each go straight
                to one page, so they stay flat instead of being wrapped in
                a one-item module. */}
            {STANDALONE_NAV.map((item) => (
              <button key={item.key} onClick={() => handleNavClick(item.key, item.path)} className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"}`}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(item.key)}</span>
              </button>
            ))}

            {/* MODULES -- same collapsible pattern as Settings below, just
                generalized to every related group of pages. */}
            {NAV_GROUPS.map((group) => (
              <div key={group.key} className="space-y-1">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1`}
                >
                  <group.icon className="h-5 w-5 shrink-0" />
                  <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(group.labelKey)}</span>
                  {isOpen && (openGroups[group.key] ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                </button>

                {openGroups[group.key] && (
                  <div className={`${isOpen ? "pl-6" : "pl-0"} space-y-1 mt-1`}>
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleNavClick(item.key, item.path)}
                        className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"}`}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(item.key)}</span>
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
                className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t("settings")}</span>
                {isOpen && (openGroups["settings"] ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>

              {/* SUB NAVIGATION */}
              {openGroups["settings"] && (
                <div className={`${isOpen ? "pl-6" : "pl-0"} space-y-1 mt-1`}>
                  {SETTINGS_NAV.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleNavClick(item.key, item.path)}
                      className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"}`}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(item.key)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-[#007777] p-2 shrink-0">
          <button
            className={`flex items-center w-full rounded-[20px] py-3 text-white/80 transition-all hover:bg-[#007777] hover:text-white hover:translate-x-1 ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"}`}
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={`transition-all duration-300 truncate flex-1 min-w-0 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t("signOut")}</span>
          </button>
        </div>
      </aside>

      {/* Templated confirm modal, same pattern used for every delete action
          in the app -- logout is destructive to the current session so it
          gets the same "are you sure" treatment instead of firing instantly. */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-[#005f63] flex justify-center"><LogOut size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-3">{t("confirmLogoutTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-5">{t("confirmLogoutMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowLogoutConfirm(false)} disabled={loggingOut} className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={doLogout} disabled={loggingOut} className="px-5 py-2.5 rounded-full bg-[#005f63] text-white hover:bg-[#004a4d] transition disabled:opacity-60">{t("yesLogoutButton")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
