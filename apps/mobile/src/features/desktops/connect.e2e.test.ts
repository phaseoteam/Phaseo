/**
 * @jest-environment node
 */
// The phone app's real pairing, relay transport and DesktopClient against the real Phaseo Connect relay (ConnectRoom,
// its SQL on node:sqlite) and the real desktop Connect client, over WebSockets on 127.0.0.1, in one process. Those two
// load from their own apps' source (apps/api/src/connect/__tests__/relayHarness.ts) through require, typed below by
// what this test uses, so the app's typecheck doesn't compile Workers or Electron code.
import { request as httpRequest } from "node:http";
import { DesktopClient, type ClientEvent, type ConnectionState } from "./client";
import { pairDesktop } from "./pairing";
import { encodePairingLink } from "./protocol";
import { chooseTransport, type FetchLike, type SavedDesktop } from "./reach";
import type { OpenSocket, SocketLike } from "./transport";

type Processed = { sender: string; frame: Record<string, unknown> };
type Waitable<T> = { items: T[]; until(match: (value: T) => boolean): Promise<T> };
type Relay = {
  url: string;
  seen: string[];
  processed: Waitable<Processed>;
  state: { entitlement: { enabled: boolean; paid_up: boolean } };
  socketOf(deviceId: string): { drop(): void; deliverClose(): void };
  sql: { db: { prepare(query: string): { all(): unknown[] } } };
  close(): Promise<void>;
};
type Task = { status: string };
type Desktop = {
  app: { commands: Record<string, unknown>[]; addMessage(chatId: string, message: { role: "assistant"; text: string }): void; get(chatId: string): Task; touch(task: Task): void; changed(): void };
  pairing: { remove(deviceId: string): void };
  states: Waitable<{ status: string; reason?: string; message?: string }>;
  registered(deviceId: string): Promise<unknown>;
  showPairingCode(): Promise<{ pairingCode: string }>;
  desktopId: string;
  desktopKeys: { publicKey: string };
  stop(): void;
};
type PhoneServer = { app: Desktop["app"]; pairing: { create(): { pairingCode: string }; remove(deviceId: string): void }; desktopId: string; desktopKeys: { publicKey: string }; url: string; close(): Promise<void> };
type Harness = {
  ws: { WebSocket: new (url: string, options?: { headers: Record<string, string> }) => SocketLike };
  startRelay(): Promise<Relay>;
  startDesktop(relay: Relay): Promise<Desktop>;
  startPhoneServer(): Promise<PhoneServer>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const harness = require("../../../../api/src/connect/__tests__/relayHarness") as Harness;

/** React Native's WebSocket, played by the desktop's ws: the same onopen/onmessage/onclose surface and headers. */
const openSocket: OpenSocket = (url, token) => new harness.ws.WebSocket(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
// No direct address in these pairings, so the phone never fetches; a call would be a bug.
const noFetch: FetchLike = () => Promise.reject(new Error("No direct address here."));

/** fetch over node:http, since jest-expo replaces the global fetch with a mock. */
const nodeFetch: FetchLike = (url, init) => new Promise((resolve, reject) => {
  const request = httpRequest(url, { method: init.method ?? "GET", headers: init.headers, signal: init.signal }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8"), status = response.statusCode ?? 0;
      resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) as unknown });
    });
  });
  request.on("error", reject);
  request.end(init.body);
});

/** Retries run only when the test says so. */
function manualClock() {
  const tasks: { run: () => void; ms: number }[] = [];
  return {
    schedule: (run: () => void, ms: number) => { const task = { run, ms }; tasks.push(task); return () => { const index = tasks.indexOf(task); if (index >= 0) tasks.splice(index, 1); }; },
    run(ms: number) { for (const task of tasks.filter((entry) => entry.ms === ms)) { tasks.splice(tasks.indexOf(task), 1); task.run(); } },
  };
}
const RETRY_MS = 7;

function stateReached(client: DesktopClient, status: ConnectionState["status"]) {
  return new Promise<ConnectionState>((resolve) => {
    const check = () => { const state = client.state.get(); if (state.status === status) { stop(); resolve(state); } };
    const stop = client.state.subscribe(check);
    check();
  });
}
function nextEvent<T extends ClientEvent["type"]>(client: DesktopClient, type: T, match: (event: Extract<ClientEvent, { type: T }>) => boolean = () => true) {
  return new Promise<Extract<ClientEvent, { type: T }>>((resolve) => {
    const stop = client.on((event) => { if (event.type === type && match(event as Extract<ClientEvent, { type: T }>)) { stop(); resolve(event as Extract<ClientEvent, { type: T }>); } });
  });
}

describe("the phone app through the real Phaseo Connect relay and desktop client", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step();
    jest.useRealTimers();
  });

  /** A desktop signed in to the relay, a phone paired with it over Connect by scanning its code, and the phone's client connected. */
  async function paired() {
    const relay = await harness.startRelay(); cleanup.push(() => relay.close());
    const desktop = await harness.startDesktop(relay); cleanup.push(() => desktop.stop());
    const { pairingCode } = await desktop.showPairingCode();
    const link = encodePairingLink({ v: 1, desktopId: desktop.desktopId, desktopName: "Test PC", pairingCode, desktopPublicKey: desktop.desktopKeys.publicKey, direct: [], connect: { relayUrl: relay.url, desktopId: desktop.desktopId } });
    const saved: SavedDesktop = await pairDesktop(link, { fetch: noFetch, openSocket, deviceName: "Pixel 9", relayTimeoutMs: 10_000 });
    await desktop.registered(saved.deviceId);
    const clock = manualClock();
    const client = new DesktopClient({ deviceId: saved.deviceId, appVersion: "0.1.0", choose: () => chooseTransport(saved, { fetch: noFetch, openSocket }), backoffMs: () => RETRY_MS, schedule: clock.schedule, requestTimeoutMs: 60_000 });
    cleanup.push(() => client.stop());
    const connected = nextEvent(client, "connected");
    client.start();
    expect(await connected).toEqual({ type: "connected", via: "connect", reconnect: false });
    return { relay, desktop, saved, client, clock, pairingCode };
  }

  test("pairs over Connect without the relay seeing the code, then lists chats and sends, sealed", async () => {
    const { relay, desktop, saved, client, pairingCode } = await paired();
    expect(saved).toMatchObject({ desktopId: desktop.desktopId, desktopName: "Test PC", relayToken: expect.any(String) });
    expect(client.state.get()).toEqual({ status: "connected", via: "connect", desktopName: "Test PC" });
    const { chats } = await client.request("list_chats", {});
    expect(chats).toEqual([expect.objectContaining({ id: "chat-1", title: "Release notes" })]);
    await client.request("send", { chatId: "chat-1", text: "Ship it" });
    expect(desktop.app.commands).toContainEqual(expect.objectContaining({ type: "send", id: "chat-1", text: "Ship it" }));
    // The phone addressed the desktop as the relay names it, and marked only its send for holding.
    const fromPhone = relay.processed.items.filter((entry) => entry.sender === saved.deviceId);
    expect(fromPhone.map((entry) => [entry.frame.to, entry.frame.hold ?? false])).toEqual([["desktop", false], ["desktop", false], ["desktop", true]]);
    const wire = relay.seen.join("\n");
    for (const text of [pairingCode, "Release notes", "Ship it", "Test PC", "Pixel 9"]) expect(wire).not.toContain(text);
  });

  test("gets attention held while it was away and misses the live entries", async () => {
    const { relay, desktop, saved, client, clock } = await paired();
    const stopWatching = client.watch("chat-1");
    await client.request("list_chats", {});
    const entries: unknown[] = [];
    client.on((event) => { if (event.type === "entries") entries.push(event); });

    // The phone's connection drops; the relay knows before the desktop's session does.
    const offline = stateReached(client, "offline");
    relay.socketOf(saved.deviceId).drop();
    await offline;
    desktop.app.addMessage("chat-1", { role: "assistant", text: "Here's a draft." });
    await relay.processed.until((entry) => entry.sender === "desktop" && entry.frame.to === saved.deviceId && !entry.frame.hold);
    const task = desktop.app.get("chat-1");
    task.status = "running"; desktop.app.touch(task); desktop.app.changed();
    task.status = "completed"; desktop.app.touch(task); desktop.app.changed();
    await relay.processed.until((entry) => entry.sender === "desktop" && entry.frame.to === saved.deviceId && entry.frame.hold === true);
    expect(relay.sql.db.prepare("SELECT id FROM held").all()).toHaveLength(1);
    relay.socketOf(saved.deviceId).deliverClose();

    const attention = nextEvent(client, "attention");
    const back = nextEvent(client, "connected");
    clock.run(RETRY_MS);
    expect(await back).toEqual({ type: "connected", via: "connect", reconnect: true });
    expect(await attention).toEqual({ type: "attention", chatId: "chat-1", kind: "done", summary: "Release notes: finished" });
    // Read the chat as the screen does after reconnecting; the dropped entries never arrived on their own.
    await client.request("read_chat", { chatId: "chat-1" });
    expect(JSON.stringify(entries)).not.toContain("Here's a draft.");
    expect(relay.sql.db.prepare("SELECT id FROM held").all()).toHaveLength(0);
    stopWatching();
  });

  test("stops when the desktop removes the phone", async () => {
    const { desktop, saved, client } = await paired();
    const refused = stateReached(client, "refused");
    desktop.pairing.remove(saved.deviceId);
    expect(await refused).toEqual({ status: "refused", message: "This phone was removed on the computer. Pair it again." });
  });

  test("shows Payment due and stops when the relay closes with 4402", async () => {
    const { relay, desktop, client } = await paired();
    jest.useFakeTimers({ doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "hrtime", "performance"] });
    relay.state.entitlement = { enabled: true, paid_up: false };
    // The room re-reads the entitlement after its five-minute cache, on the next frame.
    jest.setSystemTime(Date.now() + 5 * 60_000 + 1);
    const refused = stateReached(client, "refused");
    void client.request("list_chats", {}).catch(() => undefined);
    expect(await refused).toEqual({ status: "refused", message: expect.stringMatching(/^Payment due\./) });
    expect(await desktop.states.until((state) => state.status === "refused")).toMatchObject({ reason: "payment-due" });
  });
});

describe("the phone app directly against the real desktop phone server", () => {
  test("pairs with a sealed POST /pair, proves its key, and chats sealed until removed", async () => {
    const server = await harness.startPhoneServer();
    try {
      const { pairingCode } = server.pairing.create();
      const link = encodePairingLink({ v: 1, desktopId: server.desktopId, desktopName: "Test PC", pairingCode, desktopPublicKey: server.desktopKeys.publicKey, direct: [server.url] });
      const saved = await pairDesktop(link, { fetch: nodeFetch, openSocket, deviceName: "Pixel 9", probeMs: 2000 });
      expect(saved).toMatchObject({ desktopId: server.desktopId, desktopName: "Test PC", direct: [server.url] });
      expect(saved).not.toHaveProperty("deviceToken");

      const clock = manualClock();
      const client = new DesktopClient({ deviceId: saved.deviceId, appVersion: "0.1.0", choose: () => chooseTransport(saved, { fetch: nodeFetch, openSocket, probeMs: 2000 }), backoffMs: () => RETRY_MS, schedule: clock.schedule, requestTimeoutMs: 60_000 });
      const connected = nextEvent(client, "connected");
      client.start();
      expect(await connected).toEqual({ type: "connected", via: "direct", reconnect: false });
      expect((await client.request("list_chats", {})).chats).toEqual([expect.objectContaining({ id: "chat-1", title: "Release notes" })]);
      await client.request("send", { chatId: "chat-1", text: "Ship it" });
      expect(server.app.commands).toContainEqual(expect.objectContaining({ type: "send", id: "chat-1", text: "Ship it" }));

      const refused = stateReached(client, "refused");
      server.pairing.remove(saved.deviceId);
      expect(await refused).toEqual({ status: "refused", message: "This phone was removed on the computer. Pair it again." });
      client.stop();
    } finally { await server.close(); }
  });
});
