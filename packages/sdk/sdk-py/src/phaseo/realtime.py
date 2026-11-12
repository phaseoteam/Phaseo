"""Small async realtime voice client over the Phaseo relay WebSocket.

Creates the session over REST, opens the relay socket, passes provider events
through unchanged and wraps ``session.end`` -> ``session.ended`` into one call.
Needs the optional ``websockets`` package: ``pip install "phaseo[realtime]"``.
"""
from __future__ import annotations

import asyncio
import base64
import json
from typing import TYPE_CHECKING, Any, AsyncIterator, Awaitable, Callable
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

if TYPE_CHECKING:
    from .async_client import AsyncPhaseo

RealtimeEvent = dict[str, Any]
Listener = Callable[[RealtimeEvent], Any]
# (url, subprotocols) -> connected socket with send(), close(code, reason), async iteration, close_code, close_reason.
WebSocketConnect = Callable[[str, list[str]], Awaitable[Any]]

# The relay echoes this protocol back; strict clients reject a handshake where none is selected.
RELAY_PROTOCOL = "statsync-realtime"


def realtime_final_bill(session_id: str) -> dict[str, str]:
    """Where to read the final bill when ``session.ended`` never arrived or settlement was pending."""
    return {"method": "GET", "path": "/v1/generations?id=" + quote(f"realtime:{session_id}", safe="")}


def realtime_relay_url(base_url: str, connect_url: str) -> str:
    parts = urlsplit(urljoin(base_url.rstrip("/") + "/", connect_url))
    scheme = {"https": "wss", "http": "ws"}.get(parts.scheme, parts.scheme)
    return urlunsplit((scheme, parts.netloc, parts.path, parts.query, parts.fragment))


class RealtimeSessionClosedError(Exception):
    """The socket closed (or timed out) without ``session.ended``. The call is still billed; fetch ``final_bill``."""

    def __init__(self, session_id: str, close_code: int | None, close_reason: str = "", detail: str | None = None):
        self.session_id = session_id
        self.close_code = close_code
        self.close_reason = close_reason
        self.final_bill = realtime_final_bill(session_id)
        what = detail or f"closed (code {close_code if close_code is not None else 'none'}{', ' + close_reason if close_reason else ''})"
        super().__init__(
            f"Realtime session {session_id} {what} without session.ended. "
            f"The call is still billed; fetch the final bill with GET {self.final_bill['path']}"
        )


async def _default_connect(url: str, subprotocols: list[str]) -> Any:
    try:
        from websockets.asyncio.client import connect
    except ImportError as error:  # pragma: no cover - exercised via monkeypatch in tests
        raise ImportError(
            "Realtime sessions need the optional 'websockets' package (13.0 or newer). "
            "Install it with: pip install \"phaseo[realtime]\""
        ) from error
    return await connect(url, subprotocols=subprotocols, max_size=None)  # type: ignore[arg-type]


class RealtimeSession:
    """A connected realtime voice call. Iterate it for every event, or subscribe with ``on()``."""

    def __init__(self, info: dict[str, Any], socket: Any):
        self.info = {key: value for key, value in info.items() if key not in ("client_secret", "clientSecret")}
        self.id = str(info.get("session_id") or info.get("id") or "")
        self._socket = socket
        self._listeners: dict[str, list[Listener]] = {}
        self._queues: list[asyncio.Queue[RealtimeEvent | None]] = []
        # Events received before anyone iterates; handed to the first iterator.
        self._backlog: list[RealtimeEvent] | None = []
        self._ended_event: RealtimeEvent | None = None
        self._closed_error: RealtimeSessionClosedError | None = None
        self._finished: asyncio.Future[RealtimeEvent] = asyncio.get_running_loop().create_future()
        self._reader = asyncio.ensure_future(self._read())

    @property
    def ended(self) -> asyncio.Future[RealtimeEvent]:
        """Resolves with ``session.ended`` however the call ends; raises RealtimeSessionClosedError without it."""
        return self._finished

    async def send_audio(self, pcm16: bytes | bytearray | memoryview) -> None:
        """Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google)."""
        await self.send({"type": "client.audio", "audio": base64.b64encode(bytes(pcm16)).decode("ascii")})

    async def send(self, event: dict[str, Any]) -> None:
        """Sends any event as JSON, for provider-specific messages."""
        if self._finished.done():
            raise RuntimeError(f"Realtime session {self.id} is not open")
        await self._socket.send(json.dumps(event))

    def on(self, event_type: str, listener: Listener) -> Callable[[], None]:
        """Subscribes to one event type, or every event with ``"*"``. Returns an unsubscribe function."""
        self._listeners.setdefault(event_type, []).append(listener)

        def unsubscribe() -> None:
            listeners = self._listeners.get(event_type, [])
            if listener in listeners:
                listeners.remove(listener)
        return unsubscribe

    def on_warning(self, listener: Listener) -> Callable[[], None]:
        return self.on("session.warning", listener)

    def on_ended(self, listener: Listener) -> Callable[[], None]:
        return self.on("session.ended", listener)

    def __aiter__(self) -> AsyncIterator[RealtimeEvent]:
        return self.events()

    async def events(self) -> AsyncIterator[RealtimeEvent]:
        """Yields every event until the socket closes.

        The first iterator also gets the events that arrived since the session connected
        (up to 256), so nothing is lost between ``connect()`` returning and the loop starting.
        """
        queue: asyncio.Queue[RealtimeEvent | None] = asyncio.Queue()
        for event in self._backlog or []:
            queue.put_nowait(event)
        self._backlog = None
        if self._reader.done():
            queue.put_nowait(None)
        else:
            self._queues.append(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    return
                yield event
        finally:
            if queue in self._queues:
                self._queues.remove(queue)

    async def end(self, *, reason: str | None = None, cancel_response: bool | None = None, timeout: float = 60) -> RealtimeEvent:
        """Sends ``session.end`` and returns ``session.ended`` (the final bill).

        Raises RealtimeSessionClosedError if the socket closes or times out without it.
        """
        if self._finished.done():
            return self._finished.result()
        message: dict[str, Any] = {"type": "session.end"}
        if reason is not None:
            message["reason"] = reason
        if cancel_response is not None:
            message["cancel_response"] = cancel_response
        try:
            await self._socket.send(json.dumps(message))
        except Exception:
            pass  # Already closing; the reader reports how it ended.
        try:
            return await asyncio.wait_for(asyncio.shield(self._finished), timeout)
        except asyncio.TimeoutError:
            self._fail(RealtimeSessionClosedError(self.id, None, detail=f"timed out after {timeout} s"))
            await self.close()
            return self._finished.result()

    async def close(self) -> None:
        """Closes the socket without waiting for the bill. The call is still billed; prefer ``end()``."""
        try:
            await self._socket.close(1000, "client_closed")
        except Exception:
            pass

    async def __aenter__(self) -> "RealtimeSession":
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        if not self._finished.done():
            try:
                await self.end()
            except RealtimeSessionClosedError:
                pass
        await self.close()

    async def _read(self) -> None:
        try:
            async for raw in self._socket:
                self._dispatch(raw)
        except Exception:
            pass  # A dropped connection is reported below as a close without session.ended.
        finally:
            code = getattr(self._socket, "close_code", None)
            reason = getattr(self._socket, "close_reason", None) or ""
            self._fail(RealtimeSessionClosedError(self.id, code, reason))
            for queue in list(self._queues):
                queue.put_nowait(None)

    def _dispatch(self, raw: Any) -> None:
        try:
            text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
            event = json.loads(text)
        except (UnicodeDecodeError, ValueError):
            return
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            return
        if event["type"] == "session.ended" and not self._finished.done():
            self._ended_event = event
        for key in (event["type"], "*"):
            for listener in list(self._listeners.get(key, [])):
                try:
                    listener(event)
                except Exception:
                    pass  # Listener errors must not break the session.
        for queue in list(self._queues):
            queue.put_nowait(event)
        if self._backlog is not None:
            self._backlog.append(event)
            del self._backlog[:-256]
        if self._ended_event is event:
            self._finished.set_result(event)

    def _fail(self, error: RealtimeSessionClosedError) -> None:
        if self._finished.done():
            return
        self._closed_error = error
        self._finished.set_exception(error)
        # Callers who never await the end must not see "exception was never retrieved".
        self._finished.exception()


class AsyncRealtime:
    """``client.realtime``: realtime voice sessions (beta)."""

    def __init__(self, client: "AsyncPhaseo", websocket_connect: WebSocketConnect | None = None):
        self.client = client
        self._connect = websocket_connect

    async def connect(self, model: str, *, voice: str | None = None, instructions: str | None = None,
                      provider: str | None = None, metadata: dict[str, Any] | None = None,
                      connect_timeout: float = 30, websocket_connect: WebSocketConnect | None = None) -> RealtimeSession:
        """Creates the session and opens the relay socket; returns once the relay sends ``relay.connected``."""
        opener = websocket_connect or self._connect or _default_connect
        body: dict[str, Any] = {"model": model}
        for key, value in (("voice", voice), ("instructions", instructions), ("provider", provider), ("metadata", metadata)):
            if value is not None:
                body[key] = value
        info = await self.client.request("POST", "/audio/realtime/sessions", body=body)
        info = dict(info or {})
        secret = str(info.get("client_secret") or info.get("clientSecret") or "")
        connect_url = (info.get("connect") or {}).get("url")
        session_id = str(info.get("session_id") or info.get("id") or "")
        if not secret or not connect_url or not session_id:
            raise ValueError("Realtime session response is missing session_id, client_secret or connect.url")
        socket = await opener(realtime_relay_url(self.client.base_url, connect_url), [RELAY_PROTOCOL, f"rtsec.{secret}"])
        session = RealtimeSession(info, socket)
        connected: asyncio.Future[None] = asyncio.get_running_loop().create_future()

        def on_connected(_: RealtimeEvent) -> None:
            if not connected.done():
                connected.set_result(None)
        off = session.on("relay.connected", on_connected)
        try:
            done, _ = await asyncio.wait({connected, session.ended}, timeout=connect_timeout, return_when=asyncio.FIRST_COMPLETED)
        except BaseException:
            # Cancelled (or interrupted) while waiting: the caller never gets the session, so close the socket
            # here or the metered call keeps running with nobody holding it.
            await asyncio.shield(session.close())
            raise
        finally:
            off()
        if connected in done:
            return session
        if session.ended.done():
            error = session.ended.exception()
            if error is not None:
                raise error
            raise RuntimeError(f"Realtime session {session_id} ended before connecting: {session.ended.result().get('reason')}")
        await session.close()
        raise TimeoutError(f"Realtime session {session_id} did not connect within {connect_timeout} s")
