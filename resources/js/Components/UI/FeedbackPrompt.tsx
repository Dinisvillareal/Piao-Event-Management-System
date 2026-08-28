import React, { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import api from "../../lib/api";

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
      <div className="rounded-[24px] bg-white shadow-2xl border border-[#ddd5ca] p-5 relative">
        <button onClick={skip} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
        <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">How was it?</p>
        <h3 className="text-lg font-black text-[#005f63] mt-0.5 pr-6 truncate">{current.name}</h3>
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
                className={(hoverRating || rating) >= n ? "text-orange-400 fill-orange-400" : "text-gray-300"}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment..."
          rows={2}
          className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={rating < 1 || submitting}
            className="flex-1 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white text-sm font-bold py-2.5 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
          <button onClick={skip} className="rounded-full border border-gray-200 text-gray-500 text-sm font-medium px-4">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
