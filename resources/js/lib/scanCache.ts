/**
 * Offline copy of the few lists the Scan screen needs (who can be checked in, and
 * which events are open), so Manual / Physical ID check-in keeps working with no
 * internet. Only what is needed to recognise a person and decide eligibility is kept:
 * ID code, name, role and membership names -- no contact number, address, birth date or
 * ID photo. Everything is wiped on logout (the sign-out code clears localStorage) and a
 * copy older than a week is ignored.
 */
const PREFIX = "piao_scan_cache_v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveScanCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch { /* storage full or blocked -- the live list still works */ }
}

export function loadScanCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt) > MAX_AGE_MS) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

/** The smallest resident record the Scan screen needs. */
export function slimResident(r: any) {
  return {
    id: r.id ?? r.user_id,
    user_id: r.user_id ?? r.id,
    user_code: r.user_code,
    first_name: r.first_name,
    middle_name: r.middle_name,
    last_name: r.last_name,
    suffix: r.suffix,
    role: r.role,
    memberships: Array.isArray(r.memberships)
      ? r.memberships.map((m: any) => ({ id: m?.id, name: m?.name ?? m }))
      : [],
  };
}
