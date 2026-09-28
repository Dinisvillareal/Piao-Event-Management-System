import { WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
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
  // A queued scan the server permanently rejected on replay (already
  // recorded from an earlier attempt, no longer eligible, window closed) --
  // flushQueue() now drops these from the queue instead of retrying them
  // forever, but that means someone needs to be told the scan never made it
  // in, instead of it just silently vanishing.
  const [justRejected, setJustRejected] = useState<number | null>(null);

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
    flushQueue().then(({ synced, rejected }) => {
      setSyncing(false);
      setPending(queueLength());
      if (synced > 0) {
        setJustSynced(synced);
        setTimeout(() => setJustSynced(null), 4000);
      }
      if (rejected > 0) {
        setJustRejected(rejected);
        setTimeout(() => setJustRejected(null), 6000);
      }
    });
  }, [isOnline]);

  if (isOnline && pending === 0 && justSynced === null && justRejected === null) return null;

  if (!isOnline) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-orange-500 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
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
      <div className="print:hidden flex items-center gap-2 bg-[#005f63] text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>Back online — syncing {pending} queued scan(s)...</span>
      </div>
    );
  }

  // Shown ahead of the plain "synced" toast below -- a rejected scan means a
  // resident's attendance did NOT make it in, which needs to stand out more
  // than a routine success message, even if other scans in the same batch
  // synced fine.
  if (justRejected) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-amber-600 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {justRejected} queued scan{justRejected > 1 ? "s" : ""} couldn't be synced (already recorded, or no longer eligible for that event) — check the event's attendance roster.
          {justSynced ? ` ${justSynced} other scan${justSynced > 1 ? "s" : ""} synced successfully.` : ""}
        </span>
      </div>
    );
  }

  if (justSynced) {
    return (
      <div className="print:hidden flex items-center gap-2 bg-teal-600 text-white text-xs sm:text-sm font-medium px-4 py-2 justify-center">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span>Synced {justSynced} queued scan(s) successfully.</span>
      </div>
    );
  }

  return null;
}
