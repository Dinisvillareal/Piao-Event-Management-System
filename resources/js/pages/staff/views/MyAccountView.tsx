import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldCheck, Smartphone, BellRing, Crown, CheckCircle2 } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import ChangePasswordForm from "../../../components/auth/ChangePasswordForm";
import PasswordConfirmDialog from "../../../components/auth/PasswordConfirmDialog";
import SaveButton from "../../../components/ui/SaveButton";
import SectionCard from "../../../components/ui/SectionCard";
import Skeleton from "../../../components/ui/Skeleton";
import SimplePager from "../../../components/ui/SimplePager";
import usePager from "../../../hooks/usePager";
import { notifyStaffAlertsChanged, setSecurityUnread } from "../../../lib/staffAlertsStore";

type Me = {
  id: number;
  user_code: string;
  first_name: string;
  last_name: string;
  is_head_staff: boolean;
  last_login_at: string | null;
  two_factor_enabled: boolean;
};
type SecAlert = { id: number; type: string; title: string; message: string; read: boolean; created_at: string };

export default function MyAccountView() {
  const { t } = useLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState<SecAlert[]>([]);
  const [transfer, setTransfer] = useState<{ from_name: string | null; expires_at: string } | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [notice, setNotice] = useState("");

  // two-step login
  const [tfaSetup, setTfaSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [tfaCode, setTfaCode] = useState("");
  const [tfaError, setTfaError] = useState("");
  const [tfaBusy, setTfaBusy] = useState(false);
  const [askSetupPw, setAskSetupPw] = useState(false);
  const [offCode, setOffCode] = useState("");
  const [askOffPw, setAskOffPw] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);

  const alertsRef = useRef<SecAlert[]>([]);
  alertsRef.current = alerts;

  const load = useCallback(async () => {
    try {
      const [m, a, tr] = await Promise.all([
        api.get("/me"),
        api.get("/security/alerts"),
        api.get("/staff/head-transfer"),
      ]);
      setMe(m.data);
      setAlerts(a.data.data ?? []);
      setTransfer(tr.data.transfer ?? null);
    } catch { /* the api client already handles sign-outs */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Opening this page counts as reading the alerts -- they stay highlighted
  // while you look, and are marked read when you leave.
  useEffect(() => () => {
    if (alertsRef.current.some((a) => !a.read)) {
      api.post("/security/alerts/read-all").then(() => { setSecurityUnread(0); notifyStaffAlertsChanged(); }).catch(() => {});
    }
  }, []);

  const minLength = me?.is_head_staff ? 12 : 8;

  const startSetup = async (password: string) => {
    const res = await api.post("/two-factor/setup", { password });
    setTfaSetup({ secret: res.data.secret, uri: res.data.uri });
    setTfaCode("");
    setTfaError("");
    setAskSetupPw(false);
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTfaBusy(true);
    setTfaError("");
    try {
      await api.post("/two-factor/confirm", { code: tfaCode });
      setTfaSetup(null);
      setNotice(t("secTwoStepOnNotice"));
      await load();
    } catch (err: any) {
      setTfaError(err?.response?.data?.errors?.code?.[0] || apiErrorMessage(err));
    } finally {
      setTfaBusy(false);
    }
  };

  const turnOff = async (password: string) => {
    await api.post("/two-factor/disable", { password, code: offCode });
    setAskOffPw(false);
    setOffOpen(false);
    setOffCode("");
    setNotice(t("secTwoStepOffNotice"));
    await load();
  };

  const accept = async (password: string) => {
    await api.post("/staff/head-transfer/accept", { password });
    setAcceptOpen(false);
    window.location.reload(); // new role -> reload so the whole page reflects it
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t("secNever"));
  const pretty = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

  const initials = me ? `${me.first_name?.[0] ?? ""}${me.last_name?.[0] ?? ""}`.toUpperCase() || "S" : "";
  const unread = alerts.filter((a) => !a.read).length;
  const alertPager = usePager(alerts, 5);
  const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold";
  const ghostBtn = "rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10";

  return (
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{t("myaccount")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">{t("secMyAccountSubtitle")}</p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 px-4 py-3 text-sm text-[#7DD8CB]">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {notice}
        </div>
      )}

      {transfer && (
        <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <Crown className="h-7 w-7 shrink-0 text-gold-300" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-white">{t("secTransferOfferedTitle")}</h2>
              <p className="mt-1 text-sm text-white/65">
                {t("secTransferOfferedBody").replace("{name}", transfer.from_name ?? "")}{" "}
                {t("secTransferExpires").replace("{when}", new Date(transfer.expires_at).toLocaleString())}
              </p>
            </div>
            <button onClick={() => setAcceptOpen(true)} className="rounded-full bg-gold-400 px-6 py-2.5 text-sm font-bold text-[#08130F] transition hover:opacity-90">
              {t("secAcceptHeadRole")}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[480px_minmax(0,1fr)] lg:items-start">
        {/* ── Left: who you are + security at a glance ── */}
        <aside className="lg:sticky lg:top-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            {!me ? (
              <div aria-busy="true" aria-live="polite">
                <div className="flex flex-col items-center">
                  <Skeleton className="h-20 w-20 !rounded-full" />
                  <Skeleton className="mt-4 h-6 w-40" />
                  <Skeleton className="mt-2 h-4 w-20" />
                  <Skeleton className="mt-3 h-6 w-24 !rounded-full" />
                </div>
                <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
                  <div>
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="mt-2 h-6 w-48" />
                    <Skeleton className="mt-2 h-3.5 w-full" />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-4">
                    <Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-12 !rounded-full" />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-4">
                    <Skeleton className="h-5 w-24" /><Skeleton className="h-6 w-9 !rounded-full" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-20 w-full !rounded-xl" />
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-400 text-2xl font-bold text-[#08130F]">{initials}</div>
                  <h2 className="mt-4 text-xl font-bold text-white">{me.first_name} {me.last_name}</h2>
                  <p className="text-base text-white/55">{me.user_code}</p>
                  <span className={`${pill} mt-3 ${me.is_head_staff ? "bg-gold-400/20 text-gold-300" : "bg-[#4FBEB0]/15 text-[#7DD8CB]"}`}>
                    {me.is_head_staff ? <><Crown className="h-3.5 w-3.5" /> {t("secHeadStaff")}</> : t("staffOption")}
                  </span>
                </div>

                <dl className="mt-6 divide-y divide-white/10 border-t border-white/10 text-base">
                  <div className="py-3">
                    <dt className="text-sm font-semibold uppercase tracking-wide text-white/45">{t("secLastSignIn")}</dt>
                    <dd className="mt-1 text-lg font-semibold text-white">{when(me.last_login_at)}</dd>
                    <dd className="mt-0.5 text-sm text-white/45">{t("secLastSignInHint")}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-white/70">{t("secTwoStepTitle")}</dt>
                    <dd className={`${pill} ${me.two_factor_enabled ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : "bg-gold-400/15 text-gold-300"}`}>
                      {me.two_factor_enabled ? t("secStatusOn") : t("secStatusOff")}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-white/70">{t("secUnreadAlerts")}</dt>
                    <dd className={`${pill} ${unread > 0 ? "bg-red-500/15 text-red-300" : "bg-white/10 text-white/60"}`}>{unread}</dd>
                  </div>
                </dl>

                {me.is_head_staff && (
                  <p className="mt-2 rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-3.5 text-sm leading-relaxed text-white/65">
                    <span className="font-bold text-gold-300">{t("secYouAreHead")}</span> {t("secHeadStricterNote")}
                  </p>
                )}
              </>
            )}
          </section>
        </aside>

        {/* ── Right: things you can do (kept at a comfortable reading width) ── */}
        <div className="max-w-2xl space-y-6">
          <SectionCard icon={<KeyRound className="h-5 w-5" />} title={t("changePassword")} desc={t("secChangePasswordDesc")}>
            {pwDone ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#7DD8CB]"><CheckCircle2 className="h-5 w-5" /> {t("secPasswordChangedNote")}</p>
                <button onClick={() => setPwDone(false)} className={ghostBtn}>{t("secChangeAgain")}</button>
              </div>
            ) : (
              !me ? (
                <div className="space-y-5" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i}><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-[54px] w-full !rounded-full" /></div>
                  ))}
                  <Skeleton className="h-[54px] w-full !rounded-full" />
                </div>
              ) : <div><ChangePasswordForm userId={me.id} minLength={minLength} onDone={() => { setPwDone(true); load(); }} /></div>
            )}
          </SectionCard>

          <SectionCard
            icon={<Smartphone className="h-5 w-5" />}
            title={t("secTwoStepTitle")}
            desc={t("secTwoStepDesc")}
            action={me && !tfaSetup ? (
              <span className={`${pill} ${me.two_factor_enabled ? "bg-[#4FBEB0]/15 text-[#7DD8CB]" : "bg-gold-400/15 text-gold-300"}`}>
                {me.two_factor_enabled ? t("secStatusOn") : t("secStatusOff")}
              </span>
            ) : undefined}
          >
            {!me ? (
              <div className="space-y-4" aria-busy="true">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-[52px] w-full max-w-[300px] !rounded-full" />
              </div>
            ) : tfaSetup ? (
              <form onSubmit={confirmSetup} className="space-y-6">
                <p className="text-sm text-white/65">{t("secTwoStepScan")}</p>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <div className="shrink-0 rounded-2xl bg-white p-3"><QRCodeSVG value={tfaSetup.uri} size={168} /></div>
                  <div className="min-w-0 text-sm text-white/65">
                    <p className="font-semibold text-white">{t("secTwoStepManual")}</p>
                    <p className="mt-2 break-all rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-base tracking-wider text-white">{pretty(tfaSetup.secret)}</p>
                    <p className="mt-2 text-xs text-white/45">{t("secTwoStepManualHint")}</p>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-white">{t("secAuthCodeLabel")}</label>
                  <input
                    value={tfaCode}
                    onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="w-full max-w-xs rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-center text-xl tracking-[0.4em] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                  />
                  {tfaError && <p className="mt-2 px-2 text-sm text-red-400">{tfaError}</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <SaveButton className="min-w-[220px]" active={tfaCode.length === 6 && !tfaBusy}>{tfaBusy ? t("savingLabel") : t("secTurnOn")}</SaveButton>
                  <button type="button" onClick={() => setTfaSetup(null)} className={ghostBtn}>{t("cancel")}</button>
                </div>
              </form>
            ) : me.two_factor_enabled ? (
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#7DD8CB]"><ShieldCheck className="h-5 w-5" /> {t("secTwoStepIsOn")}</p>
                {!offOpen ? (
                  <button onClick={() => setOffOpen(true)} className="rounded-full border border-red-400/40 px-5 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10">{t("secTurnOff")}</button>
                ) : (
                  <div className="max-w-xs space-y-3">
                    <label className="block text-sm font-semibold text-white/80">{t("secAuthCodeLabel")}</label>
                    <input value={offCode} onChange={(e) => setOffCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000"
                      className="w-full rounded-full border border-white/25 bg-white/10 px-5 py-3 text-center text-lg tracking-[0.4em] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20" />
                    <div className="flex gap-3">
                      <button onClick={() => setAskOffPw(true)} disabled={offCode.length !== 6} className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40">{t("secTurnOff")}</button>
                      <button onClick={() => { setOffOpen(false); setOffCode(""); }} className={ghostBtn}>{t("cancel")}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-white/65">{t("secTwoStepIsOff")}{me.is_head_staff ? ` ${t("secTwoStepHeadAdvice")}` : ""}</p>
                <SaveButton type="button" icon={ShieldCheck} className="w-full sm:w-auto sm:min-w-[300px]" active onClick={() => setAskSetupPw(true)}>{t("secSetUpTwoStep")}</SaveButton>
              </div>
            )}
          </SectionCard>


      <SectionCard
        icon={<BellRing className="h-5 w-5" />}
        title={t("secAlertsTitle")}
        desc={t("secAlertsDesc")}
        action={unread > 0 ? <span className={`${pill} bg-red-500/15 text-red-300`}>{unread}</span> : undefined}
      >
        {!me || alertPager.switching ? (
          <div className="space-y-2.5" aria-busy="true">
            {Array.from({ length: !me ? 3 : Math.max(1, alertPager.shown.length) }, (_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28" /></div>
                <Skeleton className="mt-2.5 h-3.5 w-full" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/45">{t("secNoAlerts")}</p>
        ) : (
          <ul className="space-y-2.5">
            {alertPager.shown.map((a) => (
              <li key={a.id} className={`rounded-xl border px-4 py-3 ${a.read ? "border-white/10 bg-white/[0.03]" : "border-[#4FBEB0]/40 bg-[#4FBEB0]/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="flex items-center gap-2 text-sm font-bold text-white">{!a.read && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />}{a.title}</p>
                  <span className="shrink-0 text-xs text-white/40">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm text-white/65">{a.message}</p>
              </li>
            ))}
          </ul>
        )}
        <SimplePager className="mt-4" page={alertPager.page} totalPages={alertPager.totalPages} onChange={alertPager.go} loading={alertPager.switching} />
      </SectionCard>
        </div>
      </div>

      <PasswordConfirmDialog open={askSetupPw} title={t("secSetUpTwoStep")} body={t("secConfirmWithPassword")} confirmLabel={t("secContinue")} onConfirm={startSetup} onClose={() => setAskSetupPw(false)} />
      <PasswordConfirmDialog open={askOffPw} title={t("secTurnOff")} body={t("secTurnOffBody")} confirmLabel={t("secTurnOff")} tone="danger" onConfirm={turnOff} onClose={() => setAskOffPw(false)} />
      <PasswordConfirmDialog open={acceptOpen} title={t("secAcceptHeadRole")} body={t("secAcceptBody")} confirmLabel={t("secAcceptHeadRole")} onConfirm={accept} onClose={() => setAcceptOpen(false)} />
    </div>
    </div>
  );
}
