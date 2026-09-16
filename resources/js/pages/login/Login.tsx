import { useState, useRef, useEffect } from "react";
import { ArrowRight, Copy, LayoutDashboard, Users, XCircle, CheckCircle, LogOut } from "lucide-react";

// ─── Password-visibility eye glyph -- a plain closed-eye arc for "tap to
// hide" (password currently showing), and that same arc with a hollow
// pupil ring beneath it for "tap to reveal" (password currently masked) --
// no bottom eyelid line, just the arc + ring, always in the theme's own
// muted color rather than solid black. ─────────────────────────────────────
function EyeToggleIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="text-white/50">
      {visible ? (
        <path
          d="M4 13c1.8-4.2 5-6.8 8-6.8s6.2 2.6 8 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M4 12.5c1.8-4.3 5-6.3 8-6.3s6.2 2 8 6.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12.7" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

// ─── Decorative corner wave art -- a few overlapping stroked lines, standing
// in for the flowing line-art motif in the reference selection screen. ────
function CornerWaveArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 200"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <path
          key={i}
          d={`M -20 ${40 + i * 9} C 60 ${-10 + i * 7}, 140 ${100 + i * 5}, 320 ${5 - i * 3}`}
          stroke={i % 3 === 0 ? "#DDA53F" : i % 3 === 1 ? "#4FBEB0" : "#8B93A3"}
          strokeOpacity={0.4}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

// ─── Decorative crossing-lines art -- a small burst of diagonal strokes for
// the "feature" cards in the Explore More grid, echoing the reference's
// crossing line-art thumbnails. ────────────────────────────────────────────
function CrossLinesArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 140" fill="none" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <line
          key={i}
          x1={-20 + i * 24}
          y1={160}
          x2={40 + i * 24}
          y2={-20}
          stroke={i % 3 === 0 ? "#DDA53F" : i % 3 === 1 ? "#4FBEB0" : "#5F8F86"}
          strokeOpacity={0.55}
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}

// ─── Staff Portal Selection Screen -- a full-page selector (logout + a
// centered heading + two option cards) instead of a small modal, matching
// the layout rhythm of the reference selection screen with our own copy,
// colors, and mark. ─────────────────────────────────────────────────────────
function PortalSelectionModal({
  userName,
  onSelectStaff,
  onSelectMember,
  onLogout,
}: {
  userName: string;
  onSelectStaff: () => void;
  onSelectMember: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0A0E1A]">
      <CornerWaveArt className="pointer-events-none absolute left-0 top-0 h-40 w-72 opacity-60 sm:h-56 sm:w-96" />
      <CornerWaveArt className="pointer-events-none absolute bottom-0 right-0 h-40 w-72 rotate-180 opacity-60 sm:h-56 sm:w-96" />

      <div className="relative flex items-center justify-end px-6 py-6 sm:px-10">
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-white/60 transition hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>

      {/* Same frosted-glass treatment as the sign-in card -- the portal
          options live inside it rather than as separate white tiles. */}
      <div className="relative flex items-center justify-center px-6 pb-16 pt-4 sm:px-10">
        <div className="w-full max-w-5xl rounded-3xl border border-white/15 bg-white/[0.07] p-10 text-center shadow-[0_25px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/50">
            Piao e-Membership Portal
          </p>
          <h1 className="mt-3 font-display text-[36px] font-extrabold uppercase tracking-tight text-white sm:text-[46px]">
            Portal Selection
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/55">
            Welcome back, {userName}. You have both staff and member access — choose where you'd like to go.
          </p>

          <div className="mt-12 grid gap-7 text-left sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.05]">
              <div className="flex items-center justify-between border-b border-white/10 px-7 py-5">
                <span className="text-[12px] font-bold uppercase tracking-wide text-white/60">Staff Access</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                  <LayoutDashboard className="h-5 w-5 text-white" />
                </span>
              </div>
              <div className="p-7">
                <p className="font-display text-[21px] font-bold text-white">Staff Portal</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">
                  Manage residents, events, certificate requests, and memberships.
                </p>
                <button
                  onClick={onSelectStaff}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] py-3.5 text-[15px] font-bold text-[#08130F] transition hover:opacity-90"
                >
                  Continue to Staff Portal <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.05]">
              <div className="flex items-center justify-between border-b border-white/10 px-7 py-5">
                <span className="text-[12px] font-bold uppercase tracking-wide text-white/60">Member Access</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                  <Users className="h-5 w-5 text-white" />
                </span>
              </div>
              <div className="p-7">
                <p className="font-display text-[21px] font-bold text-white">Member Dashboard</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">
                  View your memberships, event attendance, and certificate status.
                </p>
                <button
                  onClick={onSelectMember}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-[#4FBEB0] py-3.5 text-[15px] font-bold text-[#08130F] transition hover:opacity-90"
                >
                  Continue to Member Dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="relative z-10 mt-11 text-[13px] text-white/40">
            Need help? Contact the Barangay Hall at{" "}
            <span className="font-semibold text-[#7DD8CB]">0917-123-4567</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Live clock -- Philippine Standard Time, ticking every second, styled
// after the reference gov't sites (plain stacked text, no badge chrome). ──
function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Philippine Standard Time</p>
      <p className="mt-0.5 text-[13px] font-medium text-white/90 [font-variant-numeric:tabular-nums]">
        {dateLabel} at {timeLabel}
      </p>
    </div>
  );
}

// ─── Live activity feed -- three sample lines whose "time ago" label keeps
// advancing every few seconds, giving the branded panel a sense of a live,
// in-use system rather than a static marketing graphic. ──────────────────
function LiveActivityFeed() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const formatAgo = (baseSeconds: number) => {
    const seconds = baseSeconds + tick * 5;
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  const items = [
    { label: "New resident record added", base: 20 },
    { label: "Certificate request approved", base: 340 },
    { label: "Event attendance logged", base: 1180 },
  ];

  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5 text-[12px]">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4FBEB0]" />
          </span>
          <span className="text-white/80">{item.label}</span>
          <span className="text-white/35">&middot; {formatAgo(item.base)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Splash screen -- a frosted-glass roundel (translucent, blurred, soft
// specular edge -- real glassmorphism, not just a plain fade) holds the mark,
// which spins/builds open into view inside the glass rather than just
// appearing; three lines of copy stagger in underneath it after, echoing the
// logo-assembling-then-text rhythm of the reference clip, done with Barangay
// Piao's own mark, colors, and wording. ────────────────────────────────────
function SplashScreen({ visible }: { visible: boolean }) {
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

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [showContact, setShowContact] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showPortalModal, setShowPortalModal] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  // Popped up instead of a blocking native alert() -- OK navigates to /login
  // itself so the message stays on screen until the user has actually read it.
  const [showAccountDeletedModal, setShowAccountDeletedModal] = useState(false);
  // Brief, non-blocking, auto-dismissing toast (also replaces a native alert()) --
  // a "copied!" confirmation doesn't need a click to dismiss.
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  // Branded splash shown briefly on first load, before the sign-in form
  // fades in -- gives the page a "this is loading, not broken" moment
  // instead of popping straight in.
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashMounted, setSplashMounted] = useState(true);

  useEffect(() => {
    const startFade = setTimeout(() => setSplashVisible(false), 2000);
    const unmount = setTimeout(() => setSplashMounted(false), 2500);
    return () => {
      clearTimeout(startFade);
      clearTimeout(unmount);
    };
  }, []);

  // Same branded splash, replayed briefly after a Staff/Member choice on
  // the Portal Selection screen -- gives that jump to the dashboard the
  // same "building your portal" moment instead of an instant, jarring
  // swap. The page navigates away (window.location.href) once it's had
  // time to play, so there's no need to fade it back out first.
  const [portalTransitionVisible, setPortalTransitionVisible] = useState(false);

  const contactRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    if (!username.trim() || !password.trim()) {
      setError("Please enter both your username and password.");
      return;
    }

    setIsLoading(true);

    try {
      const csrfToken = document
        .querySelector('meta[name="csrf-token"]')
        ?.getAttribute("content");

      const response = await fetch("/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken && { "X-CSRF-TOKEN": csrfToken }),
        },
        body: JSON.stringify({
          username,
          password,
          remember_me: keepSignedIn,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.clear();
        sessionStorage.clear();

        if (keepSignedIn) {
          localStorage.setItem("user", JSON.stringify(data.user));
          localStorage.setItem("isAuthenticated", "true");
        } else {
          sessionStorage.setItem("user", JSON.stringify(data.user));
          sessionStorage.setItem("isAuthenticated", "true");
        }

        if (data.user.role === "Staff") {
          setLoggedInUser(data.user);
          setShowPortalModal(true);
          setIsLoading(false);
          return;
        }

        if (keepSignedIn) {
          localStorage.setItem("portalMode", "member");
        } else {
          sessionStorage.setItem("portalMode", "member");
        }
        window.location.href = "/dashboard";
      } else {
        if (response.status === 401) {
          if (data.message && data.message.includes("deleted")) {
            setShowAccountDeletedModal(true);
            return;
          }
          setError(data.message || "Invalid username or password");
        } else if (response.status === 419) {
          setError("Session expired. Please refresh the page");
        } else if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "", 10);
          setError(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? `Too many login attempts. Please try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`
              : "Too many login attempts. Please wait a moment and try again."
          );
        } else {
          setError(data.message || "Login failed");
        }

        (form.elements.namedItem("password") as HTMLInputElement).value = "";
      }
    } catch (err) {
      setError("Network error. Please try again");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToStaff = () => {
    const keepSigned = localStorage.getItem("isAuthenticated") === "true" ? localStorage.getItem("user") !== null : false;
    if (keepSigned) {
      localStorage.setItem("portalMode", "staff");
    } else {
      sessionStorage.setItem("portalMode", "staff");
    }
    setPortalTransitionVisible(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  };

  const handleGoToMember = () => {
    const keepSigned = localStorage.getItem("isAuthenticated") === "true" ? localStorage.getItem("user") !== null : false;
    if (keepSigned) {
      localStorage.setItem("portalMode", "member");
    } else {
      sessionStorage.setItem("portalMode", "member");
    }
    setPortalTransitionVisible(true);
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1500);
  };

  const handleLogoutFromPortalSelect = () => {
    localStorage.clear();
    sessionStorage.clear();
    setShowPortalModal(false);
    setLoggedInUser(null);
    window.location.href = "/login";
  };

  const contactNumber = "0917-123-4567";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(contactNumber);
    setShowCopiedToast(true);
    setTimeout(() => setShowCopiedToast(false), 1800);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contactRef.current &&
        !contactRef.current.contains(event.target as Node)
      ) {
        setShowContact(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0E1A] text-white font-sans">
      {splashMounted && <SplashScreen visible={splashVisible} />}
      {portalTransitionVisible && <SplashScreen visible={true} />}

      {showPortalModal && loggedInUser && (
        <PortalSelectionModal
          userName={loggedInUser.first_name || loggedInUser.user_code}
          onSelectStaff={handleGoToStaff}
          onSelectMember={handleGoToMember}
          onLogout={handleLogoutFromPortalSelect}
        />
      )}

      {showAccountDeletedModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">Account Deleted</h3>
            <p className="text-[15px] text-gray-600 mb-5">This account has been deleted. You cannot log in.</p>
            <button
              onClick={() => { setShowAccountDeletedModal(false); window.location.href = "/login"; }}
              className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Sign-in error -- was an inline banner above the form fields, now a
          popup like every other error in the app (invalid credentials,
          account not activated, session expired, network error, etc). */}
      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-4 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-3">Sign In Failed</h3>
            <p className="text-[15px] text-gray-600 mb-5">{error}</p>
            <button
              onClick={() => setError("")}
              className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showCopiedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-2 rounded-full bg-[#0A0E1A] text-white text-sm font-medium px-5 py-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle size={16} className="text-gold-400" /> Number copied to clipboard!
        </div>
      )}

      {/* Centered glass-card login -- the pattern real enterprise sign-in
          pages use (GitHub, Vercel, Slack): a full-bleed dimmed backdrop, a
          slim top bar carrying the only "live" chrome (status + clock), and
          a single frosted-glass card holding the form, nothing competing
          with it for attention. ─────────────────────────────────────────── */}
      <div className="relative flex min-h-screen flex-col">
        {/* Full-bleed backdrop: the barangay photo, blurred and dimmed under
            the same dark-navy tone as the rest of the site. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center blur-sm"
            style={{ backgroundImage: "url('/barangay-assembly.jpg')" }}
          />
          <div className="absolute inset-0 bg-[#0A0E1A]/85" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E1A] via-transparent to-[#0A0E1A]" />
        </div>

        {/* Slim top bar -- logo on the left, the only real-time chrome on the right */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10">
              <img src="/logo-removebg-preview.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className="text-[13px] font-extrabold tracking-wide text-white">
              PIAO<span className="text-white/40">CONNECT</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4FBEB0] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4FBEB0]" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/55">System Online</span>
            </div>
            <LiveClock />
          </div>
        </div>

        {/* Wording on the left, the sign-in card on the right */}
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-center gap-10 px-6 py-14 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          {/* Left: branding + wording */}
          <div className="w-full max-w-xl text-center lg:text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60 sm:text-[12px]">
              Welcome to the
            </p>
            <p className="mt-2 font-display text-[34px] font-extrabold uppercase leading-none tracking-tight sm:text-[48px]">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #F4CE6A 0%, #92C298 33%, #3E989B 66%, #125E85 100%)",
                }}
              >
                Barangay Piao Community
              </span>
            </p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50 sm:text-[13px]">
              Resident-Focused &middot; Community-Driven &middot; Always Online
            </p>
            <p className="mx-auto mt-6 max-w-md text-[14px] leading-relaxed text-white/55 lg:mx-0">
              One account for every resident and staff member — request certificates,
              keep your household records up to date, follow barangay announcements,
              and register for community events, all from a single, secure portal
              built around this community.
            </p>
          </div>

          {/* Right: the sign-in card */}
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.07] p-8 shadow-[0_25px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-10">
            <div className="text-center">
              <h2 className="font-display text-[28px] font-bold text-white">Welcome back</h2>
              <p className="mt-2 text-[14px] text-white/55">
                Sign in with the account issued to you at the Barangay Hall to reach your dashboard.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
              <div>
                <label className="text-[13px] font-semibold text-white/80">Username</label>
                <input
                  type="text"
                  name="username"
                  className="w-full mt-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 transition focus:outline-none focus:border-[#4FBEB0] focus:ring-4 focus:ring-[#4FBEB0]/15"
                  placeholder="PR-0001"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <div className="flex justify-between items-baseline text-sm">
                  <label className="text-[13px] font-semibold text-white/80">Password</label>
                  <span className="text-xs font-semibold text-[#7DD8CB] cursor-pointer hover:underline">
                    Forgot?
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="password-field w-full mt-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 pr-11 text-sm text-white placeholder-white/30 transition focus:outline-none focus:border-[#4FBEB0] focus:ring-4 focus:ring-[#4FBEB0]/15"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-white/50 transition hover:text-white"
                  >
                    <EyeToggleIcon visible={showPassword} />
                  </button>
                  {/* Edge/IE draw their own native reveal-password eye inside
                      the field itself, which was doubling up with the custom
                      one above -- hide the browser's built-in icon so only
                      ours shows. */}
                  <style>{`
                    .password-field::-ms-reveal,
                    .password-field::-ms-clear {
                      display: none;
                    }
                  `}</style>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="keepSignedIn"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="rounded border-white/30 bg-white/10 text-[#4FBEB0] focus:ring-[#4FBEB0]"
                  disabled={isLoading}
                />
                <label htmlFor="keepSignedIn" className="text-[13px] text-white/60">
                  Keep me signed in on this device
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-full font-bold text-[14px] shadow-sm transition text-[#08130F] flex items-center justify-center gap-2 bg-gradient-to-r from-gold-400 to-[#4FBEB0] hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Signing in..." : "Sign In"}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>

              <div className="relative flex justify-center mt-1" ref={contactRef}>
                <p className="text-xs text-white/45">
                  Don't have an account?{" "}
                  <span
                    onClick={() => setShowContact(true)}
                    className="font-semibold cursor-pointer text-[#7DD8CB] hover:underline"
                  >
                    Contact the Records Office
                  </span>
                </p>

                {showContact && (
                  <div className="absolute w-[170px] left-full ml-3 flex items-center gap-2 border border-white/10 bg-[#0F1B33] rounded-xl px-4 py-2 text-sm text-white shadow">
                    <span>{contactNumber}</span>
                    <Copy
                      className="h-4 w-4 cursor-pointer text-white/50 hover:text-[#4FBEB0]"
                      onClick={copyToClipboard}
                    />
                  </div>
                )}
              </div>
            </form>

            <p className="mt-8 text-center text-[11px] leading-relaxed text-white/35">
              Resident accounts are created by Barangay staff — only staff and the
              residents they've registered can sign in here.
            </p>
          </div>
        </div>
      </div>

      {/* Giant watermark band -- a huge faint "PC" (PiaoConnect) outline
          behind a two-line statement, echoing the reference's oversized
          agency-initials watermark, done with our own initials and copy. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0A0E1A] via-[#0D1526] to-[#0A0E1A] px-6 py-24 sm:px-10 sm:py-32">
        <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
          <span
            className="font-display font-extrabold leading-none text-transparent"
            style={{
              fontSize: "clamp(220px, 34vw, 480px)",
              WebkitTextStroke: "1px rgba(255,255,255,0.08)",
            }}
          >
            PC
          </span>
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-[20px] font-bold leading-snug text-white sm:text-[28px]">
            Building a more connected{" "}
            <span className="bg-gradient-to-r from-gold-300 to-gold-400 bg-clip-text text-transparent">
              barangay
            </span>
            ,{" "}
            <span className="bg-gradient-to-r from-[#8FC59B] to-[#4FBEB0] bg-clip-text text-transparent">
              committed to every resident
            </span>
          </p>
          <p className="mt-3 text-[18px] font-bold text-white sm:text-[24px]">
            one household, one record, one community at a time.
          </p>
        </div>
      </section>

      <p className="relative z-10 border-t border-white/10 px-6 py-4 text-center text-[11px] text-white/30 sm:px-10">
        © 2026 Barangay Piao e-Membership · Community System
      </p>
    </div>
  );
}
