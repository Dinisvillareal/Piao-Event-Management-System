import type { ReactNode } from "react";
import { Save, type LucideIcon } from "lucide-react";

// The one save/submit button used by every form: a pill with the action's
// label and a round icon chip. It stays flat and un-clickable until there is
// something to save (`active`), then turns navy -- same look as Add New Record
// and Create New Event, so every form behaves the same.
export default function SaveButton({
  active,
  children,
  type = "submit",
  onClick,
  title,
  className = "",
  size = "md",
  icon: Icon = Save,
  plain = false,
}: {
  active: boolean;
  children: ReactNode;
  type?: "submit" | "button";
  onClick?: () => void;
  title?: string;
  className?: string;
  size?: "md" | "sm";
  icon?: LucideIcon;
  /** Flat white pill (no colour gradient) -- used for Close buttons. */
  plain?: boolean;
}) {
  const sm = size === "sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={!active}
      title={title}
      className={`group inline-flex items-center justify-center rounded-full border font-semibold uppercase tracking-wide shadow-sm transition-all duration-500 ease-out ${
        sm ? "gap-2.5 py-1.5 pl-5 pr-1.5 text-[13px]" : "gap-3 py-2 pl-6 pr-2 text-base"
      } ${
        active && plain
          ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          : active
          ? "btn-live-navy border-[#1E3A5F] bg-[#1E3A5F] text-white hover:border-[#274A77] hover:bg-[#274A77]"
          : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
      } ${className}`}
    >
      {children}
      <span
        className={`flex shrink-0 items-center justify-center rounded-full transition-colors duration-500 ease-out ${
          sm ? "h-8 w-8" : "h-11 w-11"
        } ${active && plain ? "bg-slate-100 group-hover:bg-slate-200" : active ? "bg-white/20 group-hover:bg-white/30" : "bg-white/5"}`}
      >
        <Icon className={`${sm ? "h-4 w-4" : "h-5 w-5"} ${active && plain ? "text-slate-700" : active ? "text-white" : "text-white/20"}`} />
      </span>
    </button>
  );
}
