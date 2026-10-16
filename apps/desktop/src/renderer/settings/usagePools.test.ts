import { describe, expect, it } from "vitest";
import { accountHue, initials, uniqueAccounts, usagePools, type UsageAccount } from "./usagePools";

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
});
