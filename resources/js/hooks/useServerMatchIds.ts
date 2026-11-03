import { useEffect, useState } from "react";
import api from "../lib/api";

/**
 * Lets a small in-memory pick list use the server's search: while `query` is empty it returns
 * null (show everything); otherwise it asks `endpoint` (a paged list route) which records match
 * and returns their ids, so the list can be narrowed to those. Debounced; stale answers ignored.
 */
export default function useServerMatchIds(endpoint: string, query: string, params: Record<string, unknown> = {}): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const extra = JSON.stringify(params);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setIds(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(endpoint, { params: { paged: 1, search: q, per_page: 100, ...JSON.parse(extra) } });
        const rows = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
        if (!cancelled) setIds(new Set(rows.map((r: any) => String(r.id))));
      } catch {
        if (!cancelled) setIds(new Set());
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [endpoint, query, extra]);
  return ids;
}
