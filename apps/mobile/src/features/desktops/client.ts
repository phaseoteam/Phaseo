import { createStore } from "@/lib/store";
import { phoneProtocolVersion, type DesktopEvent, type DesktopFrame, type PhoneErrorCode, type PhoneRequest, type PhoneResults } from "./protocol";
import { isHeld, type DesktopTransport, type Link, type LinkClosed, type TransportKind } from "./transport";

export type ConnectionState =
  | { status: "connecting" }
  | { status: "connected"; via: TransportKind; desktopName: string }
  | { status: "offline"; message: string }
  | { status: "refused"; message: string }
  | { status: "stopped" };

/** What the screens hear: the desktop's events, and each (re)connection, after which they read again what they show. */
export type ClientEvent = Exclude<DesktopEvent, { type: "ping" | "pong" }> | { type: "connected"; via: TransportKind; reconnect: boolean };

export type RequestErrorCode = PhoneErrorCode | "timeout" | "disconnected" | "held";
export class DesktopRequestError extends Error {
  constructor(readonly code: RequestErrorCode, message: string) { super(message); this.name = "DesktopRequestError"; }
}

type RequestType = PhoneRequest["type"];
type RequestBody<T extends RequestType> = Omit<Extract<PhoneRequest, { type: T }>, "id" | "type">;
type Pending = { resolve(result: unknown): void; reject(error: DesktopRequestError): void; cancelTimer(): void; held: boolean };

export type ClientOptions = {
  deviceId: string;
  appVersion: string;
  /** Picks how to reach the desktop now; called again before every reconnect, as the network may have changed. */
  choose(): Promise<DesktopTransport | null>;
  backoffMs?(attempt: number): number;
  /** Runs `run` after `ms`; returns a cancel. Tests pass their own clock. */
  schedule?(run: () => void, ms: number): () => void;
  requestTimeoutMs?: number;
};

const defaultBackoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);
const defaultSchedule = (run: () => void, ms: number) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); };
const unreachable = "Can't reach this computer. Check it's on and Phaseo is open, and that this phone is on the same Wi-Fi or tailnet.";

/**
 * One paired desktop, over whichever transport reaches it. Sends hello first, matches responses to requests by id,
 * reconnects with backoff, and subscribes again to the chats the screens watch. A request made while offline waits
 * for the connection until it times out.
 */
export class DesktopClient {
  readonly state = createStore<ConnectionState>({ status: "stopped" });
  private link: Link | undefined;
  private ready = false;
  private stopped = true;
  private generation = 0;
  private attempt = 0;
  private connectedOnce = false;
  private cancelRetry: (() => void) | undefined;
  private nextId = 0;
  private readonly pending = new Map<string, Pending>();
  /** Requests made before the connection was ready, sent once it is. */
  private waiting: PhoneRequest[] = [];
  private readonly listeners = new Set<(event: ClientEvent) => void>();
  private readonly watched = new Map<string, number>();
  private via: TransportKind | undefined;

  constructor(private readonly options: ClientOptions) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.cancelRetry?.();
    const link = this.link;
    this.link = undefined;
    this.ready = false;
    link?.close();
    this.failAll(new DesktopRequestError("disconnected", "Disconnected from the computer."));
    this.state.set({ status: "stopped" });
  }

  /** Tries again at once (the app came back to the foreground, or the person asked). */
  retryNow() {
    const { status } = this.state.get();
    if (this.stopped || status === "connected" || status === "connecting") return;
    this.cancelRetry?.();
    this.attempt = 0;
    void this.connect();
  }

  on(listener: (event: ClientEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Streams a chat's changes until the returned function is called. Screens stacked on each other may watch the same
   * or different chats; the desktop gets them all in one subscribe, sent again after every reconnect.
   */
  watch(chatId: string) {
    this.watched.set(chatId, (this.watched.get(chatId) ?? 0) + 1);
    this.subscribe();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.watched.get(chatId) ?? 1) - 1;
      if (count > 0) this.watched.set(chatId, count); else this.watched.delete(chatId);
      this.subscribe();
    };
  }

  private subscribe() {
    if (this.ready) this.request("subscribe", { chatIds: [...this.watched.keys()] }).catch(() => undefined);
  }

  request<T extends RequestType>(type: T, body: RequestBody<T>): Promise<PhoneResults[T]> {
    const frame = { ...body, type, id: `r${++this.nextId}` } as PhoneRequest;
    return new Promise<PhoneResults[T]>((resolve, reject) => {
      const state = this.state.get();
      if (state.status === "refused") { reject(new DesktopRequestError("unauthorized", state.message)); return; }
      if (this.stopped) { reject(new DesktopRequestError("disconnected", "Not connected to the computer.")); return; }
      const held = isHeld(frame) && this.via === "connect";
      const cancelTimer = (this.options.schedule ?? defaultSchedule)(() => this.timedOut(frame.id), this.options.requestTimeoutMs ?? 20_000);
      this.pending.set(frame.id, { resolve: resolve as (result: unknown) => void, reject, cancelTimer, held });
      if (this.ready && this.link) this.link.send(frame);
      else this.waiting.push(frame);
    });
  }

  private emit(event: ClientEvent) { for (const listener of [...this.listeners]) listener(event); }

  private settle(id: string) {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    this.pending.delete(id);
    entry.cancelTimer();
    return entry;
  }

  private timedOut(id: string) {
    const entry = this.settle(id);
    if (!entry) return;
    this.waiting = this.waiting.filter((frame) => frame.id !== id);
    // Over Connect, a message, steer or answer waits in the relay for a computer that's offline.
    if (entry.held) { entry.reject(new DesktopRequestError("held", "Your computer hasn't answered. Phaseo Connect keeps the message and delivers it when the computer is back.")); return; }
    entry.reject(new DesktopRequestError("timeout", "The computer took too long to answer."));
    // No answer on an open link usually means the link died quietly; a fresh one reads everything again.
    if (this.ready) this.link?.close();
  }

  private failAll(error: DesktopRequestError) {
    this.waiting = [];
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(error);
  }

  private async connect() {
    const generation = ++this.generation;
    this.state.set({ status: "connecting" });
    let transport: DesktopTransport | null = null;
    try { transport = await this.options.choose(); } catch { transport = null; }
    if (generation !== this.generation) return;
    if (!transport) { this.retryLater(unreachable); return; }
    let link: Link;
    try {
      link = await transport.open({
        frame: (frame) => { if (generation === this.generation) this.receive(frame); },
        closed: (reason) => { if (generation === this.generation) this.lost(reason); },
      });
    } catch {
      if (generation === this.generation) this.retryLater(unreachable);
      return;
    }
    if (generation !== this.generation) { link.close(); return; }
    this.link = link;
    this.via = transport.kind;
    // hello goes first, ahead of anything that waited.
    const helloId = `r${++this.nextId}`;
    const hello = new Promise<PhoneResults["hello"]>((resolve, reject) => {
      const cancelTimer = (this.options.schedule ?? defaultSchedule)(() => this.timedOut(helloId), this.options.requestTimeoutMs ?? 20_000);
      this.pending.set(helloId, { resolve: resolve as (result: unknown) => void, reject, cancelTimer, held: false });
    });
    link.send({ id: helloId, type: "hello", deviceId: this.options.deviceId, appVersion: this.options.appVersion });
    let result: PhoneResults["hello"];
    try { result = await hello; } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof DesktopRequestError && error.code === "unauthorized") { this.refuse("This phone was removed on the computer. Pair it again."); return; }
      link.close();
      return;
    }
    if (generation !== this.generation) return;
    if (result.protocol > phoneProtocolVersion) { this.refuse("The computer runs a newer Phaseo. Update this app to use it."); return; }
    this.ready = true;
    this.attempt = 0;
    this.state.set({ status: "connected", via: transport.kind, desktopName: result.desktopName });
    if (this.watched.size) link.send({ id: `r${++this.nextId}`, type: "subscribe", chatIds: [...this.watched.keys()] });
    const waiting = this.waiting;
    this.waiting = [];
    for (const frame of waiting) {
      // A request queued before the transport was known may be held over Connect.
      const entry = this.pending.get(frame.id);
      if (entry) entry.held = isHeld(frame) && transport.kind === "connect";
      link.send(frame);
    }
    this.emit({ type: "connected", via: transport.kind, reconnect: this.connectedOnce });
    this.connectedOnce = true;
  }

  private receive(frame: DesktopFrame) {
    if ("ok" in frame) {
      const entry = this.settle(frame.id);
      if (!entry) return;
      if (frame.ok) entry.resolve(frame.result);
      else entry.reject(new DesktopRequestError(frame.error.code, frame.error.message));
      return;
    }
    if (frame.type === "ping") { this.link?.send({ type: "pong", ...(frame.id ? { id: frame.id } : {}) }); return; }
    if (frame.type === "pong") return;
    this.emit(frame);
  }

  private lost(reason: LinkClosed) {
    this.link = undefined;
    this.ready = false;
    // Requests already sent may or may not have arrived; the screens read again after reconnecting.
    for (const [id, entry] of [...this.pending]) {
      if (this.waiting.some((frame) => frame.id === id)) continue;
      this.settle(id);
      entry.reject(new DesktopRequestError("disconnected", "The connection dropped. Check the chat before sending again."));
    }
    if (this.stopped) return;
    if (reason.refused) { this.refuse(reason.refused); return; }
    this.retryLater("Connection lost. Trying again…");
  }

  private refuse(message: string) {
    this.generation += 1;
    const link = this.link;
    this.link = undefined;
    this.ready = false;
    link?.close();
    this.failAll(new DesktopRequestError("unauthorized", message));
    this.state.set({ status: "refused", message });
  }

  private retryLater(message: string) {
    if (this.stopped) return;
    const wait = (this.options.backoffMs ?? defaultBackoff)(this.attempt++);
    this.state.set({ status: "offline", message });
    this.cancelRetry?.();
    this.cancelRetry = (this.options.schedule ?? defaultSchedule)(() => { this.cancelRetry = undefined; void this.connect(); }, wait);
  }
}
