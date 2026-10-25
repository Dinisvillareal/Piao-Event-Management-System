import { useEffect, useRef, useState } from "react";
import { SquareMenu, Menu, Settings, LogOut, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { getSoundPref, setSoundPref, MEMBER_SOUND_KEY, SOUND_CHANGED_EVENT } from "../../lib/alertSound";
import LanguageSwitcher from "../ui/LanguageSwitcher";
import ThemeToggle from "../ui/ThemeToggle";
import DefaultAvatar from "../ui/DefaultAvatar";
import { useLanguage } from "../../i18n/LanguageContext";

interface TopHeaderProps {
  memberName: string;
  onMenuClick?: () => void;
  userId?: string | number;
  onNavigate?: (key: string) => void;
}

// Same navy/gold/teal treatment as the staff portal's TopHeader
// (pages/staff/components/TopHeader.tsx), plus the initials avatar it
// already shows next to "Signed in as" -- the member header was missing
// that touch, which is what made it read as the less-finished of the two.
export default function TopHeader({ memberName, onMenuClick, userId, onNavigate }: TopHeaderProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(() => getSoundPref(MEMBER_SOUND_KEY));
  useEffect(() => {
    const sync = () => setSoundOn(getSoundPref(MEMBER_SOUND_KEY));
    window.addEventListener(SOUND_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SOUND_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-[#0A0E1A] px-3 sm:px-6 h-[73px] box-border gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button onClick={onMenuClick} className="xl:hidden shrink-0 text-white/60 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="h-5 w-5 shrink-0 text-[#7DD8CB]" />
        <p className="m-0 hidden min-w-0 truncate text-[11px] uppercase leading-snug tracking-[0.12em] text-white/40 sm:block lg:tracking-[0.2em]">
          {t("memberPortal")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 lg:gap-4">
        <ThemeToggle />
        <LanguageSwitcher userId={userId} />
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 sm:pr-3"
          >
            <DefaultAvatar className="h-8 w-8" title={memberName} />
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-xs text-white/40">{t("signedInAs")}</p>
              {memberName ? (
                <p className="text-sm font-bold text-white">{memberName}</p>
              ) : (
                <span className="mt-0.5 block h-3.5 w-24 animate-pulse rounded bg-white/10" />
              )}
            </div>
            <ChevronDown className={`hidden h-4 w-4 text-white/50 transition-transform sm:block ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-[#0A0E1A] p-2 shadow-2xl">
              <div className="flex items-center gap-3 px-3 py-3">
                <DefaultAvatar className="h-11 w-11" title={memberName} />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{memberName}</p>
                  <p className="text-sm text-white/50">{t("memberRole")}</p>
                </div>
              </div>
              <div className="my-1 border-t border-white/10" />
              <button role="menuitem" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/85 transition hover:bg-white/10" onClick={() => { setOpen(false); onNavigate?.("settings"); }}>
                <Settings className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t("secManageAccount")}</span>
              </button>
              <button role="menuitemcheckbox" aria-checked={soundOn} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/85 transition hover:bg-white/10" onClick={() => setSoundPref(MEMBER_SOUND_KEY, !soundOn)}>
                {soundOn ? <Volume2 className="h-4 w-4 shrink-0" /> : <VolumeX className="h-4 w-4 shrink-0" />}
                <span className="flex-1">{t("memSoundLabel")}</span>
                <span className={`text-xs font-bold ${soundOn ? "text-[#7DD8CB]" : "text-white/40"}`}>{soundOn ? t("memSoundOn") : t("memSoundOff")}</span>
              </button>
              <div className="my-1 border-t border-white/10" />
              <button role="menuitem" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-400 transition hover:bg-red-500/10" onClick={() => { setOpen(false); window.dispatchEvent(new Event("member:request-logout")); }}>
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t("signOut")}</span>
              </button>
            </div>
          )}
        </div>
        <div className="hidden min-[420px]:block rounded-full bg-gold-400 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-xs font-black uppercase tracking-wide text-[#08130F] shadow-sm whitespace-nowrap">
          {t("memberRole")}
        </div>
      </div>
    </div>
  );
}
