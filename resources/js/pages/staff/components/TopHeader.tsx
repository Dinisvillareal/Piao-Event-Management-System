import { SquareMenu, Menu } from "lucide-react";
import LanguageSwitcher from "../../../components/ui/LanguageSwitcher";
import { useLanguage } from "../../../i18n/LanguageContext";

interface TopHeaderProps {
  memberName: string;
  role: string;
  onMenuClick?: () => void;
  userId?: string | number;
}

export default function TopHeader({ memberName, role, onMenuClick, userId }: TopHeaderProps) {
  const { t } = useLanguage();
  const initials = memberName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";

  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-[#0A0E1A] px-3 sm:px-6 py-3 sm:py-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="md:hidden shrink-0 text-white/60 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="hidden md:block h-5 w-5 text-[#7DD8CB]" />
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-white/40 m-0 truncate">{t("staffPortal")}</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <LanguageSwitcher userId={userId} />
        <div className="hidden sm:flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-[11px] font-bold text-[#08130F] shrink-0">
            {initials}
          </div>
          <div className="text-left leading-tight">
            <p className="text-xs text-white/40">{t("signedInAs")}</p>
            <p className="text-sm font-bold text-white">{memberName}</p>
          </div>
        </div>
        <div className="rounded-full bg-gold-400 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide text-[#08130F] shadow-sm whitespace-nowrap">{role}</div>
      </div>
    </div>
  );
}
