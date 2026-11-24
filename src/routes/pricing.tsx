import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SohojPharma" },
      { name: "description", content: "Simple, transparent pricing for every pharmacy. Free trial, monthly or yearly. Free, Starter, Professional and Enterprise plans." },
      { property: "og:title", content: "SohojPharma Pricing" },
      { property: "og:description", content: "Plans that scale from a single store to a national chain." },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: PricingPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  price_bdt: number | null;
  price_yearly_bdt: number | null;
  max_products: number | null;
  max_users: number | null;
  max_branches: number | null;
  features: unknown;
  trial_days: number | null;
};

const bdt = (n: number) =>
  n === 0 ? "৳0" : new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n);

function PricingPage() {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["public", "plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,code,name,price_bdt,price_yearly_bdt,max_products,max_users,max_branches,features,trial_days")
        .eq("is_active", true)
        .order("price_bdt", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  return (
    <MarketingShell>
      <section className="border-b border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Simple, transparent pricing</h1>
          <p className="mt-4 text-muted-foreground">Start free for 14 days — no credit card. Upgrade any time.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          {isLoading ? (
            <p className="text-center text-muted-foreground">Loading plans…</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => {
                const featureList = Array.isArray(p.features) ? (p.features as string[]) : [];
                const monthly = Number(p.price_bdt ?? 0);
                const popular = p.code === "professional";
                return (
                  <Card key={p.id} className={popular ? "border-primary shadow-elevated" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{p.name}</CardTitle>
                        {popular && <Badge>Popular</Badge>}
                      </div>
                      <div className="mt-2">
                        <span className="text-3xl font-bold">{bdt(monthly)}</span>
                        <span className="text-sm text-muted-foreground"> /mo</span>
                      </div>
                      {p.price_yearly_bdt ? (
                        <p className="text-xs text-muted-foreground">or {bdt(Number(p.price_yearly_bdt))} /year</p>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {p.max_products ?? "Unlimited"} products</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {p.max_users ?? "Unlimited"} users</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {p.max_branches ?? "Unlimited"} branches</li>
                        {featureList.slice(0, 4).map((f) => (
                          <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {f}</li>
                        ))}
                      </ul>
                      <Button asChild className="mt-6 w-full" variant={popular ? "default" : "outline"}>
                        <Link to="/auth" search={{ redirect: undefined, blocked: undefined }}>{monthly === 0 ? "Start free" : "Start 14-day trial"}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
