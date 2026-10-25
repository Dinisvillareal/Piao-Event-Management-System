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
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] ${className}`}>
      <header className="flex items-start gap-3.5 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15 text-[#4FBEB0]">{icon}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-white/55">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
