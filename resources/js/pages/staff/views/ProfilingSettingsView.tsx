import React, { useEffect, useRef, useState } from "react";
import { Users2, Heart, Tag, Plus, Pencil, Trash2 } from "lucide-react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
import Skeleton from "../../../components/ui/Skeleton";
import NumberStepper from "../../../components/ui/NumberStepper";
import { useLanguage } from "../../../i18n/LanguageContext";

import { tc } from "../../../lib/contentTranslations";
/**
 * Adviser example (Senior Citizen eligibility) — extended to Youth and
 * Solo Parent: this screen lets Staff manage the age brackets, civil
 * statuses, and current statuses used to gate membership eligibility,
 * instead of those being hardcoded in the backend.
 *
 * Civil Status (Single/Married/Widowed/Separated) and Current Status
 * (Solo Parent, etc.) are two independent taxonomies -- a resident's
 * civil status and current status are set separately, and either can be
 * used on its own as a membership eligibility gate.
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

interface CurrentStatus {
  id: number;
  label: string;
  sort_order: number;
}

const csrfToken = () =>
  decodeURIComponent(
    document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1] ?? ""
  );

export default function ProfilingSettingsView() {
  const { t, language } = useLanguage();

  const [ageBrackets, setAgeBrackets] = useState<AgeBracket[]>([]);
  const [civilStatuses, setCivilStatuses] = useState<CivilStatus[]>([]);
  const [currentStatuses, setCurrentStatuses] = useState<CurrentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [bracketForm, setBracketForm] = useState({ id: null as number | null, label: "", min_age: "", max_age: "" });
  const [statusForm, setStatusForm] = useState({ id: null as number | null, label: "" });
  const [currentStatusForm, setCurrentStatusForm] = useState({ id: null as number | null, label: "" });
  const [originalBracketForm, setOriginalBracketForm] = useState({ id: null as number | null, label: "", min_age: "", max_age: "" });
  const [originalStatusForm, setOriginalStatusForm] = useState({ id: null as number | null, label: "" });
  const [originalCurrentStatusForm, setOriginalCurrentStatusForm] = useState({ id: null as number | null, label: "" });
  const [savingBracket, setSavingBracket] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingCurrentStatus, setSavingCurrentStatus] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: "bracket" | "civilStatus" | "currentStatus"; id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmBracketSave, setConfirmBracketSave] = useState(false);
  const [confirmStatusSave, setConfirmStatusSave] = useState(false);
  const [confirmCurrentStatusSave, setConfirmCurrentStatusSave] = useState(false);
  // Section switcher -- three standalone pill buttons (see render below),
  // same "moduling" as the Returns page's Pending/Released/Undone tabs, so
  // only one taxonomy's card is on screen at a time instead of three
  // stacked light cards competing for attention on one long page.
  const [activeTab, setActiveTab] = useState<"brackets" | "civil" | "current">("brackets");
  // Brief skeleton flash on every tab switch, same pattern as the Returns
  // page's Pending/Released/Undone tabs -- all three lists here are
  // already loaded together up front, so without this a tab click would
  // just swap content instantly instead of feeling like a transition.
  const [tabSwitching, setTabSwitching] = useState(false);
  const tabSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTab = (tab: "brackets" | "civil" | "current") => {
    setActiveTab(tab);
    setTabSwitching(true);
    if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
    tabSwitchTimer.current = setTimeout(() => setTabSwitching(false), 350);
  };
  useEffect(() => () => { if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [b, c, cs] = await Promise.all([
        fetch("/age-brackets", { headers: { Accept: "application/json" } }).then((r) => r.json()),
        fetch("/civil-statuses", { headers: { Accept: "application/json" } }).then((r) => r.json()),
        fetch("/current-statuses", { headers: { Accept: "application/json" } }).then((r) => r.json()),
      ]);
      setAgeBrackets(Array.isArray(b) ? b : []);
      setCivilStatuses(Array.isArray(c) ? c : []);
      setCurrentStatuses(Array.isArray(cs) ? cs : []);
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

  const resetBracketForm = () => {
    const empty = { id: null, label: "", min_age: "", max_age: "" };
    setBracketForm(empty);
    setOriginalBracketForm(empty);
  };
  const resetStatusForm = () => {
    const empty = { id: null, label: "" };
    setStatusForm(empty);
    setOriginalStatusForm(empty);
  };
  const resetCurrentStatusForm = () => {
    const empty = { id: null, label: "" };
    setCurrentStatusForm(empty);
    setOriginalCurrentStatusForm(empty);
  };
  const isBracketFormUnchanged =
    !!bracketForm.id &&
    bracketForm.label === originalBracketForm.label &&
    bracketForm.min_age === originalBracketForm.min_age &&
    bracketForm.max_age === originalBracketForm.max_age;
  const isStatusFormUnchanged =
    !!statusForm.id &&
    statusForm.label === originalStatusForm.label;
  const isCurrentStatusFormUnchanged =
    !!currentStatusForm.id &&
    currentStatusForm.label === originalCurrentStatusForm.label;

  // The form now carries noValidate (see below), so the browser's own
  // "please enter a valid value" bubble never fires for the age fields --
  // this is the app's own replacement, with an actual message instead of
  // the old silent no-op when a field was missing.
  const submitBracket = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bracketForm.label.trim()) {
      setError(t("bracketLabelRequiredError"));
      return;
    }
    if (!/^\d+$/.test(bracketForm.min_age.trim())) {
      setError(t("invalidMinAgeError"));
      return;
    }
    if (bracketForm.max_age.trim() !== "" && !/^\d+$/.test(bracketForm.max_age.trim())) {
      setError(t("invalidMaxAgeError"));
      return;
    }
    if (bracketForm.max_age.trim() !== "" && Number(bracketForm.max_age) < Number(bracketForm.min_age)) {
      setError(t("maxAgeLessThanMinError"));
      return;
    }

    setConfirmBracketSave(true);
  };

  const performSubmitBracket = async () => {
    setConfirmBracketSave(false);
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
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. an overlapping age
        // range) instead of a generic message.
        const data = await res.json().catch(() => null);
        const fieldError = data?.errors ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
        setError(data?.message || fieldError || t("saveAgeBracketFailed"));
        if (bracketForm.id) setBracketForm(originalBracketForm);
        return;
      }
      const wasEditing = !!bracketForm.id;
      resetBracketForm();
      load();
      setSuccessMessage(wasEditing ? t("ageBracketUpdatedSuccess") : t("ageBracketAddedSuccess"));
    } catch (e) {
      console.error("save age bracket:", e);
      setError(t("saveAgeBracketFailed"));
      // Revert to what's actually saved instead of leaving the rejected
      // edit sitting in the form.
      if (bracketForm.id) setBracketForm(originalBracketForm);
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
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. "currently in use by
        // a membership's eligibility rule") instead of a generic message.
        const data = await res.json().catch(() => null);
        setError(data?.message || t("deleteAgeBracketFailed"));
        return;
      }
      load();
      setSuccessMessage(t("ageBracketDeletedSuccess"));
    } catch (e) {
      console.error("delete age bracket:", e);
      setError(t("deleteAgeBracketFailed"));
    }
  };

  const submitStatus = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!statusForm.label.trim()) {
      setError(t("civilStatusLabelRequiredError"));
      return;
    }
    setConfirmStatusSave(true);
  };

  const performSubmitStatus = async () => {
    setConfirmStatusSave(false);
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
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. a duplicate label)
        // instead of a generic message.
        const data = await res.json().catch(() => null);
        const fieldError = data?.errors ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
        setError(data?.message || fieldError || t("saveCivilStatusFailed"));
        if (statusForm.id) setStatusForm(originalStatusForm);
        return;
      }
      const wasEditing = !!statusForm.id;
      resetStatusForm();
      load();
      setSuccessMessage(wasEditing ? t("civilStatusUpdatedSuccess") : t("civilStatusAddedSuccess"));
    } catch (e) {
      console.error("save civil status:", e);
      setError(t("saveCivilStatusFailed"));
      // Revert to what's actually saved instead of leaving the rejected
      // edit sitting in the form.
      if (statusForm.id) setStatusForm(originalStatusForm);
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
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. "currently in use")
        // instead of a generic message.
        const data = await res.json().catch(() => null);
        setError(data?.message || t("deleteCivilStatusFailed"));
        return;
      }
      load();
      setSuccessMessage(t("civilStatusDeletedSuccess"));
    } catch (e) {
      console.error("delete civil status:", e);
      setError(t("deleteCivilStatusFailed"));
    }
  };

  const submitCurrentStatus = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentStatusForm.label.trim()) {
      setError(t("currentStatusLabelRequiredError"));
      return;
    }
    setConfirmCurrentStatusSave(true);
  };

  const performSubmitCurrentStatus = async () => {
    setConfirmCurrentStatusSave(false);
    setSavingCurrentStatus(true);
    setError(null);
    try {
      const url = currentStatusForm.id ? `/current-statuses/${currentStatusForm.id}` : "/current-statuses";
      const method = currentStatusForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-XSRF-TOKEN": csrfToken(),
        },
        body: JSON.stringify({ label: currentStatusForm.label }),
      });
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. a duplicate label)
        // instead of a generic message.
        const data = await res.json().catch(() => null);
        const fieldError = data?.errors ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
        setError(data?.message || fieldError || t("saveCurrentStatusFailed"));
        if (currentStatusForm.id) setCurrentStatusForm(originalCurrentStatusForm);
        return;
      }
      const wasEditing = !!currentStatusForm.id;
      resetCurrentStatusForm();
      load();
      setSuccessMessage(wasEditing ? t("currentStatusUpdatedSuccess") : t("currentStatusAddedSuccess"));
    } catch (e) {
      console.error("save current status:", e);
      setError(t("saveCurrentStatusFailed"));
      // Revert to what's actually saved instead of leaving the rejected
      // edit sitting in the form.
      if (currentStatusForm.id) setCurrentStatusForm(originalCurrentStatusForm);
    } finally {
      setSavingCurrentStatus(false);
    }
  };

  const deleteCurrentStatus = async (id: number) => {
    try {
      const res = await fetch(`/current-statuses/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json", "X-XSRF-TOKEN": csrfToken() },
      });
      if (!res.ok) {
        // Surface the backend's specific reason (e.g. "currently in use")
        // instead of a generic message.
        const data = await res.json().catch(() => null);
        setError(data?.message || t("deleteCurrentStatusFailed"));
        return;
      }
      load();
      setSuccessMessage(t("currentStatusDeletedSuccess"));
    } catch (e) {
      console.error("delete current status:", e);
      setError(t("deleteCurrentStatusFailed"));
    }
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.type === "bracket") {
        await deleteBracket(pendingDelete.id);
      } else if (pendingDelete.type === "civilStatus") {
        await deleteStatus(pendingDelete.id);
      } else {
        await deleteCurrentStatus(pendingDelete.id);
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    /* Dark-navy "moduling" to match the Returns page: a full-bleed page
       background instead of the old light "paper" cards, with the three
       taxonomies switched between via pill tabs rather than stacked
       vertically, so this reads as one more module of the same system
       instead of a leftover light-themed settings screen. */
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("profilingSettingsTitle")}</h1>
          <p className="mt-1.5 text-[15px] text-white/50 max-w-2xl">{t("profilingSettingsSubtitle")}</p>
        </div>

        {/* Section switcher -- three standalone pill buttons, same pattern
            as the Returns page's Pending/Released/Undone switcher. Only
            one card is rendered at a time, so each taxonomy gets its own
            focused screen instead of competing for space with the other
            two. */}
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => switchTab("brackets")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${
              activeTab === "brackets"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Users2 className="h-4 w-4" />
            {t("ageBracketsTitle")}
            <span
              className={`inline-flex h-5 min-w-[1.375rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                activeTab === "brackets" ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
              }`}
            >
              {ageBrackets.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchTab("civil")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${
              activeTab === "civil"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Heart className="h-4 w-4" />
            {t("civilStatusesTitle")}
            <span
              className={`inline-flex h-5 min-w-[1.375rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                activeTab === "civil" ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
              }`}
            >
              {civilStatuses.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchTab("current")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${
              activeTab === "current"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Tag className="h-4 w-4" />
            {t("currentStatusesTitle")}
            <span
              className={`inline-flex h-5 min-w-[1.375rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                activeTab === "current" ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
              }`}
            >
              {currentStatuses.length}
            </span>
          </button>
        </div>

        {/* Age Brackets -- its own bordered card with a persistent header
            (icon + title + hint), only rendered while its pill above is
            active. Teal accent, matching the app's primary brand accent. */}
        {activeTab === "brackets" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-4 border-b border-white/10 flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15 text-[#7DD8CB]">
              <Users2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-bold text-white">{t("ageBracketsTitle")}</p>
              <p className="text-[13px] text-white/45">{t("ageBracketsDesc")}</p>
            </div>
          </div>

          {loading || tabSwitching ? (
            <div className="divide-y divide-white/[0.06]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 px-5 sm:px-6 py-3.5">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {ageBrackets.length > 0 && (
                <ul className="divide-y divide-white/[0.06]">
                  {ageBrackets.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3.5 px-5 sm:px-6 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 h-10 w-10 rounded-full bg-[#4FBEB0]/10 text-[#7DD8CB] flex items-center justify-center">
                          <Users2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-white truncate">{tc(b.label, language as any)}</p>
                          <p className="text-[13px] text-white/45">{b.min_age} - {b.max_age ?? "∞"} {t("yearsOldSuffix")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const initial = { id: b.id, label: b.label, min_age: String(b.min_age), max_age: b.max_age === null ? "" : String(b.max_age) };
                            setBracketForm(initial);
                            setOriginalBracketForm(initial);
                          }}
                          className="p-2 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
                          title={t("editLabel")}
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ type: "bracket", id: b.id, label: b.label })}
                          className="p-2 rounded-full text-white/50 hover:bg-red-500/10 hover:text-red-400 transition"
                          title={t("deleteTitle")}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitBracket} noValidate className="border-t border-white/10 p-4 sm:p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                  {bracketForm.id ? t("editAgeBracketLabel") : t("addAgeBracketLabel")}
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    value={bracketForm.label}
                    onChange={(e) => setBracketForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder={t("bracketLabelPlaceholder")}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                    required
                  />
                  {/* Our own stepper instead of the browser's native
                      <input type="number"> spinner -- the native arrows
                      follow the OS's own light/dark setting rather than
                      this page's theme, which is why they showed up barely
                      visible against the dark field. */}
                  <NumberStepper
                    fullWidth
                    min={0}
                    value={bracketForm.min_age}
                    onChange={(v) => setBracketForm((p) => ({ ...p, min_age: v }))}
                    placeholder={t("minAgePlaceholder")}
                    className="w-full rounded-full border border-white/10 bg-white/[0.04] pl-4 pr-7 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                  />
                  <NumberStepper
                    fullWidth
                    min={0}
                    value={bracketForm.max_age}
                    onChange={(v) => setBracketForm((p) => ({ ...p, max_age: v }))}
                    placeholder={t("maxAgeOpenEndedPlaceholder")}
                    className="w-full rounded-full border border-white/10 bg-white/[0.04] pl-4 pr-7 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  {bracketForm.id && (
                    <button type="button" onClick={resetBracketForm} className="px-5 py-2.5 rounded-full border border-white/15 text-white text-[15px] hover:bg-white/10 transition">
                      {t("cancelLabel")}
                    </button>
                  )}
                  <button type="submit" disabled={savingBracket || isBracketFormUnchanged} title={isBracketFormUnchanged ? t("noChangesToSaveHint") : undefined} className="inline-flex items-center gap-2 bg-sage-700 hover:bg-sage-800 text-white px-5 py-2.5 rounded-full text-[15px] font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sage-700 transition">
                    <Plus className="h-4 w-4" /> {bracketForm.id ? t("saveChanges") : t("addAgeBracketLabel")}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        )}

        {/* Civil Status -- same card/list/form pattern, gold accent to tell
            it apart from Age Brackets at a glance. */}
        {activeTab === "civil" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-4 border-b border-white/10 flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
              <Heart className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-bold text-white">{t("civilStatusesTitle")}</p>
              <p className="text-[13px] text-white/45">{t("civilStatusesDesc")}</p>
            </div>
          </div>

          {loading || tabSwitching ? (
            <div className="divide-y divide-white/[0.06]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 px-5 sm:px-6 py-3.5">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {civilStatuses.length > 0 && (
                <ul className="divide-y divide-white/[0.06]">
                  {civilStatuses.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3.5 px-5 sm:px-6 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 h-10 w-10 rounded-full bg-gold-400/10 text-gold-300 flex items-center justify-center">
                          <Heart className="h-4 w-4" />
                        </div>
                        <p className="text-[15px] font-semibold text-white truncate">{tc(s.label, language as any)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const initial = { id: s.id, label: s.label };
                            setStatusForm(initial);
                            setOriginalStatusForm(initial);
                          }}
                          className="p-2 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
                          title={t("editLabel")}
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ type: "civilStatus", id: s.id, label: s.label })}
                          className="p-2 rounded-full text-white/50 hover:bg-red-500/10 hover:text-red-400 transition"
                          title={t("deleteTitle")}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitStatus} noValidate className="border-t border-white/10 p-4 sm:p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                  {statusForm.id ? t("editCivilStatusLabel") : t("addCivilStatusLabel")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={statusForm.label}
                    onChange={(e) => setStatusForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder={t("statusLabelPlaceholder")}
                    className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold-400/20 focus:border-gold-400/50"
                    required
                  />
                  <div className="flex gap-2 justify-end">
                    {statusForm.id && (
                      <button type="button" onClick={resetStatusForm} className="px-5 py-2.5 rounded-full border border-white/15 text-white text-[15px] hover:bg-white/10 transition">
                        {t("cancelLabel")}
                      </button>
                    )}
                    <button type="submit" disabled={savingStatus || isStatusFormUnchanged} title={isStatusFormUnchanged ? t("noChangesToSaveHint") : undefined} className="inline-flex items-center gap-2 bg-sage-700 hover:bg-sage-800 text-white px-5 py-2.5 rounded-full text-[15px] font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sage-700 transition whitespace-nowrap">
                      <Plus className="h-4 w-4" /> {statusForm.id ? t("saveChanges") : t("addCivilStatusLabel")}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
        )}

        {/* Current Status -- same pattern again, sage accent (the app's
            third brand color) so all three tabs are visually distinct. */}
        {activeTab === "current" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-4 border-b border-white/10 flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-400/15 text-sage-300">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-bold text-white">{t("currentStatusesTitle")}</p>
              <p className="text-[13px] text-white/45">{t("currentStatusesDesc")}</p>
            </div>
          </div>

          {loading || tabSwitching ? (
            <div className="divide-y divide-white/[0.06]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 px-5 sm:px-6 py-3.5">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {currentStatuses.length > 0 && (
                <ul className="divide-y divide-white/[0.06]">
                  {currentStatuses.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3.5 px-5 sm:px-6 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 h-10 w-10 rounded-full bg-sage-400/10 text-sage-300 flex items-center justify-center">
                          <Tag className="h-4 w-4" />
                        </div>
                        <p className="text-[15px] font-semibold text-white truncate">{tc(s.label, language as any)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const initial = { id: s.id, label: s.label };
                            setCurrentStatusForm(initial);
                            setOriginalCurrentStatusForm(initial);
                          }}
                          className="p-2 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
                          title={t("editLabel")}
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ type: "currentStatus", id: s.id, label: s.label })}
                          className="p-2 rounded-full text-white/50 hover:bg-red-500/10 hover:text-red-400 transition"
                          title={t("deleteTitle")}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitCurrentStatus} noValidate className="border-t border-white/10 p-4 sm:p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-white/40">
                  {currentStatusForm.id ? t("editCurrentStatusLabel") : t("addCurrentStatusLabel")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={currentStatusForm.label}
                    onChange={(e) => setCurrentStatusForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder={t("currentStatusLabelPlaceholder")}
                    className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sage-400/20 focus:border-sage-400/50"
                    required
                  />
                  <div className="flex gap-2 justify-end">
                    {currentStatusForm.id && (
                      <button type="button" onClick={resetCurrentStatusForm} className="px-5 py-2.5 rounded-full border border-white/15 text-white text-[15px] hover:bg-white/10 transition">
                        {t("cancelLabel")}
                      </button>
                    )}
                    <button type="submit" disabled={savingCurrentStatus || isCurrentStatusFormUnchanged} title={isCurrentStatusFormUnchanged ? t("noChangesToSaveHint") : undefined} className="inline-flex items-center gap-2 bg-sage-700 hover:bg-sage-800 text-white px-5 py-2.5 rounded-full text-[15px] font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sage-700 transition whitespace-nowrap">
                      <Plus className="h-4 w-4" /> {currentStatusForm.id ? t("saveChanges") : t("addCurrentStatusLabel")}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
        )}

        <StatusModal open={!!successMessage} type="success" title={t("successTitle")} message={successMessage || ""} okLabel={t("okLabel")} onClose={() => setSuccessMessage(null)} />
        <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error || ""} okLabel={t("okLabel")} onClose={() => setError(null)} />

        <ConfirmDialog
          open={confirmBracketSave}
          icon={bracketForm.id ? <Pencil size={32} /> : <Plus size={32} />}
          title={bracketForm.id ? t("confirmUpdateAgeBracketTitle") : t("confirmAddAgeBracketTitle")}
          body={bracketForm.id ? t("confirmUpdateAgeBracketBody") : t("confirmAddAgeBracketBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={bracketForm.id ? t("yesUpdate") : t("yesAdd")}
          onCancel={() => setConfirmBracketSave(false)}
          onConfirm={performSubmitBracket}
        />

        <ConfirmDialog
          open={confirmStatusSave}
          icon={statusForm.id ? <Pencil size={32} /> : <Plus size={32} />}
          title={statusForm.id ? t("confirmUpdateCivilStatusTitle") : t("confirmAddCivilStatusTitle")}
          body={statusForm.id ? t("confirmUpdateCivilStatusBody") : t("confirmAddCivilStatusBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={statusForm.id ? t("yesUpdate") : t("yesAdd")}
          onCancel={() => setConfirmStatusSave(false)}
          onConfirm={performSubmitStatus}
        />

        <ConfirmDialog
          open={confirmCurrentStatusSave}
          icon={currentStatusForm.id ? <Pencil size={32} /> : <Plus size={32} />}
          title={currentStatusForm.id ? t("confirmUpdateCurrentStatusTitle") : t("confirmAddCurrentStatusTitle")}
          body={currentStatusForm.id ? t("confirmUpdateCurrentStatusBody") : t("confirmAddCurrentStatusBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={currentStatusForm.id ? t("yesUpdate") : t("yesAdd")}
          onCancel={() => setConfirmCurrentStatusSave(false)}
          onConfirm={performSubmitCurrentStatus}
        />

        {pendingDelete && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto">
              <div className="mb-4 text-red-400 flex justify-center"><svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
              <h3 className="text-xl font-bold text-red-400 mb-3">{t("confirmDeletionTitle")}</h3>
              <p className="text-[15px] text-white/50 mb-5">{t("moveToTrashConfirm")}</p>
              <div className="flex justify-center gap-4">
                <button onClick={() => setPendingDelete(null)} disabled={deleting} className="px-5 py-2.5 rounded-full border border-white/15 text-white hover:bg-white/10 transition disabled:opacity-60">{t("cancel")}</button>
                <button onClick={confirmPendingDelete} disabled={deleting} className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-60">{t("yesDeleteButton")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
