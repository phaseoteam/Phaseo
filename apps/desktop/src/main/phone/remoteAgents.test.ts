import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, remoteAgentToolMs, remoteAgentToolSpecs, remoteAgentTools, remoteAgentWaitDefaultMs, tokenHash } from "@phaseo/phone-protocol";
import { waitDefaultMs } from "../../shared/orchestration";
import type { ThreadTools } from "../../shared/orchestration";
import { outsideAgentTools } from "../../shared/outsideAgents";
import { PhonePairing, PhoneSettingsFile, type AgentDeviceRecord } from "./phoneDevices";
import { remoteAgentRequests } from "./remoteAgents";
import { outsideAgentToolset } from "../outsideAgentsMcp";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const pairingIn = () => {
	const folder = mkdtempSync(path.join(tmpdir(), "phaseo-agents-")); folders.push(folder);
	const store = new PhoneSettingsFile(folder);
	return { folder, store, pairing: new PhonePairing(store) };
};
const pairRequest = (pairingCode: string) => ({ pairingCode, deviceName: "Assistant", devicePublicKey: generateKeyPair().publicKey });

describe("apps linked over Phaseo Connect", () => {
	it("pairs only over the relay, as an app kept apart from the phones", () => {
		const { folder, pairing } = pairingIn();
		const { pairingCode } = pairing.create({ agent: "start" });
		// The phone server never takes an app's link, and the code still works over Connect afterwards.
		expect(() => pairing.redeem(pairRequest(pairingCode))).toThrow("expired or was already used");
		const { device, agent, result } = pairing.redeem(pairRequest(pairingCode), { overRelay: true });
		expect(agent).toBe(true);
		expect(pairing.agent(result.deviceId)).toMatchObject({ name: "Assistant", access: "start", relayTokenHash: tokenHash(result.relayToken) });
		expect(pairing.device(device.id)).toBeUndefined();
		expect(() => pairing.redeem(pairRequest(pairingCode), { overRelay: true })).toThrow("expired or was already used");
		const saved = JSON.parse(readFileSync(path.join(folder, "phone.json"), "utf8")) as { devices: unknown[]; agents: unknown[] };
		expect(saved.devices).toEqual([]);
		expect(saved.agents).toHaveLength(1);
		expect(JSON.stringify(saved)).not.toContain(result.relayToken);
		// A phone's code over the relay still makes a phone.
		const phone = pairing.redeem({ ...pairRequest(pairing.create().pairingCode), deviceName: "Pixel" }, { overRelay: true });
		expect(phone.agent).toBe(false);
		expect(pairing.device(phone.result.deviceId)?.name).toBe("Pixel");
		expect(pairing.agents().map(value => value.name)).toEqual(["Assistant"]);
	});

	it("reads links back from disk, and removing one forgets it and tells the relay", () => {
		const { folder, pairing } = pairingIn();
		const removed = vi.fn(); pairing.onRemoved = removed;
		const { result } = pairing.redeem(pairRequest(pairing.create({ agent: "read" }).pairingCode), { overRelay: true });
		expect(new PhonePairing(new PhoneSettingsFile(folder)).agent(result.deviceId)?.access).toBe("read");
		pairing.removeAgent(result.deviceId);
		expect(removed).toHaveBeenCalledWith(result.deviceId);
		expect(pairing.agents()).toEqual([]);
		expect(() => pairing.removeAgent(result.deviceId)).toThrow("no longer linked");
	});

	it("accepts each sequence once, and remembers the last across a restart", () => {
		const { folder, pairing } = pairingIn();
		const { result } = pairing.redeem(pairRequest(pairing.create({ agent: "start" }).pairingCode), { overRelay: true });
		expect(pairing.acceptAgentSeq(result.deviceId, 1000)).toBe(true);
		expect(pairing.acceptAgentSeq(result.deviceId, 1000)).toBe(false);
		expect(pairing.acceptAgentSeq(result.deviceId, 999)).toBe(false);
		const restarted = new PhonePairing(new PhoneSettingsFile(folder));
		expect(restarted.acceptAgentSeq(result.deviceId, 1000)).toBe(false);
		expect(restarted.acceptAgentSeq(result.deviceId, 1001)).toBe(true);
		expect(restarted.acceptAgentSeq("someone-else", 5000)).toBe(false);
	});

	it("gives wait_thread as long as it asked for, and the desktop's own default", () => {
		expect(remoteAgentWaitDefaultMs).toBe(waitDefaultMs);
		expect(remoteAgentToolMs("wait_thread", {})).toBeGreaterThan(waitDefaultMs);
		expect(remoteAgentToolMs("wait_thread", { timeoutMs: 45 * 60_000 })).toBeGreaterThan(45 * 60_000);
		expect(remoteAgentToolMs("list_threads", { timeoutMs: 45 * 60_000 })).toBe(60_000);
	});

	it("offers the same tools as an outside agent's token of that access", () => {
		expect(outsideAgentTools).toBe(remoteAgentTools);
	});

	it("matches the tool contract mcp.phaseo.app lists without asking the desktop", () => {
		// If this fails, a tool's description or input changed: update remoteAgentToolSpecs in @phaseo/phone-protocol to match.
		const refuse = () => { throw new Error("not called"); };
		const all = { list: refuse, read: refuse, search: refuse, projects: refuse, agents: refuse, models: refuse, launch: refuse, delegate: refuse, send: refuse, wait: refuse } as unknown as Partial<ThreadTools>;
		const offered = outsideAgentToolset(all, "start").map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
		expect(offered).toEqual(remoteAgentToolSpecs);
		expect(offered.map(tool => tool.name).sort()).toEqual([...remoteAgentTools.start].sort());
	});
});

describe("remote agent requests", () => {
	const agent = (access: "read" | "start"): AgentDeviceRecord => ({ id: "a1", name: "Assistant", publicKey: "k", relayTokenHash: "h", pairedAt: "2026-11-16T10:00:00.000Z", access });
	const setup = (access: "read" | "start") => {
		const list = vi.fn(() => [{ id: "c1", title: "Release notes", harness: "codex" as const, model: "m", status: "idle" as const }]);
		const send = vi.fn(async () => ({}) as never);
		const tools = vi.fn((): Partial<ThreadTools> => ({ list, send, read: vi.fn(), search: vi.fn(() => []), projects: vi.fn(() => []) }));
		const remove = vi.fn();
		const answer = remoteAgentRequests({ tools, desktopName: () => "Test PC", remove });
		return { list, send, tools, remove, ask: (frame: Record<string, unknown>) => answer(agent(access), JSON.stringify(frame)) };
	};

	it("says hello with the desktop's name, its access and its tools", async () => {
		const { ask, tools } = setup("read");
		const hello = await ask({ id: "h", type: "agent_hello" });
		expect(hello).toMatchObject({ id: "h", type: "agent_hello", ok: true, result: { desktopName: "Test PC", access: "read" } });
		const names = (hello!.result as { tools: string[] }).tools;
		expect(names).toContain("list_threads");
		expect(names.every(name => remoteAgentTools.read.includes(name))).toBe(true);
		expect(tools).toHaveBeenCalledWith({ id: "a1", name: "Assistant", access: "read" });
	});

	it("runs a tool its access allows and refuses one it doesn't", async () => {
		const { ask, list, send } = setup("read");
		expect(await ask({ id: "1", type: "agent_tool", name: "list_threads", arguments: { query: "release" } })).toMatchObject({ id: "1", type: "agent_tool", ok: true, result: [{ id: "c1", title: "Release notes" }] });
		expect(list).toHaveBeenCalledWith("release");
		const refused = await ask({ id: "2", type: "agent_tool", name: "send_thread", arguments: { id: "c1", message: "hi" } });
		expect(refused).toMatchObject({ id: "2", ok: false, error: { message: expect.stringMatching(/^Unknown tool\. This link can use: .*list_threads/) } });
		expect(send).not.toHaveBeenCalled();
	});

	it("answers a bad request with an error when it has an id, and drops it otherwise", async () => {
		const { ask } = setup("start");
		expect(await ask({ id: "x", type: "agent_tool", name: "List Threads" })).toMatchObject({ id: "x", ok: false, error: { message: "Name a tool." } });
		expect(await ask({ type: "agent_hello" })).toBeUndefined();
	});

	it("unlinks after answering", async () => {
		vi.useFakeTimers();
		try {
			const { ask, remove } = setup("start");
			expect(await ask({ id: "u", type: "agent_unlink" })).toMatchObject({ id: "u", ok: true, result: { unlinked: true } });
			expect(remove).not.toHaveBeenCalled();
			vi.runAllTimers();
			expect(remove).toHaveBeenCalledWith("a1");
		} finally { vi.useRealTimers(); }
	});

	it("refuses an answer too large for one frame, counting bytes rather than characters", async () => {
		// 400,000 CJK characters are 1.2 MB of UTF-8, past the 1 MiB frame, though fewer than a million characters.
		for (const title of ["x".repeat(1_100_000), "文".repeat(400_000)]) {
			const answer = remoteAgentRequests({ tools: () => ({ list: () => [{ id: "c1", title, harness: "codex" as const, model: "m", status: "idle" as const }] }), desktopName: () => "PC", remove: () => {} });
			expect(await answer(agent("read"), JSON.stringify({ id: "big", type: "agent_tool", name: "list_threads", arguments: {} }))).toMatchObject({ ok: false, error: { message: expect.stringMatching(/too large/) } });
		}
	});
});
