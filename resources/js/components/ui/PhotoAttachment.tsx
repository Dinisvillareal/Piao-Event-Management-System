import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImagePlus, Trash2, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface PhotoAttachmentProps {
  /** A newly picked file (preferred for the name/size shown). */
  file?: File | null;
  /** The saved photo's URL -- shown as a link by its file name, not as a picture. */
  url?: string | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: () => void;
  /** Omit when the photo is required and can only be replaced, never removed. */
  onDelete?: () => void;
  /** Overrides the Delete button text (e.g. "Undo change" when it only discards a newly picked photo). */
  deleteLabel?: string;
  /** Label for the pick button when nothing is attached yet. */
  chooseLabel?: string;
}

const BTN_WHITE =
  "inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition";
const BTN_GREEN =
  "inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/40 px-5 py-2.5 text-base font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition";
const BTN_RED =
  "inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-base font-semibold text-red-400 hover:bg-red-500/10 transition";

function fileNameFromUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) return "photo";
  try {
    const clean = url.split("?")[0].split("#")[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || "photo";
  } catch {
    return "photo";
  }
}

function formatSize(bytes: number): string {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

/**
 * One consistent "attached photo" row used wherever a photo can be added,
 * replaced, previewed or removed: the photo is listed by its file name (a
 * link that opens the preview) instead of a big inline picture, with the
 * same Replace / Preview (white) and Delete (red) buttons everywhere.
 */
export default function PhotoAttachment({ file, url, onPick, onPreview, onDelete, deleteLabel, chooseLabel }: PhotoAttachmentProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const has = !!file || !!url;
  // Thumbnail: the picked file (via an object URL) or the saved photo's URL.
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    setThumbFailed(false);
    if (file) {
      const u = URL.createObjectURL(file);
      setThumb(u);
      return () => URL.revokeObjectURL(u);
    }
    setThumb(url ?? null);
  }, [file, url]);
  const name = file ? file.name : url ? fileNameFromUrl(url) : "";
  const meta = file ? `${t("photoImageKind")} · ${formatSize(file.size)}` : t("savedPhotoLabel");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          {has ? (
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
                  <ImageIcon className="h-6 w-6" />
                )}
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  title={deleteLabel ?? t("photoDeleteBtn")}
                  aria-label={deleteLabel ?? t("photoDeleteBtn")}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/50 hover:bg-black/70 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-white/40 flex items-center justify-center">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            {has ? (
              <>
                <button
                  type="button"
                  onClick={onPreview}
                  title={t("photoPreviewBtn")}
                  className="block max-w-full truncate text-left text-base font-semibold text-[#7DD8CB] hover:underline"
                >
                  {name}
                </button>
                <p className="text-sm text-white/50">{meta}</p>
              </>
            ) : (
              <p className="text-base text-white/50">{t("noPhotoChosen")}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className={has ? BTN_WHITE : BTN_GREEN}>
            {!has && <ImagePlus className="h-4 w-4" />}
            {has ? t("photoReplaceBtn") : chooseLabel ?? t("choosePhotoLabel")}
          </button>
          {has && (
            <button type="button" onClick={onPreview} className={BTN_WHITE}>
              {t("photoPreviewBtn")}
            </button>
          )}
          {has && onDelete && (
            <button type="button" onClick={onDelete} className={BTN_RED}>
              <Trash2 className="h-4 w-4" /> {deleteLabel ?? t("photoDeleteBtn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
