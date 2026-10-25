// Single source of truth for the staff portal's URLs, mirroring the resident
// portal's "/member/<page>" scheme (see memberRoutes.ts): every staff page
// lives under "/admin/<friendly-path>". `key` is the internal page id the
// sidebar and views use; `path` is what shows in the address bar. To add a
// page, add one line here (and its nav entry in the Sidebar).
export const STAFF_ROUTES = [
  { key: "dashboard", path: "dashboard" },
  { key: "scan", path: "scan" },
  { key: "residents", path: "residents" },
  { key: "households", path: "households" },
  { key: "memberships", path: "memberships" },
  { key: "events", path: "events" },
  { key: "notify", path: "notifications" },
  { key: "reports", path: "reports" },
  { key: "inventory", path: "inventory" },
  { key: "budget", path: "budget" },
  { key: "returns", path: "returns" },
  { key: "activitylogs", path: "activity-logs" },
  { key: "archive", path: "archive" },
  { key: "profiling", path: "age-status-categories" },
  { key: "integrations", path: "integrations" },
  { key: "feedbackrules", path: "feedback-rules" },
  { key: "myaccount", path: "my-account" },
  { key: "staffaccounts", path: "staff-accounts" },
] as const;

export const STAFF_BASE = "/admin";

/** Friendly URL segment for a page key, e.g. "notify" -> "notifications". */
export function staffPathFor(key: string): string {
  const hit = STAFF_ROUTES.find((r) => r.key === key);
  return hit ? hit.path : "dashboard";
}

/** Page key for a pathname like "/admin/notifications". Also resolves the
 *  internal key ("/admin/notify") so older bookmarks keep working. Falls back
 *  to "dashboard" for anything unknown. */
export function staffKeyFromPath(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() || "";
  const hit = STAFF_ROUTES.find((r) => r.path === last || r.key === last);
  return hit ? hit.key : "dashboard";
}

/** Full URL for a page key, e.g. "notify" -> "/admin/notifications". */
export function staffUrlFor(key: string): string {
  return `${STAFF_BASE}/${staffPathFor(key)}`;
}
