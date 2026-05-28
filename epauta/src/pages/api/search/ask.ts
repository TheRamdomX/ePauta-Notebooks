import type { APIRoute } from "astro";
import { askKnowledgeBase } from "@/lib/open-notebook";
import { cacheGet, cacheSet } from "@/lib/redis";

/**
 * POST /api/search/ask
 * Body: { question: string, strategyModel: string, answerModel: string, finalAnswerModel: string }
 * Response: { answer: string, question: string }
 *
 * Non-streaming RAG endpoint. Cached 15 minutes per unique question+models combo.
 */
export const POST: APIRoute = async ({ request }) => {
  let question: string,
    strategyModel: string,
    answerModel: string,
    finalAnswerModel: string;

  try {
    const body = await request.json();
    question = body?.question;
    strategyModel = body?.strategyModel;
    answerModel = body?.answerModel;
    finalAnswerModel = body?.finalAnswerModel;

    if (!question || !strategyModel || !answerModel || !finalAnswerModel) {
      return new Response(
        JSON.stringify({
          error:
            "question, strategyModel, answerModel, and finalAnswerModel are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cache key based on all discriminating inputs
  const cacheKey = `epauta:ask:${Buffer.from(
    [question, strategyModel, answerModel, finalAnswerModel].join("|"),
  ).toString("base64")}`;

  const cached = await cacheGet<{ answer: string; question: string }>(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  try {
    const result = await askKnowledgeBase(
      question,
      strategyModel,
      answerModel,
      finalAnswerModel,
    );
    await cacheSet(cacheKey, result, 900); // 15 minutes
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/search/ask]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
