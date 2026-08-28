import { SquareMenu, Menu } from "lucide-react";
import LanguageSwitcher from "../UI/LanguageSwitcher";
import { useLanguage } from "../../i18n/LanguageContext";

interface TopHeaderProps {
  memberName: string;
  onMenuClick?: () => void;
  userId?: string | number;
}

export default function TopHeader({ memberName, onMenuClick, userId }: TopHeaderProps) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between border-b bg-[#f5f3ef] px-3 sm:px-6 py-3 sm:py-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="md:hidden shrink-0 text-gray-700 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>
        <SquareMenu className="hidden md:block h-5 w-5 text-gray-700" />
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-gray-500 m-0 truncate">
          {t("memberPortal")}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <LanguageSwitcher userId={userId} />
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-500">{t("signedInAs")}</p>
          <p className="text-sm font-bold text-[#005f63]">{memberName}</p>
        </div>
        <div className="rounded-full bg-[#2cb7b7] px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide text-white shadow whitespace-nowrap">
          {t("memberRole")}
        </div>
      </div>
    </div>
  );
}