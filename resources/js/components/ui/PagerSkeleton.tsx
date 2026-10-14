import Skeleton from "./Skeleton";

/**
 * Stand-in for the round "← 1 →" pager while a page is loading / switching:
 * same footprint (three 32px circles, 8px gap). Pass the wrapper's own
 * spacing/alignment through `className` so it sits exactly where the real
 * pager does, and `withLabel` for the pagers that carry a "Page x of y" line
 * on the left.
 */
export default function PagerSkeleton({
  className = "",
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const circles = (
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  );
  if (withLabel) {
    return (
      <div className={`flex items-center justify-between gap-3 ${className}`} aria-hidden="true">
        <Skeleton className="h-4 w-44" />
        {circles}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      {circles}
    </div>
  );
}
