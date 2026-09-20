from __future__ import annotations

import asyncio

from phaseo.pagination import aiter_items, iter_items


def test_iter_items_advances_by_returned_count() -> None:
    offsets: list[int] = []

    def fetch(page: dict[str, int]) -> dict:
        offsets.append(page["offset"])
        return {"data": [1, 2], "has_more": True} if page["offset"] == 0 else {"data": [3], "has_more": False}

    assert list(iter_items(fetch, limit=2)) == [1, 2, 3]
    assert offsets == [0, 2]


def test_aiter_items_advances_by_returned_count() -> None:
    async def run() -> list[int]:
        async def fetch(page: dict[str, int]) -> dict:
            return {"data": [1], "has_more": page["offset"] == 0}

        return [item async for item in aiter_items(fetch, limit=1)]

    assert asyncio.run(run()) == [1, 1]
