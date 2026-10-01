// Shared loading placeholder -- a softly pulsing block shaped like the
// content it's standing in for (a bar of text, a circular avatar, a card),
// used everywhere the app used to show a plain spinner while data loads.
// A skeleton gives people a preview of the page's actual shape instead of
// a blank "spinner + nothing" moment, and avoids the layout jump that
// happens when a centered spinner is swapped for the real content.
//
// `dark` picks which surface it's meant to sit on: true (the default) for
// the app's dark navy pages (a light bg-white/10 pulse), false for the
// handful of views still on the original light "paper" background (a
// warm bg-[#E6E0D3]/60 pulse instead). Every caller should pass `dark`
// explicitly to match its own page rather than relying on the default.
export default function Skeleton({
  className = "",
  dark = true,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md ${dark ? "bg-white/10" : "bg-[#E6E0D3]/60"} ${className}`}
    />
  );
}
