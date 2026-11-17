import { describe, expect, it, vi } from "vitest";
import {
	encodePairingLink,
	EnvelopeChannel,
	generateKeyPair,
	linkRemoteAgent,
	parseRemoteAgentRequest,
	readRemoteAgentLinkState,
	RemoteAgentSession,
	sharedKey,
	type RemoteAgentConnector,
	type RemoteAgentLinkState,
	type RemoteAgentSocketEvents,
} from "../src/index";

describe("remote agent requests", () => {
	it("reads hello, tool and unlink requests", () => {
		expect(parseRemoteAgentRequest(JSON.stringify({ id: "1", type: "agent_hello" }))).toEqual({ id: "1", type: "agent_hello" });
		expect(parseRemoteAgentRequest(JSON.stringify({ id: "2", type: "agent_tool", name: "list_threads" }))).toEqual({ id: "2", type: "agent_tool", name: "list_threads", arguments: {} });
		expect(parseRemoteAgentRequest(JSON.stringify({ id: "3", type: "agent_unlink", extra: true }))).toEqual({ id: "3", type: "agent_unlink" });
	});
	it("refuses anything else with a message", () => {
		expect(() => parseRemoteAgentRequest("nope")).toThrow("not JSON");
		expect(() => parseRemoteAgentRequest(JSON.stringify({ type: "agent_hello" }))).toThrow("no id");
		expect(() => parseRemoteAgentRequest(JSON.stringify({ id: "x".repeat(65), type: "agent_hello" }))).toThrow("no id");
		expect(() => parseRemoteAgentRequest(JSON.stringify({ id: "1", type: "agent_tool", name: "../x" }))).toThrow("Name a tool");
		expect(() => parseRemoteAgentRequest(JSON.stringify({ id: "1", type: "agent_tool", name: "list_threads", arguments: [] }))).toThrow("arguments are an object");
		// A phone's frames are not a remote agent's.
		expect(() => parseRemoteAgentRequest(JSON.stringify({ id: "1", type: "list_chats" }))).toThrow("Unknown request");
	});
});

const desktop = generateKeyPair(), agent = generateKeyPair();
const link: RemoteAgentLinkState = { v: 1, relayUrl: "wss://relay.test", desktopId: "desktop-0123456789ab", desktopName: "Studio PC", desktopPublicKey: desktop.publicKey, deviceId: "agent-1234", relayToken: "token", privateKey: agent.privateKey, linkedAt: "2026-11-16T10:00:00.000Z" };

it("reads a stored link back, and nothing damaged", () => {
	expect(readRemoteAgentLinkState(JSON.parse(JSON.stringify(link)))).toEqual(link);
	expect(readRemoteAgentLinkState({ ...link, v: 2 })).toBeUndefined();
	expect(readRemoteAgentLinkState({ ...link, relayToken: "" })).toBeUndefined();
	expect(readRemoteAgentLinkState(null)).toBeUndefined();
});

/** A relay with one desktop on it: says whether the desktop is online, and answers sealed requests the way `reply` says. */
function fakeRelay(options: { online: boolean; reply?: (request: Record<string, unknown>) => Record<string, unknown> | undefined }) {
	const desktopSide = new EnvelopeChannel(sharedKey(desktop.privateKey, agent.publicKey), "desktop", link.deviceId);
	const opened: { url: string; token: string }[] = [];
	let events: RemoteAgentSocketEvents | undefined;
	const connect: RemoteAgentConnector = async (url, token, handlers) => {
		opened.push({ url, token }); events = handlers;
		queueMicrotask(() => handlers.message(JSON.stringify({ type: options.online ? "desktop_online" : "desktop_offline" })));
		return {
			send: text => {
				const envelope = JSON.parse(text) as Parameters<EnvelopeChannel["open"]>[0];
				const request = JSON.parse(desktopSide.open({ ...envelope, from: link.deviceId })) as Record<string, unknown>;
				const answer = options.reply?.(request);
				if (answer) queueMicrotask(() => handlers.message(JSON.stringify(desktopSide.seal({ id: request.id, type: request.type, ...answer }))));
			},
			close: () => {},
		};
	};
	return { connect, opened, closeWith: (code: number, reason = "") => events?.close(code, reason) };
}

it("never sends a link's one-time code once the caller was told linking timed out", async () => {
	vi.useFakeTimers();
	try {
		const sent: string[] = [], closed: number[] = [];
		let open: (() => void) | undefined;
		const late: RemoteAgentConnector = (_url, _token, events) => new Promise(resolve => {
			open = () => { resolve({ send: text => sent.push(text), close: code => closed.push(code ?? 0) }); events.message(JSON.stringify({ type: "desktop_online" })); };
		});
		const link = encodePairingLink({ v: 1, desktopId: "desktop-0123456789ab", desktopName: "Studio PC", pairingCode: generateKeyPair().publicKey, desktopPublicKey: desktop.publicKey, direct: [], connect: { relayUrl: "wss://relay.test", desktopId: "desktop-0123456789ab" } });
		const linking = linkRemoteAgent(link, { relayUrl: "wss://relay.test", deviceName: "Assistant", connect: late, timeoutMs: 1000 });
		const failed = expect(linking).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(1001);
		await failed;
		open!();
		await vi.advanceTimersByTimeAsync(0);
		expect(sent).toEqual([]);
		expect(closed).toEqual([1000]);
	} finally { vi.useRealTimers(); }
});

it("ignores a pairing answer that won't open, and still times out", async () => {
	vi.useFakeTimers();
	try {
		const connect: RemoteAgentConnector = async (_url, _token, events) => {
			// Someone without the key answers: an envelope that can't be opened.
			queueMicrotask(() => events.message(JSON.stringify({ to: "pair-x", from: "desktop", seq: 1, nonce: "A".repeat(32), ciphertext: "B".repeat(64) })));
			return { send: () => {}, close: () => {} };
		};
		const link = encodePairingLink({ v: 1, desktopId: "desktop-0123456789ab", desktopName: "Studio PC", pairingCode: generateKeyPair().publicKey, desktopPublicKey: desktop.publicKey, direct: [], connect: { relayUrl: "wss://relay.test", desktopId: "desktop-0123456789ab" } });
		const linking = linkRemoteAgent(link, { relayUrl: "wss://relay.test", deviceName: "Assistant", connect, timeoutMs: 1000 });
		const failed = expect(linking).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(1001);
		await failed;
	} finally { vi.useRealTimers(); }
});

describe("a remote agent session", () => {
	it("signs in as the linked device and gets the desktop's answer", async () => {
		const relay = fakeRelay({ online: true, reply: request => ({ ok: true, result: { echoed: request.name } }) });
		const session = new RemoteAgentSession(link, relay.connect);
		expect(await session.request({ type: "agent_tool", name: "list_threads", arguments: {} }, 1000)).toEqual({ echoed: "list_threads" });
		expect(relay.opened).toEqual([{ url: "wss://relay.test/v1/phone/desktop-0123456789ab", token: "token" }]);
		// The socket is kept for the next request.
		await session.request({ type: "agent_hello" }, 1000);
		expect(relay.opened).toHaveLength(1);
		session.close();
	});
	it("throws the desktop's refusal, an offline desktop and a timeout as errors with their own codes", async () => {
		const refusing = new RemoteAgentSession(link, fakeRelay({ online: true, reply: () => ({ ok: false, error: { message: "Unknown tool." } }) }).connect);
		await expect(refusing.request({ type: "agent_tool", name: "x", arguments: {} }, 1000)).rejects.toMatchObject({ code: "rejected", message: "Unknown tool." });
		refusing.close();
		const offline = new RemoteAgentSession(link, fakeRelay({ online: false }).connect);
		await expect(offline.request({ type: "agent_hello" }, 1000)).rejects.toMatchObject({ code: "offline", message: expect.stringContaining("Studio PC isn't connected") });
		offline.close();
		vi.useFakeTimers();
		try {
			const silent = new RemoteAgentSession(link, fakeRelay({ online: true }).connect);
			const waiting = silent.request({ type: "agent_hello" }, 5000);
			const failed = expect(waiting).rejects.toMatchObject({ code: "timeout" });
			await vi.advanceTimersByTimeAsync(5001);
			await failed;
			silent.close();
		} finally { vi.useRealTimers(); }
	});
	it("says the desktop removed the link when the relay closes it with 4001", async () => {
		const relay = fakeRelay({ online: true });
		const session = new RemoteAgentSession(link, relay.connect);
		const waiting = session.request({ type: "agent_hello" }, 5000);
		await new Promise(resolve => setTimeout(resolve, 0));
		relay.closeWith(4001, "device_removed");
		await expect(waiting).rejects.toMatchObject({ code: "refused", message: expect.stringContaining("removed this link") });
	});
});
