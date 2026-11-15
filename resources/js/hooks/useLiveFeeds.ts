import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `callback` every `intervalMs`, but only while the tab is actually on screen.
 * A dashboard left open in a background tab used to keep hitting the server (and a phone's
 * battery) all day. When the tab comes back to the front, or the connection returns, it
 * refreshes straight away instead of showing numbers that went stale while it was hidden.
 */
export function useVisiblePoll(callback: () => void, intervalMs: number, enabled = true): void {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const timer = setInterval(() => { if (visible()) latest.current(); }, intervalMs);
    const onVisibility = () => { if (visible()) latest.current(); };
    const onOnline = () => latest.current();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [intervalMs, enabled]);
}

/**
 * Remembers which of a page's data feeds failed on their last try, and when the page last had
 * every feed in good order. A feed reports `report(name, ok)`; after a whole refresh round the
 * page calls `completeCycle()`, which moves "last updated" forward only if nothing failed -- so
 * a page never claims "synced just now" while a feed is actually down.
 */
export function useFeedHealth() {
  const failed = useRef<Set<string>>(new Set());
  const [failedCount, setFailedCount] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<Date>(() => new Date());

  const report = useCallback((feed: string, ok: boolean) => {
    if (ok) failed.current.delete(feed);
    else failed.current.add(feed);
    setFailedCount(failed.current.size);
  }, []);

  const completeCycle = useCallback(() => {
    if (failed.current.size === 0) setLastOkAt(new Date());
  }, []);

  return { failedCount, lastOkAt, report, completeCycle };
}
