import { getKeyState, organiseKeys } from "./keyOrdering";

const keys = [
	{ id: "disabled", status: "paused", last_used_at: "2026-09-06" },
	{ id: "never", status: "active", last_used_at: null },
	{ id: "expired", status: "active", expires_at: "2000-01-01", last_used_at: "2026-09-07" },
	{ id: "older", status: "active", last_used_at: "2026-09-01" },
	{ id: "limited", status: "active", last_used_at: "2026-09-05", daily_limit_requests: 10, current_usage_daily: 10 },
	{ id: "invalid", status: "active", last_used_at: "invalid" },
];

test("enabled keys come first, sorted by use, with never-used keys last", () => {
	expect(organiseKeys(keys, "all").map((key) => key.id)).toEqual([
		"limited", "older", "never", "invalid", "disabled", "expired",
	]);
	expect(keys[0].id).toBe("disabled");
});

test("enabled filter retains keys at their limit and excludes inactive keys", () => {
	expect(organiseKeys(keys, "enabled").map((key) => key.id)).toEqual([
		"limited", "older", "never", "invalid",
	]);
	expect(organiseKeys(keys, "disabled").map((key) => key.id)).toEqual(["disabled"]);
	expect(organiseKeys(keys, "expired").map((key) => key.id)).toEqual(["expired"]);
});

test("expiry takes precedence over disabled status", () => {
	expect(getKeyState({ status: "disabled", expires_at: "2000-01-01" })).toBe("expired");
	for (const status of ["paused", "disabled", "revoked"]) {
		expect(getKeyState({ status })).toBe("disabled");
	}
});

test("status combinations include disabled by default and hide expired keys", () => {
	expect(organiseKeys(keys, "enabled-disabled").map((key) => key.id)).toEqual([
		"limited", "older", "never", "invalid", "disabled",
	]);
	expect(organiseKeys(keys, "disabled-expired").map((key) => key.id)).toEqual(["disabled", "expired"]);
	expect(organiseKeys(keys, "enabled-expired").map((key) => key.id)).toEqual([
		"limited", "older", "never", "invalid", "expired",
	]);
	expect(organiseKeys(keys, "none")).toEqual([]);
});
