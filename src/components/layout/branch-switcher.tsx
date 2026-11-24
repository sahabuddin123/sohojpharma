import { Check, GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveBranch } from "@/hooks/use-active-branch";

const ROLE_LABEL: Record<string, { en: string; bn: string }> = {
  head_office: { en: "HQ", bn: "প্রধান" },
  branch: { en: "Branch", bn: "শাখা" },
  sub_branch: { en: "Sub", bn: "উপ-শাখা" },
};

export function BranchSwitcher() {
  const { t, i18n } = useTranslation();
  const { branches, branchId, setBranchId, selected } = useActiveBranch();
  const lang = (i18n.language?.startsWith("bn") ? "bn" : "en") as "en" | "bn";

  if (branches.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex h-9 gap-2 rounded-xl border-border/70 px-2 md:px-3"
          aria-label={t("topbar.switchBranch", "Switch branch")}
        >
          <GitBranch className="h-4 w-4 text-primary" />
          <span className="hidden max-w-[140px] truncate text-xs font-semibold md:inline">
            {selected?.name ?? t("topbar.branch", "Branch")}
          </span>
          {selected?.branch_role === "head_office" && (
            <Badge variant="secondary" className="hidden h-4 px-1.5 text-[9px] uppercase md:inline-flex">
              {ROLE_LABEL.head_office[lang]}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuLabel>{t("topbar.switchBranch", "Switch branch")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => setBranchId(b.id)}
            className="gap-2"
          >
            <span className="flex-1 truncate">{b.name}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {ROLE_LABEL[b.branch_role]?.[lang] ?? b.branch_role}
            </Badge>
            {b.id === branchId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
