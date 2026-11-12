import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ store: new Map<string, string>(), puts: [] as Array<{ key: string; value: string; ttl?: number }> }));

vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => ({ GATEWAY_CREDIT_WRITEBACK_ENABLED: "true" }),
	getCache: () => ({
		get: vi.fn(async (key: string) => state.store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
			state.store.set(key, value);
			state.puts.push({ key, value, ttl: options?.expirationTtl });
		}),
		delete: vi.fn(async (key: string) => { state.store.delete(key); }),
	}),
}));

import {
	__resetCreditWriteBackForTests,
	gatewayCreditCacheKey,
	writeBackGatewayCreditCache,
} from "./gateway-credit-cache";

const ws = "workspace_1";
const key = gatewayCreditCacheKey(ws);

function seedSnapshot(balanceNanos = 20_000_000_000) {
	state.store.set(key, JSON.stringify({
		workspaceId: ws,
		credit: { ok: true, reason: null, resetAt: null, balanceNanos },
		teamEnrichment: { tier: "basic", balance_nanos: balanceNanos, balance_usd: balanceNanos / 1e9, balance_is_low: false },
	}));
}

describe("writeBackGatewayCreditCache", () => {
	beforeEach(() => {
		__resetCreditWriteBackForTests();
		state.store.clear();
		state.puts.length = 0;
		vi.useRealTimers();
	});

	it("replaces the cached balance with the post-charge balance", async () => {
		seedSnapshot();
		expect(await writeBackGatewayCreditCache(ws, 5_000_000_000)).toBe("written");
		const written = JSON.parse(state.store.get(key)!);
		expect(written.credit.balanceNanos).toBe(5_000_000_000);
		expect(written.teamEnrichment).toMatchObject({ tier: "basic", balance_nanos: 5_000_000_000, balance_usd: 5 });
		expect(state.puts[0].ttl).toBe(60);
	});

	it("invalidates near zero so admission re-reads the wallet exactly", async () => {
		seedSnapshot();
		expect(await writeBackGatewayCreditCache(ws, 500_000_000)).toBe("invalidated");
		expect(state.store.has(key)).toBe(false);
	});

	it("invalidates when no snapshot is cached rather than inventing one", async () => {
		expect(await writeBackGatewayCreditCache(ws, 5_000_000_000)).toBe("invalidated");
		expect(state.puts).toHaveLength(0);
	});

	it("never raises the cached balance, so out-of-order charges cannot overstate credit", async () => {
		seedSnapshot(4_000_000_000);
		expect(await writeBackGatewayCreditCache(ws, 6_000_000_000)).toBe("invalidated");
		expect(state.store.has(key)).toBe(false);
		expect(state.puts).toHaveLength(0);
	});

	it("throttles writes to one per key every two seconds and invalidates in between", async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		seedSnapshot();
		expect(await writeBackGatewayCreditCache(ws, 9_000_000_000)).toBe("written");
		seedSnapshot();
		expect(await writeBackGatewayCreditCache(ws, 8_000_000_000)).toBe("invalidated");
		vi.setSystemTime(1_002_500);
		seedSnapshot();
		expect(await writeBackGatewayCreditCache(ws, 7_000_000_000)).toBe("written");
	});
});
