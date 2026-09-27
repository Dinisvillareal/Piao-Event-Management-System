import React from "react";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

type StatusType = "success" | "warning" | "error";

const TYPE_STYLES: Record<
  StatusType,
  { Icon: React.ComponentType<{ size?: number; className?: string }>; accent: string; button: string }
> = {
  success: { Icon: CheckCircle, accent: "text-sage-400", button: "bg-sage-700 hover:bg-sage-800 text-white" },
  warning: { Icon: AlertTriangle, accent: "text-amber-400", button: "bg-amber-500 hover:bg-amber-600 text-white" },
  error: { Icon: XCircle, accent: "text-red-400", button: "bg-red-500 hover:bg-red-600 text-white" },
};

interface StatusModalProps {
  open: boolean;
  type: StatusType;
  title: string;
  message: string;
  okLabel: string;
  onClose: () => void;
  /** z-index bump for a status popup opened on top of an already-open form/confirm modal (e.g. an inline validation error shown above an Add/Edit form). */
  z?: number;
  /** Override the default per-type icon -- rare, only for a call site whose message needs a more specific icon than the generic success/warning/error glyph. */
  icon?: React.ReactNode;
}

/**
 * Shared single-action "here's what happened" popup -- success, warning, or
 * error/validation -- used after a save, delete, download, or any other
 * action across both portals, so every module reports outcomes the same
 * way instead of each screen growing its own bespoke result popup.
 */
export default function StatusModal({ open, type, title, message, okLabel, onClose, z = 50, icon }: StatusModalProps) {
  if (!open) return null;
  const { Icon, accent, button } = TYPE_STYLES[type];
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center px-4"
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-3 flex justify-center ${accent}`}>{icon ?? <Icon size={44} />}</div>
        <h3 className={`text-xl font-bold mb-2 ${type === "success" ? "text-white" : accent}`}>{title}</h3>
        <p className="text-[15px] text-white/50 mb-6">{message}</p>
        <button onClick={onClose} className={`px-6 py-2.5 rounded-full transition ${button}`}>
          {okLabel}
        </button>
      </div>
    </div>
  );
}
