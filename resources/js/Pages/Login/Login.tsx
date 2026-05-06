import { useState } from "react";

export default function LoginPage() {
  const [role, setRole] = useState<"staff" | "member">("staff");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // simple navigation replacement
    if (role === "staff") {
      window.location.href = "/staff";
    } else {
      window.location.href = "/member";
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-gray-800">
      {/* Background blobs */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-orange-300/30 blur-3xl" />
      <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-yellow-300/40 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-teal-300/30 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">

        {/* Navbar */}
        <nav className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-yellow-400 text-white font-bold">
            B
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-800">
              Barangay Portal
            </p>
            <p className="text-base font-bold text-teal-900">
              e-Membership System
            </p>
          </div>
        </nav>

        <main className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">

          {/* Left Info */}
          <div className="hidden md:block">
            <span className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold">
              ● Welcome back
            </span>

            <h1 className="mt-5 text-5xl font-black text-teal-900">
              Sign in to your <span className="text-orange-500">barangay</span> account.
            </h1>

            <p className="mt-5 max-w-md text-gray-600">
              Staff manage memberships and events. Members track attendance,
              notifications, and activities.
            </p>

            <p className="mt-6 text-xs text-gray-400">
              UI Preview · Any credentials will work
            </p>
          </div>

          {/* Login Card */}
          <div className="mx-auto w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl">
            <h2 className="text-2xl font-bold text-teal-900">Sign in</h2>
            <p className="text-sm text-gray-500">Choose your role</p>

            {/* Tabs */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole("staff")}
                className={`py-2 rounded-lg font-medium ${
                  role === "staff"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100"
                }`}
              >
                Staff
              </button>

              <button
                onClick={() => setRole("member")}
                className={`py-2 rounded-lg font-medium ${
                  role === "member"
                    ? "bg-teal-500 text-white"
                    : "bg-gray-100"
                }`}
              >
                Member
              </button>
            </div>

            {/* Role Info */}
            <p className="mt-3 text-xs text-gray-500">
              {role === "staff"
                ? "Brgy. Captain · Kagawad · Secretary"
                : "Resident of the barangay"}
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">

              <div>
                <label className="text-sm font-medium">
                  Email or Resident ID
                </label>
                <input
                  type="text"
                  className="w-full mt-1 rounded-lg border px-3 py-2"
                  placeholder={
                    role === "staff"
                      ? "captain@barangay.gov"
                      : "RES-001"
                  }
                  required
                />
              </div>

              <div>
                <div className="flex justify-between text-sm">
                  <label>Password</label>
                  <span className="text-orange-500 cursor-pointer">
                    Forgot?
                  </span>
                </div>

                <input
                  type="password"
                  className="w-full mt-1 rounded-lg border px-3 py-2"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                className={`w-full py-2 rounded-lg font-semibold ${
                  role === "staff"
                    ? "bg-orange-500 text-white"
                    : "bg-teal-500 text-white"
                }`}
              >
                Sign in as {role === "staff" ? "Staff" : "Member"}
              </button>

              <p className="text-center text-xs text-gray-500">
                No account yet?{" "}
                <span className="font-semibold cursor-pointer">
                  Register
                </span>
              </p>
            </form>
          </div>
        </main>

        <footer className="text-center text-xs text-gray-400">
          © Barangay Portal · Community system
        </footer>
      </div>
    </div>
  );
}
