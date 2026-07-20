import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

afterEach(() => vi.unstubAllGlobals());

describe("account model source routes", () => {
	it.each([
		"/api/account/models/audit/source",
		"/api/account/models/provider-audit/source",
		"/api/account/models/openai%2Fgpt-test/source",
	])("rejects unauthenticated access to %s with private cache headers", async (path) => {
		const response = await app.request(`https://phaseo.app${path}`, {}, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("vary")).toBe("Authorization, Cookie");
	});

	it("rejects authenticated non-admin audit access", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify({ role: "user" }), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/models/audit/source",
			{ headers: { authorization: "Bearer session-token" } },
			{
				ENV: "development",
				SUPABASE_URL: "https://example.supabase.co",
				SUPABASE_ANON_KEY: "anon-key",
				SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			},
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
