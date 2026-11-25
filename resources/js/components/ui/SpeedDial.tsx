import { useEffect, useState, type ComponentType } from "react";
import { X } from "lucide-react";

export interface SpeedDialItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  onSelect: () => void;
}

/**
 * Phone-only floating button (Material "speed dial"): shows the icon of the current choice; tap it
 * and the other choices fan out above it, each as a round icon with a small label card beside it.
 */
export default function SpeedDial({ items, value, className = "" }: { items: SpeedDialItem[]; value: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.key === value) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`fixed z-[60] sm:hidden print:hidden ${className}`}>
      {open && <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="speed-dial-fab fixed bottom-5 right-4 z-50 flex flex-col items-end gap-3">
        {open && items.map((it) => {
          const on = it.key === value;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => { setOpen(false); if (!on) it.onSelect(); }}
              className="flex items-center gap-3"
              aria-label={it.label}
            >
              <span className={`rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg ${on ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] !text-white" : "dash-card text-white"}`}>
                {it.label}{it.count !== undefined && <span className={`ml-2 ${on ? "!text-white/70" : "text-white/50"}`}>{it.count}</span>}
              </span>
              <span className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${on ? "bg-gradient-to-br from-[#0B0F14] to-[#18212B] !text-white" : "dash-card text-[#2E8E82]"}`}>
                <it.icon className="h-5 w-5" />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={current.label}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#2E8E82] !text-white shadow-xl transition active:scale-95"
        >
          {open ? <X className="h-6 w-6" /> : <current.icon className="h-6 w-6" />}
          {!open && current.count !== undefined && current.count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#F5C451] px-1 text-[11px] font-bold !text-[#0B0F14]">{current.count}</span>
          )}
        </button>
      </div>
    </div>
  );
}
