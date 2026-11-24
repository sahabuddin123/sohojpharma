import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import bn from "./locales/bn.json";
import landingEn from "./locales/landing.en.json";
import landingBn from "./locales/landing.bn.json";

const isBrowser = typeof window !== "undefined";

function detectLang(): "en" | "bn" {
  if (!isBrowser) return "bn";
  try {
    const stored = window.localStorage.getItem("pc_lang");
    if (stored === "en" || stored === "bn") return stored;
  } catch {
    /* ignore */
  }
  // Default to Bangla per product requirement
  return "bn";
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
  i18n.on("languageChanged", (lng) => {
    try {
      window.localStorage.setItem("pc_lang", lng);
    } catch {
      /* ignore */
    }
  });
}

export default i18n;
