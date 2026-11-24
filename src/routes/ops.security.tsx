import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ShieldAlert, Smartphone, Laptop, LogOut, KeyRound, Ban } from "lucide-react";

export const Route = createFileRoute("/ops/security")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: SecurityPage });

const sessions = [
  { id: 1, user: "Admin", device: "Chrome / Windows", ip: "103.23.45.10", loc: "Dhaka, BD", since: "2h" },
  { id: 2, user: "Rahim", device: "Safari / iPhone 14", ip: "27.147.12.5", loc: "Chattogram, BD", since: "30m" },
  { id: 3, user: "Karim", device: "Chrome / Android", ip: "180.211.7.8", loc: "Sylhet, BD", since: "1d" },
];

const logins = [
  { id: 1, user: "Admin", at: "2026-06-14 14:02", status: "Success", ip: "103.23.45.10" },
  { id: 2, user: "Unknown", at: "2026-06-14 11:18", status: "Failed", ip: "45.88.11.2" },
  { id: 3, user: "Sumi", at: "2026-06-14 09:55", status: "Success", ip: "203.190.5.2" },
  { id: 4, user: "Unknown", at: "2026-06-13 23:41", status: "Failed", ip: "185.222.61.9" },
];

function SecurityPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Active Sessions", value: sessions.length, icon: ShieldAlert, tone: "text-emerald-600 bg-emerald-500/10" },
          { label: "Failed Attempts (24h)", value: 2, icon: Ban, tone: "text-rose-600 bg-rose-500/10" },
          { label: "Devices Tracked", value: 7, icon: Smartphone, tone: "text-blue-600 bg-blue-500/10" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border bg-card p-4">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${k.tone}`}><k.icon className="h-4 w-4" /></span>
            <p className="mt-3 text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Active Sessions</h3>
        </header>
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Laptop className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{s.user} <span className="text-xs text-muted-foreground">· {s.device}</span></p>
                <p className="text-xs text-muted-foreground">{s.loc} · {s.ip} · {s.since}</p>
              </div>
              <button className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"><KeyRound className="h-3 w-3" /> Reset Pwd</button>
              <button className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"><Ban className="h-3 w-3" /> Disable</button>
              <button className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700"><LogOut className="h-3 w-3" /> Logout</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Login History</h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">User</th><th className="px-4 py-2">When</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">IP</th></tr>
          </thead>
          <tbody className="divide-y">
            {logins.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.user}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.at}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "Success" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{l.status}</span></td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
