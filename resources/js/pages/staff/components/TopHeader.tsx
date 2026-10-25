import { useEffect, useRef, useState } from "react";
import { SquareMenu, Menu, Settings, LogOut, ChevronDown, Crown } from "lucide-react";
import LanguageSwitcher from "../../../components/ui/LanguageSwitcher";
import ThemeToggle from "../../../components/ui/ThemeToggle";
import DefaultAvatar from "../../../components/ui/DefaultAvatar";
import NotificationBell from "./NotificationBell";
import { useLanguage } from "../../../i18n/LanguageContext";
import { useSecurityUnread } from "../../../lib/staffAlertsStore";

interface TopHeaderProps {
  memberName: string;
  role: string;
  onMenuClick?: () => void;
  userId?: string | number;
  userCode?: string;
  isHeadStaff?: boolean;
  onNavigate?: (key: string) => void;
}

export default function TopHeader({ memberName, role, onMenuClick, userId, userCode, isHeadStaff, onNavigate }: TopHeaderProps) {
  const { t } = useLanguage();
  const securityUnread = useSecurityUnread();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (key: string) => { setOpen(false); onNavigate?.(key); };
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/85 transition hover:bg-white/10";

  return (
    <div className="print:hidden flex items-center justify-between border-b border-white/10 bg-[#0A0E1A] px-3 sm:px-6 h-[73px] box-border gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button onClick={onMenuClick} className="xl:hidden shrink-0 text-white/60 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="h-5 w-5 shrink-0 text-[#7DD8CB]" />
        <p className="m-0 hidden min-w-0 truncate text-[11px] uppercase leading-snug tracking-[0.12em] text-white/40 sm:block lg:tracking-[0.2em]">{t("staffPortal")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 lg:gap-4">
        <ThemeToggle />
        <LanguageSwitcher userId={userId} />
        <div className="sm:ml-1"><NotificationBell /></div>
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 sm:pr-3"
          >
            <span className="relative">
              <DefaultAvatar className="h-8 w-8" title={memberName} />
              {securityUnread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0A0E1A]" />}
            </span>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-xs text-white/40">{t("signedInAs")}</p>
              <p className="text-sm font-bold text-white">{memberName}</p>
            </div>
            <ChevronDown className={`hidden h-4 w-4 text-white/50 transition-transform sm:block ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-[#0A0E1A] p-2 shadow-2xl">
              <div className="flex items-center gap-3 px-3 py-3">
                <DefaultAvatar className="h-11 w-11" title={memberName} />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{memberName}</p>
                  <p className="flex items-center gap-1.5 text-sm text-white/50">
                    {userCode && <span>{userCode}</span>}
                    <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#08130F] min-[420px]:hidden">{role}</span>
                    {isHeadStaff && <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-2 py-0.5 text-[11px] font-bold text-gold-300"><Crown className="h-3 w-3" /> {t("secHeadStaff")}</span>}
                  </p>
                </div>
              </div>
              <div className="my-1 border-t border-white/10" />
              <button role="menuitem" className={item} onClick={() => go("myaccount")}>
                <Settings className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t("secManageAccount")}</span>
                {securityUnread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{securityUnread}</span>}
              </button>
              <div className="my-1 border-t border-white/10" />
              <button role="menuitem" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-400 transition hover:bg-red-500/10" onClick={() => { setOpen(false); window.dispatchEvent(new Event("staff:request-logout")); }}>
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t("signOut")}</span>
              </button>
            </div>
          )}
        </div>
        <div className="hidden min-[420px]:block rounded-full bg-gold-400 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-xs font-black uppercase tracking-wide text-[#08130F] shadow-sm whitespace-nowrap">{role}</div>
      </div>
    </div>
  );
}
