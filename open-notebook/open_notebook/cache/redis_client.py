"""
Async Redis cache client for open-notebook.

Provides a thin wrapper around redis.asyncio with JSON serialization,
TTL-based expiry, and pattern-based invalidation. All operations degrade
gracefully: if Redis is unavailable, cache misses are returned and writes
are silently dropped so the API continues to function without caching.
"""

import hashlib
import json
import os
from typing import Any, Optional

from loguru import logger

_client = None
_disabled = False


def _is_redis_configured() -> bool:
    """Check whether a REDIS_URL has been provided."""
    return bool(os.environ.get("REDIS_URL"))


async def get_redis():
    """
    Return (or lazily create) a shared async Redis connection.

    Returns ``None`` when REDIS_URL is not set so callers can skip
    cache operations entirely.
    """
    global _client, _disabled

    if _disabled:
        return None

    if _client is not None:
        return _client

    if not _is_redis_configured():
        logger.debug("REDIS_URL not set — caching disabled")
        _disabled = True
        return None

    try:
        import redis.asyncio as aioredis

        _client = aioredis.from_url(
            os.environ["REDIS_URL"],
            decode_responses=True,
        )
        # Verify the connection is alive
        await _client.ping()
        logger.info("Redis cache connected")
        return _client
    except Exception as e:
        logger.warning(f"Redis connection failed, caching disabled: {e}")
        _disabled = True
        return None


async def cache_get(key: str) -> Optional[Any]:
    """Return the cached value for *key*, or ``None`` on miss / error."""
    client = await get_redis()
    if client is None:
        return None
    try:
        value = await client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.debug(f"cache_get error for {key}: {e}")
        return None


async def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    """Store *value* under *key* with a TTL in seconds."""
    client = await get_redis()
    if client is None:
        return
    try:
        await client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug(f"cache_set error for {key}: {e}")


async def cache_delete(key: str) -> None:
    """Delete a single cache entry."""
    client = await get_redis()
    if client is None:
        return
    try:
        await client.delete(key)
    except Exception as e:
        logger.debug(f"cache_delete error for {key}: {e}")


async def cache_delete_pattern(pattern: str) -> None:
    """
    Delete all keys matching a glob *pattern* (e.g. ``epauta:search:*``).

    Uses SCAN internally to avoid blocking Redis on large keyspaces.
    """
    client = await get_redis()
    if client is None:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await client.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.debug(f"cache_delete_pattern error for {pattern}: {e}")


def make_cache_key(prefix: str, *args: Any) -> str:
    """
    Build a deterministic cache key from *prefix* and positional args.

    The args are joined and SHA-256-hashed so the key stays short and
    safe regardless of the input length.
    """
    raw = ":".join(str(a) for a in args)
    hash_part = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"epauta:{prefix}:{hash_part}"
