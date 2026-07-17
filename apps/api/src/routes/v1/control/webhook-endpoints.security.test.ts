import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: {
		ok: true as const,
		value: {
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			apiKeyRef: "kid_1",
			apiKeyKid: "kid_1",
			userId: null as string | null,
			internal: false,
			authMethod: "api_key" as "api_key" | "oauth",
			scopes: ["settings:read"] as string[],
			oauthScopes: [] as string[],
		},
	},
	dbCalls: 0,
}));

vi.mock("@/runtime/env", () => ({
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getSupabaseAdmin: () => {
		state.dbCalls += 1;
		throw new Error("database_should_not_be_reached");
	},
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => state.auth),
}));

vi.mock("@core/feature-flags", () => ({
	getBatchApiFeatureGateName: () => "gateway_batch_api",
	isBatchApiAccessEnabled: vi.fn(async () => true),
}));

vi.mock("@core/webhook-endpoints", () => ({
	encryptWebhookSecret: vi.fn(),
	generateWebhookSigningSecret: vi.fn(),
	normalizeWebhookEndpointEvents: vi.fn(),
	toPublicWebhookEndpoint: vi.fn(),
	validateWebhookEndpointUrlForDelivery: vi.fn(),
}));

import app from "./webhook-endpoints";

describe("webhook endpoint management authorization", () => {
	beforeEach(() => {
		state.dbCalls = 0;
		state.auth.value.internal = false;
		state.auth.value.userId = null;
		state.auth.value.authMethod = "api_key";
		state.auth.value.scopes = ["settings:read"];
		state.auth.value.oauthScopes = [];
	});

	it("requires settings:read for OAuth metadata reads", async () => {
		state.auth.value.authMethod = "oauth";
		state.auth.value.userId = "user_test";
		state.auth.value.scopes = ["openid"];
		const response = await app.request("https://example.com/");
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "insufficient_scope",
			message: "Token requires settings:read",
		});
	});

	it("requires settings:write for OAuth mutations", async () => {
		state.auth.value.authMethod = "oauth";
		state.auth.value.userId = "user_test";
		state.auth.value.scopes = ["settings:read"];
		const response = await app.request("https://example.com/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "test", url: "https://example.com/webhook" }),
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "insufficient_scope",
			message: "Token requires settings:write",
		});
	});

	it("rejects mutations from a settings read-only management key before service-role access", async () => {
		const response = await app.request("https://api.example.test/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "test", url: "https://hooks.example.test/batch" }),
		}, {} as any);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
		expect(state.dbCalls).toBe(0);
	});

	it("rejects reads from a settings write-only management key before service-role access", async () => {
		state.auth.value.scopes = ["settings:write"];
		const response = await app.request("https://api.example.test/", { method: "GET" }, {} as any);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
		expect(state.dbCalls).toBe(0);
	});

	it("accepts OAuth capabilities supplied only through oauthScopes", async () => {
		state.auth.value.authMethod = "oauth";
		state.auth.value.userId = "user_oauth_1";
		state.auth.value.scopes = [];
		state.auth.value.oauthScopes = ["settings:read"];
		const response = await app.request("https://api.example.test/", { method: "GET" }, {} as any);
		expect(response.status).toBe(500);
		expect(state.dbCalls).toBe(1);
	});
});
