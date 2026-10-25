import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side paging for a list that is already in memory. `go` changes the
 * page and raises `switching` for ~350ms, so the list and the pager can show
 * the same skeleton every other paginated page flashes on Next / Previous.
 */
export default function usePager<T>(items: T[], pageSize: number, ms = 350, resetKey?: string) {
  const [page, setPage] = useState(1);
  const [switching, setSwitching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const shown = items.slice((current - 1) * pageSize, current * pageSize);

  const go = useCallback((next: number) => {
    setPage(next);
    setSwitching(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSwitching(false), ms);
  }, [ms]);

  // A new filter / search / sort starts again from page 1.
  useEffect(() => { setPage(1); }, [resetKey]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { page: current, totalPages, shown, switching, go };
}
