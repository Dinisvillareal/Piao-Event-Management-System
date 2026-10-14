// Single source of truth for the resident portal's URLs, mirroring the staff
// portal's "/admin/<page>" scheme: every member page lives under
// "/member/<friendly-path>". `key` is the internal page id the sidebar and
// views use; `path` is what shows in the address bar.
export const MEMBER_ROUTES = [
  { key: "dashboard", path: "dashboard" },
  { key: "qr", path: "qr-code" },
  { key: "attendance", path: "attendance" },
  { key: "events", path: "events" },
  { key: "notify", path: "notifications" },
  { key: "settings", path: "settings" },
] as const;

export const MEMBER_BASE = "/member";

/** Page key for a pathname like "/member/notifications". Also resolves the
 *  old bare URLs ("/attendance", "/notify", "/") so bookmarks keep working.
 *  Falls back to "dashboard" for anything unknown. */
export function memberKeyFromPath(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() || "";
  const hit = MEMBER_ROUTES.find((r) => r.path === last || r.key === last);
  return hit ? hit.key : "dashboard";
}

/** Full URL for a page key, e.g. "notify" -> "/member/notifications". */
export function memberUrlFor(key: string): string {
  const hit = MEMBER_ROUTES.find((r) => r.key === key);
  return `${MEMBER_BASE}/${hit ? hit.path : "dashboard"}`;
}
