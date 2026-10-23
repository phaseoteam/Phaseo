// Purpose: Small realtime voice client over the Phaseo relay WebSocket.
// Why: Callers should not have to build the relay URL, subprotocols, base64 audio or the end/bill handshake themselves.
// How: Creates the session over REST, opens the relay socket, passes provider events through unchanged and
//      wraps session.end -> session.ended into one awaitable call.

export type RealtimeConnectOptions = {
  model: string;
  voice?: string;
  instructions?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  /** WebSocket constructor to use. Defaults to the global WebSocket, then the `ws` package in Node. */
  webSocket?: RealtimeWebSocketConstructor;
  /** How long to wait for `relay.connected`. Default 30 seconds. */
  connectTimeoutMs?: number;
};

export type RealtimeEndOptions = {
  /** Your own note, up to 120 printable characters, echoed back as `client_reason`. */
  reason?: string;
  /** `true` (default) cancels a reply that is still playing; `false` lets it finish. */
  cancelResponse?: boolean;
  /** How long to wait for `session.ended`. Default 60 seconds. */
  timeoutMs?: number;
};

export type RealtimeSessionInfo = {
  id?: string;
  session_id?: string;
  provider?: string;
  model?: string;
  model_id?: string;
  client_secret?: string;
  connect?: { transport?: string; url?: string; [key: string]: unknown };
  max_duration_seconds?: number;
  idle_timeout_seconds?: number | null;
  [key: string]: unknown;
};

/** Any event from the relay: Phaseo's own (`relay.connected`, `session.warning`, `session.ended`) or the provider's, unchanged. */
export type RealtimeEvent = { type: string; [key: string]: unknown };

export type RealtimeFinalBill = { method: "GET"; path: string };

export type RealtimeSessionWarningEvent = RealtimeEvent & {
  type: "session.warning";
  code: string;
  message?: string;
  seconds_remaining?: number;
  expires_at?: string;
  remaining_usd?: number;
  overdraft_used_usd?: number;
  limit?: string;
  status?: string;
  ends_at?: string;
};

export type RealtimeSessionEndedEvent = RealtimeEvent & {
  type: "session.ended";
  session_id: string;
  reason: string;
  initiated_by: "client" | "gateway" | "provider";
  client_reason?: string;
  provider_close_code?: number;
  duration_seconds: number;
  usage: Record<string, number>;
  cost: {
    total_usd: number;
    total_nanos: number;
    estimated: boolean;
    estimate_basis: string | null;
    debt_nanos: number;
    uncollected_nanos: number;
    currency: "USD";
  };
  billing_status: "settled" | "pending" | "unresolved";
  final_bill?: RealtimeFinalBill;
};

/** Minimal WebSocket surface used by the client (browser WebSocket, Node 22+ WebSocket and `ws` all match it). */
export type RealtimeWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};
export type RealtimeWebSocketConstructor = new (url: string, protocols?: string | string[]) => RealtimeWebSocket;

/** Where to read the final bill when `session.ended` never arrived or settlement was still pending. */
export function realtimeFinalBill(sessionId: string): RealtimeFinalBill {
  return { method: "GET", path: `/v1/generations?id=${encodeURIComponent(`realtime:${sessionId}`)}` };
}

/** The socket closed (or timed out) without `session.ended`. The call is still billed; fetch `finalBill` for the cost. */
export class RealtimeSessionClosedError extends Error {
  readonly sessionId: string;
  readonly closeCode: number | null;
  readonly closeReason: string;
  readonly finalBill: RealtimeFinalBill;
  constructor(sessionId: string, closeCode: number | null, closeReason: string, detail?: string) {
    const bill = realtimeFinalBill(sessionId);
    super(`Realtime session ${sessionId} ${detail ?? `closed (code ${closeCode ?? "none"}${closeReason ? `, ${closeReason}` : ""})`} without session.ended. The call is still billed; fetch the final bill with GET ${bill.path}`);
    this.name = "RealtimeSessionClosedError";
    this.sessionId = sessionId;
    this.closeCode = closeCode;
    this.closeReason = closeReason;
    this.finalBill = bill;
  }
}

const OPEN = 1;
// The relay echoes this protocol back; browsers and `ws` reject a handshake where none is selected.
const RELAY_PROTOCOL = "statsync-realtime";

export function realtimeRelayUrl(baseUrl: string, connectUrl: string): string {
  const url = new URL(connectUrl, `${baseUrl.replace(/\/+$/, "")}/`);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  return url.toString();
}

function base64(bytes: Uint8Array): string {
  const NodeBuffer = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(encoding: string): string } } }).Buffer;
  if (NodeBuffer) return NodeBuffer.from(bytes).toString("base64");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function eventText(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (data && typeof (data as Blob).text === "function") return (data as Blob).text();
  return null;
}

async function resolveWebSocket(explicit?: RealtimeWebSocketConstructor): Promise<RealtimeWebSocketConstructor> {
  if (explicit) return explicit;
  const global = (globalThis as { WebSocket?: RealtimeWebSocketConstructor }).WebSocket;
  if (global) return global;
  try {
    const moduleName = "ws";
    const mod = await import(moduleName) as { WebSocket?: RealtimeWebSocketConstructor; default?: RealtimeWebSocketConstructor };
    const ctor = mod.WebSocket ?? mod.default;
    if (ctor) return ctor;
  } catch {
    // Fall through to the error below.
  }
  throw new Error("No WebSocket implementation found. Use Node.js 22+, a browser, install the `ws` package, or pass `webSocket`.");
}

type Listener = (event: RealtimeEvent) => void;

export class RealtimeSession implements AsyncIterable<RealtimeEvent> {
  /** The create-session response (without `client_secret`). */
  readonly info: RealtimeSessionInfo;
  readonly id: string;
  private readonly socket: RealtimeWebSocket;
  private readonly listeners = new Map<string, Set<Listener>>();
  private endedEvent: RealtimeSessionEndedEvent | null = null;
  private closedError: RealtimeSessionClosedError | null = null;
  private readonly finished: Promise<RealtimeSessionEndedEvent>;
  private settle!: { resolve(event: RealtimeSessionEndedEvent): void; reject(error: Error): void };
  private messageChain: Promise<void> = Promise.resolve();

  /** @internal Use `client.realtime.connect()`. */
  constructor(info: RealtimeSessionInfo, socket: RealtimeWebSocket) {
    const { client_secret: _secret, clientSecret: _legacySecret, ...publicInfo } = info;
    this.info = publicInfo;
    this.id = String(info.session_id ?? info.id ?? "");
    this.socket = socket;
    this.finished = new Promise((resolve, reject) => { this.settle = { resolve, reject }; });
    // Callers who never await the end must not get an unhandled rejection.
    this.finished.catch(() => undefined);
    socket.addEventListener("message", (event: { data: unknown }) => {
      // Keep event order even when some frames arrive as Blobs.
      this.messageChain = this.messageChain.then(() => this.handleMessage(event.data));
    });
    socket.addEventListener("close", (event: { code?: number; reason?: string }) => {
      void this.messageChain.then(() => this.handleClose(event.code ?? null, event.reason ?? ""));
    });
  }

  /** Resolves with `session.ended` however the call ends; rejects with RealtimeSessionClosedError if the socket closes without it. */
  get ended(): Promise<RealtimeSessionEndedEvent> {
    return this.finished;
  }

  /** Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google). */
  sendAudio(pcm16: Uint8Array | ArrayBuffer): void {
    const bytes = pcm16 instanceof Uint8Array ? pcm16 : new Uint8Array(pcm16);
    this.send({ type: "client.audio", audio: base64(bytes) });
  }

  /** Sends any event as JSON, for provider-specific messages. */
  send(event: Record<string, unknown>): void {
    if (this.socket.readyState !== OPEN) throw new Error(`Realtime session ${this.id} is not open`);
    this.socket.send(JSON.stringify(event));
  }

  /** Subscribes to one event type, or every event with "*". Returns an unsubscribe function. */
  on(type: string, listener: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, set = new Set());
    set.add(listener);
    return () => { set!.delete(listener); };
  }

  onWarning(listener: (event: RealtimeSessionWarningEvent) => void): () => void {
    return this.on("session.warning", listener as Listener);
  }

  onEnded(listener: (event: RealtimeSessionEndedEvent) => void): () => void {
    return this.on("session.ended", listener as Listener);
  }

  /** Iterates every event received from now until the socket closes. */
  async *[Symbol.asyncIterator](): AsyncIterator<RealtimeEvent> {
    const queue: RealtimeEvent[] = [];
    let wake: (() => void) | null = null;
    let done = this.endedEvent !== null || this.closedError !== null;
    const off = this.on("*", (event) => { queue.push(event); wake?.(); });
    this.finished.then(() => undefined, () => undefined).then(() => { done = true; wake?.(); });
    try {
      while (true) {
        if (queue.length) { yield queue.shift()!; continue; }
        if (done) return;
        await new Promise<void>((resolve) => { wake = resolve; });
        wake = null;
      }
    } finally {
      off();
    }
  }

  /**
   * Ends the call: sends `session.end` and resolves with `session.ended` (the final bill).
   * Rejects with RealtimeSessionClosedError if the socket closes or times out without it.
   */
  async end(options: RealtimeEndOptions = {}): Promise<RealtimeSessionEndedEvent> {
    if (this.endedEvent) return this.endedEvent;
    if (this.closedError) throw this.closedError;
    const message: Record<string, unknown> = { type: "session.end" };
    if (options.reason !== undefined) message.reason = options.reason;
    if (options.cancelResponse !== undefined) message.cancel_response = options.cancelResponse;
    if (this.socket.readyState === OPEN) this.socket.send(JSON.stringify(message));
    const timeoutMs = options.timeoutMs ?? 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new RealtimeSessionClosedError(this.id, null, "", `timed out after ${timeoutMs} ms`);
        this.fail(error);
        try { this.socket.close(1000, "client_end_timeout"); } catch { /* already closing */ }
        reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([this.finished, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Closes the socket without waiting for the bill. The call is still billed; prefer `end()`. */
  close(): void {
    try { this.socket.close(1000, "client_closed"); } catch { /* already closing */ }
  }

  private async handleMessage(data: unknown) {
    const text = await eventText(data);
    if (text === null) return;
    let event: RealtimeEvent;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || typeof (parsed as RealtimeEvent).type !== "string") return;
      event = parsed as RealtimeEvent;
    } catch {
      return;
    }
    if (event.type === "session.ended" && !this.endedEvent && !this.closedError) {
      this.endedEvent = event as RealtimeSessionEndedEvent;
    }
    for (const key of [event.type, "*"]) {
      for (const listener of [...(this.listeners.get(key) ?? [])]) {
        try { listener(event); } catch { /* listener errors must not break the session */ }
      }
    }
    if (event.type === "session.ended" && this.endedEvent === event) this.settle.resolve(this.endedEvent);
  }

  private handleClose(code: number | null, reason: string) {
    if (this.endedEvent) return;
    this.fail(new RealtimeSessionClosedError(this.id, code, reason));
  }

  private fail(error: RealtimeSessionClosedError) {
    if (this.endedEvent || this.closedError) return;
    this.closedError = error;
    this.settle.reject(error);
  }
}

/** @internal Opens the relay socket for a created session and waits for `relay.connected`. */
export async function openRealtimeSession(
  baseUrl: string,
  info: RealtimeSessionInfo,
  options: Pick<RealtimeConnectOptions, "webSocket" | "connectTimeoutMs"> = {},
): Promise<RealtimeSession> {
  const secret = String(info.client_secret ?? info.clientSecret ?? "");
  const connectUrl = info.connect?.url;
  const sessionId = String(info.session_id ?? info.id ?? "");
  if (!secret || !connectUrl || !sessionId) {
    throw new Error("Realtime session response is missing session_id, client_secret or connect.url");
  }
  const WebSocketImpl = await resolveWebSocket(options.webSocket);
  const socket = new WebSocketImpl(realtimeRelayUrl(baseUrl, connectUrl), [RELAY_PROTOCOL, `rtsec.${secret}`]);
  const session = new RealtimeSession(info, socket);
  const timeoutMs = options.connectTimeoutMs ?? 30_000;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      session.close();
      reject(new Error(`Realtime session ${sessionId} did not connect within ${timeoutMs} ms`));
    }, timeoutMs);
    const off = session.on("relay.connected", () => { clearTimeout(timer); off(); resolve(); });
    session.ended.then(
      (ended) => { clearTimeout(timer); off(); reject(new Error(`Realtime session ${sessionId} ended before connecting: ${ended.reason}`)); },
      (error: Error) => { clearTimeout(timer); off(); reject(error); },
    );
  });
  return session;
}
