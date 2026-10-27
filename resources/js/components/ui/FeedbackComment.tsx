// import { useState } from "react";
// import { BadgeCheck, Heart, Send } from "lucide-react";
// import api, { apiErrorMessage } from "../../lib/api";
// import { useLanguage } from "../../i18n/LanguageContext";
// import EditHistory from "./EditHistory";

// export type ResponseFields = {
//   id: number;
//   created_at?: string | null;
//   updated_at?: string | null;
//   edits_count?: number;
//   staff_liked_at?: string | null;
//   staff_reply?: string | null;
//   staff_replied_at?: string | null;
//   member_liked_reply_at?: string | null;
//   replied_by?: { first_name: string; last_name: string } | null;
//   repliedBy?: { first_name: string; last_name: string } | null;
// };

// type Person = { first_name?: string | null; last_name?: string | null };

// const initialsOf = (p?: Person | null) => `${p?.first_name?.charAt(0) ?? ""}${p?.last_name?.charAt(0) ?? ""}`.toUpperCase() || "?";

// // Short, comment-style age: "now", "5m", "3h", "2d", then a date.
// function timeAgo(iso: string | null | undefined, locale: string, nowLabel: string): string {
//   if (!iso) return "";
//   const d = new Date(iso);
//   if (isNaN(d.getTime())) return "";
//   const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
//   if (s < 60) return nowLabel;
//   if (s < 3600) return `${Math.floor(s / 60)}m`;
//   if (s < 86400) return `${Math.floor(s / 3600)}h`;
//   if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
//   return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
// }
// const fullTime = (iso: string | null | undefined, locale: string) =>
//   iso ? new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : undefined;

// function Avatar({ initials, logo, size = 40 }: { initials?: string; logo?: boolean; size?: number }) {
//   return (
//     <div
//       style={{ width: size, height: size }}
//       className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#123A38] text-[#7DD8CB] font-bold"
//     >
//       {logo ? <img src="/logo-removebg-preview.png" alt="" className="h-full w-full object-contain p-1" /> : <span style={{ fontSize: size * 0.34 }}>{initials}</span>}
//     </div>
//   );
// }

// // Facebook-style reaction badge that sits on the corner of a bubble.
// function HeartBadge({ title }: { title: string }) {
//   return (
//     <span title={title} aria-label={title} className="absolute -bottom-2.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[#0A0E1A] bg-red-500 shadow">
//       <Heart className="h-3 w-3 fill-white text-white" />
//     </span>
//   );
// }

// const linkBtn = "font-semibold transition hover:underline disabled:opacity-50";

// function Composer({
//   value,
//   onChange,
//   onSend,
//   onCancel,
//   busy,
//   sendDisabled,
//   placeholder,
// }: {
//   value: string;
//   onChange: (v: string) => void;
//   onSend: () => void;
//   onCancel: () => void;
//   busy: boolean;
//   sendDisabled: boolean;
//   placeholder: string;
// }) {
//   const { t } = useLanguage();
//   return (
//     <div className="flex gap-2.5">
//       <Avatar logo size={28} />
//       <div className="min-w-0 flex-1">
//         <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 pb-2 pt-2.5 focus-within:border-[#4FBEB0]/70 focus-within:ring-2 focus-within:ring-[#4FBEB0]/30">
//           <textarea
//             value={value}
//             onChange={(e) => onChange(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === "Escape") onCancel();
//               if (e.key === "Enter" && !e.shiftKey && !sendDisabled) { e.preventDefault(); onSend(); }
//             }}
//             maxLength={500}
//             rows={2}
//             autoFocus
//             placeholder={placeholder}
//             className="w-full resize-none bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
//           />
//           <div className="flex items-center justify-between">
//             <span className="text-[11px] text-white/35">{value.length}/500</span>
//             <button
//               type="button"
//               onClick={onSend}
//               disabled={sendDisabled || busy}
//               aria-label={t("respSendReply")}
//               className="flex h-7 w-7 items-center justify-center rounded-full text-[#7DD8CB] transition hover:bg-white/10 disabled:opacity-40"
//             >
//               <Send className="h-4 w-4" />
//             </button>
//           </div>
//         </div>
//         <button type="button" onClick={onCancel} disabled={busy} className={`mt-1 px-1 text-xs text-white/50 ${linkBtn}`}>
//           {t("cancelLabel")}
//         </button>
//       </div>
//     </div>
//   );
// }

// /**
//  * One member rating / reason and the conversation under it, laid out like a
//  * comment thread: the member's bubble, a heart badge when staff liked it, a
//  * nested staff reply with the barangay avatar, and a heart the member can
//  * give back. `role` decides which actions are shown.
//  */
// export default function FeedbackComment({
//   role,
//   kind,
//   item,
//   author,
//   header,
//   comment,
//   actions,
//   footer,
//   onChange,
// }: {
//   role: "staff" | "member";
//   kind: "rating" | "absence";
//   item: ResponseFields;
//   author: Person | null;
//   header: React.ReactNode;
//   comment?: string | null;
//   /** Member view: Edit / locked controls, shown in the action row. */
//   actions?: React.ReactNode;
//   footer?: React.ReactNode;
//   onChange: (patch: Partial<ResponseFields>) => void;
// }) {
//   const { t, locale } = useLanguage();
//   const isStaff = role === "staff";
//   const [composing, setComposing] = useState(false);
//   const [text, setText] = useState("");
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState("");

//   const staffLiked = !!item.staff_liked_at;
//   const memberLikedReply = !!item.member_liked_reply_at;
//   const by = item.replied_by ?? item.repliedBy;
//   const authorName = author ? `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim() : t("unknownItemLabel");
//   const shownName = isStaff ? authorName : t("cmtYou");
//   const nowLabel = t("cmtNow");

//   const toggleStaffLike = async () => {
//     if (busy) return;
//     onChange({ staff_liked_at: staffLiked ? null : new Date().toISOString() }); // optimistic
//     try {
//       const res = await api.put(`/feedback/${kind}/${item.id}/like`);
//       onChange({ staff_liked_at: res.data?.staff_liked_at ?? null });
//     } catch {
//       onChange({ staff_liked_at: item.staff_liked_at ?? null });
//       setError(t("respFailed"));
//     }
//   };

//   const toggleReplyLike = async () => {
//     onChange({ member_liked_reply_at: memberLikedReply ? null : new Date().toISOString() });
//     try {
//       const res = await api.put(`/feedback/${kind}/${item.id}/reply-like`);
//       onChange({ member_liked_reply_at: res.data?.member_liked_reply_at ?? null });
//     } catch {
//       onChange({ member_liked_reply_at: item.member_liked_reply_at ?? null });
//       setError(t("respFailed"));
//     }
//   };

//   const saveReply = async (value: string) => {
//     setBusy(true);
//     setError("");
//     try {
//       const res = await api.put(`/feedback/${kind}/${item.id}/reply`, { reply: value });
//       onChange({
//         staff_reply: res.data?.staff_reply ?? null,
//         staff_replied_at: res.data?.staff_replied_at ?? null,
//         replied_by: res.data?.replied_by ?? null,
//         ...(value.trim() ? {} : { member_liked_reply_at: null }),
//       });
//       setComposing(false);
//       setText("");
//     } catch (err) {
//       setError(apiErrorMessage(err, t("respFailed")));
//     } finally {
//       setBusy(false);
//     }
//   };

//   const startReply = () => { setText(item.staff_reply ?? ""); setError(""); setComposing(true); };
//   const when = item.updated_at ?? item.created_at;

//   return (
//     <div className="flex items-start gap-2.5">
//       <Avatar initials={initialsOf(author)} />
//       <div className="min-w-0 flex-1">
//         {/* The member's comment */}
//         <div className="relative inline-block max-w-full">
//           <div className="rounded-2xl bg-white/[0.07] px-3.5 py-2">
//             <p className="text-[13px] font-semibold text-white">{shownName}</p>
//             <div className="mt-1">{header}</div>
//             {comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/80">{comment}</p>}
//           </div>
//           {staffLiked && <HeartBadge title={t("respStaffLiked")} />}
//         </div>
//         <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-white/50 ${staffLiked ? "mt-3" : "mt-1"}`}>
//           {isStaff && (
//             <button type="button" onClick={toggleStaffLike} aria-pressed={staffLiked} className={`${linkBtn} ${staffLiked ? "text-red-400" : "text-white/55 hover:text-white"}`}>
//               {staffLiked ? t("respLiked") : t("respHeart")}
//             </button>
//           )}
//           {isStaff && !item.staff_reply && !composing && (
//             <button type="button" onClick={startReply} className={`${linkBtn} text-white/55 hover:text-white`}>{t("respReply")}</button>
//           )}
//           {!isStaff && actions}
//           {when && <span title={fullTime(when, locale)}>{timeAgo(when, locale, nowLabel)}</span>}
//           <EditHistory kind={kind} id={item.id} edits={item.edits_count} />
//         </div>
//         {footer}

//         {/* Staff reply, nested like a comment reply */}
//         {(item.staff_reply || composing) && (
//           <div className="mt-3 border-l border-white/10 pl-3">
//             {composing ? (
//               <Composer
//                 value={text}
//                 onChange={setText}
//                 onSend={() => saveReply(text)}
//                 onCancel={() => { setComposing(false); setError(""); }}
//                 busy={busy}
//                 sendDisabled={!text.trim() || text.trim() === (item.staff_reply ?? "").trim()}
//                 placeholder={t("respReplyPlaceholder")}
//               />
//             ) : (
//               <div className="flex items-start gap-2.5">
//                 <Avatar logo size={28} />
//                 <div className="min-w-0 flex-1">
//                   <div className="relative inline-block max-w-full">
//                     <div className="rounded-2xl bg-[#4FBEB0]/[0.12] px-3.5 py-2">
//                       <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-white">
//                         {isStaff && by ? `${by.first_name} ${by.last_name}` : t("cmtBarangayStaff")}
//                         {isStaff ? (
//                           <span className="rounded-full bg-[#4FBEB0]/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#7DD8CB]">{t("cmtStaff")}</span>
//                         ) : (
//                           <BadgeCheck className="h-3.5 w-3.5 text-[#7DD8CB]" aria-label={t("cmtStaff")} />
//                         )}
//                       </p>
//                       <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/85">{item.staff_reply}</p>
//                     </div>
//                     {memberLikedReply && <HeartBadge title={t("cmtLikedByMember")} />}
//                   </div>
//                   <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-white/50 ${memberLikedReply ? "mt-3" : "mt-1"}`}>
//                     {!isStaff && (
//                       <button type="button" onClick={toggleReplyLike} aria-pressed={memberLikedReply} className={`${linkBtn} ${memberLikedReply ? "text-red-400" : "text-white/55 hover:text-white"}`}>
//                         {memberLikedReply ? t("respLiked") : t("respHeart")}
//                       </button>
//                     )}
//                     {isStaff && (
//                       <>
//                         <button type="button" onClick={startReply} className={`${linkBtn} text-white/55 hover:text-white`}>{t("editLabel")}</button>
//                         <button type="button" onClick={() => saveReply("")} disabled={busy} className={`${linkBtn} text-white/55 hover:text-red-400`}>{t("cmtDelete")}</button>
//                       </>
//                     )}
//                     {item.staff_replied_at && <span title={fullTime(item.staff_replied_at, locale)}>{timeAgo(item.staff_replied_at, locale, nowLabel)}</span>}
//                   </div>
//                 </div>
//               </div>
//             )}
//           </div>
//         )}
//         {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
//       </div>
//     </div>
//   );
// }

//LATEST WORKING IMPLEMENTATION KARUN
import { useEffect, useState } from "react";
import { BadgeCheck, Heart, Send, Lock, Trash2, Pencil, Star } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import EditHistory from "./EditHistory";

export type ResponseFields = {
  id: number;
  created_at?: string | null;
  updated_at?: string | null;
  edits_count?: number;
  edit_seconds_left?: number;
  is_locked?: boolean;
  staff_liked_at?: string | null;
  staff_reply?: string | null;
  staff_replied_at?: string | null;
  member_liked_reply_at?: string | null;
  replied_by?: { first_name: string; last_name: string } | null;
  repliedBy?: { first_name: string; last_name: string } | null;
};

type Person = { first_name?: string | null; last_name?: string | null };

const initialsOf = (p?: Person | null) =>
  `${(p?.first_name ?? "").charAt(0)}${(p?.last_name ?? "").charAt(0)}`.toUpperCase() || "?";

function timeAgo(iso: string | null | undefined, locale: string, nowLabel: string): string {
  if (!iso) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return nowLabel;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(locale);
}

function Avatar({ initials, size = 36, ring }: { initials: string; size?: number; ring?: boolean }) {
  return (
    <div
      className={`flex-shrink-0 overflow-hidden rounded-full bg-[#7DD8CB] text-[#0A0E1A] flex items-center justify-center font-bold ${ring ? "ring-2 ring-white/40" : ""}`}
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.34 }}>{initials}</span>
    </div>
  );
}

export default function FeedbackComment({
  entry,
  role,
  member,
  onChange,
  onEditStart,
  onRemove,
  locked,
}: {
  entry: ResponseFields & { rating?: number | null; comment?: string | null; reason?: string | null };
  role: "member" | "staff";
  member?: Person | null;
  onChange: (patch: Partial<ResponseFields>) => void;
  onEditStart?: () => void;
  onRemove?: () => void;
  locked?: boolean;
}) {
  const { t, locale } = useLanguage();

  // Staff reply composer state
  const [replyDraft, setReplyDraft] = useState(entry?.staff_reply ?? "");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyEditing, setReplyEditing] = useState(false);

  const staffLiked = !!entry?.staff_liked_at;
  const replyLiked = !!entry?.member_liked_reply_at;

  // Parent can force-lock from its own local clock
  const isLocked = locked ?? entry?.is_locked ?? ((entry?.edit_seconds_left ?? 0) <= 0 ? true : false);

  useEffect(() => {
    setReplyDraft(entry?.staff_reply ?? "");
  }, [entry?.staff_reply]);

  // Safety guard AFTER hooks
  if (!entry) return null;

  // ---- Staff heart toggle ----
  const toggleStaffLike = async () => {
    if (role !== "staff") return;
    try {
      await api.put(`/feedback/${entry.reason ? "absence" : "rating"}/${entry.id}/like`);
      onChange({ staff_liked_at: staffLiked ? null : new Date().toISOString() });
    } catch (err) {
      console.error(apiErrorMessage(err));
    }
  };

  // ---- Member like on staff reply ----
  const toggleReplyLike = async () => {
    if (role !== "member" || !entry.staff_reply) return;
    try {
      await api.put(`/feedback/${entry.reason ? "absence" : "rating"}/${entry.id}/reply-like`);
      onChange({ member_liked_reply_at: replyLiked ? null : new Date().toISOString() });
    } catch (err) {
      console.error(apiErrorMessage(err));
    }
  };

  // ---- Staff reply save / edit ----
  const saveReply = async (value: string) => {
    if (role !== "staff") return;
    setReplyBusy(true);
    try {
      const { data } = await api.put(
        `/feedback/${entry.reason ? "absence" : "rating"}/${entry.id}/reply`,
        { reply: value }
      );
      onChange({
        staff_reply: data.staff_reply,
        staff_replied_at: data.staff_replied_at,
        replied_by: data.replied_by,
        repliedBy: data.replied_by,
      });
      setReplyEditing(false);
    } catch (err) {
      console.error(apiErrorMessage(err));
    } finally {
      setReplyBusy(false);
    }
  };

  const startReply = () => {
    setReplyDraft(entry.staff_reply ?? "");
    setReplyEditing(true);
  };

  return (
    <div className="space-y-2">
      {/* ============================================================
       *  MEMBER'S ORIGINAL COMMENT / RATING / REASON
       * ============================================================ */}
      <div className="flex gap-3">
        <Avatar initials={initialsOf(member)} size={36} />
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {member?.first_name ?? ""} {member?.last_name ?? ""}
              </span>
              <span className="text-[11px] text-white/40">
                {timeAgo(entry.created_at, locale, t("justNowLabel") || "now")}
              </span>

              {(entry.edits_count ?? 0) > 0 && (
                <EditHistory
                  kind={entry.reason ? "absence" : "rating"}
                  id={entry.id}
                  edits={entry.edits_count ?? 0}
                />
              )}

              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                  <Lock className="h-3 w-3" />
                  {t("fbLocked") || "Locked"}
                </span>
              )}
            </div>

            {/* Show the star rating if this is a rating (not an absence reason) */}
            {typeof entry.rating === "number" && (
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={16}
                    className={
                      entry.rating! >= n
                        ? "text-gold-400 fill-gold-400"
                        : "text-white/20"
                    }
                  />
                ))}
                <span className="ml-1 text-xs font-semibold text-white/60">
                  {entry.rating}/5
                </span>
              </div>
            )}

            {/* Show the comment or reason text */}
            {(entry.comment || entry.reason) && (
              <div className="mt-1.5 text-sm text-white/80 break-words">
                {entry.comment || entry.reason}
              </div>
            )}
          </div>

          {role === "member" && (
            <div className="mt-1.5 flex items-center gap-4 px-2 text-xs text-white/50">
              {!isLocked ? (
                <>
                  <button
                    type="button"
                    onClick={onEditStart}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("editLabel") || "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={onRemove}
                    className="inline-flex items-center gap-1 text-red-300 hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("removeFeedback") || "Remove"}
                  </button>
                </>
              ) : (
                <span className="italic">
                  {t("editWindowExpired") || "Edit window closed"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
       *  STAFF REPLY (nested like a comment thread)
       * ============================================================ */}
      {entry.staff_reply && (
        <div className="ml-12 flex gap-2">
          <Avatar initials="BC" size={28} ring />
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5 text-[#4FBEB0]" />
                <span className="text-xs font-semibold text-[#4FBEB0]">
                  {entry.replied_by
                    ? `${entry.replied_by.first_name} ${entry.replied_by.last_name}`
                    : entry.repliedBy
                    ? `${entry.repliedBy.first_name} ${entry.repliedBy.last_name}`
                    : t("staffReplyLabel") || "Barangay Staff"}
                </span>
                <span className="text-[11px] text-white/40">
                  {timeAgo(entry.staff_replied_at, locale, t("justNowLabel") || "now")}
                </span>
              </div>
              <div className="mt-1 text-sm text-white/80 break-words">
                {entry.staff_reply}
              </div>
            </div>

            {/* Member can heart the staff reply */}
            {role === "member" && (
              <div className="mt-1 flex gap-3 px-2 text-xs text-white/50">
                <button
                  type="button"
                  onClick={toggleReplyLike}
                  className={replyLiked ? "text-red-400" : "hover:text-white"}
                >
                  <Heart
                    className="h-3.5 w-3.5 inline"
                    fill={replyLiked ? "currentColor" : "none"}
                  />{" "}
                  {t("Love") || "Like"}
                </button>
              </div>
            )}

            {/* Staff actions (Like indicator + Edit button) */}
            {role === "staff" && (
              <div className="mt-1 flex items-center gap-3 px-2 text-xs">
                {/* Show the heart if the member liked it */}
                {replyLiked && (
                  <span className="flex items-center gap-1 text-red-400 font-medium">
                    <Heart className="h-3.5 w-3.5 fill-current" />
                    {t("Loved") || "Liked by member"}
                  </span>
                )}

                {/* The Edit Reply button */}
                <button
                  type="button"
                  onClick={startReply}
                  className="text-white/50 hover:text-white transition"
                >
                  {t("Edit Reply") || "Edit reply"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
       *  STAFF REPLY COMPOSER (new reply, or editing an existing one)
       * ============================================================ */}
      {role === "staff" && (!entry.staff_reply || replyEditing) && (
        <div className="ml-12 mt-1 space-y-2">
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40"
            placeholder={t("staffReplyPlaceholder") || "Write a reply…"}
          />
          <div className="flex justify-end gap-2">
            {replyEditing && (
              <button
                type="button"
                onClick={() => setReplyEditing(false)}
                disabled={replyBusy}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
              >
                {t("cancelLabel") || "Cancel"}
              </button>
            )}
            <button
              type="button"
              onClick={() => saveReply(replyDraft)}
              disabled={replyBusy}
              className="inline-flex items-center gap-1 rounded-full bg-gold-400 px-4 py-1.5 text-xs font-bold text-[#08130F] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {replyBusy
                ? t("submittingLabel") || "Sending"
                : t("sendLabel") || "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}