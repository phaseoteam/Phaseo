import { describe, expect, it } from "vitest";
import type { Env } from "@/env";
import { isSignedNotificationDestinationType, issueNotificationSigningSecret } from "./notification-destinations";

const env = { ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-notification-encryption-key", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "v2" } as unknown as Env;

// The gateway's decryptWebhookSecret: AES-GCM keyed by SHA-256 of the shared key material.
async function gatewayDecrypt(ciphertext: string, iv: string, material: string) {
	const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv) }, key, bytes(ciphertext)));
}

describe("notification signing secrets", () => {
	it("issues a whsec_ secret the gateway can decrypt", async () => {
		const issued = await issueNotificationSigningSecret(env, new Date("2026-10-21T10:00:00.000Z"));
		expect(issued.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
		expect(issued.columns.signing_secret_ciphertext).not.toContain(issued.secret);
		expect(issued.columns.signing_secret_key_version).toBe("v2");
		expect(issued.columns.signing_secret_rotated_at).toBe("2026-10-21T10:00:00.000Z");
		await expect(gatewayDecrypt(issued.columns.signing_secret_ciphertext, issued.columns.signing_secret_iv, "test-notification-encryption-key")).resolves.toBe(issued.secret);
	});

	it("issues a different secret every time", async () => {
		const [a, b] = await Promise.all([issueNotificationSigningSecret(env), issueNotificationSigningSecret(env)]);
		expect(a.secret).not.toBe(b.secret);
		expect(a.columns.signing_secret_iv).not.toBe(b.columns.signing_secret_iv);
	});

	it("signs custom webhooks only", () => {
		expect(isSignedNotificationDestinationType("custom_webhook")).toBe(true);
		for (const type of ["email", "slack", "discord", "discord_webhook", "microsoft_teams"]) expect(isSignedNotificationDestinationType(type)).toBe(false);
	});
});
