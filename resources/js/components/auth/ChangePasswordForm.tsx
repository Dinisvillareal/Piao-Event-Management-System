import { useState } from "react";
import { Check, Circle } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { checkPassword, PASSWORD_MAX } from "../../lib/passwordPolicy";
import PasswordField from "./PasswordField";
import SaveButton from "../ui/SaveButton";

// Change your OWN password: current password + new password twice, with a
// live checklist. Used by My Account and by the forced "choose a new
// password" screen. `minLength` is 12 for the Head Staff account.
export default function ChangePasswordForm({
  userId,
  minLength = 8,
  currentLabel,
  onDone,
  submitLabel,
  split = false,
}: {
  userId: number | string;
  minLength?: number;
  currentLabel?: string;
  onDone: () => void;
  submitLabel?: string;
  /** Wide layout: fields on the left, rules + button on the right (from lg up). */
  split?: boolean;
}) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; general?: string }>({});
  const [busy, setBusy] = useState(false);

  const checks = checkPassword(next);
  const longEnough = next.length >= minLength;
  const strong = checks.every((c) => c.ok) && longEnough;
  const matches = confirm.length > 0 && next === confirm;
  const ready = !!current && strong && matches && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErrors({});
    try {
      await api.patch(`/users/${userId}/change-password`, {
        current_password: current,
        new_password: next,
        new_password_confirmation: confirm,
      }, { skipAuthRedirect: true } as any);
      onDone();
    } catch (err: any) {
      const e2 = err?.response?.data?.errors;
      setErrors({
        current: e2?.current_password?.[0],
        next: e2?.new_password?.[0],
        general: !e2 ? apiErrorMessage(err) : undefined,
      });
      setCurrent("");
    } finally {
      setBusy(false);
    }
  };

  const rules = [
    { ok: next.length >= minLength && next.length <= PASSWORD_MAX && !/\s/.test(next), label: t("secPwLength").replace("{n}", String(minLength)) },
    { ok: checks[1].ok, label: t("secPwLower") },
    { ok: checks[2].ok, label: t("secPwUpper") },
    { ok: checks[3].ok, label: t("secPwNumber") },
    { ok: checks[4].ok, label: t("secPwSpecial") },
  ];
  const ruleList = (
    <ul className={split ? "space-y-2.5 text-sm" : "mt-3 grid gap-1.5 px-2 text-sm sm:grid-cols-2"}>
      {rules.map((c) => (
        <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-[#7DD8CB]" : "text-white/55"}`}>
          {c.ok ? <Check className="h-4 w-4 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />} {c.label}
        </li>
      ))}
    </ul>
  );
  const fieldsBlock = (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-base font-semibold text-white">{currentLabel ?? t("secCurrentPassword")}</label>
        <PasswordField value={current} onChange={setCurrent} placeholder={currentLabel ?? t("secCurrentPassword")} autoComplete="current-password" disabled={busy} invalid={!!errors.current} />
        {errors.current && <p className="mt-1.5 px-2 text-sm text-red-400">{errors.current}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-base font-semibold text-white">{t("secNewPassword")}</label>
        <PasswordField value={next} onChange={setNext} placeholder={t("secNewPassword")} disabled={busy} invalid={!!errors.next} />
        {errors.next && <p className="mt-1.5 px-2 text-sm text-red-400">{errors.next}</p>}
        {!split && ruleList}
      </div>

      <div>
        <label className="mb-1.5 block text-base font-semibold text-white">{t("secConfirmNewPassword")}</label>
        <PasswordField value={confirm} onChange={setConfirm} placeholder={t("secConfirmNewPassword")} disabled={busy} invalid={confirm.length > 0 && !matches} />
        {confirm.length > 0 && !matches && <p className="mt-1.5 px-2 text-sm text-red-400">{t("passwordsDoNotMatch")}</p>}
      </div>
    </div>
  );
  const general = errors.general && <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{errors.general}</p>;
  const button = <SaveButton className="w-full" active={ready}>{busy ? t("savingLabel") : (submitLabel ?? t("secUpdatePassword"))}</SaveButton>;

  if (split) {
    return (
      <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-2">
        {fieldsBlock}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="mb-3 text-sm font-semibold text-white">{t("secPwRulesTitle")}</p>
            {ruleList}
          </div>
          {general}
          <div className="mt-auto">{button}</div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {fieldsBlock}
      {general}
      {button}
    </form>
  );
}
