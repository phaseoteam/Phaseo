import { beforeEach, describe, expect, it, vi } from "vitest";

const guardManagementAuthMock = vi.fn();

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: (...args: unknown[]) => guardManagementAuthMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getSupabaseAdmin: vi.fn(),
}));

vi.mock("@core/feature-flags", () => ({
	getBatchApiFeatureGateName: () => "batch_api",
	isBatchApiAccessEnabled: vi.fn(async () => true),
}));

vi.mock("@core/webhook-endpoints", () => ({
	encryptWebhookSecret: vi.fn(),
	generateWebhookSigningSecret: vi.fn(),
	normalizeWebhookEndpointEvents: vi.fn(),
	toPublicWebhookEndpoint: vi.fn(),
	validateWebhookEndpointUrlForDelivery: vi.fn(),
}));

import webhookEndpointsRoutes from "./webhook-endpoints";

describe("webhook endpoint OAuth authorization", () => {
	beforeEach(() => {
		guardManagementAuthMock.mockReset();
	});

	it("requires settings:read for metadata reads", async () => {
		guardManagementAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
				userId: "user_test",
				authMethod: "oauth",
				scopes: ["openid"],
			},
		});

		const response = await webhookEndpointsRoutes.request("https://example.com/");

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "insufficient_scope",
			message: "Token requires settings:read",
		});
	});

	it("requires settings:write for mutations", async () => {
		guardManagementAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
				userId: "user_test",
				authMethod: "oauth",
				scopes: ["settings:read"],
			},
		});

		const response = await webhookEndpointsRoutes.request("https://example.com/", {
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
});
