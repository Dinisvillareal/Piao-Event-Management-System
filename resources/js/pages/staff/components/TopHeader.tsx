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
    <div className="flex items-center justify-between border-b border-[#E6E0D3] bg-white px-3 sm:px-6 py-3 sm:py-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="md:hidden shrink-0 text-[#5C574A] p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="hidden md:block h-5 w-5 text-sage-700" />
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-[#9B9789] m-0 truncate">{t("staffPortal")}</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <LanguageSwitcher userId={userId} />
        <div className="hidden sm:flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-700 text-[11px] font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="text-left leading-tight">
            <p className="text-xs text-[#9B9789]">{t("signedInAs")}</p>
            <p className="text-sm font-bold text-[#1A1A1A]">{memberName}</p>
          </div>
        </div>
        <div className="rounded-full bg-gold-400 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide text-[#1A1A1A] shadow-sm whitespace-nowrap">{role}</div>
      </div>
    </div>
  );
}
