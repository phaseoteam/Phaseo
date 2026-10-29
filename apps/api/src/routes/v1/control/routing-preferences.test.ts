import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./__fixtures__/fake-supabase";

const state = vi.hoisted(() => ({
	db: null as unknown as FakeDb,
	auth: {} as Record<string, unknown>,
	audits: [] as Array<Record<string, unknown>>,
	invalidated: [] as string[],
}));

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.db.client }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: state.auth }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, unknown>) => { state.audits.push(event); return true; } }));
vi.mock("./settings", () => ({ invalidateWorkspaceGatewayContextCache: async (workspaceId: string) => { state.invalidated.push(workspaceId); } }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
}));

import {
	handleGetAutoRouting,
	handleListSuccessorReplacements,
	handleRemoveSuccessorReplacement,
	handleSaveSuccessorReplacement,
	handleUpdateAutoRouting,
} from "./routing-preferences";

const WS = "ws_1";
const send = (handler: (req: Request) => Promise<Response>, method: string, body?: unknown, query = "") =>
	handler(new Request(`https://api.phaseo.test/v1/routing/x${query}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	}));
// The Phaseo CLI acting for a member with that role.
const oauth = (role: string) => {
	state.auth = { workspaceId: WS, authMethod: "oauth", oauthClientId: "phaseo_cli", userId: "user_1", requestId: "req_1", oauthScopes: ["settings:read", "settings:write"] };
	state.db.tables.workspace_members = [{ workspace_id: WS, user_id: "user_1", role }];
};

beforeEach(() => {
	state.db = createFakeDb({
		workspace_settings: [],
		workspace_model_successor_overrides: [],
		v2_models: [
			{ model_slug: "openai/gpt-4", status: "retired", hidden: false },
			{ model_slug: "openai/gpt-5", status: "active", hidden: false },
			{ model_slug: "acme/preview", status: "coming_soon", hidden: false },
		],
	});
	state.auth = { workspaceId: WS, authMethod: "api_key", requestId: "req_1", scopes: [] };
	state.audits.length = 0;
	state.invalidated.length = 0;
});

describe("auto-routing settings", () => {
	it("returns the defaults before anything is saved", async () => {
		const body = await (await send(handleGetAutoRouting, "GET")).json() as any;
		expect(body.data).toMatchObject({ allowed_patterns: [], spend_profile: "standard", objective: "balanced", allow_fallbacks: true, max_input_price_per_million: null });
	});

	it("changes only the fields sent, validates the whole, invalidates the gateway and audits", async () => {
		let response = await send(handleUpdateAutoRouting, "PATCH", { allowed_patterns: ["OpenAI/*", "anthropic/claude-*"], objective: "cost" });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toMatchObject({ allowed_patterns: ["openai/*", "anthropic/claude-*"], objective: "cost", spend_profile: "standard" });
		response = await send(handleUpdateAutoRouting, "PATCH", { allowFallbacks: false });
		const data = (await response.json() as any).data;
		expect(data).toMatchObject({ allowed_patterns: ["openai/*", "anthropic/claude-*"], objective: "cost", allow_fallbacks: false });
		expect(data.revision).toEqual(expect.any(String));
		expect(state.invalidated).toEqual([WS, WS]);
		expect(state.audits.map((event) => event.action)).toEqual(["routing.auto.updated", "routing.auto.updated"]);
	});

	it("refuses what the dashboard refuses", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ allowed_patterns: ["gpt-4"] }, "invalid_model_patterns"],
			[{ objective: "fastest" }, "invalid_objective"],
			[{ spend_profile: "lavish" }, "invalid_spend_profile"],
			[{ spend_profile: "custom", max_input_price_per_million: 1 }, "custom_price_limits_required"],
		];
		for (const [body, error] of cases) {
			const response = await send(handleUpdateAutoRouting, "PATCH", body);
			expect(response.status).toBe(400);
			expect((await response.json() as any).error).toBe(error);
		}
		expect((await send(handleUpdateAutoRouting, "PATCH", {})).status).toBe(400);
		expect(state.db.tables.workspace_settings).toHaveLength(0);
	});

	it("lets any member read but only owners and admins change", async () => {
		oauth("member");
		expect((await send(handleGetAutoRouting, "GET")).status).toBe(200);
		expect((await send(handleUpdateAutoRouting, "PATCH", { objective: "cost" })).status).toBe(403);
		oauth("admin");
		expect((await send(handleUpdateAutoRouting, "PATCH", { objective: "cost" })).status).toBe(200);
	});
});

describe("successor replacements", () => {
	it("saves, lists, replaces and removes a replacement", async () => {
		oauth("owner");
		let response = await send(handleSaveSuccessorReplacement, "PUT", { model: "OpenAI/GPT-4", successor: "openai/gpt-5" });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toMatchObject({ model: "openai/gpt-4", successor: "openai/gpt-5" });
		response = await send(handleSaveSuccessorReplacement, "PUT", { model: "openai/gpt-4", successor: null });
		expect((await response.json() as any).data).toMatchObject({ successor: null });
		const list = await (await send(handleListSuccessorReplacements, "GET")).json() as any;
		expect(list.data).toEqual([expect.objectContaining({ model: "openai/gpt-4", successor: null })]);
		expect(state.db.tables.workspace_model_successor_overrides[0]).toMatchObject({ created_by: "user_1" });

		expect((await send(handleRemoveSuccessorReplacement, "DELETE", undefined, "?model=openai%2Fgpt-4")).status).toBe(200);
		expect(state.db.tables.workspace_model_successor_overrides).toHaveLength(0);
		expect((await send(handleRemoveSuccessorReplacement, "DELETE", undefined, "?model=openai%2Fgpt-4")).status).toBe(404);
		expect(state.audits.map((event) => event.action)).toEqual([
			"routing.successor_replacement.saved",
			"routing.successor_replacement.saved",
			"routing.successor_replacement.removed",
		]);
	});

	it("refuses unknown, unserved and self replacements", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ model: "openai/gpt-4" }, "invalid_successor"],
			[{ model: "openai/gpt-4", successor: "openai/gpt-4" }, "successor_is_model"],
			[{ model: "nobody/model", successor: "openai/gpt-5" }, "unknown_model"],
			[{ model: "openai/gpt-4", successor: "nobody/model" }, "unknown_successor"],
			[{ model: "openai/gpt-4", successor: "acme/preview" }, "inactive_successor"],
		];
		for (const [body, error] of cases) {
			const response = await send(handleSaveSuccessorReplacement, "PUT", body);
			expect(response.status).toBe(400);
			expect((await response.json() as any).error).toBe(error);
		}
		expect(state.db.tables.workspace_model_successor_overrides).toHaveLength(0);
	});

	it("keeps members to reading", async () => {
		oauth("member");
		expect((await send(handleListSuccessorReplacements, "GET")).status).toBe(200);
		expect((await send(handleSaveSuccessorReplacement, "PUT", { model: "openai/gpt-4", successor: "openai/gpt-5" })).status).toBe(403);
		expect((await send(handleRemoveSuccessorReplacement, "DELETE", undefined, "?model=openai%2Fgpt-4")).status).toBe(403);
	});
});
