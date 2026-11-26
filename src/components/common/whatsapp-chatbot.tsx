import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
}

function normalizeWaNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  if (digits.startsWith("880")) return digits;
  return digits || "8801951413828";
}

export function WhatsAppChatbot({ phone = "01951413828" }: { phone?: string }) {
  const { i18n } = useTranslation();
  const isBn = (i18n.resolvedLanguage ?? i18n.language ?? "bn").startsWith("bn");
  const waNumber = normalizeWaNumber(phone);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      sender: "bot",
      text: isBn
        ? "আসসালামু আলাইকুম! আমি SohojPharma অ্যাসিস্ট্যান্ট। নিচের যেকোনো বিষয় বেছে নিন অথবা আপনার প্রশ্ন লিখুন।"
        : "Hello! Welcome to SohojPharma. Pick a topic below or type your question to chat on WhatsApp.",
    },
  ]);

  const quickReplies = isBn
    ? [
        {
          q: "ফ্রি ট্রায়াল ও প্যাকেজের দাম কত?",
          a: "আমাদের ৭ দিনের ফ্রি ট্রায়াল রয়েছে। মাসিক প্যাকেজ মাত্র ৳৪৯৯ থেকে শুরু। সাইন-আপ করলেই ট্রায়াল চালু করতে পারবেন।",
        },
        {
          q: "অফলাইনে কি বিক্রি করা যাবে?",
          a: "হ্যাঁ! SohojPharma একটি অফলাইন-রেডি PWA। ইন্টারনেট না থাকলেও POS বিক্রি ও কালেকশন সেভ হবে, নেট এলে অটো সিঙ্ক হবে।",
        },
        {
          q: "লাইভ ডেমো দেখতে চাই",
          a: "অবশ্যই! নিচের WhatsApp বাটনে ক্লিক করলেই আমাদের টিম আপনাকে লাইভ ডেমো দেখিয়ে দেবে।",
        },
        {
          q: "সরাসরি সাপোর্টে কথা বলব",
          a: `আমাদের হেল্পলাইন ও WhatsApp নম্বর: ${phone}। নিচে মেসেজ লিখে সরাসরি চ্যাট শুরু করুন।`,
        },
      ]
    : [
        {
          q: "Free trial & pricing?",
          a: "We offer a 7-day free trial, with monthly plans starting from ৳499. Sign up anytime to get started.",
        },
        {
          q: "Does it work offline?",
          a: "Yes! SohojPharma is an offline-ready PWA. You can keep selling and collecting payments offline and sync automatically when back online.",
        },
        {
          q: "Book a live demo",
          a: "Sure! Click 'Open in WhatsApp' below and our team will schedule a quick live walkthrough for your pharmacy.",
        },
        {
          q: "Talk to support",
          a: `You can reach our support team directly on WhatsApp (${phone}). Type your message below to connect.`,
        },
      ];

  function handleQuickPick(item: { q: string; a: string }) {
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `u-${now}`, sender: "user", text: item.q },
      { id: `b-${now + 1}`, sender: "bot", text: item.a },
    ]);
  }

  function openWhatsApp(customText?: string) {
    const lastUserMsg =
      customText?.trim() ||
      [...messages].reverse().find((m) => m.sender === "user")?.text ||
      (isBn ? "আসসালামু আলাইকুম, আমি SohojPharma সম্পর্কে জানতে চাই।" : "Hello, I want to know more about SohojPharma.");
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(lastUserMsg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `u-${now}`, sender: "user", text },
      {
        id: `b-${now + 1}`,
        sender: "bot",
        text: isBn
          ? "ধন্যবাদ! আপনার মেসেজটি WhatsApp-এ পাঠানো হচ্ছে..."
          : "Thanks! Opening WhatsApp with your message...",
      },
    ]);
    setInput("");
    openWhatsApp(text);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[330px] sm:w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-[#0d5c46] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">SohojPharma WhatsApp</p>
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {isBn ? "তাৎক্ষণিক সহায়তা" : "Automated Assistant"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="max-h-64 space-y-2.5 overflow-y-auto bg-[#f4f7f5] p-3.5 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-xs",
                  m.sender === "bot"
                    ? "bg-white text-slate-800 rounded-tl-xs"
                    : "ml-auto bg-[#0d5c46] text-white rounded-tr-xs",
                )}
              >
                {m.text}
              </div>
            ))}

            {/* Quick Reply Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickReplies.map((item) => (
                <button
                  key={item.q}
                  type="button"
                  onClick={() => handleQuickPick(item)}
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d5c46] transition hover:bg-emerald-50"
                >
                  {item.q}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Input + Direct WhatsApp */}
          <div className="border-t border-slate-100 bg-white p-2.5 space-y-2">
            <form onSubmit={handleSend} className="flex items-center gap-1.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isBn ? "আপনার প্রশ্ন লিখুন..." : "Type a message..."}
                className="h-9 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-[#0d5c46] focus:bg-white"
              />
              <button
                type="submit"
                aria-label="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0d5c46] text-white hover:bg-[#094735]"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <button
              type="button"
              onClick={() => openWhatsApp()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2 text-xs font-bold text-white transition hover:brightness-95"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {isBn ? "WhatsApp-এ চ্যাট করুন" : "Open in WhatsApp"}
            </button>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="WhatsApp Chat"
        className="flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:scale-105 active:scale-95"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">{isBn ? "WhatsApp চ্যাট" : "WhatsApp"}</span>
      </button>
    </div>
  );
}
