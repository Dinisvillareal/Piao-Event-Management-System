import DefaultAvatar from "./DefaultAvatar";

/** The user's ID photo as a round avatar; falls back to the grey default avatar when there is no photo. */
export default function UserAvatar({ src, className = "h-8 w-8", title }: { src?: string | null; className?: string; title?: string }) {
  if (!src) return <DefaultAvatar className={className} title={title} />;
  return <img src={src} alt={title ?? "User avatar"} className={`shrink-0 rounded-full object-cover object-[50%_15%] ${className}`} />;
}
