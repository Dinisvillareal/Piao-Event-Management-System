import { useEffect, useState } from "react";

/**
 * The barangay's current Captain and Secretary, as named on their resident
 * records (Residents -> Barangay Position). Names come back already formatted
 * for paperwork, e.g. "HON. LIBRADO T. MAGCANTA, JR.", so reports and the ID
 * card never hard-code anyone.
 */
export type BarangayOfficial = { id: number; user_code: string; name: string; title: string } | null;
export type BarangayOfficials = { captain: BarangayOfficial; secretary: BarangayOfficial };

export const NO_OFFICIALS: BarangayOfficials = { captain: null, secretary: null };

/** Fired after a resident's post changes so open pages refresh their signature names. */
export const OFFICIALS_CHANGED_EVENT = "barangay-officials-changed";

export async function fetchBarangayOfficials(): Promise<BarangayOfficials> {
  try {
    const res = await fetch("/barangay-officials", {
      credentials: "include",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) return NO_OFFICIALS;
    const data = await res.json();
    return { captain: data?.captain ?? null, secretary: data?.secretary ?? null };
  } catch {
    return NO_OFFICIALS;
  }
}

export function useBarangayOfficials(): BarangayOfficials {
  const [officials, setOfficials] = useState<BarangayOfficials>(NO_OFFICIALS);

  useEffect(() => {
    let alive = true;
    const load = () => fetchBarangayOfficials().then((o) => { if (alive) setOfficials(o); });
    load();
    window.addEventListener(OFFICIALS_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(OFFICIALS_CHANGED_EVENT, load);
    };
  }, []);

  return officials;
}
