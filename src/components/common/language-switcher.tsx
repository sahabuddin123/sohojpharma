import { useTranslation } from "react-i18next";
import { Check, Languages } from "lucide-react";
import { setAppLanguage } from "@/i18n";
import { useUIStore } from "@/stores/ui-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language) === "en" ? "en" : "bn";

  const pick = async (next: "en" | "bn") => {
    await setAppLanguage(next);
    useUIStore.setState({ language: next });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void pick("en")} className="justify-between gap-2">
          <span>English</span>
          {current === "en" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void pick("bn")} className="justify-between gap-2">
          <span>বাংলা (Bangla)</span>
          {current === "bn" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
