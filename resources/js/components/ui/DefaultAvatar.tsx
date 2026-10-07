import { useId } from "react";

/**
 * Generic "no photo" avatar: a grey disc with a white head-and-shoulders
 * silhouette. Used wherever a signed-in user is shown without a profile
 * picture, instead of falling back to their initials.
 */
export default function DefaultAvatar({ className = "h-8 w-8", title }: { className?: string; title?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 rounded-full ${className}`} role="img" aria-label={title ?? "User avatar"}>
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="45.5" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill="#9A9A9A" />
      <circle cx="50" cy="44" r="17.5" fill="#FFFFFF" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M21.5 95 V80 Q21.5 67 36 67 H64 Q78.5 67 78.5 80 V95 Z" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
