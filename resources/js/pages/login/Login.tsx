// import { useState, useRef, useEffect } from "react";
// import { ArrowRight, Copy } from "lucide-react";

// export default function LoginPage() {
//   const [showContact, setShowContact] = useState(false);
//   const contactRef = useRef<HTMLDivElement>(null);

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     window.location.href = "/dashboard";
//   };

//   const contactNumber = "0917-123-4567";

//   const copyToClipboard = () => {
//     navigator.clipboard.writeText(contactNumber);
//     alert("Number copied to clipboard!");
//   };

//   // Close popup when clicking outside
//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (contactRef.current && !contactRef.current.contains(event.target as Node)) {
//         setShowContact(false);
//       }
//     };
//     document.addEventListener("mousedown", handleClickOutside);
//     return () => {
//       document.removeEventListener("mousedown", handleClickOutside);
//     };
//   }, []);

//   return (
//     <div className="relative min-h-screen overflow-hidden bg-white text-gray-900">
//       {/* Background blobs */}
//       <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-orange-300/40 blur-3xl" />
//       <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-yellow-300/40 blur-3xl" />
//       <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-teal-300/40 blur-3xl" />

//       <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-12">
//         {/* Navbar */}
//         <nav className="flex items-center gap-3 mb-6">
//           <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-yellow-400 text-white font-bold">
//             B
//           </div>
//           <div>
//             <p className="text-xs uppercase tracking-widest text-teal-800">
//               Piao Barangay Portal
//             </p>
//             <p className="text-base font-bold text-teal-900">
//               e-Membership System
//             </p>
//           </div>
//         </nav>

//         <main className="grid flex-1 items-center gap-12 py-10 md:grid-cols-2">
//           {/* Left Info */}
//           <div className="hidden md:block">
//             <span className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
//               <span className="h-2 w-2 rounded-full bg-orange-500" />
//               Welcome back
//             </span>

//             <h1 className="mt-5 text-5xl font-black text-teal-800">
//               Sign in to your <span className="text-orange-500">barangay</span> account.
//             </h1>

//             <p className="mt-5 max-w-md text-gray-700">
//               Manage events, register residents, and track attendance in one secure place built for your community.
//             </p>

//             <p className="mt-6 text-xs text-gray-500">
//               Use the correct credentials to access the system
//             </p>
//           </div>

//           {/* Login Card */}
//           <div className="mx-auto w-full max-w-lg rounded-2xl border border-gray-300 bg-white p-10 shadow-lg">
//             <h2 className="text-2xl font-bold text-teal-800">Sign in</h2>
//             <p className="text-sm text-gray-700 mt-1">
//               Sign in to your barangay account
//             </p>

//             {/* Form */}
//             <form onSubmit={handleSubmit} className="mt-6 space-y-5">
//               {/* Username */}
//               <div>
//                 <label className="text-sm font-semibold text-gray-800">Username</label>
//                 <input
//                   type="text"
//                   className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
//                   placeholder="PR-0000"
//                   required
//                 />
//               </div>

//               {/* Password */}
//               <div>
//                 <div className="flex justify-between text-sm">
//                   <label className="text-sm font-semibold text-gray-800">Password</label>
//                   <span className="text-xs text-orange-500 cursor-pointer hover:underline">
//                     Forgot?
//                   </span>
//                 </div>
//                 <div className="relative">
//                   <input
//                     type="password"
//                     className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
//                     placeholder="••••••••"
//                     required
//                   />
//                 </div>
//               </div>

//               {/* Checkbox */}
//               <div className="flex items-center gap-2 text-sm">
//                 <input
//                   type="checkbox"
//                   id="keepSignedIn"
//                   className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
//                 />
//                 <label htmlFor="keepSignedIn" className="text-gray-700">
//                   Keep me signed in on this device
//                 </label>
//               </div>

//               {/* Solid Orange Button */}
//               <button
//                 type="submit"
//                 className="w-full py-2 rounded-xl font-semibold shadow-xl transition transform text-white flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400"
//               >
//                 Sign in <ArrowRight className="h-5 w-5" />
//               </button>

//               {/* Contact Number Toggle */}
//               <div className="relative flex justify-center mt-3" ref={contactRef}>
//                 <p className="text-xs text-gray-600">
//                   Need an account?{" "}
//                   <span
//                     onClick={() => setShowContact(true)}
//                     className="font-semibold cursor-pointer text-teal-700 hover:underline"
//                   >
//                     Contact this number
//                   </span>
//                 </p>

//                 {showContact && (
//                   <div className="absolute w-[160px] left-full ml-3 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-800 shadow">
//                     <span>{contactNumber}</span>
//                     <Copy
//                       className="h-4 w-4 cursor-pointer text-gray-600 hover:text-orange-500"
//                       onClick={copyToClipboard}
//                     />
//                   </div>
//                 )}
//               </div>
//             </form>
//           </div>
//         </main>

//         <footer className="text-center text-xs text-gray-700 mt-8">
//           © 2026 Piao Barangay Portal · Community System
//         </footer>
//       </div>
//     </div>
//   );
// }
//last working implementation

//LATESTTTTT LAST WORKING IMPLEMENTATION V
// import { useState, useRef, useEffect } from "react";
// import { ArrowRight, Copy, LayoutDashboard, Users } from "lucide-react";

// // ─── Staff Portal Selection Modal ─────────────────────────────────────────────
// function PortalSelectionModal({
//   userName,
//   onSelectStaff,
//   onSelectMember,
// }: {
//   userName: string;
//   onSelectStaff: () => void;
//   onSelectMember: () => void;
// }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
//       <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden">
//         {/* Top accent bar */}
//         <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-yellow-400 to-orange-500" />

//         <div className="p-8">
//           {/* Header */}
//           <div className="text-center mb-6">
//             <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-yellow-300 text-white font-black text-xl mb-3 shadow-md">
//               B
//             </div>
//             <h2 className="text-xl font-black text-teal-800">Welcome back, {userName}!</h2>
//             <p className="text-sm text-gray-500 mt-1">
//               You have both staff and member access. Where would you like to go?
//             </p>
//           </div>

//           {/* Choice buttons */}
//           <div className="space-y-3">
//             {/* Staff Portal */}
//             <button
//               onClick={onSelectStaff}
//               className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-orange-100 bg-orange-50 hover:border-orange-400 hover:bg-orange-100 transition-all duration-200 group text-left"
//             >
//               <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
//                 <LayoutDashboard className="w-5 h-5 text-white" />
//               </div>
//               <div className="flex-1">
//                 <p className="font-bold text-orange-800 text-sm">Staff Portal</p>
//                 <p className="text-xs text-orange-600 mt-0.5">
//                   Manage residents, events, memberships & more
//                 </p>
//               </div>
//               <ArrowRight className="w-4 h-4 text-orange-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
//             </button>

//             {/* Member Dashboard */}
//             <button
//               onClick={onSelectMember}
//               className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-teal-100 bg-teal-50 hover:border-teal-400 hover:bg-teal-100 transition-all duration-200 group text-left"
//             >
//               <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
//                 <Users className="w-5 h-5 text-white" />
//               </div>
//               <div className="flex-1">
//                 <p className="font-bold text-teal-800 text-sm">Member Dashboard</p>
//                 <p className="text-xs text-teal-600 mt-0.5">
//                   View your memberships, events & attendance
//                 </p>
//               </div>
//               <ArrowRight className="w-4 h-4 text-teal-400 group-hover:text-teal-600 group-hover:translate-x-1 transition-all" />
//             </button>
//           </div>

//           <p className="text-center text-xs text-gray-400 mt-5">
//             You can switch between portals anytime after logging in.
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ─── Login Page ───────────────────────────────────────────────────────────────
// export default function LoginPage() {
//   const [showContact, setShowContact] = useState(false);
//   const [error, setError] = useState("");
//   const [isLoading, setIsLoading] = useState(false);
//   const [keepSignedIn, setKeepSignedIn] = useState(false);

//   // Portal selection modal state
//   const [showPortalModal, setShowPortalModal] = useState(false);
//   const [loggedInUser, setLoggedInUser] = useState<any>(null);

//   const contactRef = useRef<HTMLDivElement>(null);

//   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setError("");

//     const form = e.currentTarget;
//     const username = (form.elements.namedItem("username") as HTMLInputElement).value;
//     const password = (form.elements.namedItem("password") as HTMLInputElement).value;

//     try {
//       const csrfToken = document
//         .querySelector('meta[name="csrf-token"]')
//         ?.getAttribute("content");

//       const response = await fetch("/login", {
//         method: "POST",
//         credentials: "include",
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "application/json",
//           "X-Requested-With": "XMLHttpRequest",
//           ...(csrfToken && { "X-CSRF-TOKEN": csrfToken }),
//         },
//         body: JSON.stringify({
//           username,
//           password,
//           remember_me: keepSignedIn,
//         }),
//       });

//       const data = await response.json();

//       if (response.ok) {
//         // Clear both storages first
//         localStorage.clear();
//         sessionStorage.clear();

//         // Store based on checkbox
//         if (keepSignedIn) {
//           localStorage.setItem("user", JSON.stringify(data.user));
//           localStorage.setItem("isAuthenticated", "true");
//         } else {
//           sessionStorage.setItem("user", JSON.stringify(data.user));
//           sessionStorage.setItem("isAuthenticated", "true");
//         }

//         // ── If Staff: show portal selection modal ──────────────────────
//         if (data.user.role === "Staff") {
//           setLoggedInUser(data.user);
//           setShowPortalModal(true);
//           setIsLoading(false);
//           return;
//         }

//         // ── Regular resident (non-staff): go straight to member dashboard
//         window.location.href = "/dashboard";
//       } else {
//         if (response.status === 401) {
//           if (data.message && data.message.includes("deleted")) {
//             alert("This account has been deleted. You cannot log in.");
//             window.location.href = "/login";
//             return;
//           }
//           setError(data.message || "Invalid username or password");
//         } else if (response.status === 419) {
//           setError("Session expired. Please refresh the page");
//         } else {
//           setError(data.message || "Login failed");
//         }

//         (form.elements.namedItem("password") as HTMLInputElement).value = "";
//       }
//     } catch (err) {
//       setError("Network error. Please try again");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleGoToStaff = () => {
//     setShowPortalModal(false);
//     window.location.href = "/";
//   };

//   const handleGoToMember = () => {
//     setShowPortalModal(false);
//     window.location.href = "/dashboard";
//   };

//   const contactNumber = "0917-123-4567";

//   const copyToClipboard = () => {
//     navigator.clipboard.writeText(contactNumber);
//     alert("Number copied to clipboard!");
//   };

//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (
//         contactRef.current &&
//         !contactRef.current.contains(event.target as Node)
//       ) {
//         setShowContact(false);
//       }
//     };
//     document.addEventListener("mousedown", handleClickOutside);
//     return () => {
//       document.removeEventListener("mousedown", handleClickOutside);
//     };
//   }, []);

//   return (
//     <div className="relative min-h-screen overflow-hidden bg-white text-gray-900">
//       {/* Portal selection modal — shown after staff login */}
//       {showPortalModal && loggedInUser && (
//         <PortalSelectionModal
//           userName={loggedInUser.first_name || loggedInUser.user_code}
//           onSelectStaff={handleGoToStaff}
//           onSelectMember={handleGoToMember}
//         />
//       )}

//       <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-orange-300/40 blur-3xl" />
//       <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-yellow-300/40 blur-3xl" />
//       <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-teal-300/40 blur-3xl" />

//       <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-12">
//         <nav className="flex items-center gap-3 mb-6">
//           <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-yellow-400 text-white font-bold">
//             B
//           </div>
//           <div>
//             <p className="text-xs uppercase tracking-widest text-teal-800">
//               Piao Barangay Portal
//             </p>
//             <p className="text-base font-bold text-teal-900">e-Membership System</p>
//           </div>
//         </nav>

//         <main className="grid flex-1 items-center gap-12 py-10 md:grid-cols-2">
//           <div className="hidden md:block">
//             <span className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
//               <span className="h-2 w-2 rounded-full bg-orange-500" />
//               Welcome back
//             </span>

//             <h1 className="mt-5 text-5xl font-black text-teal-800">
//               Sign in to your{" "}
//               <span className="text-orange-500">barangay</span> account.
//             </h1>

//             <p className="mt-5 max-w-md text-gray-700">
//               Manage events, register residents, and track attendance in one
//               secure place built for your community.
//             </p>

//             <p className="mt-6 text-xs text-gray-500">
//               Use the correct credentials to access the system
//             </p>
//           </div>

//           <div className="mx-auto w-full max-w-lg rounded-2xl border border-gray-300 bg-white p-10 shadow-lg">
//             <h2 className="text-2xl font-bold text-teal-800">Sign in</h2>
//             <p className="text-sm text-gray-700 mt-1">
//               Sign in to your barangay account
//             </p>

//             <form onSubmit={handleSubmit} className="mt-6 space-y-5">
//               {error && (
//                 <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-200">
//                   {error}
//                 </div>
//               )}

//               <div>
//                 <label className="text-sm font-semibold text-gray-800">
//                   Username
//                 </label>
//                 <input
//                   type="text"
//                   name="username"
//                   className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
//                   placeholder="PR-0001"
//                   required
//                   disabled={isLoading}
//                 />
//               </div>

//               <div>
//                 <div className="flex justify-between text-sm">
//                   <label className="text-sm font-semibold text-gray-800">
//                     Password
//                   </label>
//                   <span className="text-xs text-orange-500 cursor-pointer hover:underline">
//                     Forgot?
//                   </span>
//                 </div>
//                 <div className="relative">
//                   <input
//                     type="password"
//                     name="password"
//                     className="w-full mt-1 rounded-xl border px-3 py-2 text-sm shadow focus:ring-1 focus:border-teal-500 focus:ring-teal-400 placeholder-gray-600"
//                     placeholder="••••••••"
//                     required
//                     disabled={isLoading}
//                   />
//                 </div>
//               </div>

//               <div className="flex items-center gap-2 text-sm">
//                 <input
//                   type="checkbox"
//                   id="keepSignedIn"
//                   checked={keepSignedIn}
//                   onChange={(e) => setKeepSignedIn(e.target.checked)}
//                   className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
//                   disabled={isLoading}
//                 />
//                 <label htmlFor="keepSignedIn" className="text-gray-700">
//                   Keep me signed in on this device
//                 </label>
//               </div>

//               <button
//                 type="submit"
//                 disabled={isLoading}
//                 className="w-full py-2 rounded-xl font-semibold shadow-xl transition transform text-white flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50"
//               >
//                 {isLoading ? "Signing in..." : "Sign in"}
//                 {!isLoading && <ArrowRight className="h-5 w-5" />}
//               </button>

//               <div className="relative flex justify-center mt-3" ref={contactRef}>
//                 <p className="text-xs text-gray-600">
//                   Need an account?{" "}
//                   <span
//                     onClick={() => setShowContact(true)}
//                     className="font-semibold cursor-pointer text-teal-700 hover:underline"
//                   >
//                     Contact this number
//                   </span>
//                 </p>

//                 {showContact && (
//                   <div className="absolute w-[160px] left-full ml-3 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-800 shadow">
//                     <span>{contactNumber}</span>
//                     <Copy
//                       className="h-4 w-4 cursor-pointer text-gray-600 hover:text-orange-500"
//                       onClick={copyToClipboard}
//                     />
//                   </div>
//                 )}
//               </div>
//             </form>
//           </div>
//         </main>

//         <footer className="text-center text-xs text-gray-700 mt-8">
//           © 2026 Piao Barangay Portal · Community System
//         </footer>
//       </div>
//     </div>
//   );
// }

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Copy, LayoutDashboard, Users, XCircle, CheckCircle } from "lucide-react";

// ─── Staff Portal Selection Modal ─────────────────────────────────────────────
function PortalSelectionModal({
  userName,
  onSelectStaff,
  onSelectMember,
}: {
  userName: string;
  onSelectStaff: () => void;
  onSelectMember: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-[#33534E]" />

        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-transparent text-white font-black text-xl mb-3 shadow-none overflow-hidden">
              <img
                src="/logo-removebg-preview.png"
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h2 className="font-display text-xl font-bold text-[#1A1A1A]">Welcome back, {userName}!</h2>
            <p className="text-sm text-[#6E6A60] mt-1">
              You have both staff and member access. Where would you like to go?
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={onSelectStaff}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-[#E6E0D3] bg-white hover:border-sage-600 hover:bg-sage-50 transition-all duration-200 group text-left"
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-[#33534E] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#1A1A1A] text-sm">Staff Portal</p>
                <p className="text-xs text-[#6E6A60] mt-0.5">
                  Manage residents, events, memberships & more
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-sage-600 group-hover:text-sage-800 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={onSelectMember}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-[#E6E0D3] bg-white hover:border-gold-600 hover:bg-gold-50 transition-all duration-200 group text-left"
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gold-400 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5 text-[#1A1A1A]" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#1A1A1A] text-sm">Member Dashboard</p>
                <p className="text-xs text-[#6E6A60] mt-0.5">
                  View your memberships, events & attendance
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gold-600 group-hover:text-gold-700 group-hover:translate-x-1 transition-all" />
            </button>
          </div>

          <p className="text-center text-xs text-[#9B9789] mt-5">
            You can switch between portals anytime after logging in.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [showContact, setShowContact] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  const [showPortalModal, setShowPortalModal] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  // Popped up instead of a blocking native alert() -- OK navigates to /login
  // itself so the message stays on screen until the user has actually read it.
  const [showAccountDeletedModal, setShowAccountDeletedModal] = useState(false);
  // Brief, non-blocking, auto-dismissing toast (also replaces a native alert()) --
  // a "copied!" confirmation doesn't need a click to dismiss.
  const [showCopiedToast, setShowCopiedToast] = useState(false);

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
    setShowPortalModal(false);
    window.location.href = "/";
  };

  const handleGoToMember = () => {
    const keepSigned = localStorage.getItem("isAuthenticated") === "true" ? localStorage.getItem("user") !== null : false;
    if (keepSigned) {
      localStorage.setItem("portalMode", "member");
    } else {
      sessionStorage.setItem("portalMode", "member");
    }
    setShowPortalModal(false);
    window.location.href = "/dashboard";
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
    <div className="relative min-h-screen overflow-hidden bg-white text-[#1A1A1A] font-sans">
      {showPortalModal && loggedInUser && (
        <PortalSelectionModal
          userName={loggedInUser.first_name || loggedInUser.user_code}
          onSelectStaff={handleGoToStaff}
          onSelectMember={handleGoToMember}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-2 rounded-full bg-sage-900 text-white text-sm font-medium px-5 py-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle size={16} className="text-gold-400" /> Number copied to clipboard!
        </div>
      )}

      {/* Split-screen layout: a quiet sage brand panel on the left, the
          sign-in form on the right. Anyone with an account -- staff or
          resident -- uses this one form; only staff can create resident
          accounts, so there's nothing here for a person to choose. */}
      <div className="grid min-h-screen md:grid-cols-[1.05fr_1fr]">

        <div className="relative hidden md:flex flex-col justify-between overflow-hidden p-12 text-white bg-gradient-to-br from-[#233A37] via-[#33534E] to-[#456F68]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 border border-white/25 overflow-hidden shrink-0">
              <img src="/logo-removebg-preview.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/65">Republic of the Philippines</p>
              <p className="text-[15px] font-bold text-white">Barangay Piao</p>
            </div>
          </div>

          <div className="relative max-w-md">
            <h1 className="font-display text-[34px] leading-[1.15] font-bold text-white text-balance">
              Serve. Connect. Uplift Barangay Piao.
            </h1>
            <p className="mt-4 text-[14px] leading-relaxed text-white/80">
              One system for resident profiling, program eligibility, and event attendance —
              replacing the logbooks at the front desk.
            </p>
          </div>

          <div className="relative flex gap-8">
            <div>
              <p className="font-display text-2xl font-bold text-white">1,428</p>
              <p className="text-[11px] uppercase tracking-wide text-white/60 mt-0.5">Residents Served</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-white">312</p>
              <p className="text-[11px] uppercase tracking-wide text-white/60 mt-0.5">Households</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-white">10</p>
              <p className="text-[11px] uppercase tracking-wide text-white/60 mt-0.5">Active Programs</p>
            </div>
          </div>
        </div>

        <main className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm">

            {/* Brand lockup shown only on small screens, where the sage
                panel above is hidden. */}
            <div className="flex md:hidden items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-50 overflow-hidden shrink-0">
                <img src="/logo-removebg-preview.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-sage-700">Barangay Piao</p>
                <p className="text-sm font-bold text-[#1A1A1A]">e-Membership System</p>
              </div>
            </div>

            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-sage-700">e-Membership Portal</p>
            <h2 className="mt-2 font-display text-[26px] font-bold text-[#1A1A1A]">Welcome back</h2>
            <p className="mt-1.5 text-sm text-[#6E6A60]">Sign in with the account issued to you at the Barangay Hall.</p>

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label className="text-[13px] font-semibold text-[#1A1A1A]">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  className="w-full mt-1.5 rounded-xl border-[1.5px] border-[#D8D0BE] px-3.5 py-2.5 text-sm text-[#1A1A1A] placeholder-[#9B9789] transition focus:outline-none focus:border-sage-600 focus:ring-4 focus:ring-sage-100"
                  placeholder="PR-0001"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <div className="flex justify-between items-baseline text-sm">
                  <label className="text-[13px] font-semibold text-[#1A1A1A]">
                    Password
                  </label>
                  <span className="text-xs font-semibold text-sage-700 cursor-pointer hover:underline">
                    Forgot?
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    className="w-full mt-1.5 rounded-xl border-[1.5px] border-[#D8D0BE] px-3.5 py-2.5 text-sm text-[#1A1A1A] placeholder-[#9B9789] transition focus:outline-none focus:border-sage-600 focus:ring-4 focus:ring-sage-100"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="keepSignedIn"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="rounded border-gray-300 text-sage-600 focus:ring-sage-500"
                  disabled={isLoading}
                />
                <label htmlFor="keepSignedIn" className="text-[13px] text-[#37423F]">
                  Keep me signed in on this device
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-full font-semibold text-[14px] shadow-sm transition text-white flex items-center justify-center gap-2 bg-[#33534E] hover:bg-[#233A37] disabled:opacity-50"
              >
                {isLoading ? "Signing in..." : "Sign In"}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>

              <div className="relative flex justify-center mt-1" ref={contactRef}>
                <p className="text-xs text-[#6E6A60]">
                  Don't have an account?{" "}
                  <span
                    onClick={() => setShowContact(true)}
                    className="font-semibold cursor-pointer text-sage-700 hover:underline"
                  >
                    Contact the Records Office
                  </span>
                </p>

                {showContact && (
                  <div className="absolute w-[170px] left-full ml-3 flex items-center gap-2 bg-[#F1ECE1] rounded-xl px-4 py-2 text-sm text-[#1A1A1A] shadow">
                    <span>{contactNumber}</span>
                    <Copy
                      className="h-4 w-4 cursor-pointer text-[#6E6A60] hover:text-sage-700"
                      onClick={copyToClipboard}
                    />
                  </div>
                )}
              </div>
            </form>

            <div className="mt-8 flex gap-2 text-[11px] leading-relaxed text-[#9B9789]">
              <span>
                Resident accounts are created by Barangay staff — only staff and the
                residents they've registered can sign in here.
              </span>
            </div>
          </div>
        </main>
      </div>

      <footer className="absolute bottom-4 inset-x-0 text-center text-[11px] text-[#9B9789]">
        © 2026 Barangay Piao e-Membership · Community System
      </footer>
    </div>
  );
}
