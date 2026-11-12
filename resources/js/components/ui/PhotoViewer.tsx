import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, FileText, X } from "lucide-react";
import Portal from "./Portal";
import ConfirmDialog from "./ConfirmDialog";
import StatusModal from "./StatusModal";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The one full-size photo / file viewer used everywhere (Inventory, Events,
 * Returns, Budget receipts, Residents). Dark like the rest of the app, steps
 * through a record's files (arrows, thumbnails, keyboard), shows PDFs inline,
 * and every viewer gets the same Download: confirm first, then a success
 * message once the file has actually been saved.
 */
export interface ViewerFile {
  url: string;
  mime?: string;
}

interface PhotoViewerProps {
  /** Currently shown file; null closes the viewer. */
  url: string | null;
  /** Title shown next to the chip (item name, resident name...). */
  name: string;
  /** Every file of the record, so the viewer can step through them. */
  urls?: string[];
  /** Optional per-file MIME types (for blob: URLs that have no extension). */
  mimes?: Record<string, string>;
  /** Chip text; defaults to "View photo". */
  label?: string;
  /** Small grey text after the name (for example a file size). */
  meta?: string;
  /** Hide Download for files that are not saved yet (just-picked blob: files). */
  allowDownload?: boolean;
  onSelect: (url: string) => void;
  onClose: () => void;
  z?: number;
}

const extOf = (url: string) => {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
};

export default function PhotoViewer({ url, name, urls, mimes, label, meta, allowDownload = true, onSelect, onClose, z = 80 }: PhotoViewerProps) {
  const { t } = useLanguage();
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const list = urls && urls.length > 0 ? urls : url ? [url] : [];
  const index = url ? Math.max(0, list.indexOf(url)) : 0;
  const many = list.length > 1;
  const step = (dir: 1 | -1) => onSelect(list[(index + dir + list.length) % list.length]);

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (confirmDownload || downloaded || failed) return;
      if (e.key === "ArrowRight" && many) step(1);
      else if (e.key === "ArrowLeft" && many) step(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!url) return null;

  // A file that was only just picked (blob:/data:) is not saved anywhere yet, so there is nothing to download.
  const canDownload = allowDownload && !/^(blob|data):/.test(url);
  const mime = mimes?.[url];
  const ext = extOf(url);
  const kind: "image" | "pdf" | "other" = mime
    ? mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : "other"
    : url.startsWith("blob:") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext) ? "image" : ext === "pdf" ? "pdf" : ext ? "other" : "image";

  // Only after the person confirms. Fetching the file as a blob and saving it
  // is the closest the browser gives JS to "it was downloaded", so the success
  // message appears only once that has actually worked.
  const doDownload = async () => {
    setConfirmDownload(false);
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      const base = (name || "file").replace(/[\\/:*?"<>|]+/g, "-").trim() || "file";
      const suffix = ext || (blob.type.split("/")[1] ?? "");
      a.download = many ? `${base}-${index + 1}${suffix ? "." + suffix : ""}` : `${base}${suffix ? "." + suffix : ""}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setDownloaded(true);
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Portal>
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4" style={{ zIndex: z }} onClick={onClose}>
          <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] text-[11px] font-bold uppercase tracking-wide px-3 py-1 shrink-0">
                  <Eye className="h-3 w-3" />
                  {label ?? t("viewPhotoLabel")}
                </span>
                <span className="text-sm font-medium text-white truncate">{name}</span>
                {meta && <span className="text-xs text-white/40 shrink-0">&middot; {meta}</span>}
              </div>
              <button type="button" onClick={onClose} className="text-white/50 hover:text-white p-1 shrink-0" aria-label={t("closeLabel")}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex-1 overflow-auto bg-black/40 flex items-center justify-center p-6">
              {kind === "image" ? (
                <img src={url} alt={name} className="max-w-full max-h-[65vh] rounded-xl shadow-2xl" />
              ) : kind === "pdf" ? (
                <iframe src={url} title={name} className="w-full h-[65vh] rounded-xl border border-white/10 bg-white" />
              ) : (
                <div className="text-center py-10">
                  <FileText className="h-10 w-10 mx-auto text-white/40 mb-3" />
                  <p className="text-sm text-white/40">{t("previewNotAvailableLabel")}</p>
                </div>
              )}
              {many && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label={t("viewerPrevLabel")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label={t("viewerNextLabel")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur hover:bg-black/80 hover:text-white flex items-center justify-center transition active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white/80">
                    {index + 1} / {list.length}
                  </span>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              {many ? (
                <div className="flex items-center gap-2">
                  {list.map((u, i) => (
                    <button
                      key={u + i}
                      type="button"
                      onClick={() => onSelect(u)}
                      className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border transition ${u === url ? "border-[#7DD8CB]" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      {extOf(u) === "pdf" || mimes?.[u] === "application/pdf" ? <FileText className="h-5 w-5 text-white/60" /> : <img src={u} alt="" className="h-full w-full object-cover" />}
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {canDownload && (
                  <button
                    type="button"
                    onClick={() => setConfirmDownload(true)}
                    disabled={downloading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> {downloading ? t("downloadingLabel") : t("downloadLabel")}
                  </button>
                )}
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold transition">
                  {t("closeLabel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>

      <ConfirmDialog
        open={confirmDownload}
        icon={<Download className="h-9 w-9" />}
        title={t("confirmDownloadFileTitle")}
        body={t("confirmDownloadFileBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("downloadLabel")}
        onCancel={() => setConfirmDownload(false)}
        onConfirm={doDownload}
        z={z + 10}
      />
      <StatusModal open={downloaded} type="success" title={t("downloadSuccessTitle")} message={t("downloadFileSuccessMessage")} okLabel={t("okLabel")} onClose={() => setDownloaded(false)} z={z + 10} />
      <StatusModal open={failed} type="error" title={t("errorTitle")} message={t("downloadFileFailedMessage")} okLabel={t("okLabel")} onClose={() => setFailed(false)} z={z + 10} />
    </>
  );
}
