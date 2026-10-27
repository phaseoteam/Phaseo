import asyncio
import time

import httpx
import pytest

from phaseo import AsyncPhaseo, Phaseo


def ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"data": {"id": "key_123"}})


def test_sync_client_asks_for_a_fresh_credential_on_every_request():
    seen: list[str | None] = []
    issued = iter(["oidc-token-1", "oidc-token-2"])

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return ok(request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        client = Phaseo(api_key=lambda: next(issued), base_url="https://example.test/v1", http_client=transport)
        client.get_current_api_key()
        client.get_current_api_key()

    assert seen == ["Bearer oidc-token-1", "Bearer oidc-token-2"]


def test_sync_retries_get_a_fresh_credential():
    seen: list[str | None] = []
    issued = iter(["first", "second"])

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(503) if len(seen) == 1 else ok(request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        client = Phaseo(api_key=lambda: next(issued), base_url="https://example.test/v1", http_client=transport, max_retries=1)
        client.raw_client.request("GET", "/key")

    assert seen == ["Bearer first", "Bearer second"]


def test_scoped_clients_keep_the_function_and_explicit_headers_win():
    seen: list[str | None] = []
    calls = 0

    def provider() -> str:
        nonlocal calls
        calls += 1
        return "workload-token"

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return ok(request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        client = Phaseo(api_key=provider, base_url="https://example.test/v1", http_client=transport)
        client.with_options(timeout=5).get_current_api_key()
        client.with_options(headers={"Authorization": "Bearer explicit"}).get_current_api_key()

    assert seen == ["Bearer workload-token", "Bearer explicit"]
    assert calls == 1


def test_sync_client_refuses_empty_and_async_credentials_without_sending():
    sent = 0

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal sent
        sent += 1
        return ok(request)

    async def async_provider() -> str:
        return "token"

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        with pytest.raises(ValueError, match="empty credential"):
            Phaseo(api_key=lambda: "  ", base_url="https://example.test/v1", http_client=transport).get_current_api_key()
        with pytest.raises(TypeError, match="AsyncPhaseo"):
            Phaseo(api_key=async_provider, base_url="https://example.test/v1", http_client=transport).get_current_api_key()

    assert sent == 0


def test_string_keys_are_unchanged():
    def handle(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer sk_test"
        return ok(request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        Phaseo(api_key="sk_test", base_url="https://example.test/v1", http_client=transport).get_current_api_key()


def test_async_client_awaits_the_function_per_request():
    seen: list[str | None] = []
    issued = iter(["async-1", "async-2"])

    async def provider() -> str:
        return next(issued)

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return ok(request)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as transport:
            client = AsyncPhaseo(api_key=provider, base_url="https://example.test/v1", http_client=transport)
            await client.request("GET", "/key")
            await client.with_options(timeout=5).request("GET", "/key")

    asyncio.run(run())
    assert seen == ["Bearer async-1", "Bearer async-2"]


def test_async_retries_get_a_fresh_credential():
    seen: list[str | None] = []
    issued = iter(["token-1", "token-2"])

    async def provider() -> str:
        return next(issued)

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(503) if len(seen) == 1 else ok(request)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as transport:
            client = AsyncPhaseo(api_key=provider, base_url="https://example.test/v1", http_client=transport, max_retries=1)
            await client.request("GET", "/key")

    asyncio.run(run())
    assert seen == ["Bearer token-1", "Bearer token-2"]


def test_async_client_runs_a_blocking_function_off_the_event_loop_within_the_timeout():
    sent = 0

    def slow() -> str:
        time.sleep(0.3)
        return "late-token"

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal sent
        sent += 1
        return ok(request)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as transport:
            client = AsyncPhaseo(api_key=slow, base_url="https://example.test/v1", http_client=transport, timeout=0.05)
            with pytest.raises(asyncio.TimeoutError):
                await client.request("GET", "/key")
            fast = AsyncPhaseo(api_key=lambda: "sync-token", base_url="https://example.test/v1", http_client=transport)
            await fast.request("GET", "/key")

    asyncio.run(run())
    assert sent == 1


def test_async_client_honours_the_timeout_when_the_function_hangs():
    sent = 0

    async def never() -> str:
        await asyncio.Event().wait()
        return "unreachable"

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal sent
        sent += 1
        return ok(request)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as transport:
            client = AsyncPhaseo(api_key=never, base_url="https://example.test/v1", http_client=transport, timeout=0.05)
            with pytest.raises(asyncio.TimeoutError):
                await client.request("GET", "/key")

    asyncio.run(asyncio.wait_for(run(), 5))
    assert sent == 0
