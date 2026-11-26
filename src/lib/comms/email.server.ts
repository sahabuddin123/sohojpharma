// Email provider abstraction. Primary: SMTP (SohojPharma Mail). Fallback: Resend.
// All env reads happen at call time.
import nodemailer from "nodemailer";
import type { EmailMessage, Provider, SendResult } from "./types";

class SmtpProvider implements Provider<EmailMessage> {
  readonly name = "smtp";

  available() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      return { ok: false, provider: this.name, error: "SMTP configuration missing" };
    }
    const isSecure = process.env.SMTP_SECURE === "true" || port === 465;
    const rejectUnauthorized =
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false" ? false : host !== "127.0.0.1";

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized,
        },
      });

      const from = msg.from ?? process.env.EMAIL_FROM ?? `SohojPharma <${user}>`;

      const info = await transporter.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        replyTo: msg.replyTo,
      });

      return {
        ok: true,
        provider: this.name,
        providerMessageId: info.messageId,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        error: `SMTP error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

class ResendProvider implements Provider<EmailMessage> {
  readonly name = "resend";

  available() {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, provider: this.name, error: "RESEND_API_KEY missing" };
    const from = msg.from ?? process.env.EMAIL_FROM ?? "SohojPharma <support@sohojpharma.cloud>";
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

const providers: Provider<EmailMessage>[] = [new SmtpProvider(), new ResendProvider()];

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  let lastError = "No email provider available";
  for (const p of providers) {
    if (!p.available()) continue;
    const r = await p.send(msg);
    if (r.ok) return r;
    lastError = r.error ?? "Send failed";
  }
  return { ok: false, provider: "none", error: lastError };
}
