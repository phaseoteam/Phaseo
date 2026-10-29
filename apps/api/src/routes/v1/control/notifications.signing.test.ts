import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE_ID = "10000000-0000-4000-8000-000000000009";

const state = vi.hoisted(() => ({
	bindings: { ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-notification-encryption-key", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "v1" } as Record<string, string>,
	auth: { ok: true, value: { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "30000000-0000-4000-8000-000000000001", authMethod: "api_key", scopes: ["settings:read", "settings:write"] } } as any,
	rows: [] as Array<Record<string, unknown>>,
	audit: vi.fn(),
}));

// A minimal notification_destinations table: filters are applied for eq/neq, inserts get an id.
function table() {
	const filters: Array<(row: Record<string, unknown>) => boolean> = [];
	let pending: { kind: "select" } | { kind: "insert"; row: Record<string, unknown> } | { kind: "update"; patch: Record<string, unknown> } = { kind: "select" };
	const rows = () => state.rows.filter((row) => filters.every((filter) => filter(row)));
	const run = () => {
		if (pending.kind === "insert") { const row = { id: `20000000-0000-4000-8000-00000000000${state.rows.length + 1}`, created_at: "2026-10-21T10:00:00Z", updated_at: "2026-10-21T10:00:00Z", is_ephemeral: false, signing_secret_ciphertext: null, signing_secret_rotated_at: null, ...pending.row }; state.rows.push(row); return [row]; }
		if (pending.kind === "update") { const matched = rows(); for (const row of matched) Object.assign(row, (pending as { patch: Record<string, unknown> }).patch); return matched; }
		return rows();
	};
	const query: any = {
		select: () => query,
		insert: (row: Record<string, unknown>) => { pending = { kind: "insert", row }; return query; },
		update: (patch: Record<string, unknown>) => { pending = { kind: "update", patch }; return query; },
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
		neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
		order: () => query,
		single: async () => ({ data: run()[0] ?? null, error: null }),
		maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
		then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: run(), error: null }).then(resolve); },
	};
	return query;
}

vi.mock("@/runtime/env", () => ({ getBindings: () => state.bindings, getSupabaseAdmin: () => ({ from: () => table() }) }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@/pipeline/notifications/notification-delivery", () => ({ deliverNotificationTest: vi.fn() }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

import { decryptWebhookSecret } from "@/core/webhook-endpoints";

async function storedSecret(row: Record<string, unknown>) {
	return decryptWebhookSecret({ secretCiphertext: String(row.signing_secret_ciphertext), secretIv: String(row.signing_secret_iv), secretKeyVersion: String(row.signing_secret_key_version) });
}

function legacyRow(overrides: Record<string, unknown> = {}) {
	return { id: "20000000-0000-4000-8000-0000000000aa", workspace_id: WORKSPACE_ID, name: "Legacy hook", type: "custom_webhook", status: "active", is_ephemeral: false, target_preview: "hooks.example.com/••••hook", signing_secret_ciphertext: null, signing_secret_iv: null, signing_secret_key_version: null, signing_secret_rotated_at: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...overrides };
}

const post = (path: string, body?: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
	state.rows = [];
	state.audit.mockReset();
	state.auth.value.scopes = ["settings:read", "settings:write"];
});

describe("notification destination signing secrets", () => {
	it("creates a custom webhook with an encrypted secret and returns it once", async () => {
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request("https://example.com/destinations", post("", { name: "Ops", type: "custom_webhook", target: "https://hooks.example.com/phaseo" }));
		expect(response.status).toBe(201);
		const { data } = await response.json() as { data: Record<string, unknown> };
		expect(data.signing_secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
		expect(data.has_signing_secret).toBe(true);
		expect(data).not.toHaveProperty("signing_secret_ciphertext");
		const row = state.rows[0]!;
		expect(row.signing_secret_ciphertext).not.toContain("whsec_");
		await expect(storedSecret(row)).resolves.toBe(data.signing_secret);

		const list = await notificationRoutes.request("https://example.com/destinations");
		const listed = (await list.json() as { data: Array<Record<string, unknown>> }).data[0]!;
		expect(listed.has_signing_secret).toBe(true);
		expect(listed).not.toHaveProperty("signing_secret");
		expect(listed).not.toHaveProperty("signing_secret_ciphertext");
	});

	it("does not give other destination types a secret", async () => {
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request("https://example.com/destinations", post("", { name: "Slack", type: "slack", target: "https://hooks.slack.com/services/T000/B000/xyz" }));
		const { data } = await response.json() as { data: Record<string, unknown> };
		expect(data).not.toHaveProperty("signing_secret");
		expect(data.has_signing_secret).toBe(false);
		expect(state.rows[0]!.signing_secret_ciphertext).toBeNull();
	});

	it("gives a legacy destination its first secret on rotation", async () => {
		state.rows = [legacyRow()];
		const { notificationRoutes } = await import("./notifications");
		const before = await notificationRoutes.request("https://example.com/destinations");
		expect((await before.json() as { data: Array<Record<string, unknown>> }).data[0]!.has_signing_secret).toBe(false);

		const response = await notificationRoutes.request(`https://example.com/destinations/${state.rows[0]!.id}/rotate-secret`, post(""));
		expect(response.status).toBe(200);
		const { data } = await response.json() as { data: Record<string, unknown> };
		expect(data.has_signing_secret).toBe(true);
		await expect(storedSecret(state.rows[0]!)).resolves.toBe(data.signing_secret);
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "notifications.destination.secret_rotated" }));
	});

	it("replaces the previous secret", async () => {
		state.rows = [legacyRow()];
		const { notificationRoutes } = await import("./notifications");
		const first = (await (await notificationRoutes.request(`https://example.com/destinations/${state.rows[0]!.id}/rotate-secret`, post(""))).json() as { data: { signing_secret: string } }).data.signing_secret;
		const second = (await (await notificationRoutes.request(`https://example.com/destinations/${state.rows[0]!.id}/rotate-secret`, post(""))).json() as { data: { signing_secret: string } }).data.signing_secret;
		expect(second).not.toBe(first);
		await expect(storedSecret(state.rows[0]!)).resolves.toBe(second);
	});

	it("refuses other types, other workspaces and deleted destinations", async () => {
		state.rows = [
			legacyRow({ id: "20000000-0000-4000-8000-0000000000b1", type: "slack" }),
			legacyRow({ id: "20000000-0000-4000-8000-0000000000b2", workspace_id: OTHER_WORKSPACE_ID }),
			legacyRow({ id: "20000000-0000-4000-8000-0000000000b3", status: "deleted" }),
		];
		const { notificationRoutes } = await import("./notifications");
		const rotate = (id: string) => notificationRoutes.request(`https://example.com/destinations/${id}/rotate-secret`, post(""));
		expect((await rotate("20000000-0000-4000-8000-0000000000b1")).status).toBe(400);
		expect((await rotate("20000000-0000-4000-8000-0000000000b2")).status).toBe(404);
		expect((await rotate("20000000-0000-4000-8000-0000000000b3")).status).toBe(404);
		expect(state.rows.every((row) => row.signing_secret_ciphertext === null)).toBe(true);
	});

	it("requires settings:write to rotate", async () => {
		state.rows = [legacyRow()];
		state.auth.value.scopes = ["settings:read"];
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request(`https://example.com/destinations/${state.rows[0]!.id}/rotate-secret`, post(""));
		expect(response.status).toBe(403);
		expect(state.rows[0]!.signing_secret_ciphertext).toBeNull();
	});
});
