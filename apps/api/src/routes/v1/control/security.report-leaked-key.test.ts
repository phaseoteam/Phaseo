import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	bindings: {
		KEY_PEPPER_ACTIVE: "pepper",
		LEAKED_KEY_REPORT_MODE: "auto_revoke",
	},
	keysRows: [] as Array<Record<string, unknown>>,
	managementKeysRows: [] as Array<Record<string, unknown>>,
	workspacesById: {} as Record<string, Record<string, unknown>>,
	workspaceMembersById: {} as Record<string, Array<Record<string, unknown>>>,
	userLookup: {} as Record<string, { email: string; user_metadata?: Record<string, unknown> }>,
	reportInserts: [] as Array<Record<string, unknown>>,
	emailOutboxInserts: [] as Array<Record<string, unknown>>,
	keyUpdates: [] as Array<{ payload: Record<string, unknown>; filters: Array<{ column: string; value: unknown }> }>,
	managementKeyUpdates: [] as Array<{ payload: Record<string, unknown>; filters: Array<{ column: string; value: unknown }> }>,
	keyUpdateError: null as { message: string } | null,
	managementKeyUpdateError: null as { message: string } | null,
	cacheGetValues: new Map<string, string | null>(),
	cachePuts: [] as Array<{ key: string; value: string; ttl: number | undefined }>,
	cacheDeletes: [] as string[],
	keyVersions: [] as Array<{ scope: string; id: string; version: number }>,
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

function buildSupabaseMock() {
	return {
		auth: {
			admin: {
				getUserById: vi.fn(async (userId: string) => ({
					data: {
						user: state.userLookup[userId]
							? {
								email: state.userLookup[userId].email,
								user_metadata: state.userLookup[userId].user_metadata ?? {},
							}
							: null,
					},
				})),
			},
		},
		from(table: string) {
			if (table === "keys" || table === "management_keys") {
				const rows = table === "keys" ? state.keysRows : state.managementKeysRows;
				let eqColumn = "";
				let eqValue: unknown = null;
				return {
					select: () => ({
						eq: (column: string, value: unknown) => {
							eqColumn = column;
							eqValue = value;
							return Promise.resolve({
								data: rows.filter((row) => row[eqColumn] === eqValue),
								error: null,
							});
						},
					}),
					update: (payload: Record<string, unknown>) => {
						const filters: Array<{ column: string; value: unknown }> = [];
						const target = table === "keys" ? state.keyUpdates : state.managementKeyUpdates;
						const updateError = table === "keys" ? state.keyUpdateError : state.managementKeyUpdateError;
						target.push({ payload, filters });
						const updater: any = {
							eq: (column: string, value: unknown) => {
								filters.push({ column, value });
								return filters.length >= 2 ? Promise.resolve({ error: updateError }) : updater;
							},
						};
						return updater;
					},
				};
			}

			if (table === "workspaces") {
				return {
					select: () => ({
						eq: (_column: string, value: unknown) => ({
							maybeSingle: async () => ({
								data: state.workspacesById[String(value)] ?? null,
								error: null,
							}),
						}),
					}),
				};
			}

			if (table === "workspace_members") {
				return {
					select: () => ({
						eq: (_column: string, value: unknown) => Promise.resolve({
							data: state.workspaceMembersById[String(value)] ?? [],
							error: null,
						}),
					}),
				};
			}

			if (table === "security_key_reports") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						state.reportInserts.push(payload);
						return { error: null };
					},
				};
			}

			if (table === "email_outbox") {
				return {
					insert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
						const rows = Array.isArray(payload) ? payload : [payload];
						state.emailOutboxInserts.push(...rows);
						return { error: null };
					},
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => buildSupabaseMock(),
	getCache: () => ({
		get: vi.fn(async (key: string) => state.cacheGetValues.get(key) ?? null),
		put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
			state.cachePuts.push({ key, value, ttl: options?.expirationTtl });
			state.cacheGetValues.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			state.cacheDeletes.push(key);
			state.cacheGetValues.delete(key);
		}),
	}),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/core/kv", () => ({
	setKeyVersion: vi.fn(async (scope: string, id: string, version: number) => {
		state.keyVersions.push({ scope, id, version });
	}),
}));

vi.mock("@/lib/security/keyPepper", () => ({
	resolveActiveKeyPepper: vi.fn(() => "pepper"),
	resolveKeyPepperCandidates: vi.fn(() => [{ source: "active", value: "pepper" }]),
}));

describe("public leaked key reports", () => {
	beforeEach(() => {
		state.bindings.LEAKED_KEY_REPORT_MODE = "auto_revoke";
		state.keysRows.length = 0;
		state.managementKeysRows.length = 0;
		state.reportInserts.length = 0;
		state.emailOutboxInserts.length = 0;
		state.keyUpdates.length = 0;
		state.managementKeyUpdates.length = 0;
		state.keyUpdateError = null;
		state.managementKeyUpdateError = null;
		state.cacheGetValues.clear();
		state.cachePuts.length = 0;
		state.cacheDeletes.length = 0;
		state.keyVersions.length = 0;
		state.workspacesById = {};
		state.workspaceMembersById = {};
		state.userLookup = {};
		vi.resetModules();
	});

	it("auto-revokes a matched gateway key and notifies workspace owners", async () => {
		const token = "phaseo_v1_sk_kid123_supersecret";
		const hash = createHmac("sha256", "pepper").update("supersecret").digest("hex");
		state.keysRows.push({
			id: "key_1",
			workspace_id: "ws_1",
			name: "Production Key",
			prefix: "phaseo_v1_sk_kid123",
			status: "active",
			hash,
			kid: "kid123",
			soft_blocked: false,
		});
		state.workspacesById.ws_1 = { id: "ws_1", name: "Acme", owner_user_id: "user_owner" };
		state.workspaceMembersById.ws_1 = [
			{ user_id: "user_owner", role: "owner" },
			{ user_id: "user_admin", role: "admin" },
		];
		state.userLookup.user_owner = {
			email: "owner@example.com",
			user_metadata: { first_name: "Olivia" },
		};
		state.userLookup.user_admin = {
			email: "admin@example.com",
			user_metadata: { first_name: "Alex" },
		};

		const { securityRoutes } = await import("./security");
		const response = await securityRoutes.request("https://example.com/report-leaked-key", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"cf-connecting-ip": "203.0.113.10",
				"user-agent": "scanner/1.0",
			},
			body: JSON.stringify({
				token,
				source: "github",
				reporter_email: "reporter@example.com",
				evidence_url: "https://github.com/example/repo/commit/abc",
				comment: `Found ${token} in a public repo`,
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body).toEqual({ status: "received" });
		expect(state.keyUpdates[0]).toMatchObject({
			payload: expect.objectContaining({
				status: "compromised",
				soft_blocked: true,
				revoked_reason: "public_leak_report",
			}),
			filters: [
				{ column: "id", value: "key_1" },
				{ column: "workspace_id", value: "ws_1" },
			],
		});
		expect(state.reportInserts[0]).toMatchObject({
			status: "auto_revoked",
			matched: true,
			key_table: "keys",
			api_key_id: "key_1",
			workspace_id: "ws_1",
			action_taken: "auto_revoked",
			report_mode: "auto_revoke",
			token_prefix: "phaseo_v1_sk_kid123",
			token_last_four: "cret",
			comment: "Found [redacted-token] in a public repo",
		});
		expect(state.emailOutboxInserts).toHaveLength(2);
		expect(state.emailOutboxInserts[0]).toMatchObject({
			kind: "security_leaked_key",
			template: "security_leaked_key",
			workspace_id: "ws_1",
			payload: expect.objectContaining({
				workspace_name: "Acme",
				key_preview: "phaseo_v1_sk_kid123...cret",
				reported_source: "github",
				auto_revoked: true,
			}),
		});
		expect(state.keyVersions.map((entry) => [entry.scope, entry.id])).toEqual([
			["id", "key_1"],
			["kid", "kid123"],
		]);
		expect(state.cacheDeletes).toEqual(["gateway:key:kid123"]);
	});

	it("records matched management keys in report-only mode without revoking them", async () => {
		state.bindings.LEAKED_KEY_REPORT_MODE = "report_only";
		const token = "phaseo_v1_sk_mgmt77_topsecret";
		const hash = createHmac("sha256", "pepper").update("topsecret").digest("hex");
		state.managementKeysRows.push({
			id: "mgmt_1",
			workspace_id: "ws_2",
			name: "Ops Key",
			prefix: "phaseo_v1_sk_mgmt77",
			status: "active",
			hash,
			kid: "mgmt77",
			soft_blocked: false,
		});
		state.workspacesById.ws_2 = { id: "ws_2", name: "Control", owner_user_id: "user_owner" };
		state.workspaceMembersById.ws_2 = [{ user_id: "user_owner", role: "owner" }];
		state.userLookup.user_owner = {
			email: "owner@example.com",
			user_metadata: { first_name: "Olivia" },
		};

		const { securityRoutes } = await import("./security");
		const response = await securityRoutes.request("https://example.com/report-leaked-key", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"cf-connecting-ip": "203.0.113.11",
			},
			body: JSON.stringify({
				token,
				source: "pastebin",
			}),
		});

		expect(response.status).toBe(202);
		expect(state.managementKeyUpdates).toEqual([]);
		expect(state.reportInserts[0]).toMatchObject({
			status: "pending_review",
			matched: true,
			key_table: "management_keys",
			api_key_id: "mgmt_1",
			action_taken: "matched_report_only",
			report_mode: "report_only",
			token_last_four: "cret",
		});
		expect(state.emailOutboxInserts[0]).toMatchObject({
			subject: "Security alert: exposed API key reported",
			payload: expect.objectContaining({
				auto_revoked: false,
			}),
		});
	});

	it("matches legacy aistats-prefixed leaked keys", async () => {
		const token = "aistats_v1_sk_kid123_supersecret";
		const hash = createHmac("sha256", "pepper").update("supersecret").digest("hex");
		state.keysRows.push({
			id: "key_1",
			workspace_id: "ws_1",
			name: "Legacy Prefix Key",
			prefix: "phaseo_v1_sk_kid123",
			status: "active",
			hash,
			kid: "kid123",
			soft_blocked: false,
		});

		const { securityRoutes } = await import("./security");
		const response = await securityRoutes.request("https://example.com/report-leaked-key", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"cf-connecting-ip": "203.0.113.15",
			},
			body: JSON.stringify({
				token,
				source: "github",
			}),
		});

		expect(response.status).toBe(202);
		expect(state.reportInserts[0]).toMatchObject({
			status: "auto_revoked",
			matched: true,
			key_table: "keys",
			api_key_id: "key_1",
			token_prefix: "aistats_v1_sk_kid123",
			token_last_four: "cret",
		});
	});

	it("accepts invalid formats without revealing validity", async () => {
		const { securityRoutes } = await import("./security");
		const response = await securityRoutes.request("https://example.com/report-leaked-key", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"cf-connecting-ip": "203.0.113.12",
			},
			body: JSON.stringify({
				token: "not-a-real-key",
				source: "discord",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body).toEqual({ status: "received" });
		expect(state.keyUpdates).toEqual([]);
		expect(state.managementKeyUpdates).toEqual([]);
		expect(state.emailOutboxInserts).toEqual([]);
		expect(state.reportInserts[0]).toMatchObject({
			status: "received",
			matched: false,
			action_taken: "invalid_format",
		});
	});

	it("records a processing error and skips notifications when revocation fails", async () => {
		const token = "phaseo_v1_sk_kid123_supersecret";
		const hash = createHmac("sha256", "pepper").update("supersecret").digest("hex");
		state.keyUpdateError = { message: "db write failed" };
		state.keysRows.push({
			id: "key_1",
			workspace_id: "ws_1",
			name: "Production Key",
			prefix: "phaseo_v1_sk_kid123",
			status: "active",
			hash,
			kid: "kid123",
			soft_blocked: false,
		});

		const { securityRoutes } = await import("./security");
		const response = await securityRoutes.request("https://example.com/report-leaked-key", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"cf-connecting-ip": "203.0.113.13",
			},
			body: JSON.stringify({
				token,
				source: "github",
			}),
		});

		expect(response.status).toBe(202);
		expect(state.reportInserts[0]).toMatchObject({
			status: "received",
			matched: true,
			key_table: "keys",
			api_key_id: "key_1",
			action_taken: "processing_error",
		});
		expect(state.emailOutboxInserts).toEqual([]);
		expect(state.keyVersions).toEqual([]);
		expect(state.cacheDeletes).toEqual([]);
	});
});
