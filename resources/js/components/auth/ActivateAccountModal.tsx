import { useState } from "react";
import { X } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { checkPassword } from "../../lib/passwordPolicy";
import PasswordField from "./PasswordField";
import SaveButton from "../ui/SaveButton";
import Portal from "../ui/Portal";

// Login-page screen where a resident uses the printed activation slip and
// chooses their own password. The birth date is only a second check.
export default function ActivateAccountModal({ onClose, initialUserCode = "", onActivated }: { onClose: () => void; initialUserCode?: string; onActivated?: () => void }) {
  const { t } = useLanguage();
  const [userCode, setUserCode] = useState(initialUserCode);
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
      await api.post(
        "/activate-account",
        {
          user_code: userCode.trim(),
          activation_code: code.trim(),
          password: pw,
          password_confirmation: pw2,
        },
        { skipAuthRedirect: true } as any
      );
      setDone(true);
      onActivated?.();
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      setError(errors?.password?.[0] || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50";

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[30px] border border-white/10 bg-[#0A0E1A] p-7 shadow-2xl sm:p-9"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">{t("actTitle")}</h2>
            <button onClick={onClose} aria-label={t("closeLabel")} className="shrink-0 text-white/50 hover:text-white">
              <X size={24} />
            </button>
          </div>

          {done ? (
            <div className="mt-6 text-center">
              <p className="text-base text-[#7DD8CB]">{t("actDone")}</p>
              <button onClick={onClose} className="mt-6 rounded-full bg-sage-700 px-7 py-3 font-semibold text-white transition hover:bg-sage-800">
                {t("actBack")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-5 space-y-4">
              <p className="text-sm text-white/60">{t("actIntro")}</p>
              <input value={userCode} onChange={(e) => setUserCode(e.target.value)} placeholder={t("actUserCode")} autoComplete="username" className={field} disabled={busy} />
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("actCodeField")} autoComplete="off" className={`${field} tracking-widest`} disabled={busy} />
              <PasswordField value={pw} onChange={setPw} placeholder={t("actNewPw")} disabled={busy} />
              {pw.length > 0 && (
                <ul className="grid grid-cols-1 gap-1">
                  {checkPassword(pw).map((c) => (
                    <li key={c.key} className={`flex items-center gap-2 text-xs ${c.ok ? "text-[#7DD8CB]" : "text-white/45"}`}>
                      <span aria-hidden="true">{c.ok ? "✓" : "•"}</span>
                      {t(`resPw_${c.key}`)}
                    </li>
                  ))}
                </ul>
              )}
              <PasswordField value={pw2} onChange={setPw2} placeholder={t("actConfirmPw")} disabled={busy} invalid={pw2.length > 0 && pw !== pw2} />
              {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}
              <SaveButton className="w-full" active={ready}>{busy ? t("savingLabel") : t("actSubmit")}</SaveButton>
            </form>
          )}
        </div>
      </div>
    </Portal>
  );
}
