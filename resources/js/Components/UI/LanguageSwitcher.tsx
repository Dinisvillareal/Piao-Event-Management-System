import { Languages } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { LANGUAGES } from "../../i18n/translations";

interface LanguageSwitcherProps {
  userId?: string | number;
  className?: string;
}

/** UC-17: Switch Interface Language — compact selector for the top header. */
export default function LanguageSwitcher({ userId, className = "" }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`relative flex items-center ${className}`}>
      <Languages className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#005f63]/60" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as any, { userId })}
        title="Change interface language"
        className="h-8 pl-7 pr-2 rounded-full border border-[#005f63]/20 bg-white text-xs font-medium text-[#005f63] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#005f63]/30 appearance-none cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
