import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { Plus, CheckSquare, Square, Trash2 } from "lucide-react";

export const Route = createFileRoute("/ops/reminders")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: RemindersPage });

type Task = { id: string; title: string; due: string; type: "supplier" | "customer" | "expiry" | "other"; done: boolean };

const seed: Task[] = [
  { id: "1", title: "Pay Square Pharma — ৳ 18,500", due: "2026-06-15", type: "supplier", done: false },
  { id: "2", title: "Collect due from Rahim Traders — ৳ 6,200", due: "2026-06-15", type: "customer", done: false },
  { id: "3", title: "Review expiring batches (next 30 days)", due: "2026-06-16", type: "expiry", done: false },
  { id: "4", title: "Send statement to Beximco", due: "2026-06-12", type: "supplier", done: true },
];

const toneFor = (t: Task["type"]) => ({
  supplier: "bg-violet-500/10 text-violet-600",
  customer: "bg-emerald-500/10 text-emerald-600",
  expiry: "bg-rose-500/10 text-rose-600",
  other: "bg-blue-500/10 text-blue-600",
})[t];

function RemindersPage() {
  const [tasks, setTasks] = useState(seed);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const add = () => {
    if (!title.trim()) return;
    setTasks((t) => [{ id: crypto.randomUUID(), title, due: due || new Date().toISOString().slice(0, 10), type: "other", done: false }, ...t]);
    setTitle(""); setDue("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Tasks & Reminders</h2>
        <p className="text-sm text-muted-foreground">Supplier payments, customer dues, expiry follow-ups.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New reminder…" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <button onClick={add} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add</button>
      </div>

      <ul className="divide-y rounded-2xl border bg-card">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 p-3">
            <button onClick={() => setTasks((xs) => xs.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="text-muted-foreground hover:text-foreground">
              {t.done ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            </button>
            <div className="flex-1">
              <p className={`text-sm ${t.done ? "line-through text-muted-foreground" : "font-medium"}`}>{t.title}</p>
              <p className="text-[11px] text-muted-foreground">Due {t.due}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${toneFor(t.type)}`}>{t.type}</span>
            <button onClick={() => setTasks((xs) => xs.filter((x) => x.id !== t.id))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {tasks.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No reminders</li>}
      </ul>
    </div>
  );
}
