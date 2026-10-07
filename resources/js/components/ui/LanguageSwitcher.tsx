import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { LANGUAGES, LanguageCode } from "../../i18n/translations";

interface LanguageSwitcherProps {
  userId?: string | number;
  className?: string;
}

/** UC-17: Switch Interface Language — compact selector for the top header. */
export default function LanguageSwitcher({ userId, className = "" }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, LANGUAGES.findIndex((l) => l.code === language))
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  // Close when clicking outside the trigger/panel.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
        title="Change interface language"
        className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-[#0A0E1A] pl-2.5 pr-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60"
      >
        <Languages className="h-3.5 w-3.5 text-white/70" />
        <span>{current.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-white/70 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Interface language"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute right-0 z-50 mt-1.5 min-w-[9rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0E1A] py-1 shadow-xl"
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
      )}
    </div>
  );
}
