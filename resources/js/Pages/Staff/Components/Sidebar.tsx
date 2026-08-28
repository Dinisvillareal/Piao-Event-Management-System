import React, { useState } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Users,
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
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";

// --- NAVIGATION CONFIG ---
export const NAV = [
  { key: "dashboard", path: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "scan", path: "scan", label: "QR Scanner", icon: ScanLine },
  { key: "residents", path: "residents", label: "Residents", icon: Users },
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

interface SidebarProps {
  active: string;
  setActive: (key: string, path?: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ active, setActive, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleNavClick = (key: string, path?: string) => {
    setActive(key, path);
    onCloseMobile?.();
  };

  const handleLogout = async () => {
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

      <button onClick={() => setIsOpen(!isOpen)} className={`hidden md:flex fixed top-4 z-50 bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 hover:bg-[#005555] ${isOpen ? "left-[235px]" : "left-[50px]"}`}>
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
            {/* MAIN NAVIGATION */}
            {NAV.map((item) => (
              <button key={item.key} onClick={() => handleNavClick(item.key, item.path)} className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"}`}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={`transition-all duration-300 whitespace-nowrap ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(item.key)}</span>
              </button>
            ))}

            {/* SETTINGS WITH SUBMENU */}
            <div className="space-y-1">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className={`transition-all duration-300 whitespace-nowrap flex-1 text-left ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t("settings")}</span>
                {isOpen && (settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>

              {/* SUB NAVIGATION */}
              {settingsOpen && (
                <div className={`pl-${isOpen ? '6' : '0'} space-y-1 mt-1`}>
                  {SETTINGS_NAV.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleNavClick(item.key, item.path)}
                      className={`flex items-center w-full rounded-[20px] py-2.5 transition-all duration-200 group ${isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"} ${active === item.key ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]" : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"}`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className={`transition-all duration-300 whitespace-nowrap ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t(item.key)}</span>
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
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap ${isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}>{t("signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
