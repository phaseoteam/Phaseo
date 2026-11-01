// Phaseo Connect end to end, in one process: the real phaseo-connect Worker
// routing and ConnectRoom (its SQL on node:sqlite), the real desktop Connect
// client from apps/desktop, and a phone built only from @phaseo/phone-protocol.
// They talk over real WebSockets on 127.0.0.1 (see __tests__/relayHarness.ts).
import type { IncomingMessage } from "node:http";
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
	validatePairResult,
	type KeyPair,
	type RelayServerFrame,
} from "@phaseo/phone-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthFailure, AuthSuccess } from "@/pipeline/before/auth";
import { createConnectWorker, type ConnectWorkerEnv } from "../connect-worker";
import { ENTITLEMENT_TTL_MS } from "./connect-room";
import { GATEWAY_KEY, inbox, startDesktop, startRelay, ws } from "./__tests__/relayHarness";

// The gateway's key check, standing in for the real one (the Worker's config test covers that wiring).
const auth = async (request: Request): Promise<AuthSuccess | AuthFailure> => request.headers.get("authorization") === `Bearer ${GATEWAY_KEY}`
	? { ok: true, workspaceId: "ws-1", apiKeyId: "key-1", apiKeyRef: "kid_x", apiKeyKid: "x" }
	: { ok: false, reason: "invalid_key_format" };
const worker = createConnectWorker(auth);
const throughWorker = (request: Request, room: { fetch(request: Request): Promise<Response> }) =>
	worker.fetch(request, { CONNECT_ROOM: { idFromName: (name: string) => name, get: () => room } } as unknown as ConnectWorkerEnv, { waitUntil: () => {} } as unknown as ExecutionContext);

type WsSocket = InstanceType<typeof ws.WebSocket>;
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
	afterEach(async () => {
		for (const step of cleanup.splice(0).reverse()) await step();
		vi.useRealTimers();
	});

	/** The real Worker and room, and a desktop signed in to them. */
	async function setup() {
		const relay = await startRelay(throughWorker); cleanup.push(() => relay.close());
		const desktop = await startDesktop(relay); cleanup.push(() => desktop.stop());
		const phone = (keys: KeyPair, deviceId: string, relayToken: string) => {
			const value = new FakePhone(relay.url, desktop.desktopId, keys, desktop.desktopKeys.publicKey, deviceId, relayToken);
			cleanup.push(() => value.disconnect());
			return value;
		};
		const setEntitlement = (value: { enabled: boolean; paid_up: boolean }) => { relay.state.entitlement = value; };
		return { ...desktop, relay, phone, setEntitlement };
	}

	/** Pairs a new phone over Connect, as the phone app does after scanning the QR code. */
	async function pairedPhone(context: Awaited<ReturnType<typeof setup>>) {
		const { registered, phone } = context;
		const { pairingCode, relay: signIn } = await context.showPairingCode();

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
		expect(context.pairing.device(result.deviceId)?.publicKey).toBe(keys.publicKey);
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
		// The phone can't read an HTTP status, so the relay opens its socket and closes it with the reason.
		expect(await device.connect()).toBe("open");
		expect(await device.closes.until(close => close.reason === "unauthorized")).toEqual({ code: relayCloseCodes.deviceRemoved, reason: "unauthorized" });
	});

	it("closes with 4402 when the month is unpaid, and the desktop shows Payment due and stops", async () => {
		const context = await setup();
		const { device } = await pairedPhone(context);
		expect(await device.connect()).toBe("open");
		vi.useFakeTimers({ toFake: ["Date"] });
		context.setEntitlement({ enabled: true, paid_up: false });
		// The room re-reads the entitlement after its five-minute cache, on the next frame.
		vi.setSystemTime(Date.now() + ENTITLEMENT_TTL_MS + 1);
		const attempts = context.relay.upgrades.filter(url => url.includes("/v1/desktop/")).length;
		device.send({ id: "l", type: "list_chats" });
		const refused = await context.states.until(state => state.status === "refused");
		expect(refused).toMatchObject({ reason: "payment-due" });
		expect(refused.message).toMatch(/^Payment due\./);
		expect(await device.closes.until(() => true)).toEqual({ code: relayCloseCodes.notEntitled, reason: "payment_required" });
		// A phone signing in now is refused too, and by then a retrying desktop would have reconnected.
		expect(await device.connect()).toBe("open");
		const unpaid = () => device.closes.items.filter(close => close.reason === "payment_required").length;
		await device.closes.until(close => close.reason === "payment_required" && unpaid() === 2);
		expect(context.relay.upgrades.filter(url => url.includes("/v1/desktop/"))).toHaveLength(attempts);
		expect(context.client.state.status).toBe("refused");
	});
});
