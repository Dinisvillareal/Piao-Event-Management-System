import { useEffect, useState } from "react";
import { Clock, Lock, ShieldCheck } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import PasswordConfirmDialog from "../../../components/auth/PasswordConfirmDialog";
import SaveButton from "../../../components/ui/SaveButton";
import SectionCard from "../../../components/ui/SectionCard";
import Skeleton from "../../../components/ui/Skeleton";

type Rules = { close_after_hours: number; edit_window_minutes: number };

// Placeholder shaped like one rule card's body: number box + unit, preset chips, hint line.
function RuleSkeleton({ chips }: { chips: number }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-[62px] w-32 !rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: chips }, (_, i) => <Skeleton key={i} className="h-8 w-[72px] !rounded-full" />)}
      </div>
      <Skeleton className="mt-4 h-4 w-44" />
    </>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Settings -> Feedback Rules: how long members can send feedback after an
// event, and how long they can still edit it. Everyone on staff can read the
// rules; only Head Staff can change them (and must re-enter their password).
export default function FeedbackRulesView({ isHeadStaff }: { isHeadStaff: boolean }) {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<Rules | null>(null);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [askPw, setAskPw] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.get("/settings/feedback-rules")
      .then((res) => {
        setSaved(res.data);
        setHours(String(res.data.close_after_hours));
        setMinutes(String(res.data.edit_window_minutes));
      })
      .catch(() => setSaved({ close_after_hours: 12, edit_window_minutes: 30 }));
  }, []);

  const h = clamp(parseInt(hours, 10) || 0, 0, 720);
  const m = clamp(parseInt(minutes, 10) || 0, 0, 1440);
  const valid = h >= 1 && /^\d+$/.test(minutes);
  const dirty = !!saved && (h !== saved.close_after_hours || m !== saved.edit_window_minutes);

  const save = async (password: string) => {
    const res = await api.put("/settings/feedback-rules", { close_after_hours: h, edit_window_minutes: m, password });
    setSaved(res.data);
    setHours(String(res.data.close_after_hours));
    setMinutes(String(res.data.edit_window_minutes));
    setAskPw(false);
    setNotice(t("fbRulesSaved"));
    window.setTimeout(() => setNotice(""), 4000);
  };

  const input = "w-32 rounded-full border border-white/15 bg-white/10 px-4 py-3.5 text-center text-2xl font-bold text-white focus:border-[#4FBEB0]/70 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 disabled:opacity-60";
  const chip = (on: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
      on ? "border-[#4FBEB0] bg-[#4FBEB0]/15 text-[#7DD8CB]" : "border-white/15 text-white/65 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{t("fbRulesTitle")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/50">{t("fbRulesSubtitle")}</p>
      </div>

      <div className="max-w-5xl space-y-6">
        {!isHeadStaff && (
          <p className="flex items-center gap-2.5 rounded-xl border border-gold-400/25 bg-gold-400/10 px-4 py-3 text-sm text-gold-300">
            <Lock className="h-4 w-4 shrink-0" /> {t("fbRulesHeadOnly")}
          </p>
        )}
        {notice && <p className="rounded-xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 px-4 py-3 text-sm font-semibold text-[#7DD8CB]">{notice}</p>}

        {!saved ? (
          <div className="space-y-6" aria-busy="true">
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard icon={<Clock className="h-5 w-5" />} title={t("fbRuleCloseTitle")} desc={t("fbRuleCloseDesc")} className="h-full">
                <RuleSkeleton chips={5} />
              </SectionCard>
              <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title={t("fbRuleEditTitle")} desc={t("fbRuleEditDesc")} className="h-full">
                <RuleSkeleton chips={5} />
              </SectionCard>
            </div>
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <Skeleton className="h-3.5 w-40" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </section>
            {isHeadStaff && <Skeleton className="h-[54px] w-full !rounded-full" />}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (isHeadStaff && valid && dirty) setAskPw(true); }} noValidate className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard icon={<Clock className="h-5 w-5" />} title={t("fbRuleCloseTitle")} desc={t("fbRuleCloseDesc")} className="h-full">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="text" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 3))} disabled={!isHeadStaff} className={input} aria-label={t("fbRuleCloseTitle")} />
                  <span className="text-base font-semibold text-white/70">{t("fbUnitHours")}</span>
                </div>
                {isHeadStaff && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[6, 12, 24, 48, 72].map((v) => (
                      <button key={v} type="button" onClick={() => setHours(String(v))} className={chip(h === v)}>{v} {t("fbShortHours")}</button>
                    ))}
                  </div>
                )}
                {hours !== "" && h < 1 && <p className="mt-3 text-sm text-red-400">{t("fbRuleCloseMin")}</p>}
                <p className="mt-4 text-sm text-white/45">{t("fbRuleRange").replace("{a}", "1").replace("{b}", "720")}</p>
              </SectionCard>

              <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title={t("fbRuleEditTitle")} desc={t("fbRuleEditDesc")} className="h-full">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={!isHeadStaff} className={input} aria-label={t("fbRuleEditTitle")} />
                  <span className="text-base font-semibold text-white/70">{t("fbUnitMinutes")}</span>
                </div>
                {isHeadStaff && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[0, 15, 30, 60, 120].map((v) => (
                      <button key={v} type="button" onClick={() => setMinutes(String(v))} className={chip(m === v && minutes !== "")}>{v === 0 ? t("fbNoEdits") : `${v} ${t("fbShortMinutes")}`}</button>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-sm text-white/45">{t("fbRuleRange").replace("{a}", "0").replace("{b}", "1440")} · {t("fbRuleZeroNote")}</p>
              </SectionCard>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{t("fbRulePreview")}</p>
              <ul className="mt-3 space-y-2.5 text-base text-white/85">
                <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4FBEB0]" />{t("fbPreviewClose").replace("{n}", String(h || 0))}</li>
                <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4FBEB0]" />{m > 0 ? t("fbPreviewEdit").replace("{n}", String(m)) : t("fbPreviewNoEdit")}</li>
              </ul>
            </section>

            {isHeadStaff && (
              <SaveButton active={valid && dirty} className="w-full">{t("saveLabel")}</SaveButton>
            )}
          </form>
        )}
      </div>

      <PasswordConfirmDialog
        open={askPw}
        title={t("fbRulesConfirmTitle")}
        body={t("fbRulesConfirmBody")}
        confirmLabel={t("saveLabel")}
        onConfirm={save}
        onClose={() => setAskPw(false)}
      />
    </div>
  );
}
