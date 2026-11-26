import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Portal from "./Portal";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { LANGUAGES, LanguageCode } from "../../i18n/translations";

interface LanguageSwitcherProps {
  userId?: string | number;
  className?: string;
  grouped?: boolean;
}

/** UC-17: Switch Interface Language — compact selector for the top header. */
export default function LanguageSwitcher({ userId, className = "", grouped = false }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, LANGUAGES.findIndex((l) => l.code === language))
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The list is drawn on top of the whole page (in <body>), placed under the button, so no header or page
  // content can ever cover or clip it.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close when clicking outside the trigger/panel.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Keyboard users land on the list as soon as it opens.
  useEffect(() => {
    if (open && pos) listRef.current?.focus();
  }, [open, !!pos]);

  const choose = (code: LanguageCode) => {
    setLanguage(code, { userId });
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % LANGUAGES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + LANGUAGES.length) % LANGUAGES.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(LANGUAGES[activeIndex].code);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t("changeInterfaceLanguage")}
        className={`flex items-center rounded-full text-sm font-medium text-white transition-colors focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60 ${grouped ? "h-8 gap-2 pl-2.5 pr-2.5 hover:bg-white/10" : "h-9 sm:h-10 gap-2 sm:gap-2.5 border border-white/40 bg-[#0A0E1A] pl-3.5 pr-3 sm:pl-4 sm:pr-3.5 shadow-sm hover:bg-white/10 hover:border-white/60"}`}
      >
        <Languages className="h-4 w-4 shrink-0 text-white/70" />
        <span className="hidden min-[420px]:inline">{current.label}</span>
        <span className="px-0.5 text-xs font-bold uppercase tracking-wider min-[420px]:hidden">{current.code}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/70 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && (
        <Portal>
        <ul
          ref={listRef}
          role="listbox"
          aria-label={t("interfaceLanguage")}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-[300] min-w-[10rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0E1A] py-1 shadow-xl outline-none"
        >
          {LANGUAGES.map((l, i) => {
            const selected = l.code === language;
            return (
              <li key={l.code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(l.code)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[#4FBEB0]/15 font-semibold text-white"
                      : i === activeIndex
                      ? "bg-white/[0.06] text-white"
                      : "text-white/80"
                  }`}
                >
                  <span>{l.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-[#4FBEB0]" />}
                </button>
              </li>
            );
          })}
        </ul>
        </Portal>
      )}
    </div>
  );
}
