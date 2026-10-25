import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Renders children straight into <body> so a full-screen popup always covers
// the whole window (header, sidebar and all) no matter which page or
// container opened it.
export default function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
