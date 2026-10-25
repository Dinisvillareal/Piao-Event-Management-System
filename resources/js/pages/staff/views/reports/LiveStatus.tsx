import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "../../../../i18n/LanguageContext";

/**
 * "● Live · Updated 12s ago  ⟳" -- shows the report is watching the data,
 * and lets staff refresh by hand. Owns its one-second clock so the big
 * report page doesn't re-render every second just to count seconds.
 */
export default function LiveStatus({
  lastSync,
  refreshing,
  failed,
  onRefresh,
}: {
  lastSync: number | null;
  refreshing: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sec = lastSync ? Math.max(0, Math.floor((now - lastSync) / 1000)) : null;
  const label =
    sec === null ? "" : sec < 5 ? t("updatedJustNowLabel") : sec < 60 ? t("updatedSecondsAgoLabel").replace("{n}", String(sec)) : t("updatedMinutesAgoLabel").replace("{n}", String(Math.floor(sec / 60)));

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-3.5 pr-1.5" role="status" aria-live="polite">
      <span className="relative flex h-2.5 w-2.5">
        {!failed && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${failed ? "bg-amber-400" : "bg-emerald-400"}`} />
      </span>
      <span className="text-[13px] font-semibold text-white/80">{t("rpLive")}</span>
      {label && <span className="hidden text-[13px] text-white/45 sm:inline">· {label}</span>}
      <button
        type="button"
        onClick={onRefresh}
        title={t("rpRefresh")}
        aria-label={t("rpRefresh")}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
