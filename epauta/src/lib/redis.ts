/**
 * Server-side Redis cache for ePAUTA SSR endpoints.
 *
 * Gracefully degrades when Redis is unavailable: cache misses return null
 * and writes are silently dropped so the app keeps working without cache.
 *
 * NOTE: For Vercel production deployments, replace the `redis` TCP client
 * with `@upstash/redis` (HTTP-based) which works in serverless functions.
 */

let _client: import("redis").RedisClientType | null = null;
let _disabled = false;

function isRedisConfigured(): boolean {
  try {
    return !!(
      import.meta.env.REDIS_URL ||
      import.meta.env.UPSTASH_REDIS_REST_URL
    );
  } catch {
    return false;
  }
}

async function getRedis() {
  if (_disabled) return null;
  if (_client) return _client;
  if (!isRedisConfigured()) {
    _disabled = true;
    return null;
  }

  try {
    const { createClient } = await import("redis");
    _client = createClient({
      url: import.meta.env.REDIS_URL ?? "redis://localhost:6379",
    }) as import("redis").RedisClientType;
    _client.on("error", (err: Error) =>
      console.error("[redis] connection error:", err.message),
    );
    await _client.connect();
    return _client;
  } catch (err) {
    console.warn("[redis] could not connect, caching disabled:", err);
    _disabled = true;
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedis();
    if (!client) return null;
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently degrade — the API will still respond, just un-cached.
  }
}

// ─── Key builders ─────────────────────────────────────────────────

export function notebookCacheKey(slug: string): string {
  return `epauta:notebook:${slug}`;
}

export function sourcesCacheKey(notebookId: string): string {
  return `epauta:sources:${notebookId}`;
}

export function searchCacheKey(
  notebookId: string,
  query: string,
  mode: string,
): string {
  // Base64-encode the query to keep the key safe
  const q64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(query).toString("base64")
      : btoa(query);
  return `epauta:search:${notebookId}:${mode}:${q64}`;
}
