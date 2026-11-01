import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { generateKeyPair, parseDesktopFrame, type DesktopFrame } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { PhonePairing, type PhoneSettings } from "./phoneDevices";
import { PhoneServer } from "./phoneServer";
import { PhoneHub } from "./phoneSession";

/** A phone on a WebSocket: request() resolves with the response to that id, next() with the next pushed frame of a type. */
function phoneSocket(url: string, token: string) {
	const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
	const frames: DesktopFrame[] = [], waiting: { match: (frame: DesktopFrame) => boolean; resolve: (frame: DesktopFrame) => void }[] = [];
	socket.on("message", data => {
		const frame = parseDesktopFrame(data.toString());
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
		socket.send(JSON.stringify({ id: key, ...frame }));
		return await next(value => "ok" in value && value.id === key) as Extract<DesktopFrame, { ok: boolean }>;
	};
	return { socket, request, next, opened: new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); }), closed: new Promise<number>(resolve => socket.once("close", code => resolve(code))) };
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
		const server = new PhoneServer({ hub, pairing, desktopId: () => "desk-1", desktopName: () => "Test PC" });
		const { port, errors } = await server.listen(["127.0.0.1"], 0);
		cleanup.push(() => server.close());
		expect(errors).toEqual([]);
		return { app, pairing, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/v1/phone` };
	}
	async function pairPhone(base: string, pairing: PhonePairing) {
		const { pairingCode } = pairing.create();
		const response = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify({ pairingCode, deviceName: "Pixel", devicePublicKey: generateKeyPair().publicKey }) });
		expect(response.status).toBe(200);
		return { pairingCode, result: await response.json() as { deviceId: string; deviceToken: string; relayToken: string; desktopName: string } };
	}

	it("pairs a phone, lists chats, sends a message and streams the reply as entries", async () => {
		const { app, pairing, base, ws } = await start();
		expect(await (await fetch(`${base}/v1/phone/health`)).json()).toEqual({ ok: true, desktopId: "desk-1" });
		const { pairingCode, result } = await pairPhone(base, pairing);
		expect(result).toMatchObject({ desktopName: "Test PC", desktopId: "desk-1" });
		// The code worked once.
		const again = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify({ pairingCode, deviceName: "Other", devicePublicKey: generateKeyPair().publicKey }) });
		expect(again.status).toBe(400);

		const phone = phoneSocket(ws, result.deviceToken);
		cleanup.push(() => phone.socket.terminate());
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

	it("refuses a bad token, rejects what the phone may not do, and closes a removed phone's socket", async () => {
		const { app, pairing, base, ws } = await start();
		const refused = phoneSocket(ws, "not-a-token");
		await expect(refused.opened).rejects.toThrow("401");

		const { result } = await pairPhone(base, pairing);
		const phone = phoneSocket(ws, result.deviceToken);
		await phone.opened;
		expect(await phone.request({ type: "answer_approval", chatId: "chat-1", approvalId: "x", decision: "always" })).toMatchObject({ ok: false, error: { code: "invalid_frame" } });
		expect(await phone.request({ type: "read_chat", chatId: "old" })).toMatchObject({ ok: false, error: { code: "not_found" } });
		expect(await phone.request({ type: "answer_approval", chatId: "chat-1", approvalId: "gone", decision: "accept" })).toMatchObject({ ok: false, error: { code: "rejected", message: "This approval is no longer pending." } });
		expect(await phone.request({ type: "hello", deviceId: "someone-else", appVersion: "1" })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
		expect(app.commands).toEqual([{ type: "approval", id: "chat-1", approvalId: "gone", decision: "accept" }]);

		pairing.remove(result.deviceId);
		expect(await phone.closed).toBe(4401);
		const after = phoneSocket(ws, result.deviceToken);
		await expect(after.opened).rejects.toThrow("401");
	});

	it("starts a new chat and stops it", async () => {
		const { app, pairing, base, ws } = await start();
		const { result } = await pairPhone(base, pairing);
		const phone = phoneSocket(ws, result.deviceToken);
		cleanup.push(() => phone.socket.terminate());
		await phone.opened;
		const created = await phone.request({ type: "new_chat", text: "Plan the release", mode: "plan", projectId: "p1" }) as { ok: true; result: { chat: { id: string; project: string } } };
		expect(created).toMatchObject({ ok: true, result: { chat: { project: "Phaseo", mode: "plan" } } });
		expect(await phone.request({ type: "stop", chatId: created.result.chat.id })).toMatchObject({ ok: true });
		expect(app.commands.at(-1)).toEqual({ type: "cancel", id: created.result.chat.id });
		expect(await phone.request({ type: "new_chat", text: "x", mode: "chat", projectId: "missing" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});
});
