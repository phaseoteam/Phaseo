from __future__ import annotations

import asyncio

import pytest

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


def test_iter_items_stops_before_gateway_offset_limit() -> None:
    calls = 0

    def fetch(_page: dict[str, int]) -> dict:
        nonlocal calls
        calls += 1
        return {"data": [1], "has_more": True}

    with pytest.raises(ValueError, match="offset cannot exceed 10000"):
        list(iter_items(fetch, offset=10_000))
    assert calls == 1


def test_aiter_items_rejects_initial_offset_beyond_gateway_limit() -> None:
    async def run() -> None:
        async def fetch(_page: dict[str, int]) -> dict:
            raise AssertionError("fetch must not run")

        with pytest.raises(ValueError, match="offset cannot exceed 10000"):
            async for _item in aiter_items(fetch, offset=10_001):
                pass

    asyncio.run(run())
