import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import StatusModal from "./StatusModal";
import FilterDropdown from "./FilterDropdown";
import { useLanguage } from "../../i18n/LanguageContext";
import api, { apiErrorMessage } from "../../lib/api";

type Purok = { id: number; name: string };

const NONE = "__none";
const MAX_LEN = 50;

export default function PurokSelect({
  value,
  onChange,
  hasError = false,
}: {
  value: string;
  onChange: (purok: string) => void;
  hasError?: boolean;
}) {
  const { t } = useLanguage();
  const [list, setList] = useState<Purok[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const Z = 10050;

  useEffect(() => {
    let alive = true;
    api.get("/puroks")
      .then((res) => {
        if (alive && Array.isArray(res.data)) setList(res.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const items = list
      .map((p) => ({ value: p.name, label: p.name, removable: true }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
      );
    if (value && !items.some((o) => o.value.toLowerCase() === value.toLowerCase())) {
      items.push({ value, label: value, removable: false });
      items.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
      );
    }
    return [{ value: NONE, label: t("noneOption"), removable: false }, ...items];
  }, [list, value, t]);

  const requestAdd = () => {
    const v = draft.trim();
    if (!v) {
      setValidationError("Please enter a purok name.");
      return;
    }
    if (v.length > MAX_LEN) {
      setValidationError(`Purok name must be ${MAX_LEN} characters or fewer.`);
      return;
    }
    if (options.some((o) => o.value.toLowerCase() === v.toLowerCase())) {
      setValidationError(`"${v}" is already in the purok list.`);
      return;
    }
    setPendingAdd(v);
  };

  const performAdd = async () => {
    const v = pendingAdd;
    setPendingAdd(null);
    if (!v || busy) return;
    setBusy(true);
    try {
      const res = await api.post("/puroks", { name: v });
      setList((prev) => [...prev, res.data]);
      onChange(res.data.name);
      setDraft("");
      setSuccessMessage(`"${res.data.name}" has been added to the purok list.`);
    } catch (e: any) {
      setErrorMessage(apiErrorMessage(e, "Failed to add purok."));
    } finally {
      setBusy(false);
    }
  };

  const performRemove = async () => {
    const name = pendingRemove;
    setPendingRemove(null);
    const entry = list.find((p) => p.name === name);
    if (!entry || busy) return;
    setBusy(true);
    try {
      await api.delete(`/puroks/${entry.id}`);
      setList((prev) => prev.filter((p) => p.id !== entry.id));
      if (value === name) onChange("");
      setSuccessMessage(`"${entry.name}" has been removed from the purok list.`);
    } catch (e: any) {
      setErrorMessage(apiErrorMessage(e, "Failed to remove purok."));
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
        forceClose={
          pendingAdd !== null ||
          pendingRemove !== null ||
          !!validationError ||
          !!errorMessage ||
          !!successMessage
        }
        fullWidth
        dark
        wrapperClassName="w-full"
        className={`w-full h-[54px] px-5 !text-base font-sans !bg-white/10 focus:!border-[#4FBEB0]/70 focus:ring-[#4FBEB0]/40 ${
          hasError ? "!border-red-500" : "!border-white/25"
        }`}
        footer={
          <div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="text"
                value={draft}
                maxLength={MAX_LEN}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    requestAdd();
                  }
                }}
                placeholder="Add a new purok..."
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
        title="Add Purok"
        body={`Add "${pendingAdd ?? ""}" to the purok list?`}
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
        title="Remove Purok"
        body={`Remove "${pendingRemove ?? ""}" from the purok list? Existing residents with this purok will keep it.`}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesDeleteButton")}
        onCancel={() => setPendingRemove(null)}
        onConfirm={performRemove}
      />
      <StatusModal
        open={!!validationError}
        z={Z}
        type="warning"
        title="Check Purok"
        message={validationError ?? ""}
        okLabel={t("okLabel")}
        onClose={() => setValidationError(null)}
      />
      <StatusModal
        open={!!errorMessage}
        z={Z}
        type="error"
        title={t("errorTitle")}
        message={errorMessage ?? ""}
        okLabel={t("okLabel")}
        onClose={() => setErrorMessage(null)}
      />
      <StatusModal
        open={!!successMessage}
        z={Z}
        type="success"
        title={t("successTitle")}
        message={successMessage ?? ""}
        okLabel={t("okLabel")}
        onClose={() => setSuccessMessage(null)}
      />
    </>
  );
}