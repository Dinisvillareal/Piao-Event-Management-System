import { useState, useRef, useEffect } from "react";
import { ArrowRight, Copy } from "lucide-react";

export default function LoginPage() {
  const [showContact, setShowContact] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = "/dashboard";
  };

  const contactNumber = "0917-123-4567";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(contactNumber);
    alert("Number copied to clipboard!");
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contactRef.current && !contactRef.current.contains(event.target as Node)) {
        setShowContact(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-gray-900">
      {/* Background blobs */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-orange-300/40 blur-3xl" />
      <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-yellow-300/40 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-teal-300/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-12">
        {/* Navbar */}
        <nav className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-yellow-400 text-white font-bold">
            B
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-800">
              Piao Barangay Portal
            </p>
            <p className="text-base font-bold text-teal-900">
              e-Membership System
            </p>
          </div>
        </nav>

        <main className="grid flex-1 items-center gap-12 py-10 md:grid-cols-2">
          {/* Left Info */}
          <div className="hidden md:block">
            <span className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              Welcome back
            </span>

            <h1 className="mt-5 text-5xl font-black text-teal-800">
              Sign in to your <span className="text-orange-500">barangay</span> account.
            </h1>

            <p className="mt-5 max-w-md text-gray-700">
              Manage events, register residents, and track attendance in one secure place built for your community.
            </p>

            <p className="mt-6 text-xs text-gray-500">
              Use the correct credentials to access the system
            </p>
          </div>

          {/* Login Card */}
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-gray-300 bg-white p-10 shadow-lg">
            <h2 className="text-2xl font-bold text-teal-800">Sign in</h2>
            <p className="text-sm text-gray-700 mt-1">
              Sign in to your barangay account
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* Username */}
              <div>
                <label className="text-sm font-semibold text-gray-800">Username</label>
                <input
                  type="text"
                  className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
                  placeholder="PR-0000"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex justify-between text-sm">
                  <label className="text-sm font-semibold text-gray-800">Password</label>
                  <span className="text-xs text-orange-500 cursor-pointer hover:underline">
                    Forgot?
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {/* Checkbox */}
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="keepSignedIn"
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="keepSignedIn" className="text-gray-700">
                  Keep me signed in on this device
                </label>
              </div>

              {/* Solid Orange Button */}
              <button
                type="submit"
                className="w-full py-2 rounded-xl font-semibold shadow-xl transition transform text-white flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400"
              >
                Sign in <ArrowRight className="h-5 w-5" />
              </button>

              {/* Contact Number Toggle */}
              <div className="relative flex justify-center mt-3" ref={contactRef}>
                <p className="text-xs text-gray-600">
                  Need an account?{" "}
                  <span
                    onClick={() => setShowContact(true)}
                    className="font-semibold cursor-pointer text-teal-700 hover:underline"
                  >
                    Contact this number
                  </span>
                </p>

                {showContact && (
                  <div className="absolute w-[160px] left-full ml-3 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-800 shadow">
                    <span>{contactNumber}</span>
                    <Copy
                      className="h-4 w-4 cursor-pointer text-gray-600 hover:text-orange-500"
                      onClick={copyToClipboard}
                    />
                  </div>
                )}
              </div>
            </form>
          </div>
        </main>

        <footer className="text-center text-xs text-gray-700 mt-8">
          © 2026 Piao Barangay Portal · Community System
        </footer>
      </div>
    </div>
  );
}
