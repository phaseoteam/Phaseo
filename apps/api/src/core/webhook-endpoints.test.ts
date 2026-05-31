import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";

import {
	decryptWebhookSecret,
	encryptWebhookSecret,
	generateWebhookSigningSecret,
	normalizeWebhookEndpointEvents,
	toPublicWebhookEndpoint,
} from "./webhook-endpoints";

describe("webhook endpoint helpers", () => {
	beforeEach(() => {
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			KEY_PEPPER: "test-webhook-encryption-key",
		} as any);
	});

	afterEach(() => {
		clearRuntime();
	});

	it("generates and encrypts signing secrets", async () => {
		const secret = generateWebhookSigningSecret();
		expect(secret).toMatch(/^whsec_/);
		const encrypted = await encryptWebhookSecret(secret);
		expect(encrypted.secretCiphertext).not.toContain(secret);
		expect(encrypted.secretHash).toHaveLength(64);
		await expect(decryptWebhookSecret(encrypted)).resolves.toBe(secret);
	});

	it("normalizes endpoint events and strips secret material from public records", () => {
		expect(normalizeWebhookEndpointEvents([" Batch.Completed ", "batch.completed", "video.failed"])).toEqual([
			"batch.completed",
			"video.failed",
		]);
		const record = toPublicWebhookEndpoint({
			id: "we_123",
			workspace_id: "ws_123",
			name: "Async",
			url: "https://example.com/hooks",
			status: "active",
			events: ["batch.completed"],
			secret_ciphertext: "encrypted",
			created_at: "2026-05-31T00:00:00Z",
		});
		expect(record).toMatchObject({
			id: "we_123",
			workspaceId: "ws_123",
			hasSecret: true,
		});
		expect(record).not.toHaveProperty("secret_ciphertext");
	});
});
