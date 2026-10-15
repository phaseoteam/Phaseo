import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	model: {
		model_slug: "openai/old-model",
		name: "Old Model",
		status: "available",
		deprecated_at: "2026-09-08T00:00:00.000Z" as string | null,
		retired_at: "2026-10-01T00:00:00.000Z" as string | null,
		replacement_model_slug: "openai/new-model",
	},
	// What get_model_deprecation_alert_targets returns: alert-enabled workspaces only.
	targets: [] as Array<{ workspace_id: string; model_slugs: string[]; include_admins: boolean }>,
	admins: [] as Array<{ user_id: string }>,
	outboxRows: [] as Array<Record<string, unknown>>,
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/pipeline/notifications/email-suppressions", () => ({ getEmailSuppressionReason: vi.fn() }));
vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcCalls.push({ name, args });
			if (name !== "get_model_deprecation_alert_targets") return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
			const after = args.p_after_workspace_id as string | null;
			const page = [...state.targets]
				.sort((a, b) => a.workspace_id.localeCompare(b.workspace_id))
				.filter((row) => after === null || row.workspace_id > after)
				.slice(0, Number(args.p_limit));
			return { data: page, error: null };
		},
		from(table: string) {
			let selected = "";
			let values: unknown[] = [];
			const tableResult = () => {
				if (table === "v2_models") {
					return selected.includes("replacement_model_slug")
						? { data: [state.model], error: null }
						: { data: values.map((modelSlug) => ({ model_slug: modelSlug, name: "New Model" })), error: null };
				}
				if (table === "workspace_members") return { data: state.admins, error: null };
				return { data: [], error: null };
			};
			const chain = {
				select(fields: string) { selected = fields; return chain; },
				eq() { return chain; },
				or() { return chain; },
				in(_field: string, nextValues: unknown[]) { values = nextValues; return chain; },
				maybeSingle: async () => ({ data: { name: "Test Workspace", owner_user_id: "owner-1" }, error: null }),
				upsert(rows: Array<Record<string, unknown>>) {
					const inserted = rows.filter((row) => !state.outboxRows.some((existing) => existing.dedupe_key === row.dedupe_key));
					state.outboxRows.push(...inserted);
					return { select: async () => ({ data: inserted.map((row) => ({ dedupe_key: row.dedupe_key })), error: null }) };
				},
				then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(tableResult()).then(resolve, reject); },
			};
			return chain;
		},
		auth: { admin: { getUserById: async (userId: string) => ({ data: { user: { email: `${userId}@example.com` } } }) } },
	}),
}));

import { enqueueModelDeprecationNotifications } from "./notification-delivery";

const now = new Date("2026-09-01T00:00:00.000Z");

describe("model deprecation enqueue", () => {
	beforeEach(() => {
		state.model.deprecated_at = "2026-09-08T00:00:00.000Z";
		state.model.status = "available";
		state.model.retired_at = "2026-10-01T00:00:00.000Z";
		state.targets = [{ workspace_id: "workspace-1", model_slugs: ["openai/old-model"], include_admins: false }];
		state.admins = [{ user_id: "admin-1" }];
		state.outboxRows.length = 0;
		state.rpcCalls.length = 0;
	});

	it("asks the database for alert-enabled workspaces that recently requested a deprecated model", async () => {
		await enqueueModelDeprecationNotifications(now);
		expect(state.rpcCalls).toEqual([{
			name: "get_model_deprecation_alert_targets",
			args: { p_model_slugs: ["openai/old-model"], p_since: "2026-08-02T00:00:00.000Z", p_after_workspace_id: null, p_limit: 500 },
		}]);
	});

	it("pages through every enabled workspace by workspace id", async () => {
		state.targets = Array.from({ length: 1201 }, (_, index) => ({
			workspace_id: `workspace-${String(index).padStart(5, "0")}`,
			model_slugs: ["openai/old-model"],
			include_admins: false,
		}));
		await expect(enqueueModelDeprecationNotifications(now)).resolves.toEqual({ workspaces: 1201, enqueued: 1201 });
		expect(state.rpcCalls.map((call) => call.args.p_after_workspace_id)).toEqual([null, "workspace-00499", "workspace-00999"]);
		expect(new Set(state.outboxRows.filter((row) => row.kind === "model_deprecation").map((row) => row.workspace_id)).size).toBe(1201);
	});

	it("enqueues a routed event and an owner email as soon as a model is marked, whatever the date", async () => {
		state.model.deprecated_at = "2026-12-01T00:00:00.000Z";
		await expect(enqueueModelDeprecationNotifications(now)).resolves.toEqual({ workspaces: 1, enqueued: 1 });
		expect(state.outboxRows).toEqual([
			expect.objectContaining({
				dedupe_key: "model_deprecation:workspace-1:openai/old-model",
				kind: "model_deprecation",
				template: "model_deprecation",
				to_email: "owner-1@example.com",
				payload: expect.objectContaining({ replacement_model_id: "openai/new-model", replacement_model_name: "New Model" }),
			}),
			expect.objectContaining({
				dedupe_key: "model_deprecation:workspace-1:openai/old-model:email:owner-1",
				kind: "model_deprecation_email",
				template: "model_deprecation",
				to_email: "owner-1@example.com",
			}),
		]);
	});

	it("sends a notice only once, even after the deprecation date changes", async () => {
		await enqueueModelDeprecationNotifications(now);
		state.model.deprecated_at = "2026-09-20T00:00:00.000Z";
		await expect(enqueueModelDeprecationNotifications(new Date("2026-09-02T00:00:00.000Z"))).resolves.toEqual({ workspaces: 1, enqueued: 0 });
		expect(state.outboxRows).toHaveLength(2);
	});

	it("emails admins too when the workspace includes them", async () => {
		state.targets = [{ workspace_id: "workspace-1", model_slugs: ["openai/old-model"], include_admins: true }];
		await enqueueModelDeprecationNotifications(now);
		expect(state.outboxRows.filter((row) => row.kind === "model_deprecation_email").map((row) => row.to_email)).toEqual(["owner-1@example.com", "admin-1@example.com"]);
	});

	it("skips workspaces that have not turned alerts on", async () => {
		state.targets = [];
		await expect(enqueueModelDeprecationNotifications(now)).resolves.toEqual({ workspaces: 0, enqueued: 0 });
		expect(state.outboxRows).toHaveLength(0);
	});

	it("ignores models that are not marked deprecated", async () => {
		state.model.deprecated_at = null;
		state.model.retired_at = null;
		await expect(enqueueModelDeprecationNotifications(now)).resolves.toEqual({ workspaces: 0, enqueued: 0 });
		expect(state.rpcCalls).toHaveLength(0);
	});
});
