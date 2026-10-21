import { describe, expect, it } from "vitest";
import { accountHue, initials, rankRings, tierTag, uniqueAccounts, usagePools, usageRings, sidebarRings, type ProviderRings, type UsageAccount } from "./usagePools";

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
		const limits = [{ id: "claude", name: "Claude", primary: window(10, 300), secondary: null, spendControlReached: null }];
		// A Console sign-in on this computer has no limits, so the hub's reading of the same email is kept.
		expect(uniqueAccounts([account("console", "claude", "me@x.io", [], "This computer"), account("pool", "claude", "ME@x.io", limits)]).map(value => value.key)).toEqual(["pool"]);
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
	it("draws a plan with only a 5-hour window as the outer ring, split per account", () => {
		const [claude] = usageRings(usagePools([
			account("a", "claude", "a@x.io", [{ id: "claude", name: "Claude", primary: window(10, 300, 9000), secondary: null, spendControlReached: null }]),
			account("b", "claude", "b@x.io", [{ id: "claude", name: "Claude", primary: window(50, 300, 8000), secondary: null, spendControlReached: null }]),
		]), 0);
		expect(claude).toMatchObject({ inner: null, outer: { label: "5-hour", remaining: 70, resetsAt: 8000 }, segments: [90, 50] });
		expect(claude.accounts.map(({ account, inner, outer }) => [account.key, inner, outer?.remaining])).toEqual([["a", null, 90], ["b", null, 50]]);
	});
	it("gives each plan its own pair, with the Fable weekly limit outside when there's no plan-wide weekly one", () => {
		const fiveHour = (used: number) => ({ id: "claude", name: "Claude", primary: window(used, 300, 9000), secondary: null, spendControlReached: null });
		const fable = (used: number) => ({ id: "claude:Fable", name: "Fable weekly", primary: window(used, 10080, 9500), secondary: null, spendControlReached: null });
		const seat = (key: string, plan: string, usage: NonNullable<UsageAccount["status"]["usage"]>) => ({ ...account(key, "claude", `${key}@x.io`, usage), plan });
		const rings = usageRings(usagePools([
			seat("p1", "Team premium", [fiveHour(10), fable(0)]), seat("p2", "Team premium", [fiveHour(30), fable(40)]),
			seat("s1", "Team standard", [fiveHour(50)]), seat("s2", "Team standard", [fiveHour(70)]),
		]), 0);
		expect(rings.map(({ key, tier, inner, outer, segments }) => ({ key, tier, inner: inner?.label, outer: outer && [outer.label, outer.remaining], segments }))).toEqual([
			{ key: "claude:Team premium", tier: "Team premium", inner: "5-hour", outer: ["Fable weekly", 80], segments: [100, 60] },
			{ key: "claude:Team standard", tier: "Team standard", inner: undefined, outer: ["5-hour", 40], segments: [50, 30] },
		]);
		expect(rings[0].accounts.map(({ account, inner, outer }) => [account.key, inner?.remaining, outer?.remaining])).toEqual([["p1", 90, 100], ["p2", 70, 60]]);
		expect(["Claude Max 20x", "Team premium 5x", "Team premium", "Team standard", "ChatGPT Pro"].map(tierTag)).toEqual(["20x", "5x", "Premium", "Std", "Pro"]);
	});
	it("pools the weekly ring instead of splitting it when a provider has more than six accounts", () => {
		const many = Array.from({ length: 7 }, (_, index) => account(`h${index}`, "claude", `h${index}@x.io`, [{ id: "claude", name: "Claude", primary: null, secondary: window(index * 10, 10080), spendControlReached: null }]));
		const [claude] = usageRings(usagePools(many), 0);
		expect(claude.segments).toBeUndefined();
		expect(claude.outer?.remaining).toBe(70);
		expect(claude.accounts).toHaveLength(7);
	});
	it("ranks pairs running low, then in use, then pinned, then tightest, and fits the row with a count for the rest", () => {
		const pair = (key: string, provider: ProviderRings["provider"], inner: number | null, outer: number, tier?: string): ProviderRings => ({ key, provider, ...tier ? { tier } : {}, inner: inner === null ? null : { label: "5-hour", remaining: inner, resetsAt: null }, outer: { label: "Weekly", remaining: outer, resetsAt: null }, accounts: [] });
		const rings = [pair("codex", "codex", 64, 94), pair("claude:5x", "claude", 81, 100, "Team premium 5x"), pair("claude:std", "claude", null, 20, "Team standard"), pair("grok", "grok", null, 70), pair("cursor", "cursor", null, 50)];
		const ranked = rankRings(rings, { inUse: new Set(["codex"]), pinned: new Set(["grok"]) });
		// Standard is low (20%), Codex is in use, Grok is pinned, then the tightest: Cursor (50) before Claude 5x (81).
		expect(ranked.map(value => value.key)).toEqual(["claude:std", "codex", "grok", "cursor", "claude:5x"]);
		// Three fit beside "+2"; Standard needs no tag, as the other Claude pair is hidden.
		const row = sidebarRings(ranked);
		expect([row.shown.map(({ pair, tag }) => [pair.key, tag]), row.hidden]).toEqual([[["claude:std", undefined], ["codex", undefined], ["grok", undefined]], 2]);
		// Both Claude plans shown: each gets its tag.
		expect(sidebarRings([rings[1], rings[2]]).shown.map(({ tag }) => tag)).toEqual(["5x", "Std"]);
		// Four untagged pairs fit without a count.
		expect(sidebarRings([pair("a", "codex", 1, 1), pair("b", "claude", 1, 1), pair("c", "grok", 1, 1), pair("d", "cursor", 1, 1)])).toMatchObject({ hidden: 0 });
	});
});
