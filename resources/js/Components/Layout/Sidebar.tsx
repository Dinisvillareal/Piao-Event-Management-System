import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  active: string;
  setActive: (page: string) => void;
}

export default function Sidebar({ active, setActive }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true); // controls show/hide

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Codes", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  // LOGOUT FUNCTION
  const handleLogout = async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

      await fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrfToken && { 'X-CSRF-TOKEN': csrfToken })
        }
      });

      // Clear all stored user data
      localStorage.clear();
      sessionStorage.clear();

      // Redirect to login page
      window.location.href = '/';

    } catch (err) {
      console.error('Logout error:', err);
      // Force clear local data even if API fails
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 z-50 bg-[#006666] text-white p-1.5 rounded-full shadow-md transition-all duration-300 ${
          isOpen ? "left-[235px]" : "left-[55px]"
        }`}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <aside
        className={`flex-col border-r border-[#006666] bg-[#006666] h-screen sticky top-0 transition-all duration-300 flex overflow-hidden ${
          isOpen ? "w-[250px]" : "w-[70px]"
        }`}
      >
        {/* Sidebar Header */}
        <div className="border-b border-[#007777] px-3 py-5 shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-yellow-300 font-black text-[#005f63] shrink-0 shadow-md">
            B
          </div>
          <div
            className={`transition-all duration-300 overflow-hidden ${
              isOpen ? "opacity-100 w-auto visible" : "opacity-0 w-0 invisible"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">
              BARANGAY PIAO
            </p>
            <h1 className="text-[15px] font-black text-white whitespace-nowrap leading-tight">
              e-Membership
            </h1>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-2 py-5 overflow-y-auto smooth-scroll">
          <p
            className={`mb-3 px-3 text-sm font-semibold text-white/60 transition-opacity duration-300 ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            Member Area
          </p>
          <div className="space-y-1.5">
            {/* ✅ FIX: changed NAV → navItems */}
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex items-center w-full rounded-[20px] py-3 transition-all duration-200 group ${
                    isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
                  } ${
                    isActive
                      ? "bg-[#008888] text-white shadow-md font-medium border-l-4 border-[#ffc107]"
                      : "text-white/80 hover:bg-[#007777] hover:text-white hover:translate-x-1"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={`transition-all duration-300 whitespace-nowrap ${
                      isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <div className="border-t border-[#007777] p-2 shrink-0">
          <button
            onClick={handleLogout}
            className={`flex items-center w-full rounded-[20px] py-3 text-white/80 transition hover:bg-[#007777] hover:text-white ${
              isOpen ? "px-4 justify-start gap-3" : "justify-center px-0"
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span
              className={`transition-all duration-300 whitespace-nowrap ${
                isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
              }`}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
