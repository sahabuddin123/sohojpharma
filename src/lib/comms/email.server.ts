// Email provider abstraction. Primary: Resend. Fallback: SMTP (placeholder).
// All env reads happen at call time (Worker runtime injects at request).
import type { EmailMessage, Provider, SendResult } from "./types";

class ResendProvider implements Provider<EmailMessage> {
  readonly name = "resend";
  available() {
    return Boolean(process.env.RESEND_API_KEY);
  }
  async send(msg: EmailMessage): Promise<SendResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, provider: this.name, error: "RESEND_API_KEY missing" };
    const from = msg.from ?? process.env.EMAIL_FROM ?? "SohojPharma <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo,
      }),
    });
    if (!res.ok) {
      return { ok: false, provider: this.name, error: `Resend ${res.status}: ${await res.text()}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, provider: this.name, providerMessageId: json.id };
  }
}

class SmtpFallbackProvider implements Provider<EmailMessage> {
  readonly name = "smtp";
  available() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  async send(_msg: EmailMessage): Promise<SendResult> {
    // SMTP requires Node net which is workerd-restricted; left as wiring point.
    return { ok: false, provider: this.name, error: "SMTP fallback not configured (wire nodemailer-compatible provider)." };
  }
}

const providers: Provider<EmailMessage>[] = [new ResendProvider(), new SmtpFallbackProvider()];

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  for (const p of providers) {
    if (!p.available()) continue;
    const r = await p.send(msg);
    if (r.ok) return r;
  }
  return { ok: false, provider: "none", error: "No email provider available or all failed" };
}
