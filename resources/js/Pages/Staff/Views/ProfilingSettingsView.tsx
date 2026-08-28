import React, { useEffect, useState } from "react";
import { Users2, Heart, Plus, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";

/**
 * Adviser example (Senior Citizen eligibility) — extended to Youth and
 * Solo Parent: this screen lets Staff manage the age brackets and
 * civil/current statuses used to gate membership eligibility, instead of
 * those being hardcoded in the backend.
 */

interface AgeBracket {
  id: number;
  label: string;
  min_age: number;
  max_age: number | null;
  sort_order: number;
}

interface CivilStatus {
  id: number;
  label: string;
  sort_order: number;
}

const csrfToken = () =>
  decodeURIComponent(
    document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1] ?? ""
  );

export default function ProfilingSettingsView() {
  const { t } = useLanguage();

  const [ageBrackets, setAgeBrackets] = useState<AgeBracket[]>([]);
  const [civilStatuses, setCivilStatuses] = useState<CivilStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bracketForm, setBracketForm] = useState({ id: null as number | null, label: "", min_age: "", max_age: "" });
  const [statusForm, setStatusForm] = useState({ id: null as number | null, label: "" });
  const [savingBracket, setSavingBracket] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        fetch("/age-brackets", { headers: { Accept: "application/json" } }).then((r) => r.json()),
        fetch("/civil-statuses", { headers: { Accept: "application/json" } }).then((r) => r.json()),
      ]);
      setAgeBrackets(Array.isArray(b) ? b : []);
      setCivilStatuses(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error("profiling settings load:", e);
      setError(t("loadProfilingSettingsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetBracketForm = () => setBracketForm({ id: null, label: "", min_age: "", max_age: "" });
  const resetStatusForm = () => setStatusForm({ id: null, label: "" });

  const submitBracket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bracketForm.label.trim() || bracketForm.min_age === "") return;
    setSavingBracket(true);
    setError(null);
    try {
      const url = bracketForm.id ? `/age-brackets/${bracketForm.id}` : "/age-brackets";
      const method = bracketForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-XSRF-TOKEN": csrfToken(),
        },
        body: JSON.stringify({
          label: bracketForm.label,
          min_age: Number(bracketForm.min_age),
          max_age: bracketForm.max_age === "" ? null : Number(bracketForm.max_age),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resetBracketForm();
      load();
    } catch (e) {
      console.error("save age bracket:", e);
      setError(t("saveAgeBracketFailed"));
    } finally {
      setSavingBracket(false);
    }
  };

  const deleteBracket = async (id: number) => {
    try {
      const res = await fetch(`/age-brackets/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json", "X-XSRF-TOKEN": csrfToken() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (e) {
      console.error("delete age bracket:", e);
      setError(t("deleteAgeBracketFailed"));
    }
  };

  const submitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusForm.label.trim()) return;
    setSavingStatus(true);
    setError(null);
    try {
      const url = statusForm.id ? `/civil-statuses/${statusForm.id}` : "/civil-statuses";
      const method = statusForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-XSRF-TOKEN": csrfToken(),
        },
        body: JSON.stringify({ label: statusForm.label }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resetStatusForm();
      load();
    } catch (e) {
      console.error("save civil status:", e);
      setError(t("saveCivilStatusFailed"));
    } finally {
      setSavingStatus(false);
    }
  };

  const deleteStatus = async (id: number) => {
    try {
      const res = await fetch(`/civil-statuses/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json", "X-XSRF-TOKEN": csrfToken() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (e) {
      console.error("delete civil status:", e);
      setError(t("deleteCivilStatusFailed"));
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("profilingSettingsTitle")}</h1>
        <p className="mt-1 text-sm text-[#667777]">{t("profilingSettingsSubtitle")}</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</div>}

      {/* Age Brackets card */}
      <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-100">
              <Users2 className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#005f63]">{t("ageBracketsTitle")}</h2>
              <p className="text-xs text-gray-500">{t("ageBracketsDesc")}</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
          ) : (
            <div className="mt-5 space-y-2">
              {ageBrackets.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{b.label}</p>
                    <p className="text-xs text-gray-500">{b.min_age} - {b.max_age ?? "∞"} {t("yearsOldSuffix")}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBracketForm({ id: b.id, label: b.label, min_age: String(b.min_age), max_age: b.max_age === null ? "" : String(b.max_age) })}
                      className="p-1.5 rounded-full hover:bg-orange-50 text-orange-600"
                      title={t("editLabel")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBracket(b.id)}
                      className="p-1.5 rounded-full hover:bg-red-50 text-red-500"
                      title={t("deleteTitle")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <form onSubmit={submitBracket} className="mt-4 rounded-2xl border border-dashed border-gray-200 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">
                  {bracketForm.id ? t("editAgeBracketLabel") : t("addAgeBracketLabel")}
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    value={bracketForm.label}
                    onChange={(e) => setBracketForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder={t("bracketLabelPlaceholder")}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm"
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    value={bracketForm.min_age}
                    onChange={(e) => setBracketForm((p) => ({ ...p, min_age: e.target.value }))}
                    placeholder={t("minAgePlaceholder")}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm"
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    value={bracketForm.max_age}
                    onChange={(e) => setBracketForm((p) => ({ ...p, max_age: e.target.value }))}
                    placeholder={t("maxAgeOpenEndedPlaceholder")}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  {bracketForm.id && (
                    <button type="button" onClick={resetBracketForm} className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
                      {t("cancelLabel")}
                    </button>
                  )}
                  <button type="submit" disabled={savingBracket} className="inline-flex items-center gap-2 bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-60">
                    <Plus className="h-4 w-4" /> {bracketForm.id ? t("saveChanges") : t("addAgeBracketLabel")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Civil Status card */}
      <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-orange-400 to-yellow-300" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100">
              <Heart className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#005f63]">{t("civilStatusesTitle")}</h2>
              <p className="text-xs text-gray-500">{t("civilStatusesDesc")}</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
          ) : (
            <div className="mt-5 space-y-2">
              {civilStatuses.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-2.5">
                  <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setStatusForm({ id: s.id, label: s.label })}
                      className="p-1.5 rounded-full hover:bg-orange-50 text-orange-600"
                      title={t("editLabel")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteStatus(s.id)}
                      className="p-1.5 rounded-full hover:bg-red-50 text-red-500"
                      title={t("deleteTitle")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <form onSubmit={submitStatus} className="mt-4 rounded-2xl border border-dashed border-gray-200 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#005f63]/70">
                  {statusForm.id ? t("editCivilStatusLabel") : t("addCivilStatusLabel")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={statusForm.label}
                    onChange={(e) => setStatusForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder={t("statusLabelPlaceholder")}
                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm"
                    required
                  />
                  <div className="flex gap-2 justify-end">
                    {statusForm.id && (
                      <button type="button" onClick={resetStatusForm} className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
                        {t("cancelLabel")}
                      </button>
                    )}
                    <button type="submit" disabled={savingStatus} className="inline-flex items-center gap-2 bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-60 whitespace-nowrap">
                      <Plus className="h-4 w-4" /> {statusForm.id ? t("saveChanges") : t("addCivilStatusLabel")}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
