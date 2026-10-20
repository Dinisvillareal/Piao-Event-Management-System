import { Sun, Moon } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useTheme } from "../../lib/theme";

/** Light / dark switch for the top header, sits beside the language selector. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  const { theme, toggle } = useTheme();
  const toLight = theme === "dark";
  const label = toLight ? t("switchToLightMode") : t("switchToDarkMode");

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={!toLight}
      className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-white/40 bg-[#0A0E1A] text-white shadow-sm transition-colors hover:bg-white/10 hover:border-white/60 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60 ${className}`}
    >
      {toLight ? <Sun className="h-[18px] w-[18px]" strokeWidth={2.25} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={2.25} />}
    </button>
  );
}
