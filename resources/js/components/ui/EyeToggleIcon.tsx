import React from "react";

/**
 * Show/hide-password icon -- the same one the login page uses, so every
 * password box in the app looks identical. `visible` = the password is
 * currently shown (icon = "tap to hide": a bare arc); otherwise it's masked
 * (icon = "tap to reveal": the arc with a hollow pupil ring beneath it).
 */
export default function EyeToggleIcon({ visible, size = 18, className = "" }: { visible: boolean; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className || "text-white/50"} aria-hidden="true">
      {visible ? (
        <path
          d="M4 13c1.8-4.2 5-6.8 8-6.8s6.2 2.6 8 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M4 12.5c1.8-4.3 5-6.3 8-6.3s6.2 2 8 6.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12.7" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
