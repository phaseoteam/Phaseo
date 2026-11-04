import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { protectedGuardrailError, splitWorkspaceSettingsSave } from "./settings-guardrails";
import { workspaceSettingsFromBaseline } from "./settings";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	rpcError: null as { message: string; code?: string } | null,
	upserts: [] as Array<{ table: string; row: Row }>,
	deleteError: null as { message: string } | null,
	updateError: null as { message: string } | null,
	routes: [{ model_slug: "model-a" }] as Row[],
	waitUntil: vi.fn(),
	fetch: vi.fn(async () => new Response(null, { status: 204 })),
}));

function fakeClient() {
	return {
		rpc: async (name: string, args: Record<string, unknown>) => {
			mocks.rpcCalls.push({ name, args });
			return { data: mocks.rpcError ? null : { id: "baseline" }, error: mocks.rpcError };
		},
		from(table: string) {
			let op = "select";
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				neq: () => builder,
				in: () => builder,
				order: () => builder,
				range: () => builder,
				upsert: async (row: Row) => { mocks.upserts.push({ table, row }); return { data: null, error: null }; },
				update: () => { op = "update"; return builder; },
				delete: () => { op = "delete"; return builder; },
				then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(
					op === "delete" ? { data: null, error: mocks.deleteError }
						: op === "update" ? { data: mocks.updateError ? null : [{ kind: "access" }], error: mocks.updateError }
							: { data: table === "v2_model_provider_routes" ? mocks.routes : [], error: null },
				)),
			};
			return builder;
		},
	};
}

vi.mock("./context", () => ({
	requireAccountWorkspace: async ({ workspaceId }: { workspaceId: string }) => workspaceId === "ws-1"
		? { user: { id: "admin-user" }, workspaceId, role: "admin", client: fakeClient() }
		: null,
}));

const { accountSettingsGuardrailsRouter } = await import("./settings-guardrails");
const env = { GATEWAY_API_ORIGIN: "https://gateway.test", PHASEO_CONTROL_KEY: "control", PHASEO_CONTROL_SECRET: "secret" } as unknown as Env;
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsGuardrailsRouter);
const executionCtx: ExecutionContext = { waitUntil: mocks.waitUntil, passThroughOnException: () => {}, props: {} };
const request = (method: string, path: string, body: Row) => app.request(`https://example.com${path}`, {
	method,
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ workspaceId: "ws-1", ...body }),
}, env, executionCtx);

beforeEach(() => {
	mocks.rpcCalls.length = 0;
	mocks.rpcError = null;
	mocks.upserts.length = 0;
	mocks.deleteError = null;
	mocks.updateError = null;
	mocks.waitUntil.mockReset();
	vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => vi.unstubAllGlobals());

describe("splitWorkspaceSettingsSave", () => {
	it("sends the rules to the baseline (models as allowed_api_model_ids) and log storage to workspace_settings", () => {
		expect(splitWorkspaceSettingsSave({
			privacyZdrOnly: true,
			providerRestrictionMode: "allowlist",
			providerRestrictionProviderIds: ["openai"],
			modelRestrictionMode: "blocklist",
			modelRestrictionModelIds: ["model-a"],
			ioLoggingEnabled: true,
		})).toEqual({
			baseline: {
				privacy_zdr_only: true,
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["openai"],
				model_restriction_mode: "blocklist",
				allowed_api_model_ids: ["model-a"],
			},
			settings: { io_logging_enabled: true, io_logging_updated_at: expect.any(String) },
		});
	});
});

describe("PUT /guardrails/global", () => {
	it("saves the Privacy rules to the workspace baseline in one call and invalidates the keys", async () => {
		const response = await request("PUT", "/guardrails/global", {
			privacyEnablePaidMayTrain: false,
			privacyZdrOnly: true,
			modelRestrictionMode: "allowlist",
			modelRestrictionModelIds: ["model-a", "model-a"],
		});
		expect(response.status).toBe(200);
		expect(mocks.rpcCalls).toEqual([{
			name: "save_workspace_baseline_guardrail",
			args: {
				p_workspace_id: "ws-1",
				p_settings: { privacy_enable_paid_may_train: false, privacy_zdr_only: true, model_restriction_mode: "allowlist", allowed_api_model_ids: ["model-a"] },
			},
		}]);
		expect(mocks.upserts).toEqual([]);
		expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
	});

	it("keeps log storage on workspace_settings without touching the baseline", async () => {
		const response = await request("PUT", "/guardrails/global", { ioLoggingEnabled: true, ioLoggingRetentionDays: 120 });
		expect(response.status).toBe(200);
		expect(mocks.rpcCalls).toEqual([]);
		expect(mocks.upserts).toEqual([{ table: "workspace_settings", row: expect.objectContaining({ workspace_id: "ws-1", io_logging_enabled: true, io_logging_retention_days: 120 }) }]);
	});

	it("refuses a model that no route serves", async () => {
		const response = await request("PUT", "/guardrails/global", { modelRestrictionMode: "allowlist", modelRestrictionModelIds: ["model-gone"] });
		expect(response.status).toBe(400);
		expect(mocks.rpcCalls).toEqual([]);
	});

	it("reports an invalid value as 400 and a database failure as 503", async () => {
		mocks.rpcError = { message: "new row violates check constraint", code: "23514" };
		expect((await request("PUT", "/guardrails/global", { providerRestrictionMode: "sometimes" })).status).toBe(400);
		mocks.rpcError = { message: "canceling statement due to statement timeout", code: "57014" };
		expect((await request("PUT", "/guardrails/global", { privacyZdrOnly: true })).status).toBe(503);
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});
});

describe("the workspace baseline is protected", () => {
	it("returns 409 when deleting it", async () => {
		mocks.deleteError = { message: "workspace_baseline_guardrail_protected" };
		const response = await request("DELETE", "/guardrails/g-baseline", {});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "guardrail_protected", reason: "workspace_baseline" });
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});

	it("returns 409 when turning it off or changing its kind", async () => {
		mocks.updateError = { message: "workspace_baseline_guardrail_protected" };
		const response = await request("PUT", "/guardrails/g-baseline", { name: "Workspace baseline", enabled: false, kind: "safety" });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ reason: "workspace_baseline" });
	});

	it("tells the two protected guardrails apart", () => {
		expect(protectedGuardrailError({ message: "slack_agent_guardrail_protected" })).toEqual({ error: "guardrail_protected", reason: "slack_agent" });
		expect(protectedGuardrailError({ message: "connection reset" })).toBeNull();
	});
});

describe("workspaceSettingsFromBaseline", () => {
	it("gives the baseline's rules their workspace_settings names", () => {
		expect(workspaceSettingsFromBaseline({ id: "g", privacy_zdr_only: true, allowed_api_model_ids: ["m"], model_restriction_mode: "allowlist" }))
			.toEqual({ privacy_zdr_only: true, model_restriction_mode: "allowlist", model_restriction_model_ids: ["m"] });
	});
});
