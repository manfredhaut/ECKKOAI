import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";

const STORAGE_KEY = "language";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

function getStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(stored ?? "")
    ? (stored as Language)
    : "pt-BR";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "pt-BR": { translation: ptBR },
  },
  lng: getStoredLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
