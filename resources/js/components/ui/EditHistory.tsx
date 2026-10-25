import { useState } from "react";
import { createPortal } from "react-dom";
import { History, Star, X } from "lucide-react";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";

type Version = {
  rating: number | null;
  reason: string | null;
  comment: string | null;
  at: string | null;
  current: boolean;
};

// Facebook-style "Edited" label. Opens a modal listing the current version and
// every earlier one with the time it was written. Shown only when a rating or
// reason was actually changed (edits > 0); the server only returns the history
// to staff and to the member who wrote it.
export default function EditHistory({
  kind,
  id,
  edits,
}: {
  kind: "rating" | "absence";
  id: number;
  edits?: number;
}) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!edits || edits < 1) return null;

  const fmt = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(locale === "tl" ? "fil-PH" : locale === "ceb" ? "fil-PH" : "en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const openModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/feedback/${kind}/${id}/history`);
      setVersions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(apiErrorMessage(err, t("fbHistoryFailed")));
    } finally {
      setLoading(false);
    }
  };

  const close = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-white/45 hover:text-[#7DD8CB] hover:underline transition"
      >
        <History className="h-3 w-3" /> {t("fbEdited")}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
            onClick={close}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F1626] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <h3 className="text-base font-bold text-white">{t("fbEditHistory")}</h3>
                <button type="button" onClick={close} aria-label={t("closeLabel")} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 overflow-y-auto p-5">
                {loading ? (
                  <p className="text-sm text-white/50">{t("loading")}</p>
                ) : error ? (
                  <p className="text-sm text-red-400">{error}</p>
                ) : (
                  versions.map((v, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${v.current ? "bg-[#4FBEB0]/20 text-[#7DD8CB]" : "bg-white/10 text-white/55"}`}>
                          {v.current ? t("fbCurrentVersion") : i === versions.length - 1 ? t("fbOriginalVersion") : t("fbEarlierVersion")}
                        </span>
                        <span className="text-[11px] text-white/45">{fmt(v.at)}</span>
                      </div>
                      {v.rating != null && (
                        <span className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`h-4 w-4 ${n <= (v.rating ?? 0) ? "text-amber-400 fill-amber-400" : "text-white/15"}`} />
                          ))}
                        </span>
                      )}
                      {v.reason && (
                        <span className="inline-block rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-0.5 text-xs font-semibold text-gold-300">
                          {t(`absReason_${v.reason}`)}
                        </span>
                      )}
                      {v.comment ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/70">{v.comment}</p>
                      ) : (
                        <p className="mt-2 text-xs italic text-white/35">{t("fbNoComment")}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
