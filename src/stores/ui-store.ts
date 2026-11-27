import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n, { detectLang, setAppLanguage } from "@/i18n";

export type Theme = "light" | "dark";
export type Language = "en" | "bn";
export type DesktopUiVersion = "v1" | "v2";

interface UIState {
  theme: Theme;
  language: Language;
  sidebarCollapsed: boolean;
  desktopUiVersion: DesktopUiVersion;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setLanguage: (l: Language) => void;
  toggleSidebar: () => void;
  setDesktopUiVersion: (v: DesktopUiVersion) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "light",
      language: detectLang(),
      sidebarCollapsed: false,
      desktopUiVersion: "v1",
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      setLanguage: (language) => {
        set({ language });
        if ((i18n.resolvedLanguage ?? i18n.language) !== language) {
          void setAppLanguage(language);
        } else if (typeof document !== "undefined") {
          document.documentElement.lang = language;
        }
      },
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setDesktopUiVersion: (desktopUiVersion) => {
        set({ desktopUiVersion });
        if (typeof document !== "undefined") {
          document.documentElement.dataset.desktopUi = desktopUiVersion;
        }
      },
    }),
    {
      name: "sohojpharma-ui",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          const resolved = detectLang();
          if (state.language !== resolved) {
            state.language = resolved;
          }
          document.documentElement.lang = resolved;
          document.documentElement.classList.toggle("dark", state.theme === "dark");
          document.documentElement.dataset.desktopUi = state.desktopUiVersion ?? "v1";
        }
      },
    },
  ),
);

