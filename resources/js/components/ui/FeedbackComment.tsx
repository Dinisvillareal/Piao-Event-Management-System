import { useState } from "react";
import { BadgeCheck, Heart, Send } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import EditHistory from "./EditHistory";

export type ResponseFields = {
  id: number;
  created_at?: string | null;
  updated_at?: string | null;
  edits_count?: number;
  staff_liked_at?: string | null;
  staff_reply?: string | null;
  staff_replied_at?: string | null;
  member_liked_reply_at?: string | null;
  replied_by?: { first_name: string; last_name: string } | null;
  repliedBy?: { first_name: string; last_name: string } | null;
};

type Person = { first_name?: string | null; last_name?: string | null };

const initialsOf = (p?: Person | null) => `${p?.first_name?.charAt(0) ?? ""}${p?.last_name?.charAt(0) ?? ""}`.toUpperCase() || "?";

// Short, comment-style age: "now", "5m", "3h", "2d", then a date.
function timeAgo(iso: string | null | undefined, locale: string, nowLabel: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return nowLabel;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
const fullTime = (iso: string | null | undefined, locale: string) =>
  iso ? new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : undefined;

function Avatar({ initials, logo, size = 40 }: { initials?: string; logo?: boolean; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#123A38] text-[#7DD8CB] font-bold"
    >
      {logo ? <img src="/logo-removebg-preview.png" alt="" className="h-full w-full object-contain p-1" /> : <span style={{ fontSize: size * 0.34 }}>{initials}</span>}
    </div>
  );
}

// Facebook-style reaction badge that sits on the corner of a bubble.
function HeartBadge({ title }: { title: string }) {
  return (
    <span title={title} aria-label={title} className="absolute -bottom-2.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[#0A0E1A] bg-red-500 shadow">
      <Heart className="h-3 w-3 fill-white text-white" />
    </span>
  );
}

const linkBtn = "font-semibold transition hover:underline disabled:opacity-50";

function Composer({
  value,
  onChange,
  onSend,
  onCancel,
  busy,
  sendDisabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
  sendDisabled: boolean;
  placeholder: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex gap-2.5">
      <Avatar logo size={28} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 pb-2 pt-2.5 focus-within:border-[#4FBEB0]/70 focus-within:ring-2 focus-within:ring-[#4FBEB0]/30">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && !e.shiftKey && !sendDisabled) { e.preventDefault(); onSend(); }
            }}
            maxLength={500}
            rows={2}
            autoFocus
            placeholder={placeholder}
            className="w-full resize-none bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/35">{value.length}/500</span>
            <button
              type="button"
              onClick={onSend}
              disabled={sendDisabled || busy}
              aria-label={t("respSendReply")}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#7DD8CB] transition hover:bg-white/10 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button type="button" onClick={onCancel} disabled={busy} className={`mt-1 px-1 text-xs text-white/50 ${linkBtn}`}>
          {t("cancelLabel")}
        </button>
      </div>
    </div>
  );
}

/**
 * One member rating / reason and the conversation under it, laid out like a
 * comment thread: the member's bubble, a heart badge when staff liked it, a
 * nested staff reply with the barangay avatar, and a heart the member can
 * give back. `role` decides which actions are shown.
 */
export default function FeedbackComment({
  role,
  kind,
  item,
  author,
  header,
  comment,
  actions,
  footer,
  onChange,
}: {
  role: "staff" | "member";
  kind: "rating" | "absence";
  item: ResponseFields;
  author: Person | null;
  header: React.ReactNode;
  comment?: string | null;
  /** Member view: Edit / locked controls, shown in the action row. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onChange: (patch: Partial<ResponseFields>) => void;
}) {
  const { t, locale } = useLanguage();
  const isStaff = role === "staff";
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const staffLiked = !!item.staff_liked_at;
  const memberLikedReply = !!item.member_liked_reply_at;
  const by = item.replied_by ?? item.repliedBy;
  const authorName = author ? `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim() : t("unknownItemLabel");
  const shownName = isStaff ? authorName : t("cmtYou");
  const nowLabel = t("cmtNow");

  const toggleStaffLike = async () => {
    if (busy) return;
    onChange({ staff_liked_at: staffLiked ? null : new Date().toISOString() }); // optimistic
    try {
      const res = await api.put(`/feedback/${kind}/${item.id}/like`);
      onChange({ staff_liked_at: res.data?.staff_liked_at ?? null });
    } catch {
      onChange({ staff_liked_at: item.staff_liked_at ?? null });
      setError(t("respFailed"));
    }
  };

  const toggleReplyLike = async () => {
    onChange({ member_liked_reply_at: memberLikedReply ? null : new Date().toISOString() });
    try {
      const res = await api.put(`/feedback/${kind}/${item.id}/reply-like`);
      onChange({ member_liked_reply_at: res.data?.member_liked_reply_at ?? null });
    } catch {
      onChange({ member_liked_reply_at: item.member_liked_reply_at ?? null });
      setError(t("respFailed"));
    }
  };

  const saveReply = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.put(`/feedback/${kind}/${item.id}/reply`, { reply: value });
      onChange({
        staff_reply: res.data?.staff_reply ?? null,
        staff_replied_at: res.data?.staff_replied_at ?? null,
        replied_by: res.data?.replied_by ?? null,
        ...(value.trim() ? {} : { member_liked_reply_at: null }),
      });
      setComposing(false);
      setText("");
    } catch (err) {
      setError(apiErrorMessage(err, t("respFailed")));
    } finally {
      setBusy(false);
    }
  };

  const startReply = () => { setText(item.staff_reply ?? ""); setError(""); setComposing(true); };
  const when = item.updated_at ?? item.created_at;

  return (
    <div className="flex items-start gap-2.5">
      <Avatar initials={initialsOf(author)} />
      <div className="min-w-0 flex-1">
        {/* The member's comment */}
        <div className="relative inline-block max-w-full">
          <div className="rounded-2xl bg-white/[0.07] px-3.5 py-2">
            <p className="text-[13px] font-semibold text-white">{shownName}</p>
            <div className="mt-1">{header}</div>
            {comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/80">{comment}</p>}
          </div>
          {staffLiked && <HeartBadge title={t("respStaffLiked")} />}
        </div>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-white/50 ${staffLiked ? "mt-3" : "mt-1"}`}>
          {isStaff && (
            <button type="button" onClick={toggleStaffLike} aria-pressed={staffLiked} className={`${linkBtn} ${staffLiked ? "text-red-400" : "text-white/55 hover:text-white"}`}>
              {staffLiked ? t("respLiked") : t("respHeart")}
            </button>
          )}
          {isStaff && !item.staff_reply && !composing && (
            <button type="button" onClick={startReply} className={`${linkBtn} text-white/55 hover:text-white`}>{t("respReply")}</button>
          )}
          {!isStaff && actions}
          {when && <span title={fullTime(when, locale)}>{timeAgo(when, locale, nowLabel)}</span>}
          <EditHistory kind={kind} id={item.id} edits={item.edits_count} />
        </div>
        {footer}

        {/* Staff reply, nested like a comment reply */}
        {(item.staff_reply || composing) && (
          <div className="mt-3 border-l border-white/10 pl-3">
            {composing ? (
              <Composer
                value={text}
                onChange={setText}
                onSend={() => saveReply(text)}
                onCancel={() => { setComposing(false); setError(""); }}
                busy={busy}
                sendDisabled={!text.trim() || text.trim() === (item.staff_reply ?? "").trim()}
                placeholder={t("respReplyPlaceholder")}
              />
            ) : (
              <div className="flex items-start gap-2.5">
                <Avatar logo size={28} />
                <div className="min-w-0 flex-1">
                  <div className="relative inline-block max-w-full">
                    <div className="rounded-2xl bg-[#4FBEB0]/[0.12] px-3.5 py-2">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-white">
                        {isStaff && by ? `${by.first_name} ${by.last_name}` : t("cmtBarangayStaff")}
                        {isStaff ? (
                          <span className="rounded-full bg-[#4FBEB0]/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">{t("cmtStaff")}</span>
                        ) : (
                          <BadgeCheck className="h-3.5 w-3.5 text-[#7DD8CB]" aria-label={t("cmtStaff")} />
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/85">{item.staff_reply}</p>
                    </div>
                    {memberLikedReply && <HeartBadge title={t("cmtLikedByMember")} />}
                  </div>
                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-white/50 ${memberLikedReply ? "mt-3" : "mt-1"}`}>
                    {!isStaff && (
                      <button type="button" onClick={toggleReplyLike} aria-pressed={memberLikedReply} className={`${linkBtn} ${memberLikedReply ? "text-red-400" : "text-white/55 hover:text-white"}`}>
                        {memberLikedReply ? t("respLiked") : t("respHeart")}
                      </button>
                    )}
                    {isStaff && (
                      <>
                        <button type="button" onClick={startReply} className={`${linkBtn} text-white/55 hover:text-white`}>{t("editLabel")}</button>
                        <button type="button" onClick={() => saveReply("")} disabled={busy} className={`${linkBtn} text-white/55 hover:text-red-400`}>{t("cmtDelete")}</button>
                      </>
                    )}
                    {item.staff_replied_at && <span title={fullTime(item.staff_replied_at, locale)}>{timeAgo(item.staff_replied_at, locale, nowLabel)}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
