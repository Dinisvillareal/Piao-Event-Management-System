import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Pencil, RotateCcw } from "lucide-react";
import FormDrawer, { FormSection } from "../ui/FormDrawer";
import SaveButton from "../ui/SaveButton";
import ConfirmDialog from "../ui/ConfirmDialog";
import NumberStepper from "../ui/NumberStepper";
import SimplePager from "../ui/SimplePager";
import PhotoGallery, { type PhotoItem, photoItemsFromUrls, appendPhotoFields, photoItemsChanged } from "../ui/PhotoGallery";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { tc } from "../../lib/contentTranslations";

// Marks lost units as found. Units are only reported lost from an event's loan
// (Returns -> Report Lost), so this is the way back for those units: they go
// back into stock (also fixes a loss marked by mistake). Staff pick the units
// per condition, so nothing is ever chosen at random.
// The history below also lists the lost reports that came from event loans.

type Action = "found";
// History also lists stock changes made from the Add / Edit form.
type LogAction = Action | "lost" | "added" | "adjusted";

export interface UnitsItem {
  id: number;
  name: string;
  quantity: number;
  new_quantity: number;
  good_quantity: number;
  fair_quantity: number;
  poor_quantity: number;
  lost_quantity: number;
}

/** An event that still has units of this item missing (what the Found form can name). */
interface UnitLog {
  id: number;
  action: LogAction;
  quantity: number;
  units: Record<string, number> | null;
  photo_urls: string[];
  event_id?: number | null;
  event_name: string | null;
  by: string;
  at: string | null;
  undone_at?: string | null;
  undone_by?: string | null;
}

const LABELS = ["New", "Good", "Fair", "Poor"] as const;
const CHIP: Record<string, string> = {
  New: "bg-[#4FBEB0]/20 text-[#7DD8CB]",
  Good: "bg-[#4FBEB0]/10 text-[#7DD8CB]",
  Fair: "bg-gold-400/15 text-gold-300",
  Poor: "bg-[#8A3D2C]/25 text-[#E2A088]",
};
const KEY: Record<string, string> = { New: "conditionNew", Good: "conditionGood", Fair: "conditionFair", Poor: "conditionPoor" };
const ACTION_STYLE: Record<LogAction, string> = {
  added: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
  adjusted: "bg-sky-400/15 text-sky-300",
  lost: "bg-red-500/15 text-red-300",
  found: "bg-[#4FBEB0]/15 text-[#7DD8CB]",
};
const zero = (): Record<string, number> => ({ New: 0, Good: 0, Fair: 0, Poor: 0 });
const sum = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + (Number(b) || 0), 0);


const INPUT_CLASS = "border-white/25 bg-white/10 focus:border-[#4FBEB0]/50 focus:ring-[#4FBEB0]/20"
  + " w-full rounded-full border pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2";

/**
 * The "how many were found, by condition" entry, shared by the Found form and the
 * Edit drawer so both look and behave the same: one card per condition that was lost,
 * each capped at what can still be found in it, plus a total with a progress bar.
 */
function FoundCards({ units, caps, onChange }: { units: Record<string, number>; caps: Record<string, number>; onChange: (next: Record<string, number>) => void }) {
  const { t } = useLanguage();
  const shown = LABELS.filter((x) => (caps[x] ?? 0) > 0);
  const total = sum(units);
  const max = sum(caps);
  const setOne = (l: string, v: number) => onChange({ ...units, [l]: Math.max(0, Math.min(caps[l] ?? 0, Math.floor(v) || 0)) });
  return (
    <div>
      <label className="mb-2 block text-base font-semibold text-white">{t("foundConditionLabel")} *</label>
      <p className="mb-3 text-sm text-white/45">{t("foundSameCondition")}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
        {shown.map((l) => {
          const cap = caps[l] ?? 0;
          const n = units[l] ?? 0;
          const full = n >= cap;
          return (
            <div
              key={l}
              className={`space-y-2.5 rounded-2xl border p-3 transition-colors ${full ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : n > 0 ? "border-white/25 bg-white/[0.05]" : "border-white/10 bg-white/[0.03]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[l]}`}>{t(KEY[l])}</span>
                <span className="text-xs font-semibold text-white/55 [font-variant-numeric:tabular-nums]">{t("foundLostCount").replace("{n}", String(cap))}</span>
              </div>
              <NumberStepper min={0} max={cap} fullWidth value={String(n)} onChange={(v) => setOne(l, Number(v))} className={INPUT_CLASS} />
              <div className="flex items-center justify-between gap-2 text-xs [font-variant-numeric:tabular-nums]">
                <span className={full ? "inline-flex items-center gap-1 font-semibold text-[#7DD8CB]" : "text-white/50"}>
                  {full && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {t("foundOfMax").replace("{n}", String(n)).replace("{max}", String(cap))}
                </span>
                <button
                  type="button"
                  onClick={() => setOne(l, full ? 0 : cap)}
                  className="rounded-full border border-white/15 px-2.5 py-0.5 font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {full ? t("foundClearBtn") : t("foundAllBtn")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-sm text-white/60 [font-variant-numeric:tabular-nums]">
          <span>{t("foundTotalLabel").replace("{n}", String(total)).replace("{max}", String(max))}</span>
          {shown.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(total >= max ? zero() : { ...zero(), ...Object.fromEntries(shown.map((x) => [x, caps[x]])) })}
              className="text-xs font-semibold text-[#7DD8CB] hover:underline"
            >
              {total >= max ? t("foundClearAll") : t("foundAllFound")}
            </button>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#4FBEB0] transition-all" style={{ width: `${max > 0 ? Math.min(100, (total / max) * 100) : 0}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function UnitsModal({
  item,
  onClose,
  onDone,
  onError,
  onViewPhotos,
}: {
  item: UnitsItem;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  /** Opens the app's photo viewer (with Next/Previous when there are several). */
  onViewPhotos: (photo: { url: string; name: string; urls: string[] }) => void;
}) {
  const { t, locale, language } = useLanguage();
  const stock = (label: string) => Number((item as any)[`${label.toLowerCase()}_quantity`]) || 0;

  // Lost units that can go back into stock.
  const returnable = Math.max(0, item.lost_quantity);
  const available: Record<Action, boolean> = {
    found: returnable > 0,
  };
  const tabs = (["found"] as Action[]).filter((a) => available[a]);

  const [action, setAction] = useState<Action>(tabs[0] ?? "found");
  const [units, setUnits] = useState<Record<string, number>>(zero());
  const [busy, setBusy] = useState(false);
  // "Are you sure?" before saving, and before throwing away picked units.
  const [confirm, setConfirm] = useState<"submit" | "cancel" | null>(null);
  const [logs, setLogs] = useState<UnitLog[]>([]);
  // Lost units still outstanding per condition (from the server). Found units come back
  // in the condition they were lost in, so this is also the most each box can take.
  const [lostBy, setLostBy] = useState<Record<string, number> | null>(null);
  // The item's whole picture: lost at return (all events), recovered later, still missing.
  // Recoveries belong to the item, never to an event.
  const [summary, setSummary] = useState<{ lost: number; recovered: number; missing: number } | null>(null);
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 5;
  const logPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const pagedLogs = logs.slice((Math.min(logPage, logPages) - 1) * LOGS_PER_PAGE, Math.min(logPage, logPages) * LOGS_PER_PAGE);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoError, setPhotoError] = useState("");
  // A found report staff are about to undo (asks "Are you sure?" first).
  const [undoLog, setUndoLog] = useState<UnitLog | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  // A found report being corrected (e.g. 1 found instead of 2) in its own drawer.
  const [editLog, setEditLog] = useState<UnitLog | null>(null);
  const [editUnits, setEditUnits] = useState<Record<string, number>>(zero());
  const [editPhotos, setEditPhotos] = useState<PhotoItem[]>([]);
  const [editPhotoError, setEditPhotoError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editConfirm, setEditConfirm] = useState<"save" | "cancel" | null>(null);
  const startEdit = (l: UnitLog) => {
    setEditLog(l);
    setEditUnits({ ...zero(), ...Object.fromEntries(LABELS.map((x) => [x, Number(l.units?.[x]) || 0])) });
    setEditPhotos(photoItemsFromUrls(l.photo_urls));
    setEditPhotoError("");
    setEditConfirm(null);
  };
  const closeEdit = () => {
    editPhotos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.url); });
    setEditLog(null);
    setEditConfirm(null);
  };
  // Up to what is still lost in that condition plus what this report already covers.
  const editCaps: Record<string, number> = Object.fromEntries(LABELS.map((x) => {
    const own = Number(editLog?.units?.[x]) || 0;
    return [x, Math.max(0, (lostBy?.[x] ?? 0) + own)];
  }));
  const editTotal = sum(editUnits);
  const editUnitsChanged = editLog ? LABELS.some((x) => (editUnits[x] ?? 0) !== (Number(editLog.units?.[x]) || 0)) : false;
  const editPhotosChanged = editLog ? photoItemsChanged(editPhotos, editLog.photo_urls.length) : false;
  const editReady = !editBusy && editTotal >= 1 && editPhotos.length >= 1 && (editUnitsChanged || editPhotosChanged);
  const requestEditClose = () => {
    if (editBusy) return;
    if (editUnitsChanged || editPhotosChanged) setEditConfirm("cancel");
    else closeEdit();
  };
  const saveEdit = async () => {
    if (!editLog) return;
    setEditConfirm(null);
    setEditBusy(true);
    try {
      const fd = new FormData();
      LABELS.forEach((x) => fd.append(`units[${x}]`, String(editUnits[x] ?? 0)));
      appendPhotoFields(fd, editPhotos);
      await api.post(`/inventory/${item.id}/unit-logs/${editLog.id}/edit`, fd);
      const from = editLog.quantity;
      const to = editTotal;
      closeEdit();
      loadLogs();
      onDone(t("unitEditDone").replace("{from}", String(from)).replace("{to}", String(to)).replace("{item}", tc(item.name, language as any)));
    } catch (e) {
      onError(apiErrorMessage(e, t("unitEditFailed")));
    } finally {
      setEditBusy(false);
    }
  };

  const loadLogs = () =>
    api.get(`/inventory/${item.id}/unit-logs`)
      .then((res) => {
        setLogs(res.data?.logs ?? []);
        setLostBy(res.data?.lost_by ?? null);
        setSummary(res.data?.summary ?? null);
        setLogPage(1);
      })
      .catch(() => {});

  useEffect(() => { loadLogs(); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { photos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.url); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If the current tab stops being possible after a save (e.g. nothing left
  // to mark as found), move to the first tab that still is.
  const tabKey = tabs.join(",");
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(action)) switchTo(tabs[0]);
  }, [tabKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (next: Action) => {
    setAction(next);
    setPhotos([]);
    setPhotoError("");
    setUnits(zero());
  };

  // Evidence photos are required.
  const needsPhotos = true;

  // A condition can't take more than was lost in it.
  const capFor = (label: string): number => Math.max(0, Math.min(returnable, lostBy?.[label] ?? 0));
  const setUnit = (label: string, value: number) =>
    setUnits((prev) => ({ ...prev, [label]: Math.max(0, Math.min(capFor(label), Math.floor(value) || 0)) }));

  const unitsEff = units;
  const total = sum(unitsEff);
  const count = total;
  // Only the conditions that were actually lost are offered.
  const lostLabels = LABELS.filter((x) => (lostBy?.[x] ?? 0) > 0);
  const hasPhotos = photos.length >= 1;
  const ready = !busy && total >= 1 && (!needsPhotos || hasPhotos);

  const submit = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("action", action);
      LABELS.forEach((l) => { if ((units[l] ?? 0) > 0) fd.append(`units[${l}]`, String(units[l])); });
      photos.forEach((p) => { if (p.file) fd.append("photos[]", p.file); });
      await api.post(`/inventory/${item.id}/units`, fd);
      // Stay in the drawer: clear the form, refresh the activity list, and let
      // the parent refresh the stock numbers (the tabs follow the new counts).
      setUnits(zero());
      photos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.url); });
      setPhotos([]);
      setPhotoError("");
      loadLogs();
      onDone(t(`unitsDone_${action}`).replace("{n}", String(count)).replace("{item}", tc(item.name, language as any)));
    } catch (e) {
      onError(apiErrorMessage(e, t("unitsFailed")));
    } finally {
      setBusy(false);
    }
  };

  const undoFound = async () => {
    const log = undoLog;
    if (!log) return;
    setUndoBusy(true);
    try {
      await api.post(`/inventory/${item.id}/unit-logs/${log.id}/undo`);
      setUndoLog(null);
      closeEdit();
      loadLogs();
      onDone(t("unitUndoDone").replace("{n}", String(log.quantity)).replace("{item}", tc(item.name, language as any)));
    } catch (e) {
      setUndoLog(null);
      onError(apiErrorMessage(e, t("unitUndoFailed")));
    } finally {
      setUndoBusy(false);
    }
  };

  const tabLabel: Record<Action, string> = { found: t("unitTabFound") };
  const logLabel: Record<LogAction, string> = { ...tabLabel, lost: t("unitTabLost"), added: t("unitsLogAdded"), adjusted: t("unitsLogAdjusted") };
  const submitLabel = busy ? t("savingLabel") : count > 0 ? t(`unitsSubmit_${action}`).replace("{n}", String(count)) : tabLabel[action];
  const Icon = CheckCircle2;
  const dirty = total > 0 || photos.length > 0;
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirm("cancel");
    else onClose();
  };
  const when = (iso: string | null) => {
    try { return iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : ""; } catch { return iso ?? ""; }
  };

  const inputClass = INPUT_CLASS;

  return (
    <>
      <FormDrawer
        z="z-[60]"
        title={t("unitsTitle")}
        subtitle={<span className="text-[#7DD8CB]">{tc(item.name, language as any)}</span>}
        onClose={requestClose}
        footer={
          tabs.length === 0 ? (
            <SaveButton type="button" icon={CheckCircle2} className="w-full" onClick={onClose} active>{t("closeLabel")}</SaveButton>
          ) : (
            <SaveButton type="button" icon={Icon} className="w-full" onClick={() => setConfirm("submit")} active={ready}>
              {submitLabel}
            </SaveButton>
          )
        }
      >
        {tabs.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center text-base text-white/55">{t("unitsNothing")}</p>
        )}
        {tabs.length > 0 && (
          <>
            <FormSection title={t("unitsActionSection")} className="space-y-4">
              <div className={tabs.length > 1 ? "flex flex-wrap gap-2.5" : "hidden"}>
                {tabs.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => switchTo(a)}
                    className={`rounded-full px-6 py-2.5 text-base font-semibold transition ${action === a ? "bg-white text-[#0A0E1A]" : "border border-white/20 text-white/70 hover:bg-white/10"}`}
                  >
                    {tabLabel[a]}
                  </button>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-white/55">{t(`unitsHint_${action}`)}</p>
            </FormSection>

            <FormSection title={t("unitsUnitsSection")} className="space-y-5">
              <FoundCards
                units={units}
                caps={Object.fromEntries(LABELS.map((x) => [x, capFor(x)]))}
                onChange={(next) => setUnits(next)}
              />
              {summary && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-xs text-white/45">{t("foundSummaryLost")}</p><p className="text-lg font-bold text-white">{summary.lost}</p></div>
                    <div><p className="text-xs text-white/45">{t("foundSummaryRecovered")}</p><p className="text-lg font-bold text-emerald-300">{summary.recovered}</p></div>
                    <div><p className="text-xs text-white/45">{t("foundSummaryMissing")}</p><p className="text-lg font-bold text-rose-300">{summary.missing}</p></div>
                  </div>
                  <p className="text-xs leading-relaxed text-white/45">{t("foundItemLevelNote")}</p>
                </div>
              )}
            </FormSection>

            {needsPhotos && (
              <FormSection title={t("unitsEvidenceSection")} className="space-y-3">
                <p className="text-sm text-white/55">{t("unitsEvidenceHint")}</p>
                <PhotoGallery
                  items={photos}
                  onChange={(next) => { setPhotos(next); setPhotoError(""); }}
                  onPreview={(it) => onViewPhotos({ url: it.url, name: item.name, urls: photos.map((p) => p.url) })}
                  onError={setPhotoError}
                  max={5}
                />
                {photoError && <p className="text-sm text-red-300">{photoError}</p>}
              </FormSection>
            )}

          </>
        )}

        {logs.length > 0 && (
          <FormSection title={t("unitsHistory")} className="space-y-3">
            <ul className="space-y-3">
              {pagedLogs.map((l) => (
                <li key={l.id} className={`flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm ${l.undone_at ? "opacity-60" : ""}`}>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${ACTION_STYLE[l.action]}`}>{l.action === "adjusted" ? "\u00B1" : l.action === "added" ? "+" : ""}{l.quantity}{l.action === "adjusted" || l.action === "added" ? " " : "\u00D7 "}{logLabel[l.action]}</span>
                  <div className="min-w-0 flex-1 text-white/60">
                    <p className="[font-variant-numeric:tabular-nums]">
                      {l.units
                        ? LABELS.filter((x) => (l.units?.[x] ?? 0) !== 0).map((x) => `${l.action === "adjusted" && (l.units?.[x] ?? 0) > 0 ? "+" : ""}${l.units?.[x]} ${t(KEY[x])}`).join(", ")
                        : t("unitsStillOnLoan")}
                      {l.action === "lost" && l.event_name && <> &bull; {tc(l.event_name, language as any)}</>}
                    </p>
                    {l.action === "added" && <p className="mt-0.5 text-xs text-white/45">{t("unitsAddedNote")}</p>}
                    {l.photo_urls?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {l.photo_urls.map((u) => (
                          <button key={u} type="button" onClick={() => onViewPhotos({ url: u, name: item.name, urls: l.photo_urls })} className="group relative h-10 w-10 overflow-hidden rounded-lg border border-white/15" aria-label={t("viewPhotoLabel")}>
                            <img src={u} alt="" className="h-full w-full object-cover" />
                            <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur"><Eye className="h-2.5 w-2.5" /></span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-white/35">{l.by} &bull; {when(l.at)}</p>
                    {l.action === "found" && l.undone_at && (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/70">
                        <RotateCcw className="h-3 w-3" /> {t("unitUndoneChip").replace("{by}", l.undone_by ?? "").replace("{when}", when(l.undone_at))}
                      </p>
                    )}
                    {l.action === "found" && !l.undone_at && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(l)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("unitEditBtn")}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <SimplePager page={Math.min(logPage, logPages)} totalPages={logPages} onChange={setLogPage} />
          </FormSection>
        )}
      </FormDrawer>

      {editLog && (
        <FormDrawer
          z="z-[70]"
          title={t("unitEditTitle")}
          subtitle={<span className="text-[#7DD8CB]">{tc(item.name, language as any)}</span>}
          onClose={requestEditClose}
          footer={
            <div className="space-y-3">
              <SaveButton type="button" icon={CheckCircle2} className="w-full" onClick={() => setEditConfirm("save")} active={editReady}>
                {editBusy ? t("savingLabel") : t("unitEditSave")}
              </SaveButton>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setUndoLog(editLog)}
                  disabled={editBusy}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#E2A088] transition hover:text-white disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("unitMoveBackBtn")}
                </button>
              </div>
            </div>
          }
        >
          <FormSection title={t("unitsActionSection")} className="space-y-4">
            <p className="text-sm leading-relaxed text-white/55">{t("unitEditHint")}</p>
          </FormSection>
          <FormSection title={t("unitsUnitsSection")} className="space-y-5">
            <FoundCards units={editUnits} caps={editCaps} onChange={setEditUnits} />
          </FormSection>
          <FormSection title={t("unitsEvidenceSection")} className="space-y-3">
            <p className="text-sm text-white/55">{t("unitsEvidenceHint")}</p>
            <PhotoGallery
              items={editPhotos}
              onChange={(next) => { setEditPhotos(next); setEditPhotoError(""); }}
              onPreview={(it) => onViewPhotos({ url: it.url, name: item.name, urls: editPhotos.map((p) => p.url) })}
              onError={setEditPhotoError}
              max={5}
              allowEmpty={false}
            />
            {editPhotoError && <p className="text-sm text-red-300">{editPhotoError}</p>}
            <p className="text-sm text-white/45">{t("unitEditPhotoKept")}</p>
          </FormSection>
        </FormDrawer>
      )}

      <ConfirmDialog
        open={editConfirm === "save"}
        icon={<Pencil size={32} />}
        title={t("unitEditConfirmTitle")}
        body={t("unitEditConfirmBody").replace("{from}", String(editLog?.quantity ?? 0)).replace("{to}", String(editTotal)).replace("{item}", tc(item.name, language as any))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("unitEditConfirmYes")}
        onCancel={() => setEditConfirm(null)}
        onConfirm={saveEdit}
        z={90}
      />
      <ConfirmDialog
        open={editConfirm === "cancel"}
        icon={<AlertTriangle size={32} />}
        title={t("unitsCancelTitle")}
        body={t("unitEditCancelBody")}
        cancelLabel={t("unitsCancelStay")}
        confirmLabel={t("unitsCancelYes")}
        onCancel={() => setEditConfirm(null)}
        onConfirm={closeEdit}
        tone="warning"
        z={90}
      />
      <ConfirmDialog
        open={confirm === "submit"}
        icon={<Icon size={32} />}
        title={t(`unitsConfirmTitle_${action}`)}
        body={t(`unitsConfirmBody_${action}`).replace("{n}", String(count)).replace("{item}", tc(item.name, language as any))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t(`unitsConfirmYes_${action}`)}
        onCancel={() => setConfirm(null)}
        onConfirm={submit}
        z={80}
      />
      <ConfirmDialog
        open={!!undoLog}
        icon={<RotateCcw size={32} />}
        title={t("unitUndoTitle")}
        body={t("unitUndoBody").replace("{n}", String(undoLog?.quantity ?? 0)).replace("{item}", tc(item.name, language as any))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={undoBusy ? t("savingLabel") : t("unitUndoYes")}
        onCancel={() => { if (!undoBusy) setUndoLog(null); }}
        onConfirm={undoFound}
        tone="warning"
        z={80}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        icon={<AlertTriangle size={32} />}
        title={t("unitsCancelTitle")}
        body={t("unitsCancelBody")}
        cancelLabel={t("unitsCancelStay")}
        confirmLabel={t("unitsCancelYes")}
        onCancel={() => setConfirm(null)}
        onConfirm={onClose}
        tone="warning"
        z={80}
      />
    </>
  );
}
