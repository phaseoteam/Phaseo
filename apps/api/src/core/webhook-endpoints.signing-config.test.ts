import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/env", () => {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		maybeSingle: maybeSingleMock,
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	return {
		getBindings: () => ({
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-webhook-encryption-key",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "test-v1",
		}),
		getSupabaseAdmin: () => ({
			from: () => query,
		}),
	};
});

import { getWebhookEndpointSigningConfig } from "./webhook-endpoints";

describe("getWebhookEndpointSigningConfig", () => {
	beforeEach(() => {
		maybeSingleMock.mockReset();
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns null when encrypted secret columns are missing", async () => {
		maybeSingleMock.mockResolvedValue({
			data: {
				id: "we_1",
				workspace_id: "ws_1",
				url: "https://receiver.test/webhook",
				status: "active",
				events: ["batch.completed"],
				secret_ciphertext: "",
				secret_iv: null,
				secret_key_version: "test-v1",
			},
			error: null,
		});

		await expect(
			getWebhookEndpointSigningConfig({ workspaceId: "ws_1", endpointId: "we_1" }),
		).resolves.toBeNull();
		expect(console.warn).toHaveBeenCalledWith("webhook_endpoint_missing_secret_material", {
			workspaceId: "ws_1",
			endpointId: "we_1",
		});
	});

	it("returns null when encrypted secret material cannot be decrypted", async () => {
		maybeSingleMock.mockResolvedValue({
			data: {
				id: "we_1",
				workspace_id: "ws_1",
				url: "https://receiver.test/webhook",
				status: "active",
				events: ["batch.completed"],
				secret_ciphertext: "not-valid-base64",
				secret_iv: "not-valid-base64",
				secret_key_version: "test-v1",
			},
			error: null,
		});

		await expect(
			getWebhookEndpointSigningConfig({ workspaceId: "ws_1", endpointId: "we_1" }),
		).resolves.toBeNull();
		expect(console.warn).toHaveBeenCalledWith("webhook_endpoint_secret_decryption_failed", {
			workspaceId: "ws_1",
			endpointId: "we_1",
		});
	});
});
