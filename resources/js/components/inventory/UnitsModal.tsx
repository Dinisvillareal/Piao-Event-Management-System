import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Trash2, RotateCcw } from "lucide-react";
import FormDrawer, { FormSection } from "../ui/FormDrawer";
import SaveButton from "../ui/SaveButton";
import ConfirmDialog from "../ui/ConfirmDialog";
import NumberStepper from "../ui/NumberStepper";
import SimplePager from "../ui/SimplePager";
import PhotoGallery, { type PhotoItem } from "../ui/PhotoGallery";
import api, { apiErrorMessage } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { tc } from "../../lib/contentTranslations";

// One place for every unit-level correction on an inventory item:
//  Lost      units missing from stock          -> leave stock, join the lost count
//  Found     lost units that turned up         -> back into stock (also fixes a loss marked by mistake)
//  Disposed  unusable units                    -> leave stock, join the disposed count
//  Restore   disposed units usable again       -> back into stock
// Staff pick the units per condition, so nothing is ever chosen at random.

type Action = "lost" | "found" | "disposed" | "restored";
// History also lists stock changes made from the Add / Edit form.
type LogAction = Action | "added" | "adjusted";

export interface UnitsItem {
  id: number;
  name: string;
  quantity: number;
  new_quantity: number;
  good_quantity: number;
  fair_quantity: number;
  poor_quantity: number;
  lost_quantity: number;
  lost_pending: number;
  disposed_quantity: number;
}

interface UnitLog {
  id: number;
  action: LogAction;
  quantity: number;
  units: Record<string, number> | null;
  photo_urls: string[];
  event_name: string | null;
  by: string;
  at: string | null;
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
  disposed: "bg-white/10 text-white/60",
  restored: "bg-gold-400/15 text-gold-300",
};
const zero = (): Record<string, number> => ({ New: 0, Good: 0, Fair: 0, Poor: 0 });
const sum = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + (Number(b) || 0), 0);

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

  const available: Record<Action, boolean> = {
    lost: item.quantity > 0,
    found: item.lost_quantity > 0,
    disposed: item.quantity > 0,
    restored: item.disposed_quantity > 0,
  };
  const tabs = (["lost", "found", "disposed", "restored"] as Action[]).filter((a) => available[a]);

  const [action, setAction] = useState<Action>(tabs[0] ?? "lost");
  const [units, setUnits] = useState<Record<string, number>>(zero());
  const [foundQty, setFoundQty] = useState(1);
  const [busy, setBusy] = useState(false);
  // "Are you sure?" before saving, and before throwing away picked units.
  const [confirm, setConfirm] = useState<"submit" | "cancel" | null>(null);
  const [logs, setLogs] = useState<UnitLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 5;
  const logPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const pagedLogs = logs.slice((Math.min(logPage, logPages) - 1) * LOGS_PER_PAGE, Math.min(logPage, logPages) * LOGS_PER_PAGE);
  // What was disposed, per condition (from the ledger). `unknown` = disposed
  // before the ledger existed, so its condition can't be known.
  const [disposedInfo, setDisposedInfo] = useState<{ known: Record<string, number>; unknown: number }>({ known: zero(), unknown: item.disposed_quantity });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoError, setPhotoError] = useState("");

  const loadLogs = () =>
    api.get(`/inventory/${item.id}/unit-logs`)
      .then((res) => {
        setLogs(res.data?.logs ?? []);
        setLogPage(1);
        if (res.data?.disposed) setDisposedInfo({ known: { ...zero(), ...res.data.disposed.known }, unknown: Number(res.data.disposed.unknown) || 0 });
      })
      .catch(() => {});

  useEffect(() => { loadLogs(); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { photos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.url); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If the current tab stops being possible after a save (e.g. nothing left
  // to restore), move to the first tab that still is.
  const tabKey = tabs.join(",");
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(action)) switchTo(tabs[0]);
  }, [tabKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toStockFor = (qty: number) => qty - Math.min(qty, item.lost_pending ?? 0);
  const switchTo = (next: Action) => {
    setAction(next);
    setPhotos([]);
    setPhotoError("");
    setUnits(zero());
    if (next === "found") {
      setFoundQty(1);
      setUnits({ ...zero(), Good: toStockFor(1) });
    }
  };

  // Evidence photos are required for dispose / restore / found.
  const needsPhotos = action !== "lost";

  // Restore only what was disposed, in the condition it was disposed in.
  // Units disposed before the ledger existed (`unknown`) may go to any condition.
  const restoreCap = (label: string): number => {
    const known = disposedInfo.known[label] ?? 0;
    const overflow = LABELS.filter((k) => k !== label).reduce((a, k) => a + Math.max(0, (units[k] ?? 0) - (disposedInfo.known[k] ?? 0)), 0);
    return known + Math.max(0, disposedInfo.unknown - overflow);
  };

  // Cap for one condition: lost / disposed from that condition's stock; a
  // restore only the disposed condition; found up to the units that go to stock.
  const capFor = (label: string): number => {
    const others = sum(units) - (units[label] ?? 0);
    if (action === "restored") return Math.max(0, Math.min(restoreCap(label), item.disposed_quantity - others));
    if (action === "found") return Math.max(0, toStockFor(foundQty) - others);
    return stock(label);
  };
  const setUnit = (label: string, value: number) =>
    setUnits((prev) => ({ ...prev, [label]: Math.max(0, Math.min(capFor(label), Math.floor(value) || 0)) }));
  const changeFoundQty = (value: number) => {
    const qty = Math.max(1, Math.min(item.lost_quantity, Math.floor(value) || 1));
    setFoundQty(qty);
    setUnits({ ...zero(), Good: toStockFor(qty) });
  };

  const total = sum(units);
  const toStock = toStockFor(foundQty);
  const onLoan = foundQty - toStock;
  const count = action === "found" ? foundQty : total;
  const hasPhotos = photos.length >= 1;
  const ready = !busy && (action === "found" ? total === toStock : total > 0) && (!needsPhotos || hasPhotos);

  const submit = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("action", action);
      LABELS.forEach((l) => { if ((units[l] ?? 0) > 0) fd.append(`units[${l}]`, String(units[l])); });
      if (action === "found") fd.append("quantity", String(foundQty));
      if (needsPhotos) photos.forEach((p) => { if (p.file) fd.append("photos[]", p.file); });
      await api.post(`/inventory/${item.id}/units`, fd);
      // Stay in the drawer: clear the form, refresh the activity list, and let
      // the parent refresh the stock numbers (the tabs follow the new counts).
      setUnits(zero());
      setFoundQty(1);
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

  const tabLabel: Record<Action, string> = { lost: t("unitTabLost"), found: t("unitTabFound"), disposed: t("unitTabDisposed"), restored: t("unitTabRestored") };
  const logLabel: Record<LogAction, string> = { ...tabLabel, added: t("unitsLogAdded"), adjusted: t("unitsLogAdjusted") };
  const tone = action === "lost" ? "red" : action === "disposed" ? "slate" : "teal";
  const submitLabel = busy ? t("savingLabel") : count > 0 ? t(`unitsSubmit_${action}`).replace("{n}", String(count)) : tabLabel[action];
  const Icon = action === "lost" ? AlertTriangle : action === "disposed" ? Trash2 : action === "restored" ? RotateCcw : CheckCircle2;
  const dirty = count > 0 || photos.length > 0 || (action === "found" && foundQty > 1);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirm("cancel");
    else onClose();
  };
  const when = (iso: string | null) => {
    try { return iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : ""; } catch { return iso ?? ""; }
  };

  const inputClass = (tone === "red" ? "border-red-400/30 bg-red-500/10 focus:border-red-400/60 focus:ring-red-400/20" : "border-white/25 bg-white/10 focus:border-[#4FBEB0]/50 focus:ring-[#4FBEB0]/20")
    + " w-full rounded-full border pl-5 pr-8 py-3.5 text-base font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2";

  return (
    <>
      <FormDrawer
        z="z-[60]"
        title={t("unitsTitle")}
        subtitle={<span className="text-[#7DD8CB]">{tc(item.name, language as any)}</span>}
        onClose={requestClose}
        footer={
          tabs.length === 0 ? (
            <SaveButton type="button" className="w-full" active={false}>{t("unitsNothing")}</SaveButton>
          ) : (
            <SaveButton type="button" icon={Icon} className="w-full" onClick={() => setConfirm("submit")} active={ready}>
              {submitLabel}
            </SaveButton>
          )
        }
      >
        {tabs.length === 0 ? (
          <p className="py-10 text-center text-base text-white/50">{t("unitsNothing")}</p>
        ) : (
          <>
            <FormSection title={t("unitsActionSection")} className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
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
              {action === "found" && (
                <div>
                  <label className="mb-1.5 block text-base font-semibold text-white">{t("foundHowMany")}</label>
                  <NumberStepper min={1} max={item.lost_quantity} fullWidth value={String(foundQty)} onChange={(v) => changeFoundQty(Number(v))} className={inputClass} />
                  <p className="mt-2 text-sm text-white/45">{t("foundMaxHint").replace("{n}", String(item.lost_quantity))}</p>
                  {onLoan > 0 && (
                    <p className="mt-3 rounded-2xl border border-gold-400/25 bg-gold-400/10 px-4 py-2.5 text-sm text-gold-300">{t("foundPendingHint").replace("{n}", String(onLoan))}</p>
                  )}
                </div>
              )}

              {(action !== "found" || toStock > 0) && (
                <div>
                  <label className="mb-2 block text-base font-semibold text-white">
                    {action === "found" ? t("foundConditionLabel") : action === "restored" ? t("unitsRestoreCondition") : t("unitsPickCondition")} *
                  </label>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-4">
                    {LABELS.map((l) => {
                      const cap = action === "restored" || action === "found" ? capFor(l) + (units[l] ?? 0) : stock(l);
                      const dim = action === "found" ? false : action === "restored" ? restoreCap(l) === 0 : stock(l) === 0;
                      return (
                        <div key={l} className={dim ? "opacity-40" : ""}>
                          <span className={`mb-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[l]}`}>{t(KEY[l])}</span>
                          <NumberStepper min={0} max={cap} fullWidth value={String(units[l] ?? 0)} onChange={(v) => setUnit(l, Number(v))} className={inputClass} />
                          {(action === "lost" || action === "disposed") && <p className="mt-1.5 pl-1 text-xs text-white/45">{t("lostInStockOfN").replace("{n}", String(stock(l)))}</p>}
                          {action === "restored" && disposedInfo.known[l] > 0 && <p className="mt-1.5 pl-1 text-xs text-white/45">{t("restoreDisposedOfN").replace("{n}", String(disposedInfo.known[l]))}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-sm text-white/60 [font-variant-numeric:tabular-nums]">
                    {t("unitsSelectedLabel")}: <span className="font-semibold text-white">{count}</span>
                  </p>
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

            {logs.length > 0 && (
              <FormSection title={t("unitsHistory")} className="space-y-3">
                <ul className="space-y-3">
                  {pagedLogs.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${ACTION_STYLE[l.action]}`}>{l.action === "adjusted" ? "\u00B1" : l.action === "added" ? "+" : ""}{l.quantity}{l.action === "adjusted" || l.action === "added" ? " " : "\u00D7 "}{logLabel[l.action]}</span>
                      <div className="min-w-0 flex-1 text-white/60">
                        <p className="[font-variant-numeric:tabular-nums]">
                          {l.units
                            ? LABELS.filter((x) => (l.units?.[x] ?? 0) !== 0).map((x) => `${l.action === "adjusted" && (l.units?.[x] ?? 0) > 0 ? "+" : ""}${l.units?.[x]} ${t(KEY[x])}`).join(", ")
                            : t("unitsStillOnLoan")}
                          {l.event_name && <> &bull; {tc(l.event_name, language as any)}</>}
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
                      </div>
                    </li>
                  ))}
                </ul>
                <SimplePager page={Math.min(logPage, logPages)} totalPages={logPages} onChange={setLogPage} />
              </FormSection>
            )}
          </>
        )}
      </FormDrawer>

      <ConfirmDialog
        open={confirm === "submit"}
        icon={<Icon size={32} />}
        title={t(`unitsConfirmTitle_${action}`)}
        body={t(`unitsConfirmBody_${action}`).replace("{n}", String(count)).replace("{item}", tc(item.name, language as any))}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t(`unitsConfirmYes_${action}`)}
        onCancel={() => setConfirm(null)}
        onConfirm={submit}
        tone={action === "lost" || action === "disposed" ? "danger" : undefined}
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
