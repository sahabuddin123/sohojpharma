import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import bn from "./locales/bn.json";
import landingEn from "./locales/landing.en.json";
import landingBn from "./locales/landing.bn.json";

export type AppLanguage = "en" | "bn";

export const PC_LANG_KEY = "pc_lang";
export const PC_LANG_EXPLICIT_KEY = "pc_lang_user";

const isBrowser = typeof window !== "undefined";

export function detectLang(): AppLanguage {
  if (!isBrowser) return "bn";
  try {
    const explicit = window.localStorage.getItem(PC_LANG_EXPLICIT_KEY);
    if (explicit === "en" || explicit === "bn") return explicit;
    const stored = window.localStorage.getItem(PC_LANG_KEY);
    if (stored === "en" || stored === "bn") return stored;
  } catch {
    /* ignore */
  }
  // Default to Bangla per product requirement
  return "bn";
}

export function hasExplicitLangPreference(): boolean {
  if (!isBrowser) return false;
  try {
    const explicit = window.localStorage.getItem(PC_LANG_EXPLICIT_KEY);
    const stored = window.localStorage.getItem(PC_LANG_KEY);
    return explicit === "en" || explicit === "bn" || stored === "en" || stored === "bn";
  } catch {
    return false;
  }
}

const enResources = { ...en, landing: landingEn } as Record<string, unknown>;
const bnResources = { ...bn, landing: landingBn } as Record<string, unknown>;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: enResources }, bn: { translation: bnResources } },
    lng: detectLang(),
    fallbackLng: "en",
    supportedLngs: ["en", "bn"],
    ns: ["translation"],
    defaultNS: "translation",
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

if (isBrowser) {
  document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language ?? "bn";
  i18n.on("languageChanged", (lng) => {
    const clean: AppLanguage = lng === "en" ? "en" : "bn";
    try {
      window.localStorage.setItem(PC_LANG_KEY, clean);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = clean;
  });
}

export async function setAppLanguage(next: AppLanguage): Promise<void> {
  if (isBrowser) {
    try {
      window.localStorage.setItem(PC_LANG_KEY, next);
      window.localStorage.setItem(PC_LANG_EXPLICIT_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next;
  }
  if ((i18n.resolvedLanguage ?? i18n.language) !== next) {
    await i18n.changeLanguage(next).catch(() => {});
  }
}

export default i18n;
