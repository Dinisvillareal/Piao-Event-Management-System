import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldCheck, Smartphone, BellRing, Crown, CheckCircle2, AlertTriangle, ChevronRight, Clock } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import ChangePasswordForm from "../../../components/auth/ChangePasswordForm";
import PasswordConfirmDialog from "../../../components/auth/PasswordConfirmDialog";
import SaveButton from "../../../components/ui/SaveButton";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
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
  validation_id_url?: string | null;
};
type SecAlert = { id: number; type: string; title: string; message: string; read: boolean; created_at: string };

export default function MyAccountView() {
  const { t, locale } = useLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState<SecAlert[]>([]);
  const [transfer, setTransfer] = useState<{ from_name: string | null; expires_at: string } | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [notice, setNotice] = useState("");
  // Which settings section is open on the right (picked from the list on the left).
  const [section, setSection] = useState<"password" | "twostep" | "alerts">("password");

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
  // "Are you sure?" and "discard changes?" steps
  const [askSetupSure, setAskSetupSure] = useState(false);
  const [askOnSure, setAskOnSure] = useState(false);
  const [askOffSure, setAskOffSure] = useState(false);
  const [askDiscardSetup, setAskDiscardSetup] = useState(false);
  const [askDiscardOff, setAskDiscardOff] = useState(false);

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

  const confirmSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (tfaCode.length === 6 && !tfaBusy) setAskOnSure(true);
  };

  const finishSetup = async () => {
    setAskOnSure(false);
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

  const discardSetup = () => {
    setAskDiscardSetup(false);
    setTfaSetup(null);
    setTfaCode("");
    setTfaError("");
  };

  const cancelOff = () => {
    if (offCode) setAskDiscardOff(true);
    else setOffOpen(false);
  };

  const discardOff = () => {
    setAskDiscardOff(false);
    setOffOpen(false);
    setOffCode("");
  };

  const accept = async (password: string, otp: string) => {
    await api.post("/staff/head-transfer/accept", { password, otp });
    setAcceptOpen(false);
    window.location.reload(); // new role -> reload so the whole page reflects it
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : t("secNever"));
  const pretty = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

  const initials = me ? `${me.first_name?.[0] ?? ""}${me.last_name?.[0] ?? ""}`.toUpperCase() || "S" : "";
  const unread = alerts.filter((a) => !a.read).length;
  const alertPager = usePager(alerts, 5);
  const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold";
  const ghostBtn = "rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10";

  // The picked section as one card (icon + title + short text + status, then the form).
  const row = (key: "password" | "twostep" | "alerts", Icon: any, title: string, desc: string, badge: React.ReactNode, content: React.ReactNode) =>
    section === key ? (
      <SectionCard key={key} icon={<Icon className="h-5 w-5" />} title={title} desc={desc} action={badge ?? undefined}>
        {content}
      </SectionCard>
    ) : null;

  return (
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] dash-canvas p-4 sm:p-8">
    <div className="space-y-6">
      <div className="dash-card rounded-[32px] p-5 sm:p-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl page-title-gradient page-title-fit">{t("myaccount")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">{t("secMyAccountSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px] lg:items-start">
        {/* Left: who you are, and the menu -- one card. */}
        <aside className="lg:sticky lg:top-4">
          <section className="dash-card relative overflow-hidden rounded-3xl">
            {/* Cover, fading into the card like the resident profile (mask works in light and dark) */}
            <div
              className="absolute inset-x-0 top-0 h-[270px] bg-gradient-to-br from-[#0F2A4A] via-[#135863] to-[#2E8E82]"
              style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)" }}
            >
              {me?.validation_id_url ? (
                <img src={me.validation_id_url} alt="" className="h-full w-full object-cover object-[50%_14%]" />
              ) : (
                <div className="flex h-full w-full items-start justify-center pt-8">
                  {me ? (
                    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gold-400 text-4xl font-extrabold text-[#08130F] ring-4 ring-white/80 shadow-xl">{initials}</div>
                  ) : (
                    <Skeleton className="h-28 w-28 !rounded-full" />
                  )}
                </div>
              )}
            </div>

            <div className="relative z-10 space-y-3.5 px-4 pb-4 pt-[168px]">
              {/* Name panel */}
              <div className="profile-glass rounded-2xl px-5 py-5 text-center">
                {!me ? (
                  <div aria-busy="true" className="flex flex-col items-center">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="mt-2 h-4 w-20" />
                  </div>
                ) : (
                  <>
                    <h2 className="break-words font-display text-2xl font-extrabold leading-tight text-white">{me.first_name} {me.last_name}</h2>
                    <p className="mt-1 font-mono text-sm text-white/55">{me.user_code}</p>
                    <span className={`${pill} mt-3 ${me.is_head_staff ? "bg-gold-400/20 text-gold-300" : "bg-[#4FBEB0]/15 text-[#2E8E82]"}`}>
                      {me.is_head_staff ? <><Crown className="h-3.5 w-3.5" /> {t("secHeadStaff")}</> : t("staffOption")}
                    </span>
                    <dl className="mt-4 text-sm">
                      <div className="flex items-center justify-between gap-3 border-t border-white/15 py-2.5">
                        <dt className="shrink-0 text-white/50">{t("secLastSignIn")}</dt>
                        <dd className="min-w-0 truncate text-right font-semibold text-white">{when(me.last_login_at)}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>

              {/* At a glance */}
              {me && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="min-w-0 rounded-2xl border border-white/20 bg-white/10 px-2 py-3 text-center backdrop-blur-xl">
                    <p className="text-2xl font-black leading-tight text-white">{me.two_factor_enabled ? t("secStatusOn") : t("secStatusOff")}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-white/60">{t("secTwoStepTitle")}</p>
                    <span className={`mx-auto mt-1.5 block h-1 w-8 rounded-full ${me.two_factor_enabled ? "bg-[#4FBEB0]" : "bg-gold-400"}`} />
                  </div>
                  <div className="min-w-0 rounded-2xl border border-white/20 bg-white/10 px-2 py-3 text-center backdrop-blur-xl">
                    <p className="text-2xl font-black leading-tight text-white">{unread}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-white/60">{t("secAlertsTitle")}</p>
                    <span className={`mx-auto mt-1.5 block h-1 w-8 rounded-full ${unread > 0 ? "bg-red-400" : "bg-[#4FBEB0]"}`} />
                  </div>
                </div>
              )}

              {/* Menu */}
              <nav className="rounded-2xl border border-white/20 bg-white/[0.06] p-2 backdrop-blur-xl">
                {([
                  { key: "password", label: t("changePassword"), icon: KeyRound, badge: null as string | null },
                  { key: "twostep", label: t("secTwoStepTitle"), icon: Smartphone, badge: me ? (me.two_factor_enabled ? t("secStatusOn") : t("secStatusOff")) : null },
                  { key: "alerts", label: t("secAlertsTitle"), icon: BellRing, badge: unread > 0 ? String(unread) : null },
                ] as const).map((it) => {
                  const on = section === it.key;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => setSection(it.key)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition ${on ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] !text-white shadow-sm" : "text-white/75 hover:bg-[#4FBEB0]/[0.08] hover:text-white"}`}
                    >
                      <it.icon className={`h-[18px] w-[18px] shrink-0 ${on ? "text-white" : "text-[#2E8E82]"}`} />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-white/20 text-white" : it.key === "alerts" ? "bg-red-500/15 text-red-500" : "bg-[#F5C451]/25 text-[#9A6B00]"}`}>{it.badge}</span>}
                      <ChevronRight className={`h-4 w-4 shrink-0 ${on ? "text-white/70" : "text-white/30"}`} />
                    </button>
                  );
                })}
              </nav>
            </div>
          </section>
        </aside>

        {/* Middle: the picked section. */}
        <div className="min-w-0 space-y-5">
          {row("password", KeyRound, t("changePassword"), t("secChangePasswordDesc"), null, (<>
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
              ) : <div className="max-w-2xl"><ChangePasswordForm userId={me.id} minLength={minLength} confirmFirst onDone={() => { setPwDone(true); setNotice(t("secPasswordChangedNote")); load(); }} /></div>
            )}
          </>))}

          {row("twostep", Smartphone, t("secTwoStepTitle"), t("secTwoStepDesc"), me && !tfaSetup ? (
            <span className={`${pill} ${me.two_factor_enabled ? "bg-[#4FBEB0]/15 text-[#2E8E82]" : "bg-[#F5C451]/25 text-[#9A6B00]"}`}>
              {me.two_factor_enabled ? t("secStatusOn") : t("secStatusOff")}
            </span>
          ) : null, (<>
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
                  <button type="button" onClick={() => setAskDiscardSetup(true)} className={ghostBtn}>{t("cancel")}</button>
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
                      <button onClick={() => setAskOffSure(true)} disabled={offCode.length !== 6} className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40">{t("secTurnOff")}</button>
                      <button onClick={cancelOff} className={ghostBtn}>{t("cancel")}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-white/65">{t("secTwoStepIsOff")}{me.is_head_staff ? ` ${t("secTwoStepHeadAdvice")}` : ""}</p>
                <SaveButton type="button" icon={ShieldCheck} className="w-full sm:w-auto sm:min-w-[300px]" active onClick={() => setAskSetupSure(true)}>{t("secSetUpTwoStep")}</SaveButton>
              </div>
            )}
          </>))}


      {row("alerts", BellRing, t("secAlertsTitle"), t("secAlertsDesc"), unread > 0 ? <span className={`${pill} bg-red-500/15 text-red-500`}>{unread}</span> : null, (<>
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
                  <span className="shrink-0 text-xs text-white/40">{new Date(a.created_at).toLocaleString(locale)}</span>
                </div>
                <p className="mt-1 text-sm text-white/65">{a.message}</p>
              </li>
            ))}
          </ul>
        )}
        <SimplePager className="mt-4" page={alertPager.page} totalPages={alertPager.totalPages} onChange={alertPager.go} loading={alertPager.switching} />
      </>))}
        </div>

        {/* Right: a quick security check. */}
        <aside className="space-y-5 max-sm:hidden lg:col-span-2 xl:col-span-1 xl:sticky xl:top-4">
          <section className="dash-card rounded-[32px] p-6">
            {!me ? (
              <Skeleton className="h-40 w-full !rounded-2xl" />
            ) : (() => {
              const checks = [
                { key: "twostep", label: t("secTwoStepTitle"), note: me.two_factor_enabled ? t("secTwoStepIsOn") : t("secTwoStepIsOff"), done: me.two_factor_enabled, go: "twostep" as const },
                { key: "alerts", label: t("secUnreadAlerts"), note: String(unread), done: unread === 0, go: "alerts" as const },
              ];
              const doneN = checks.filter((c) => c.done).length;
              const R = 38;
              const C = 2 * Math.PI * R;
              const pct = Math.round((doneN / checks.length) * 100);
              return (
                <>
                  <div className="flex flex-col items-center text-center">
                    <span className="relative flex h-28 w-28 items-center justify-center">
                      <svg viewBox="0 0 90 90" className="absolute inset-0 -rotate-90">
                        <defs>
                          {/* Live gradient: the colours keep flowing around the ring. */}
                          <linearGradient id="acctRingGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="90" y2="90">
                            <stop offset="0%" stopColor="#F6D365" />
                            <stop offset="30%" stopColor="#A9C98A" />
                            <stop offset="55%" stopColor="#5BBBA6" />
                            <stop offset="78%" stopColor="#2A8A93" />
                            <stop offset="100%" stopColor="#146088" />
                            <animateTransform attributeName="gradientTransform" type="rotate" from="0 45 45" to="360 45 45" dur="6s" repeatCount="indefinite" />
                          </linearGradient>
                        </defs>
                        <circle cx="45" cy="45" r={R} fill="none" stroke="rgba(42,138,147,0.16)" strokeWidth="8" />
                        <circle cx="45" cy="45" r={R} fill="none" stroke="url(#acctRingGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${C * (pct || 4) / 100} ${C}`} />
                      </svg>
                      <span className="relative font-display text-2xl font-extrabold text-white">{doneN}<span className="text-base text-white/45">/{checks.length}</span></span>
                    </span>
                    <p className="mt-3 font-display text-lg font-extrabold text-white">{t("accSecurityCheck")}</p>
                    <p className="text-sm text-white/55">{t("accChecksPassed").replace("{a}", String(doneN)).replace("{b}", String(checks.length))}</p>
                    <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${doneN === checks.length ? "bg-[#4FBEB0]/20 text-[#2E8E82]" : "bg-[#F5C451]/25 text-[#9A6B00]"}`}>
                      {doneN === checks.length ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {doneN === checks.length ? t("accAllGood") : t("accNeedsAttention")}
                    </span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {checks.map((c) => (
                      <li key={c.key}>
                        <button type="button" onClick={() => setSection(c.go)} className="dash-card !shadow-[0_8px_20px_rgba(15,23,42,0.1)] flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition hover:!border-[#4FBEB0]/60">
                          {c.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2E8E82]" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-[#B7841A]" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">{c.label}</span>
                            <span className="block truncate text-xs text-white/55">{c.note}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="dash-card !shadow-[0_8px_20px_rgba(15,23,42,0.1)] mt-3 flex items-start gap-3 rounded-2xl px-4 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15"><Clock className="h-5 w-5 text-[#2E8E82]" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">{t("secLastSignIn")}</p>
                      <p className="text-sm font-semibold text-white">{when(me.last_login_at)}</p>
                      <p className="mt-0.5 text-xs text-white/50">{t("secLastSignInHint")}</p>
                    </div>
                  </div>
                  {me.is_head_staff && (
                    <p className="mt-4 rounded-2xl border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm leading-relaxed text-white/70">
                      <span className="font-bold text-gold-300">{t("secYouAreHead")}</span> {t("secHeadStricterNote")}
                    </p>
                  )}
                </>
              );
            })()}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={askSetupSure}
        icon={<Smartphone size={36} />}
        title={t("secAskSetupTitle")}
        body={t("secAskSetupBody")}
        confirmLabel={t("secAskSetupYes")}
        onCancel={() => setAskSetupSure(false)}
        onConfirm={() => { setAskSetupSure(false); setAskSetupPw(true); }}
      />
      <ConfirmDialog
        open={askOnSure}
        icon={<ShieldCheck size={36} />}
        title={t("secAskOnTitle")}
        body={t("secAskOnBody")}
        confirmLabel={t("secAskOnYes")}
        onCancel={() => setAskOnSure(false)}
        onConfirm={finishSetup}
      />
      <ConfirmDialog
        open={askOffSure}
        tone="danger"
        icon={<AlertTriangle size={36} />}
        title={t("secAskOffTitle")}
        body={t("secAskOffBody")}
        confirmLabel={t("secAskOffYes")}
        onCancel={() => setAskOffSure(false)}
        onConfirm={() => { setAskOffSure(false); setAskOffPw(true); }}
      />
      <ConfirmDialog
        open={askDiscardSetup}
        tone="warning"
        icon={<AlertTriangle size={36} />}
        title={t("secDiscardTitle")}
        body={t("secDiscardSetupBody")}
        cancelLabel={t("secKeepEditing")}
        confirmLabel={t("secDiscardYes")}
        onCancel={() => setAskDiscardSetup(false)}
        onConfirm={discardSetup}
      />
      <ConfirmDialog
        open={askDiscardOff}
        tone="warning"
        icon={<AlertTriangle size={36} />}
        title={t("secDiscardTitle")}
        body={t("secDiscardTypedBody")}
        cancelLabel={t("secKeepEditing")}
        confirmLabel={t("secDiscardYes")}
        onCancel={() => setAskDiscardOff(false)}
        onConfirm={discardOff}
      />
      <StatusModal open={!!notice} type="success" title={t("successTitle")} message={notice} onClose={() => setNotice("")} z={9999} />

      <PasswordConfirmDialog open={askSetupPw} title={t("secSetUpTwoStep")} body={t("secConfirmWithPassword")} confirmLabel={t("secContinue")} onConfirm={startSetup} onClose={() => setAskSetupPw(false)} />
      <PasswordConfirmDialog open={askOffPw} title={t("secTurnOff")} body={t("secTurnOffBody")} confirmLabel={t("secTurnOff")} tone="danger" onConfirm={turnOff} onClose={() => setAskOffPw(false)} />
      <PasswordConfirmDialog open={acceptOpen} title={t("secAcceptHeadRole")} body={t("secAcceptBody")} confirmLabel={t("secAcceptHeadRole")} requireOtp twoFactorOn={!!me?.two_factor_enabled} onConfirm={accept} onClose={() => setAcceptOpen(false)} />
    </div>
    </div>
  );
}
