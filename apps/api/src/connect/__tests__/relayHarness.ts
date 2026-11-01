// Phaseo Connect in one process, for the end-to-end tests here and in the phone
// app (apps/mobile): ConnectRoom with its SQL on node:sqlite behind real
// WebSockets on 127.0.0.1, and the real desktop Connect client. A small server
// stands in for the Workers runtime's upgrade and hibernation plumbing. Imports
// stay relative, so Jest in apps/mobile can load this file as well as Vitest.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import type { Duplex } from "node:stream";
import { generateKeyPair, tokenHash } from "@phaseo/phone-protocol";
import { ConnectRoom, CONNECT_KEY_HASH_HEADER, CONNECT_ROLE_HEADER, CONNECT_WORKSPACE_HEADER } from "../connect-room";
import { sqlStorage } from "./sqlStorage";
import { ConnectClient, type ConnectClientState } from "../../../../desktop/src/main/phone/connectClient";
import { fakePhoneHost } from "../../../../desktop/src/main/phone/fakePhoneHost";
import { PhonePairing, type PhoneSettings } from "../../../../desktop/src/main/phone/phoneDevices";
import { PhoneServer } from "../../../../desktop/src/main/phone/phoneServer";
import { PhoneHub } from "../../../../desktop/src/main/phone/phoneSession";

// The desktop's own ws, the library its Connect client uses.
type WsSocket = { send(text: string): void; close(code?: number, reason?: string): void; terminate(): void; on(event: string, listener: (...args: never[]) => void): unknown };
export type WsModule = {
	WebSocket: new (url: string, options?: { headers: Record<string, string> }) => WsSocket;
	WebSocketServer: new (options: { noServer: true }) => { handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, done: (socket: WsSocket) => void): void; close(): void };
};
export const ws = createRequire(path.resolve(__dirname, "../../../../desktop/package.json"))("ws") as WsModule;

export const GATEWAY_KEY = "phaseo-gateway-key";

type Waiter<T> = { match: (value: T) => boolean; resolve: (value: T) => void };
/** Values as they arrive, and promises for ones that haven't yet. Nothing here sleeps. */
export function inbox<T>() {
	const items: T[] = [], waiters: Waiter<T>[] = [];
	return {
		items,
		push(value: T) { items.push(value); for (const waiter of waiters.filter(entry => entry.match(value))) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(value); } },
		until(match: (value: T) => boolean) { const found = items.find(match); return found !== undefined ? Promise.resolve(found) : new Promise<T>(resolve => waiters.push({ match, resolve })); },
	};
}

type RoomFetch = { fetch(request: Request): Promise<Response> };

/**
 * The routing phaseo-connect's Worker does, for callers that can't load the Worker itself (its gateway imports use the
 * apps/api path aliases). apps/api's own end-to-end test passes the real Worker instead.
 */
export async function routeLikeWorker(request: Request, room: RoomFetch) {
	const match = /^\/v1\/(desktop|phone)\/[A-Za-z0-9_-]{16,128}$/.exec(new URL(request.url).pathname);
	if (!match) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
	const role = match[1] as string;
	const headers = new Headers({ upgrade: "websocket", [CONNECT_ROLE_HEADER]: role });
	if (role === "desktop") {
		if (request.headers.get("authorization") !== `Bearer ${GATEWAY_KEY}`) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
		headers.set(CONNECT_WORKSPACE_HEADER, "ws-1");
		headers.set(CONNECT_KEY_HASH_HEADER, tokenHash("key-1"));
	} else {
		const authorization = request.headers.get("authorization");
		if (!authorization) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
		headers.set("authorization", authorization);
	}
	return room.fetch(new Request(`https://connect.internal/${role}`, { headers }));
}

/**
 * The relay: a request handler (the Worker, or routeLikeWorker) in front of one ConnectRoom, on a loopback port. The
 * room reads the workspace's entitlement through fetch, so the harness answers that with `state.entitlement` until closed.
 */
export async function startRelay(handle: (request: Request, room: RoomFetch) => Promise<Response> = routeLikeWorker) {
	const scope = globalThis as unknown as { fetch: typeof fetch; WebSocketRequestResponsePair?: unknown };
	const realFetch = scope.fetch, hadPair = "WebSocketRequestResponsePair" in scope;
	const state = { entitlement: { enabled: true, paid_up: true } };
	scope.fetch = (async () => new Response(JSON.stringify([state.entitlement]), { status: 200 })) as typeof fetch;
	if (!hadPair) scope.WebSocketRequestResponsePair = class { constructor(public request: string, public response: string) {} };

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

	const wss = new ws.WebSocketServer({ noServer: true });
	const server = createServer((_request, response) => { response.writeHead(426).end(); });
	server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => void (async () => {
		upgrades.push(request.url ?? "");
		const headers = new Headers({ upgrade: "websocket" });
		if (typeof request.headers.authorization === "string") headers.set("authorization", request.headers.authorization);
		const response = await handle(new Request(`https://connect.test${request.url}`, { headers }), room);
		const roomSocket = pending.get(response);
		if (roomSocket) { wss.handleUpgrade(request, socket, head, client => roomSocket.attach(client)); return; }
		const body = await response.text();
		socket.end(`HTTP/1.1 ${response.status} Refused\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`);
	})());
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
	const socketOf = (deviceId: string) => accepted.filter(entry => entry.tags.includes(`device:${deviceId}`)).at(-1)!.socket;
	const close = () => new Promise<void>(resolve => {
		scope.fetch = realFetch;
		if (!hadPair) delete scope.WebSocketRequestResponsePair;
		wss.close(); server.closeAllConnections(); server.close(() => resolve());
	});
	return { url, sql, seen, processed, upgrades, socketOf, state, close };
}
export type Relay = Awaited<ReturnType<typeof startRelay>>;

/**
 * A desktop signed in to the relay, wired as its phone service wires the Connect client, with one chat. showPairingCode
 * does what Settings → Phone does for the QR code: makes a code and lets its pairing sign-in through the relay.
 */
export async function startDesktop(relay: Relay) {
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
	client.start();
	await states.until(state => state.status === "connected");
	const registered = (deviceId: string) => relay.processed.until(entry => entry.sender === "desktop" && entry.frame.type === "register_device" && entry.frame.deviceId === deviceId);
	async function showPairingCode() {
		const code = pairing.create();
		client.registerDevice(code.relay.deviceId, tokenHash(code.relay.relayToken));
		await registered(code.relay.deviceId);
		return code;
	}
	return { app, client, states, pairing, hub, registered, showPairingCode, desktopId, desktopKeys, stop: () => client.stop() };
}

/** The desktop phone server on 127.0.0.1, for a phone connecting directly as on the same Wi-Fi or tailnet. */
export async function startPhoneServer() {
	const app = fakePhoneHost();
	app.addTask({ id: "chat-1", title: "Release notes", messages: [{ id: "u1", role: "user", text: "Draft them", createdAt: "2026-11-01T09:00:00.000Z" }] });
	const desktopKeys = generateKeyPair(), desktopId = randomUUID();
	let settings: PhoneSettings = { enabled: true, port: 0, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": false }, desktopId, tailscaleServe: false, connect: false, devices: [] };
	const store = { get value() { return settings; }, save: (change: Partial<PhoneSettings> = {}) => (settings = { ...settings, ...change }) };
	const pairing = new PhonePairing(store), hub = new PhoneHub(app.host);
	pairing.onRemoved = deviceId => hub.closeDevice(deviceId);
	app.onChange(overview => hub.overviewChanged(overview));
	const server = new PhoneServer({ hub, pairing, desktopId: () => desktopId, desktopName: () => "Test PC", identity: async () => desktopKeys });
	const { port } = await server.listen(["127.0.0.1"], 0);
	return { app, pairing, desktopId, desktopKeys, url: `http://127.0.0.1:${port}`, close: () => server.close() };
}
