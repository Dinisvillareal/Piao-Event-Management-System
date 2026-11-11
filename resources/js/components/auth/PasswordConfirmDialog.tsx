import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import PasswordField from "./PasswordField";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiErrorMessage } from "../../lib/api";
import Portal from "../ui/Portal";

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
  requireOtp = false,
  twoFactorOn = true,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "brand" | "danger";
  onConfirm: (password: string, otp: string) => Promise<void>;
  onClose: () => void;
  z?: number;
  /** Also ask for the 6-digit authenticator code (highest-risk Head Staff actions). */
  requireOtp?: boolean;
  /** Whether this account has two-step login on; when it does not, the dialog says so and cannot be submitted. */
  twoFactorOn?: boolean;
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setPassword(""); setOtp(""); setError(""); setBusy(false); }
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy || (requireOtp && (!twoFactorOn || otp.replace(/\s/g, "").length < 6))) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(password, otp.replace(/\s/g, ""));
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      setError(errors?.password?.[0] || errors?.otp?.[0] || apiErrorMessage(err));
      if (errors?.otp) setOtp(""); else setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const btn = tone === "danger" ? "bg-red-500 hover:bg-red-600" : "bg-sage-700 hover:bg-sage-800";

  return (
    <Portal>
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
        {requireOtp && (twoFactorOn ? (
          <div className="mt-5 text-left">
            <label className="mb-1.5 block text-base font-semibold text-white/80">{t("secOtpLabel")}</label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("secOtpPlaceholder")}
              disabled={busy}
              className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3.5 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-white/35 focus:border-[#4FBEB0]/60 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20"
            />
            <p className="mt-2 px-2 text-sm text-white/45">{t("secOtpHint")}</p>
          </div>
        ) : (
          <p className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t("secOtpSetupFirst")}
          </p>
        ))}
        <div className="mt-7 flex justify-center gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-white/15 px-6 py-3 text-base text-white transition hover:bg-white/10 disabled:opacity-50">{t("cancel")}</button>
          <button type="submit" disabled={!password || busy || (requireOtp && (!twoFactorOn || otp.replace(/\s/g, "").length < 6))} className={`rounded-full px-7 py-3 text-base font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${btn}`}>
            {busy ? t("savingLabel") : confirmLabel}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}
