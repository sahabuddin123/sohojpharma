// WhatsApp Cloud API provider layer (Meta).
import type { Provider, SendResult, WhatsAppMessage } from "./types";

class MetaCloudProvider implements Provider<WhatsAppMessage> {
  readonly name = "meta_cloud";
  available() {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  }
  async send(msg: WhatsAppMessage): Promise<SendResult> {
    const token = process.env.WHATSAPP_TOKEN!;
    const phoneId = process.env.WHATSAPP_PHONE_ID!;
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const body = msg.templateName
      ? {
          messaging_product: "whatsapp",
          to: msg.to,
          type: "template",
          template: {
            name: msg.templateName,
            language: { code: "en" },
            components: msg.templateParams
              ? [{ type: "body", parameters: Object.values(msg.templateParams).map((t) => ({ type: "text", text: t })) }]
              : undefined,
          },
        }
      : { messaging_product: "whatsapp", to: msg.to, type: "text", text: { body: msg.body ?? "" } };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, provider: this.name, error: `HTTP ${res.status}: ${await res.text()}` };
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { ok: true, provider: this.name, providerMessageId: json.messages?.[0]?.id };
  }
}

class StubProvider implements Provider<WhatsAppMessage> {
  readonly name = "stub";
  available() {
    return !process.env.WHATSAPP_TOKEN;
  }
  async send(_msg: WhatsAppMessage): Promise<SendResult> {
    return { ok: true, provider: this.name, providerMessageId: `wa-stub-${Date.now()}` };
  }
}

const providers: Provider<WhatsAppMessage>[] = [new MetaCloudProvider(), new StubProvider()];

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<SendResult> {
  for (const p of providers) {
    if (!p.available()) continue;
    const r = await p.send(msg);
    if (r.ok) return r;
  }
  return { ok: false, provider: "none", error: "No WhatsApp provider available" };
}
