import type { APIRoute } from "astro";
import { createChatSession } from "@/lib/open-notebook";

/**
 * POST /api/chat/create-session
 * Body: { notebookId: string }
 * Response: { sessionId: string }
 *
 * Proxies to open-notebook POST /chat/sessions.
 * Keeps the backend URL server-side.
 */
export const POST: APIRoute = async ({ request }) => {
  let notebookId: string;

  try {
    const body = await request.json();
    notebookId = body?.notebookId;
    if (!notebookId) {
      return new Response(
        JSON.stringify({ error: "notebookId is required" }),
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
    const session = await createChatSession(notebookId);
    return new Response(JSON.stringify({ sessionId: session.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/chat/create-session]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
