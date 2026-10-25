import { useState } from "react";
import { X, LifeBuoy, KeyRound } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { checkPassword } from "../../lib/passwordPolicy";
import PasswordField from "./PasswordField";
import SaveButton from "../ui/SaveButton";

// Login-page help for a forgotten password. Passwords are never reset by
// email or SMS (that would be the easiest way into a staff account):
//  - residents and staff ask the Head Staff / records office;
//  - the Head Staff uses a printed one-time recovery code.
export default function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [showHead, setShowHead] = useState(false);
  const [userCode, setUserCode] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const strong = checkPassword(pw).every((c) => c.ok) && pw.length >= 12;
  const ready = userCode.trim() !== "" && code.trim() !== "" && strong && pw === pw2 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/recover-head-access", {
        user_code: userCode.trim(),
        recovery_code: code.trim(),
        new_password: pw,
        new_password_confirmation: pw2,
      }, { skipAuthRedirect: true } as any);
      setDone(true);
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      setError(errors?.new_password?.[0] || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[30px] border border-white/10 bg-[#0A0E1A] p-7 shadow-2xl sm:p-9" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">{t("secForgotTitle")}</h2>
          <button onClick={onClose} aria-label={t("closeLabel")} className="shrink-0 text-white/50 hover:text-white"><X size={24} /></button>
        </div>

        {done ? (
          <div className="mt-6 text-center">
            <p className="text-base text-[#7DD8CB]">{t("secRecoveryDone")}</p>
            <button onClick={onClose} className="mt-6 rounded-full bg-sage-700 px-7 py-3 font-semibold text-white transition hover:bg-sage-800">{t("secBackToSignIn")}</button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-[#4FBEB0]" />
              <div className="text-sm text-white/65">
                <p className="font-semibold text-white">{t("secForgotAskTitle")}</p>
                <p className="mt-1">{t("secForgotAskBody")}</p>
              </div>
            </div>

            {!showHead ? (
              <button onClick={() => setShowHead(true)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#7DD8CB] hover:underline">
                <KeyRound className="h-4 w-4" /> {t("secHeadRecoveryLink")}
              </button>
            ) : (
              <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                <h3 className="border-b-2 border-white/30 pb-2 text-sm font-bold uppercase tracking-wider text-white">{t("secHeadRecoveryTitle")}</h3>
                <p className="text-sm text-white/55">{t("secHeadRecoveryBody")}</p>
                <input value={userCode} onChange={(e) => setUserCode(e.target.value)} placeholder="PR-0001" autoComplete="username" className={field} disabled={busy} />
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoComplete="off" className={`${field} tracking-widest`} disabled={busy} />
                <PasswordField value={pw} onChange={setPw} placeholder={t("secNewPassword12")} disabled={busy} />
                <PasswordField value={pw2} onChange={setPw2} placeholder={t("secConfirmNewPassword")} disabled={busy} invalid={pw2.length > 0 && pw !== pw2} />
                {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}
                <SaveButton className="w-full" active={ready}>{busy ? t("savingLabel") : t("secResetWithCode")}</SaveButton>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
