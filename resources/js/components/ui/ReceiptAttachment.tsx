import React, { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface ReceiptAttachmentProps {
  /** A receipt that was just picked and not saved yet. */
  file?: File | null;
  /** The saved receipt's URL (when editing an existing expense). */
  url?: string | null;
  onPreview: () => void;
  onReplace: () => void;
  /** Shows the small clear X on the thumbnail; omit when it can't be removed. */
  onRemove?: () => void;
}

const BTN_WHITE =
  "inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition";

const extOf = (url: string) => (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
const isImageExt = (ext: string) => ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
const formatSize = (bytes: number) =>
  bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";

/**
 * One "attached receipt" row for every expense form (Budget and Events,
 * add and edit): thumbnail (or a file badge for PDFs), the file name as a
 * link that opens the preview, and the same white Replace / Preview
 * buttons used for photos.
 */
export default function ReceiptAttachment({ file, url, onPreview, onReplace, onRemove }: ReceiptAttachmentProps) {
  const { t } = useLanguage();
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setThumbFailed(false);
    if (file) {
      if (!file.type.startsWith("image/")) {
        setThumb(null);
        return;
      }
      const u = URL.createObjectURL(file);
      setThumb(u);
      return () => URL.revokeObjectURL(u);
    }
    setThumb(url && isImageExt(extOf(url)) ? url : null);
  }, [file, url]);

  const ext = file ? (file.type === "application/pdf" ? "pdf" : file.name.split(".").pop()?.toLowerCase() || "") : url ? extOf(url) : "";
  const kind = ext === "pdf" ? "PDF" : isImageExt(ext) || file?.type.startsWith("image/") ? t("photoImageKind") : t("fileLabel");
  const name = file ? file.name : t("savedReceiptLabel");
  const meta = file ? `${kind} · ${formatSize(file.size)}` : kind;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onPreview}
              title={t("photoPreviewBtn")}
              aria-label={t("photoPreviewBtn")}
              className="h-16 w-16 overflow-hidden rounded-xl border border-[#4FBEB0]/40 bg-[#4FBEB0]/10 text-[#7DD8CB] flex items-center justify-center hover:border-[#7DD8CB] transition"
            >
              {thumb && !thumbFailed ? (
                <img src={thumb} alt="" onError={() => setThumbFailed(true)} className="h-full w-full object-cover" />
              ) : (
                <FileText className="h-6 w-6" />
              )}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                title={t("removeLabel")}
                aria-label={t("removeLabel")}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/50 hover:bg-black/70 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={onPreview}
              className="block max-w-full truncate text-left text-base font-semibold text-[#7DD8CB] hover:underline"
            >
              {name}
            </button>
            <p className="text-sm text-white/50">{meta}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onReplace} className={BTN_WHITE}>
            {t("replaceReceiptLabel")}
          </button>
          <button type="button" onClick={onPreview} className={BTN_WHITE}>
            {t("photoPreviewBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
