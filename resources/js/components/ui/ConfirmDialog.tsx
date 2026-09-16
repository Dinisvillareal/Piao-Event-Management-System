import React from "react";

type Tone = "brand" | "danger";

const TONE_STYLES: Record<Tone, { icon: string; title: string; button: string }> = {
  brand: { icon: "text-sage-800", title: "text-sage-800", button: "bg-sage-800 hover:bg-sage-900" },
  danger: { icon: "text-red-500", title: "text-red-600", button: "bg-red-600 hover:bg-red-700" },
};

const TONE_STYLES_DARK: Record<Tone, { icon: string; title: string; button: string }> = {
  brand: { icon: "text-[#4FBEB0]", title: "text-white", button: "bg-gold-400 hover:bg-gold-500 text-[#08130F] font-bold" },
  danger: { icon: "text-red-400", title: "text-red-400", button: "bg-red-500 hover:bg-red-600 text-white" },
};

interface ConfirmDialogProps {
  open: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: Tone;
  /** z-index bump for confirm dialogs opened on top of an already-open form modal. */
  z?: number;
  /** Dark navy styling for callers whose surrounding page/modal has already
      moved to the dark palette (e.g. the Membership Groups page). Every
      other caller keeps the original light card look. */
  dark?: boolean;
}

/**
 * Shared "are you sure?" step used in front of add/edit/delete actions
 * across the staff views, so every module asks the same way instead of
 * each screen growing its own bespoke confirm popup.
 */
export default function ConfirmDialog({
  open,
  icon,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = "brand",
  z = 70,
  dark = false,
}: ConfirmDialogProps) {
  if (!open) return null;
  const styles = dark ? TONE_STYLES_DARK[tone] : TONE_STYLES[tone];
  return (
    <div className={`fixed inset-0 flex items-center justify-center px-4 ${dark ? "bg-black/70" : "bg-black/40"}`} style={{ zIndex: z }}>
      <div className={`rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center ${dark ? "bg-[#0A0E1A] border border-white/10" : "bg-white"}`}>
        <div className={`mb-3 flex justify-center ${styles.icon}`}>{icon}</div>
        <h3 className={`text-lg font-bold mb-2 ${styles.title}`}>{title}</h3>
        <p className={`text-sm mb-6 ${dark ? "text-white/50" : "text-[#6B7280]"}`}>{body}</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={onCancel}
            className={`px-5 py-2 rounded-full border ${dark ? "border-white/15 text-white hover:bg-white/10" : "border-[#E6E0D3] text-[#1A1A1A] hover:bg-sage-50"}`}
          >
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={`px-5 py-2 rounded-full transition ${dark ? styles.button : `text-white ${styles.button}`}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
