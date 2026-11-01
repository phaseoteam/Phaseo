import { applyEntries, chatItems, firstMessageId, mergeChat, mergeDetail, sortChats } from "./chatState";
import { DesktopClient, DesktopRequestError, type ClientEvent, type ConnectionState } from "./client";
import { FakeDesktop } from "./fakeDesktop";
import { pairDesktop } from "./pairing";
import type { PhoneChat, PhoneEntry } from "./protocol";
import { chooseTransport, type SavedDesktop } from "./reach";

/** A clock the test drives: retries and timeouts run only when the test says so. */
function manualClock() {
  const tasks: { run: () => void; ms: number }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const task = { run, ms };
      tasks.push(task);
      return () => { const index = tasks.indexOf(task); if (index >= 0) tasks.splice(index, 1); };
    },
    /** Runs the waits of exactly `ms` (the retries; request timeouts use another length). */
    run(ms: number) { for (const task of tasks.filter((entry) => entry.ms === ms)) { tasks.splice(tasks.indexOf(task), 1); task.run(); } },
  };
}

const RETRY_MS = 5;

function stateReached(client: DesktopClient, status: ConnectionState["status"]) {
  return new Promise<ConnectionState>((resolve) => {
    const check = () => { const state = client.state.get(); if (state.status === status) { stop(); resolve(state); } };
    const stop = client.state.subscribe(check);
    check();
  });
}

function nextEvent<T extends ClientEvent["type"]>(client: DesktopClient, type: T) {
  return new Promise<Extract<ClientEvent, { type: T }>>((resolve) => {
    const stop = client.on((event) => { if (event.type === type) { stop(); resolve(event as Extract<ClientEvent, { type: T }>); } });
  });
}

const deps = (desktop: FakeDesktop) => ({ fetch: desktop.fetch, openSocket: desktop.openSocket, deviceName: "Pixel 9", probeMs: 20, relayTimeoutMs: 1000 });

function clientFor(desktop: FakeDesktop, saved: SavedDesktop, clock = manualClock()) {
  const client = new DesktopClient({
    deviceId: saved.deviceId,
    appVersion: "0.1.0",
    choose: () => chooseTransport(saved, { fetch: desktop.fetch, openSocket: desktop.openSocket, probeMs: 20 }),
    backoffMs: () => RETRY_MS,
    schedule: clock.schedule,
    requestTimeoutMs: 60_000,
  });
  return { client, clock };
}

describe("pairing", () => {
  test("pairs directly when the desktop's address answers", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    expect(saved).toMatchObject({ desktopId: "desk-1", desktopName: "Studio PC", deviceId: "dev-1", deviceName: "Pixel 9", direct: [desktop.directUrl], desktopPublicKey: desktop.keys.publicKey, connect: { relayUrl: desktop.relayUrl } });
    expect(saved).not.toHaveProperty("deviceToken");
    expect(saved.relayToken).toBe(desktop.devices[0]!.relayToken);
    // POST /pair went sealed both ways over the plain http:// address.
    const wire = desktop.directWire.join("\n");
    expect(wire).not.toContain(desktop.pairingCode);
    expect(wire).not.toContain(saved.relayToken);
    expect(wire).not.toContain("Pixel 9");
    // The desktop knows this phone by the key it sent.
    expect(desktop.devices[0]!.publicKey).toBe(saved.publicKey);
    expect(desktop.socketUrls).toEqual([]);
  });

  test("pairs over Phaseo Connect when no address answers, sending only envelopes", async () => {
    const desktop = new FakeDesktop();
    desktop.reachable = false;
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    expect(saved.deviceId).toBe("dev-1");
    expect(desktop.relayed).toHaveLength(1);
    expect(desktop.relayed[0]).toMatchObject({ to: "desktop", senderPublicKey: saved.publicKey });
    expect(JSON.stringify(desktop.relayed[0])).not.toContain(desktop.pairingCode);
  });

  test("says what to do when the desktop can't be reached and has no Connect", async () => {
    const desktop = new FakeDesktop();
    desktop.reachable = false;
    await expect(pairDesktop(desktop.pairingLink(), deps(desktop))).rejects.toThrow("Couldn't reach Studio PC");
  });

  test("refuses a damaged link", async () => {
    const desktop = new FakeDesktop();
    await expect(pairDesktop("phaseo://pair?p=not-a-payload", deps(desktop))).rejects.toThrow("damaged");
  });
});

describe.each(["direct", "connect"] as const)("over %s", (via) => {
  async function connected() {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    if (via === "connect") desktop.reachable = false;
    const { client, clock } = clientFor(desktop, saved);
    const ready = nextEvent(client, "connected");
    client.start();
    expect(await ready).toEqual({ type: "connected", via, reconnect: false });
    return { desktop, client, clock, saved };
  }

  test("says hello first, then lists and reads chats", async () => {
    const { desktop, client } = await connected();
    expect(desktop.received[0]).toMatchObject({ type: "hello", deviceId: "dev-1", appVersion: "0.1.0" });
    expect(client.state.get()).toEqual({ status: "connected", via, desktopName: "Studio PC" });
    const { chats } = await client.request("list_chats", {});
    expect(sortChats(chats).map((chat) => chat.id)).toEqual(["c2", "c1"]);
    const read = await client.request("read_chat", { chatId: "c1" });
    expect(read.entries.map((entry) => entry.id)).toEqual(["m1", "t1", "m2"]);
    expect(read.chat.approvals).toEqual([]);
    client.stop();
  });

  test("sends, steers, answers and stops", async () => {
    const { desktop, client } = await connected();
    await client.request("send", { chatId: "c1", text: "And the tests" });
    await client.request("send", { chatId: "c1", text: "Skip lint", steer: true });
    await client.request("answer_approval", { chatId: "c2", approvalId: "a1", decision: "accept" });
    await client.request("stop", { chatId: "c1" });
    expect(desktop.received.slice(1).map((frame) => frame.type)).toEqual(["send", "send", "answer_approval", "stop"]);
    expect(desktop.received[2]).toMatchObject({ steer: true });
    await expect(client.request("answer_approval", { chatId: "c2", approvalId: "a1", decision: "decline" })).rejects.toMatchObject({ code: "rejected", message: "This approval is no longer pending." });
    if (via === "connect") {
      // The relay holds messages and answers for a desktop that's offline, and nothing else.
      const held = desktop.relayed.filter((frame) => frame.hold === true);
      // hello, two sends, stop and two approval answers went through the relay; hello and stop aren't held.
      expect(held).toHaveLength(4);
      expect(desktop.relayed).toHaveLength(6);
      expect(desktop.relayed.every((frame) => !("text" in frame))).toBe(true);
    }
    client.stop();
  });

  test("sends no chat text or secret in the clear", async () => {
    const { desktop, client, saved } = await connected();
    client.watch("c1");
    await client.request("read_chat", { chatId: "c1" });
    await client.request("send", { chatId: "c1", text: "Ship the hotfix tonight" });
    const streamed = nextEvent(client, "entries");
    desktop.emit({ type: "entries", chatId: "c1", entries: [{ kind: "message", id: "m9", role: "assistant", text: "Hotfix deployed to staging.", createdAt: "2026-11-01T10:00:00.000Z" }] });
    await streamed;
    const wire = via === "direct" ? desktop.directWire.join("\n") : desktop.relayed.map((frame) => JSON.stringify(frame)).join("\n");
    expect(wire.length).toBeGreaterThan(0);
    for (const text of ["Fix the build", "Fixed.", "Ship the hotfix tonight", "Hotfix deployed", "Studio PC", saved.relayToken, saved.privateKey]) expect(wire).not.toContain(text);
    if (via === "direct") expect(desktop.socketUrls.at(-1)).toEqual({ url: "ws://100.64.0.7:47800/v1/phone", token: undefined });
    client.stop();
  });

  test("starts a new chat", async () => {
    const { client } = await connected();
    const { chat } = await client.request("new_chat", { text: "Plan the release", mode: "plan" });
    expect(chat).toMatchObject({ id: "c3", mode: "plan", status: "running" });
    client.stop();
  });

  test("streams entries into the open chat and passes on attention", async () => {
    const { desktop, client } = await connected();
    client.watch("c1");
    const read = await client.request("read_chat", { chatId: "c1" });
    let entries = read.entries;
    const streamed = nextEvent(client, "entries");
    const partial: PhoneEntry = { kind: "message", id: "m3", role: "assistant", text: "Run", createdAt: "2026-11-01T10:00:00.000Z" };
    desktop.emit({ type: "entries", chatId: "c1", entries: [partial] });
    entries = applyEntries(entries, (await streamed).entries);
    const more = nextEvent(client, "entries");
    desktop.emit({ type: "entries", chatId: "c1", entries: [{ ...partial, text: "Running the tests now." }, { kind: "activity", id: "t2", type: "tool", title: "pnpm test", text: "", status: "running" }] });
    entries = applyEntries(entries, (await more).entries);
    expect(entries.map((entry) => entry.id)).toEqual(["m1", "t1", "m2", "m3", "t2"]);
    expect(entries[3]).toMatchObject({ text: "Running the tests now." });
    const attention = nextEvent(client, "attention");
    desktop.emit({ type: "attention", chatId: "c1", kind: "approval", summary: "Wants to run pnpm test" });
    expect(await attention).toEqual({ type: "attention", chatId: "c1", kind: "approval", summary: "Wants to run pnpm test" });
    expect(desktop.received.find((frame) => frame.type === "subscribe")).toMatchObject({ chatIds: ["c1"] });
    client.stop();
  });

  test("follows every chat a screen watches until each lets go", async () => {
    const { desktop, client } = await connected();
    const first = client.watch("c1");
    client.watch("c2");
    const again = client.watch("c1");
    first();
    // Requests arrive in order, so once this answers the subscribes before it have too.
    await client.request("list_chats", {});
    expect(desktop.received.filter((frame) => frame.type === "subscribe").at(-1)).toMatchObject({ chatIds: ["c1", "c2"] });
    again();
    await client.request("list_chats", {});
    expect(desktop.received.filter((frame) => frame.type === "subscribe").at(-1)).toMatchObject({ chatIds: ["c2"] });
    client.stop();
  });

  test("reconnects after the link drops, subscribes again, and fails what was in flight", async () => {
    const { desktop, client, clock } = await connected();
    client.watch("c1");
    await stateReached(client, "connected");
    const offline = stateReached(client, "offline");
    const inFlight = client.request("list_chats", {});
    desktop.drop();
    expect(await offline).toMatchObject({ status: "offline" });
    await expect(inFlight).rejects.toMatchObject({ code: "disconnected" });
    const reconnected = nextEvent(client, "connected");
    clock.run(RETRY_MS);
    expect(await reconnected).toEqual({ type: "connected", via, reconnect: true });
    const subscribes = desktop.received.filter((frame) => frame.type === "subscribe");
    expect(subscribes.at(-1)).toMatchObject({ chatIds: ["c1"] });
    // A second hello opened the new link.
    expect(desktop.received.filter((frame) => frame.type === "hello")).toHaveLength(2);
    client.stop();
  });

  test("waits for the connection with requests made while offline", async () => {
    const { desktop, client, clock } = await connected();
    const offline = stateReached(client, "offline");
    desktop.drop();
    await offline;
    const listed = client.request("list_chats", {});
    clock.run(RETRY_MS);
    expect((await listed).chats).toHaveLength(2);
    client.stop();
  });
});

describe("choosing a transport", () => {
  test("prefers a direct address, then Connect, then nothing", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    const reach = { fetch: desktop.fetch, openSocket: desktop.openSocket, probeMs: 20 };
    expect((await chooseTransport(saved, reach))?.kind).toBe("direct");
    desktop.reachable = false;
    expect((await chooseTransport(saved, reach))?.kind).toBe("connect");
    expect(await chooseTransport({ ...saved, connect: undefined }, reach)).toBeNull();
  });

  test("stops retrying when the desktop removed this phone", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink(), deps(desktop));
    const { client } = clientFor(desktop, saved);
    const ready = nextEvent(client, "connected");
    client.start();
    await ready;
    const refused = stateReached(client, "refused");
    desktop.drop(4401);
    expect(await refused).toMatchObject({ message: "This phone was removed on the computer. Pair it again." });
    await expect(client.request("list_chats", {})).rejects.toBeInstanceOf(DesktopRequestError);
    client.stop();
  });

  test("stops retrying when the desktop no longer knows this phone's key", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink(), deps(desktop));
    desktop.devices.length = 0;
    const { client } = clientFor(desktop, saved);
    const refused = stateReached(client, "refused");
    client.start();
    expect(await refused).toMatchObject({ message: "This phone was removed on the computer. Pair it again." });
    client.stop();
  });

  test("shows Connect's refusal when it's off for the desktop", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    desktop.reachable = false;
    desktop.relayClose = { code: 4402, reason: "connect_off" };
    const { client } = clientFor(desktop, saved);
    const refused = stateReached(client, "refused");
    client.start();
    expect(await refused).toMatchObject({ message: expect.stringContaining("Phaseo Connect is off") });
    client.stop();
  });

  test("says why Connect refused: removed, or payment due, and stops trying", async () => {
    for (const [close, message] of [
      [{ code: 4001, reason: "unauthorized" }, "This phone was removed on the computer. Pair it again."],
      [{ code: 4402, reason: "payment_required" }, expect.stringMatching(/^Payment due\./)],
    ] as const) {
      const desktop = new FakeDesktop();
      const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
      desktop.reachable = false;
      desktop.relayClose = close;
      const { client } = clientFor(desktop, saved);
      const refused = stateReached(client, "refused");
      client.start();
      expect(await refused).toMatchObject({ message });
      client.stop();
    }
  });

  test("keeps trying, and says why, while Connect can't check the workspace", async () => {
    const desktop = new FakeDesktop();
    const saved = await pairDesktop(desktop.pairingLink({ connect: true }), deps(desktop));
    desktop.reachable = false;
    desktop.relayClose = { code: 4503, reason: "entitlement_unavailable" };
    const { client } = clientFor(desktop, saved);
    const offline = stateReached(client, "offline");
    client.start();
    expect(await offline).toMatchObject({ message: expect.stringContaining("can't check this computer's workspace right now") });
    // Once the relay can check again, the next try gets in.
    desktop.relayClose = null;
    const connected = stateReached(client, "connected");
    client.retryNow();
    expect(await connected).toMatchObject({ via: "connect" });
    client.stop();
  });
});

describe("chat state", () => {
  const chat = (id: string, needsYou: boolean, updatedAt: string): PhoneChat => ({ id, title: id, mode: "chat", status: "idle", updatedAt, unread: false, needsYou });

  test("puts chats that need you first, then the newest", () => {
    const chats = sortChats([chat("a", false, "2026-11-01T10:00:00Z"), chat("b", true, "2026-11-01T08:00:00Z"), chat("c", false, "2026-11-01T11:00:00Z")]);
    expect(chats.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
    expect(mergeChat(chats, chat("a", true, "2026-11-01T12:00:00Z")).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  test("keeps approvals when a list row updates the open chat", () => {
    const detail = { ...chat("a", true, "2026-11-01T10:00:00Z"), approvals: [{ id: "x", title: "Run", description: "" }], questions: [] };
    expect(mergeDetail(detail, { ...chat("a", false, "2026-11-01T10:01:00Z"), status: "running" })).toMatchObject({ status: "running", approvals: [{ id: "x" }] });
    expect(mergeDetail(detail, { ...detail, approvals: [] }).approvals).toEqual([]);
  });

  test("folds runs of activities and pages back from the first message", () => {
    const entries: PhoneEntry[] = [
      { kind: "activity", id: "t0", type: "reasoning", title: "Thinking", text: "" },
      { kind: "message", id: "m1", role: "user", text: "Hi", createdAt: "" },
      { kind: "activity", id: "t1", type: "tool", title: "ls", text: "" },
      { kind: "activity", id: "t2", type: "tool", title: "cat", text: "" },
      { kind: "message", id: "m2", role: "assistant", text: "Done", createdAt: "" },
    ];
    expect(chatItems(entries).map((item) => (item.kind === "message" ? item.message.id : item.activities.map((entry) => entry.id).join("+")))).toEqual(["t0", "m1", "t1+t2", "m2"]);
    expect(firstMessageId(entries)).toBe("m1");
  });
});
