import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { Boxes, Gift, Percent, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/pharmacy/")({
  head: () => ({ meta: [{ title: "Pharmacy Setup — SohojPharma" }] }),
  errorComponent: (props) => <RouteErrorPanel error={props.error as Error} reset={props.reset} />,
  component: PharmacyHome,
});

const tiles = [
  { to: "/pharmacy/units", icon: Boxes, title: "Unit Conversion", desc: "Box · Strip · Tablet packaging and conversions." },
  { to: "/pharmacy/bonus", icon: Gift, title: "Bonus Purchases", desc: "Track free bonus units received with purchases." },
  { to: "/pharmacy/vat", icon: Percent, title: "VAT Configuration", desc: "Inclusive / exclusive / tax-free per product." },
  { to: "/pharmacy/tax-reports", icon: FileBarChart, title: "Tax Reports", desc: "Sales VAT, purchase VAT and net liability." },
] as const;

function PharmacyHome() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Pharmacy Setup</h1>
        <p className="text-sm text-muted-foreground">Packaging, bonus stock and tax engine.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{desc}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
