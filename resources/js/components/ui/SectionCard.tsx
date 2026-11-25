import type { ReactNode } from "react";

// One card style for the account pages: icon chip + title + short description
// on a header row, a divider, then the content. Keeps every section the same.
export default function SectionCard({
  icon,
  title,
  desc,
  action,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-card overflow-hidden rounded-[32px] ${className}`}>
      <header className="flex items-start gap-3.5 border-b border-white/10 px-5 py-5 sm:px-7">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2E8E82] text-white">{icon}</div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold text-white">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-white/60">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-5 sm:p-7">{children}</div>
    </section>
  );
}
