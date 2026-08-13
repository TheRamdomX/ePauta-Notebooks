import type { APIRoute } from "astro";
import { executeChat, buildChatContext } from "@/lib/open-notebook";

/**
 * POST /api/chat/ask
 * Body: { sessionId: string, message: string, notebookId: string }
 * Response: open-notebook ExecuteChatResponse JSON
 *
 * Proxies to open-notebook POST /chat/execute.
 * The open-notebook chat endpoint is synchronous (returns full response).
 */
export const POST: APIRoute = async ({ request }) => {
  let sessionId: string, message: string, notebookId: string;

  try {
    const body = await request.json();
    sessionId = body?.sessionId;
    message = body?.message;
    notebookId = body?.notebookId;

    if (!sessionId || !message || !notebookId) {
      return new Response(
        JSON.stringify({ error: "sessionId, message, and notebookId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Build full context: all sources/notes from the notebook are
    // available to the model. Using default config for now, which fetches all
    // sources with short context. If you want full context, pass contextConfig.
    const contextData = await buildChatContext(notebookId);

    const result = await executeChat(sessionId, message, contextData.context);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/chat/ask]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
