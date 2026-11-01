import {
  encodePairingLink, EnvelopeChannel, generateKeyPair, isEnvelope, okResponse, errorResponse, parsePhoneFrame, randomToken, relayPairing, sharedKey,
  type DesktopFrame, type PhoneChatDetail, type PhoneEntry, type PhoneFrame, type PhoneRequest, type PhoneResponse,
} from "./protocol";
import type { FetchLike } from "./reach";
import type { OpenSocket, SocketLike } from "./transport";

type Device = { id: string; token: string; relayToken: string; publicKey: string };
type Peer = { socket: FakeSocket; kind: "direct" | "connect"; device?: Device; channel?: EnvelopeChannel };

/** A socket whose other end is the fake desktop. Delivery is async, like a real socket. */
class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  constructor(private readonly deliver: (text: string) => void) {}
  send(data: string) { if (!this.closed) queueMicrotask(() => this.deliver(data)); }
  close(code = 1000) { this.end(code); }
  /** The desktop (or the relay) ends the socket. */
  end(code = 1006) {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.onclose?.({ code }));
  }
  push(text: string) { if (!this.closed) queueMicrotask(() => this.onmessage?.({ data: text })); }
}

/**
 * A desktop for the phone's tests, speaking the protocol package's frames: its phone server (health, POST /pair,
 * /v1/phone) and, through a stand-in relay, Phaseo Connect with real envelopes.
 */
export class FakeDesktop {
  readonly desktopId = "desk-1";
  readonly desktopName = "Studio PC";
  readonly keys = generateKeyPair();
  readonly pairingCode = randomToken(32);
  readonly directUrl = "http://100.64.0.7:47800";
  readonly relayUrl = "wss://connect.test";
  /** Whether the direct address answers (false: off the tailnet). */
  reachable = true;
  /** What the relay answers a phone's socket with instead of forwarding, e.g. not_entitled. */
  relayError: string | null = null;
  readonly devices: Device[] = [];
  readonly received: PhoneFrame[] = [];
  /** Raw frames the relay saw from the phone, to check holding and that it only saw envelopes. */
  readonly relayed: Record<string, unknown>[] = [];
  readonly socketUrls: { url: string; token: string }[] = [];
  readonly peers = new Set<Peer>();
  chats: PhoneChatDetail[] = [
    { id: "c1", title: "Fix the build", mode: "code", status: "completed", updatedAt: "2026-11-01T09:00:00.000Z", unread: false, needsYou: false, project: "Phaseo", projectId: "p1", approvals: [], questions: [] },
    { id: "c2", title: "Release notes", mode: "chat", status: "waiting", updatedAt: "2026-11-01T08:00:00.000Z", unread: true, needsYou: true, attention: "Wants to run a command", approvals: [{ id: "a1", title: "Run pnpm build", description: "pnpm --filter web build" }], questions: [] },
  ];
  entries = new Map<string, PhoneEntry[]>([
    ["c1", [
      { kind: "message", id: "m1", role: "user", text: "Fix the build", createdAt: "2026-11-01T08:59:00.000Z" },
      { kind: "activity", id: "t1", type: "tool", title: "Ran pnpm build", text: "ok", status: "completed" },
      { kind: "message", id: "m2", role: "assistant", text: "Fixed.", createdAt: "2026-11-01T09:00:00.000Z", completedAt: "2026-11-01T09:00:00.000Z" },
    ]],
    ["c2", []],
  ]);

  pairingLink(options: { direct?: boolean; connect?: boolean } = {}) {
    return encodePairingLink({
      v: 1, desktopId: this.desktopId, desktopName: this.desktopName, pairingCode: this.pairingCode, desktopPublicKey: this.keys.publicKey,
      direct: options.direct === false ? [] : [this.directUrl],
      ...(options.connect ? { connect: { relayUrl: this.relayUrl, desktopId: this.desktopId } } : {}),
    });
  }

  private redeem(body: { pairingCode?: unknown; devicePublicKey?: unknown }) {
    if (body.pairingCode !== this.pairingCode) throw new Error("This pairing code has expired.");
    const device = { id: `dev-${this.devices.length + 1}`, token: randomToken(), relayToken: randomToken(), publicKey: String(body.devicePublicKey) };
    this.devices.push(device);
    return { deviceId: device.id, deviceToken: device.token, relayToken: device.relayToken, desktopId: this.desktopId, desktopName: this.desktopName };
  }

  readonly fetch: FetchLike = async (url, init) => {
    if (!url.startsWith(this.directUrl) || !this.reachable) {
      // An address that doesn't answer: the probe's own time limit ends it.
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    const path = url.slice(this.directUrl.length);
    if (path === "/v1/phone/health") return { ok: true, status: 200, json: async () => ({ ok: true, desktopId: this.desktopId }) };
    if (path === "/pair" && init.method === "POST") {
      try {
        const result = this.redeem(JSON.parse(init.body ?? "{}"));
        return { ok: true, status: 200, json: async () => result };
      } catch (error) { return { ok: false, status: 400, json: async () => ({ error: (error as Error).message }) }; }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  readonly openSocket: OpenSocket = (url, token) => {
    this.socketUrls.push({ url, token });
    const peer: Peer = { socket: new FakeSocket((text) => this.receive(peer, text)), kind: url.startsWith(this.relayUrl) ? "connect" : "direct" };
    const { socket } = peer;
    const refuse = () => { socket.end(1006); return socket; };
    if (peer.kind === "direct") {
      if (url !== "ws://100.64.0.7:47800/v1/phone" || !this.reachable) return refuse();
      peer.device = this.devices.find((device) => device.token === token);
      if (!peer.device) return refuse();
    } else {
      if (url !== `${this.relayUrl}/v1/phone/${this.desktopId}`) return refuse();
      peer.device = this.devices.find((device) => device.relayToken === token);
      if (!peer.device && token !== relayPairing(this.pairingCode).relayToken) return refuse();
      if (peer.device) peer.channel = new EnvelopeChannel(sharedKey(this.keys.privateKey, peer.device.publicKey), this.desktopId, peer.device.id);
    }
    this.peers.add(peer);
    queueMicrotask(() => {
      socket.onopen?.();
      if (peer.kind === "connect" && this.relayError) socket.push(JSON.stringify({ type: "error", code: this.relayError, message: this.relayError }));
    });
    return socket;
  };

  private receive(peer: Peer, text: string) {
    if (peer.kind === "direct") { this.answer(peer, parsePhoneFrame(text)); return; }
    const envelope = JSON.parse(text) as Record<string, unknown>;
    this.relayed.push(envelope);
    if (!isEnvelope(envelope) || envelope.to !== this.desktopId) return;
    if (!peer.device) {
      // Pairing over Connect: a fresh channel with the key sent beside the envelope.
      const publicKey = envelope.senderPublicKey!;
      const channel = new EnvelopeChannel(sharedKey(this.keys.privateKey, publicKey), this.desktopId, envelope.from);
      const request = JSON.parse(channel.open(envelope)) as { id: string; type: string; pairingCode?: string; devicePublicKey?: string };
      const reply = request.type === "pair" && request.devicePublicKey === publicKey
        ? { id: request.id, type: "pair", ok: true, result: this.redeem(request) }
        : { id: request.id, type: "pair", ok: false, error: { code: "rejected", message: "Invalid pairing request." } };
      peer.socket.push(JSON.stringify(channel.seal(reply)));
      return;
    }
    this.answer(peer, parsePhoneFrame(peer.channel!.open(envelope)));
  }

  private deliver(peer: Peer, frame: DesktopFrame) {
    peer.socket.push(JSON.stringify(peer.kind === "direct" ? frame : peer.channel!.seal(frame)));
  }

  private answer(peer: Peer, frame: PhoneFrame) {
    this.received.push(frame);
    if (frame.type === "ping" || frame.type === "pong") return;
    this.deliver(peer, this.respond(frame));
  }

  private respond(request: PhoneRequest): PhoneResponse {
    const chatId = "chatId" in request ? request.chatId : undefined;
    const chat = chatId ? this.chats.find((value) => value.id === chatId) : undefined;
    if (chatId && !chat) return errorResponse(request.id, request.type, "not_found", "This chat no longer exists on this computer.") as PhoneResponse;
    switch (request.type) {
      case "hello": return okResponse(request, { desktopName: this.desktopName, appVersion: "1.0.0", protocol: 1 });
      case "list_chats": return okResponse(request, { chats: this.chats.map(({ approvals: _approvals, questions: _questions, ...row }) => row) });
      case "read_chat": {
        const all = this.entries.get(request.chatId) ?? [];
        const end = request.before ? all.findIndex((entry) => entry.id === request.before) : all.length;
        const start = Math.max(0, end - (request.limit ?? 50));
        return okResponse(request, { chat: chat!, entries: all.slice(start, end), earlier: all.slice(0, start).filter((entry) => entry.kind === "message").length });
      }
      case "send": {
        chat!.status = "running";
        this.entries.get(chat!.id)!.push({ kind: "message", id: `u${this.received.length}`, role: "user", text: request.text, createdAt: "2026-11-01T10:00:00.000Z", ...(request.steer ? { delivery: "steer" as const } : {}) });
        return okResponse(request, { chatId: chat!.id });
      }
      case "answer_approval":
        if (!chat!.approvals.some((approval) => approval.id === request.approvalId)) return errorResponse(request.id, request.type, "rejected", "This approval is no longer pending.") as PhoneResponse;
        chat!.approvals = chat!.approvals.filter((approval) => approval.id !== request.approvalId);
        return okResponse(request, { chatId: chat!.id });
      case "answer_question": return okResponse(request, { chatId: chat!.id });
      case "stop": chat!.status = "interrupted"; return okResponse(request, { chatId: chat!.id });
      case "new_chat": {
        const created: PhoneChatDetail = { id: `c${this.chats.length + 1}`, title: "New chat", mode: request.mode, status: "running", updatedAt: "2026-11-01T10:00:00.000Z", unread: false, needsYou: false, approvals: [], questions: [] };
        this.chats.push(created);
        this.entries.set(created.id, [{ kind: "message", id: "n1", role: "user", text: request.text, createdAt: created.updatedAt }]);
        return okResponse(request, { chat: created });
      }
      case "subscribe": return okResponse(request, { chatIds: request.chatIds });
    }
  }

  /** Sends an event to every connected phone, as the desktop does when a chat changes. */
  emit(frame: DesktopFrame) { for (const peer of this.peers) if (!peer.socket.closed) this.deliver(peer, frame); }
  /** Drops every connection, as when the computer sleeps or the Wi-Fi changes. */
  drop(code = 1006) { for (const peer of this.peers) peer.socket.end(code); this.peers.clear(); }
}
