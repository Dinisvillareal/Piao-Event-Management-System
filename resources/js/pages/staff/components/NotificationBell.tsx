import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Heart, MessageSquareText, Star, Volume2, VolumeX, X } from "lucide-react";
import api from "../../../lib/api";
import { absenceKeyFromLabel } from "../../../lib/absence";
import { playBell } from "../../../lib/alertSound";
import { useLanguage } from "../../../i18n/LanguageContext";
import { setStaffAlertsUnread, setSecurityUnread, STAFF_ALERTS_CHANGED } from "../../../lib/staffAlertsStore";

// Staff bell: shows the feedback members send, live. There is no websocket
// layer in this app, so it polls a tiny endpoint every few seconds while the
// tab is visible (and the moment the tab regains focus), keeps the unread
// badge and the browser-tab title in step, and pops a toast the instant
// something new arrives -- the same feel as a social-network bell.

export interface StaffAlert {
  id: number;
  event_id: number | null;
  event_name: string | null;
  title: string;
  rating: number | null;
  absence_reason?: string | null;
  reply_like?: boolean;
  kind?: "rating" | "absence";
  comment: string | null;
  read: boolean;
  created_at: string;
}

const POLL_MS = 6000;
const TOAST_MS = 6000;
const TOAST_MAX = 2;
const TOAST_LEAVE_MS = 240;
// The bell is an inbox of what still needs attention: only unread, newest few.
const BELL_VISIBLE = 3;
// While toasts are queued, the oldest on screen hands its slot over this often.
const TOAST_HANDOVER_MS = 2000;
const OPEN_EVENT = "staff:open-event";
export const FEEDBACK_RECEIVED_EVENT = "staff:feedback-received";

const SOUND_KEY = "piao.staff.alertSound";

const initialsOf = (title: string) => {
  const name = title.replace(/\s+(sent feedback|updated their feedback|sent a reason for not attending|liked your reply on their (?:feedback|response))$/i, "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

// Stars for a rating, or the reason chip for a "couldn't attend" alert.
export function RatingOrReason({ a, size }: { a: StaffAlert; size?: string }) {
  const { t } = useLanguage();
  if (a.reply_like) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">
        <Heart className="h-3 w-3 fill-red-400" /> {t("alertReplyLiked")}
      </span>
    );
  }
  if (a.absence_reason) {
    const key = absenceKeyFromLabel(a.absence_reason);
    return (
      <span className="rounded-full border border-gold-400/30 bg-gold-400/10 px-2.5 py-0.5 text-xs font-semibold text-gold-300">
        {key ? t(`absReason_${key}`) : a.absence_reason}
      </span>
    );
  }
  return <Stars value={a.rating} size={size} />;
}

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number | null; size?: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? "text-amber-400 fill-amber-400" : "text-white/20"}`} />
      ))}
    </span>
  );
}

// One toast. Owns its own auto-dismiss clock, which only starts once the toast
// is actually on screen (queued ones wait) and pauses while the pointer is over it.
function ToastItem({ alert: a, subject, verb, handover, onOpen, onRemove }: {
  alert: StaffAlert;
  subject: string;
  verb: string;
  handover: boolean;
  onOpen: (a: StaffAlert) => void;
  onRemove: (id: number) => void;
}) {
  const { t } = useLanguage();
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(TOAST_MS);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const hovered = useRef(false);

  const dismiss = useCallback(() => {
    if (leaveTimer.current !== undefined) return;
    window.clearTimeout(timer.current);
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => onRemove(a.id), TOAST_LEAVE_MS);
  }, [a.id, onRemove]);

  const run = useCallback(() => {
    startedAt.current = Date.now();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(dismiss, remaining.current);
  }, [dismiss]);

  const pause = () => {
    if (leaving) return;
    window.clearTimeout(timer.current);
    remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
  };

  // Told to make room for a queued toast -- leave unless the pointer is on it
  // (then it leaves the moment the pointer does).
  useEffect(() => {
    if (handover && !hovered.current) dismiss();
  }, [handover, dismiss]);

  useEffect(() => {
    run();
    return () => { window.clearTimeout(timer.current); window.clearTimeout(leaveTimer.current); };
  }, [run]);

  return (
    <div className={`toast-wrap${leaving ? " is-leaving" : ""}`} onMouseEnter={() => { hovered.current = true; pause(); }} onMouseLeave={() => { hovered.current = false; if (leaving) return; if (handover) dismiss(); else run(); }}>
      <div className="min-h-0 overflow-hidden">
        <div className="px-1 pb-2 pt-1">
          <div className="pointer-events-auto relative overflow-hidden rounded-xl border border-white/10 bg-[#0A0E1A] shadow-xl shadow-black/40">
            <button
              type="button"
              onClick={() => { onOpen(a); dismiss(); }}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 pr-8 text-left transition hover:bg-white/[0.05]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4FBEB0]/40 to-gold-400/30 text-[11px] font-bold text-white">
                {initialsOf(a.title)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">{a.reply_like ? t("alertNewReaction") : t("alertNewFeedback")}</span>
                <span className="mt-px block text-[12.5px] leading-snug text-white">
                  <span className="font-bold">{subject}</span> {verb}
                  {a.event_name && <> {t("alertOn")} <span className="font-semibold">{a.event_name}</span></>}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <RatingOrReason a={a} size="h-3 w-3" />
                </span>
                {a.comment && <span className="mt-0.5 block truncate text-[12px] italic text-white/55">&ldquo;{a.comment}&rdquo;</span>}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("closeLabel")}
              onClick={dismiss}
              className="absolute right-1.5 top-1.5 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span className="feedback-toast-bar absolute bottom-0 left-0 h-0.5 w-full bg-[#4FBEB0]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Every pending toast, oldest first. Only the first TOAST_MAX are on screen;
  // the rest wait their turn and fade in as slots free up.
  const [toasts, setToasts] = useState<StaffAlert[]>([]);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
  });
  const soundRef = useRef(soundOn);
  const audioRef = useRef<AudioContext | null>(null);
  const lastIdRef = useRef(0);
  const firstLoadRef = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");

  useEffect(() => {
    soundRef.current = soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch { /* private mode */ }
  }, [soundOn]);

  // Browsers only allow audio after a user gesture, so the first click or key
  // press anywhere on the page quietly unlocks it for the rest of the session.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        if (!audioRef.current) audioRef.current = new Ctor();
        if (audioRef.current.state === "suspended") audioRef.current.resume();
      } catch { /* audio unavailable -- stay silent */ }
    };
    window.addEventListener("pointerdown", unlock, { once: false, passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  const timeAgo = useCallback((iso: string) => {
    const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const abs = Math.abs(diff);
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
      if (abs < 45) return t("alertJustNow");
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
      return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
    } catch {
      return new Date(iso).toLocaleString();
    }
  }, [locale, t]);

  const poll = useCallback(async () => {
    try {
      const res = await api.get("/staff/alerts", { params: { after_id: firstLoadRef.current ? 0 : lastIdRef.current } });
      const data = res.data as { unread_count: number; security_unread?: number; latest_id: number; data: StaffAlert[]; new: StaffAlert[] };
      setAlerts(data.data ?? []);
      setUnread(data.unread_count ?? 0);
      setStaffAlertsUnread(data.unread_count ?? 0);
      setSecurityUnread(data.security_unread ?? 0);
      setLoaded(true);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      } else if (data.new?.some((n) => n.id > lastIdRef.current)) {
        // Newest last so the toast stack reads in arrival order.
        // Overlapping polls (interval + focus) can return the same rows twice;
        // only ids newer than the last one handled count, so it chimes once.
        const fresh = data.new.filter((n) => n.id > lastIdRef.current).reverse();
        lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((n) => n.id));
        setToasts((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...fresh.filter((a) => !seen.has(a.id))].slice(-12);
        });
        const ctx = audioRef.current;
        if (soundRef.current && ctx && ctx.state === "running") {
          try { playBell(ctx); } catch { /* ignore */ }
        }
        fresh.forEach((a) => {
          window.dispatchEvent(new CustomEvent(FEEDBACK_RECEIVED_EVENT, { detail: { eventId: a.event_id } }));
        });
      }
      lastIdRef.current = Math.max(lastIdRef.current, data.latest_id ?? 0);
    } catch {
      /* offline or server hiccup -- the next tick tries again */
    }
  }, []);

  // Live polling: runs only while the tab is visible, refreshes at once on focus.
  useEffect(() => {
    poll();
    let timer: number | undefined;
    const start = () => { if (timer === undefined) timer = window.setInterval(poll, POLL_MS); };
    const stop = () => { if (timer !== undefined) { window.clearInterval(timer); timer = undefined; } };
    const onVis = () => { if (document.visibilityState === "visible") { poll(); start(); } else stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", poll);
    window.addEventListener(STAFF_ALERTS_CHANGED, poll);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", poll);
      window.removeEventListener(STAFF_ALERTS_CHANGED, poll);
    };
  }, [poll]);

  // Unread count in the browser tab title, e.g. "(2) PiaoConnect".
  useEffect(() => {
    const base = baseTitleRef.current.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [unread]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const markRead = async (a: StaffAlert) => {
    if (a.read) return;
    setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, read: true } : x)));
    setUnread((n) => { const next = Math.max(0, n - 1); setStaffAlertsUnread(next); return next; });
    try { await api.put(`/staff/alerts/${a.id}/read`); } catch { poll(); }
  };

  const markAll = async () => {
    setAlerts((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    setStaffAlertsUnread(0);
    try { await api.put("/staff/alerts/read-all"); } catch { poll(); }
  };

  // Backlog handling: when more toasts are waiting than there are slots, the
  // oldest visible one yields every TOAST_HANDOVER_MS so the next takes over
  // -- a steady cadence instead of making the queue sit out a full timer.
  const [handoverId, setHandoverId] = useState<number | null>(null);
  const hasBacklog = toasts.length > TOAST_MAX;
  const oldestId = toasts[0]?.id;
  useEffect(() => {
    setHandoverId(null);
    if (!hasBacklog || oldestId === undefined) return;
    const h = window.setTimeout(() => setHandoverId(oldestId), TOAST_HANDOVER_MS);
    return () => window.clearTimeout(h);
  }, [hasBacklog, oldestId]);

  const removeToast = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const openAlert = (a: StaffAlert) => {
    markRead(a);
    setOpen(false);
    if (a.event_id) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { eventId: a.event_id, tab: "feedback", sub: a.absence_reason ? "reasons" : "ratings" } }));
  };

  const shown = useMemo(() => alerts.filter((a) => !a.read).slice(0, BELL_VISIBLE), [alerts]);
  const badge = unread > 99 ? "99+" : String(unread);
  const subject = (a: StaffAlert) => a.title.replace(/\s+(sent feedback|updated their feedback|sent a reason for not attending|liked your reply on their (?:feedback|response))$/i, "");
  const verb = (a: StaffAlert) => (/liked your reply on their/i.test(a.title) ? t("alertLikedReplyVerb") : /not attending$/i.test(a.title) ? t("alertAbsentVerb") : /updated their feedback$/i.test(a.title) ? t("alertUpdatedVerb") : t("alertSentVerb"));

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("alertsTitle")}
        aria-expanded={open}
        className={`relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border bg-[#0A0E1A] text-white shadow-sm transition active:scale-95 focus:outline-none focus:ring-1 focus:ring-[#4FBEB0]/60 ${
          open ? "border-[#4FBEB0] ring-1 ring-[#4FBEB0]/60" : "border-white/40 hover:bg-white/10 hover:border-white/60"
        }`}
      >
        <Bell strokeWidth={2.25} className={`h-[18px] w-[18px] ${unread > 0 && !open ? "bell-ring" : ""}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0A0E1A]">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[60] w-[min(92vw,400px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0E1A] shadow-2xl">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <h3 className="font-display text-lg font-bold text-white">{t("alertsTitle")}</h3>
            <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundOn((v) => !v)}
              aria-label={soundOn ? t("alertsSoundOff") : t("alertsSoundOn")}
              title={soundOn ? t("alertsSoundOff") : t("alertsSoundOn")}
              className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#7DD8CB] transition hover:bg-[#4FBEB0]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("alertsMarkAll")}
            </button>
            </div>
          </div>
          <div className="border-t border-white/10">
            {!loaded ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((k) => <div key={k} className="h-16 animate-pulse rounded-xl bg-white/[0.05]" />)}
              </div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-white/40">
                  <MessageSquareText className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-white">{t("alertsNoUnread")}</p>
                <p className="text-xs text-white/45">{t("alertsEmptyHint")}</p>
              </div>
            ) : (
              <ul>
                {shown.map((a) => (
                  <li key={a.id} className="bell-item">
                    <button
                      type="button"
                      onClick={() => openAlert(a)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.06] ${a.read ? "" : "bg-[#4FBEB0]/[0.06]"}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4FBEB0]/40 to-gold-400/30 text-sm font-bold text-white">
                        {initialsOf(a.title)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] leading-snug ${a.read ? "text-white/70" : "text-white"}`}>
                          <span className="font-bold">{subject(a)}</span> {verb(a)}
                          {a.event_name && <> {t("alertOn")} <span className="font-semibold">{a.event_name}</span></>}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <RatingOrReason a={a} />
                        </span>
                        {a.comment && <span className="mt-1 line-clamp-2 block text-[13px] italic text-white/55">&ldquo;{a.comment}&rdquo;</span>}
                        <span className={`mt-1 block text-xs ${a.read ? "text-white/40" : "font-semibold text-[#7DD8CB]"}`}>{timeAgo(a.created_at)}</span>
                      </span>
                      {!a.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#4FBEB0]" aria-label={t("alertsTabUnread")} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("staff:open-notifications", { detail: { tab: "feedback" } })); }}
            className="w-full border-t border-white/10 px-4 py-3 text-center text-sm font-semibold text-[#7DD8CB] transition hover:bg-[#4FBEB0]/10"
          >
            {t("alertsSeeAll")}
            {unread > BELL_VISIBLE && (
              <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white/10 px-1.5 text-[11px] font-bold text-white/70">
                +{unread - BELL_VISIBLE}
              </span>
            )}
          </button>
        </div>
      )}

      {toasts.length > 0 && createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[10002] flex w-[min(92vw,320px)] flex-col-reverse">
          {toasts.slice(0, TOAST_MAX).map((a) => (
            <ToastItem
              key={a.id}
              alert={a}
              subject={subject(a)}
              verb={verb(a)}
              handover={handoverId === a.id}
              onOpen={openAlert}
              onRemove={removeToast}
            />
          ))}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes bellRing {
          0%,22%,100%{transform:rotate(0)}
          3%{transform:rotate(16deg)} 6%{transform:rotate(-14deg)} 9%{transform:rotate(11deg)}
          12%{transform:rotate(-8deg)} 15%{transform:rotate(5deg)} 18%{transform:rotate(-2deg)}
        }
        .bell-ring { transform-origin: 50% 0; animation: bellRing 4s ease-in-out infinite; }
        .bell-item { animation: toastIn 260ms cubic-bezier(.22,.8,.3,1); }
        @keyframes toastIn { from{opacity:0;transform:translateY(10px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes toastBar { from{transform:scaleX(1)} to{transform:scaleX(0)} }
        .toast-wrap { display:grid; grid-template-rows:1fr; opacity:1; animation: toastIn 300ms cubic-bezier(.22,.8,.3,1); transition: grid-template-rows ${TOAST_LEAVE_MS}ms ease, opacity ${TOAST_LEAVE_MS - 40}ms ease; }
        .toast-wrap.is-leaving { grid-template-rows:0fr; opacity:0; }
        .feedback-toast-bar { transform-origin:left; animation: toastBar ${TOAST_MS}ms linear forwards; }
        .toast-wrap:hover .feedback-toast-bar { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .bell-ring, .toast-wrap, .bell-item { animation: none; transition: none; } }
      `}</style>
    </div>
  );
}
