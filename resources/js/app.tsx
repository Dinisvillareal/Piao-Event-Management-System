import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import MemberDashboard from "./Pages/Members/Members";
import LoginPage from "./Pages/Login/Login";

import "../css/app.css";

const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}


export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Listen for browser navigation (like the Back button)
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  // 1. If the URL is exactly "/" or "/login", show the Login Page
  if (currentPath === "/" || currentPath === "/login") {
    return <LoginPage />;
  }
  // 2. If it's anything else (like "/dashboard", "/qr", "/events"), show the Member Portal
  return <MemberDashboard />;
}

