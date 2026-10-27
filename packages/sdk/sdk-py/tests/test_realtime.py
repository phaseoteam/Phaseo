"""Realtime client tests against a local fake relay (websockets server) and a mocked create-session call."""
from __future__ import annotations

import asyncio
import json
import sys

import httpx
import pytest

from phaseo import AsyncPhaseo, RealtimeSessionClosedError

ENDED = {
    "type": "session.ended",
    "session_id": "rt_test",
    "reason": "client_requested",
    "initiated_by": "client",
    "client_reason": "caller hung up",
    "duration_seconds": 12.5,
    "usage": {"input_audio_tokens": 100, "output_audio_tokens": 200},
    "cost": {"total_usd": 0.01, "total_nanos": 10_000_000, "estimated": False, "estimate_basis": None,
             "debt_nanos": 0, "uncollected_nanos": 0, "currency": "USD"},
    "billing_status": "settled",
}


def make_client(port: int, created: list[dict]) -> AsyncPhaseo:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"http://127.0.0.1:{port}/v1/audio/realtime/sessions"
        created.append(json.loads(request.content))
        return httpx.Response(201, json={
            "id": "rt_test", "session_id": "rt_test", "provider": "openai", "model": "gpt-realtime-2",
            "client_secret": "rtsec_secret",
            "connect": {"transport": "websocket", "url": "/v1/realtime/sessions/rt_test/relay"},
            "max_duration_seconds": 3600, "idle_timeout_seconds": None,
        })
    return AsyncPhaseo(api_key="sk_test_123", base_url=f"http://127.0.0.1:{port}/v1",
                       http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def run_relay(behaviour):
    """Starts a local relay; ``behaviour(ws, received)`` plays the relay after relay.connected."""
    from websockets.asyncio.server import serve

    state: dict = {"received": [], "path": None, "protocols": None}

    async def handle(ws):
        state["path"] = ws.request.path
        state["protocols"] = ws.request.headers.get("Sec-WebSocket-Protocol")
        await ws.send(json.dumps({"type": "relay.connected", "session_id": "rt_test", "provider": "openai"}))
        await behaviour(ws, state["received"])

    server = await serve(handle, "127.0.0.1", 0, select_subprotocol=lambda ws, offered: "statsync-realtime")
    port = server.sockets[0].getsockname()[1]
    return server, port, state


async def receive_until(ws, received, event_type):
    async for raw in ws:
        message = json.loads(raw)
        received.append(message)
        if message["type"] == event_type:
            return message


def test_connect_streams_events_and_end_returns_the_final_bill():
    pytest.importorskip("websockets")

    async def relay(ws, received):
        await receive_until(ws, received, "client.audio")
        await ws.send(json.dumps({"type": "response.output_audio.delta", "delta": "AAA="}))
        await ws.send(json.dumps({"type": "session.warning", "code": "max_duration_approaching", "seconds_remaining": 120}))
        await receive_until(ws, received, "session.end")
        await ws.send(json.dumps(ENDED))
        await ws.close(1000)

    async def run():
        server, port, state = await run_relay(relay)
        created: list[dict] = []
        client = make_client(port, created)
        try:
            session = await client.realtime.connect("openai/gpt-realtime-2", voice="marin", instructions="Be brief.")
            assert created == [{"model": "openai/gpt-realtime-2", "voice": "marin", "instructions": "Be brief."}]
            assert state["path"] == "/v1/realtime/sessions/rt_test/relay"
            assert state["protocols"] == "statsync-realtime, rtsec.rtsec_secret"
            assert session.id == "rt_test"
            assert "client_secret" not in session.info

            warnings: list[dict] = []
            session.on_warning(warnings.append)
            seen: list[str] = []

            async def iterate():
                async for event in session:
                    seen.append(event["type"])
                    if event["type"] == "session.warning":
                        return
            iterating = asyncio.ensure_future(iterate())
            await asyncio.sleep(0)
            await session.send_audio(b"\x00\x01\x02\xff")
            await session.send({"type": "response.create"})
            await iterating
            ended = await session.end(reason="caller hung up", cancel_response=False)
        finally:
            server.close()
            await server.wait_closed()
            await client.close()
        assert state["received"][0] == {"type": "client.audio", "audio": "AAEC/w=="}
        assert state["received"][1] == {"type": "response.create"}
        assert state["received"][-1] == {"type": "session.end", "reason": "caller hung up", "cancel_response": False}
        assert seen == ["relay.connected", "response.output_audio.delta", "session.warning"]
        assert warnings[0]["seconds_remaining"] == 120
        assert ended["billing_status"] == "settled" and ended["cost"]["total_usd"] == 0.01
        assert await session.end() is ended

    asyncio.run(run())


def test_end_raises_with_final_bill_lookup_when_socket_closes_without_session_ended():
    pytest.importorskip("websockets")

    async def relay(ws, received):
        await receive_until(ws, received, "session.end")
        await ws.close(1011, "realtime_client_socket_error")

    async def run():
        server, port, _ = await run_relay(relay)
        client = make_client(port, [])
        try:
            session = await client.realtime.connect("openai/gpt-realtime-2")
            with pytest.raises(RealtimeSessionClosedError) as caught:
                await session.end()
        finally:
            server.close()
            await server.wait_closed()
            await client.close()
        assert caught.value.close_code == 1011
        assert caught.value.final_bill == {"method": "GET", "path": "/v1/generations?id=realtime%3Art_test"}
        assert "GET /v1/generations?id=realtime%3Art_test" in str(caught.value)

    asyncio.run(run())


def test_end_times_out_when_session_ended_never_arrives():
    pytest.importorskip("websockets")

    async def relay(ws, received):
        await receive_until(ws, received, "never")

    async def run():
        server, port, _ = await run_relay(relay)
        client = make_client(port, [])
        try:
            session = await client.realtime.connect("openai/gpt-realtime-2")
            with pytest.raises(RealtimeSessionClosedError, match="timed out after 0.05 s"):
                await session.end(timeout=0.05)
        finally:
            server.close()
            await server.wait_closed()
            await client.close()

    asyncio.run(run())


def test_provider_ended_session_resolves_ended_and_stops_iteration():
    pytest.importorskip("websockets")

    async def relay(ws, received):
        await ws.send(json.dumps({**ENDED, "reason": "max_duration_reached", "initiated_by": "gateway"}))
        await ws.close(1000)

    async def run():
        server, port, _ = await run_relay(relay)
        client = make_client(port, [])
        try:
            session = await client.realtime.connect("openai/gpt-realtime-2")
            types = [event["type"] async for event in session]
            ended = await session.ended
        finally:
            server.close()
            await server.wait_closed()
            await client.close()
        assert types == ["relay.connected", "session.ended"]
        assert ended["reason"] == "max_duration_reached"

    asyncio.run(run())


def test_cancelling_connect_before_relay_connected_closes_the_socket():
    class SilentSocket:
        """Opens but never sends relay.connected; records close()."""

        def __init__(self) -> None:
            self.closed: tuple[int, str] | None = None
            self.close_code: int | None = None
            self.close_reason = ""
            self._stop = asyncio.Event()

        async def send(self, data: str) -> None:
            pass

        async def close(self, code: int = 1000, reason: str = "") -> None:
            self.closed = (code, reason)
            self.close_code = code
            self._stop.set()

        def __aiter__(self):
            return self

        async def __anext__(self):
            await self._stop.wait()
            raise StopAsyncIteration

    async def run():
        socket = SilentSocket()
        opened = asyncio.Event()

        async def opener(url: str, protocols: list[str]):
            opened.set()
            return socket

        client = make_client(1, [])
        try:
            task = asyncio.ensure_future(client.realtime.connect("openai/gpt-realtime-2", websocket_connect=opener))
            await opened.wait()
            await asyncio.sleep(0.01)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            await client.close()
        assert socket.closed == (1000, "client_closed")

    asyncio.run(run())


def test_connect_without_websockets_explains_the_extra(monkeypatch):
    monkeypatch.setitem(sys.modules, "websockets", None)
    monkeypatch.setitem(sys.modules, "websockets.asyncio", None)
    monkeypatch.setitem(sys.modules, "websockets.asyncio.client", None)

    async def run():
        client = make_client(1, [])
        try:
            with pytest.raises(ImportError, match=r"pip install \"phaseo\[realtime\]\""):
                await client.realtime.connect("openai/gpt-realtime-2")
        finally:
            await client.close()

    asyncio.run(run())
