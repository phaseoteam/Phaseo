import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { UsageHubs, claudeHubUsage, claudeProfilePlan, codexHubUsage, t3CodeHubs, usageHubFile } from "./usageHubs";
import type { UsageHub, UsageHubSnapshot } from "../shared/usageHubs";

/** A CLIProxyAPI stand-in: auth-files lists accounts, api-call answers with the provider's usage. */
function hubFixture({ key = "secret", down = false, files = [] as Record<string, unknown>[], upstream = (() => ({ status_code: 200, body: "{}" })) as (url: string, authIndex: string) => { status_code: number; body: string } } = {}) {
	const calls: { url: string; body?: unknown; authorization?: string }[] = [];
	const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
		if (down) throw new TypeError("fetch failed");
		const url = String(input), headers = init?.headers as Record<string, string>, body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
		calls.push({ url, body, authorization: headers.Authorization });
		if (headers.Authorization !== `Bearer ${key}`) return new Response("{}", { status: 401 });
		if (url.endsWith("/v0/management/auth-files")) return Response.json({ files });
		if (url.endsWith("/v0/management/api-call")) return Response.json(upstream(String(body?.url), String(body?.auth_index)));
		return new Response("", { status: 404 });
	});
	return { fetcher: fetcher as unknown as typeof fetch, calls };
}
function store() {
	const secrets = new Map<string, string>();
	return { secrets, vault: { set: async (id: string, value: string) => { secrets.set(id, value); }, get: async (id: string) => secrets.get(id) ?? "", remove: (id: string) => { secrets.delete(id); } } };
}
/** No T3 Code hubs, so tests never read this computer's. */
const none = () => [];
async function withDirectory(test: (directory: string) => Promise<void>) { const directory = mkdtempSync(path.join(tmpdir(), "phaseo-hubs-")); try { await test(directory); } finally { rmSync(directory, { recursive: true, force: true }); } }

describe("usage hub responses", () => {
	it("reads Codex wham/usage windows, lengths, reset times and plan", () => {
		expect(codexHubUsage({ plan_type: "pro", rate_limit: { primary_window: { used_percent: 12.5, reset_at: 1_800_000_000, limit_window_seconds: 18_000 }, secondary_window: { used_percent: 140, reset_at: null } } })).toEqual({
			plan: "ChatGPT Pro", usage: [{ id: "codex", name: "Codex", spendControlReached: null, primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 1_800_000_000 }, secondary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: null } }],
		});
		expect(codexHubUsage({}, "plus")).toMatchObject({ plan: "ChatGPT Plus", usage: [{ primary: null, secondary: null }] });
	});
	it("reads Claude oauth/usage windows, per-model limits and extra usage", () => {
		const result = claudeHubUsage({ five_hour: { utilization: 10, resets_at: "2026-10-15T12:00:00Z" }, seven_day: { utilization: 50, resets_at: null }, limits: [{ kind: "weekly_scoped", percent: 30, scope: { model: { display_name: "Opus" } } }, { kind: "other", percent: 1 }], extra_usage: { is_enabled: true, monthly_limit: 50, used_credits: 12.5 } });
		expect(result.usage).toEqual([
			{ id: "claude", name: "Claude", spendControlReached: null, primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: Date.parse("2026-10-15T12:00:00Z") / 1000 }, secondary: { usedPercent: 50, windowDurationMins: 10080, resetsAt: null } },
			{ id: "claude:Opus", name: "Opus weekly", spendControlReached: null, primary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: null }, secondary: null },
		]);
		expect(result.extraUsage).toEqual({ enabled: true, used: 12.5, limit: 50 });
		// Accounts that only list their windows in limits[]: the session window stands in for five_hour.
		expect(claudeHubUsage({ five_hour: null, seven_day: null, limits: [{ kind: "session", group: "session", percent: 7, resets_at: "2026-10-15T18:00:00Z", scope: null }, { kind: "weekly_scoped", group: "weekly", percent: 0, scope: { model: { display_name: "Fable" } } }] }).usage?.map(bucket => [bucket.name, bucket.primary?.usedPercent, bucket.secondary])).toEqual([["Claude", 7, null], ["Fable weekly", 0, null]]);
	});
	it("names Claude plans from the OAuth profile: Team seats by tier, Max by multiplier", () => {
		const profile = (organization: Record<string, unknown>) => claudeProfilePlan({ organization });
		expect(profile({ organization_type: "claude_team", seat_tier: "team_tier_1", rate_limit_tier: "default_claude_max_5x" })).toBe("Team premium 5x");
		expect(profile({ organization_type: "claude_team", seat_tier: "team_standard", rate_limit_tier: "default_raven" })).toBe("Team standard");
		expect(profile({ organization_type: "claude_max", rate_limit_tier: "default_claude_max_20x" })).toBe("Claude Max 20x");
		expect(profile({ organization_type: "claude_pro" })).toBe("Claude Pro");
		expect(claudeProfilePlan({})).toBeUndefined();
	});
});

describe("UsageHubs", () => {
	it("checks the key before saving a hub, and keeps the key out of the hub list", async () => withDirectory(async directory => {
		const { secrets, vault } = store(), { fetcher } = hubFixture();
		const hubs = new UsageHubs(usageHubFile(directory), vault, fetcher, none);
		await expect(hubs.request({ type: "add", url: "127.0.0.1:8317", key: "wrong" })).rejects.toThrow("rejected the management key");
		expect(await hubs.request({ type: "list" })).toEqual([]);
		const [hub] = await hubs.request({ type: "add", url: "http://127.0.0.1:8317/some/path", key: "secret", label: "Home hub" }) as UsageHub[];
		expect(hub).toMatchObject({ label: "Home hub", url: "http://127.0.0.1:8317" });
		expect(secrets.get(hub.id)).toBe("secret");
		expect(JSON.stringify(await new UsageHubs(usageHubFile(directory), vault, fetcher, none).request({ type: "list" }))).not.toContain("secret");
		await expect(hubs.request({ type: "add", url: "ftp://hub", key: "secret" })).rejects.toThrow("http or https");
		await hubs.request({ type: "remove", id: hub.id });
		expect(secrets.has(hub.id)).toBe(false);
	}));
	it("reads Codex and Claude accounts through api-call, skipping others and reporting failures per account", async () => withDirectory(async directory => {
		const files = [
			{ id: "codex.json", auth_index: "1", provider: "codex", email: "a@example.invalid", id_token: { chatgpt_account_id: "acct", plan_type: "plus" } },
			{ id: "claude.json", auth_index: "2", provider: "claude", email: "b@example.invalid" },
			{ id: "broken.json", auth_index: "3", provider: "claude" },
			{ id: "gemini.json", auth_index: "4", provider: "gemini" },
			{ id: "off.json", auth_index: "5", provider: "codex", disabled: true },
		];
		const { vault } = store();
		const { fetcher, calls } = hubFixture({ files, upstream: (url, authIndex) => authIndex === "3" ? { status_code: 401, body: "{}" } : url.includes("chatgpt") ? { status_code: 200, body: JSON.stringify({ rate_limit: { primary_window: { used_percent: 40, limit_window_seconds: 18_000 } } }) } : url.endsWith("/profile") ? { status_code: 200, body: JSON.stringify({ organization: { organization_type: "claude_max", rate_limit_tier: "default_claude_max_5x" } }) } : { status_code: 200, body: JSON.stringify({ five_hour: { utilization: 20, resets_at: null } }) } });
		const hubs = new UsageHubs(usageHubFile(directory), vault, fetcher, none);
		const [hub] = await hubs.request({ type: "add", url: "http://hub.local:8317", key: "secret" }) as UsageHub[];
		const snapshot = await hubs.request({ type: "check", id: hub.id }) as UsageHubSnapshot;
		expect(snapshot.skipped).toBe(1);
		expect(snapshot.accounts.map(account => [account.id, account.provider, account.email])).toEqual([["codex.json", "codex", "a@example.invalid"], ["claude.json", "claude", "b@example.invalid"], ["broken.json", "claude", undefined]]);
		expect(snapshot.accounts[0].status).toMatchObject({ plan: "ChatGPT Plus", identity: "a@example.invalid", usage: [{ primary: { usedPercent: 40, windowDurationMins: 300 } }] });
		expect(snapshot.accounts[1].status).toMatchObject({ plan: "Claude Max 5x", usage: [{ primary: { usedPercent: 20 } }] });
		expect(snapshot.accounts[2].status.usageError).toBe("The provider refused the hub's request (HTTP 401).");
		const codexCall = calls.find(call => call.url.endsWith("api-call") && (call.body as { auth_index: string }).auth_index === "1")!.body as { header: Record<string, string>; method: string };
		expect(codexCall).toMatchObject({ method: "GET", header: { Authorization: "Bearer $TOKEN$", "Chatgpt-Account-Id": "acct", "OpenAI-Beta": "codex-1" } });
		expect(calls.every(call => call.authorization === "Bearer secret" || call.url.endsWith("auth-files"))).toBe(true);
	}));
	it("reports a hub it can't reach without failing the check", async () => withDirectory(async directory => {
		const { vault } = store(), reachable = hubFixture();
		const [hub] = await new UsageHubs(usageHubFile(directory), vault, reachable.fetcher, none).request({ type: "add", url: "http://hub.local:8317", key: "secret" }) as UsageHub[];
		const snapshot = await new UsageHubs(usageHubFile(directory), vault, hubFixture({ down: true }).fetcher, none).request({ type: "check", id: hub.id }) as UsageHubSnapshot;
		expect(snapshot).toMatchObject({ accounts: [], error: "Couldn't reach the hub at http://hub.local:8317." });
	}));
});

describe("T3 Code hubs", () => {
	it("reads enabled CLIProxyAPI sources and their keys from T3 Code, skipping the rest", async () => withDirectory(async directory => {
		mkdirSync(path.join(directory, "secrets"));
		writeFileSync(path.join(directory, "settings.json"), JSON.stringify({ usageLimitSources: {
			"claude-pool-hub": { kind: "cliproxy", label: "Claude", url: "http://127.0.0.1:8317/", enabled: true, managementKey: "••••••" },
			"off-hub": { kind: "cliproxy", url: "http://10.0.0.2:8317", enabled: false },
			"no-key": { kind: "cliproxy", url: "http://10.0.0.3:8317" },
			"other": { kind: "something-else", url: "http://10.0.0.4" },
		} }));
		const secret = (id: string, value: string) => writeFileSync(path.join(directory, "secrets", `usage-limit-source-${Buffer.from(id).toString("base64url")}.bin`), value);
		secret("claude-pool-hub", "secret\n"); secret("off-hub", "x");
		expect(t3CodeHubs(directory)).toEqual([{ label: "Claude", url: "http://127.0.0.1:8317", key: "secret" }]);
		expect(t3CodeHubs(path.join(directory, "missing"))).toEqual([]);
		const { vault, secrets } = store(), { fetcher } = hubFixture();
		const hubs = new UsageHubs(usageHubFile(directory), vault, fetcher, () => t3CodeHubs(directory));
		expect(await hubs.request({ type: "t3-hubs" })).toEqual([{ label: "Claude", url: "http://127.0.0.1:8317" }]);
		const [hub] = await hubs.request({ type: "import-t3" }) as UsageHub[];
		expect(hub).toMatchObject({ label: "Claude", url: "http://127.0.0.1:8317" }); expect(secrets.get(hub.id)).toBe("secret");
		expect(await hubs.request({ type: "t3-hubs" })).toEqual([]);
	}));
	it("connects T3 Code's hubs on its own once, but not one removed here or one that refuses its key", async () => withDirectory(async directory => {
		const { vault, secrets } = store(), { fetcher, calls } = hubFixture();
		const t3 = vi.fn(() => [{ label: "Claude", url: "http://127.0.0.1:8317", key: "secret" }, { label: "Old", url: "http://10.0.0.9:8317", key: "wrong" }]);
		const hubs = new UsageHubs(usageHubFile(directory), vault, fetcher, t3);
		const [listed] = await Promise.all([hubs.request({ type: "list" }), hubs.request({ type: "list" })]);
		expect((listed as UsageHub[]).map(hub => hub.url)).toEqual(["http://127.0.0.1:8317"]);
		expect(secrets.size).toBe(1);
		await hubs.request({ type: "list" });
		expect(t3).toHaveBeenCalledTimes(1);
		expect(calls.filter(call => call.authorization === "Bearer wrong")).toHaveLength(1);
		await hubs.request({ type: "remove", id: (listed as UsageHub[])[0].id });
		expect(await new UsageHubs(usageHubFile(directory), vault, fetcher, t3).request({ type: "list" })).toEqual([]);
		// Importing on purpose brings it back.
		expect((await new UsageHubs(usageHubFile(directory), vault, fetcher, () => t3().slice(0, 1)).request({ type: "import-t3" }) as UsageHub[]).map(hub => hub.url)).toEqual(["http://127.0.0.1:8317"]);
	}));
});
