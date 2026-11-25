import { LayoutDashboard, QrCode, CalendarDays, ClipboardCheck, Bell } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

type Key = "dashboard" | "qr" | "events" | "attendance" | "notify";

interface Props {
  active: string;
  setActive: (k: any) => void;
  badges?: { notify?: number; events?: number };
}

/** Phone / tablet tab bar for the resident portal: the five main pages one tap away (Settings is in the account menu). */
export default function MobileBottomNav({ active, setActive, badges }: Props) {
  const { t } = useLanguage();
  const items: { key: Key; icon: any; badge?: number }[] = [
    { key: "dashboard", icon: LayoutDashboard },
    { key: "qr", icon: QrCode },
    { key: "events", icon: CalendarDays, badge: badges?.events },
    { key: "attendance", icon: ClipboardCheck },
    { key: "notify", icon: Bell, badge: badges?.notify },
  ];
  return (
    <nav
      aria-label="Main"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0A0E1A] px-2 pt-2 xl:hidden"
      style={{ paddingBottom: "0.5rem" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-between gap-1">
        {items.map((it) => {
          const on = active === it.key;
          return (
            <li key={it.key} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setActive(it.key)}
                aria-current={on ? "page" : undefined}
                className={`relative flex w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10.5px] font-semibold leading-tight transition ${
                  on ? "bg-gradient-to-b from-[#0B0F14] to-[#18212B] !text-white shadow-md" : "text-white/60 active:bg-white/10"
                }`}
              >
                <span className="relative">
                  <it.icon className={`h-5 w-5 ${on ? "" : "text-[#2E8E82]"}`} />
                  {!!it.badge && it.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center">{t(it.key)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
