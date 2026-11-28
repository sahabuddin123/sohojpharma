import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildTools, makeUserSupabase } from "@/lib/ai-assistant/tools.server";

const UUID_Z = z.string().uuid();

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
        const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => null)) as
          | { messages?: UIMessage[]; tenantId?: string }
          | null;
        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("Missing messages or tenantId", { status: 400 });
        }
        if (body.messages.length > 50) {
          return new Response("Too many messages in conversation", { status: 400 });
        }
        const tenantParsed = UUID_Z.safeParse(body.tenantId);
        if (!tenantParsed.success) {
          return new Response("Invalid tenantId", { status: 400 });
        }
        const tenantId = tenantParsed.data;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = makeUserSupabase(token);
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: membership } = await supabase
          .from("tenant_members")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (!membership) {
          const { data: admin } = await supabase
            .from("app_admins")
            .select("user_id")
            .eq("user_id", userData.user.id)
            .maybeSingle();
          if (!admin) {
            return new Response("Forbidden", { status: 403 });
          }
        }

        const tools = buildTools(supabase, tenantId);
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
