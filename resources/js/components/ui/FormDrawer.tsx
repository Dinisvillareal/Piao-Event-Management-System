import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import SlideOutGhost from "./SlideOutGhost";

// The shared shell for every staff form that slides in from the right: the
// same layout as Create New Event -- "Cancel" link, centred title and
// subtitle, sections with underlined headings -- but with the save button
// pinned to the bottom of the panel so it never floats mid-screen under a
// short form. Wrap the body in <FormSection> blocks.
export default function FormDrawer({
  title,
  subtitle,
  onClose,
  onSubmit,
  footer,
  children,
  z = "z-50",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
  z?: string;
}) {
  const { t } = useLanguage();
  const panelClass = `resident-form-panel slide-over-in fixed inset-y-0 right-0 ${z} flex w-full flex-col overflow-hidden border-l border-white/10 bg-[#0A0E1A] shadow-2xl sm:w-1/2`;
  const inner = (
    <>
      <img
        src="/logo-removebg-preview.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-4rem] right-[-4rem] z-0 h-[28rem] w-[28rem] select-none object-contain opacity-[0.06] sm:h-[40rem] sm:w-[40rem]"
      />
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-10 sm:px-12 sm:py-14">
        <div className="mx-auto w-full max-w-5xl">
          <button
            type="button"
            onClick={onClose}
            className="mb-8 inline-flex items-center gap-2 text-base font-semibold text-white transition hover:opacity-70"
          >
            <ArrowLeft className="h-5 w-5" /> {t("cancel")}
          </button>
          <h1 className="text-center font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h1>
          {subtitle && <p className="mx-auto mt-3 max-w-md text-center text-base text-white/60">{subtitle}</p>}
          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </div>
      <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#0A0E1A] px-6 py-4 sm:px-12">
        <div className="mx-auto w-full max-w-5xl">{footer}</div>
      </div>
    </>
  );
  // Always rendered at the top of <body>, so the panel and its dimmed backdrop
  // cover the whole window from top to bottom no matter which page opened it
  // (a parent with a transform/animation would otherwise offset a "fixed" panel).
  const drawer = (
    <>
      <SlideOutGhost />
      <div className={`fixed inset-0 ${z} bg-black/80`} onClick={onClose} />
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className={panelClass}>{inner}</form>
      ) : (
        <div className={panelClass}>{inner}</div>
      )}
    </>
  );
  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
}

export function FormSection({ title, children, className = "space-y-4" }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section>
      <h2 className="mb-6 border-b-2 border-white/40 pb-3 text-base font-bold uppercase tracking-wider text-white">{title}</h2>
      <div className={className}>{children}</div>
    </section>
  );
}
