import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import StatusModal from "./StatusModal";
import FilterDropdown from "./FilterDropdown";
import { useLanguage } from "../../i18n/LanguageContext";
import api, { apiErrorMessage } from "../../lib/api";

type Suffix = { id: number; name: string };

const NONE = "__none";
const MAX_LEN = 10; // matches the server's suffix rule (max:10)

/**
 * Suffix picker for the resident forms: the usual Jr./Sr./II... list, plus
 * the ability to add a new suffix (type it at the bottom of the list and press
 * Add / Enter) and to remove one (the "x" on its row). The list is stored in
 * the database (`name_suffixes`), so every staff member and device sees the
 * same options. Removing an option only changes this list -- residents already
 * saved with that suffix keep it.
 */
export default function SuffixSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (suffix: string) => void;
}) {
  const { t } = useLanguage();
  const [list, setList] = useState<Suffix[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Popups, same shared dialogs as the rest of the app. They sit above the
  // dropdown panel (z 9999) and any form modal underneath.
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const Z = 10050;

  useEffect(() => {
    let alive = true;
    api.get("/name-suffixes")
      .then((res) => { if (alive && Array.isArray(res.data)) setList(res.data); })
      .catch(() => { /* leave empty -- the dropdown still offers "None" */ });
    return () => { alive = false; };
  }, []);

  // A resident saved with a suffix that's no longer in the list still shows it.
  const options = useMemo(() => {
    const items = list
      .map((s) => ({ value: s.name, label: s.name, removable: true }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    if (value && !items.some((o) => o.value.toLowerCase() === value.toLowerCase())) {
      items.push({ value, label: value, removable: false });
      items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    }
    return [{ value: NONE, label: t("noneOption"), removable: false }, ...items];
  }, [list, value, t]);

  // Step 1: validate -- anything wrong is explained in a popup instead of
  // being silently ignored; a valid suffix moves on to the "are you sure?".
  const requestAdd = () => {
    const v = draft.trim();
    if (!v) { setValidationError(t("suffixEmptyError")); return; }
    if (v.length > MAX_LEN) { setValidationError(t("suffixTooLong")); return; }
    if (options.some((o) => o.value.toLowerCase() === v.toLowerCase())) { setValidationError(t("suffixAlreadyExists")); return; }
    setPendingAdd(v);
  };

  const performAdd = async () => {
    const v = pendingAdd;
    setPendingAdd(null);
    if (!v || busy) return;
    setBusy(true);
    try {
      const res = await api.post("/name-suffixes", { name: v });
      setList((prev) => [...prev, res.data]);
      onChange(res.data.name);
      setDraft("");
      setSuccessMessage(t("suffixAddedSuccess").replace("{name}", res.data.name));
    } catch (e: any) {
      setErrorMessage(apiErrorMessage(e, t("suffixAddFailed")));
    } finally {
      setBusy(false);
    }
  };

  const performRemove = async () => {
    const name = pendingRemove;
    setPendingRemove(null);
    const entry = list.find((s) => s.name === name);
    if (!entry || busy) return;
    setBusy(true);
    try {
      await api.delete(`/name-suffixes/${entry.id}`);
      setList((prev) => prev.filter((s) => s.id !== entry.id));
      if (value === name) onChange("");
      setSuccessMessage(t("suffixRemovedSuccess").replace("{name}", entry.name));
    } catch (e: any) {
      setErrorMessage(apiErrorMessage(e, t("suffixRemoveFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <FilterDropdown
      value={value || NONE}
      onChange={(v) => onChange(v === NONE ? "" : v)}
      options={options}
      onRemoveOption={(name) => setPendingRemove(name)}
      forceClose={pendingAdd !== null || pendingRemove !== null || !!validationError || !!errorMessage || !!successMessage}
      fullWidth
      dark
      wrapperClassName="w-full"
      className="w-full h-[54px] px-5 !text-base font-sans !bg-white/10 !border-white/25 focus:!border-[#4FBEB0]/70 focus:ring-[#4FBEB0]/40"
      footer={
        <div>
          <div className="flex items-center gap-2 pb-1">
            <input
              type="text"
              value={draft}
              maxLength={MAX_LEN + 5}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); requestAdd(); } }}
              placeholder={t("suffixAddPlaceholder")}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-[#4FBEB0]/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={requestAdd}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sage-800 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Plus className="h-4 w-4" />
              {t("suffixAddButton")}
            </button>
          </div>
        </div>
      }
    />

    <ConfirmDialog
      open={pendingAdd !== null}
      z={Z}
      icon={<Plus size={32} />}
      title={t("suffixConfirmAddTitle")}
      body={t("suffixConfirmAddBody").replace("{name}", pendingAdd ?? "")}
      cancelLabel={t("cancelLabel")}
      confirmLabel={t("yesAdd")}
      onCancel={() => setPendingAdd(null)}
      onConfirm={performAdd}
    />
    <ConfirmDialog
      open={pendingRemove !== null}
      z={Z}
      tone="danger"
      icon={<Trash2 size={32} />}
      title={t("suffixConfirmRemoveTitle")}
      body={t("suffixConfirmRemoveBody").replace("{name}", pendingRemove ?? "")}
      cancelLabel={t("cancelLabel")}
      confirmLabel={t("yesDeleteButton")}
      onCancel={() => setPendingRemove(null)}
      onConfirm={performRemove}
    />
    <StatusModal open={!!validationError} z={Z} type="warning" title={t("suffixCheckTitle")} message={validationError ?? ""} okLabel={t("okLabel")} onClose={() => setValidationError(null)} />
    <StatusModal open={!!errorMessage} z={Z} type="error" title={t("errorTitle")} message={errorMessage ?? ""} okLabel={t("okLabel")} onClose={() => setErrorMessage(null)} />
    <StatusModal open={!!successMessage} z={Z} type="success" title={t("successTitle")} message={successMessage ?? ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} />
    </>
  );
}
