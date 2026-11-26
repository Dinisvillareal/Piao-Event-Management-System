import type { ReactNode } from "react";

// One card style for the account pages: icon chip + title + short description
// on a header row, a divider, then the content. Keeps every section the same.
export default function SectionCard({
  icon,
  title,
  desc,
  action,
  badge,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
  /** Small count pill shown right beside the title. */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-card overflow-hidden rounded-[32px] ${className}`}>
      <header className="flex items-start gap-3.5 border-b border-white/10 px-5 py-5 sm:px-7">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2E8E82] text-white">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-extrabold text-white">{title}</h2>
            {badge !== undefined && badge !== null && (
              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] px-2 text-xs font-bold !text-white">{badge}</span>
            )}
          </div>
          {desc && <p className="mt-0.5 text-sm text-white/60">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-5 sm:p-7">{children}</div>
    </section>
  );
}
