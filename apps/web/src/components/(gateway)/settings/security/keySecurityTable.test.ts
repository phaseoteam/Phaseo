import { describe, it, expect } from "vitest";
import type { KeySecurityKey } from "@/lib/fetchers/internal/settingsTypes";
import { keySecurityRisks, keySecurityStatus, matchesKeySecurityFilter, sameKeySecurityFilter, sortKeySecurityKeys } from "./keySecurityTable";

const key = (overrides: Partial<KeySecurityKey>): KeySecurityKey => ({
	id: "k", name: "Key", prefix: "abc", status: "active", created_by: null, owner_name: null, owner_email: null,
	created_at: "2026-01-01T00:00:00Z", last_used_at: null, expires_at: null, storage_locations: [],
	has_spend_limit: false, has_ip_allowlist: false, never_used: true, idle: false, safe_to_remove: false, risk: 0,
	...overrides,
});

const keys = [
	key({ id: "a", name: "beta", last_used_at: "2026-10-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z", storage_locations: ["railway"] }),
	key({ id: "b", name: "Alpha", last_used_at: null, expires_at: null }),
	key({ id: "c", name: "gamma", last_used_at: "2026-10-20T00:00:00Z", expires_at: "2026-11-01T00:00:00Z", has_spend_limit: true }),
];
const ids = (list: KeySecurityKey[]) => list.map((item) => item.id);

describe("key security table", () => {
	it("keeps the server's order without a sort", () => {
		expect(ids(sortKeySecurityKeys(keys, null))).toEqual(["a", "b", "c"]);
	});

	it("sorts names without regard to case", () => {
		expect(ids(sortKeySecurityKeys(keys, { key: "name", direction: "asc" }))).toEqual(["b", "a", "c"]);
	});

	it("sorts never used as the oldest use and never expires as the latest expiry", () => {
		expect(ids(sortKeySecurityKeys(keys, { key: "lastUsed", direction: "desc" }))).toEqual(["c", "a", "b"]);
		expect(ids(sortKeySecurityKeys(keys, { key: "expires", direction: "asc" }))).toEqual(["c", "a", "b"]);
	});

	it("splits usage status from risky settings", () => {
		expect(keySecurityStatus(key({ status: "paused", safe_to_remove: true }))).toBe("paused");
		expect(keySecurityStatus(key({ idle: true, safe_to_remove: true }))).toBe("safe_to_remove");
		expect(keySecurityStatus(key({ never_used: false }))).toBe("active");
		expect(keySecurityRisks(key({ has_spend_limit: true }))).toEqual(["never_expires", "no_ip_allowlist"]);
	});

	it("sorts the most urgent status and the most risks first when descending", () => {
		const list = [key({ id: "x", never_used: false, has_spend_limit: true, has_ip_allowlist: true }), key({ id: "y", status: "paused" })];
		expect(ids(sortKeySecurityKeys(list, { key: "status", direction: "desc" }))).toEqual(["y", "x"]);
		expect(ids(sortKeySecurityKeys(list, { key: "risks", direction: "desc" }))).toEqual(["y", "x"]);
		expect(ids(sortKeySecurityKeys(keys, { key: "storedIn", direction: "desc" }))).toEqual(["a", "b", "c"]);
	});

	it("filters by risk and location", () => {
		expect(ids(keys.filter((item) => matchesKeySecurityFilter(item, { kind: "no_spend_limit" })))).toEqual(["a", "b"]);
		expect(ids(keys.filter((item) => matchesKeySecurityFilter(item, { kind: "location", id: "railway" })))).toEqual(["a"]);
		expect(sameKeySecurityFilter({ kind: "location", id: "railway" }, { kind: "location", id: "vercel" })).toBe(false);
		expect(sameKeySecurityFilter({ kind: "idle" }, { kind: "idle" })).toBe(true);
	});
});
