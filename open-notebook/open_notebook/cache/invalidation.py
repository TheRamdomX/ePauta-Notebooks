"""
Cache invalidation helpers.

Call these from write endpoints (create / update / delete) to ensure
stale data does not linger in Redis.
"""

from open_notebook.cache.redis_client import cache_delete_pattern


async def invalidate_notebook_cache(notebook_id: str) -> None:
    """Invalidate when a notebook or its sources/notes change."""
    await cache_delete_pattern(f"epauta:notebook_context:*{notebook_id}*")
    await cache_delete_pattern("epauta:notebook_list:*")
    await cache_delete_pattern(f"epauta:sources:*{notebook_id}*")


async def invalidate_source_cache(
    source_id: str, notebook_id: str | None = None
) -> None:
    """Invalidate when a source is processed or modified."""
    await cache_delete_pattern(f"epauta:source:*{source_id}*")
    if notebook_id:
        await invalidate_notebook_cache(notebook_id)


async def invalidate_search_cache(notebook_id: str | None = None) -> None:
    """Invalidate search results."""
    if notebook_id:
        await cache_delete_pattern(f"epauta:search:*{notebook_id}*")
    else:
        await cache_delete_pattern("epauta:search:*")
