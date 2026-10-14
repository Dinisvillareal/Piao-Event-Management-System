import { SquareMenu, Menu } from "lucide-react";
import LanguageSwitcher from "../ui/LanguageSwitcher";
import DefaultAvatar from "../ui/DefaultAvatar";
import { useLanguage } from "../../i18n/LanguageContext";

interface TopHeaderProps {
  memberName: string;
  onMenuClick?: () => void;
  userId?: string | number;
}

// Same navy/gold/teal treatment as the staff portal's TopHeader
// (pages/staff/components/TopHeader.tsx), plus the initials avatar it
// already shows next to "Signed in as" -- the member header was missing
// that touch, which is what made it read as the less-finished of the two.
export default function TopHeader({ memberName, onMenuClick, userId }: TopHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-[#0A0E1A] px-3 sm:px-6 h-[73px] box-border gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="xl:hidden shrink-0 text-white/60 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="h-5 w-5 shrink-0 text-[#7DD8CB]" />
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.2em] leading-snug text-white/40 m-0">
          {t("memberPortal")}
        </p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
        <LanguageSwitcher userId={userId} />
        <div className="hidden sm:flex items-center gap-2.5">
          <DefaultAvatar className="h-8 w-8" title={memberName} />
          <div className="text-left leading-tight">
            <p className="text-xs text-white/40">{t("signedInAs")}</p>
            {memberName ? (
              <p className="text-sm font-bold text-white">{memberName}</p>
            ) : (
              <span className="mt-0.5 block h-3.5 w-24 animate-pulse rounded bg-white/10" />
            )}
          </div>
        </div>
        <div className="rounded-full bg-gold-400 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-xs font-black uppercase tracking-wide text-[#08130F] shadow-sm whitespace-nowrap">
          {t("memberRole")}
        </div>
      </div>
    </div>
  );
}
