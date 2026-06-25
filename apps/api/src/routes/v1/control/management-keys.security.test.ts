import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	dbTouched: false,
}));

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => {
		state.dbTouched = true;
		throw new Error("database should not be touched");
	},
	getBindings: () => ({ KEY_PEPPER_ACTIVE: "pepper" }),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: {
			workspaceId: "ws_1",
			apiKeyId: "mgmt_1",
			authMethod: "api_key",
			scopes: ["management_keys:write"],
		},
	})),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("management key security", () => {
	beforeEach(() => {
		state.dbTouched = false;
		vi.resetModules();
	});

	it("rejects null scopes on update instead of resetting to default full capabilities", async () => {
		const { managementKeysRoutes } = await import("./management-keys");
		const response = await managementKeysRoutes.request("https://example.com/mgmt_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ scopes: null }),
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			error: "bad_request",
			message: "scopes must be omitted to keep existing scopes or provided as a string or string[]",
		});
		expect(state.dbTouched).toBe(false);
	});
});
