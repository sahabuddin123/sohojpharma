import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useFeature } from "@/hooks/use-feature";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanFeature } from "@/lib/api/middleware/require-feature";

interface FeatureGateProps {
  feature: PlanFeature;
  children: React.ReactNode;
  /** Optional custom fallback. Default is the upgrade card. */
  fallback?: React.ReactNode;
}

/**
 * Client-side render gate for a feature flag.
 *
 * NOTE: This is presentation only. Server functions MUST also enforce
 * the same flag via `requireFeature(...)`; never rely on this component
 * to protect data.
 */
export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { enabled, loading } = useFeature(feature);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  }
  if (enabled) return <>{children}</>;
  return <>{fallback ?? <UpgradeCard feature={feature} />}</>;
}

export function UpgradeCard({ feature }: { feature: PlanFeature }) {
  return (
    <div className="p-6">
      <Card className="max-w-lg mx-auto border-dashed">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">
            Upgrade your subscription to access this feature.
          </h2>
          <p className="text-sm text-muted-foreground">
            The <span className="font-mono">{feature}</span> module is not included
            in your current plan.
          </p>
          <Button asChild>
            <Link to="/billing">View plans</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
