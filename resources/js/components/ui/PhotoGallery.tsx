import React, { useRef, useState } from "react";
import { ImagePlus, Plus, X, Trash2 } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * One photo in a multi-photo field: either one that is already saved on the
 * server (existingIndex = its position in the saved list, cover first) or a
 * file just picked (file + a local blob URL).
 */
export interface PhotoItem {
  id: string;
  url: string;
  file: File | null;
  existingIndex: number | null;
}

export const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

let uid = 0;
const nextId = () => `photo-${Date.now()}-${uid++}`;

/** Saved photo URLs (cover first) -> items for the field. */
export function photoItemsFromUrls(urls: (string | null | undefined)[] | null | undefined): PhotoItem[] {
  return (urls ?? [])
    .filter((u): u is string => !!u)
    .map((url, i) => ({ id: nextId(), url, file: null, existingIndex: i }));
}

/**
 * Writes the whole photo list into a FormData the way the server expects:
 * photos_sync=1, keep_photos[] = saved ones to keep (in order) and photos[] =
 * newly picked files. Anything saved but not listed gets removed.
 */
export function appendPhotoFields(fd: FormData, items: PhotoItem[]) {
  fd.append("photos_sync", "1");
  items.forEach((it) => {
    if (it.file) fd.append("photos[]", it.file);
    else if (it.existingIndex !== null) fd.append("keep_photos[]", String(it.existingIndex));
  });
}

/** True when the list differs from the saved one (added, removed or reordered by removal). */
export function photoItemsChanged(items: PhotoItem[], savedCount: number): boolean {
  if (items.some((i) => i.file)) return true;
  if (items.length !== savedCount) return true;
  return items.some((it, i) => it.existingIndex !== i);
}

interface PhotoGalleryProps {
  items: PhotoItem[];
  onChange: (items: PhotoItem[]) => void;
  onPreview: (item: PhotoItem, index: number) => void;
  /** Called with a ready-to-show message when a picked file is rejected. */
  onError?: (message: string) => void;
  max?: number;
  /** When false the last remaining photo can't be removed (e.g. a return needs evidence). */
  allowEmpty?: boolean;
  /** Small inline strip (48px thumbnails) for tight rows, e.g. each item in the Release modal. */
  compact?: boolean;
  /** Label for the empty-state button in compact mode. */
  emptyLabel?: string;
}

/**
 * Multi-photo field used by Inventory and Returns: a tidy grid of thumbnails
 * (first one is the cover), each with a clear X to remove it, plus an "Add"
 * tile until the limit is reached. Click a thumbnail to preview it.
 */
export default function PhotoGallery({ items, onChange, onPreview, onError, max = MAX_PHOTOS, allowEmpty = true, compact = false, emptyLabel }: PhotoGalleryProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  // The photo the Preview / Delete buttons act on (defaults to the first).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = Math.max(0, items.findIndex((i) => i.id === selectedId));
  const selected = items[selectedIndex];
  const full = items.length >= max;

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const next = [...items];
    let rejected: string | null = null;
    for (const file of picked) {
      if (next.length >= max) {
        rejected = t("photosMaxReached").replace("{n}", String(max));
        break;
      }
      if (!file.type.startsWith("image/")) {
        rejected = t("uploadImageOnly");
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected = t("photoTooLarge");
        continue;
      }
      next.push({ id: nextId(), url: URL.createObjectURL(file), file, existingIndex: null });
    }
    if (next.length !== items.length) onChange(next);
    if (rejected) onError?.(rejected);
  };

  const remove = (id: string) => {
    const gone = items.find((i) => i.id === id);
    if (gone?.file) URL.revokeObjectURL(gone.url);
    onChange(items.filter((i) => i.id !== id));
  };

  // Delete button: clears every photo at once (the X on a photo removes just that one).
  const removeAll = () => {
    items.forEach((i) => i.file && URL.revokeObjectURL(i.url));
    onChange([]);
  };

  const input = (
    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePick} />
  );

  if (compact) {
    return (
      <div className="flex flex-1 min-w-0 flex-wrap items-center gap-2">
        {input}
        {items.map((it, i) => (
          <div key={it.id} className="relative">
            <button
              type="button"
              onClick={() => setSelectedId(it.id)}
              onDoubleClick={() => onPreview(it, i)}
              aria-pressed={selected?.id === it.id}
              className={`block h-12 w-12 overflow-hidden rounded-lg border-2 bg-black/30 transition ${
                selected?.id === it.id ? "border-[#7DD8CB]" : "border-white/15 hover:border-white/40"
              }`}
            >
              <img src={it.url} alt="" className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => remove(it.id)}
              title={t("removeLabel")}
              aria-label={t("removeLabel")}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/60 hover:bg-black/80 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!full && (
          items.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#4FBEB0]/60 bg-[#4FBEB0]/10 px-4 py-2 text-sm font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/20 transition"
            >
              <ImagePlus className="h-4 w-4" /> {emptyLabel ?? t("choosePhotosLabel")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              title={t("addMorePhotosLabel")}
              aria-label={t("addMorePhotosLabel")}
              className="h-12 w-12 rounded-lg border border-dashed border-white/25 bg-white/[0.02] text-white/50 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
            >
              <Plus className="h-5 w-5" />
            </button>
          )
        )}
        {items.length > 0 && (
          <span className="text-xs text-white/45">
            {t("photosCountLabel").replace("{n}", String(items.length)).replace("{max}", String(max))}
          </span>
        )}
        {items.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => selected && onPreview(selected, selectedIndex)}
              className="inline-flex items-center rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 transition"
            >
              {t("photoPreviewBtn")}
            </button>
            <button
              type="button"
              onClick={removeAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 className="h-4 w-4" /> {t("photoDeleteBtn")}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
        {input}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-white/40 flex items-center justify-center">
              <ImagePlus className="h-6 w-6" />
            </div>
            <p className="text-base text-white/50">{t("noPhotoChosen")}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#4FBEB0]/40 px-5 py-2.5 text-base font-semibold text-[#7DD8CB] hover:bg-[#4FBEB0]/10 transition"
          >
            <ImagePlus className="h-4 w-4" /> {t("choosePhotosLabel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      {input}
      <p className="mb-3 text-sm font-semibold text-white/70">
        {t("photosCountLabel").replace("{n}", String(items.length)).replace("{max}", String(max))}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {items.map((it, i) => {
          const isSelected = selected?.id === it.id;
          return (
            <div key={it.id} className="relative">
              <button
                type="button"
                onClick={() => setSelectedId(it.id)}
                onDoubleClick={() => onPreview(it, i)}
                aria-pressed={isSelected}
                className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-black/30 transition ${
                  isSelected ? "border-[#7DD8CB]" : "border-white/15 hover:border-white/40"
                }`}
              >
                <img src={it.url} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t("coverPhotoLabel")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(it.id)}
                title={t("removeLabel")}
                aria-label={t("removeLabel")}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 border border-white/40 text-white backdrop-blur-sm flex items-center justify-center transition"
              >
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
            className="aspect-square w-full rounded-xl border border-dashed border-white/25 bg-white/[0.02] text-white/50 hover:text-[#7DD8CB] hover:border-[#4FBEB0]/50 flex items-center justify-center transition"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Preview (white) opens the highlighted photo; Delete (red) clears ALL photos;
          the X on a photo removes just that one; the dashed "+" tile adds more. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selected && onPreview(selected, selectedIndex)}
          className="inline-flex items-center rounded-full border border-white/25 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/15 transition"
        >
          {t("photoPreviewBtn")}
        </button>
        <button
          type="button"
          onClick={removeAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-5 py-2.5 text-base font-semibold text-red-400 hover:bg-red-500/10 transition"
        >
          <Trash2 className="h-4 w-4" /> {t("photoDeleteBtn")}
        </button>
        <span className="text-sm text-white/45 sm:ml-auto">{t("selectPhotoHint")}</span>
      </div>
    </div>
  );
}
