/** Phones only: a floating brand card just below the top bar (fixed, the page scrolls underneath it) (logo + "Piao, Zamboanga del Norte / Piao Connect"), like the DOST SEI header. */
export default function MobileBrandBanner() {
  return (
    <div className="mobile-brand-banner pointer-events-none fixed inset-x-0 top-[73px] z-30 px-4 pt-2 sm:hidden print:hidden">
      <div className="pointer-events-auto flex h-16 items-center justify-center gap-3 rounded-[22px] brand-banner-glass px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/95 p-0.5 shadow-sm">
          <img src="/logo-removebg-preview.png" alt="Piao Connect" className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[10.5px] font-normal tracking-normal !text-white/85">Piao, Zamboanga del Norte</span>
          <span className="mt-0.5 block truncate text-[10.5px] font-semibold tracking-normal !text-white">Piao Connect</span>
        </span>
      </div>
    </div>
  );
}
