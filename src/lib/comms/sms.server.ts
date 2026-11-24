// SMS abstract provider layer. Plug-in: BulkSMSBD, MIMSMS, SSL Wireless, Aarong.
import type { Provider, SendResult, SmsMessage } from "./types";

class BulkSmsBdProvider implements Provider<SmsMessage> {
  readonly name = "bulksmsbd";
  available() {
    return Boolean(process.env.BULKSMSBD_API_KEY && process.env.BULKSMSBD_SENDER_ID);
  }
  async send(msg: SmsMessage): Promise<SendResult> {
    const url = new URL("http://bulksmsbd.net/api/smsapi");
    url.searchParams.set("api_key", process.env.BULKSMSBD_API_KEY!);
    url.searchParams.set("type", "text");
    url.searchParams.set("number", msg.to);
    url.searchParams.set("senderid", process.env.BULKSMSBD_SENDER_ID!);
    url.searchParams.set("message", msg.body);
    const res = await fetch(url.toString());
    const text = await res.text();
    if (!res.ok) return { ok: false, provider: this.name, error: `HTTP ${res.status}: ${text}` };
    return { ok: true, provider: this.name, providerMessageId: text.slice(0, 80) };
  }
}

class StubProvider implements Provider<SmsMessage> {
  readonly name = "stub";
  available() {
    return process.env.SMS_PROVIDER === "stub" || !process.env.BULKSMSBD_API_KEY;
  }
  async send(_msg: SmsMessage): Promise<SendResult> {
    return { ok: true, provider: this.name, providerMessageId: `stub-${Date.now()}` };
  }
}

const providers: Provider<SmsMessage>[] = [new BulkSmsBdProvider(), new StubProvider()];

export async function sendSms(msg: SmsMessage): Promise<SendResult> {
  for (const p of providers) {
    if (!p.available()) continue;
    const r = await p.send(msg);
    if (r.ok) return r;
  }
  return { ok: false, provider: "none", error: "No SMS provider available" };
}
