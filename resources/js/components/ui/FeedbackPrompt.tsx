import React, { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import api from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";

interface PendingEvent {
  id: number;
  name: string;
  event_start: string;
  location?: string;
}

/**
 * UC-16: Submit Post-Event Feedback. Automatically surfaces one small
 * rating card after the resident has attended (and completed) an event
 * they haven't rated yet — a lightweight prompt rather than a full page,
 * since this is meant to be answered in a few seconds, not "managed".
 */
export default function FeedbackPrompt() {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<PendingEvent[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/feedback/pending")
      .then((res) => setQueue(Array.isArray(res.data) ? res.data : []))
      .catch(() => setQueue([]));
  }, []);

  const current = queue.find((e) => !dismissed.includes(e.id));

  if (!current) return null;

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      await api.post("/feedback", { event_id: current.id, rating, comment: comment || undefined });
    } catch (e) {
      console.error("Failed to submit feedback:", e);
    } finally {
      setSubmitting(false);
      setDismissed((prev) => [...prev, current.id]);
      setRating(0);
      setComment("");
    }
  };

  const skip = () => setDismissed((prev) => [...prev, current.id]);

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-40 sm:w-[380px]">
      {/* Darkened like every other core interactive form in the app (this is
          the member submitting real feedback, not a peripheral alert) --
          same bg-[#0A0E1A]/border-white/10/rounded-[30px] card convention. */}
      <div className="rounded-[30px] bg-[#0A0E1A] shadow-2xl border border-white/10 p-5 relative">
        <button onClick={skip} className="absolute top-3 right-3 text-white/40 hover:text-white">
          <X size={16} />
        </button>
        <p className="text-xs font-bold uppercase tracking-wide text-[#7DD8CB]">{t("uiHowWasIt")}</p>
        <h3 className="text-lg font-black text-white mt-0.5 pr-6 truncate">{current.name}</h3>
        <div className="flex items-center gap-1 mt-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Star
                size={26}
                className={(hoverRating || rating) >= n ? "text-gold-400 fill-gold-400" : "text-white/20"}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("optionalCommentPlaceholder")}
          rows={2}
          className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={rating < 1 || submitting}
            className="flex-1 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold py-2.5 disabled:opacity-50 transition"
          >
            {submitting ? t("submittingLabel") : t("uiSubmitFeedback")}
          </button>
          <button onClick={skip} className="rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 transition">
            {t("uiLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
