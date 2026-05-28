import type { APIRoute } from "astro";
import { executeChat } from "@/lib/open-notebook";

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
    // Build a minimal context: all sources/notes from the notebook are
    // available to the model. For a focused RAG experience ePAUTA passes
    // an empty context object so open-notebook uses its default retrieval.
    const context = { sources: {}, notes: {} };
    const result = await executeChat(sessionId, message, context);

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
