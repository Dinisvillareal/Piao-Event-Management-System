import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { LanguageCode, translate } from "./translations";
import api from "../lib/api";

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode, opts?: { userId?: string | number }) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

const STORAGE_KEY = "piao_language";

function readInitialLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "tl" || stored === "ceb") return stored;
  } catch {
    // ignore
  }
  return "en";
}

/**
 * UC-17: Switch Interface Language. Persists to localStorage immediately
 * (works even for guests / before login) and, when a logged-in user id is
 * supplied, also saves it server-side via the resident's profile
 * (`preferred_language`) so the preference follows them across devices.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readInitialLanguage);

  const setLanguage = useCallback((lang: LanguageCode, opts?: { userId?: string | number }) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
    if (opts?.userId) {
      api.put(`/users/${opts.userId}`, { preferred_language: lang }).catch(() => {
        // Non-fatal — the UI already switched; the preference just won't
        // follow the user to another device this time.
      });
    }
  }, []);

  const t = useCallback((key: string) => translate(key, language), [language]);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
