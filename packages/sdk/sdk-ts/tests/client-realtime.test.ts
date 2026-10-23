import { describe, expect, test, vi } from "vitest";
import { Phaseo, RealtimeSessionClosedError, type RealtimeEvent } from "../src/index.js";

type Listener = (event: any) => void;

/** In-memory stand-in for the relay socket: records what the SDK sends and lets the test play the relay. */
class FakeRelaySocket {
  static instances: FakeRelaySocket[] = [];
  readyState = 0;
  sent: any[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private listeners = new Map<string, Listener[]>();
  onSend?: (message: any, socket: FakeRelaySocket) => void;

  constructor(readonly url: string, readonly protocols?: string | string[]) {
    FakeRelaySocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit("open", {});
      this.receive({ type: "relay.connected", session_id: "rt_test", provider: "openai", max_duration_seconds: 3600, idle_timeout_seconds: null });
    });
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    const message = JSON.parse(data);
    this.sent.push(message);
    this.onSend?.(message, this);
  }
  close(code?: number, reason?: string) {
    if (this.readyState === 3) return;
    this.closed = { code, reason };
    this.readyState = 3;
    queueMicrotask(() => this.emit("close", { code: code ?? 1005, reason: reason ?? "" }));
  }
  receive(event: Record<string, unknown>) {
    this.emit("message", { data: JSON.stringify(event) });
  }
  serverClose(code: number, reason = "") {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }
  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const ENDED = {
  type: "session.ended",
  session_id: "rt_test",
  reason: "client_requested",
  initiated_by: "client",
  client_reason: "caller hung up",
  duration_seconds: 12.5,
  usage: { input_audio_tokens: 100, output_audio_tokens: 200 },
  cost: { total_usd: 0.01, total_nanos: 10_000_000, estimated: false, estimate_basis: null, debt_nanos: 0, uncollected_nanos: 0, currency: "USD" },
  billing_status: "settled",
};

function client(onCreate?: (body: any) => void) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.example.test/v1/audio/realtime/sessions");
    onCreate?.(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      id: "rt_test",
      session_id: "rt_test",
      provider: "openai",
      model: "gpt-realtime-2",
      client_secret: "rtsec_secret",
      connect: { transport: "websocket", url: "/v1/realtime/sessions/rt_test/relay" },
      max_duration_seconds: 3600,
      idle_timeout_seconds: null,
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://api.example.test/v1", fetchImpl, modelLifecycleChecks: false });
}

async function connect(onCreate?: (body: any) => void) {
  FakeRelaySocket.instances = [];
  const session = await client(onCreate).realtime.connect({
    model: "openai/gpt-realtime-2",
    voice: "marin",
    instructions: "Be brief.",
    webSocket: FakeRelaySocket,
  });
  return { session, socket: FakeRelaySocket.instances[0]! };
}

describe("realtime voice client", () => {
  test("creates the session and opens the relay with the secret subprotocol", async () => {
    let body: any;
    const { session, socket } = await connect((value) => { body = value; });
    expect(body).toEqual({ model: "openai/gpt-realtime-2", voice: "marin", instructions: "Be brief." });
    expect(socket.url).toBe("wss://api.example.test/v1/realtime/sessions/rt_test/relay");
    expect(socket.protocols).toEqual(["statsync-realtime", "rtsec.rtsec_secret"]);
    expect(session.id).toBe("rt_test");
    expect(session.info.max_duration_seconds).toBe(3600);
    expect(session.info).not.toHaveProperty("client_secret");
  });

  test("sends PCM16 audio as base64 client.audio and raw events unchanged", async () => {
    const { session, socket } = await connect();
    session.sendAudio(new Uint8Array([0, 1, 2, 255]));
    session.send({ type: "response.create", response: { modalities: ["audio"] } });
    expect(socket.sent).toEqual([
      { type: "client.audio", audio: "AAEC/w==" },
      { type: "response.create", response: { modalities: ["audio"] } },
    ]);
  });

  test("delivers provider events, warnings and iteration in order", async () => {
    const { session, socket } = await connect();
    const warnings: RealtimeEvent[] = [];
    const deltas: RealtimeEvent[] = [];
    session.onWarning((event) => warnings.push(event));
    session.on("response.output_audio.delta", (event) => deltas.push(event));
    const seen: string[] = [];
    const iterate = (async () => { for await (const event of session) seen.push(event.type); })();
    socket.receive({ type: "response.output_audio.delta", delta: "AAA=" });
    socket.receive({ type: "session.warning", code: "max_duration_approaching", seconds_remaining: 120 });
    socket.receive({ ...ENDED, reason: "max_duration_reached", initiated_by: "gateway" });
    socket.serverClose(1000);
    await iterate;
    expect(deltas).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "max_duration_approaching", seconds_remaining: 120 });
    expect(seen).toEqual(["response.output_audio.delta", "session.warning", "session.ended"]);
    await expect(session.ended).resolves.toMatchObject({ reason: "max_duration_reached", initiated_by: "gateway" });
  });

  test("end() sends session.end and resolves with the final bill", async () => {
    const { session, socket } = await connect();
    socket.onSend = (message, relay) => {
      if (message.type !== "session.end") return;
      queueMicrotask(() => { relay.receive(ENDED); relay.serverClose(1000); });
    };
    const onEnded = vi.fn();
    session.onEnded(onEnded);
    const ended = await session.end({ reason: "caller hung up", cancelResponse: false });
    expect(socket.sent.at(-1)).toEqual({ type: "session.end", reason: "caller hung up", cancel_response: false });
    expect(ended).toMatchObject({ reason: "client_requested", billing_status: "settled", cost: { total_usd: 0.01 } });
    expect(onEnded).toHaveBeenCalledOnce();
    await expect(session.end()).resolves.toBe(ended);
  });

  test("end() rejects with the final-bill lookup when the socket closes without session.ended", async () => {
    const { session, socket } = await connect();
    socket.onSend = (message, relay) => {
      if (message.type === "session.end") queueMicrotask(() => relay.serverClose(1011, "realtime_client_socket_error"));
    };
    const error = await session.end().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(RealtimeSessionClosedError);
    expect((error as RealtimeSessionClosedError).closeCode).toBe(1011);
    expect((error as RealtimeSessionClosedError).finalBill).toEqual({ method: "GET", path: "/v1/generations?id=realtime%3Art_test" });
    expect((error as Error).message).toContain("GET /v1/generations?id=realtime%3Art_test");
  });

  test("end() times out and closes the socket when session.ended never arrives", async () => {
    const { session, socket } = await connect();
    const error = await session.end({ timeoutMs: 5 }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(RealtimeSessionClosedError);
    expect((error as Error).message).toContain("timed out after 5 ms");
    expect(socket.closed).toEqual({ code: 1000, reason: "client_end_timeout" });
  });

  test("connect() rejects when the relay ends the session before it connects", async () => {
    class FailingSocket extends FakeRelaySocket {
      override receive(event: Record<string, unknown>) {
        super.receive(event.type === "relay.connected"
          ? { ...ENDED, reason: "provider_error", initiated_by: "provider", billing_status: "settled" }
          : event);
      }
    }
    await expect(client().realtime.connect({ model: "openai/gpt-realtime-2", webSocket: FailingSocket }))
      .rejects.toThrow("ended before connecting: provider_error");
  });
});
