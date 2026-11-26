import { Sun, Moon } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useTheme } from "../../lib/theme";

/** Light / dark switch for the top header, sits beside the language selector. */
export default function ThemeToggle({ className = "", grouped = false }: { className?: string; grouped?: boolean }) {
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
      className={`${grouped ? "topbar-icon h-8 w-8 hover:brightness-125" : "h-9 w-9 sm:h-10 sm:w-10 border border-white/40 bg-[#0A0E1A] text-white shadow-sm hover:bg-white/10 hover:border-white/60"} flex shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60 ${className}`}
    >
      {toLight ? <Sun className="h-[18px] w-[18px]" strokeWidth={2.25} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={2.25} />}
    </button>
  );
}
