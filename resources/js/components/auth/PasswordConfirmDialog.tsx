import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import PasswordField from "./PasswordField";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiErrorMessage } from "../../lib/api";

// "Type your password to continue" -- the gate in front of every sensitive
// Head Staff action. The caller's onConfirm runs the request; a wrong
// password (or any server refusal) is shown here and the dialog stays open.
export default function PasswordConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "brand",
  onConfirm,
  onClose,
  z = 10050,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "brand" | "danger";
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
  z?: number;
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setPassword(""); setError(""); setBusy(false); }
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      setError(errors?.password?.[0] || apiErrorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const btn = tone === "danger" ? "bg-red-500 hover:bg-red-600" : "bg-sage-700 hover:bg-sage-800";

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" style={{ zIndex: z }} onClick={() => !busy && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[#0A0E1A] p-8 text-center shadow-2xl">
        <div className={`mb-3 flex justify-center ${tone === "danger" ? "text-red-400" : "text-[#4FBEB0]"}`}><ShieldCheck size={44} /></div>
        <h3 className="mb-2 text-xl font-bold text-white">{title}</h3>
        {body && <div className="mb-5 text-base text-white/55">{body}</div>}
        <div className="text-left">
          <label className="mb-1.5 block text-base font-semibold text-white/80">{t("secYourPassword")}</label>
          <PasswordField value={password} onChange={setPassword} placeholder={t("secEnterYourPassword")} autoComplete="current-password" disabled={busy} invalid={!!error} />
          {error && <p className="mt-2 px-2 text-base text-red-400">{error}</p>}
        </div>
        <div className="mt-7 flex justify-center gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-white/15 px-6 py-3 text-base text-white transition hover:bg-white/10 disabled:opacity-50">{t("cancel")}</button>
          <button type="submit" disabled={!password || busy} className={`rounded-full px-7 py-3 text-base font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${btn}`}>
            {busy ? t("savingLabel") : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
