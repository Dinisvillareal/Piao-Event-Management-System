import React from "react";

type Tone = "brand" | "danger";

const TONE_STYLES: Record<Tone, { icon: string; title: string; button: string }> = {
  brand: { icon: "text-[#005f63]", title: "text-[#005f63]", button: "bg-[#005f63] hover:bg-[#004a4d]" },
  danger: { icon: "text-red-500", title: "text-red-600", button: "bg-red-600 hover:bg-red-700" },
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
}: ConfirmDialogProps) {
  if (!open) return null;
  const styles = TONE_STYLES[tone];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4" style={{ zIndex: z }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
        <div className={`mb-3 flex justify-center ${styles.icon}`}>{icon}</div>
        <h3 className={`text-lg font-bold mb-2 ${styles.title}`}>{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{body}</p>
        <div className="flex justify-center gap-3">
          <button onClick={onCancel} className="px-5 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={`px-5 py-2 rounded-full text-white ${styles.button}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
