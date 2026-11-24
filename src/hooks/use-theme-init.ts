import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

export function useThemeInit() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
