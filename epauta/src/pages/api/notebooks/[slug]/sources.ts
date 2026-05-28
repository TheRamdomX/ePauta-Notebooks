import type { APIRoute } from "astro";
import { listSourcesByNotebook } from "@/lib/open-notebook";
import { cacheGet, cacheSet, sourcesCacheKey } from "@/lib/redis";
import { getNotebookIdBySlug } from "@/lib/ramos";

/**
 * GET /api/notebooks/[slug]/sources
 * slug = "<carrera>/<CODIGO>" URL-encoded, e.g. eit%2FCIT-1010
 *
 * Returns the Sources linked to the Notebook that corresponds to this slug.
 * Cached in Redis for 5 minutes.
 */
export const GET: APIRoute = async ({ params }) => {
  const rawSlug = params.slug;
  if (!rawSlug) {
    return new Response(JSON.stringify({ error: "slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The slug arrives as a single path segment; restore forward slash if encoded
  const slug = decodeURIComponent(rawSlug);
  const notebookId = getNotebookIdBySlug(slug);

  if (!notebookId) {
    return new Response(
      JSON.stringify({ error: `No notebook mapped for slug: ${slug}` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check cache
  const cacheKey = sourcesCacheKey(notebookId);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const sources = await listSourcesByNotebook(notebookId);
    await cacheSet(cacheKey, sources, 300); // 5 minutes
    return new Response(JSON.stringify(sources), {
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/notebooks/[slug]/sources]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
