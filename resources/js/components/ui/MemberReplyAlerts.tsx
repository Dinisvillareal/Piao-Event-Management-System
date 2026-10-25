import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Heart, MessageSquareReply, X } from "lucide-react";
import api from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { chime, getSoundPref, installAudioUnlock, MEMBER_SOUND_KEY } from "../../lib/alertSound";

type ReplyAlert = {
  id: number;
  event_id: number | null;
  event_name: string | null;
  kind: "like" | "reply" | "event";
  target: "feedback" | "response";
  preview: string | null;
  title?: string;
  text?: string | null;
  stamp?: string;
};

const POLL_MS = 6000;
const TOAST_MS = 7000;
const TOAST_MAX = 2;

// Live alerts for a member whose rating or "couldn't attend" reason got a
// heart or a reply from staff: a toast with a soft chime (same bell as the
// staff portal, switchable in the profile menu), plus a count for the Events
// nav badge. Opening the Events page marks them as seen.
export default function MemberReplyAlerts({
  active,
  onOpenEvents,
  onOpenNotifications,
  onUnreadChange,
}: {
  active: string;
  onOpenEvents: (eventId?: number | null) => void;
  onOpenNotifications: () => void;
  onUnreadChange: (n: number) => void;
}) {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState<ReplyAlert[]>([]);
  const lastIdRef = useRef(0);
  const firstRef = useRef(true);
  const unreadRef = useRef(0);
  const sinceRef = useRef<string>("");
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => installAudioUnlock(), []);

  const poll = useCallback(async () => {
    try {
      const res = await api.get("/notifications/replies", { params: firstRef.current ? { init: 1 } : { after_id: lastIdRef.current, since: sinceRef.current || undefined } });
      const d = res.data as { unread_count: number; latest_id: number; new: ReplyAlert[]; server_time?: string };
      if (d.server_time) sinceRef.current = d.server_time;
      unreadRef.current = d.unread_count ?? 0;
      onUnreadChange(unreadRef.current);
      if (firstRef.current) {
        firstRef.current = false;
      } else {
        // A row counts once per version (new id, or the same id after an update).
        const fresh = (d.new ?? []).filter((n) => {
          const key = n.stamp ?? String(n.id);
          if (seenRef.current.has(key)) return false;
          seenRef.current.add(key);
          return true;
        });
        if (fresh.length > 0) {
          setToasts((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...fresh.filter((n) => !seen.has(n.id))].slice(-6);
          });
          if (getSoundPref(MEMBER_SOUND_KEY)) chime();
          // Their own Events page picks up a new heart/reply right away.
          if (fresh.some((n) => n.kind !== "event")) window.dispatchEvent(new Event("member:feedback-responded"));
          window.dispatchEvent(new Event("member-notifications-changed"));
        }
      }
      lastIdRef.current = Math.max(lastIdRef.current, d.latest_id ?? 0);
    } catch { /* offline -- the next tick tries again */ }
  }, [onUnreadChange]);

  useEffect(() => {
    poll();
    let timer: number | undefined;
    const start = () => { if (timer === undefined) timer = window.setInterval(poll, POLL_MS); };
    const stop = () => { if (timer !== undefined) { window.clearInterval(timer); timer = undefined; } };
    const onVis = () => { if (document.visibilityState === "visible") { poll(); start(); } else stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", poll);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", poll); };
  }, [poll]);

  // Being on the Events page = seeing them: clear the badge.
  useEffect(() => {
    if (active !== "events" || unreadRef.current === 0) return;
    unreadRef.current = 0;
    onUnreadChange(0);
    api.put("/notifications/replies-read")
      .then(() => window.dispatchEvent(new Event("member-notifications-changed")))
      .catch(() => {});
  }, [active, onUnreadChange]);

  // Toasts leave on their own after TOAST_MS.
  useEffect(() => {
    if (toasts.length === 0) return;
    const h = window.setTimeout(() => setToasts((prev) => prev.slice(1)), TOAST_MS);
    return () => window.clearTimeout(h);
  }, [toasts]);

  if (toasts.length === 0) return null;
  const label = (a: ReplyAlert) =>
    a.kind === "event"
      ? a.title || t("memToastNewNotification")
      : t(`memToast${a.kind === "like" ? "Like" : "Reply"}${a.target === "response" ? "Response" : "Feedback"}`);

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[10002] flex w-[min(92vw,340px)] flex-col-reverse gap-2">
      {toasts.slice(0, TOAST_MAX).map((a) => (
        <div key={a.id} className="pointer-events-auto relative overflow-hidden rounded-xl border border-white/10 bg-[#0A0E1A] shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => { setToasts((prev) => prev.filter((x) => x.id !== a.id)); if (a.kind === "event") onOpenNotifications(); else onOpenEvents(a.event_id); }}
            className="flex w-full items-start gap-3 px-3.5 py-3 pr-9 text-left transition hover:bg-white/[0.05]"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.kind === "like" ? "bg-red-500/15 text-red-400" : a.kind === "event" ? "bg-gold-400/15 text-gold-300" : "bg-[#4FBEB0]/15 text-[#7DD8CB]"}`}>
              {a.kind === "like" ? <Heart className="h-4 w-4 fill-red-400" /> : a.kind === "event" ? <Bell className="h-4 w-4" /> : <MessageSquareReply className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold leading-snug text-white">{label(a)}</span>
              {a.kind !== "event" && a.event_name && <span className="mt-0.5 block truncate text-xs text-white/55">{t("memToastOn")} {a.event_name}</span>}
              {a.kind === "event" && a.text && <span className="mt-0.5 line-clamp-2 block text-xs text-white/60">{a.text}</span>}
              {a.preview && <span className="mt-1 line-clamp-2 block text-[12.5px] italic text-white/70">&ldquo;{a.preview}&rdquo;</span>}
              <span className="mt-1 block text-[11px] font-semibold text-[#7DD8CB]">{t("memToastView")}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label={t("closeLabel")}
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== a.id))}
            className="absolute right-2 top-2 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
