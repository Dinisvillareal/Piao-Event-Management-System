import api from "./api";

type LangCode = "en" | "tl" | "ceb";
type TranslationMap = Record<string, Partial<Record<LangCode, string>>>;

let translations: TranslationMap = {};
let loaded = false;
let loading: Promise<void> | null = null;

export async function loadContentTranslations(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;

  loading = api.get("/content-translations", { skipAuthRedirect: true } as any)
    .then((res) => {
      translations = res.data ?? {};
      loaded = true;
    })
    .catch((err) => {
      console.error("Failed to load content translations:", err);
      translations = {};
      loaded = true;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

export function tc(text: string | null | undefined, lang: LangCode): string {
  if (!text || lang === "en") return text ?? "";
  const entry = translations[text];
  if (!entry) return text;
  return entry[lang] ?? text;
}