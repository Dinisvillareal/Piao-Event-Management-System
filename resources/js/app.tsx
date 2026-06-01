// import React, { useEffect, useState } from "react";
// import ReactDOM from "react-dom/client";
// import MemberDashboard from "./Pages/Members/Members";
// import LoginPage from "./Pages/Login/Login";


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
import MemberDashboard from "./Pages/Members/Members";
import StaffDashboard from "./Pages/Staff/Staff";
import LoginPage from "./Pages/Login/Login";

const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}

export default function App() {
  const [userRole, setUserRole] = useState<string | null>(() => {
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try { return JSON.parse(sessionUser).role; } catch { return null; }
    }
    const localUser = localStorage.getItem('user');
    if (localUser) {
      try { return JSON.parse(localUser).role; } catch { return null; }
    }
    return null;
  });

  const [loading, setLoading] = useState(false);
  const authCalledRef = useRef(false);

  const checkAuth = useCallback(async () => {
    if (authCalledRef.current) return;
    authCalledRef.current = true;

    const storedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (!storedUser) {
      setUserRole(null);
      return;
    }

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

      const response = await fetch('/me', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(token && { 'X-XSRF-TOKEN': decodeURIComponent(token) })
        }
      });

      if (response.ok) {
        const user = await response.json();
        setUserRole(user.role);
      } else {
        localStorage.removeItem('user');
        localStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('isAuthenticated');
        setUserRole(null);
      }
    } catch (error) {
      console.error("Auth error:", error);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Not authenticated — show login
  if (!userRole) {
    return <LoginPage />;
  }

  // ── Staff who explicitly navigated to /dashboard → show MemberDashboard ──
  // This handles the case where a staff member chose "Member Dashboard"
  // from the portal selection modal on login.
  const path = window.location.pathname;
  const isMemberRoute = path.startsWith('/dashboard');

  if (userRole === 'Staff' && isMemberRoute) {
    return <MemberDashboard />;
  }

  // Default: Staff → StaffDashboard, everyone else → MemberDashboard
  return userRole === 'Staff' ? <StaffDashboard /> : <MemberDashboard />;
}
