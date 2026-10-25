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
}: {
  active: boolean;
  children: ReactNode;
  type?: "submit" | "button";
  onClick?: () => void;
  title?: string;
  className?: string;
  size?: "md" | "sm";
  icon?: LucideIcon;
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
        active
          ? "border-[#1E3A5F] bg-[#1E3A5F] text-white hover:border-[#122436] hover:bg-[#122436] hover:shadow-md"
          : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
      } ${className}`}
    >
      {children}
      <span
        className={`flex shrink-0 items-center justify-center rounded-full transition-colors duration-500 ease-out ${
          sm ? "h-8 w-8" : "h-11 w-11"
        } ${active ? "bg-[#0A0E1A] group-hover:bg-white/15" : "bg-white/5"}`}
      >
        <Icon className={`${sm ? "h-4 w-4" : "h-5 w-5"} ${active ? "text-white" : "text-white/20"}`} />
      </span>
    </button>
  );
}
