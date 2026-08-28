import { WifiOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { flushQueue, queueLength } from "../../lib/offlineQueue";

/**
 * Adviser recommendation: "Piao has slow/limited connectivity — include
 * offline functionality too." Shown app-wide (both Staff and Member shells)
 * so nobody is left guessing why a save "isn't working" — and reports how
 * many QR scans are queued locally waiting to sync once back online.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState<number | null>(null);

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
    flushQueue().then(({ synced }) => {
      setSyncing(false);
      setPending(queueLength());
      if (synced > 0) {
        setJustSynced(synced);
        setTimeout(() => setJustSynced(null), 4000);
      }
    });
  }, [isOnline]);

  if (isOnline && pending === 0 && justSynced === null) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 bg-orange-500 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          You're offline — QR scans keep working and will sync automatically once you're back online
          {pending > 0 ? ` (${pending} pending)` : ""}.
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="flex items-center gap-2 bg-[#005f63] text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>Back online — syncing {pending} queued scan(s)...</span>
      </div>
    );
  }

  if (justSynced) {
    return (
      <div className="flex items-center gap-2 bg-teal-600 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span>Synced {justSynced} queued scan(s) successfully.</span>
      </div>
    );
  }

  return null;
}
