import React from "react";
import ReactDOM from "react-dom/client";
import MemberDashboard from "./Pages/Members/Members";

import "../css/app.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <MemberDashboard />
  </React.StrictMode>
);
