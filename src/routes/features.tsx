import { createFileRoute } from "@tanstack/react-router";
import { Pill, ShieldCheck, Activity, BarChart3, Globe, Smartphone, Boxes, Receipt, Users, CreditCard, Cloud, Bell } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — SohojPharma Pharmacy ERP" },
      { name: "description", content: "Inventory, POS, prescriptions, accounting, multi-branch, and offline-ready PWA — every feature your pharmacy needs." },
      { property: "og:title", content: "SohojPharma Features" },
      { property: "og:description", content: "Everything a modern pharmacy needs in one platform." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/features" }],
  }),
  component: FeaturesPage,
});

const features = [
  { icon: Pill, title: "Smart Inventory", text: "Batch, expiry & barcode tracking with FEFO and low-stock alerts." },
  { icon: Activity, title: "POS & Billing", text: "Fast checkout, prescriptions, insurance, split tenders and returns." },
  { icon: BarChart3, title: "Real-time Reports", text: "Sales, margin, GST/VAT, stock and party-ledger dashboards." },
  { icon: ShieldCheck, title: "Multi-tenant", text: "Run unlimited stores with isolated data, RLS and roles." },
  { icon: Boxes, title: "Purchase & GRN", text: "POs, supplier ledger, partial receipts and batch costing." },
  { icon: Receipt, title: "Accounting", text: "Double-entry journals, chart of accounts and P&L out of the box." },
  { icon: Users, title: "Customer CRM", text: "Loyalty points, due ledger, doctors, prescriptions and patients." },
  { icon: CreditCard, title: "Payments", text: "Cash, bKash, Nagad, card and split payments — fully reconciled." },
  { icon: Cloud, title: "Cloud Sync", text: "Always up-to-date across branches with real-time backend." },
  { icon: Globe, title: "English & বাংলা", text: "Full bilingual UI for local teams." },
  { icon: Smartphone, title: "Offline PWA", text: "Install on any device, keep selling without internet." },
  { icon: Bell, title: "Smart Alerts", text: "Expiry, low-stock, dues and payment-failed notifications." },
];

function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Built for pharmacy operations</h1>
          <p className="mt-4 text-muted-foreground">From single-store independents to multi-branch chains — SohojPharma scales with you.</p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
