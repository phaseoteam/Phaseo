import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const path = "https://phaseo.app/api/account/models/example%2Fstaged/availability";
const actor = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllGlobals());

function mockBackend(role = "admin", rpcStatus = 200) {
	const calls: Array<{ url: string; body: unknown }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
		calls.push({ url, body });
		const payload = url.includes("/auth/v1/user") ? { id: actor }
			: url.includes("/rest/v1/users") ? { role }
				: rpcStatus === 200 ? { model_slug: "example/staged", available: body?.p_available }
					: { message: "no prepared internal testing routes are ready for release", code: "P0001" };
		return new Response(JSON.stringify(payload), { status: url.includes("/rpc/") ? rpcStatus : 200, headers: { "content-type": "application/json" } });
	}));
	return calls;
}

function request(body: unknown, authenticated = true) {
	return app.request(path, { method: "PUT", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer session-token" } : {}) }, body: JSON.stringify(body) }, env);
}

describe("admin model availability", () => {
	it("rejects unauthenticated release", async () => {
		mockBackend();
		const response = await request({ available: true }, false);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
	it("rejects authenticated non-admins without invoking the release RPC", async () => {
		const calls = mockBackend("user");
		expect((await request({ available: true })).status).toBe(403);
		expect(calls.some(({ url }) => url.includes("/rpc/"))).toBe(false);
	});
	it.each([true, false])("uses the authenticated admin identity for available=%s", async (available) => {
		const calls = mockBackend();
		const response = await request({ available });
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(calls.find(({ url }) => url.includes("/rpc/set_v2_admin_model_availability"))?.body).toEqual({ p_actor_user_id: actor, p_model_slug: "example/staged", p_available: available });
		await expect(response.json()).resolves.toEqual({ model_slug: "example/staged", available });
	});
	it.each([{ available: "true" }, {}, { available: true, p_actor_user_id: "forged" }])("rejects malformed or forged input %j", async (body) => {
		const calls = mockBackend();
		expect((await request(body)).status).toBe(400);
		expect(calls.some(({ url }) => url.includes("/rpc/"))).toBe(false);
	});
	it("returns release validation failures without claiming success", async () => {
		mockBackend("admin", 400);
		const response = await request({ available: true });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "model_availability_update_failed" });
	});
});
