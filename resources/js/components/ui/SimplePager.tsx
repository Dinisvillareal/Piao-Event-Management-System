import { useLanguage } from "../../i18n/LanguageContext";
import PagerSkeleton from "./PagerSkeleton";

// The app's standard "Page x of y   ← 1 →" pager, as one reusable piece so a
// new list can match every other paginated page without copying markup.
export default function SimplePager({
  page,
  totalPages,
  onChange,
  className = "",
  loading = false,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
  loading?: boolean;
}) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;
  if (loading) return <PagerSkeleton withLabel className={className} />;
  const btn =
    "h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] transition-all active:scale-95";
  return (
    <div className={`flex flex-col sm:flex-row gap-3 justify-between items-center ${className}`}>
      <p className="text-sm text-white/45 text-center sm:text-left">
        {t("pageOfLabel")} {page} {t("ofPagesLabel")} {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className={btn} aria-label="Previous page">←</button>
        <span className="h-8 w-8 rounded-full bg-sage-700 text-white shadow-sm flex items-center justify-center text-sm font-bold">{page}</span>
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={btn} aria-label="Next page">→</button>
      </div>
    </div>
  );
}
