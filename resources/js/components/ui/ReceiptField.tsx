import React, { useRef, useState } from "react";
import { FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * One file of an expense receipt. A receipt is either up to 5 photos
 * (JPG/PNG) or exactly one PDF -- never a mix.
 */
export interface ReceiptItem {
  id: string;
  url: string;
  name: string;
  isPdf: boolean;
  file: File | null;
  /** Position in the saved list (first file first) when it is already saved. */
  existingIndex: number | null;
}

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

let uid = 0;
const nextId = () => `receipt-${Date.now()}-${uid++}`;

const extOf = (url: string) => (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
const nameOf = (url: string) => {
  try {
    const clean = url.split("?")[0].split("#")[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || "receipt";
  } catch {
    return "receipt";
  }
};
const formatSize = (bytes: number) =>
  bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";

/** Saved receipt URLs (first file first) -> items for the field. */
export function receiptItemsFromUrls(urls: (string | null | undefined)[] | null | undefined): ReceiptItem[] {
  return (urls ?? [])
    .filter((u): u is string => !!u)
    .map((url, i) => ({ id: nextId(), url, name: nameOf(url), isPdf: extOf(url) === "pdf", file: null, existingIndex: i }));
}

/**
 * Writes the whole receipt list into a FormData the way the server expects:
 * receipts_sync=1, keep_receipts[] = saved files to keep (in order) and
 * receipts[] = newly picked files. Saved files not listed are removed.
 */
export function appendReceiptFields(fd: FormData, items: ReceiptItem[]) {
  fd.append("receipts_sync", "1");
  items.forEach((it) => {
    if (it.file) fd.append("receipts[]", it.file);
    else if (it.existingIndex !== null) fd.append("keep_receipts[]", String(it.existingIndex));
  });
}

/** True when the list differs from what is saved (added, removed or swapped). */
export function receiptItemsChanged(items: ReceiptItem[], savedCount: number): boolean {
  if (items.some((i) => i.file)) return true;
  if (items.length !== savedCount) return true;
  return items.some((it, i) => it.existingIndex !== i);
}

const BTN_WHITE =
  "inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition";
const BTN_RED =
  "inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-base font-semibold text-red-400 hover:bg-red-500/10 transition";
const BTN_GREEN =
  "inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/40 px-5 py-2.5 text-[15px] font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition";
const BTN_WHITE_SM =
  "inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-white/15 transition";
const BTN_RED_SM =
  "inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-[15px] font-semibold text-red-400 hover:bg-red-500/10 transition";
const X_BADGE_SM =
  "absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition";
const X_BADGE =
  "absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition";

interface ReceiptFieldProps {
  items: ReceiptItem[];
  onChange: (items: ReceiptItem[]) => void;
  /** Open the viewer on `item`; `all` is the whole list so it can step through the photos. */
  onPreview: (item: ReceiptItem, all: ReceiptItem[]) => void;
  /** Called with a ready-to-show message when a picked file is rejected. */
  onError?: (message: string) => void;
  /** Text of the green button while nothing is attached. */
  emptyLabel?: string;
}

/**
 * Receipt field for expense forms (Budget and Events, add and edit).
 *  - Photos: up to 5, a thumbnail grid with an X on each, a "+" tile, plus
 *    Preview and Delete (Delete clears all of them, the X removes one).
 *  - PDF: exactly one, shown as a file row with Replace and Preview.
 */
export default function ReceiptField({ items, onChange, onPreview, onError, emptyLabel }: ReceiptFieldProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pdfMode = items.length > 0 && items[0].isPdf;
  const imageMode = items.length > 0 && !pdfMode;
  const full = items.length >= MAX_FILES;
  const selectedIndex = Math.max(0, items.findIndex((i) => i.id === selectedId));
  const selected = items[selectedIndex];

  const release = (list: ReceiptItem[]) => list.forEach((i) => i.file && URL.revokeObjectURL(i.url));

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const isPdfFile = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isImgFile = (f: File) => f.type === "image/jpeg" || f.type === "image/png";

    const bad = picked.filter((f) => !isPdfFile(f) && !isImgFile(f));
    if (bad.length > 0) {
      onError?.(t("receiptTypeError"));
    }
    const ok = picked.filter((f) => isPdfFile(f) || isImgFile(f));
    if (ok.some((f) => f.size > MAX_BYTES)) {
      onError?.(t("photoTooLarge"));
      return;
    }
    const pdfs = ok.filter(isPdfFile);
    const imgs = ok.filter((f) => !isPdfFile(f));
    if (pdfs.length > 0 && imgs.length > 0) {
      onError?.(t("receiptMixError"));
      return;
    }

    const make = (f: File): ReceiptItem => ({
      id: nextId(),
      url: URL.createObjectURL(f),
      name: f.name,
      isPdf: isPdfFile(f),
      file: f,
      existingIndex: null,
    });

    if (pdfs.length > 0) {
      // One PDF only -- it replaces whatever receipt was attached.
      if (pdfs.length > 1) onError?.(t("receiptPdfSingleError"));
      release(items);
      onChange([make(pdfs[0])]);
      return;
    }
    if (imgs.length > 0) {
      // Photos replace a PDF, or are added to the photos already attached.
      const base = pdfMode ? [] : items;
      if (pdfMode) release(items);
      const room = MAX_FILES - base.length;
      if (imgs.length > room) onError?.(t("photosMaxReached").replace("{n}", String(MAX_FILES)));
      onChange([...base, ...imgs.slice(0, room).map(make)]);
    }
  };

  const remove = (id: string) => {
    const gone = items.find((i) => i.id === id);
    if (gone?.file) URL.revokeObjectURL(gone.url);
    onChange(items.filter((i) => i.id !== id));
  };

  const removeAll = () => {
    release(items);
    onChange([]);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={imageMode ? "image/jpeg,image/png,.jpg,.jpeg,.png" : "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"}
      className="hidden"
      onChange={handlePick}
    />
  );

  // ── Nothing attached yet ────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div>
        {input}
        <button type="button" onClick={() => inputRef.current?.click()} className={BTN_GREEN}>
          <Paperclip className="h-4 w-4" /> {emptyLabel ?? t("attachReceiptLabel")}
        </button>
      </div>
    );
  }

  // ── One PDF ─────────────────────────────────────────────────────────────
  if (pdfMode) {
    const pdf = items[0];
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {input}
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => onPreview(pdf, items)}
              title={t("photoPreviewBtn")}
              aria-label={t("photoPreviewBtn")}
              className="h-16 w-16 rounded-lg border border-[#4FBEB0]/40 bg-[#4FBEB0]/10 text-[#7DD8CB] flex items-center justify-center hover:border-[#7DD8CB] transition"
            >
              <FileText className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => remove(pdf.id)} title={t("removeLabel")} aria-label={t("removeLabel")} className={X_BADGE_SM}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onPreview(pdf, items)}
              className="block max-w-full truncate text-left text-sm font-semibold text-[#7DD8CB] hover:underline"
            >
              {pdf.file ? pdf.name : t("savedReceiptLabel")}
            </button>
            <p className="text-xs text-white/45">PDF{pdf.file ? ` · ${formatSize(pdf.file.size)}` : ""}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className={BTN_WHITE_SM}>
            {t("replaceReceiptLabel")}
          </button>
          <button type="button" onClick={() => onPreview(pdf, items)} className={BTN_WHITE_SM}>
            {t("photoPreviewBtn")}
          </button>
        </div>
      </div>
    );
  }

  // ── Photos ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-center gap-2">
      {input}
      {items.map((it) => {
        const isSelected = selected?.id === it.id;
        return (
          <div key={it.id} className="relative">
            <button
              type="button"
              onClick={() => setSelectedId(it.id)}
              onDoubleClick={() => onPreview(it, items)}
              aria-pressed={isSelected}
              className={`block h-16 w-16 overflow-hidden rounded-lg border-2 bg-black/30 transition ${
                isSelected ? "border-[#7DD8CB]" : "border-white/15 hover:border-white/40"
              }`}
            >
              <img src={it.url} alt="" className="h-full w-full object-cover" />
            </button>
            <button type="button" onClick={() => remove(it.id)} title={t("removeLabel")} aria-label={t("removeLabel")} className={X_BADGE_SM}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={t("addMorePhotosLabel")}
          aria-label={t("addMorePhotosLabel")}
          className="h-16 w-16 rounded-lg border border-dashed border-white/25 bg-white/[0.02] text-white/50 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
      <span className="text-xs text-white/45">
        {t("photosCountLabel").replace("{n}", String(items.length)).replace("{max}", String(MAX_FILES))}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={() => selected && onPreview(selected, items)} className={BTN_WHITE_SM}>
          {t("photoPreviewBtn")}
        </button>
        <button type="button" onClick={removeAll} className={BTN_RED_SM}>
          <Trash2 className="h-4 w-4" /> {t("photoDeleteBtn")}
        </button>
      </div>
    </div>
  );
}
