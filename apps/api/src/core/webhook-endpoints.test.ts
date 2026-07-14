import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";

import {
	decryptWebhookSecret,
	encryptWebhookSecret,
	generateWebhookSigningSecret,
	normalizeWebhookEndpointEvents,
	toPublicWebhookEndpoint,
	validateWebhookEndpointUrl,
	validateWebhookEndpointUrlForDelivery,
} from "./webhook-endpoints";

describe("webhook endpoint helpers", () => {
	beforeEach(() => {
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-webhook-encryption-key",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "test-v1",
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
		expect(encrypted.secretKeyVersion).toBe("test-v1");
		await expect(decryptWebhookSecret(encrypted)).resolves.toBe(secret);
	});

	it("decrypts existing secrets with a versioned previous key after rotation", async () => {
		const original = await encryptWebhookSecret("whsec_rotating");
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "new-key",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "test-v2",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS: "test-webhook-encryption-key",
			ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS_VERSION: "test-v1",
		} as any);
		await expect(decryptWebhookSecret(original)).resolves.toBe("whsec_rotating");
	});

	it("refuses to encrypt new secrets without a dedicated key", async () => {
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			KEY_PEPPER_ACTIVE: "legacy-only",
		} as any);
		await expect(encryptWebhookSecret("whsec_new")).rejects.toThrow("dedicated_webhook_secret_encryption_key_missing");
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

	it("requires managed webhook endpoints to use public https destinations", () => {
		expect(validateWebhookEndpointUrl("https://example.com/hooks#secret")).toEqual({
			ok: true,
			url: "https://example.com/hooks",
		});
		expect(validateWebhookEndpointUrl("http://example.com/hooks")).toEqual({
			ok: false,
			reason: "webhook_url_must_use_https",
		});
		expect(validateWebhookEndpointUrl("https://127.0.0.1/hooks")).toEqual({
			ok: false,
			reason: "webhook_url_private_network_not_allowed",
		});
		expect(validateWebhookEndpointUrl("https://192.168.1.10/hooks")).toEqual({
			ok: false,
			reason: "webhook_url_private_network_not_allowed",
		});
		expect(validateWebhookEndpointUrl("https://localhost/hooks")).toEqual({
			ok: false,
			reason: "webhook_url_private_network_not_allowed",
		});
	});

	it("rejects webhook URLs whose DNS answers resolve to private networks", async () => {
		await expect(validateWebhookEndpointUrlForDelivery("https://customer.example/hooks", {
			forceDns: true,
			resolveAddresses: async () => ["10.0.0.5"],
		})).resolves.toEqual({
			ok: false,
			reason: "webhook_url_private_network_not_allowed",
		});
		await expect(validateWebhookEndpointUrlForDelivery("https://customer.example/hooks", {
			forceDns: true,
			resolveAddresses: async () => ["203.0.113.10", "2001:4860:4860::8888"],
		})).resolves.toEqual({
			ok: true,
			url: "https://customer.example/hooks",
		});
		await expect(validateWebhookEndpointUrlForDelivery("https://customer.example/hooks", {
			forceDns: true,
			resolveAddresses: async () => [],
		})).resolves.toEqual({
			ok: false,
			reason: "webhook_url_dns_resolution_failed",
		});
	});
});
