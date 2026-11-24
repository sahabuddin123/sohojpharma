import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { Zap, AlertTriangle, CalendarX, CreditCard, Package } from "lucide-react";

export const Route = createFileRoute("/ops/automation")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: AutomationPage });

type Rule = { id: string; icon: any; tone: string; title: string; desc: string; enabled: boolean; channels: string[] };

const initial: Rule[] = [
  { id: "low", icon: Package, tone: "text-orange-600 bg-orange-500/10", title: "Low stock", desc: "Alert when item < MIN level.", enabled: true, channels: ["In-app", "Email"] },
  { id: "out", icon: AlertTriangle, tone: "text-rose-600 bg-rose-500/10", title: "Out of stock", desc: "Alert when item hits zero.", enabled: true, channels: ["In-app", "SMS"] },
  { id: "exp90", icon: CalendarX, tone: "text-amber-600 bg-amber-500/10", title: "Expiring in 90 days", desc: "Daily check across all batches.", enabled: true, channels: ["In-app"] },
  { id: "exp30", icon: CalendarX, tone: "text-rose-600 bg-rose-500/10", title: "Expiring in 30 days", desc: "Urgent expiry alert.", enabled: true, channels: ["In-app", "Email", "SMS"] },
  { id: "sub", icon: CreditCard, tone: "text-violet-600 bg-violet-500/10", title: "Subscription expiry", desc: "Remind 30/15/7/3/1 days before.", enabled: true, channels: ["Banner", "Email"] },
];

function AutomationPage() {
  const [rules, setRules] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Automation Center</h2>
          <p className="text-sm text-muted-foreground">Background rules running for this store.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600"><Zap className="h-3.5 w-3.5" /> {rules.filter((r) => r.enabled).length} active</span>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${r.tone}`}><r.icon className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.channels.map((c) => <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{c}</span>)}
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={r.enabled} onChange={() => setRules((rs) => rs.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} />
                <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
