import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The legacy exchange (off unless PHASEO_LEGACY_OAUTH_EXCHANGE_ENABLED) would mint a key with no limit for an
// app. Apps that sign in with Phaseo may not mint keys, so it refuses them before exchanging the code.

const state = vi.hoisted(() => ({
	clientId: "partner_app",
	writes: [] as string[],
}));

vi.mock("@/routes/auth.helpers", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/routes/auth.helpers")>()),
	resolveOAuthApp: vi.fn(async () => ({
		ok: true,
		app: { client_id: state.clientId, workspace_id: "ws_1", name: "App", status: "active", redirect_uris: ["https://app.example/callback"] },
	})),
}));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => ({ SUPABASE_URL: "https://project.supabase.co", KEY_PEPPER_ACTIVE: "pepper" }),
	getSupabaseAdmin: () => ({
		from: (table: string) => ({
			insert: () => {
				state.writes.push(table);
				return { select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "unexpected" } }) }) };
			},
		}),
	}),
}));

vi.mock("@/routes/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/routes/utils")>()),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));

async function exchange() {
	const { authRouter } = await import("./auth");
	return authRouter.request("https://api.example/exchange", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ code: "code_1", redirect_uri: "https://app.example/callback", client_id: state.clientId }),
	});
}

describe("legacy OAuth exchange", () => {
	beforeEach(() => {
		state.writes.length = 0;
		fetchSpy.mockClear();
		vi.stubGlobal("fetch", fetchSpy);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("refuses to mint a key for an app that signs in with Phaseo", async () => {
		state.clientId = "partner_app";
		const response = await exchange();
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ ok: false, error: "forbidden", message: expect.stringContaining("can't create API keys here") });
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(state.writes).toEqual([]);
	});

	it("leaves Phaseo's own clients to the code exchange", async () => {
		state.clientId = "phaseo_cli";
		const response = await exchange();
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "token_exchange_failed" });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
