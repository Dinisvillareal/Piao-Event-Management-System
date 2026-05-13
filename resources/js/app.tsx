import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import MemberDashboard from "./Pages/Members/Members";
import Staff from "./Pages/Staff/Staff";
import LoginPage from "./Pages/Login/Login";

import "../css/app.css";

const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Listen for browser navigation
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // LOGIN PAGE
  if (currentPath === "/" || currentPath === "/login") {
    return <LoginPage />;
  }

  // STAFF PAGE
  if (currentPath.startsWith("/staff")) {
    return <Staff />;
  }

  // MEMBER PAGE
  return <MemberDashboard />;
}
