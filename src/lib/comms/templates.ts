// B9.2 — Email template registry. Simple {{var}} interpolation; safe-by-default
// because callers control the values. For richer HTML, swap for React Email.
type Vars = Record<string, string | number | undefined | null>;

interface Template {
  subject: (v: Vars) => string;
  html: (v: Vars) => string;
}

const wrap = (title: string, body: string) => `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f5f7fb;margin:0;padding:24px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h2 style="margin:0 0 16px;color:#0f172a">${title}</h2>
${body}
<p style="margin-top:32px;font-size:12px;color:#64748b">SohojPharma — Pharmacy Management Suite</p>
</td></tr></table></body></html>`;

export const TEMPLATES: Record<string, Template> = {
  welcome: {
    subject: () => "Welcome to SohojPharma",
    html: (v) => wrap("Welcome", `<p>Hi ${v.name ?? "there"}, your pharmacy <b>${v.pharmacy ?? ""}</b> is ready.</p>`),
  },
  trial_started: {
    subject: () => "Your SohojPharma trial has started",
    html: (v) => wrap("Trial started", `<p>Your ${v.days ?? 14}-day free trial is active until <b>${v.endsAt}</b>.</p>`),
  },
  trial_expiring: {
    subject: () => "Your trial is ending soon",
    html: (v) => wrap("Trial ending soon", `<p>Your trial ends in <b>${v.daysLeft}</b> day(s). Upgrade to keep your data flowing.</p>`),
  },
  subscription_activated: {
    subject: (v) => `Subscription activated: ${v.plan ?? "Pro"}`,
    html: (v) => wrap("Subscription activated", `<p>Your <b>${v.plan}</b> plan is now active. Next billing: <b>${v.nextBilling}</b>.</p>`),
  },
  subscription_renewed: {
    subject: () => "Subscription renewed",
    html: (v) => wrap("Renewed", `<p>Thanks! Your subscription renewed for <b>${v.amount}</b>. Next billing <b>${v.nextBilling}</b>.</p>`),
  },
  payment_success: {
    subject: () => "Payment received",
    html: (v) => wrap("Payment received", `<p>We received <b>${v.amount}</b>. Receipt: ${v.receiptUrl ?? ""}.</p>`),
  },
  payment_failed: {
    subject: () => "Payment failed",
    html: (v) => wrap("Payment failed", `<p>We couldn't charge your card for <b>${v.amount}</b>. Please update payment method.</p>`),
  },
  password_reset: {
    subject: () => "Reset your password",
    html: (v) => wrap("Reset password", `<p>Click below to reset.</p><p><a href="${v.url}">Reset password</a></p>`),
  },
  low_stock: {
    subject: (v) => `Low stock: ${v.product}`,
    html: (v) => wrap("Low stock alert", `<p><b>${v.product}</b> is at <b>${v.qty}</b> (threshold ${v.threshold}).</p>`),
  },
  expiry_alert: {
    subject: (v) => `Expiring soon: ${v.product}`,
    html: (v) => wrap("Expiry alert", `<p><b>${v.product}</b> (batch ${v.batch}) expires on <b>${v.expiresOn}</b> (${v.daysLeft} days).</p>`),
  },
  due_reminder: {
    subject: () => "Payment due reminder",
    html: (v) => wrap("Payment due", `<p>Hi ${v.name}, you have <b>${v.amount}</b> due on <b>${v.dueDate}</b>.</p>`),
  },
  purchase_received: {
    subject: (v) => `Purchase received: ${v.poNumber}`,
    html: (v) => wrap("Purchase received", `<p>GRN <b>${v.grnNumber}</b> received against PO <b>${v.poNumber}</b>.</p>`),
  },
};

export function renderTemplate(name: string, vars: Vars): { subject: string; html: string } | null {
  const t = TEMPLATES[name];
  if (!t) return null;
  return { subject: t.subject(vars), html: t.html(vars) };
}
