import React from "react";
import { ArrowRight } from "lucide-react";

interface DashboardHeroAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

interface DashboardHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: DashboardHeroAction;
  secondaryAction?: DashboardHeroAction;
}

// Piao design system -- dashboard hero band. Modeled on the DOST-SEI
// scholarships page header (dark panel, bold uppercase headline, paired
// pill buttons) but built from Piao's own dark navy / gold / teal palette
// -- the same one introduced on the sign-in page -- rather than the
// reference's colors.
export default function DashboardHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
}: DashboardHeroProps) {
  const PrimaryIcon = primaryAction.icon;
  const SecondaryIcon = secondaryAction?.icon ?? ArrowRight;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0A0E1A] px-6 py-8 sm:px-10 sm:py-10">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-gold-400/20 to-[#4FBEB0]/10 blur-3xl"
        aria-hidden="true"
      />
      <p className="relative text-[12px] font-bold uppercase tracking-[0.22em] text-[#7DD8CB]">
        {eyebrow}
      </p>
      <h1 className="relative mt-2 font-display text-2xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      <p className="relative mt-3 max-w-xl text-[14px] text-white/60 sm:text-[15px]">
        {description}
      </p>

      <div className="relative mt-6 flex flex-wrap gap-3">
        <button
          onClick={primaryAction.onClick}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] px-5 py-2.5 text-[13px] font-bold text-[#08130F] transition hover:opacity-90"
        >
          {PrimaryIcon && <PrimaryIcon className="h-4 w-4" />}
          {primaryAction.label}
        </button>
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
          >
            {secondaryAction.label}
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
              <SecondaryIcon className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
