import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { LANGUAGES, LanguageCode } from "../../i18n/translations";
import { useTheme } from "../../lib/theme";

/** Top-bar preferences: one button that opens a small menu with the theme switch and the language list. */
export default function HeaderPreferences({ userId }: { userId?: string | number }) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toLight = theme === "dark";
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = (code: LanguageCode) => { setLanguage(code, { userId }); setOpen(false); };
  const row = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/85 transition hover:bg-white/10";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("changeInterfaceLanguage")}
        className="topbar-group flex h-9 sm:h-10 items-center gap-2 rounded-full pl-1.5 pr-2.5 text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60"
      >
        <span className="topbar-icon flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full">
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider">{current.code}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/70 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-[#0A0E1A] p-2 shadow-2xl">
          <button type="button" role="menuitem" onClick={toggle} className={row}>
            {toLight ? <Sun className="h-4 w-4 text-white/60" /> : <Moon className="h-4 w-4 text-white/60" />}
            {toLight ? t("switchToLightMode") : t("switchToDarkMode")}
          </button>
          <div className="my-2 h-px bg-white/10" />
          <p className="flex items-center gap-2 px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            <Languages className="h-3.5 w-3.5" />
            {t("interfaceLanguage")}
          </p>
          <div role="listbox" aria-label={t("interfaceLanguage")}>
            {LANGUAGES.map((l) => {
              const selected = l.code === language;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(l.code)}
                  className={`${row} justify-between ${selected ? "bg-[#4FBEB0]/15 font-semibold" : ""}`}
                >
                  <span>{l.label}</span>
                  {selected && <Check className="h-4 w-4 text-[#4FBEB0]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
