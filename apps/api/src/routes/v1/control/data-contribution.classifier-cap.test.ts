import { beforeEach, describe, expect, it, vi } from "vitest";

// The cap itself is the enforce_workspace_classifier_limit trigger (supabase/tests/
// workspace-classifier-limit.test.mjs); here the database refuses and the API reports it.
const state = vi.hoisted(() => ({
	atCap: false,
	writes: [] as Array<{ mode: "insert" | "update" | "upsert"; row: Record<string, unknown> }>,
}));

const LIMIT_ERROR = { code: "23514", message: "classifier_limit_reached" };

function classifierQuery() {
	let mode: "insert" | "update" | "upsert" = "insert";
	let row: Record<string, unknown> = {};
	const refused = () => state.atCap && row.enabled !== false;
	const query: any = {
		insert: (value: Record<string, unknown>) => { mode = "insert"; row = { enabled: true, ...value }; return query; },
		update: (value: Record<string, unknown>) => { mode = "update"; row = value; return query; },
		upsert: async (value: Record<string, unknown>) => {
			row = value;
			if (refused()) return { error: LIMIT_ERROR };
			state.writes.push({ mode: "upsert", row });
			return { error: null };
		},
		select: () => query,
		eq: () => query,
		maybeSingle: async () => {
			if (refused() && (mode === "insert" || row.enabled === true)) return { data: null, error: LIMIT_ERROR };
			state.writes.push({ mode, row });
			return { data: { id: "classifier-1", name: String(row.name ?? "Existing") }, error: null };
		},
	};
	return query;
}

function queryFor(table: string) {
	if (table === "workspace_classifiers") return classifierQuery();
	const query: any = {
		select: () => query,
		eq: () => query,
		insert: async () => ({ error: null }),
		maybeSingle: async () => {
			if (table === "workspace_members") return { data: { role: "admin" }, error: null };
			if (table === "workspaces") return { data: { owner_user_id: "user-admin" }, error: null };
			if (table === "users") return { data: { role: "admin" }, error: null };
			return { data: null, error: null };
		},
	};
	return query;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ from: (table: string) => queryFor(table) }),
}));
vi.mock("@/lib/oauth/service", () => ({ getSupabaseActor: async () => ({ userId: "user-admin" }) }));
vi.mock("@/core/feature-flags", () => ({ isDataContributionAccessEnabled: async () => true }));
vi.mock("@/core/kv", () => ({ setKeyVersion: vi.fn() }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/routes/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/routes/utils")>()),
	withRuntime: (handler: (req: Request) => Promise<Response>) => (c: any) => handler(c.req.raw),
}));

import { dataContributionRoutes } from "./data-contribution";
import { ensureStarterClassifier } from "@/pipeline/classification/classifier-worker";

const SESSION_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWFkbWluIn0.signature";

function request(method: "POST" | "PATCH", path: string, body: Record<string, unknown>) {
	return dataContributionRoutes.request(path, {
		method,
		headers: {
			authorization: `Bearer ${SESSION_TOKEN}`,
			"x-phaseo-workspace-id": "workspace-1",
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

const classifier = {
	name: "Support intent",
	instructions: "Classify the support request.",
	categories: { intent: ["billing", "bug"] },
};

describe("enabled classifier cap", () => {
	beforeEach(() => {
		state.atCap = false;
		state.writes = [];
	});

	it("reports a fourth enabled classifier as 409 classifier_limit_reached", async () => {
		state.atCap = true;
		const response = await request("POST", "/classifiers", classifier);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "classifier_limit_reached", max_enabled_classifiers: 3 });
		expect(state.writes).toHaveLength(0);
	});

	it("creates an enabled classifier below the cap, and a disabled one at it", async () => {
		expect((await request("POST", "/classifiers", classifier)).status).toBe(201);
		state.atCap = true;
		expect((await request("POST", "/classifiers", { ...classifier, name: "Paused", enabled: false })).status).toBe(201);
		expect(state.writes).toHaveLength(2);
	});

	it("reports enabling a fourth classifier as 409", async () => {
		state.atCap = true;
		const response = await request("PATCH", "/classifiers/classifier-9", { enabled: true });

		expect(response.status).toBe(409);
		expect(state.writes).toHaveLength(0);
	});

	it("adds the starter classifier switched off when the workspace is already at the cap", async () => {
		state.atCap = true;
		await ensureStarterClassifier("workspace-1", "user-admin");

		expect(state.writes).toEqual([{ mode: "upsert", row: expect.objectContaining({ slug: "phaseo-task-v1", enabled: false }) }]);
	});
});
