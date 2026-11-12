import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	store: new Map<string, string>(),
	puts: [] as Array<{ key: string; value: string; options?: { expirationTtl?: number } }>,
	deletes: [] as string[],
	failGet: false,
	failPut: false,
	bindings: {} as Record<string, unknown>,
	rpc: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getCache: () => ({
		get: async (key: string) => {
			if (mocks.failGet) throw new Error("kv unavailable");
			return mocks.store.get(key) ?? null;
		},
		put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
			if (mocks.failPut) throw new Error("kv write failed");
			mocks.puts.push({ key, value, options });
			mocks.store.set(key, value);
		},
		delete: async (key: string) => { mocks.deletes.push(key); mocks.store.delete(key); },
		list: async ({ prefix }: { prefix: string }) => ({
			keys: [...mocks.store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
			list_complete: true,
		}),
	}),
	getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
	getBindingsIfConfigured: () => mocks.bindings,
}));

import { __resetTieredCacheForTests } from "./tiered-cache";
import {
	applySpendRuleBlocks,
	findSpendBlock,
	findSpendWarnings,
	isSpendBlockEntry,
	publishSpendBlockEntry,
	readSpendBlockEntry,
	reconcileSpendBlockEntries,
	rejectedBySpendBlockForEveryModel,
	spendBlockEntryExpirationS,
	spendBlockedResponse,
	spendBlocksKey,
	spendSubjectFor,
	withSpendWarningHeader,
	SPEND_WARNING_HEADER,
	type SpendBlockEntry,
	type SpendBlockItem,
	type SpendSubject,
	type SpendWarningItem,
} from "./spend-blocks";
import type { PipelineContext } from "@pipeline/before/types";
import type { PriceCard } from "@pipeline/pricing";

const WS = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const OTHER_KEY = "22222222-2222-4222-8222-333333333333";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "33333333-3333-4333-8333-444444444444";
const DEPT = "44444444-4444-4444-8444-444444444444";
const RESET = "2099-11-01T00:00:00.000Z";

function block(overrides: Partial<SpendBlockItem> = {}): SpendBlockItem {
	return {
		id: "55555555-5555-4555-8555-555555555555", rule_id: "66666666-6666-4666-8666-666666666666", rule_name: "Hard cap",
		scope_type: "workspace", scope_id: null, resets_at: RESET, block_free_models: false, limit_nanos: 110e9, ...overrides,
	};
}

function warning(overrides: Partial<SpendWarningItem> = {}): SpendWarningItem {
	return {
		rule_id: "77777777-7777-4777-8777-777777777777", rule_name: "Soft cap", scope_type: "workspace", scope_id: null,
		resets_at: RESET, block_free_models: false, ...overrides,
	};
}

function entry(overrides: Partial<SpendBlockEntry> = {}): SpendBlockEntry {
	return { v: 1, workspace_id: WS, generated_at: "2026-10-21T00:00:00Z", expires_at: RESET, blocks: [], warnings: [], departments: {}, ...overrides };
}

function subject(overrides: Partial<SpendSubject> = {}): SpendSubject {
	return { keyId: KEY, actorUserId: USER, models: ["openai/gpt-5"], provider: "openai", free: false, ...overrides };
}

const PAID: PriceCard = { provider: "openai", rules: [{ price_per_unit: "0.000001" }] } as unknown as PriceCard;
const FREE: PriceCard = { provider: "openai", rules: [{ price_per_unit: "0" }] } as unknown as PriceCard;

let sequence = 0;
function ctx(overrides: Partial<PipelineContext> & { authMethod?: "api_key" | "oauth"; apiKeyRef?: string } = {}): PipelineContext {
	const { authMethod = "api_key", apiKeyRef = "kid_key", ...rest } = overrides;
	return {
		workspaceId: WS, keyId: KEY, quotaUserId: USER, model: "openai/gpt-5", internal: false,
		requestId: `request-${++sequence}`, meta: { authMethod, apiKeyRef },
		...rest,
	} as unknown as PipelineContext;
}

function publish(value: SpendBlockEntry) {
	mocks.store.set(spendBlocksKey(WS), JSON.stringify({ v: value, at: Date.now() }));
}

beforeEach(() => {
	__resetTieredCacheForTests();
	mocks.store.clear();
	mocks.puts.length = 0;
	mocks.deletes.length = 0;
	mocks.failGet = mocks.failPut = false;
	mocks.rpc.mockReset();
	mocks.bindings = { SPEND_RULE_BLOCKS_ENABLED: "true" };
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("matching", () => {
	it("matches every scope", () => {
		const cases: Array<[SpendBlockItem, Partial<SpendSubject>, boolean]> = [
			[block(), {}, true],
			[block({ scope_type: "key", scope_id: KEY }), {}, true],
			[block({ scope_type: "key", scope_id: KEY.toUpperCase() }), {}, true],
			[block({ scope_type: "key", scope_id: OTHER_KEY }), {}, false],
			[block({ scope_type: "key", scope_id: KEY }), { keyId: null }, false],
			[block({ scope_type: "member", scope_id: USER }), {}, true],
			[block({ scope_type: "member", scope_id: OTHER_USER }), {}, false],
			[block({ scope_type: "member", scope_id: USER }), { actorUserId: null }, false],
			[block({ scope_type: "model", scope_id: "openai/gpt-5" }), {}, true],
			[block({ scope_type: "model", scope_id: "openai/gpt-5" }), { models: ["openai/gpt-5-mini", "openai/gpt-5"] }, true],
			[block({ scope_type: "model", scope_id: "anthropic/claude" }), {}, false],
			[block({ scope_type: "provider", scope_id: "openai" }), {}, true],
			[block({ scope_type: "provider", scope_id: "openai" }), { provider: "azure" }, false],
			[block({ scope_type: "provider", scope_id: "openai" }), { provider: null }, false],
		];
		for (const [item, overrides, expected] of cases) {
			expect(findSpendBlock(entry({ blocks: [item] }), subject(overrides)) !== null, `${item.scope_type}:${item.scope_id} ${JSON.stringify(overrides)}`).toBe(expected);
		}
	});

	it("matches department scopes from the published membership, without Postgres", () => {
		const value = entry({
			blocks: [block({ scope_type: "department", scope_id: DEPT })],
			departments: { [DEPT]: { keys: [OTHER_KEY], users: [USER], exclude_keys: ["88888888-8888-4888-8888-888888888888"] } },
		});
		// A member of the department, with a key that has no department of its own.
		expect(findSpendBlock(value, subject())).not.toBeNull();
		// The member's own OAuth requests (no key).
		expect(findSpendBlock(value, subject({ keyId: null }))).not.toBeNull();
		// A key assigned to the department counts whoever made it.
		expect(findSpendBlock(value, subject({ keyId: OTHER_KEY, actorUserId: OTHER_USER }))).not.toBeNull();
		// The member's key that belongs to another department does not.
		expect(findSpendBlock(value, subject({ keyId: "88888888-8888-4888-8888-888888888888" }))).toBeNull();
		// Someone outside the department.
		expect(findSpendBlock(value, subject({ actorUserId: OTHER_USER }))).toBeNull();
		// No membership published: never blocks.
		expect(findSpendBlock(entry({ blocks: [block({ scope_type: "department", scope_id: DEPT })] }), subject())).toBeNull();
	});

	it("exempts free routes unless the rule blocks free models", () => {
		expect(findSpendBlock(entry({ blocks: [block()] }), subject({ free: true }))).toBeNull();
		expect(findSpendBlock(entry({ blocks: [block({ block_free_models: true })] }), subject({ free: true }))).not.toBeNull();
		expect(findSpendWarnings(entry({ warnings: [warning()] }), subject({ free: true }))).toEqual([]);
	});

	it("ignores blocks past their reset", () => {
		const value = entry({ blocks: [block({ resets_at: "2026-01-01T00:00:00Z" })] });
		expect(findSpendBlock(value, subject(), Date.parse("2026-02-01T00:00:00Z"))).toBeNull();
		expect(findSpendBlock(value, subject(), Date.parse("2025-12-31T00:00:00Z"))).not.toBeNull();
		expect(findSpendBlock(entry({ blocks: [block({ resets_at: null })] }), subject())).not.toBeNull();
	});

	it("validates entries", () => {
		expect(isSpendBlockEntry(entry({ blocks: [block()], warnings: [warning()] }))).toBe(true);
		expect(isSpendBlockEntry({ ...entry(), v: 2 })).toBe(false);
		expect(isSpendBlockEntry(entry({ blocks: [{ ...block(), scope_type: "planet" as never }] }))).toBe(false);
		expect(isSpendBlockEntry(entry({ blocks: [block({ scope_type: "workspace", scope_id: "x" })] }))).toBe(false);
		expect(isSpendBlockEntry(entry({ departments: { [DEPT]: { keys: [1], users: [], exclude_keys: [] } as never } }))).toBe(false);
	});
});

describe("request subject", () => {
	it("uses the key for API keys and the actor for members, never an OAuth client id", () => {
		expect(spendSubjectFor(ctx(), "openai/gpt-5-base")).toEqual({ keyId: KEY, actorUserId: USER, models: ["openai/gpt-5", "openai/gpt-5-base"] });
		expect(spendSubjectFor(ctx({ authMethod: "oauth", apiKeyRef: "oauth_client-id", keyId: "client-id" } as never))).toEqual({ keyId: null, actorUserId: USER, models: ["openai/gpt-5"] });
		// A delegated OAuth key is attributed to its app but is still a key, so key rules apply.
		expect(spendSubjectFor(ctx({ authMethod: "oauth", apiKeyRef: "kid_delegated" }))).toEqual({ keyId: KEY, actorUserId: USER, models: ["openai/gpt-5"] });
	});
});

describe("the 429", () => {
	it("has the budget and key-limit shape, with Retry-After at the reset", async () => {
		const now = Date.parse("2099-10-31T23:00:00Z");
		const response = spendBlockedResponse({ requestId: "req-1", workspaceId: WS }, block({ scope_type: "key", scope_id: KEY }), now);
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("3600");
		const body = await response.json() as Record<string, any>;
		expect(body.error).toMatchObject({ code: "spend_rule_blocked", type: "rate_limit_error" });
		expect(body).toMatchObject({
			reason: "spend_rule_block",
			rule_id: block().rule_id,
			rule_name: "Hard cap",
			block_id: block().id,
			limit_scope: "key",
			limit_metric: "cost",
			limit_value: 110,
			reset_at: RESET,
			now: "2099-10-31T23:00:00.000Z",
			status_code: 429,
			error_origin: "user",
			request_id: "req-1",
		});
		expect(body.description).toContain("Hard cap");
		expect(body.description).toContain("Free models still work");
	});

	it("omits Retry-After when the block has no reset", () => {
		expect(spendBlockedResponse({ requestId: "r", workspaceId: WS }, block({ resets_at: null })).headers.get("Retry-After")).toBeNull();
	});
});

describe("applySpendRuleBlocks", () => {
	const candidates = () => [
		{ providerId: "openai", pricingCard: PAID },
		{ providerId: "azure", pricingCard: PAID },
	];

	it("refuses a request a workspace block covers, once per request context", async () => {
		publish(entry({ blocks: [block()] }));
		const context = ctx();
		const result = await applySpendRuleBlocks(context, candidates());
		expect(result.response?.status).toBe(429);
		expect(rejectedBySpendBlockForEveryModel(context)).toBe(true);
		// A model fallback in the same request context reuses the read.
		mocks.store.clear();
		__resetTieredCacheForTests();
		expect((await applySpendRuleBlocks(context, candidates())).response?.status).toBe(429);
	});

	it("drops only a blocked provider's routes, and refuses when none is left", async () => {
		publish(entry({ blocks: [block({ scope_type: "provider", scope_id: "openai" })] }));
		const context = ctx();
		const result = await applySpendRuleBlocks(context, candidates());
		expect(result.candidates?.map((candidate) => candidate.providerId)).toEqual(["azure"]);
		expect(context.routingDiagnostics?.spendRuleBlocks).toEqual({ excluded: [{ provider: "openai", rule_id: block().rule_id }] });
		const only = ctx();
		expect((await applySpendRuleBlocks(only, [{ providerId: "openai", pricingCard: PAID }])).response?.status).toBe(429);
		expect(rejectedBySpendBlockForEveryModel(only)).toBe(false);
	});

	it("keeps free routes unless the rule blocks free models", async () => {
		publish(entry({ blocks: [block()] }));
		const result = await applySpendRuleBlocks(ctx(), [{ providerId: "openai", pricingCard: FREE }, { providerId: "azure", pricingCard: PAID }]);
		expect(result.candidates?.map((candidate) => candidate.providerId)).toEqual(["openai"]);
		__resetTieredCacheForTests();
		publish(entry({ blocks: [block({ block_free_models: true })] }));
		expect((await applySpendRuleBlocks(ctx(), [{ providerId: "openai", pricingCard: FREE }])).response?.status).toBe(429);
	});

	it("adds the warning header when a warning covers every remaining route", async () => {
		publish(entry({ warnings: [warning(), warning({ rule_id: "99999999-9999-4999-8999-999999999999", scope_type: "provider", scope_id: "openai" })] }));
		const context = ctx();
		const result = await applySpendRuleBlocks(context, candidates());
		expect(result.candidates).toHaveLength(2);
		const response = withSpendWarningHeader(new Response("ok"), context);
		// The provider warning does not cover the azure route, so only the workspace warning applies.
		expect(response.headers.get(SPEND_WARNING_HEADER)).toBe(`rule_id=${warning().rule_id}; scope=workspace; resets_at=${RESET}`);
		expect(withSpendWarningHeader(new Response("ok"), ctx()).headers.get(SPEND_WARNING_HEADER)).toBeNull();
	});

	it("copies immutable headers to add the warning", async () => {
		publish(entry({ warnings: [warning()] }));
		const context = ctx();
		await applySpendRuleBlocks(context, candidates());
		const immutable = Response.redirect("https://example.com", 302);
		const response = withSpendWarningHeader(immutable, context);
		expect(response.headers.get(SPEND_WARNING_HEADER)).toContain("scope=workspace");
		expect(response.status).toBe(302);
	});

	it("does nothing while SPEND_RULE_BLOCKS_ENABLED is off", async () => {
		mocks.bindings = { SPEND_RULE_BLOCKS_ENABLED: "false" };
		publish(entry({ blocks: [block()], warnings: [warning()] }));
		const context = ctx();
		const result = await applySpendRuleBlocks(context, candidates());
		expect(result.candidates).toHaveLength(2);
		expect(withSpendWarningHeader(new Response("ok"), context).headers.get(SPEND_WARNING_HEADER)).toBeNull();
		mocks.bindings = {};
		expect((await applySpendRuleBlocks(ctx(), candidates())).candidates).toHaveLength(2);
	});

	it("fails open when KV errors", async () => {
		mocks.failGet = true;
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await applySpendRuleBlocks(ctx(), candidates());
		expect(result.candidates).toHaveLength(2);
		expect(await readSpendBlockEntry(WS)).toBeNull();
		warn.mockRestore();
	});

	it("fails open on a malformed entry", async () => {
		mocks.store.set(spendBlocksKey(WS), JSON.stringify({ v: { v: 1, blocks: "nope" }, at: Date.now() }));
		expect((await applySpendRuleBlocks(ctx(), candidates())).candidates).toHaveLength(2);
	});

	it("skips internal requests and classifier subrequests", async () => {
		publish(entry({ blocks: [block()] }));
		expect((await applySpendRuleBlocks(ctx({ internal: true }), candidates())).candidates).toHaveLength(2);
		expect((await applySpendRuleBlocks(ctx({ classifierSubrequest: true } as never), candidates())).candidates).toHaveLength(2);
	});
});

describe("publishing", () => {
	it("writes the entry with an expiry no later than the earliest reset", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2099-10-31T22:00:00Z"));
		const value = entry({ blocks: [block()] });
		mocks.rpc.mockResolvedValue({ data: value, error: null });
		expect(await publishSpendBlockEntry(WS)).toBe(true);
		expect(mocks.puts).toHaveLength(1);
		expect(mocks.puts[0].key).toBe(spendBlocksKey(WS));
		expect(JSON.parse(mocks.puts[0].value).v).toEqual(value);
		expect(mocks.puts[0].options?.expirationTtl).toBe(2 * 3600);
		expect(mocks.rpc).toHaveBeenCalledWith("get_workspace_spend_block_entry", { p_workspace_id: WS });
		// The stored entry is current: no second write.
		await publishSpendBlockEntry(WS);
		expect(mocks.puts).toHaveLength(1);
		// The request path reads what was published.
		__resetTieredCacheForTests();
		expect(await readSpendBlockEntry(WS)).toEqual(value);
	});

	it("deletes the entry when nothing is active", async () => {
		publish(entry({ blocks: [block()] }));
		mocks.rpc.mockResolvedValue({ data: null, error: null });
		expect(await publishSpendBlockEntry(WS)).toBe(true);
		expect(mocks.deletes).toEqual([spendBlocksKey(WS)]);
		expect(mocks.store.has(spendBlocksKey(WS))).toBe(false);
	});

	it("stores the newest state when the database changes during a publish", async () => {
		const first = entry({ blocks: [block()] });
		const second = entry({ blocks: [block(), block({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", rule_id: null })] });
		mocks.rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValue({ data: second, error: null });
		await publishSpendBlockEntry(WS);
		expect(JSON.parse(mocks.store.get(spendBlocksKey(WS))!).v).toEqual(second);
	});

	it("never throws, and does nothing while the flag is off", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
		expect(await publishSpendBlockEntry(WS)).toBe(false);
		mocks.rpc.mockResolvedValue({ data: entry(), error: null });
		mocks.failPut = true;
		expect(await publishSpendBlockEntry(WS)).toBe(false);
		error.mockRestore();
		mocks.bindings = { SPEND_RULE_BLOCKS_ENABLED: "false" };
		mocks.rpc.mockClear();
		expect(await publishSpendBlockEntry(WS)).toBe(false);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it("computes the KV expiry", () => {
		const now = Date.parse("2099-10-31T23:59:30Z");
		expect(spendBlockEntryExpirationS(entry(), now)).toBe(60); // KV's minimum
		expect(spendBlockEntryExpirationS(entry({ expires_at: null }), now)).toBeUndefined();
		expect(spendBlockEntryExpirationS(entry(), Date.parse("2099-10-31T00:00:00Z"))).toBe(86400);
	});
});

describe("reconcile", () => {
	it("republishes workspaces with block rules or blocks, and deletes stale keys", async () => {
		const stale = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		mocks.store.set(spendBlocksKey(stale), JSON.stringify({ v: entry({ workspace_id: stale, blocks: [block()] }), at: 0 }));
		const value = entry({ blocks: [block()] });
		mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
			if (name === "list_spend_block_workspaces") return { data: [WS], error: null };
			return { data: args.p_workspace_id === WS ? value : null, error: null };
		});
		const summary = await reconcileSpendBlockEntries();
		expect(summary).toEqual({ workspaces: 2, published: 2, failed: 0, truncated: false });
		expect(JSON.parse(mocks.store.get(spendBlocksKey(WS))!).v).toEqual(value);
		expect(mocks.store.has(spendBlocksKey(stale))).toBe(false);
	});

	it("does nothing while the flag is off", async () => {
		mocks.bindings = {};
		expect(await reconcileSpendBlockEntries()).toEqual({ workspaces: 0, published: 0, failed: 0, truncated: false });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
