import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/api/subscriptions.functions";
import { Button } from "@/components/ui/button";

export function SubscriptionBanner() {
  const { t } = useTranslation();
  const fetchSub = useServerFn(getMySubscription);
  const { data } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
    staleTime: 60_000,
    retry: false,
  });

  if (!data) return null;
  const status = (data as any).status as string;
  if (status === "active" || status === "trial") return null;

  const messageKey =
    status === "past_due"
      ? "billing.banner.past_due"
      : status === "expired"
        ? "billing.banner.expired"
        : status === "cancelled"
          ? "billing.banner.cancelled"
          : null;
  if (!messageKey) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-medium">{t(messageKey)}</p>
      <Button asChild size="sm" variant="destructive">
        <Link to="/billing">{t("billing.banner.renew")}</Link>
      </Button>
    </div>
  );
}
