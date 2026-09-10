// import React, { useEffect, useState } from "react";
// import ReactDOM from "react-dom/client";
// import MemberDashboard from "./pages/members/Members";
// import LoginPage from "./pages/login/Login";


// const rootElement = document.getElementById("app");

// if (rootElement) {
//   ReactDOM.createRoot(rootElement).render(<App />);
// }


// export default function App() {
//   const [currentPath, setCurrentPath] = useState(window.location.pathname);

//   // Listen for browser navigation (like the Back button)
//   useEffect(() => {
//     const handleLocationChange = () => {
//       setCurrentPath(window.location.pathname);
//     };

//     window.addEventListener("popstate", handleLocationChange);
//     return () => window.removeEventListener("popstate", handleLocationChange);
//   }, []);

//   // 1. If the URL is exactly "/" or "/login", show the Login Page
//   if (currentPath === "/" || currentPath === "/login") {
//     return <LoginPage />;
//   }
//   // 2. If it's anything else (like "/dashboard", "/qr", "/events"), show the Member Portal
//   return <MemberDashboard />;
// }

import React, { useEffect, useState, useCallback, useRef } from "react";
import ReactDOM from "react-dom/client";
import MemberDashboard from "./pages/members/Members";
import StaffDashboard from "./pages/staff/Staff";
import LoginPage from "./pages/login/Login";
import { LanguageProvider } from "./i18n/LanguageContext";

const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

// UC (offline access): let the app shell open with no internet connection.
// Only registered against a production build — Vite's dev server streams
// modules live and cannot be usefully cached, so this is a no-op under
// `npm run dev`. Build with `npm run build` for offline opening to work.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}

// ─── PORTAL MODE HELPERS ──────────────────────────────────────────────────────
// "portalMode" is stored in sessionStorage so it survives a refresh but clears
// when the browser tab is closed. Use "member" | "staff" as values.

function getPortalMode(): string | null {
  return sessionStorage.getItem("portalMode") || localStorage.getItem("portalMode");
}

export function setPortalMode(mode: "member" | "staff") {
  sessionStorage.setItem("portalMode", mode);
  localStorage.setItem("portalMode", mode);
}

export function clearPortalMode() {
  sessionStorage.removeItem("portalMode");
  localStorage.removeItem("portalMode");
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [userRole, setUserRole] = useState<string | null>(() => {
    const sessionUser = sessionStorage.getItem("user");
    if (sessionUser) {
      try { return JSON.parse(sessionUser).role; } catch { return null; }
    }
    const localUser = localStorage.getItem("user");
    if (localUser) {
      try { return JSON.parse(localUser).role; } catch { return null; }
    }
    return null;
  });

  // portalMode tracks which dashboard a Staff member chose.
  // Non-staff users are always "member", so this only matters for Staff.
  const [portalMode, setPortalModeState] = useState<string | null>(getPortalMode);

  const [loading, setLoading] = useState(true);
  const authCalledRef = useRef(false);

  const checkAuth = useCallback(async () => {
    if (authCalledRef.current) return;
    authCalledRef.current = true;

    const storedUser = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!storedUser) {
      setUserRole(null);
      setLoading(false);
      return;
    }

    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("XSRF-TOKEN="))
        ?.split("=")[1];

      const response = await fetch("/me", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(token && { "X-XSRF-TOKEN": decodeURIComponent(token) }),
        },
      });

      if (response.ok) {
        const user = await response.json();
        setUserRole(user.role);

        // If this is a Staff user and no portalMode is saved yet, default to
        // "staff" so a fresh login lands on the Staff dashboard.
        if (user.role === "Staff" && !getPortalMode()) {
          setPortalMode("staff");
          setPortalModeState("staff");
        }
      } else {
        // Session expired or invalid — clear everything and go to login.
        localStorage.removeItem("user");
        localStorage.removeItem("isAuthenticated");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("isAuthenticated");
        clearPortalMode();
        setUserRole(null);
      }
    } catch (error) {
      console.error("Auth error:", error);
      // Network error — keep whatever role we have from storage so the user
      // doesn't get kicked out just because the server hiccuped.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ── Listen for portal-switch events dispatched by the login modal or any
  //    "Switch portal" button elsewhere in the app. ──────────────────────────
  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const mode = (e as CustomEvent<"member" | "staff">).detail;
      setPortalMode(mode);
      setPortalModeState(mode);
    };
    window.addEventListener("switchPortal", handleSwitch);
    return () => window.removeEventListener("switchPortal", handleSwitch);
  }, []);

  // ── Keep the address bar honest ───────────────────────────────────────────
  // Login redirects (and a plain "/") don't know the eventual destination
  // ahead of time, so they land on a generic path. Once auth has settled,
  // make sure the URL actually matches what's on screen: unauthenticated
  // always shows "/login", and an authenticated user sitting on "/" or
  // "/login" gets bounced to their real dashboard root instead of the
  // address bar silently disagreeing with the page.
  useEffect(() => {
    if (loading) return;
    const path = window.location.pathname;

    if (!userRole) {
      if (path !== "/login") {
        window.history.replaceState({}, "", "/login");
      }
      return;
    }

    if (path === "/login" || path === "/") {
      const isStaffPortal = userRole === "Staff" && portalMode !== "member";
      window.history.replaceState({}, "", isStaffPortal ? "/admin/dashboard" : "/dashboard");
    }
  }, [loading, userRole, portalMode]);

  // ── Loading splash ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#fcfcf9",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #e5e5e5",
            borderTopColor: "#006666",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Not authenticated → Login ────────────────────────────────────────────
  if (!userRole) {
    return <LoginPage />;
  }

  // ── Non-staff users always see the Member dashboard ──────────────────────
  if (userRole !== "Staff") {
    return <MemberDashboard />;
  }

  // ── Staff: route based on persisted portalMode, not the URL ──────────────
  // If a Staff member chose "Member Portal" from the login modal, portalMode
  // will be "member" and will remain "member" across refreshes until they
  // explicitly switch back or log out.
  if (portalMode === "member") {
    return <MemberDashboard />;
  }

  // Default for Staff: Staff dashboard.
  return <StaffDashboard />;
}
