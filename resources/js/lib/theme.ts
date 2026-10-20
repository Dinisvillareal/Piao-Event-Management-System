// Light / dark preference for the staff and member portals.
//
// The portals are authored dark-first; css/theme-light.css re-colours them when
// <html data-theme="light"> is present. The attribute is only applied while a
// portal page is mounted (useThemeScope), so the login screen stays dark.
import { useEffect, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "piao-theme";

// The app calls localStorage.clear() on login and logout, which would wipe a
// localStorage-only preference. A long-lived cookie survives that, so the
// choice made on the login page is still there on the dashboard (and back).
const readCookie = (): Theme | null => {
  try {
    const m = document.cookie.match(/(?:^|;\s*)piao-theme=(light|dark)/);
    return m ? (m[1] as Theme) : null;
  } catch {
    return null;
  }
};

const read = (): Theme => {
  const c = readCookie();
  if (c) return c;
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

const persist = (t: Theme) => {
  try {
    document.cookie = `piao-theme=${t}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode / blocked storage */
  }
};

let current: Theme = read();
let scopes = 0;
const listeners = new Set<() => void>();

// Every screen that loads this module is the login page or a portal, so the
// attribute simply follows the saved choice (the blade layout also sets it
// before first paint -- see app.blade.php -- to avoid a dark flash on reload).
const apply = () => {
  const el = document.documentElement;
  if (current === "light") el.setAttribute("data-theme", "light");
  else el.removeAttribute("data-theme");
};
apply();

export const setTheme = (next: Theme) => {
  if (next === current) return;
  current = next;
  persist(next);
  apply();
  listeners.forEach((l) => l());
};

// Keep other open tabs / the login and dashboard pages in step with each other.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    current = read();
    apply();
    listeners.forEach((l) => l());
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Current theme + toggle, for the header button. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, () => current, () => "dark" as Theme);
  return { theme, toggle: () => setTheme(current === "light" ? "dark" : "light") };
}

/** Call once from a portal page (Staff / Members) to switch the theme on for it. */
export function useThemeScope() {
  useEffect(() => {
    scopes += 1;
    apply();
    return () => {
      scopes -= 1;
      apply();
    };
  }, []);
}
