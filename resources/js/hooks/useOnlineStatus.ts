import { useEffect, useState } from "react";

/**
 * Adviser recommendation: "Piao has slow/limited connectivity — include
 * offline functionality too." This hook is the single source of truth for
 * "are we online right now" across the app (offline banner, disabling
 * network-only actions, deciding when to flush the queued-scan sync).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
