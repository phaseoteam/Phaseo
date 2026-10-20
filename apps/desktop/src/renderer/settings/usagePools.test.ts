import { describe, expect, it } from "vitest";
import { accountHue, initials, uniqueAccounts, usagePools, usageRings, type UsageAccount } from "./usagePools";

const account = (key: string, provider: UsageAccount["provider"], email: string | undefined, usage: NonNullable<UsageAccount["status"]["usage"]>, source = "Hub"): UsageAccount =>
	({ key, provider, email, label: email ?? key, source, status: { checkedAt: "2026-10-15T12:00:00Z", authenticated: true, usage } });
const window = (usedPercent: number, windowDurationMins: number, resetsAt: number | null = null) => ({ usedPercent, windowDurationMins, resetsAt });

describe("usage pools", () => {
	it("pools each provider's windows by kind, averaging what is left and finding the next refill", () => {
		const pools = usagePools([
			account("a", "claude", "a@x.io", [{ id: "claude", name: "Claude", primary: window(20, 300, 2000), secondary: null, spendControlReached: null }, { id: "claude:Fable", name: "Fable weekly", primary: window(0, 10080), secondary: null, spendControlReached: null }]),
			account("b", "claude", "b@x.io", [{ id: "claude", name: "Claude", primary: window(60, 300, 1000), secondary: window(50, 10080), spendControlReached: null }]),
			account("c", "codex", "c@x.io", [{ id: "codex", name: "Codex", primary: window(3, 10080, 5000), secondary: null, spendControlReached: null }]),
		]);
		expect(pools.map(pool => pool.provider)).toEqual(["codex", "claude"]);
		const claude = pools[1].windows;
		expect(claude.map(pool => [pool.label, pool.remaining, pool.columns.length])).toEqual([["5-hour", 60, 2], ["Weekly", 50, 1], ["Fable weekly", 100, 1]]);
		expect(claude[0].nextRefill).toEqual({ at: 1000, restores: 30 });
		expect(claude[2].nextRefill).toBeUndefined();
		expect(pools[0].windows).toMatchObject([{ label: "Weekly", remaining: 97 }]);
	});
	it("counts an account seen locally and through a hub once", () => {
		const local = account("local", "codex", "Me@x.io", [], "This computer"), hub = account("hub", "codex", "me@x.io", []), other = account("other", "codex", undefined, []);
		expect(uniqueAccounts([local, hub, other]).map(value => value.key)).toEqual(["local", "other"]);
	});
	it("makes initials and a stable colour per account", () => {
		expect(initials("daniel@gmail.com")).toBe("DG"); expect(initials("work")).toBe("WO");
		expect(accountHue("a@x.io")).toBe(accountHue("A@X.IO"));
	});
	it("gives each provider a 5-hour ring inside a weekly one, counting a window that has since reset as full", () => {
		const now = 3_000_000;
		const rings = usageRings(usagePools([
			account("a", "claude", "a@x.io", [{ id: "claude", name: "Claude", primary: window(40, 300, 2000), secondary: window(70, 10080, 9000), spendControlReached: null }]),
			account("b", "claude", "b@x.io", [{ id: "claude", name: "Claude", primary: window(80, 300, 4000), secondary: window(30, 10080, 8000), spendControlReached: null }]),
			account("c", "codex", "c@x.io", [{ id: "codex", name: "Codex", primary: window(3, 10080, 5000), secondary: null, spendControlReached: null }]),
		]), now);
		// Account a's 5-hour window reset at 2,000 s, before now (3,000 s), so it counts as 100% left.
		expect(rings.map(({ provider, inner, outer, segments }) => ({ provider, inner, outer, segments }))).toEqual([
			{ provider: "codex", inner: null, outer: { label: "Weekly", remaining: 97, resetsAt: 5000 }, segments: undefined },
			// Two Claude accounts: the weekly ring has one arc per account.
			{ provider: "claude", inner: { label: "5-hour", remaining: 60, resetsAt: 4000 }, outer: { label: "Weekly", remaining: 50, resetsAt: 8000 }, segments: [30, 70] },
		]);
		expect(rings[1].accounts.map(({ account, inner, outer }) => [account.key, inner?.remaining, outer?.remaining])).toEqual([["a", 100, 30], ["b", 20, 70]]);
	});
	it("pools the weekly ring instead of splitting it when a provider has more than six accounts", () => {
		const many = Array.from({ length: 7 }, (_, index) => account(`h${index}`, "claude", `h${index}@x.io`, [{ id: "claude", name: "Claude", primary: null, secondary: window(index * 10, 10080), spendControlReached: null }]));
		const [claude] = usageRings(usagePools(many), 0);
		expect(claude.segments).toBeUndefined();
		expect(claude.outer?.remaining).toBe(70);
		expect(claude.accounts).toHaveLength(7);
	});
});
