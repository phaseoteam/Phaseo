import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlStorage } from "./__tests__/sqlStorage";
import {
	CLOSE_DEVICE_REMOVED,
	CLOSE_NOT_ENTITLED,
	CLOSE_REPLACED,
	CLOSE_UNAVAILABLE,
	ConnectRoom,
	ENTITLEMENT_TTL_MS,
	HOLD_MAX_BYTES,
	HOLD_MAX_MESSAGES,
	HOLD_TTL_MS,
	sha256Hex,
} from "./connect-room";

type FakeSocket = {
	readyState: number;
	sent: string[];
	closed?: { code: number; reason: string };
	send: (message: string) => void;
	close: (code: number, reason: string) => void;
	serializeAttachment: (value: unknown) => void;
	deserializeAttachment: () => unknown;
};

function fakeSocket(): FakeSocket {
	let attachment: unknown = null;
	const socket: FakeSocket = {
		readyState: 1,
		sent: [],
		send: (message) => { socket.sent.push(message); },
		close: (code, reason) => { socket.readyState = 3; socket.closed = { code, reason }; },
		serializeAttachment: (value) => { attachment = structuredClone(value); },
		deserializeAttachment: () => attachment,
	};
	return socket;
}

function harness() {
	const sockets: Array<{ socket: FakeSocket; tags: string[] }> = [];
	let alarm: number | null = null;
	const autoResponses: Array<{ request: string; response: string }> = [];
	const sql = sqlStorage();
	const ctx = {
		storage: {
			sql,
			getAlarm: async () => alarm,
			setAlarm: async (at: number) => { alarm = at; },
		},
		acceptWebSocket: (socket: FakeSocket, tags: string[]) => sockets.push({ socket, tags }),
		getWebSockets: (tag?: string) => sockets.filter((entry) => !tag || entry.tags.includes(tag)).map((entry) => entry.socket),
		setWebSocketAutoResponse: (pair: { request: string; response: string }) => autoResponses.push(pair),
	};
	class TestRoom extends ConnectRoom {
		protected override upgrade(attachment: unknown, tags: string[]) {
			const socket = fakeSocket();
			ctx.acceptWebSocket(socket, tags);
			socket.serializeAttachment(attachment);
			// Node can't build a 101 response; the status stands in for it.
			return { response: new Response(null, { status: 200 }), socket: socket as unknown as WebSocket };
		}
		protected override refuse(code: number, reason: string) {
			// The real refusal opens the socket and closes it; the header stands in for that close.
			return new Response(null, { status: 299, headers: { "x-test-close": `${code} ${reason}` } });
		}
	}
	const room = new TestRoom(ctx as unknown as DurableObjectState, { SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "service" });
	const connect = async (role: "desktop" | "phone", headers: Record<string, string> = {}) => {
		const response = await room.fetch(new Request("https://connect.internal/x", {
			headers: role === "desktop"
				? { "x-connect-role": role, "x-connect-workspace": "ws-1", "x-connect-key-hash": "key-hash", ...headers }
				: { "x-connect-role": role, ...headers },
		}));
		const socket = response.status === 200 ? sockets.at(-1)!.socket : null;
		return { response, socket };
	};
	const message = (socket: FakeSocket | null, frame: unknown) => room.webSocketMessage(socket as unknown as WebSocket, typeof frame === "string" ? frame : JSON.stringify(frame));
	const frames = (socket: FakeSocket | null) => socket!.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
	return { room, sql, connect, message, frames, autoResponses, alarm: () => alarm };
}

let entitlement = { enabled: true, paid_up: true };
const fetchMock = vi.fn(async () => new Response(JSON.stringify([entitlement]), { status: 200 }));
const PHONE_TOKEN = "relay-token-for-phone-one";
const envelope = (to: string, seq: number, extra: Record<string, unknown> = {}) => ({ to, seq, nonce: "n".repeat(32), ciphertext: `cipher-${seq}`, ...extra });

async function paired() {
	const h = harness();
	const desktop = (await h.connect("desktop")).socket!;
	await h.message(desktop, { id: 1, type: "register_device", deviceId: "phone-one", relayTokenHash: await sha256Hex(PHONE_TOKEN) });
	expect(h.frames(desktop).at(-1)).toEqual({ id: 1, ok: true });
	return { ...h, desktop };
}

beforeEach(() => {
	entitlement = { enabled: true, paid_up: true };
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("WebSocketRequestResponsePair", class { constructor(public request: string, public response: string) {} });
});

afterEach(() => {
	fetchMock.mockClear();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("ConnectRoom", () => {
	it("answers ping with pong without waking the room", () => {
		const h = harness();
		expect(h.autoResponses).toEqual([{ request: '{"type":"ping"}', response: '{"type":"pong"}' }]);
	});

	it("lets a desktop in only while its workspace has Connect on and paid up", async () => {
		entitlement = { enabled: false, paid_up: true };
		expect((await harness().connect("desktop")).response.status).toBe(403);
		entitlement = { enabled: true, paid_up: false };
		expect((await harness().connect("desktop")).response.status).toBe(402);
		fetchMock.mockResolvedValueOnce(new Response("down", { status: 500 }));
		expect((await harness().connect("desktop")).response.status).toBe(503);
		entitlement = { enabled: true, paid_up: true };
		expect((await harness().connect("desktop")).response.status).toBe(200);
		expect(fetchMock).toHaveBeenLastCalledWith("https://db.example/rest/v1/rpc/get_connect_entitlement", expect.objectContaining({ body: JSON.stringify({ p_workspace_id: "ws-1" }) }));
	});

	it("tells a refused phone why, in a close it can read, since a phone can't see an HTTP status", async () => {
		const h = await paired();
		const phone = async () => (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).response.headers.get("x-test-close");
		vi.useFakeTimers({ toFake: ["Date"] });
		const expire = () => vi.setSystemTime(Date.now() + ENTITLEMENT_TTL_MS + 1);
		entitlement = { enabled: false, paid_up: true }; expire();
		expect(await phone()).toBe(`${CLOSE_NOT_ENTITLED} connect_off`);
		entitlement = { enabled: true, paid_up: false }; expire();
		expect(await phone()).toBe(`${CLOSE_NOT_ENTITLED} payment_required`);
		fetchMock.mockResolvedValueOnce(new Response("down", { status: 500 })); expire();
		expect(await phone()).toBe(`${CLOSE_UNAVAILABLE} entitlement_unavailable`);
		entitlement = { enabled: true, paid_up: true }; expire();
		expect(await phone()).toBeNull();
	});

	it("keeps the workspace that first connected and refuses another", async () => {
		const h = harness();
		expect((await h.connect("desktop")).response.status).toBe(200);
		const other = await h.connect("desktop", { "x-connect-workspace": "ws-2" });
		expect([other.response.status, await other.response.json()]).toEqual([403, { error: "workspace_mismatch" }]);
	});

	it("caches the entitlement for five minutes", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const h = harness();
		const first = (await h.connect("desktop")).socket;
		await h.connect("desktop");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first!.closed).toEqual({ code: CLOSE_REPLACED, reason: "replaced" });
		vi.setSystemTime(Date.now() + ENTITLEMENT_TTL_MS + 1);
		await h.connect("desktop");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("lets in only phones with a registered relay token", async () => {
		const h = await paired();
		expect((await h.connect("phone", { authorization: "Bearer wrong-token" })).response.headers.get("x-test-close")).toBe(`${CLOSE_DEVICE_REMOVED} unauthorized`);
		expect((await h.connect("phone")).response.headers.get("x-test-close")).toBe(`${CLOSE_DEVICE_REMOVED} unauthorized`);
		const phone = await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` });
		expect(phone.response.status).toBe(200);
		expect(h.frames(phone.socket)).toEqual([{ type: "desktop_online" }]);
		expect(h.frames(h.desktop).at(-1)).toEqual({ type: "device_online", deviceId: "phone-one" });
		// Only the hash is stored.
		expect(JSON.stringify(h.sql.db.prepare("SELECT * FROM devices").all())).not.toContain(PHONE_TOKEN);
	});

	it("routes envelopes both ways and sets the sender itself", async () => {
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(h.desktop, envelope("phone-one", 1));
		expect(h.frames(phone).at(-1)).toEqual({ to: "phone-one", from: "desktop", seq: 1, nonce: "n".repeat(32), ciphertext: "cipher-1" });
		await h.message(phone, envelope("desktop", 7, { from: "desktop" }));
		expect(h.frames(h.desktop).at(-1)).toEqual({ to: "desktop", from: "phone-one", seq: 7, nonce: "n".repeat(32), ciphertext: "cipher-7" });
		// A phone reaches only the desktop, and the desktop only registered phones.
		await h.message(phone, envelope("phone-two", 8));
		expect(h.frames(phone).at(-1)).toEqual({ type: "error", error: "invalid_recipient", seq: 8 });
		await h.message(h.desktop, envelope("phone-two", 2));
		expect(h.frames(h.desktop).at(-1)).toEqual({ type: "error", error: "unknown_device", seq: 2 });
		await h.message(phone, { to: "desktop", seq: -1, nonce: "short", ciphertext: "" });
		expect(h.frames(phone).at(-1)).toMatchObject({ type: "error", error: "invalid_envelope" });
		// A phone can't send desktop control frames.
		await h.message(phone, { type: "remove_device", deviceId: "phone-one" });
		expect(h.frames(phone).at(-1)).toMatchObject({ error: "invalid_envelope" });
	});

	it("forwards a public key only from a phone pairing over Connect", async () => {
		const h = await paired();
		const key = "k".repeat(43);
		await h.message(h.desktop, { id: 2, type: "register_device", deviceId: "pair-0123456789abcdef01234567", relayTokenHash: await sha256Hex("pairing-token") });
		const pairing = (await h.connect("phone", { authorization: "Bearer pairing-token" })).socket!;
		await h.message(pairing, envelope("desktop", 1, { senderPublicKey: key }));
		expect(h.frames(h.desktop).at(-1)).toEqual({ to: "desktop", from: "pair-0123456789abcdef01234567", seq: 1, nonce: "n".repeat(32), ciphertext: "cipher-1", senderPublicKey: key });
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(phone, envelope("desktop", 2, { senderPublicKey: key }));
		expect(h.frames(h.desktop).at(-1)).not.toHaveProperty("senderPublicKey");
	});

	it("holds envelopes marked hold for an offline phone and delivers them in order", async () => {
		const h = await paired();
		await h.message(h.desktop, envelope("phone-one", 1, { hold: true }));
		await h.message(h.desktop, envelope("phone-one", 2)); // a live update: dropped
		await h.message(h.desktop, envelope("phone-one", 3, { hold: true }));
		expect(h.alarm()).toBeGreaterThan(Date.now() + HOLD_TTL_MS - 60_000);
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		expect(h.frames(phone).map((frame) => frame.seq ?? frame.type)).toEqual(["desktop_online", 1, 3]);
		// Delivered once.
		const again = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		expect(h.frames(again)).toEqual([{ type: "desktop_online" }]);
	});

	it("holds a phone's envelopes for an offline desktop", async () => {
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.room.webSocketClose(h.desktop as unknown as WebSocket);
		h.desktop.readyState = 3;
		expect(h.frames(phone).at(-1)).toEqual({ type: "desktop_offline" });
		await h.message(phone, envelope("desktop", 1, { hold: true }));
		const desktop = (await h.connect("desktop")).socket!;
		expect(h.frames(desktop)).toEqual([
			{ type: "devices_online", deviceIds: ["phone-one"] },
			{ to: "desktop", from: "phone-one", seq: 1, nonce: "n".repeat(32), ciphertext: "cipher-1" },
		]);
	});

	it("keeps at most 500 envelopes or 5 MB per device, dropping the oldest", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const h = await paired();
		for (let seq = 1; seq <= HOLD_MAX_MESSAGES + 5; seq++) {
			vi.setSystemTime(Date.now() + 10);
			await h.message(h.desktop, envelope("phone-one", seq, { hold: true }));
		}
		const seqs = (h.sql.db.prepare("SELECT body FROM held ORDER BY id").all() as Array<{ body: string }>).map((row) => JSON.parse(row.body).seq);
		expect([seqs.length, seqs[0], seqs.at(-1)]).toEqual([500, 6, 505]);

		const big = "x".repeat(1_400_000);
		for (let seq = 1000; seq < 1005; seq++) await h.message(h.desktop, { ...envelope("phone-one", seq, { hold: true }), ciphertext: big });
		const bytes = h.sql.db.prepare("SELECT SUM(bytes) AS total, MIN(id) AS first FROM held").get() as { total: number };
		expect(bytes.total).toBeLessThanOrEqual(HOLD_MAX_BYTES);
		const kept = (h.sql.db.prepare("SELECT body FROM held ORDER BY id").all() as Array<{ body: string }>).map((row) => JSON.parse(row.body).seq);
		expect(kept).toEqual([1002, 1003, 1004]);
	});

	it("drops held envelopes after 24 hours", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const h = await paired();
		await h.message(h.desktop, envelope("phone-one", 1, { hold: true }));
		vi.setSystemTime(Date.now() + 60_000);
		await h.message(h.desktop, envelope("phone-one", 2, { hold: true }));
		vi.setSystemTime(Date.now() + HOLD_TTL_MS - 30_000);
		await h.room.alarm();
		const left = (h.sql.db.prepare("SELECT body FROM held").all() as Array<{ body: string }>).map((row) => JSON.parse(row.body).seq);
		expect(left).toEqual([2]);
		expect(h.alarm()).toBe(Date.now() + 30_000);
	});

	it("removing a device closes its socket at once, drops what it held and refuses its token", async () => {
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.room.webSocketClose(phone as unknown as WebSocket);
		phone.readyState = 3;
		await h.message(h.desktop, envelope("phone-one", 1, { hold: true }));
		const live = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(h.desktop, envelope("phone-one", 2, { hold: true }));
		await h.room.webSocketClose(live as unknown as WebSocket);
		live.readyState = 3;
		await h.message(h.desktop, envelope("phone-one", 3, { hold: true }));
		const current = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(h.desktop, { id: "r", type: "remove_device", deviceId: "phone-one" });
		expect(h.frames(h.desktop).at(-1)).toEqual({ id: "r", ok: true });
		expect(current.closed).toEqual({ code: CLOSE_DEVICE_REMOVED, reason: "device_removed" });
		expect(h.sql.db.prepare("SELECT COUNT(*) AS n FROM held").get()).toEqual({ n: 0 });
		expect((await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).response.headers.get("x-test-close")).toBe(`${CLOSE_DEVICE_REMOVED} unauthorized`);
	});

	it("re-registering a device rotates its token", async () => {
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(h.desktop, { id: 2, type: "register_device", deviceId: "phone-one", relayTokenHash: await sha256Hex("new-token") });
		expect(phone.closed?.code).toBe(CLOSE_DEVICE_REMOVED);
		expect((await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).response.headers.get("x-test-close")).toBe(`${CLOSE_DEVICE_REMOVED} unauthorized`);
		expect((await h.connect("phone", { authorization: "Bearer new-token" })).response.status).toBe(200);
		await h.message(h.desktop, { id: 3, type: "register_device", deviceId: "bad id", relayTokenHash: "nope" });
		expect(h.frames(h.desktop).at(-1)).toEqual({ id: 3, ok: false, error: "invalid_device" });
	});

	it("closes every socket when the workspace loses Connect", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		entitlement = { enabled: true, paid_up: false };
		await h.message(h.desktop, envelope("phone-one", 1));
		expect(phone.sent.some((text) => text.includes("cipher-1"))).toBe(true); // still cached
		vi.setSystemTime(Date.now() + ENTITLEMENT_TTL_MS + 1);
		await h.message(h.desktop, envelope("phone-one", 2));
		expect(phone.sent.some((text) => text.includes("cipher-2"))).toBe(false);
		expect([h.desktop.closed, phone.closed]).toEqual([
			{ code: CLOSE_NOT_ENTITLED, reason: "payment_required" },
			{ code: CLOSE_NOT_ENTITLED, reason: "payment_required" },
		]);
	});

	it("limits how fast a phone can send", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-01T10:00:00.000Z"));
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		for (let seq = 1; seq <= 101; seq++) await h.message(phone, envelope("desktop", seq));
		expect(h.frames(phone).at(-1)).toEqual({ type: "error", error: "rate_limited" });
		expect(h.frames(h.desktop).filter((frame) => frame.ciphertext)).toHaveLength(100);
		vi.setSystemTime(new Date("2026-11-01T10:00:01.000Z"));
		await h.message(phone, envelope("desktop", 102));
		expect(h.frames(h.desktop).at(-1)).toMatchObject({ seq: 102 });
	});

	it("rejects oversized and binary frames and never logs envelope contents", async () => {
		const logs = ["log", "info", "warn", "error", "debug"].map((level) => vi.spyOn(console, level as "log"));
		const h = await paired();
		const phone = (await h.connect("phone", { authorization: `Bearer ${PHONE_TOKEN}` })).socket!;
		await h.message(h.desktop, envelope("phone-one", 1, { hold: true }));
		await h.message(phone, envelope("desktop", 2));
		await h.message(phone, "{not json");
		await h.room.webSocketMessage(phone as unknown as WebSocket, new ArrayBuffer(4));
		expect(h.frames(phone).at(-1)).toEqual({ type: "error", error: "text_only" });
		await h.message(phone, { ...envelope("desktop", 3), ciphertext: "x".repeat(1_600_000) });
		expect(h.frames(phone).at(-1)).toEqual({ type: "error", error: "too_large" });
		for (const spy of logs) expect(spy).not.toHaveBeenCalled();
	});
});
