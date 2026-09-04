import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	model: {
		model_slug: "openai/old-model",
		name: "Old Model",
		status: "available",
		deprecated_at: "2026-09-08T00:00:00.000Z",
		retired_at: "2026-10-01T00:00:00.000Z",
		replacement_model_slug: "openai/new-model",
	},
	outboxRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/pipeline/notifications/email-suppressions", () => ({ getEmailSuppressionReason: vi.fn() }));
vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: async (name: string) => name === "get_workspace_model_last_used"
			? { data: [{ model_id: state.model.model_slug }], error: null }
			: { data: null, error: new Error(`Unexpected RPC: ${name}`) },
		from(table: string) {
			let selected = "";
			let values: unknown[] = [];
			const tableResult = () => table === "v2_models"
				? selected.includes("replacement_model_slug")
					? { data: [state.model], error: null }
					: { data: values.map((modelSlug) => ({ model_slug: modelSlug, name: "New Model" })), error: null }
				: { data: [], error: null };
			const chain = {
				select(fields: string) { selected = fields; return chain; },
				eq() { return chain; },
				not() { return chain; },
				gte() { return chain; },
				order() { return chain; },
				range: async () => table === "workspace_settings" ? { data: [{ workspace_id: "workspace-1" }], error: null } : tableResult(),
				in(_field: string, nextValues: unknown[]) { values = nextValues; return chain; },
				maybeSingle: async () => ({ data: { name: "Test Workspace", owner_user_id: "user-1" }, error: null }),
				upsert: async (row: Record<string, unknown>) => { state.outboxRows.push(row); return { error: null }; },
				then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(tableResult()).then(resolve, reject); },
			};
			if (table === "workspaces") chain.maybeSingle = async () => ({ data: { name: "Test Workspace", owner_user_id: "user-1" }, error: null });
			return chain;
		},
		auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com" } } }) } },
	}),
	}));

import { enqueueModelDeprecationNotifications } from "./notification-delivery";

describe("model deprecation enqueue", () => {
	beforeEach(() => {
		state.outboxRows.length = 0;
		state.model.deprecated_at = "2026-09-08T00:00:00.000Z";
		state.model.status = "available";
	});

	it("enqueues a notice within the seven-day lead window with replacement metadata", async () => {
		await expect(enqueueModelDeprecationNotifications(new Date("2026-09-01T00:00:00.000Z"))).resolves.toEqual({ workspaces: 1, enqueued: 1 });
		expect(state.outboxRows[0]).toMatchObject({
			kind: "model_deprecation",
			template: "model_deprecation",
			subject: "Model deprecation: Old Model",
			payload: expect.objectContaining({
				replacement_model_id: "openai/new-model",
				replacement_model_name: "New Model",
			}),
		});
	});

	it("does not enqueue a notice more than seven days before deprecation", async () => {
		state.model.deprecated_at = "2026-09-09T00:00:00.000Z";
		await expect(enqueueModelDeprecationNotifications(new Date("2026-09-01T00:00:00.000Z"))).resolves.toEqual({ workspaces: 1, enqueued: 0 });
		expect(state.outboxRows).toHaveLength(0);
	});
});
