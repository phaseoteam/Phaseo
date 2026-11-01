import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { EnvelopeChannel, generateKeyPair, isEnvelope, relayDesktopAddress, relayPairing, sharedKey, tokenHash, type Envelope } from "@phaseo/phone-protocol";
import { ConnectClient, type ConnectClientState } from "./connectClient";
import { fakePhoneHost } from "./fakePhoneHost";
import { PhonePairing, type PhoneSettings } from "./phoneDevices";
import { PhoneHub } from "./phoneSession";

/** A local stand-in for the relay: records each desktop connection and what it sent. */
async function fakeRelay() {
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise<void>(resolve => server.once("listening", () => resolve()));
	const connections: { socket: WebSocket; request: IncomingMessage; frames: Record<string, unknown>[]; waiting: { match: (frame: Record<string, unknown>) => boolean; resolve: (frame: Record<string, unknown>) => void }[] }[] = [];
	const arrivals: ((index: number) => void)[] = [];
	server.on("connection", (socket, request) => {
		const connection = { socket, request, frames: [] as Record<string, unknown>[], waiting: [] as { match: (frame: Record<string, unknown>) => boolean; resolve: (frame: Record<string, unknown>) => void }[] };
		socket.on("message", data => {
			const frame = JSON.parse(data.toString()) as Record<string, unknown>;
			const waiter = connection.waiting.findIndex(value => value.match(frame));
			if (waiter >= 0) connection.waiting.splice(waiter, 1)[0]!.resolve(frame); else connection.frames.push(frame);
		});
		connections.push(connection);
		arrivals.splice(0).forEach(resolve => resolve(connections.length - 1));
	});
	const address = server.address() as { port: number };
	return {
		url: `ws://127.0.0.1:${address.port}`, connections,
		connection: (index: number) => connections[index] ? Promise.resolve(connections[index]!) : new Promise<(typeof connections)[number]>(resolve => arrivals.push(() => { if (connections[index]) resolve(connections[index]!); })),
		next: (index: number, match: (frame: Record<string, unknown>) => boolean) => {
			const connection = connections[index]!, found = connection.frames.findIndex(match);
			if (found >= 0) return Promise.resolve(connection.frames.splice(found, 1)[0]!);
			return new Promise<Record<string, unknown>>(resolve => connection.waiting.push({ match, resolve }));
		},
		close: () => new Promise<void>(resolve => { for (const client of server.clients) client.terminate(); server.close(() => resolve()); }),
	};
}

describe("Phaseo Connect client", () => {
	const cleanup: (() => Promise<void> | void)[] = [];
	afterEach(async () => { for (const step of cleanup.splice(0).reverse()) await step(); });

	async function setup() {
		const relay = await fakeRelay(); cleanup.push(() => relay.close());
		const app = fakePhoneHost();
		app.addTask({ id: "chat-1", title: "Release notes", messages: [{ id: "u1", role: "user", text: "Draft them", createdAt: "2026-11-01T09:00:00.000Z" }] });
		const desktop = generateKeyPair(), phone = generateKeyPair();
		let settings: PhoneSettings = { enabled: true, port: 0, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": false }, desktopId: "desk-1", tailscaleServe: false, connect: true, devices: [] };
		const store = { get value() { return settings; }, save: (change: Partial<PhoneSettings> = {}) => (settings = { ...settings, ...change }) };
		const pairing = new PhonePairing(store), hub = new PhoneHub(app.host);
		app.onChange(overview => hub.overviewChanged(overview));
		const paired = pairing.redeem({ pairingCode: pairing.create().pairingCode, deviceName: "Pixel", devicePublicKey: phone.publicKey });
		const states: ConnectClientState[] = [], watchers: { status: string; resolve: () => void }[] = [];
		const onState = (state: ConnectClientState) => { states.push(state); for (const watcher of watchers.filter(value => value.status === state.status)) { watchers.splice(watchers.indexOf(watcher), 1); watcher.resolve(); } };
		const reaches = (status: ConnectClientState["status"]) => new Promise<void>(resolve => watchers.push({ status, resolve }));
		const client = new ConnectClient({ relayUrl: relay.url, desktopId: "desk-1", desktopName: () => "Test PC", privateKey: desktop.privateKey, gatewayKey: async () => "phaseo-gateway-key", devices: () => store.value.devices, pairing, hub, onState, backoff: () => 0 });
		// As the phone service wires them.
		hub.onAttention = (event, connected) => client.notifyOffline(event, connected);
		pairing.onCodeExpired = id => client.removeDevice(id);
		cleanup.push(() => client.stop());
		const phoneChannel = new EnvelopeChannel(sharedKey(phone.privateKey, desktop.publicKey), paired.device.id, relayDesktopAddress);
		return { relay, app, client, states, reaches, pairing, paired, desktop, phone, phoneChannel };
	}

	it("signs in with the gateway key, registers phones, and answers a phone's frames end to end", async () => {
		const { relay, client, paired, phoneChannel, app } = await setup();
		client.start();
		const connection = await relay.connection(0);
		expect(connection.request.url).toBe("/v1/desktop/desk-1");
		expect(connection.request.headers.authorization).toBe("Bearer phaseo-gateway-key");
		expect(await relay.next(0, frame => frame.type === "register_device")).toEqual({ type: "register_device", deviceId: paired.device.id, relayTokenHash: tokenHash(paired.result.relayToken) });

		connection.socket.send(JSON.stringify(phoneChannel.seal({ id: "1", type: "list_chats" })));
		const envelope = await relay.next(0, frame => isEnvelope(frame)) as unknown as Envelope;
		expect(envelope).toMatchObject({ to: paired.device.id, from: relayDesktopAddress });
		expect(JSON.stringify(envelope)).not.toContain("Release notes");
		expect(JSON.parse(phoneChannel.open(envelope))).toMatchObject({ id: "1", ok: true, result: { chats: [{ id: "chat-1", title: "Release notes" }] } });

		// A tampered envelope is dropped without an answer; the next good one still works.
		const sealed = phoneChannel.seal({ id: "2", type: "subscribe", chatIds: ["chat-1"] });
		connection.socket.send(JSON.stringify({ ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + "AAAA" }));
		connection.socket.send(JSON.stringify(phoneChannel.seal({ id: "3", type: "subscribe", chatIds: ["chat-1"] })));
		expect(JSON.parse(phoneChannel.open(await relay.next(0, frame => isEnvelope(frame)) as unknown as Envelope))).toMatchObject({ id: "3", ok: true });

		app.addMessage("chat-1", { role: "assistant", text: "Here's a draft." });
		// Envelopes open in the order they were sent; a list row update may come first.
		let frame: Record<string, unknown>;
		do frame = JSON.parse(phoneChannel.open(await relay.next(0, value => isEnvelope(value)) as unknown as Envelope)); while (frame.type !== "entries");
		expect(frame).toMatchObject({ type: "entries", chatId: "chat-1", entries: [{ text: "Here's a draft." }] });
	});

	it("holds attention for a phone that isn't connected", async () => {
		const { relay, client, app, paired, phoneChannel } = await setup();
		client.start();
		await relay.connection(0);
		await relay.next(0, frame => frame.type === "register_device");
		const task = app.get("chat-1"); task.status = "running"; app.touch(task); app.changed();
		task.status = "completed"; app.touch(task); app.changed();
		const held = await relay.next(0, frame => isEnvelope(frame));
		expect(held).toMatchObject({ to: paired.device.id, hold: true });
		expect(JSON.parse(phoneChannel.open(held as unknown as Envelope))).toEqual({ type: "attention", chatId: "chat-1", kind: "done", summary: "Release notes: finished" });
	});

	it("reconnects after the relay drops it and registers again, but stops when the relay closes for payment", async () => {
		const { relay, client, states, reaches } = await setup();
		client.start();
		const first = await relay.connection(0);
		await relay.next(0, frame => frame.type === "register_device");
		first.socket.terminate();
		const second = await relay.connection(1);
		expect(second.request.headers.authorization).toBe("Bearer phaseo-gateway-key");
		await relay.next(1, frame => frame.type === "register_device");
		const refused = reaches("refused");
		second.socket.close(4402, "payment_required");
		await refused;
		expect(client.state).toMatchObject({ status: "refused", reason: "payment-due" });
		expect(client.state.message).toMatch(/^Payment due\./);
		expect(relay.connections).toHaveLength(2);
		expect(states.map(state => state.status)).toContain("connected");
	});

	it("tells a switched-off workspace from another workspace's room when the relay refuses the sign-in", async () => {
		for (const [status, error, reason] of [[403, "connect_off", "connect-off"], [403, "workspace_mismatch", "wrong-workspace"], [402, "payment_required", "payment-due"], [401, "unauthorized", "unauthorized"]] as const) {
			const server = new WebSocketServer({ host: "127.0.0.1", port: 0, verifyClient: (_info, done) => done(false, status, JSON.stringify({ error })) });
			await new Promise<void>(resolve => server.once("listening", () => resolve()));
			const { pairing, hub } = await setup();
			let resolveRefused!: () => void;
			const done = new Promise<void>(resolve => { resolveRefused = resolve; });
			const client = new ConnectClient({ relayUrl: `ws://127.0.0.1:${(server.address() as { port: number }).port}`, desktopId: "desk-1", desktopName: () => "Test PC", privateKey: generateKeyPair().privateKey, gatewayKey: async () => "key", devices: () => [], pairing, hub, backoff: () => 0, onState: state => { if (state.status === "refused") resolveRefused(); } });
			client.start();
			await done;
			expect(client.state.reason).toBe(reason);
			client.stop();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});

	it("pairs a phone over the relay with a code it can't read", async () => {
		const { relay, client, pairing, desktop } = await setup();
		const newPhone = generateKeyPair(), { pairingCode } = pairing.create(), relaySignIn = relayPairing(pairingCode);
		client.start();
		await relay.connection(0);
		expect(await relay.next(0, frame => frame.deviceId === relaySignIn.deviceId)).toEqual({ type: "register_device", deviceId: relaySignIn.deviceId, relayTokenHash: tokenHash(relaySignIn.relayToken) });
		const channel = new EnvelopeChannel(sharedKey(newPhone.privateKey, desktop.publicKey), relaySignIn.deviceId, relayDesktopAddress);
		const envelope = { ...channel.seal({ id: "p", type: "pair", pairingCode, deviceName: "iPhone", devicePublicKey: newPhone.publicKey }), senderPublicKey: newPhone.publicKey };
		relay.connections[0]!.socket.send(JSON.stringify(envelope));
		const answer = JSON.parse(channel.open(await relay.next(0, frame => isEnvelope(frame)) as unknown as Envelope));
		expect(answer).toMatchObject({ id: "p", type: "pair", ok: true, result: { desktopId: "desk-1", desktopName: "Test PC" } });
		expect(await relay.next(0, frame => frame.type === "register_device" && frame.deviceId === answer.result.deviceId)).toMatchObject({ relayTokenHash: tokenHash(answer.result.relayToken) });
		expect(await relay.next(0, frame => frame.type === "remove_device")).toEqual({ type: "remove_device", deviceId: relaySignIn.deviceId });
	});
});
