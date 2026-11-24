// Shared types for the communication layer (email / SMS / WhatsApp / push).
export type CommChannel = "email" | "sms" | "whatsapp" | "push";

export interface SendResult {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SmsMessage {
  to: string; // E.164 or local; provider may normalize
  body: string;
}

export interface WhatsAppMessage {
  to: string;
  body?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  mediaUrl?: string;
}

export interface Provider<TMsg> {
  readonly name: string;
  send(msg: TMsg): Promise<SendResult>;
  available(): boolean;
}
