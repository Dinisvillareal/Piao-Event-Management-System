import { WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { flushQueue, queueLength, getRejected, clearRejected, type RejectedScan } from "../../lib/offlineQueue";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Adviser recommendation: "Piao has slow/limited connectivity — include
 * offline functionality too." Shown app-wide (both Staff and Member shells)
 * so nobody is left guessing why a save "isn't working" — and reports how
 * many QR scans are queued locally waiting to sync once back online.
 */
export default function OfflineBanner() {
  const { t } = useLanguage();
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState<number | null>(null);
  // A queued scan the server permanently rejected on replay (already
  // recorded from an earlier attempt, no longer eligible, window closed) --
  // flushQueue() now drops these from the queue instead of retrying them
  // forever, but that means someone needs to be told the scan never made it
  // in, instead of it just silently vanishing.
  // Kept (and shown) until dismissed, so a refused scan can never vanish in a few seconds.
  const [rejected, setRejected] = useState<RejectedScan[]>(() => getRejected());

  useEffect(() => {
    setPending(queueLength());
    const interval = setInterval(() => setPending(queueLength()), 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    const current = queueLength();
    if (current === 0) return;

    setSyncing(true);
    flushQueue().then(({ synced, rejected: rejectedCount }) => {
      setSyncing(false);
      setPending(queueLength());
      if (synced > 0) {
        setJustSynced(synced);
        setTimeout(() => setJustSynced(null), 4000);
      }
      if (rejectedCount > 0) setRejected(getRejected());
    });
  }, [isOnline]);

  if (isOnline && pending === 0 && justSynced === null && rejected.length === 0) return null;

  if (!isOnline) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-orange-500 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          {t("uiOfflineBanner")}
          {pending > 0 ? ` (${t("uiPendingCount").replace("{n}", String(pending))})` : ""}.
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-[#005f63] text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>{t("uiSyncing").replace("{n}", String(pending))}</span>
      </div>
    );
  }

  // Shown ahead of the plain "synced" toast below -- a refused scan means a resident's attendance did NOT
  // make it in, so it stays on screen, with who and why, until staff dismiss it.
  if (rejected.length > 0) {
    const shown = rejected.slice(-3);
    return (
      <div className="print:hidden bg-amber-600 text-white text-xs sm:text-sm font-medium px-4 py-2" role="alert">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {t("uiScansRejected").replace("{n}", String(rejected.length))}
            {justSynced ? ` ${t("uiOtherScansSynced").replace("{n}", String(justSynced))}` : ""}
          </span>
          <button
            type="button"
            onClick={() => { clearRejected(); setRejected([]); }}
            className="rounded-full border border-white/60 px-3 py-0.5 text-xs font-semibold hover:bg-white/15"
          >
            {t("uiDismiss")}
          </button>
        </div>
        <ul className="mt-1 text-center text-[11px] font-normal text-white/90">
          {shown.map((r) => (
            <li key={r.localId}>
              {r.residentName}
              {r.reason ? ` — ${r.reason}` : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (justSynced) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-teal-600 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span>{t("uiSynced").replace("{n}", String(justSynced))}</span>
      </div>
    );
  }

  return null;
}
