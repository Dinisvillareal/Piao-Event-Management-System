import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

/**
 * Shown on a dashboard when one of its data feeds could not be refreshed. The page keeps the
 * last numbers it received (rather than blanking them to zero) and says so here, with a button
 * to try again. While the device is offline the app-wide offline banner already explains why,
 * so this stays out of the way.
 */
export default function FeedWarning({
  failedCount,
  lastOkAt,
  onRetry,
  retrying = false,
}: {
  failedCount: number;
  lastOkAt: Date;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t, locale } = useLanguage();
  const online = useOnlineStatus();
  if (failedCount === 0 || !online) return null;

  const time = lastOkAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-500/30 bg-gold-500/[0.08] px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gold-300">{t("dashFeedWarnTitle")}</p>
          <p className="mt-0.5 text-xs text-white/60">{t("dashFeedWarnBody").replace("{time}", time)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? t("dashFeedRetrying") : t("dashFeedRetry")}
      </button>
    </div>
  );
}
