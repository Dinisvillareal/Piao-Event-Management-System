import { useEffect, useRef, useState } from "react";

/**
 * True for a short moment after any of `deps` (filters, search text, date
 * pickers...) changes -- never on first mount. Views OR it into their
 * existing `pageSwitching` flag so a filter change flashes the same skeleton
 * a page change does. While someone is still typing, the timer keeps
 * restarting, so the skeleton stays up until ~350ms after the last change.
 */
export default function useFilterSwitching(deps: unknown[], ms = 350): boolean {
  const key = JSON.stringify(deps);
  const prev = useRef(key);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    setSwitching(true);
    const timer = setTimeout(() => setSwitching(false), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);

  return switching;
}
