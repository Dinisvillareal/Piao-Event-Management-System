import { useEffect, useState } from "react";
import Skeleton from "./Skeleton";

/**
 * Page-open skeleton for the gradient KPI strips at the top of the staff
 * pages (Budget, Inventory, Returns, Activity Logs, Archive). Same dark
 * card shape as the real cards so nothing jumps when the numbers land.
 */
export default function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/**
 * True from the moment a page opens until its first data load has finished
 * AND a short minimum has passed (so a fast response doesn't flash the
 * skeleton for a single frame). Once it flips to false it stays false --
 * later background refreshes or polls never bring the skeleton back.
 */
export function usePageOpenSkeleton(dataLoading: boolean, minMs = 450): boolean {
  const [minElapsed, setMinElapsed] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), minMs);
    return () => clearTimeout(id);
  }, [minMs]);
  useEffect(() => {
    if (!dataLoading) setLoadedOnce(true);
  }, [dataLoading]);
  return !(minElapsed && loadedOnce);
}
