import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import {
	controlBudgetKey,
	controlPath,
	controlRateLimitMode,
	controlRequestBudget,
	controlRequestCost,
} from "./request-budget";

type LimitCall = { key: string; delta?: number };

function fakeLimiter(outcome: "allow" | "deny" | "throw" = "allow") {
	const calls: LimitCall[] = [];
	const limiter = {
		limit: vi.fn(async (options: LimitCall) => {
			calls.push(options);
			if (outcome === "throw") throw new Error("binding unavailable");
			return { success: outcome === "allow" };
		}),
	};
	return { limiter, calls };
}

function appWithBudget() {
	const app = new Hono<Env>();
	app.use("*", controlRequestBudget);
	app.all("*", (c) => c.text("ok"));
	return app;
}

function send(app: Hono<Env>, path: string, env: Record<string, unknown>, init: RequestInit = {}) {
	return app.request(`https://api.phaseo.app${path}`, {
		...init,
		headers: { authorization: "Bearer pk_test_123", ...(init.headers as Record<string, string> | undefined) },
	}, env as Env["Bindings"]);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("controlRequestCost", () => {
	it.each([
		["GET", "/v1/models", 1],
		["GET", "/v1/models/openai/gpt-6/endpoints", 1],
		["GET", "/v1/pricing/models", 1],
		["POST", "/v1/pricing/calculate", 1],
		["GET", "/v1/providers", 1],
		["GET", "/v1/organisations/openai", 1],
		["GET", "/v1/key", 1],
		["GET", "/v1/me", 1],
		["GET", "/v1/settings", 1],
		["GET", "/v1/keys", 2],
		["GET", "/v1/keys/abc", 2],
		["GET", "/v1/workspaces", 2],
		["GET", "/v1/budgets", 2],
		["GET", "/v1/rate-limits", 2],
		["POST", "/v1/keys", 3],
		["PATCH", "/v1/keys/abc", 3],
		["DELETE", "/v1/presets/abc", 3],
		["GET", "/v1/logs", 5],
		["GET", "/v1/logs/req_123", 5],
		["GET", "/v1/generations", 5],
		["GET", "/v1/audit-events", 5],
		["GET", "/v1/activity", 5],
		["GET", "/v1/analytics", 10],
		["GET", "/v1/analytics/export", 10],
		["POST", "/v1/observability/destinations/test", 10],
		["POST", "/v1/observability/destinations/dest_1/test", 10],
		["POST", "/v1/observability/destinations/dest_1/sample", 10],
		["POST", "/v1/classifiers/test", 10],
		["POST", "/v1/preset-test-runs", 10],
		["GET", "/v1/health", 0],
		["GET", "/v1/health/providers/openai/derank", 0],
		["OPTIONS", "/v1/analytics", 0],
	])("%s %s costs %i", (method, path, cost) => {
		expect(controlRequestCost(method, path)).toBe(cost);
	});

	it("does not mistake a longer segment for a prefix", () => {
		expect(controlRequestCost("GET", "/v1/keystore")).toBe(2);
		expect(controlRequestCost("GET", "/v1/models-extra")).toBe(2);
		expect(controlRequestCost("GET", "/v1/logsearch")).toBe(2);
	});

	it("ignores a trailing slash", () => {
		expect(controlPath("/v1/logs/")).toBe("/logs");
		expect(controlRequestCost("GET", "/v1/analytics/")).toBe(10);
	});
});

describe("controlRateLimitMode", () => {
	it("defaults to off", () => {
		expect(controlRateLimitMode(undefined)).toBe("off");
		expect(controlRateLimitMode("")).toBe("off");
		expect(controlRateLimitMode("true")).toBe("off");
	});

	it("accepts shadow and enforce in any case", () => {
		expect(controlRateLimitMode(" Shadow ")).toBe("shadow");
		expect(controlRateLimitMode("ENFORCE")).toBe("enforce");
	});
});

describe("controlBudgetKey", () => {
	it("hashes the bearer token and never includes it", async () => {
		const key = await controlBudgetKey(new Request("https://api.phaseo.app/v1/keys", { headers: { authorization: "Bearer pk_secret_value" } }));
		expect(key).toMatch(/^token:[0-9a-f]{64}$/);
		expect(key).not.toContain("pk_secret_value");
		const again = await controlBudgetKey(new Request("https://api.phaseo.app/v1/logs", { headers: { authorization: "bearer pk_secret_value" } }));
		expect(again).toBe(key);
	});

	it("gives different credentials different budgets", async () => {
		const a = await controlBudgetKey(new Request("https://api.phaseo.app/v1/keys", { headers: { authorization: "Bearer a" } }));
		const b = await controlBudgetKey(new Request("https://api.phaseo.app/v1/keys", { headers: { authorization: "Bearer b" } }));
		expect(a).not.toBe(b);
	});

	it("falls back to a hash of the IP address", async () => {
		const key = await controlBudgetKey(new Request("https://api.phaseo.app/v1/models", { headers: { "cf-connecting-ip": "203.0.113.7" } }));
		expect(key).toMatch(/^ip:[0-9a-f]{64}$/);
		expect(key).not.toContain("203.0.113.7");
	});
});

describe("controlRequestBudget", () => {
	it("does nothing when the mode is off", async () => {
		const { limiter } = fakeLimiter("deny");
		const response = await send(appWithBudget(), "/v1/analytics", { CONTROL_API_RATE_LIMITER: limiter });
		expect(response.status).toBe(200);
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it("lets requests through when the binding is missing", async () => {
		const response = await send(appWithBudget(), "/v1/analytics", { CONTROL_API_RATE_LIMIT_MODE: "enforce" });
		expect(response.status).toBe(200);
	});

	it("draws the request's cost from the caller's budget", async () => {
		const { limiter, calls } = fakeLimiter();
		const response = await send(appWithBudget(), "/v1/analytics", { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter });
		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(calls[0].delta).toBe(10);
		expect(calls[0].key).toMatch(/^token:/);
	});

	it("only logs in shadow mode", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { limiter, calls } = fakeLimiter("deny");
		const response = await send(appWithBudget(), "/v1/logs", { CONTROL_API_RATE_LIMIT_MODE: "shadow", CONTROL_API_RATE_LIMITER: limiter });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(calls[0].delta).toBe(5);
		expect(warn).toHaveBeenCalledTimes(1);
		const logged = JSON.parse(String(warn.mock.calls[0][0]));
		expect(logged).toMatchObject({ event: "control_api_rate_limit", outcome: "would_deny", mode: "shadow", route_group: "logs", cost: 5 });
		expect(logged.caller).toMatch(/^token:[0-9a-f]{12}$/);
		expect(JSON.stringify(logged)).not.toContain("pk_test_123");
	});

	it("refuses an over-budget request in enforce mode", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { limiter } = fakeLimiter("deny");
		const response = await send(appWithBudget(), "/v1/keys", { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter });
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
		const body = await response.json() as { error: { code: string; type: string; metadata: { reason: string } } };
		expect(body.error).toMatchObject({ code: "rate_limit_exceeded", type: "rate_limit_error" });
		expect(body.error.metadata.reason).toBe("management_api_rate_limit");
	});

	it("fails open when the binding throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { limiter } = fakeLimiter("throw");
		const response = await send(appWithBudget(), "/v1/keys", { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter });
		expect(response.status).toBe(200);
	});

	it("does not count free requests", async () => {
		const { limiter } = fakeLimiter("deny");
		const env = { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter };
		expect((await send(appWithBudget(), "/v1/health", env)).status).toBe(200);
		expect((await send(appWithBudget(), "/v1/analytics", env, { method: "OPTIONS" })).status).toBe(200);
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it("does not count internal callers with the control secret", async () => {
		const { limiter } = fakeLimiter("deny");
		const env = { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter, PHASEO_CONTROL_SECRET: "control-secret" };
		const response = await send(appWithBudget(), "/v1/keys", env, { headers: { "x-control-secret": "control-secret" } });
		expect(response.status).toBe(200);
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it("counts callers whose control secret is wrong", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { limiter } = fakeLimiter("deny");
		const env = { CONTROL_API_RATE_LIMIT_MODE: "enforce", CONTROL_API_RATE_LIMITER: limiter, PHASEO_CONTROL_SECRET: "control-secret" };
		const response = await send(appWithBudget(), "/v1/keys", env, { headers: { "x-control-secret": "guess" } });
		expect(response.status).toBe(429);
	});
});
