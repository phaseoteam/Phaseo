import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000099";

const state = vi.hoisted(() => ({ memberRole: "member", ownerUserId: "", platformRole: "user" }));

vi.mock("@/auth/requireUser", () => ({
	requireUser: vi.fn(async () => ({
		id: "10000000-0000-4000-8000-000000000001",
		appMetadata: { chat_privacy_reviews: { "20000000-0000-4000-8000-000000000001": "2026-10-08" } },
	})),
}));

function result(data: unknown) {
	return { data, error: null };
}

function tableResult(table: string, columns: string, single: boolean) {
	switch (table) {
		case "users":
			return columns === "role" ? result({ role: state.platformRole }) : result({ default_workspace_id: WORKSPACE_ID });
		case "workspace_members":
			return single ? result({ role: state.memberRole }) : result([{ workspace_id: WORKSPACE_ID }]);
		case "workspaces":
			return single ? result({ owner_user_id: state.ownerUserId }) : result([]);
		case "keys":
			return result({ id: "key_1", workspace_id: WORKSPACE_ID, status: "active", hash: "" });
		case "provider_catalog_sync_runs":
			return result({ id: "run_1" });
		case "provider_catalog_sync_models":
			return result([{ provider_slug: "synthetic", model_slug: "m01", availability: "preview", decision: "pending", route_projection_status: "not_projected" }]);
		case "provider_account_links":
			return result({ provider_slug: "synthetic" });
		case "v2_providers":
			return result({ base_url: "https://synthetic.example/v1", metadata: { adapter_ready: true, credentials_ready: true } });
		case "v2_model_provider_routes":
			return result([{ provider_slug: "synthetic", model_slug: "m01", provider_model_slug: "m01", status: "active", provider_availability_status: "preview", phaseo_status: "testing", access_scope: "internal" }]);
		default:
			throw new Error(`unexpected table ${table}`);
	}
}

vi.mock("@/data/supabase", () => ({
	getDataClient: () => ({
		from(table: string) {
			let columns = "";
			const builder: Record<string, unknown> = {};
			for (const method of ["eq", "in", "order", "limit"]) builder[method] = () => builder;
			builder.select = (value: string) => { columns = value; return builder; };
			builder.maybeSingle = async () => tableResult(table, columns, true);
			builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(tableResult(table, columns, false)).then(resolve, reject);
			return builder;
		},
	}),
}));

import { proxyGateway } from "./proxy";

const env = {
	ENV: "production",
	AI_STATS_GATEWAY_URL: "https://gateway.example/v1",
	CHAT_ROUTE_KEY_SEED: "seed",
	KEY_PEPPER_ACTIVE: "pepper",
	GATEWAY_INTERNAL_TEST_TOKEN: "t".repeat(128),
} as never;

const previewBody = {
	model: "synthetic:m01",
	messages: [{ role: "user", content: "hi" }],
	models: ["openai/gpt-5-pro", "anthropic/claude-opus"],
	debug: { enabled: true },
	testing_mode: true,
	provider: { order: ["synthetic"] },
};

async function send() {
	return proxyGateway(new Request("https://web-api.example/api/chat/completions", { method: "POST" }), env, () => undefined, {
		path: "/chat/completions",
		requestBody: previewBody,
		debug: true,
	});
}

describe("chat proxy preview testing", () => {
	const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

	beforeEach(() => {
		state.memberRole = "member";
		state.ownerUserId = OWNER_ID;
		state.platformRole = "user";
		fetchMock.mockClear();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("refuses a plain member of the provider workspace instead of forwarding the internal token", async () => {
		const response = await send();

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "preview_model_forbidden" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("lets a workspace admin test the preview model, without fallbacks or debug flags", async () => {
		state.memberRole = "admin";
		const response = await send();

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers["x-phaseo-internal-token"]).toBe("t".repeat(128));
		expect(headers["x-gateway-debug"]).toBeUndefined();
		const body = JSON.parse(String(init.body));
		expect(body).toEqual({
			model: "synthetic:m01",
			messages: [{ role: "user", content: "hi" }],
			provider: { order: ["synthetic"], allow_fallbacks: false },
		});
	});

	it("lets the workspace owner test the preview model", async () => {
		state.ownerUserId = USER_ID;
		const response = await send();

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
