import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCheck, Filter, MessageSquareText, Star } from "lucide-react";
import api from "../../../lib/api";
import SearchBar from "../../../components/ui/SearchBar";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";
import { notifyStaffAlertsChanged, STAFF_ALERTS_CHANGED, useStaffAlertsUnread } from "../../../lib/staffAlertsStore";
import { RatingOrReason } from "./NotificationBell";
import type { StaffAlert } from "./NotificationBell";

// The Notifications page's "Feedback" tab: the full, searchable history of the
// feedback members sent, next to the live bell. Server-paginated and filtered.

const PER_PAGE = 10;

const initialsOf = (title: string) => {
  const parts = title.replace(/\s+(sent feedback|updated their feedback|sent a reason for not attending|liked your reply on their (?:feedback|response))$/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

export default function FeedbackAlertsPanel() {
  const { t, locale } = useLanguage();
  const unread = useStaffAlertsUnread();
  const [rows, setRows] = useState<StaffAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState<"all" | "rating" | "absence">("all");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const reqRef = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const id = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const res = await api.get("/staff/alerts/all", {
        params: {
          page, per_page: PER_PAGE,
          search: search.trim() || undefined,
          kind: kind !== "all" ? kind : undefined,
          rating: kind !== "absence" && rating !== "all" ? rating : undefined,
          unread: status === "unread" ? 1 : undefined,
        },
      });
      if (id !== reqRef.current) return;
      setRows(res.data.data ?? []);
      setLastPage(res.data.last_page ?? 1);
      setTotal(res.data.total ?? 0);
    } catch {
      if (id === reqRef.current && !quiet) { setRows([]); setTotal(0); }
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [page, search, rating, status, kind]);

  // Any filter change goes back to page 1.
  useEffect(() => { setPage(1); }, [search, rating, status, kind]);

  // Debounce typing, load immediately otherwise.
  useEffect(() => {
    const h = window.setTimeout(() => load(), search ? 250 : 0);
    return () => window.clearTimeout(h);
  }, [load, search]);

  // The list stays live: a new feedback (or a read-state change) refreshes it quietly.
  useEffect(() => {
    const refresh = () => load(true);
    window.addEventListener("staff:feedback-received", refresh);
    window.addEventListener(STAFF_ALERTS_CHANGED, refresh);
    return () => {
      window.removeEventListener("staff:feedback-received", refresh);
      window.removeEventListener(STAFF_ALERTS_CHANGED, refresh);
    };
  }, [load]);

  const markRead = async (a: StaffAlert) => {
    if (a.read) return;
    setRows((prev) => prev.map((x) => (x.id === a.id ? { ...x, read: true } : x)));
    try { await api.put(`/staff/alerts/${a.id}/read`); } finally { notifyStaffAlertsChanged(); }
  };
  const markAll = async () => {
    setRows((prev) => prev.map((x) => ({ ...x, read: true })));
    try { await api.put("/staff/alerts/read-all"); } finally { notifyStaffAlertsChanged(); }
  };
  const open = (a: StaffAlert) => {
    markRead(a);
    if (a.event_id) window.dispatchEvent(new CustomEvent("staff:open-event", { detail: { eventId: a.event_id, tab: "feedback", sub: a.absence_reason || a.kind === "absence" ? "reasons" : "ratings" } }));
  };

  const ratingOptions = [
    { value: "all", label: t("alertsAllRatings") },
    ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: t("alertsStarsOption").replace("{n}", String(n)) })),
  ];
  const kindOptions = [
    { value: "all", label: t("alertsAllTypes") },
    { value: "rating", label: t("absTabRatings") },
    { value: "absence", label: t("absTabReasons") },
  ];
  const statusOptions = [
    { value: "all", label: t("alertsAllStatus") },
    { value: "unread", label: t("alertsUnreadOnly") },
  ];
  const subject = (a: StaffAlert) => a.title.replace(/\s+(sent feedback|updated their feedback|sent a reason for not attending|liked your reply on their (?:feedback|response))$/i, "");
  const verb = (a: StaffAlert) => (/liked your reply on their/i.test(a.title) ? t("alertLikedReplyVerb") : /not attending$/i.test(a.title) ? t("alertAbsentVerb") : /updated their feedback$/i.test(a.title) ? t("alertUpdatedVerb") : t("alertSentVerb"));

  return (
    // Same layout as the other tabs: search, count and pagination stay put
    // (static) and only the list below scrolls.
    <div className="lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="shrink-0">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <SearchBar value={search} onChange={setSearch} placeholder={t("alertsSearchPlaceholder")} dark />
          </div>
          <FilterDropdown
            value={kind}
            onChange={(v) => setKind(v as "all" | "rating" | "absence")}
            options={kindOptions}
            className="h-11 pl-10 pr-8 shrink-0"
            icon={<MessageSquareText className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
            dark
          />
          {kind !== "absence" && (<FilterDropdown
            value={rating}
            onChange={setRating}
            options={ratingOptions}
            className="h-11 pl-10 pr-8 shrink-0"
            icon={<Star className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
            dark
          />)}
          <FilterDropdown
            value={status}
            onChange={setStatus}
            options={statusOptions}
            className="h-11 pl-10 pr-8 shrink-0"
            icon={<Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4FBEB0] pointer-events-none" />}
            dark
          />
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4 text-[#7DD8CB]" />
            {t("alertsMarkAll")}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-white/40">{loading ? 0 : total} {t("alertsFoundCount")} — {t("showingLabel")} {PER_PAGE} {t("perPage")}</p>
      <div className="mt-4 flex h-8 justify-end">
        {lastPage > 1 && !loading && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">←</button>
            <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-semibold">{page}</span>
            <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95">→</button>
          </div>
        )}
      </div>
      </div>

      <div className="mt-4 space-y-3 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-white/50">
            <MessageSquareText size={40} className="mx-auto mb-3 text-white/20" />
            <p className="font-semibold text-white">{t("alertsEmpty")}</p>
            <p className="mt-1 text-sm">{t("alertsEmptyHint")}</p>
          </div>
        ) : (
          rows.map((a) => (
            <div
              key={a.id}
              role={a.event_id ? "button" : undefined}
              tabIndex={a.event_id ? 0 : undefined}
              onClick={a.event_id ? () => open(a) : undefined}
              onKeyDown={a.event_id ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(a); } } : undefined}
              className={`flex flex-col gap-4 rounded-2xl border border-l-4 border-l-gold-400 p-4 sm:flex-row sm:items-start sm:p-5 ${a.event_id ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40" : ""} transition-all duration-250 ease-out hover:shadow-[0_16px_28px_-8px_rgba(0,0,0,0.35)] hover:-translate-y-1 hover:bg-white/[0.07] active:translate-y-0 active:scale-[0.985] active:shadow-none active:duration-100 ${a.read ? "border-white/10 bg-white/[0.03]" : "border-[#4FBEB0]/30 bg-[#4FBEB0]/[0.06]"}`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4FBEB0]/40 to-gold-400/30 text-base font-bold text-white">
                {initialsOf(a.title)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[15px] text-white">
                    <span className="font-bold">{subject(a)}</span> {verb(a)}
                    {a.event_name && <> {t("alertOn")} <span className="font-semibold">{a.event_name}</span></>}
                  </p>
                  {!a.read && <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-label={t("alertsTabUnread")} />}
                </div>
                <div className="mt-1.5 flex items-center gap-0.5">
                  <RatingOrReason a={a} />
                </div>
                <p className={`mt-2 text-sm ${a.comment ? "text-white/80" : "italic text-white/40"}`}>
                  {a.comment ? <>&ldquo;{a.comment}&rdquo;</> : t("alertsNoComment")}
                </p>
                <p className="mt-2 text-xs text-white/40">
                  {new Date(a.created_at).toLocaleString(locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
                {!a.read && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); markRead(a); }} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/[0.1] hover:text-white">
                    <CheckCheck className="h-4 w-4" />
                    {t("alertsMarkRead")}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
