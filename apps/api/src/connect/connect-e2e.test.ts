// Phaseo Connect end to end, in one process: the real phaseo-connect Worker
// routing and ConnectRoom (its SQL on node:sqlite), the real desktop Connect
// client from apps/desktop, and a phone built only from @phaseo/phone-protocol.
// They talk over real WebSockets on 127.0.0.1; a small server stands in for
// the Workers runtime's upgrade and hibernation plumbing.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import type { Duplex } from "node:stream";
import {
	EnvelopeChannel,
	generateKeyPair,
	parseRelayFrame,
	relayCloseCodes,
	relayDesktopAddress,
	relayHolds,
	relayPairing,
	relayPhoneUrl,
	sharedKey,
	tokenHash,
	validatePairResult,
	type KeyPair,
	type RelayServerFrame,
} from "@phaseo/phone-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFailure, AuthSuccess } from "@/pipeline/before/auth";
import { createConnectWorker, type ConnectWorkerEnv } from "../connect-worker";
import { ConnectRoom, ENTITLEMENT_TTL_MS } from "./connect-room";
import { sqlStorage } from "./__tests__/sqlStorage";
import { ConnectClient, type ConnectClientState } from "../../../desktop/src/main/phone/connectClient";
import { fakePhoneHost } from "../../../desktop/src/main/phone/fakePhoneHost";
import { PhonePairing, type PhoneSettings } from "../../../desktop/src/main/phone/phoneDevices";
import { PhoneHub } from "../../../desktop/src/main/phone/phoneSession";

// The desktop's own ws, the library its Connect client uses.
type WsSocket = { send(text: string): void; close(code?: number, reason?: string): void; terminate(): void; on(event: string, listener: (...args: never[]) => void): unknown };
type WsModule = {
	WebSocket: new (url: string, options: { headers: Record<string, string> }) => WsSocket;
	WebSocketServer: new (options: { noServer: true }) => { handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, done: (socket: WsSocket) => void): void; close(): void };
};
const ws = createRequire(path.resolve(__dirname, "../../../desktop/package.json"))("ws") as WsModule;

const GATEWAY_KEY = "phaseo-gateway-key";
let entitlement = { enabled: true, paid_up: true };

type Waiter<T> = { match: (value: T) => boolean; resolve: (value: T) => void };
/** Values as they arrive, and promises for ones that haven't yet. Nothing here sleeps. */
function inbox<T>() {
	const items: T[] = [], waiters: Waiter<T>[] = [];
	return {
		items,
		push(value: T) { items.push(value); for (const waiter of waiters.filter(entry => entry.match(value))) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(value); } },
		until(match: (value: T) => boolean) { const found = items.find(match); return found !== undefined ? Promise.resolve(found) : new Promise<T>(resolve => waiters.push({ match, resolve })); },
	};
}

/** The relay: phaseo-connect's fetch handler in front of one ConnectRoom, served on a loopback port. */
async function startRelay() {
	const sql = sqlStorage();
	const accepted: { socket: RoomSocket; tags: string[] }[] = [];
	const pending = new WeakMap<Response, RoomSocket>();
	let alarm: number | null = null, autoResponse: { request: string; response: string } | undefined;
	// Everything the relay could read, to check what it never sees.
	const seen: string[] = [];
	const processed = inbox<{ sender: string; frame: Record<string, unknown> }>();
	const upgrades: string[] = [];
	// The runtime hands a room one event at a time.
	let events = Promise.resolve();
	const queue = (work: () => Promise<void>) => { events = events.then(work, work); };

	class RoomSocket {
		readyState = 1;
		private client?: WsSocket;
		private outbox: string[] = [];
		private closing?: { code: number; reason: string };
		private attachment: unknown = null;
		private held = false;
		private heldClose = false;
		send(text: string) {
			if (this.readyState !== 1) throw new Error("closed");
			seen.push(text);
			if (this.client) this.client.send(text); else this.outbox.push(text);
		}
		close(code: number, reason: string) {
			if (this.readyState === 3) return;
			this.readyState = 3;
			if (this.client) this.client.close(code, reason); else this.closing = { code, reason };
		}
		serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
		deserializeAttachment() { return this.attachment; }
		attach(client: WsSocket) {
			this.client = client;
			for (const text of this.outbox.splice(0)) client.send(text);
			if (this.closing) client.close(this.closing.code, this.closing.reason);
			client.on("message", (data: Buffer) => {
				const text = data.toString();
				seen.push(text);
				if (text === autoResponse?.request) { client.send(autoResponse.response); return; }
				queue(async () => {
					await room.webSocketMessage(this as unknown as WebSocket, text);
					const sender = this.attachment as { role: string; deviceId?: string };
					processed.push({ sender: sender.deviceId ?? sender.role, frame: JSON.parse(text) as Record<string, unknown> });
				});
			});
			client.on("close", () => {
				this.readyState = 3;
				if (this.held) this.heldClose = true; else queue(() => room.webSocketClose(this as unknown as WebSocket));
			});
		}
		/** The phone's connection is gone and the relay's socket is closed, but the close hasn't reached the room's handler. */
		drop() { this.held = true; this.readyState = 3; this.client?.terminate(); }
		deliverClose() { this.held = false; if (this.heldClose) queue(() => room.webSocketClose(this as unknown as WebSocket)); }
	}

	const ctx = {
		storage: { sql, getAlarm: async () => alarm, setAlarm: async (at: number) => { alarm = at; } },
		acceptWebSocket: (socket: RoomSocket, tags: string[]) => accepted.push({ socket, tags }),
		getWebSockets: (tag?: string) => accepted.filter(entry => !tag || entry.tags.includes(tag)).map(entry => entry.socket),
		setWebSocketAutoResponse: (pair: { request: string; response: string }) => { autoResponse = pair; },
	};
	class TestRoom extends ConnectRoom {
		protected override upgrade(attachment: unknown, tags: string[]) {
			const socket = new RoomSocket();
			ctx.acceptWebSocket(socket, tags);
			socket.serializeAttachment(attachment);
			// Node can't build a 101 response; the socket rides beside it to the server below.
			const response = new Response(null, { status: 200 });
			pending.set(response, socket);
			return { response, socket: socket as unknown as WebSocket };
		}
	}
	const room = new TestRoom(ctx as unknown as DurableObjectState, { SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "service" });

	// The gateway's key check, standing in for the real one (the Worker's config test covers that wiring).
	const auth = async (request: Request): Promise<AuthSuccess | AuthFailure> => request.headers.get("authorization") === `Bearer ${GATEWAY_KEY}`
		? { ok: true, workspaceId: "ws-1", apiKeyId: "key-1", apiKeyRef: "kid_x", apiKeyKid: "x" }
		: { ok: false, reason: "invalid_key_format" };
	const worker = createConnectWorker(auth);
	const env = { CONNECT_ROOM: { idFromName: (name: string) => name, get: () => ({ fetch: (request: Request) => room.fetch(request) }) } } as unknown as ConnectWorkerEnv;

	const wss = new ws.WebSocketServer({ noServer: true });
	const server = createServer((_request, response) => { response.writeHead(426).end(); });
	server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => void (async () => {
		upgrades.push(request.url ?? "");
		const headers = new Headers({ upgrade: "websocket" });
		if (typeof request.headers.authorization === "string") headers.set("authorization", request.headers.authorization);
		const response = await worker.fetch(new Request(`https://connect.test${request.url}`, { headers }), env, { waitUntil: () => {} } as unknown as ExecutionContext);
		const roomSocket = pending.get(response);
		if (roomSocket) { wss.handleUpgrade(request, socket, head, client => roomSocket.attach(client)); return; }
		const body = await response.text();
		socket.end(`HTTP/1.1 ${response.status} Refused\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`);
	})());
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
	const socketOf = (deviceId: string) => accepted.filter(entry => entry.tags.includes(`device:${deviceId}`)).at(-1)!.socket;
	const close = () => new Promise<void>(resolve => { wss.close(); server.closeAllConnections(); server.close(() => resolve()); });
	return { url, sql, seen, processed, upgrades, socketOf, close };
}

type PhoneInbox = { relay?: RelayServerFrame; desktop?: Record<string, unknown> };
/** A phone app as the protocol package describes it: sign in to the relay, seal and open envelopes. */
class FakePhone {
	readonly inbox = inbox<PhoneInbox>();
	readonly closes = inbox<{ code: number; reason: string }>();
	private socket?: WsSocket;
	private channel: EnvelopeChannel;
	constructor(private readonly relayUrl: string, private readonly desktopId: string, readonly keys: KeyPair, desktopPublicKey: string, readonly deviceId: string, private readonly relayToken: string) {
		this.channel = new EnvelopeChannel(sharedKey(keys.privateKey, desktopPublicKey), deviceId, relayDesktopAddress);
	}
	/** "open", or the HTTP status the relay refused the sign-in with. */
	connect() {
		return new Promise<"open" | number>(resolve => {
			const socket = new ws.WebSocket(relayPhoneUrl(this.relayUrl, this.desktopId), { headers: { Authorization: `Bearer ${this.relayToken}` } });
			this.socket = socket;
			socket.on("open", () => resolve("open"));
			socket.on("unexpected-response", (_request: IncomingMessage, response: IncomingMessage) => { resolve(response.statusCode ?? 0); socket.terminate(); });
			socket.on("error", () => {});
			socket.on("message", (data: Buffer) => {
				const frame = parseRelayFrame(data.toString());
				if (frame && "ciphertext" in frame) this.inbox.push({ desktop: JSON.parse(this.channel.open(frame)) as Record<string, unknown> });
				else if (frame) this.inbox.push({ relay: frame });
			});
			socket.on("close", (code: number, reason: Buffer) => this.closes.push({ code, reason: reason.toString() }));
		});
	}
	send(frame: Record<string, unknown>, extra: Record<string, unknown> = {}) {
		const envelope = this.channel.seal(frame);
		this.socket!.send(JSON.stringify({ ...envelope, ...relayHolds(frame) ? { hold: true } : {}, ...extra }));
	}
	async request(frame: Record<string, unknown> & { id: string }, extra?: Record<string, unknown>) {
		this.send(frame, extra);
		return (await this.inbox.until(entry => entry.desktop?.id === frame.id)).desktop!;
	}
	disconnect() { this.socket?.close(1000); }
}

describe("Phaseo Connect end to end: relay, desktop client and phone", () => {
	const cleanup: (() => Promise<void> | void)[] = [];
	beforeEach(() => {
		entitlement = { enabled: true, paid_up: true };
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify([entitlement]), { status: 200 }));
		vi.stubGlobal("WebSocketRequestResponsePair", class { constructor(public request: string, public response: string) {} });
	});
	afterEach(async () => {
		for (const step of cleanup.splice(0).reverse()) await step();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	/** A desktop signed in to the relay, wired as its phone service wires the client. */
	async function setup() {
		const relay = await startRelay(); cleanup.push(() => relay.close());
		const app = fakePhoneHost();
		app.addTask({ id: "chat-1", title: "Release notes", messages: [{ id: "u1", role: "user", text: "Draft them", createdAt: "2026-11-01T09:00:00.000Z" }] });
		const desktopKeys = generateKeyPair(), desktopId = randomUUID();
		let settings: PhoneSettings = { enabled: true, port: 0, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": false }, desktopId, tailscaleServe: false, connect: true, devices: [] };
		const store = { get value() { return settings; }, save: (change: Partial<PhoneSettings> = {}) => (settings = { ...settings, ...change }) };
		const pairing = new PhonePairing(store), hub = new PhoneHub(app.host);
		app.onChange(overview => hub.overviewChanged(overview));
		const states = inbox<ConnectClientState>();
		const client = new ConnectClient({ relayUrl: relay.url, desktopId, desktopName: () => "Test PC", privateKey: desktopKeys.privateKey, gatewayKey: async () => GATEWAY_KEY, devices: () => store.value.devices, pairing, hub, onState: state => states.push(state), backoff: () => 0 });
		pairing.onPaired = device => client.registerDevice(device.id, device.relayTokenHash);
		pairing.onRemoved = deviceId => { hub.closeDevice(deviceId); client.removeDevice(deviceId); };
		pairing.onCodeExpired = relayDeviceId => client.removeDevice(relayDeviceId);
		hub.onAttention = (event, connected) => client.notifyOffline(event, connected);
		cleanup.push(() => client.stop());
		client.start();
		await states.until(state => state.status === "connected");
		const registered = (deviceId: string) => relay.processed.until(entry => entry.sender === "desktop" && entry.frame.type === "register_device" && entry.frame.deviceId === deviceId);
		const phone = (keys: KeyPair, deviceId: string, relayToken: string) => {
			const value = new FakePhone(relay.url, desktopId, keys, desktopKeys.publicKey, deviceId, relayToken);
			cleanup.push(() => value.disconnect());
			return value;
		};
		return { relay, app, client, states, pairing, hub, registered, phone, desktopId, desktopKeys };
	}

	/** Pairs a new phone over Connect, as the phone app does after scanning the QR code. */
	async function pairedPhone(context: Awaited<ReturnType<typeof setup>>) {
		const { pairing, client, registered, phone } = context;
		const { pairingCode, relay: signIn } = pairing.create();
		// What the phone service does when it shows the QR code.
		client.registerDevice(signIn.deviceId, tokenHash(signIn.relayToken));
		await registered(signIn.deviceId);

		const keys = generateKeyPair(), derived = relayPairing(pairingCode);
		expect(derived).toEqual(signIn);
		const pairingPhone = phone(keys, derived.deviceId, derived.relayToken);
		expect(await pairingPhone.connect()).toBe("open");
		const answer = await pairingPhone.request({ id: "p", type: "pair", pairingCode, deviceName: "Pixel", devicePublicKey: keys.publicKey }, { senderPublicKey: keys.publicKey });
		expect(answer).toMatchObject({ id: "p", type: "pair", ok: true });
		const result = validatePairResult(answer.result);
		// The desktop ends the pairing sign-in once it has answered.
		expect(await pairingPhone.closes.until(() => true)).toEqual({ code: relayCloseCodes.deviceRemoved, reason: "device_removed" });
		await registered(result.deviceId);
		return { keys, result, pairingCode, device: phone(keys, result.deviceId, result.relayToken) };
	}

	it("pairs a phone over Connect without the relay seeing the pairing code", async () => {
		const context = await setup();
		const { keys, result, pairingCode, device } = await pairedPhone(context);
		expect(context.pairing.authenticate(result.deviceToken)?.publicKey).toBe(keys.publicKey);
		expect(await device.connect()).toBe("open");
		expect(await device.inbox.until(entry => entry.relay !== undefined)).toEqual({ relay: { type: "desktop_online" } });
		expect(context.relay.seen.join("\n")).not.toContain(pairingCode);
		expect(JSON.stringify(context.relay.sql.db.prepare("SELECT * FROM devices").all())).not.toContain(pairingCode);
		// The pairing sign-in was removed with its code.
		expect(context.relay.sql.db.prepare("SELECT device_id FROM devices").all()).toEqual([{ device_id: result.deviceId }]);
	});

	it("answers an encrypted list_chats and send through the relay", async () => {
		const context = await setup();
		const { result, device } = await pairedPhone(context);
		expect(await device.connect()).toBe("open");
		expect(await device.request({ id: "h", type: "hello", deviceId: result.deviceId, appVersion: "1.0.0" })).toMatchObject({ ok: true, result: { desktopName: "Test PC" } });
		const list = await device.request({ id: "l", type: "list_chats" });
		expect(list).toMatchObject({ id: "l", type: "list_chats", ok: true, result: { chats: [{ id: "chat-1", title: "Release notes" }] } });
		expect(await device.request({ id: "s", type: "send", chatId: "chat-1", text: "Ship it" })).toMatchObject({ id: "s", type: "send", ok: true });
		expect(context.app.commands).toContainEqual(expect.objectContaining({ type: "send", id: "chat-1", text: "Ship it" }));
		// The phone's send went marked hold; the desktop's answers didn't.
		const routed = context.relay.processed.items.filter(entry => typeof entry.frame.ciphertext === "string");
		expect(routed.filter(entry => entry.sender === result.deviceId).map(entry => entry.frame.hold ?? false)).toEqual([false, false, true]);
		expect(routed.filter(entry => entry.sender === "desktop").some(entry => entry.frame.hold)).toBe(false);
		// The relay forwarded only ciphertext.
		for (const text of ["Release notes", "Ship it", "Test PC"]) expect(context.relay.seen.join("\n")).not.toContain(text);
	});

	it("holds attention for a phone that dropped, delivers it on reconnect, and drops live entries", async () => {
		const context = await setup();
		const { result, device } = await pairedPhone(context);
		expect(await device.connect()).toBe("open");
		await device.request({ id: "h", type: "hello", deviceId: result.deviceId, appVersion: "1.0.0" });
		await device.request({ id: "sub", type: "subscribe", chatIds: ["chat-1"] });

		// The phone loses its connection; the relay knows before the desktop's session does.
		context.relay.socketOf(result.deviceId).drop();
		context.app.addMessage("chat-1", { role: "assistant", text: "Here's a draft." });
		const entries = await context.relay.processed.until(entry => entry.sender === "desktop" && entry.frame.to === result.deviceId && !entry.frame.hold);
		const task = context.app.get("chat-1");
		task.status = "running"; context.app.touch(task); context.app.changed();
		task.status = "completed"; context.app.touch(task); context.app.changed();
		const attention = await context.relay.processed.until(entry => entry.sender === "desktop" && entry.frame.to === result.deviceId && entry.frame.hold === true);
		expect((context.relay.sql.db.prepare("SELECT body FROM held").all() as { body: string }[]).map(row => JSON.parse(row.body).seq)).toEqual([attention.frame.seq]);
		context.relay.socketOf(result.deviceId).deliverClose();

		expect(await device.connect()).toBe("open");
		const delivered = await device.inbox.until(entry => entry.desktop?.type === "attention");
		expect(delivered.desktop).toEqual({ type: "attention", chatId: "chat-1", kind: "done", summary: "Release notes: finished" });
		// The held envelope went once, and the live entries never arrived.
		expect(context.relay.sql.db.prepare("SELECT COUNT(*) AS n FROM held").get()).toEqual({ n: 0 });
		expect(device.inbox.items.filter(entry => entry.desktop?.type === "entries" && JSON.stringify(entry.desktop).includes("Here's a draft."))).toEqual([]);
		expect(entries.frame.seq).toBeLessThan(attention.frame.seq as number);
	});

	it("refuses a phone the desktop removed", async () => {
		const context = await setup();
		const { result, device } = await pairedPhone(context);
		expect(await device.connect()).toBe("open");
		context.pairing.remove(result.deviceId);
		expect(await device.closes.until(() => true)).toEqual({ code: relayCloseCodes.deviceRemoved, reason: "device_removed" });
		expect(await device.connect()).toBe(401);
	});

	it("closes with 4402 when the month is unpaid, and the desktop shows Payment due and stops", async () => {
		const context = await setup();
		const { device } = await pairedPhone(context);
		expect(await device.connect()).toBe("open");
		vi.useFakeTimers({ toFake: ["Date"] });
		entitlement = { enabled: true, paid_up: false };
		// The room re-reads the entitlement after its five-minute cache, on the next frame.
		vi.setSystemTime(Date.now() + ENTITLEMENT_TTL_MS + 1);
		const attempts = context.relay.upgrades.filter(url => url.includes("/v1/desktop/")).length;
		device.send({ id: "l", type: "list_chats" });
		const refused = await context.states.until(state => state.status === "refused");
		expect(refused).toMatchObject({ reason: "payment-due" });
		expect(refused.message).toMatch(/^Payment due\./);
		expect(await device.closes.until(() => true)).toEqual({ code: relayCloseCodes.notEntitled, reason: "payment_required" });
		// A phone signing in now is refused too, and by then a retrying desktop would have reconnected.
		expect(await device.connect()).toBe(402);
		expect(context.relay.upgrades.filter(url => url.includes("/v1/desktop/"))).toHaveLength(attempts);
		expect(context.client.state.status).toBe("refused");
	});
});
