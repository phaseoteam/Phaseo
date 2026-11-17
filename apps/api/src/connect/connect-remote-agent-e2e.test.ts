// An app such as Assistant driving Phaseo Desktop through mcp.phaseo.app, end to end in one process: the real
// phaseo-connect Worker and ConnectRoom, the real desktop Connect client answering with the real remote-agent handler,
// and mcp.phaseo.app's real DesktopLinks Durable Object (its storage in memory) connecting with ws. Everything goes over
// real WebSockets on 127.0.0.1 (see __tests__/relayHarness.ts).
import type { IncomingMessage } from "node:http";
import { encodePairingLink, relayCloseCodes, type RemoteAgentConnector } from "@phaseo/phone-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthFailure, AuthSuccess } from "@/pipeline/before/auth";
import { createConnectWorker, type ConnectWorkerEnv } from "../connect-worker";
import { GATEWAY_KEY, startDesktop, startRelay, ws } from "./__tests__/relayHarness";
import { DesktopLinks } from "../../../mcp/src/desktop";
import { remoteAgentRequests } from "../../../desktop/src/main/phone/remoteAgents";
import type { ThreadTools } from "../../../desktop/src/shared/orchestration";

const auth = async (request: Request): Promise<AuthSuccess | AuthFailure> => request.headers.get("authorization") === `Bearer ${GATEWAY_KEY}`
	? { ok: true, workspaceId: "ws-1", apiKeyId: "key-1", apiKeyRef: "kid_x", apiKeyKid: "x" }
	: { ok: false, reason: "invalid_key_format" };
const worker = createConnectWorker(auth);
const throughWorker = (request: Request, room: { fetch(request: Request): Promise<Response> }) =>
	worker.fetch(request, { CONNECT_ROOM: { idFromName: (name: string) => name, get: () => room } } as unknown as ConnectWorkerEnv, { waitUntil: () => {} } as unknown as ExecutionContext);

/** What the Worker's fetch-upgrade connector does, with ws in Node. */
const wsConnector: RemoteAgentConnector = (url, token, events) => new Promise((resolve, reject) => {
	const socket = new ws.WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
	socket.on("open", () => resolve({ send: text => socket.send(text), close: (code, reason) => socket.close(code, reason) }));
	socket.on("unexpected-response", (_request: IncomingMessage, response: IncomingMessage) => { reject(new Error(`refused ${response.statusCode}`)); socket.terminate(); });
	socket.on("error", () => {});
	socket.on("message", (data: Buffer) => events.message(data.toString()));
	socket.on("close", (code: number, reason: Buffer) => events.close(code, reason.toString()));
});

/** A Durable Object's storage, in memory. */
const memoryState = () => {
	const values = new Map<string, unknown>();
	return { values, state: { storage: {
		get: async (key: string) => structuredClone(values.get(key)),
		put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); },
		delete: async (keys: string | string[]) => { for (const key of [keys].flat()) values.delete(key); return true; },
	} } as unknown as DurableObjectState };
};

describe("an app linked through mcp.phaseo.app, end to end", () => {
	const cleanup: (() => Promise<void> | void)[] = [];
	afterEach(async () => { for (const step of cleanup.splice(0).reverse()) await step(); });

	async function setup() {
		const relay = await startRelay(throughWorker); cleanup.push(() => relay.close());
		const list = vi.fn((query?: string) => [{ id: "chat-1", title: "Release notes", harness: "codex" as const, model: "gpt", status: "idle" as const }].filter(chat => !query || chat.title.toLowerCase().includes(query)));
		const send = vi.fn(async () => {});
		const tools = vi.fn((): Partial<ThreadTools> => ({ list, send, read: id => ({ thread: { id, title: "Release notes" }, messages: [{ role: "user", text: "Draft them" }] }) as never }));
		let desktopRef: Awaited<ReturnType<typeof startDesktop>> | undefined;
		const agentRequest = remoteAgentRequests({ tools, desktopName: () => "Test PC", remove: id => desktopRef!.pairing.removeAgent(id) });
		const desktop = desktopRef = await startDesktop(relay, { agentRequest }); cleanup.push(() => desktop.stop());
		desktop.pairing.onRemoved = id => { desktop.hub.closeDevice(id); desktop.client.removeDevice(id); };
		const { values, state } = memoryState();
		const links = new DesktopLinks(state, { PHASEO_CONNECT_RELAY_URL: relay.url }, wsConnector); cleanup.push(() => links.close());
		const call = async (body: Record<string, unknown>) => (await links.fetch(new Request("https://desktop-links.internal/call", { method: "POST", body: JSON.stringify(body) }))).json() as Promise<{ ok: boolean; result?: unknown; error?: string }>;
		/** Settings → Outside agents' Make link: a code for an app, and the link the person copies. */
		const makeLink = async (access: "read" | "start") => {
			const code = await desktop.showPairingCode(access);
			return encodePairingLink({ v: 1, desktopId: desktop.desktopId, desktopName: "Test PC", pairingCode: code.pairingCode, desktopPublicKey: desktop.desktopKeys.publicKey, direct: [], connect: { relayUrl: relay.url, desktopId: desktop.desktopId } });
		};
		return { relay, desktop, links, values, call, makeLink, list, send, tools };
	}

	it("links with a one-time link and runs the desktop's tools, with the relay seeing only ciphertext", async () => {
		const context = await setup();
		const link = await context.makeLink("read");
		const linked = await context.call({ action: "link", link, deviceName: "Assistant" });
		expect(linked).toEqual({ ok: true, result: { desktopName: "Test PC", access: "read", tools: expect.arrayContaining(["list_threads", "read_thread"]) } });
		// The desktop lists the app apart from its phones, with the access the link named.
		expect(context.desktop.pairing.agents()).toEqual([expect.objectContaining({ name: "Assistant", access: "read" })]);
		expect(context.desktop.pairing.device(context.desktop.pairing.agents()[0]!.id)).toBeUndefined();
		// The link is single use.
		expect(await context.call({ action: "link", link, deviceName: "Assistant" })).toMatchObject({ ok: false, error: expect.stringMatching(/expired or was already used/) });

		const listed = await context.call({ action: "tool", name: "list_threads", arguments: { query: "release" } });
		expect(listed).toEqual({ ok: true, result: [{ id: "chat-1", title: "Release notes", harness: "codex", model: "gpt", status: "idle" }] });
		expect(context.list).toHaveBeenCalledWith("release");
		expect(context.tools).toHaveBeenCalledWith(expect.objectContaining({ name: "Assistant", access: "read" }));
		expect(await context.call({ action: "tool", name: "read_thread", arguments: { id: "chat-1" } })).toMatchObject({ ok: true, result: { messages: [{ text: "Draft them" }] } });

		// A read-only link can't message a chat; the desktop refuses it and nothing is sent.
		expect(await context.call({ action: "tool", name: "send_thread", arguments: { id: "chat-1", text: "Ship it" } })).toMatchObject({ ok: false, error: expect.stringMatching(/^Unknown tool/) });
		expect(context.send).not.toHaveBeenCalled();
		expect(await context.call({ action: "hello" })).toMatchObject({ ok: true, result: { linked: true, desktopName: "Test PC", access: "read" } });

		const seen = context.relay.seen.join("\n");
		for (const text of ["Release notes", "Draft them", "list_threads", "Assistant", link]) expect(seen).not.toContain(text);
	});

	it("lets a start link message chats, and unlinking removes it on both sides", async () => {
		const context = await setup();
		expect(await context.call({ action: "link", link: await context.makeLink("start"), deviceName: "Assistant" })).toMatchObject({ ok: true, result: { access: "start" } });
		expect(await context.call({ action: "tool", name: "send_thread", arguments: { id: "chat-1", text: "Ship it" } })).toMatchObject({ ok: true });
		expect(context.send).toHaveBeenCalledWith("chat-1", "Ship it", undefined, false);
		const agentId = context.desktop.pairing.agents()[0]!.id;
		expect(await context.call({ action: "unlink" })).toEqual({ ok: true, result: { unlinked: true, desktopRemoved: true } });
		// The desktop removes the link after answering, and tells the relay.
		await context.relay.processed.until(entry => entry.sender === "desktop" && entry.frame.type === "remove_device" && entry.frame.deviceId === agentId);
		expect(context.desktop.pairing.agents()).toEqual([]);
		expect(context.values.has("link")).toBe(false);
		expect(await context.call({ action: "tool", name: "list_threads", arguments: {} })).toMatchObject({ ok: false, error: expect.stringMatching(/No Phaseo desktop is linked/) });
	});

	it("forgets a link the desktop removed, and says when the desktop is offline", async () => {
		const context = await setup();
		await context.call({ action: "link", link: await context.makeLink("read"), deviceName: "Assistant" });
		const agentId = context.desktop.pairing.agents()[0]!.id;
		expect(await context.call({ action: "tool", name: "list_threads", arguments: {} })).toMatchObject({ ok: true });
		// Remove in Settings: the relay closes the app's socket and refuses it from then on.
		context.desktop.pairing.removeAgent(agentId);
		await context.relay.processed.until(entry => entry.sender === "desktop" && entry.frame.type === "remove_device" && entry.frame.deviceId === agentId);
		// The hosted side starts over (a restarted object), so its next call signs in afresh.
		context.links.close();
		// The relay refuses the removed link's sign-in, which says so rather than calling the desktop offline.
		expect(await context.call({ action: "tool", name: "list_threads", arguments: {} })).toMatchObject({ ok: false, error: expect.stringMatching(/removed this link/) });
		// The link was forgotten, so the next call says to link again.
		expect(await context.call({ action: "tool", name: "list_threads", arguments: {} })).toMatchObject({ ok: false, error: expect.stringMatching(/No Phaseo desktop is linked/) });

		// A second desktop link, then the desktop goes away.
		const other = await setup();
		await other.call({ action: "link", link: await other.makeLink("read"), deviceName: "Assistant" });
		other.desktop.stop();
		expect(await other.call({ action: "tool", name: "list_threads", arguments: {} })).toMatchObject({ ok: false, error: expect.stringMatching(/isn't connected to Phaseo Connect right now/) });
		expect(relayCloseCodes.deviceRemoved).toBe(4001);
	});

	it("refuses a request the relay replays after the desktop reconnects", async () => {
		const context = await setup();
		await context.call({ action: "link", link: await context.makeLink("start"), deviceName: "Assistant" });
		const agentId = context.desktop.pairing.agents()[0]!.id;
		expect(await context.call({ action: "tool", name: "send_thread", arguments: { id: "chat-1", text: "Ship it" } })).toMatchObject({ ok: true });
		expect(context.send).toHaveBeenCalledTimes(1);
		const captured = context.relay.processed.items.filter(entry => entry.sender === agentId).at(-1)!.frame;
		context.links.close();
		// The desktop's connection drops and comes back, which starts its envelope channels over.
		const reconnects = context.desktop.states.items.length;
		context.desktop.client.stop(); context.desktop.client.start();
		await context.desktop.states.until(state => state.status === "connected" && context.desktop.states.items.indexOf(state) >= reconnects);
		// A relay that kept the ciphertext sends it again as the app's device.
		const link = context.values.get("link") as { relayToken: string; desktopId: string };
		const before = context.relay.processed.items.length;
		const replayer = await new Promise<InstanceType<typeof ws.WebSocket>>((resolve, reject) => {
			const socket = new ws.WebSocket(`${context.relay.url}/v1/phone/${link.desktopId}`, { headers: { Authorization: `Bearer ${link.relayToken}` } });
			socket.on("open", () => { socket.send(JSON.stringify(captured)); resolve(socket); });
			socket.on("error", reject);
		});
		// The relay has forwarded the replay to the desktop.
		await context.relay.processed.until(entry => entry.sender === agentId && context.relay.processed.items.indexOf(entry) >= before);
		replayer.close(1000);
		// A fresh request reaches the desktop after the replay on the same connection, so by its answer the replay was handled: dropped.
		expect(await context.call({ action: "tool", name: "send_thread", arguments: { id: "chat-1", text: "Again" } })).toMatchObject({ ok: true });
		expect(context.send.mock.calls.map(call => (call as unknown[])[1])).toEqual(["Ship it", "Again"]);
	});

	it("refuses a link for another relay, or one made without Phaseo Connect", async () => {
		const context = await setup();
		const code = await context.desktop.showPairingCode("read");
		const base = { v: 1 as const, desktopId: context.desktop.desktopId, desktopName: "Test PC", pairingCode: code.pairingCode, desktopPublicKey: context.desktop.desktopKeys.publicKey, direct: [] };
		expect(await context.call({ action: "link", link: encodePairingLink({ ...base, connect: { relayUrl: "wss://relay.example", desktopId: context.desktop.desktopId } }), deviceName: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/different Phaseo Connect relay/) });
		expect(await context.call({ action: "link", link: encodePairingLink(base), deviceName: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/without Phaseo Connect/) });
		expect(context.relay.upgrades.filter(url => url.includes("/v1/phone/"))).toEqual([]);
	});
});
