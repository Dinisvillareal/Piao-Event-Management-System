import React, { useEffect, useState } from "react";
import { Wallet, Plus, X, AlertTriangle } from "lucide-react";
import SearchBar from "../../../Components/UI/SearchBar";
import api, { apiErrorMessage } from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";

interface EventOption {
  id: number | string;
  title: string;
  date?: string;
}

interface ExpenseSummary {
  approved_budget: number | null;
  total_expenses: number;
  is_over_budget: boolean;
  expenses: { id: number; item: string; amount: string | number; notes: string | null; created_at: string }[];
}

/**
 * UC-8: Record Event Budget and Expenses. Each event is a progress-bar
 * card (budget vs. spent) rather than a spreadsheet — the thing staff need
 * at a glance is "are we over budget", not a raw ledger.
 */
export default function BudgetView({ allEvents = [] }: { allEvents?: EventOption[] }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [form, setForm] = useState({ item: "", amount: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  const filteredEvents = allEvents.filter((e) => e.title?.toLowerCase().includes(search.toLowerCase()));

  const loadSummary = async (eventId: string | number) => {
    setLoadingSummary(true);
    try {
      const res = await api.get(`/events/${eventId}/expenses`);
      setSummary(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadBudgetFailed")));
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) loadSummary(selectedEventId);
  }, [selectedEventId]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) return;
    setError(null);
    try {
      await api.post(`/events/${selectedEventId}/expenses`, {
        item: form.item,
        amount: form.amount,
        notes: form.notes || undefined,
      });
      setForm({ item: "", amount: "", notes: "" });
      loadSummary(selectedEventId);
    } catch (e) {
      setError(apiErrorMessage(e, t("recordExpenseFailed")));
    }
  };

  const spentPct = summary?.approved_budget
    ? Math.min(100, (summary.total_expenses / Number(summary.approved_budget)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("budget")}</h1>
        <p className="mt-1 text-sm text-[#667777]">{t("budgetSubtitle")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-4">
          <SearchBar value={search} onChange={setSearch} placeholder={t("searchEventsPlaceholderShort")} />
          <div className="mt-3 max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">{t("noEventsFound")}</p>
            ) : (
              filteredEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEventId(String(e.id))}
                  className={`w-full text-left rounded-2xl px-4 py-3 transition ${
                    String(selectedEventId) === String(e.id)
                      ? "bg-[#005f63] text-white shadow-md"
                      : "bg-gray-50 text-gray-700 hover:bg-teal-50"
                  }`}
                >
                  <p className="font-semibold text-sm truncate">{e.title}</p>
                  {e.date && <p className="text-xs opacity-70">{e.date}</p>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#ddd5ca] bg-white p-5">
          {!selectedEventId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-16">
              <Wallet className="h-10 w-10 mb-3" />
              <p>{t("selectEventToViewBudget")}</p>
            </div>
          ) : loadingSummary || !summary ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <div className="space-y-5">
              {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</div>}

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">
                    ₱{summary.total_expenses.toLocaleString()} {t("spentOf")}
                    {summary.approved_budget !== null && ` ${t("ofLabel")} ₱${Number(summary.approved_budget).toLocaleString()}`}
                  </span>
                  {summary.is_over_budget && (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {t("overBudget")}
                    </span>
                  )}
                </div>
                {summary.approved_budget !== null && (
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full transition-all ${summary.is_over_budget ? "bg-red-500" : "bg-[#3ec5c5]"}`}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                )}
                {summary.approved_budget === null && (
                  <p className="text-xs text-gray-400 italic">{t("noApprovedBudgetYet")}</p>
                )}
              </div>

              <form onSubmit={handleAddExpense} className="grid sm:grid-cols-[1fr_140px_auto] gap-2">
                <input required value={form.item} onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))} placeholder={t("itemExpenseDescPlaceholder")} className="rounded-full border border-gray-200 px-4 py-2 text-sm" />
                <input required type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder={t("amountPlaceholder")} className="rounded-full border border-gray-200 px-4 py-2 text-sm" />
                <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white px-4 py-2 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> {t("addLabel")}
                </button>
              </form>

              <div className="max-h-[35vh] overflow-y-auto space-y-2">
                {summary.expenses.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-6 text-center">{t("noExpensesRecorded")}</p>
                ) : (
                  summary.expenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{exp.item}</p>
                        {exp.notes && <p className="text-xs text-gray-500 truncate">{exp.notes}</p>}
                      </div>
                      <span className="text-sm font-bold text-[#005f63] shrink-0 ml-3">₱{Number(exp.amount).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
