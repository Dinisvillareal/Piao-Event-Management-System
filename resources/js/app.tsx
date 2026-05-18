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

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import MemberDashboard from "./Pages/Members/Members";
import StaffDashboard from "./Pages/Staff/Staff";
import LoginPage from "./Pages/Login/Login";


const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}


export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for browser navigation
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  // Fetch user role
  useEffect(() => {
    fetch('/me', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('Not logged in');
    })
    .then(user => {
      setUserRole(user.role);
    })
    .catch(() => {
      setUserRole(null);
    })
    .finally(() => {
      setLoading(false);
    });
  }, []);

  // Show loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fcfcf9]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
      </div>
    );
  }

  // Not logged in
  if (!userRole) {
    return <LoginPage />;
  }

  // Staff role - show staff dashboard
  if (userRole === 'Staff') {
    return <StaffDashboard />;
  }

  // Default: Member dashboard
  return <MemberDashboard />;
}