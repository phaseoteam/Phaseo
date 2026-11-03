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
		expect(normalizeWebhookEndpointEvents(undefined)).toContain("batch.expired");
		expect(normalizeWebhookEndpointEvents([" Batch.Completed ", "batch.completed", "video.failed"])).toEqual([
			"batch.completed",
			"video.failed",
		]);
		expect(normalizeWebhookEndpointEvents(["batch.completed", "unknown.completed"])).toEqual([
			"batch.completed",
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
		for (const url of [
			"https://[::ffff:127.0.0.1]/hooks",
			"https://[::ffff:7f00:1]/hooks",
			"https://[::7f00:1]/hooks",
			"https://[64:ff9b::7f00:1]/hooks",
		]) {
			expect(validateWebhookEndpointUrl(url)).toEqual({
				ok: false,
				reason: "webhook_url_private_network_not_allowed",
			});
		}
		expect(validateWebhookEndpointUrl("https://[::ffff:808:808]/hooks")).toEqual({
			ok: true,
			url: "https://[::ffff:808:808]/hooks",
		});
	});

	it("treats IPv6 tunnel and embedded-IPv4 forms of private addresses as private", () => {
		for (const url of [
			"https://[2002:7f00:1::1]/hooks", // 6to4 of 127.0.0.1
			"https://[2002:a9fe:a9fe::]/hooks", // 6to4 of 169.254.169.254
			"https://[2002:c0a8:101::1]/hooks", // 6to4 of 192.168.1.1
			"https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/hooks", // Teredo
			"https://[2001::1]/hooks", // Teredo, compressed
			"https://[fec0::1]/hooks", // site-local
			"https://[feff::1]/hooks", // site-local, top of range
			"https://[::ffff:a9fe:a9fe]/hooks", // IPv4-mapped, hex form
			"https://[::ffff:0:7f00:1]/hooks", // IPv4-translated
			"https://[64:ff9b::a9fe:a9fe]/hooks", // NAT64 of 169.254.169.254
			"https://[64:ff9b:1::1]/hooks", // NAT64 local-use
		]) {
			expect(validateWebhookEndpointUrl(url), url).toEqual({
				ok: false,
				reason: "webhook_url_private_network_not_allowed",
			});
		}
		for (const url of [
			"https://[2606:4700:4700::1111]/hooks", // public IPv6
			"https://[2002:808:808::1]/hooks", // 6to4 of 8.8.8.8
			"https://[2001:4860:4860::8888]/hooks", // 2001::/16 outside Teredo
			"https://[64:ff9b::808:808]/hooks", // NAT64 of 8.8.8.8
		]) {
			expect(validateWebhookEndpointUrl(url), url).toEqual({ ok: true, url });
		}
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
		await expect(validateWebhookEndpointUrlForDelivery("https://customer.example/hooks", {
			forceDns: true,
			resolveAddresses: async () => ["::ffff:7f00:1"],
		})).resolves.toEqual({
			ok: false,
			reason: "webhook_url_private_network_not_allowed",
		});
	});
});
