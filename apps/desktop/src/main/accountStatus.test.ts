import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "../shared/workspace";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { codexUsage, nativeAccountStatus } from "./accountStatus";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

const account: Account = { id: "native", name: "Native", kind: "native", harness: "codex", configDirectory: "/owned/profile", configured: false };
function fixture(handler: (packet: { id: number; method: string; params: unknown }, send: (value: unknown) => void) => void) {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
	let buffer = ""; child.stdin.on("data", chunk => { buffer += chunk.toString(); let index: number; while ((index = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); handler(JSON.parse(line), value => child.stdout.write(JSON.stringify(value) + "\n")); } });
	native.spawn.mockResolvedValue(child); return child;
}

describe("native account status", () => {
	it("cancels a stalled native status read without waiting for a process exit", async () => {
		const child = fixture(() => {}); const controller = new AbortController(); const checking = nativeAccountStatus("claude", "/cwd", undefined, controller.signal);
		const rejected = expect(checking).rejects.toThrow("cancelled"); await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1)); controller.abort(); await rejected; expect(child.kill).toHaveBeenCalled();
	});
	it("reads the selected Codex identity and quotas without issuing a turn or exposing credentials", async () => {
		const methods: string[] = []; const child = fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "account/read") { expect(packet.params).toEqual({ refreshToken: false }); send({ id: packet.id, result: { account: { type: "chatgpt", email: "person@example.invalid", planType: "pro", accessToken: "never-expose" }, requiresOpenaiAuth: true } }); }
			if (packet.method === "account/rateLimits/read") { expect(packet.params).toEqual({ excludeResetCreditDetails: true, supportsLunaReserve: false }); send({ id: packet.id, result: { ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { limitName: "Codex", primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: null } }, accountId: "private-account-id" } }); }
		});
		const status = await nativeAccountStatus("codex", "/cwd", account); expect(status).toMatchObject({ authenticated: true, identity: "person@example.invalid", plan: "pro", ordinaryUsageAllowed: false, usage: [{ name: "Codex", primary: { usedPercent: 25 }, secondary: null }] });
		expect(methods).toEqual(["initialize", "initialized", "account/read", "account/rateLimits/read"]); expect(JSON.stringify(status)).not.toMatch(/never-expose|private-account-id/); expect(child.kill).toHaveBeenCalled(); expect(native.spawn.mock.lastCall?.[4]).toMatchObject({ CODEX_HOME: "/owned/profile", OPENAI_API_KEY: undefined });
	});
	it("keeps authentication valid if quota data is unavailable", async () => {
		fixture((packet, send) => { if (packet.method === "initialize") send({ id: packet.id, result: {} }); if (packet.method === "account/read") send({ id: packet.id, result: { account: { type: "chatgpt", email: null, planType: "plus" } } }); if (packet.method === "account/rateLimits/read") send({ id: packet.id, error: { code: -32601, message: "Unavailable" } }); });
		expect(await nativeAccountStatus("codex", "/cwd")).toMatchObject({ authenticated: true, usageError: "Codex did not provide usage limits." });
	});
	it("does not infer a signed-in account when native authentication is unnecessary", async () => {
		fixture((packet, send) => { if (packet.method === "initialize") send({ id: packet.id, result: {} }); if (packet.method === "account/read") send({ id: packet.id, result: { account: null, requiresOpenaiAuth: false } }); });
		expect((await nativeAccountStatus("codex", "/cwd")).authenticated).toBeNull();
	});
	it("reads Claude's documented status command and strips inherited profile credentials", async () => {
		const child = fixture(() => {}); const checking = nativeAccountStatus("claude", "/cwd", { ...account, harness: "claude" });
		await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1));
		child.stdout.write(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "person@example.invalid", subscriptionType: "max", accessToken: "never-expose", configDirectory: "/private/path" })); child.emit("exit", 0);
		const status = await checking; expect(status).toMatchObject({ authenticated: true, plan: "max", method: "claude.ai" }); expect(JSON.stringify(status)).not.toMatch(/never-expose|private\/path/);
		expect(native.spawn.mock.lastCall?.[1]).toEqual(["auth", "status"]); expect(native.spawn.mock.lastCall?.[4]).toMatchObject({ CLAUDE_CONFIG_DIR: "/owned/profile", CLAUDE_CODE_OAUTH_TOKEN: undefined, CLAUDE_CODE_USE_BEDROCK: undefined }); expect(child.kill).toHaveBeenCalled();
	});
	it("accepts Claude's signed-out exit status and rejects malformed output", async () => {
		for (const output of ['{"loggedIn":false,"authMethod":"none"}', '{"accessToken":"never-expose"}']) {
			const child = fixture(() => {}); const checking = nativeAccountStatus("claude", "/cwd"); const checked = output.includes("loggedIn") ? expect(checking).resolves.toMatchObject({ authenticated: false }) : expect(checking).rejects.toThrow("invalid account status");
			await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1)); child.stdout.write(output); child.emit("exit", 1); await checked;
		}
	});
	it("preserves unknown windows and explicit blocking independently of percentages", () => {
		expect(codexUsage({ rateLimits: { primary: { usedPercent: 0 }, secondary: null } })).toMatchObject({ ordinaryUsageAllowed: null, usage: [{ primary: { usedPercent: 0, resetsAt: null, windowDurationMins: null }, secondary: null, spendControlReached: null }] });
		expect(codexUsage({ ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { primary: { usedPercent: Number.NaN }, secondary: { usedPercent: 150 } } } })).toMatchObject({ ordinaryUsageAllowed: false, usage: [{ primary: null, secondary: { usedPercent: 100 } }] });
		expect(nativeAccountEnvironment()).toBeUndefined();
	});
});
