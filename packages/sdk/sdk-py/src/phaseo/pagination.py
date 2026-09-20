"""Offset pagination helpers shared by list resources."""
from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from typing import Any

Page = dict[str, Any]


def iter_pages(fetch_page: Callable[[dict[str, int]], Page], *, limit: int = 50, offset: int = 0) -> Iterator[Page]:
    limit, offset = max(1, int(limit)), max(0, int(offset))
    while True:
        page = fetch_page({"limit": limit, "offset": offset})
        yield page
        items = page.get("data") if isinstance(page.get("data"), list) else []
        if not page.get("has_more") or not items:
            return
        offset += len(items)


def iter_items(fetch_page: Callable[[dict[str, int]], Page], *, limit: int = 50, offset: int = 0) -> Iterator[Any]:
    for page in iter_pages(fetch_page, limit=limit, offset=offset):
        yield from page.get("data", [])


async def aiter_pages(fetch_page: Callable[[dict[str, int]], Awaitable[Page]], *, limit: int = 50, offset: int = 0) -> AsyncIterator[Page]:
    limit, offset = max(1, int(limit)), max(0, int(offset))
    while True:
        page = await fetch_page({"limit": limit, "offset": offset})
        yield page
        items = page.get("data") if isinstance(page.get("data"), list) else []
        if not page.get("has_more") or not items:
            return
        offset += len(items)


async def aiter_items(fetch_page: Callable[[dict[str, int]], Awaitable[Page]], *, limit: int = 50, offset: int = 0) -> AsyncIterator[Any]:
    async for page in aiter_pages(fetch_page, limit=limit, offset=offset):
        for item in page.get("data", []):
            yield item
