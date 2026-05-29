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
    // Initialize from storage immediately - NO FLASH
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        return JSON.parse(sessionUser).role;
      } catch {
        return null;
      }
    }
    const localUser = localStorage.getItem('user');
    if (localUser) {
      try {
        return JSON.parse(localUser).role;
      } catch {
        return null;
      }
    }
    return null;
  });
  
  const [loading, setLoading] = useState(false); // Start as false since we have initial state
  const authCalledRef = useRef(false);

  const checkAuth = useCallback(async () => {
    if (authCalledRef.current) return;
    authCalledRef.current = true;
    
    // Only verify with backend if we have a stored user
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
        // Backend says not authenticated, clear storage
        localStorage.removeItem('user');
        localStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('isAuthenticated');
        setUserRole(null);
      }
    } catch (error) {
      console.error("Auth error:", error);
      // Don't clear on network error - keep existing state
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Not authenticated - show login page
  if (!userRole) {
    return <LoginPage />;
  }

  // Authenticated - show appropriate dashboard immediately (no flash)
  return userRole === 'Staff' ? <StaffDashboard /> : <MemberDashboard />;
}