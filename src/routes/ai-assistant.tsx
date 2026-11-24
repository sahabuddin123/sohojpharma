import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Mic, MicOff, Volume2, VolumeX, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/ai-assistant")({
  component: AiAssistantPage,
});

const SUGGESTIONS_EN = [
  "Today's sales?",
  "What is this month's profit?",
  "Top 5 selling medicines this month",
  "Which customers have outstanding dues?",
  "Show medicines expiring in 30 days",
  "Current inventory value",
];
const SUGGESTIONS_BN = [
  "আজকের বিক্রি কত?",
  "এই মাসে লাভ কত?",
  "সবচেয়ে বেশি বিক্রি হওয়া ওষুধ",
  "কারা due আছে?",
  "কোন ওষুধ শেষ হতে যাচ্ছে?",
];

type SpeechRecCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

function getSpeechRec(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function detectBangla(s: string) {
  return /[\u0980-\u09FF]/.test(s);
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function AiAssistantPage() {
  const { session, currentTenantId } = useAuth();
  const [input, setInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const speechSupported = useMemo(() => !!getSpeechRec(), []);
  const lastSpoken = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai-assistant/chat",
        headers: () => ({
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        }),
        body: () => ({ tenantId: currentTenantId }),
      }),
    [session?.access_token, currentTenantId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    id: `pharma-ai-${currentTenantId ?? "anon"}`,
    transport,
  });

  // TTS for completed assistant responses
  useEffect(() => {
    if (!ttsOn) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = last.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join(" ")
      .trim();
    if (!text || text === lastSpoken.current) return;
    lastSpoken.current = text;
    speak(text, detectBangla(text) ? "bn-BD" : "en-US");
  }, [messages, status, ttsOn]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [status]);

  const startListening = () => {
    const Ctor = getSpeechRec();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = voiceOn ? "bn-BD" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) {
        void sendMessage({ text });
        setInput("");
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => {
    recRef.current?.stop();
    setListening(false);
  };

  void input;

  const suggestions = voiceOn ? SUGGESTIONS_BN : SUGGESTIONS_EN;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SohojPharma AI</h1>
            <p className="text-xs text-muted-foreground">
              Ask about sales, profit, inventory, dues — in Bangla or English.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={voiceOn ? "default" : "outline"}
            size="sm"
            onClick={() => setVoiceOn((v) => !v)}
            title="Toggle Bangla input"
          >
            {voiceOn ? "বাংলা" : "EN"}
          </Button>
          <Button
            type="button"
            variant={ttsOn ? "default" : "outline"}
            size="icon"
            onClick={() => {
              setTtsOn((v) => !v);
              if (ttsOn && typeof window !== "undefined") window.speechSynthesis.cancel();
            }}
            title="Toggle voice replies"
          >
            {ttsOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <Conversation className="flex-1 rounded-lg border bg-card">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="How can I help your pharmacy today?"
              description="Try one of these to get started."
            >
              <div className="mt-4 grid w-full max-w-md gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left font-normal"
                    onClick={() => sendMessage({ text: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m: UIMessage) => (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return <MessageResponse key={i}>{part.text}</MessageResponse>;
                    }
                    if (part.type?.startsWith("tool-")) {
                      const p = part as {
                        type: string;
                        state?: string;
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      const toolName = p.type.replace(/^tool-/, "");
                      const state = (p.state ?? "input-streaming") as
                        | "input-streaming"
                        | "input-available"
                        | "output-available"
                        | "output-error";
                      return (
                        <Tool key={i} defaultOpen={false}>
                          <ToolHeader type={`tool-${toolName}`} state={state} />
                          <ToolContent>
                            <ToolInput input={p.input} />
                            <ToolOutput
                              output={
                                p.output ? (
                                  <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                                    {typeof p.output === "string"
                                      ? p.output
                                      : JSON.stringify(p.output, null, 2)}
                                  </pre>
                                ) : null
                              }
                              errorText={p.errorText}
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <Card className="border-destructive bg-destructive/5 p-3 text-sm text-destructive">
              {error.message}
            </Card>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={(message, e) => {
          e.preventDefault();
          const text = (message.text ?? input).trim();
          if (!text || !currentTenantId) return;
          setInput("");
          void sendMessage({ text });
        }}
      >
        <PromptInputTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voiceOn ? "প্রশ্ন লিখুন…" : "Ask about your business…"}
          disabled={!currentTenantId}
        />
        <PromptInputFooter className="justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {speechSupported ? (
              <Button
                type="button"
                size="icon-sm"
                variant={listening ? "default" : "ghost"}
                onClick={listening ? stopListening : startListening}
                title="Voice input"
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
            <span>Powered by Lovable AI · Gemini</span>
          </div>
          <PromptInputSubmit
            status={status}
            disabled={!input.trim() || !currentTenantId || status === "streaming"}
            onClick={status === "streaming" ? () => stop() : undefined}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

// Re-export so unused import does not trip tree shaking on build
void supabase;
