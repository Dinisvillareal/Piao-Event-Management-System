import { useEffect, useRef, useState } from "react";
import { X, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { checkPassword, isStrongPassword } from "../../lib/passwordPolicy";
import PasswordField from "./PasswordField";
import SaveButton from "../ui/SaveButton";
import Portal from "../ui/Portal";

// Login-page screen where a resident (or a staff member whose password was
// reset) uses the printed activation slip. Two steps, so the person is never
// asked for a password before the slip has been proven real:
//   1. Check the slip: user code + activation code.
//   2. Choose your own password (the slip is checked again by the server).
export default function ActivateAccountModal({ onClose, initialUserCode = "", onActivated }: { onClose: () => void; initialUserCode?: string; onActivated?: () => void }) {
  const { t } = useLanguage();
  const [step, setStep] = useState<1 | 2>(1);
  const [userCode, setUserCode] = useState(initialUserCode);
  // The activation code is typed in three boxes of four, with a clear dash between them.
  const [parts, setParts] = useState<string[]>(["", "", ""]);
  const code = parts.join("-");
  const segRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (initialUserCode ? segRefs[0] : userRef).current?.focus();
  }, [initialUserCode]);

  const clean = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // Typing or pasting fills the boxes in order (a pasted full code with or without dashes spreads over all three).
  const setSegment = (i: number, raw: string) => {
    const chars = clean(raw);
    const next = [...parts];
    let pos = i;
    let rest = chars;
    while (rest.length > 0 && pos < 3) {
      next[pos] = rest.slice(0, 4);
      rest = rest.slice(4);
      pos++;
    }
    if (chars.length === 0) next[i] = "";
    setParts(next);
    setError("");
    if (chars.length > 0) {
      const last = Math.min(pos - 1, 2);                      // the box that was filled last
      segRefs[next[last].length === 4 && last < 2 ? last + 1 : last].current?.focus();
    }
  };
  const onSegKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && parts[i] === "" && i > 0) { e.preventDefault(); segRefs[i - 1].current?.focus(); }
  };

  const step1Ready = userCode.trim().length >= 3 && parts.every((p) => p.length === 4) && !busy;
  //const strong = checkPassword(pw).every((c) => c.ok) && pw.length >= 12;
  const strong = isStrongPassword(pw);
  const step2Ready = strong && pw === pw2 && !busy;

  const checkSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1Ready) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/activate-account/check", { user_code: userCode.trim(), activation_code: code }, { skipAuthRedirect: true } as any);
      setStep(2);
    } catch (err: any) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2Ready) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        "/activate-account",
        { user_code: userCode.trim(), activation_code: code, password: pw, password_confirmation: pw2 },
        { skipAuthRedirect: true } as any
      );
      setDone(true);
      onActivated?.();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === "activation_failed") {
        // the slip stopped being valid in between: back to the check step with the reason
        setStep(1);
        setPw("");
        setPw2("");
      }
      setError(data?.errors?.password?.[0] || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50 disabled:opacity-50";

  const dot = (n: 1 | 2, label: string) => {
    const active = step === n;
    const complete = step > n || done;
    return (
      <div className="flex flex-1 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-[#4FBEB0] text-[#0A0E1A]" : active ? "bg-white text-[#0A0E1A]" : "bg-white/10 text-white/50"}`}>
          {complete ? "✓" : n}
        </span>
        <span className={`text-xs font-semibold ${active || complete ? "text-white" : "text-white/45"}`}>{label}</span>
      </div>
    );
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[30px] border border-white/10 bg-[#0A0E1A] p-7 shadow-2xl sm:p-9"
          
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">{t("actTitle")}</h2>
            <button onClick={onClose} aria-label={t("closeLabel")} className="shrink-0 text-white/50 hover:text-white">
              <X size={24} />
            </button>
          </div>

          {done ? (
            <div className="mt-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#4FBEB0]" />
              <p className="mt-3 text-base text-[#7DD8CB]">{t("actDone")}</p>
              <button onClick={onClose} className="mt-6 rounded-full bg-sage-700 px-7 py-3 font-semibold text-white transition hover:bg-sage-800">
                {t("actBack")}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-3">
                {dot(1, t("actStepCheck"))}
                <span className="h-px w-6 shrink-0 bg-white/20" />
                {dot(2, t("actStepPassword"))}
              </div>

              {step === 1 ? (
                <form onSubmit={checkSlip} noValidate className="mt-5 space-y-4">
                  <p className="text-sm text-white/60">{t("actIntro")}</p>
                  <input
                    ref={userRef}
                    value={userCode}
                    onChange={(e) => { setUserCode(e.target.value.toUpperCase()); setError(""); }}
                    placeholder={t("actUserCode")}
                    autoComplete="username"
                    className={field}
                    disabled={busy}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-white/70">{t("actSlipCode")}</label>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                          <input
                            ref={segRefs[i]}
                            value={parts[i]}
                            onChange={(e) => setSegment(i, e.target.value)}
                            onKeyDown={(e) => onSegKey(i, e)}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label={`${t("actSlipCode")} ${i + 1}/3`}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            placeholder="••••"
                            className="min-w-0 flex-1 rounded-2xl border border-white/25 bg-white/10 px-1 py-3.5 text-center font-mono text-lg font-bold tracking-[0.15em] text-white placeholder:text-white/25 focus:border-[#4FBEB0]/60 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 disabled:opacity-50 sm:text-xl"
                            disabled={busy}
                          />
                          {i < 2 && <span aria-hidden="true" className="select-none text-2xl font-extrabold leading-none text-[#7DD8CB]">–</span>}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-white/45">{t("actCodeHint")}</p>
                  </div>
                  {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={!step1Ready}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] px-6 py-3.5 text-base font-bold text-[#08130F] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? t("actChecking") : t("actCheckBtn")} {!busy && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              ) : (
                <form onSubmit={activate} noValidate className="mt-5 space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#7DD8CB]" />
                    <p className="text-sm text-white/85">{t("actVerified").replace("{code}", userCode.trim())}</p>
                  </div>
                  <PasswordField value={pw} onChange={(v) => { setPw(v); setError(""); }} placeholder={t("actNewPw")} disabled={busy} />
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
                  <PasswordField value={pw2} onChange={(v) => { setPw2(v); setError(""); }} placeholder={t("actConfirmPw")} disabled={busy} invalid={pw2.length > 0 && pw !== pw2} />
                  {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}
                  <SaveButton className="w-full" active={step2Ready}>{busy ? t("savingLabel") : t("actSubmit")}</SaveButton>
                  <button type="button" onClick={() => { setStep(1); setError(""); }} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                    <ArrowLeft className="h-4 w-4" /> {t("actBackStep")}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
