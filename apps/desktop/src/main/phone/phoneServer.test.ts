import { createServer as createTcpServer, connect as tcpConnect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { checkDirectWelcome, directAuth, EnvelopeChannel, generateKeyPair, isEnvelope, openPairResponse, parseDesktopFrame, readDirectChallenge, relayDesktopAddress, sealPairRequest, sharedKey, validatePairResult, type DesktopFrame, type KeyPair } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { PhonePairing, type PhoneSettings } from "./phoneDevices";
import { PhoneServer } from "./phoneServer";
import { PhoneHub } from "./phoneSession";

/**
 * A phone on a direct WebSocket, as the protocol describes it: answer the challenge with a sealed proof, check the
 * desktop's welcome, then seal and open every frame. request() resolves with the response to that id, next() with the
 * next pushed frame of a type. opened resolves after the welcome and rejects with the close code if the desktop refuses.
 */
function phoneSocket(url: string, deviceId: string, keys: KeyPair, desktopPublicKey: string) {
	const socket = new WebSocket(url);
	const channel = new EnvelopeChannel(sharedKey(keys.privateKey, desktopPublicKey), deviceId, relayDesktopAddress);
	const frames: DesktopFrame[] = [], waiting: { match: (frame: DesktopFrame) => boolean; resolve: (frame: DesktopFrame) => void }[] = [];
	let reply: string | undefined, welcomed = false, resolveOpened!: () => void, rejectOpened!: (error: Error) => void;
	const opened = new Promise<void>((resolve, reject) => { resolveOpened = resolve; rejectOpened = reject; });
	socket.on("message", data => {
		const text = data.toString();
		if (!reply) {
			const challenge = readDirectChallenge(text);
			if (!challenge) return;
			const auth = directAuth(channel, challenge.challenge);
			reply = auth.reply;
			socket.send(JSON.stringify(auth.envelope));
			return;
		}
		const envelope = JSON.parse(text) as unknown;
		if (!isEnvelope(envelope)) return;
		if (!welcomed) { checkDirectWelcome(channel, envelope, reply); welcomed = true; resolveOpened(); return; }
		const frame = parseDesktopFrame(channel.open(envelope));
		const waiter = waiting.findIndex(value => value.match(frame));
		if (waiter >= 0) waiting.splice(waiter, 1)[0]!.resolve(frame); else frames.push(frame);
	});
	const next = (match: (frame: DesktopFrame) => boolean) => new Promise<DesktopFrame>(resolve => {
		const index = frames.findIndex(match);
		if (index >= 0) resolve(frames.splice(index, 1)[0]!); else waiting.push({ match, resolve });
	});
	let id = 0;
	const request = async (frame: Record<string, unknown>) => {
		const key = String(++id);
		socket.send(JSON.stringify(channel.seal({ id: key, ...frame })));
		return await next(value => "ok" in value && value.id === key) as Extract<DesktopFrame, { ok: boolean }>;
	};
	const closed = new Promise<number>(resolve => socket.once("close", code => { if (!welcomed) rejectOpened(new Error(String(code))); resolve(code); }));
	socket.on("error", () => {});
	return { socket, channel, request, next, opened, closed };
}

/** A TCP relay in front of the phone server that keeps every byte both ways, to check what crosses the network. */
async function wiretap(port: number) {
	const bytes: Buffer[] = [], sockets: Socket[] = [];
	const server = createTcpServer(client => {
		const upstream = tcpConnect(port, "127.0.0.1");
		sockets.push(client, upstream);
		client.on("data", (chunk: Buffer) => { bytes.push(chunk); upstream.write(chunk); });
		upstream.on("data", (chunk: Buffer) => { bytes.push(chunk); client.write(chunk); });
		client.on("close", () => upstream.destroy()); upstream.on("close", () => client.destroy());
		client.on("error", () => {}); upstream.on("error", () => {});
	});
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const tapPort = (server.address() as { port: number }).port;
	return { base: `http://127.0.0.1:${tapPort}`, ws: `ws://127.0.0.1:${tapPort}/v1/phone`, text: () => Buffer.concat(bytes).toString("latin1"), close: () => new Promise<void>(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }) };
}

describe("phone server", () => {
	const cleanup: (() => Promise<void> | void)[] = [];
	afterEach(async () => { for (const step of cleanup.splice(0).reverse()) await step(); });

	async function start() {
		const app = fakePhoneHost();
		app.addTask({ id: "chat-1", title: "Fix the build", projectId: "p1", status: "completed", messages: [{ id: "u1", role: "user", text: "Why is CI red?", createdAt: "2026-11-01T09:00:00.000Z" }, { id: "a1", role: "assistant", text: "A lint rule.", createdAt: "2026-11-01T09:00:01.000Z" }] });
		app.addTask({ id: "agent-1", title: "Helper", delegation: { parentTaskId: "chat-1" } as never });
		app.addTask({ id: "old", title: "Archived", archived: true });
		let settings: PhoneSettings = { enabled: true, port: 0, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": false }, desktopId: "desk-1", tailscaleServe: false, connect: false, devices: [] };
		const store = { get value() { return settings; }, save: (change: Partial<PhoneSettings> = {}) => (settings = { ...settings, ...change }) };
		const pairing = new PhonePairing(store), hub = new PhoneHub(app.host);
		pairing.onRemoved = id => hub.closeDevice(id);
		app.onChange(overview => hub.overviewChanged(overview));
		const desktopKeys = generateKeyPair();
		const server = new PhoneServer({ hub, pairing, desktopId: () => "desk-1", desktopName: () => "Test PC", identity: async () => desktopKeys });
		const { port, errors } = await server.listen(["127.0.0.1"], 0);
		cleanup.push(() => server.close());
		expect(errors).toEqual([]);
		const connectPhone = (result: { deviceId: string }, keys: KeyPair, url = `ws://127.0.0.1:${port}/v1/phone`) => {
			const phone = phoneSocket(url, result.deviceId, keys, desktopKeys.publicKey);
			cleanup.push(() => phone.socket.terminate());
			return phone;
		};
		return { app, pairing, port, desktopKeys, connectPhone, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/v1/phone` };
	}
	/** POST /pair as the phone does: sealed to the QR code's key, and the answer opened with the phone's. */
	async function pairPhone(base: string, pairing: PhonePairing, desktopPublicKey: string) {
		const { pairingCode } = pairing.create(), keys = generateKeyPair();
		const response = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify(sealPairRequest(keys.privateKey, desktopPublicKey, { pairingCode, deviceName: "Pixel", devicePublicKey: keys.publicKey })) });
		expect(response.status).toBe(200);
		return { pairingCode, keys, result: validatePairResult(openPairResponse(keys.privateKey, desktopPublicKey, await response.json())) };
	}

	it("pairs a phone, lists chats, sends a message and streams the reply as entries", async () => {
		const { app, pairing, base, desktopKeys, connectPhone } = await start();
		expect(await (await fetch(`${base}/v1/phone/health`)).json()).toEqual({ ok: true, desktopId: "desk-1" });
		const { pairingCode, keys, result } = await pairPhone(base, pairing, desktopKeys.publicKey);
		expect(result).toMatchObject({ desktopName: "Test PC", desktopId: "desk-1" });
		// The code worked once, and a request in the clear isn't accepted at all.
		const other = generateKeyPair();
		const again = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify(sealPairRequest(other.privateKey, desktopKeys.publicKey, { pairingCode, deviceName: "Other", devicePublicKey: other.publicKey })) });
		expect([again.status, await again.json()]).toEqual([400, { error: "This pairing code has expired or was already used. Show a new one on the computer." }]);
		const plain = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify({ pairingCode: pairing.create().pairingCode, deviceName: "Other", devicePublicKey: other.publicKey }) });
		expect([plain.status, await plain.json()]).toEqual([400, { error: "Invalid pairing request." }]);

		const phone = connectPhone(result, keys);
		await phone.opened;
		expect(await phone.request({ type: "hello", deviceId: result.deviceId, appVersion: "0.1.0" })).toMatchObject({ ok: true, result: { desktopName: "Test PC", appVersion: "1.2.3", protocol: 1 } });
		const list = await phone.request({ type: "list_chats", limit: 10 });
		expect(list).toMatchObject({ ok: true, result: { chats: [{ id: "chat-1", title: "Fix the build", project: "Phaseo", status: "completed", needsYou: false }] } });
		expect((list as { result: { chats: unknown[] } }).result.chats).toHaveLength(1);

		const read = await phone.request({ type: "read_chat", chatId: "chat-1" });
		expect(read).toMatchObject({ ok: true, result: { earlier: 0, entries: [{ kind: "message", id: "u1" }, { kind: "message", id: "a1", text: "A lint rule." }], chat: { approvals: [], questions: [] } } });
		expect(await phone.request({ type: "subscribe", chatIds: ["chat-1", "agent-1"] })).toMatchObject({ ok: true, result: { chatIds: ["chat-1"] } });

		expect(await phone.request({ type: "send", chatId: "chat-1", text: "Fix it please" })).toMatchObject({ ok: true });
		expect(app.commands.at(-1)).toEqual({ type: "send", id: "chat-1", text: "Fix it please" });
		const sent = await phone.next(frame => frame.type === "entries") as Extract<DesktopFrame, { type: "entries" }>;
		expect(sent.entries).toEqual([expect.objectContaining({ role: "user", text: "Fix it please" })]);

		app.addMessage("chat-1", { role: "assistant", text: "Done: the lint rule is fixed." });
		const reply = await phone.next(frame => frame.type === "entries") as Extract<DesktopFrame, { type: "entries" }>;
		expect(reply).toMatchObject({ chatId: "chat-1", entries: [{ kind: "message", role: "assistant", text: "Done: the lint rule is fixed." }] });
		expect(await phone.next(frame => frame.type === "chat_updated")).toMatchObject({ chat: { id: "chat-1", status: "running" } });
	});

	it("refuses a phone that can't prove its key, rejects what the phone may not do, and closes a removed phone's socket", async () => {
		const { app, pairing, base, desktopKeys, connectPhone } = await start();
		const { keys, result } = await pairPhone(base, pairing, desktopKeys.publicKey);
		// The right device id with another key, and an unknown device.
		await expect(connectPhone(result, generateKeyPair()).opened).rejects.toThrow("4401");
		await expect(connectPhone({ deviceId: "someone" }, keys).opened).rejects.toThrow("4401");

		const phone = connectPhone(result, keys);
		await phone.opened;
		expect(await phone.request({ type: "answer_approval", chatId: "chat-1", approvalId: "x", decision: "always" })).toMatchObject({ ok: false, error: { code: "invalid_frame" } });
		expect(await phone.request({ type: "read_chat", chatId: "old" })).toMatchObject({ ok: false, error: { code: "not_found" } });
		expect(await phone.request({ type: "answer_approval", chatId: "chat-1", approvalId: "gone", decision: "accept" })).toMatchObject({ ok: false, error: { code: "rejected", message: "This approval is no longer pending." } });
		expect(await phone.request({ type: "hello", deviceId: "someone-else", appVersion: "1" })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
		expect(app.commands).toEqual([{ type: "approval", id: "chat-1", approvalId: "gone", decision: "accept" }]);

		pairing.remove(result.deviceId);
		expect(await phone.closed).toBe(4401);
		await expect(connectPhone(result, keys).opened).rejects.toThrow("4401");
	});

	it("starts a new chat and stops it", async () => {
		const { app, pairing, base, desktopKeys, connectPhone } = await start();
		const { keys, result } = await pairPhone(base, pairing, desktopKeys.publicKey);
		const phone = connectPhone(result, keys);
		await phone.opened;
		const created = await phone.request({ type: "new_chat", text: "Plan the release", mode: "plan", projectId: "p1" }) as { ok: true; result: { chat: { id: string; project: string } } };
		expect(created).toMatchObject({ ok: true, result: { chat: { project: "Phaseo", mode: "plan" } } });
		expect(await phone.request({ type: "stop", chatId: created.result.chat.id })).toMatchObject({ ok: true });
		expect(app.commands.at(-1)).toEqual({ type: "cancel", id: created.result.chat.id });
		expect(await phone.request({ type: "new_chat", text: "x", mode: "chat", projectId: "missing" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});

	it("sends no token, pairing secret or chat text in the clear on a direct connection", async () => {
		const { app, pairing, port, desktopKeys, connectPhone } = await start();
		const tap = await wiretap(port);
		cleanup.push(() => tap.close());
		const { pairingCode, keys, result } = await pairPhone(tap.base, pairing, desktopKeys.publicKey);
		const phone = connectPhone(result, keys, tap.ws);
		await phone.opened;
		await phone.request({ type: "hello", deviceId: result.deviceId, appVersion: "0.1.0" });
		expect(await phone.request({ type: "read_chat", chatId: "chat-1" })).toMatchObject({ ok: true, result: { entries: [{ text: "Why is CI red?" }, { text: "A lint rule." }] } });
		await phone.request({ type: "subscribe", chatIds: ["chat-1"] });
		expect(await phone.request({ type: "send", chatId: "chat-1", text: "Ship the hotfix tonight" })).toMatchObject({ ok: true });
		app.addMessage("chat-1", { role: "assistant", text: "Hotfix deployed to staging." });
		await phone.next(frame => frame.type === "entries" && JSON.stringify(frame).includes("Hotfix deployed"));

		const wire = tap.text();
		// The tap really saw the traffic: the HTTP request line, the upgrade and the challenge.
		expect(wire).toContain("POST /pair");
		expect(wire).toContain("GET /v1/phone");
		expect(wire).toContain('"type":"challenge"');
		for (const secret of [pairingCode, result.relayToken, keys.privateKey, "Fix the build", "Why is CI red?", "A lint rule.", "Ship the hotfix tonight", "Hotfix deployed", "Pixel", "Test PC", "Authorization", "Bearer"]) {
			expect(wire).not.toContain(secret);
		}
	});
});
