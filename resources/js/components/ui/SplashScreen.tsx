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
export default function SplashScreen({ visible }: { visible: boolean }) {
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
            alt="Logo"
            className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
          />
        </div>
      </div>

      <div className="px-6 text-center">
        <p className="build-line build-line-1 text-[15px] font-bold text-white">
          Building your <span className="text-[#7DD8CB]">Barangay Piao</span> portal
        </p>
        <p className="build-line build-line-2 mt-1 text-[13px] text-white/55">
          Committed to serving every resident, every time
        </p>
        <p className="build-line build-line-3 mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
          Secure &middot; Reliable &middot; Resident-First
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
