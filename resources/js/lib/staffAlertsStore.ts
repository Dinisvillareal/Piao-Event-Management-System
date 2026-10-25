import { useSyncExternalStore } from "react";

// One shared unread count for the staff feedback alerts. The bell is the only
// thing that polls the server; the sidebar badge and the Notifications page
// tab just read this, so all three always agree.
let unread = 0;
const listeners = new Set<() => void>();

export const setStaffAlertsUnread = (n: number) => {
  if (n === unread) return;
  unread = n;
  listeners.forEach((l) => l());
};

export function useStaffAlertsUnread(): number {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => unread,
    () => 0
  );
}

// Anything that changes alerts outside the bell (marking read on the page)
// calls this so the bell re-polls straight away.
export const STAFF_ALERTS_CHANGED = "staff:alerts-changed";
export const notifyStaffAlertsChanged = () => window.dispatchEvent(new Event(STAFF_ALERTS_CHANGED));

// Unread SECURITY alerts (staff changes, resets, lockouts...). They ride on
// the same bell poll, so this is only ever set from there.
let securityUnread = 0;
const securityListeners = new Set<() => void>();

export const setSecurityUnread = (n: number) => {
  if (n === securityUnread) return;
  securityUnread = n;
  securityListeners.forEach((l) => l());
};

export function useSecurityUnread(): number {
  return useSyncExternalStore(
    (cb) => { securityListeners.add(cb); return () => { securityListeners.delete(cb); }; },
    () => securityUnread,
    () => 0
  );
}
