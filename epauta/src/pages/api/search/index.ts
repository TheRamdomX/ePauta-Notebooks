import type { APIRoute } from "astro";
import { searchKnowledgeBase } from "@/lib/open-notebook";
import { cacheGet, cacheSet, searchCacheKey } from "@/lib/redis";

/**
 * POST /api/search
 * Body: { query: string, notebookId?: string, mode?: "text" | "vector" }
 * Response: SearchResponse from open-notebook
 *
 * Cached 30 minutes per unique query+notebook+mode.
 */
export const POST: APIRoute = async ({ request }) => {
  let query: string, notebookId: string | undefined, mode: "text" | "vector";

  try {
    const body = await request.json();
    query = body?.query;
    notebookId = body?.notebookId;
    mode = body?.mode === "vector" ? "vector" : "text";

    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cacheKey = searchCacheKey(notebookId ?? "global", query, mode);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  try {
    const results = await searchKnowledgeBase(query, mode);
    await cacheSet(cacheKey, results, 1800); // 30 minutes
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/search]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
