import { useState } from "react";
import { ChevronDown, Eye, FileText, Pencil } from "lucide-react";
import { FormSection } from "./FormDrawer";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The edit trail of a return or an expense -- same look as the history rows in
 * the Units pop-up. Every edit is listed with what changed (from -> to), who
 * did it and when. Photos or receipts an edit replaced are never deleted: they
 * sit on that entry, one click away.
 */
export interface ActivityChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}
export interface ActivityEntry {
  changes: ActivityChange[];
  photo_urls: string[];
  added_urls?: string[];
  by: string | null;
  at: string | null;
}

const isPdf = (url: string) => (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase() === "pdf";

const FIELD_KEY: Record<string, string> = {
  new: "conditionNew",
  good: "conditionGood",
  fair: "conditionFair",
  poor: "conditionPoor",
  quantity: "activityFieldQuantity",
  item: "activityFieldItem",
  amount: "activityFieldAmount",
  notes: "notesLabel",
};

export default function ActivityLog({
  entries,
  onOpen,
  defaultOpen = false,
}: {
  entries: ActivityEntry[] | null | undefined;
  /** Opens the viewer on one of the replaced files; `urls` is that entry's whole set. */
  onOpen: (url: string, urls: string[]) => void;
  /** Start with the list showing (the read-only history view). */
  defaultOpen?: boolean;
}) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const list = (entries ?? []).filter((e) => (e.changes?.length ?? 0) > 0 || (e.photo_urls?.length ?? 0) > 0 || (e.added_urls?.length ?? 0) > 0);

  const when = (iso: string | null) => {
    try { return iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : ""; } catch { return iso ?? ""; }
  };
  const label = (field: string) => (FIELD_KEY[field] ? t(FIELD_KEY[field]) : field);
  const val = (v: string | number | null) => (v === null || v === "" ? "—" : String(v));

  // Nothing to show for a record that was never edited -- no empty box on every form.
  if (list.length === 0) return null;

  return (
    <FormSection title={t("activityLogTitle").replace("{n}", String(list.length))} className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7DD8CB] transition hover:text-white"
      >
        {open ? t("activityHide") : t("activityShow")}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
        <p className="text-sm text-white/55">{t("activityLogHint")}</p>
        <ul className="space-y-3">
          {list.map((e, i) => (
            <li key={i} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-400/15 px-2.5 py-0.5 text-xs font-bold text-sky-300">
                <Pencil className="h-3 w-3" /> {t("activityEdited")}
              </span>
              <div className="min-w-0 flex-1 text-white/60">
                {e.changes?.length > 0 && (
                  <ul className="space-y-0.5 [font-variant-numeric:tabular-nums]">
                    {e.changes.map((c, j) => (
                      <li key={j}>
                        <span className="text-white/75">{label(c.field)}</span>: {val(c.from)} <span className="text-white/35">&rarr;</span> <span className="text-white/90">{val(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {([
                  { urls: e.added_urls ?? [], label: t("activityAddedPhotos") },
                  { urls: e.photo_urls ?? [], label: t("activityReplacedPhotos") },
                ]).filter((g) => g.urls.length > 0).map((g) => (
                  <div key={g.label} className="mt-2">
                    <p className="mb-1 text-xs text-white/45">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.urls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => onOpen(u, g.urls)}
                          className="group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/[0.05]"
                          aria-label={t("viewPhotoLabel")}
                        >
                          {isPdf(u) ? <FileText className="h-5 w-5 text-white/60" /> : <img src={u} alt="" className="h-full w-full object-cover" />}
                          <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur"><Eye className="h-2.5 w-2.5" /></span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="mt-1 text-xs text-white/35">{e.by ?? "—"}{e.at ? ` • ${when(e.at)}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </FormSection>
  );
}
