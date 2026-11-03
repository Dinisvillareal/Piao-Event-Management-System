import KpiCard from "../../../components/ui/KpiCard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, UserPlus, KeyRound, LogOut, Ban, RotateCcw, UserMinus, ArrowRightLeft, Printer, Copy, Check, FileKey2, Users, X, MoreVertical, ShieldCheck, type LucideIcon } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import PasswordConfirmDialog from "../../../components/auth/PasswordConfirmDialog";
import SearchBar from "../../../components/ui/SearchBar";
import Skeleton from "../../../components/ui/Skeleton";
import StatCardSkeleton from "../../../components/ui/StatCardSkeleton";
import SectionCard from "../../../components/ui/SectionCard";
import SimplePager from "../../../components/ui/SimplePager";
import useFilterSwitching from "../../../hooks/useFilterSwitching";
import FilterBar, { type ExtraChip } from "../../../components/ui/FilterBar";
import QuickTabs from "../../../components/ui/QuickTabs";
import Portal from "../../../components/ui/Portal";

type Staff = {
  id: number;
  user_code: string;
  name: string;
  barangay_position: string | null;
  is_head_staff: boolean;
  suspended_at: string | null;
  last_login_at: string | null;
  must_change_password: boolean;
  two_factor_enabled: boolean;
  active_sessions: number;
};
type Candidate = { id: number; user_code: string; name: string; barangay_position: string | null };
type Overview = {
  staff: Staff[];
  transfer: { id: number; to_user_id: number; to_name: string | null; expires_at: string } | null;
  recovery_codes_remaining: number;
  transfer_hours: number;
};
type Action =
  | { kind: "reset" | "suspend" | "unsuspend" | "demote" | "transfer"; staff: Staff }
  | { kind: "promote"; candidate: Candidate }
  | { kind: "codes" };

const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold";
const actBtn = "inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10";

// "⋯" menu for the less-used actions on a staff row, so each row stays calm.
function RowMenu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-white/15 bg-[#0A0E1A] p-1.5 shadow-2xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/85 transition hover:bg-white/10";
const menuDanger = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10";

export default function StaffAccountsView() {
  const { t } = useLanguage();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tempPw, setTempPw] = useState<{ name: string; value: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/staff-accounts");
      setData(res.data);
      setTeamTick((n) => n + 1); // the team list below is its own server query -- refresh it too
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
      else setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Candidates to promote -- searched as you type (residents with a portal account).
  useEffect(() => {
    if (search.trim().length < 2) { setCandidates([]); return; }
    const id = setTimeout(() => {
      api.get("/staff-accounts/candidates", { params: { search: search.trim() } })
        .then((r) => setCandidates(r.data ?? []))
        .catch(() => setCandidates([]));
    }, 120);
    return () => clearTimeout(id);
  }, [search]);

  const flash = (msg: string) => { setNotice(msg); setError(""); window.setTimeout(() => setNotice(""), 6000); };

  const run = async (password: string) => {
    if (!action) return;
    if (action.kind === "promote") {
      await api.post("/staff-accounts/promote", { user_id: action.candidate.id, password });
      setSearch(""); setCandidates([]);
      flash(t("secPromotedNotice").replace("{name}", action.candidate.name));
    } else if (action.kind === "codes") {
      const res = await api.post("/staff-accounts/recovery-codes", { password });
      setCodes(res.data.codes ?? []);
    } else {
      const id = action.staff.id;
      if (action.kind === "reset") {
        const res = await api.post(`/staff-accounts/${id}/reset-password`, { password });
        setTempPw({ name: action.staff.name, value: res.data.temporary_password });
      } else if (action.kind === "suspend") {
        await api.post(`/staff-accounts/${id}/suspend`, { password });
        flash(t("secSuspendedNotice").replace("{name}", action.staff.name));
      } else if (action.kind === "unsuspend") {
        await api.post(`/staff-accounts/${id}/unsuspend`, { password });
        flash(t("secReactivatedNotice").replace("{name}", action.staff.name));
      } else if (action.kind === "demote") {
        await api.post(`/staff-accounts/${id}/demote`, { password });
        flash(t("secDemotedNotice").replace("{name}", action.staff.name));
      } else if (action.kind === "transfer") {
        await api.post("/staff-accounts/transfer", { to_user_id: id, password });
        flash(t("secTransferStartedNotice").replace("{name}", action.staff.name));
      }
    }
    setAction(null);
    await load();
  };

  const signOutAll = async (s: Staff) => {
    try {
      await api.post(`/staff-accounts/${s.id}/sign-out`);
      flash(t("secSignedOutNotice").replace("{name}", s.name));
      await load();
    } catch (err) { setError(apiErrorMessage(err)); }
  };

  const cancelTransfer = async () => {
    try { await api.post("/staff-accounts/transfer/cancel"); flash(t("secTransferCancelledNotice")); await load(); }
    catch (err) { setError(apiErrorMessage(err)); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const printCodes = () => {
    if (!codes) return;
    const w = window.open("", "_blank", "width=520,height=640");
    if (!w) return;
    w.document.write(`<html><head><title>${t("secRecoveryCodesTitle")}</title></head><body style="font-family:Arial,sans-serif;padding:32px">
      <h2>${t("secRecoveryCodesTitle")}</h2><p>${t("secRecoveryPrintNote")}</p>
      <ol style="font-size:20px;letter-spacing:2px;line-height:2">${codes.map((c) => `<li>${c}</li>`).join("")}</ol>
      <p style="margin-top:24px;color:#666;font-size:13px">${new Date().toLocaleString()}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t("secNever"));
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "S";
  // Team list: quick tabs (with counts) + search + sort, then 5 per page.
  const [teamTab, setTeamTab] = useState<"all" | "active" | "suspended" | "no-2fa">("all");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamSort, setTeamSort] = useState("head");
  const teamSwitching = false;
  const allStaff = data?.staff ?? [];
  // Tabs, search, sort and paging for the team list are done by the server (StaffAccountController::team).
  const [teamRows, setTeamRows] = useState<Staff[]>([]);
  const [teamMeta, setTeamMeta] = useState({ total: 0, last_page: 1 });
  const [tabCounts, setTabCounts] = useState({ all: 0, active: 0, suspended: 0, no2fa: 0 });
  const [teamPage, setTeamPage] = useState(1);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamTick, setTeamTick] = useState(0);
  const teamSeq = useRef(0);
  const teamKey = `${teamTab}|${teamSearch}|${teamSort}`;
  const prevTeamKey = useRef(teamKey);
  useEffect(() => {
    if (prevTeamKey.current !== teamKey) {
      prevTeamKey.current = teamKey;
      if (teamPage !== 1) { setTeamPage(1); return; }
    }
    const timer = setTimeout(async () => {
      const seq = ++teamSeq.current;
      setTeamLoading(true);
      try {
        const res = await api.get("/staff-accounts/team", { params: { tab: teamTab, search: teamSearch.trim() || undefined, sort: teamSort, page: teamPage, per_page: 5 } });
        if (seq !== teamSeq.current) return;
        if (res.data.meta.last_page < teamPage) { setTeamPage(Math.max(1, res.data.meta.last_page)); return; }
        setTeamRows(res.data.data ?? []);
        setTeamMeta({ total: res.data.meta.total, last_page: res.data.meta.last_page });
        setTabCounts(res.data.counts);
      } catch {
        // keep the last list; the overview call reports real errors
      } finally {
        if (seq === teamSeq.current) setTeamLoading(false);
      }
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey, teamPage, teamTick]);
  const team = { page: teamPage, totalPages: Math.max(1, teamMeta.last_page), shown: teamRows, switching: teamLoading, go: setTeamPage };
  const teamTabChips: ExtraChip[] = teamTab === "all" ? [] : [{
    key: "tab",
    label: teamTab === "active" ? t("tabActive") : teamTab === "suspended" ? t("tabSuspended") : t("tabNoTwoStep"),
    onRemove: () => setTeamTab("all"),
  }];
  const others = useMemo(() => (data?.staff ?? []).filter((s) => !s.is_head_staff && !s.suspended_at), [data]);

  const dialogProps = useMemo(() => {
    if (!action) return null;
    switch (action.kind) {
      case "promote": return { title: t("secGiveStaffAccess"), body: t("secPromoteBody").replace("{name}", action.candidate.name), label: t("secGiveStaffAccess"), tone: "brand" as const };
      case "reset": return { title: t("secResetPassword"), body: t("secResetBody").replace("{name}", action.staff.name), label: t("secResetPassword"), tone: "brand" as const };
      case "suspend": return { title: t("secSuspend"), body: t("secSuspendBody").replace("{name}", action.staff.name), label: t("secSuspend"), tone: "danger" as const };
      case "unsuspend": return { title: t("secReactivate"), body: t("secReactivateBody").replace("{name}", action.staff.name), label: t("secReactivate"), tone: "brand" as const };
      case "demote": return { title: t("secRemoveAccess"), body: t("secRemoveBody").replace("{name}", action.staff.name), label: t("secRemoveAccess"), tone: "danger" as const };
      case "transfer": return { title: t("secMakeHead"), body: t("secTransferBody").replace("{name}", action.staff.name).replace("{hours}", String(data?.transfer_hours ?? 48)), label: t("secOfferHeadRole"), tone: "brand" as const };
      case "codes": return { title: t("secNewRecoveryCodes"), body: t("secCodesBody"), label: t("secCreateCodes"), tone: "brand" as const };
    }
  }, [action, data, t]);

  if (forbidden) {
    return <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white/70">{t("secHeadOnly")}</p>;
  }

  return (
    <div className="-m-3 sm:-m-6 min-h-[calc(100dvh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{t("staffaccounts")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">{t("secStaffAccountsSubtitle")}</p>
      </div>

      {notice && <div className="flex items-center gap-2 rounded-xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/10 px-4 py-3 text-sm text-[#7DD8CB]"><Check className="h-5 w-5 shrink-0" /> {notice}</div>}
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      {data?.transfer && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-4">
          <ArrowRightLeft className="h-6 w-6 shrink-0 text-gold-300" />
          <p className="min-w-0 flex-1 text-base text-white/80">
            {t("secTransferPending").replace("{name}", data.transfer.to_name ?? "").replace("{when}", new Date(data.transfer.expires_at).toLocaleString())}
          </p>
          <button className={actBtn} onClick={cancelTransfer}><X className="h-3.5 w-3.5" /> {t("secCancelTransfer")}</button>
        </div>
      )}

      <div className="report-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />) : (
          <>
            <KpiCard value={data?.staff.length ?? 0} label={t("secStatStaff")} description={t("secStatStaffDesc")} icon={Users} gradient="from-sage-400 to-sage-700" delay={0} />
            <KpiCard value={data?.staff.filter((s) => s.two_factor_enabled).length ?? 0} label={t("secStatTwoStep")} description={t("secStatTwoStepDesc").replace("{n}", String(data?.staff.length ?? 0))} icon={ShieldCheck} gradient="from-sage-800 to-[#1C2E2B]" delay={70} />
            <KpiCard value={data?.staff.filter((s) => s.suspended_at).length ?? 0} label={t("secStatSuspended")} description={t("secStatSuspendedDesc")} icon={Ban} gradient="from-[#8A3D2C] to-[#5C2A1E]" delay={140} />
            <KpiCard value={data?.recovery_codes_remaining ?? 0} label={t("secStatCodes")} description={t("secStatCodesDesc")} icon={FileKey2} gradient="from-gold-400 to-gold-700" delay={210} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,1fr)] lg:items-start">
        {/* ── Left: the team ── */}
        <SectionCard icon={<Users className="h-5 w-5" />} title={t("secStaffTeam")} desc={t("secStaffTeamDesc")}>
          {!loading && (
            <div className="mb-4 space-y-3">
              <QuickTabs
                value={teamTab}
                onChange={(k) => setTeamTab(k as typeof teamTab)}
                tabs={[
                  { key: "all", label: t("tabAll"), count: tabCounts.all },
                  { key: "active", label: t("tabActive"), count: tabCounts.active },
                  { key: "suspended", label: t("tabSuspended"), count: tabCounts.suspended, alert: true },
                  { key: "no-2fa", label: t("tabNoTwoStep"), count: tabCounts.no2fa, alert: true },
                ]}
              />
              <FilterBar
                search={{ value: teamSearch, onChange: setTeamSearch, placeholder: t("secSearchStaff") }}
                sort={{
                  value: teamSort, onChange: setTeamSort,
                  options: [
                    { value: "head", label: t("sortHeadFirst") },
                    { value: "name-az", label: t("sortNameAZ") },
                    { value: "name-za", label: t("sortNameZA") },
                    { value: "signin", label: t("sortLastSignIn") },
                  ],
                }}
                count={{ shown: teamMeta.total, total: tabCounts.all }}
                extraChips={teamTabChips}
                onClearExtras={() => setTeamTab("all")}
              />
            </div>
          )}
          {loading || team.switching || teamSwitching ? (
            <div className="space-y-3">{Array.from({ length: loading ? 3 : Math.max(1, team.shown.length) }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (
            <ul className="space-y-3">
              {team.shown.length === 0 && <li className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/45">{t("fltNoMatches")}</li>}
              {team.shown.map((s) => (
                <li key={s.id} className={`rounded-xl border p-4 ${s.suspended_at ? "border-red-500/25 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400 text-sm font-bold text-[#08130F]">{initials(s.name)}</div>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
                        {s.name}
                        {s.is_head_staff && <span className={`${chip} bg-gold-400/20 text-gold-300`}><Crown className="h-3 w-3" /> {t("secHeadStaff")}</span>}
                        {s.suspended_at && <span className={`${chip} bg-red-500/20 text-red-300`}>{t("secSuspendedBadge")}</span>}
                        {s.must_change_password && <span className={`${chip} bg-white/10 text-white/70`}>{t("secMustChangeBadge")}</span>}
                        {s.two_factor_enabled && <span className={`${chip} bg-[#4FBEB0]/15 text-[#7DD8CB]`}>{t("secTwoStepBadge")}</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-white/55">
                        {s.user_code}
                        {s.barangay_position ? ` · ${s.barangay_position === "captain" ? t("printBarangayCaptainLabel") : t("secSecretary")}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-white/45">
                        {t("secLastSignIn")}: {when(s.last_login_at)} · {t("secDevicesSignedIn").replace("{n}", String(s.active_sessions))}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.is_head_staff ? (
                        <button className={actBtn} onClick={() => signOutAll(s)}><LogOut className="h-3.5 w-3.5" /> {t("secSignOutOthers")}</button>
                      ) : (
                        <>
                          {!s.suspended_at && (
                            <button className={actBtn} onClick={() => setAction({ kind: "reset", staff: s })}><KeyRound className="h-3.5 w-3.5" /> {t("secResetPassword")}</button>
                          )}
                          <RowMenu label={t("secMoreActions")}>
                            {(close) => (
                              <>
                                <button role="menuitem" className={menuItem} onClick={() => { close(); signOutAll(s); }}><LogOut className="h-4 w-4" /> {t("secSignOutEverywhere")}</button>
                                {!s.suspended_at && (
                                  <button role="menuitem" className={menuItem} onClick={() => { close(); setAction({ kind: "transfer", staff: s }); }}><ArrowRightLeft className="h-4 w-4" /> {t("secMakeHead")}</button>
                                )}
                                {s.suspended_at ? (
                                  <button role="menuitem" className={menuItem} onClick={() => { close(); setAction({ kind: "unsuspend", staff: s }); }}><RotateCcw className="h-4 w-4" /> {t("secReactivate")}</button>
                                ) : (
                                  <button role="menuitem" className={menuItem} onClick={() => { close(); setAction({ kind: "suspend", staff: s }); }}><Ban className="h-4 w-4" /> {t("secSuspend")}</button>
                                )}
                                <div className="my-1 border-t border-white/10" />
                                <button role="menuitem" className={menuDanger} onClick={() => { close(); setAction({ kind: "demote", staff: s }); }}><UserMinus className="h-4 w-4" /> {t("secRemoveAccess")}</button>
                              </>
                            )}
                          </RowMenu>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <SimplePager className="mt-4" page={team.page} totalPages={team.totalPages} onChange={team.go} loading={team.switching || teamSwitching} />
          {!loading && !data?.transfer && <p className="mt-4 text-sm text-white/45">{t("secHandoverHow")}</p>}
        </SectionCard>

        {/* ── Right: add people, hand over, recovery ── */}
        <div className="space-y-6">
          <SectionCard icon={<UserPlus className="h-5 w-5" />} title={t("secAddStaffTitle")} desc={t("secAddStaffDesc")}>
            <SearchBar dark value={search} onChange={setSearch} placeholder={t("secSearchResidents")} />
            {search.trim().length >= 2 && (
              <ul className="mt-3 space-y-2">
                {candidates.length === 0 ? (
                  <li className="px-2 py-2 text-sm text-white/45">{t("secNoCandidates")}</li>
                ) : candidates.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-white">{c.name}</p>
                      <p className="text-sm text-white/45">{c.user_code}</p>
                    </div>
                    <button className={actBtn} onClick={() => setAction({ kind: "promote", candidate: c })}><UserPlus className="h-3.5 w-3.5" /> {t("secGiveStaffAccess")}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm leading-relaxed text-white/45">{t("secAddStaffNote")}</p>
          </SectionCard>

          <SectionCard icon={<FileKey2 className="h-5 w-5" />} title={t("secRecoveryCodesTitle")} desc={t("secRecoveryCodesDesc")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/70">
                {data && data.recovery_codes_remaining > 0
                  ? t("secCodesRemaining").replace("{n}", String(data.recovery_codes_remaining))
                  : t("secNoCodes")}
              </p>
              <button className={actBtn} onClick={() => setAction({ kind: "codes" })}><FileKey2 className="h-3.5 w-3.5" /> {t("secCreateCodes")}</button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/45">{t("secCodesAdvice")}</p>
          </SectionCard>
        </div>
      </div>

      {dialogProps && (
        <PasswordConfirmDialog
          open
          title={dialogProps.title}
          body={dialogProps.body}
          confirmLabel={dialogProps.label}
          tone={dialogProps.tone}
          onConfirm={run}
          onClose={() => setAction(null)}
        />
      )}

      {tempPw && (
        <Portal><div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#0A0E1A] p-7 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-white">{t("secTempPwTitle")}</h3>
            <p className="mt-2 text-sm text-white/55">{t("secTempPwBody").replace("{name}", tempPw.name)}</p>
            <p className="mt-5 select-all rounded-2xl border border-white/20 bg-white/10 px-4 py-4 font-mono text-2xl tracking-wider text-white">{tempPw.value}</p>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => copy(tempPw.value)} className={actBtn}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("secCopied") : t("secCopy")}</button>
              <button onClick={() => { setTempPw(null); load(); }} className="rounded-full bg-sage-700 px-6 py-2 text-sm font-semibold text-white transition hover:bg-sage-800">{t("secDone")}</button>
            </div>
            <p className="mt-4 text-xs text-white/40">{t("secShownOnce")}</p>
          </div>
        </div></Portal>
      )}

      {codes && (
        <Portal><div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[30px] border border-white/10 bg-[#0A0E1A] p-7 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-white">{t("secRecoveryCodesTitle")}</h3>
            <p className="mt-2 text-sm text-white/55">{t("secRecoveryShowNote")}</p>
            <ol className="mt-5 grid grid-cols-2 gap-2 text-left">
              {codes.map((c, i) => (
                <li key={c} className="select-all rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-base tracking-wider text-white"><span className="mr-2 text-xs text-white/40">{i + 1}.</span>{c}</li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={() => copy(codes.join("\n"))} className={actBtn}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("secCopied") : t("secCopy")}</button>
              <button onClick={printCodes} className={actBtn}><Printer className="h-3.5 w-3.5" /> {t("secPrint")}</button>
              <button onClick={() => { setCodes(null); load(); }} className="rounded-full bg-sage-700 px-6 py-2 text-sm font-semibold text-white transition hover:bg-sage-800">{t("secDone")}</button>
            </div>
            <p className="mt-4 text-xs text-white/40">{t("secShownOnce")}</p>
          </div>
        </div></Portal>
      )}
    </div>
    </div>
  );
}
