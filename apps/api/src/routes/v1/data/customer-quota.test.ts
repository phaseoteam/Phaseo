import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/runtime/types";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), quota: vi.fn(), configure: vi.fn(), clear: vi.fn(), handler: vi.fn() }));
vi.mock("@pipeline/before/auth", () => ({ prepareAuthentication: mocks.authenticate }));
vi.mock("@core/customer-rate-limits", () => ({ guardCustomerQuota: mocks.quota }));
vi.mock("@/runtime/env", () => ({ configureRuntime: mocks.configure, clearRuntime: mocks.clear }));

import { customerQuotaMiddleware } from "./customer-quota";

beforeEach(() => {
	mocks.authenticate.mockReset().mockResolvedValue({ ok: true, workspaceId: "workspace", userId: "owner" });
	mocks.quota.mockReset().mockResolvedValue(null);
	mocks.configure.mockReset();
	mocks.clear.mockReset();
	mocks.handler.mockReset();
});

function app() {
	const router = new Hono<Env>();
	// Hono can match both the collection and wildcard middleware.
	router.use("/files", customerQuotaMiddleware);
	router.use("/files/*", customerQuotaMiddleware);
	router.all("/files", c => { mocks.handler(); return c.json({ ok: true }); });
	router.get("/files/:id", c => { mocks.handler(); return c.json({ ok: true }); });
	router.get("/workspaces", c => c.json({ ok: true }));
	return router;
}

const env = { CUSTOMER_RATE_LIMITS_ENABLED: "true" } as Env["Bindings"];

describe("inference quota admission", () => {
	it("admits a collection request once and uses a server-owned admission ID", async () => {
		const response = await app().request("http://localhost/files", { method: "POST", headers: { "x-request-id": "reused" } }, env);
		expect(response.status).toBe(200);
		expect(mocks.quota).toHaveBeenCalledTimes(1);
		expect(mocks.quota.mock.calls[0][0]).toMatchObject({ userId: "owner", workspaceId: "workspace", kind: "minute" });
		expect(mocks.quota.mock.calls[0][0].admissionId).not.toBe("reused");
		expect(mocks.configure.mock.calls.length).toBe(mocks.clear.mock.calls.length);
	});

	it("blocks polling before its route handler and does not affect management routes", async () => {
		mocks.quota.mockResolvedValue(new Response(null, { status: 429 }));
		const router = app();
		expect((await router.request("http://localhost/files/abc", {}, env)).status).toBe(429);
		expect(mocks.handler).not.toHaveBeenCalled();
		expect((await router.request("http://localhost/workspaces", {}, env)).status).toBe(200);
		expect(mocks.quota).toHaveBeenCalledTimes(1);
	});

	it("does not admit preflight, disabled, or unauthenticated requests", async () => {
		const router = app();
		await router.request("http://localhost/files", { method: "OPTIONS" }, env);
		await router.request("http://localhost/files", {}, { ...env, CUSTOMER_RATE_LIMITS_ENABLED: "false" });
		mocks.authenticate.mockResolvedValue({ ok: false, reason: "invalid_key" });
		await router.request("http://localhost/files", {}, env);
		expect(mocks.quota).not.toHaveBeenCalled();
	});

	it("public request IDs cannot deduplicate separate HTTP requests", async () => {
		const router = app();
		for (let index = 0; index < 2; index++) {
			await router.request("http://localhost/files", { headers: { "x-request-id": "same" } }, env);
		}
		expect(mocks.quota).toHaveBeenCalledTimes(2);
		expect(mocks.quota.mock.calls[0][0].admissionId).not.toBe(mocks.quota.mock.calls[1][0].admissionId);
	});
});
