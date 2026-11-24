import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildTools, makeUserSupabase } from "@/lib/ai-assistant/tools.server";

const SYSTEM = `You are SohojPharma AI — a bilingual (Bangla + English) business assistant for a pharmacy ERP.

You can answer questions about live sales, profit, inventory, dues, customers, expiring medicines, and business health, by calling the provided tools.

Rules:
- Always call a tool to get real data before answering — never invent numbers.
- Mirror the user's language: reply in Bangla when asked in Bangla, English when asked in English.
- Use ৳ for currency. Format large numbers with thousand separators.
- Keep replies short, structured, and actionable. Use bullet points or small tables when listing items.
- If asked to "modify" or "create" something, explain that you can only suggest — the user must take the action.`;

export const Route = createFileRoute("/api/ai-assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages?: UIMessage[]; tenantId?: string };
        if (!Array.isArray(body.messages) || !body.tenantId) {
          return new Response("Missing messages or tenantId", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = makeUserSupabase(token);
        const tools = buildTools(supabase, body.tenantId);
        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM,
          messages: await convertToModelMessages(body.messages),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});
