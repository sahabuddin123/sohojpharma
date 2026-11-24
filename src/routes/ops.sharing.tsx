import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { MessageCircle, Send, Mail, Link2, FileText, Printer } from "lucide-react";

export const Route = createFileRoute("/ops/sharing")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: SharingPage });

const smsTemplates = [
  { id: "sale", name: "Sale Confirmation", body: "Hi {{customer}}, your bill {{invoice}} of ৳{{amount}} is confirmed. Thank you — SohojPharma." },
  { id: "due", name: "Due Reminder", body: "Reminder: ৳{{amount}} is outstanding on {{invoice}}. Please clear by {{due_date}}." },
  { id: "pay", name: "Payment Confirmation", body: "Received ৳{{amount}} against {{invoice}}. Balance ৳{{balance}}." },
  { id: "rdy", name: "Medicine Ready", body: "Your medicines are ready for pickup at {{store}}." },
];

const emailTemplates = [
  { id: "welcome", name: "Welcome Email", subject: "Welcome to SohojPharma" },
  { id: "sub", name: "Subscription Activated", subject: "Your subscription is active" },
  { id: "pay", name: "Payment Confirmation", subject: "Payment received" },
  { id: "pwd", name: "Password Reset", subject: "Reset your password" },
];

function SharingPage() {
  const [tab, setTab] = useState<"share" | "sms" | "email">("share");
  const invoice = { id: "INV-2410", customer: "Rahim", phone: "+8801712345678", amount: 1240, url: "https://pharma.cloud/i/INV-2410" };
  const msg = encodeURIComponent(`Hi ${invoice.customer}, your invoice ${invoice.id} (৳${invoice.amount}) — ${invoice.url}`);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {[
          { k: "share", l: "Share Invoice" },
          { k: "sms", l: "SMS Templates" },
          { k: "email", l: "Email Templates" },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.k ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "share" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-semibold">Invoice {invoice.id}</p>
            <p className="text-xs text-muted-foreground">Customer {invoice.customer} · ৳{invoice.amount}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`https://wa.me/${invoice.phone.replace("+", "")}?text=${msg}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
              <a href={`https://www.facebook.com/dialog/send?app_id=0&link=${encodeURIComponent(invoice.url)}&redirect_uri=${encodeURIComponent(invoice.url)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Send className="h-4 w-4" /> Messenger
              </a>
              <a href={`mailto:?subject=Invoice ${invoice.id}&body=${msg}`} className="inline-flex items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                <Mail className="h-4 w-4" /> Email
              </a>
              <button onClick={() => navigator.clipboard?.writeText(invoice.url)} className="inline-flex items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                <Link2 className="h-4 w-4" /> Copy link
              </button>
              <button className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                <FileText className="h-4 w-4" /> Download PDF
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Invoice format</p>
              <div className="flex rounded-md border p-0.5 text-xs">
                <button className="rounded bg-primary px-2 py-1 text-primary-foreground">Thermal</button>
                <button className="px-2 py-1 text-muted-foreground">A4</button>
              </div>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
{`        SohojPharma
       58mm Thermal
------------------------------
${invoice.id}        ${new Date().toLocaleDateString()}
Customer: ${invoice.customer}
------------------------------
Napa 500mg x2          40.00
Antacid Plus x1        25.00
------------------------------
TOTAL              ৳ ${invoice.amount.toFixed(2)}
------------------------------
       Thank you!`}
            </pre>
            <button className="mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><Printer className="h-3.5 w-3.5" /> Print</button>
          </div>

          <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
            <p className="text-sm font-semibold">Also shareable</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border px-3 py-1">Due Statement</span>
              <span className="rounded-full border px-3 py-1">Customer Ledger</span>
            </div>
          </div>
        </div>
      )}

      {tab === "sms" && (
        <div className="space-y-3">
          {smsTemplates.map((t) => (
            <div key={t.id} className="rounded-2xl border bg-card p-4">
              <p className="text-sm font-semibold">{t.name}</p>
              <textarea defaultValue={t.body} rows={2} className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm" />
              <p className="mt-1 text-[11px] text-muted-foreground">Variables: <code>{"{{customer}} {{invoice}} {{amount}} {{due_date}}"}</code></p>
            </div>
          ))}
        </div>
      )}

      {tab === "email" && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Template</th><th className="px-4 py-2">Subject</th><th className="px-4 py-2 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y">
              {emailTemplates.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.subject}</td>
                  <td className="px-4 py-2.5 text-right"><button className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
