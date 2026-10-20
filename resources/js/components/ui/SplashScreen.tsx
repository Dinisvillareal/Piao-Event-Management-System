import { useLanguage } from "../../i18n/LanguageContext";

// ─── Branded splash screen -- a frosted-glass roundel (translucent, blurred,
// soft specular edge -- real glassmorphism, not just a plain fade) holds the
// mark, which spins/builds open into view inside the glass rather than just
// appearing; three lines of copy stagger in underneath it after, echoing the
// logo-assembling-then-text rhythm of the reference clip, done with Barangay
// Piao's own mark, colors, and wording.
//
// Shared by app.tsx (shown for every full page load/refresh, while the
// session's auth check is in flight, before any dashboard renders) and
// Login.tsx (replayed briefly after a Staff/Member portal choice, right
// before that navigation reloads the page) so both "the app is loading"
// moments use exactly the same splash instead of two copies drifting apart.
export default function SplashScreen({ visible, variant = "brand" }: { visible: boolean; variant?: "brand" | "wordmark" }) {
  const { t } = useLanguage();

  // Login-page reload: no logo, just the PIAOCONNECT wordmark with a glossy
  // "mirror" highlight that keeps sliding across the letters. The letters are
  // invisible at rest and only show where the highlight passes over them.
  if (variant === "wordmark") {
    return (
      <div
        className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#0A0E1A] transition-opacity duration-700 sm:gap-8 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        role="status"
        aria-label="PIAOCONNECT"
      >
        <img
          src="/logo-removebg-preview.png"
          alt={t("uiLogoAlt")}
          className="wordmark-logo h-24 w-24 object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)] sm:h-32 sm:w-32"
        />
        <div className="flex flex-col items-center gap-4 px-6 text-center sm:gap-5">
          <h1 className="wordmark-shine font-display text-[40px] font-extrabold uppercase leading-none tracking-[0.18em] sm:text-[64px]">
            PIAOCONNECT
          </h1>
          <p className="wordmark-shine text-[10px] font-semibold uppercase tracking-[0.25em] sm:text-[13px]">
            {t("loginTagline")}
          </p>
        </div>
        <style>{`
          .wordmark-shine {
            --wm-base: rgba(255,255,255,0);
            --wm-glint: rgba(255,255,255,1);
            background-image: linear-gradient(105deg, var(--wm-base) 0%, var(--wm-base) 40%, var(--wm-glint) 50%, var(--wm-base) 60%, var(--wm-base) 100%);
            background-size: 250% 100%;
            background-position: 120% 0;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            -webkit-text-fill-color: transparent;
            animation: wordmarkSlide 6.5s linear 1 forwards;
          }
          html[data-theme="light"] .wordmark-shine {
            --wm-base: rgba(15,23,42,0);
            --wm-glint: rgba(15,23,42,1);
          }
          /* The logo rides the same sliding mirror band as the letters, on the
             same 6.5s linear clock, but the band is wide enough (a flat opaque
             middle larger than the logo) that when the shine reaches the centre
             -- between the "O" and the "C" -- the WHOLE logo is lit, not a strip.
             Hidden before and after the pass. */
          .wordmark-logo {
            -webkit-mask-image: linear-gradient(105deg, transparent 0%, transparent 10%, #000 30%, #000 70%, transparent 90%, transparent 100%);
            mask-image: linear-gradient(105deg, transparent 0%, transparent 10%, #000 30%, #000 70%, transparent 90%, transparent 100%);
            -webkit-mask-size: 400% 100%;
            mask-size: 400% 100%;
            -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
            -webkit-mask-position: 140% 0;
            mask-position: 140% 0;
            animation: wordmarkLogoSlide 6.5s linear 1 forwards;
          }
          /* Light mode: the drop shadow follows the image's square box and shows
             as a grey rectangle on white, so drop it and clip the seal to a circle. */
          html[data-theme="light"] .wordmark-logo {
            filter: none;
            -webkit-clip-path: circle(50% at 50% 50%);
            clip-path: circle(50% at 50% 50%);
          }
          /* Timed to the letters (same 6.5s clock): the shine is over the "O" of
             PIAO at ~41% and has crossed "CO" of CONNECT by ~50%. The logo band
             glides in slowly (about the pace of the letters), is fully lit while
             the shine is on O -> CO, then glides out just as slowly. */
          @keyframes wordmarkLogoSlide {
            0%, 26% { -webkit-mask-position: 122% 0; mask-position: 122% 0; }
            41% { -webkit-mask-position: 60% 0; mask-position: 60% 0; }
            50% { -webkit-mask-position: 40% 0; mask-position: 40% 0; }
            65%, 100% { -webkit-mask-position: -22% 0; mask-position: -22% 0; }
          }
          @keyframes wordmarkSlide {
            0% { background-position: 120% 0; }
            100% { background-position: -20% 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .wordmark-shine { animation: none; background-position: 50% 0; }
            .wordmark-logo { animation: none; -webkit-mask-position: 50% 0; mask-position: 50% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#0A0E1A] transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        {/* Soft ambient glow behind the glass */}
        <span className="logo-glow absolute -inset-6 rounded-full bg-gradient-to-br from-gold-400/25 via-[#4FBEB0]/20 to-transparent blur-3xl" />

        {/* Frosted glass roundel -- translucent fill, blurred backdrop, soft
            border and a curved specular highlight, like real glass. */}
        <span className="absolute inset-0 rounded-full border border-white/15 bg-white/[0.07] backdrop-blur-2xl shadow-[0_25px_70px_rgba(0,0,0,0.55)]" />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/30 via-white/5 to-transparent opacity-70" />
        <span className="pointer-events-none absolute inset-[3px] rounded-full border border-white/10" />

        {/* The mark: starts as nothing and spins/expands open into full view
            inside the glass. */}
        <div className="logo-build relative h-16 w-16 sm:h-20 sm:w-20">
          <img
            src="/logo-removebg-preview.png"
            alt={t("uiLogoAlt")}
            className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
          />
        </div>
      </div>

      <div className="px-6 text-center">
        <p className="build-line build-line-1 text-[15px] font-bold text-white">
          {t("uiSplashBuilding")} <span className="text-[#7DD8CB]">Barangay Piao</span> {t("uiSplashPortal")}
        </p>
        <p className="build-line build-line-2 mt-1 text-[13px] text-white/55">
          {t("uiSplashTagline")}
        </p>
        <p className="build-line build-line-3 mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
          {t("uiSplashValues")}
        </p>
      </div>

      <style>{`
        @keyframes logoBuild {
          0% { clip-path: circle(0% at 50% 50%); transform: rotate(-50deg) scale(0.8); opacity: 0; }
          55% { opacity: 1; }
          100% { clip-path: circle(75% at 50% 50%); transform: rotate(0deg) scale(1); opacity: 1; }
        }
        .logo-build { animation: logoBuild 1s cubic-bezier(0.22, 1, 0.36, 1) both; }

        @keyframes logoGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
        .logo-glow { animation: logoGlow 3s ease-in-out infinite; animation-delay: 1s; }

        @keyframes buildLineIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .build-line { opacity: 0; animation: buildLineIn 0.6s ease-out forwards; }
        .build-line-1 { animation-delay: 0.55s; }
        .build-line-2 { animation-delay: 0.75s; }
        .build-line-3 { animation-delay: 0.95s; }
      `}</style>
    </div>
  );
}
