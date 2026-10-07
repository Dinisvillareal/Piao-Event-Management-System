import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  X as XIcon,
} from "lucide-react";
import React, { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";

interface SidebarProps {
  active: string;
  setActive: (page: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  userName?: string;
  userRole?: string;
  /** Optional per-nav-key count shown as a badge (e.g. { notify: 3 } for unread notifications). */
  badges?: Record<string, number>;
}

// Same navy/gold/teal system, fixed width, and behavior as the staff
// portal's own Sidebar (pages/staff/components/Sidebar.tsx) -- same 340px
// width, header block, nav styling, and logout confirm. No quick-jump
// search box here: this portal's nav list is short enough (6 items) that a
// search input isn't needed the way it is for staff's larger, grouped nav.
export default function Sidebar({ active, setActive, mobileOpen = false, onCloseMobile, userName, userRole, badges }: SidebarProps) {
  const { t } = useLanguage();
  const accountName = (userName ?? "").trim();
  const accountInitials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "M";
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "qr", label: "My QR Code", icon: QrCode },
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "events", label: "Events", icon: CalendarDays },
    { key: "notify", label: "Notifications", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  const handleNavClick = (page: string) => {
    setActive(page);
    onCloseMobile?.();
  };

  const handleLogout = async () => {
    setLoggingOut(true);
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
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear ALL storage (safe because user is logging out)
      localStorage.clear();
      sessionStorage.clear();

      // Redirect to login page
      window.location.href = '/';
    }
  };

  // Same active/inactive nav classes as the staff Sidebar, so a highlighted
  // nav item looks identical in both portals.
  const inactiveNav = "text-white/55 hover:bg-white/[0.06] hover:text-white border border-transparent";
  const activeNav = "bg-white/10 text-white font-semibold border border-white/40";

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
        <button onClick={onCloseMobile} className="md:hidden absolute top-4 right-4 z-10 text-white/50 hover:text-white">
          <XIcon size={20} />
        </button>

        {/* Sidebar Header -- same block as the staff Sidebar's own. */}
        <div className="border-b border-white/10 px-4 h-[73px] box-border shrink-0 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 border border-white/15 shrink-0 overflow-hidden">
            <img
              src="/logo-removebg-preview.png"
              alt={t("dashLogoAlt")}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7DD8CB] font-medium">
              BARANGAY PIAO
            </p>
            <h1 className="font-display text-[15px] font-bold text-white whitespace-nowrap leading-tight">
              e-Membership
            </h1>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-3 py-5 overflow-y-auto smooth-scroll">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
            {t("memberArea")}
          </p>
          <div className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.key)}
                  className={`flex items-center w-full rounded-xl px-4 py-3 gap-3 text-[13.5px] transition-all duration-200 group ${isActive ? activeNav : inactiveNav}`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate flex-1 min-w-0 text-left">{t(item.key)}</span>
                  {(badges?.[item.key] ?? 0) > 0 && (
                    <span
                      className="ml-auto inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-gold-400 px-2 text-xs font-bold text-[#08130F] shadow-sm"
                      aria-label={`${badges![item.key]} unread`}
                    >
                      {badges![item.key] > 99 ? "99+" : badges![item.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Logout -- avatar + Sign out, same footer as the staff Sidebar. */}
        <div className="border-t border-white/10 p-3 shrink-0 flex items-center gap-2.5">
          <div
            title={`${accountName}${userRole ? ` · ${userRole}` : ""}`}
            aria-label={accountName}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-[12px] font-bold text-[#08130F]"
          >
            {accountInitials}
          </div>
          <button
            className="flex min-w-0 flex-1 items-center justify-start gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-[13.5px] font-semibold text-white/70 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="truncate">{t("signOut")}</span>
          </button>
        </div>
      </aside>

      {/* Same dark "are you sure" confirm used by the staff Sidebar's own
          logout -- ending the session gets a deliberate, prominent step
          instead of the light peripheral-alert treatment. */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#0A0E1A] p-6 text-center shadow-2xl">
            <div className="mb-4 flex justify-center text-[#4FBEB0]"><LogOut size={40} /></div>
            <h3 className="font-display text-xl font-bold text-white mb-3">{t("confirmLogoutTitle")}</h3>
            <p className="text-[15px] text-white/55 mb-5">{t("confirmLogoutMessage")}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setShowLogoutConfirm(false)} disabled={loggingOut} className="px-5 py-2.5 rounded-full border border-white/15 text-white/70 hover:bg-white/5 transition disabled:opacity-60">{t("cancel")}</button>
              <button onClick={handleLogout} disabled={loggingOut} className="px-5 py-2.5 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] text-[#08130F] font-bold hover:opacity-90 transition disabled:opacity-60">{t("yesLogoutButton")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
