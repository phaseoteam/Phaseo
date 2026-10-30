import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	bindings: { ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-notification-encryption-key", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "v1" } as Record<string, string>,
	destination: null as Record<string, unknown> | null,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => ({
		from: () => {
			const query: Record<string, unknown> = {};
			for (const method of ["select", "eq"]) query[method] = () => query;
			query.maybeSingle = async () => ({ data: state.destination, error: null });
			return query;
		},
	}),
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/pipeline/notifications/email-suppressions", () => ({ getEmailSuppressionReason: vi.fn(async () => null) }));

import { buildWebhookSignatureHeaders, encryptWebhookSecret, signWebhookPayload } from "@/core/webhook-endpoints";
import { deliverNotificationTest, resolveDestinationSigningSecret } from "./notification-delivery";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SECRET = "whsec_notification_test_secret";
const fetchMock = vi.fn();

async function destinationRow(args: { type?: string; url?: string; secret?: string | null }) {
	const target = await encryptWebhookSecret(args.url ?? "https://hooks.example.com/phaseo");
	const signing = args.secret ? await encryptWebhookSecret(args.secret) : null;
	return {
		id: "20000000-0000-4000-8000-000000000001",
		workspace_id: WORKSPACE_ID,
		name: "Ops webhook",
		type: args.type ?? "custom_webhook",
		status: "active",
		is_ephemeral: false,
		target_ciphertext: target.secretCiphertext,
		target_iv: target.secretIv,
		target_key_version: target.secretKeyVersion,
		signing_secret_ciphertext: signing?.secretCiphertext ?? null,
		signing_secret_iv: signing?.secretIv ?? null,
		signing_secret_key_version: signing?.secretKeyVersion ?? null,
	};
}

function sentRequest() {
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
	return { url, headers: init.headers as Record<string, string>, body: String(init.body) };
}

beforeEach(() => {
	fetchMock.mockReset().mockImplementation(async () => new Response("ok", { status: 200 }));
	vi.stubGlobal("fetch", fetchMock);
	vi.useFakeTimers({ now: new Date("2026-10-21T10:00:00.000Z"), toFake: ["Date"] });
	state.destination = null;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("webhook signing scheme", () => {
	it("signs hex HMAC-SHA256 over timestamp, a dot and the raw body", async () => {
		const body = JSON.stringify({ id: "event-1", type: "notification_test" });
		const expected = createHmac("sha256", SECRET).update(`1792576800.${body}`).digest("hex");
		await expect(signWebhookPayload(SECRET, "1792576800", body)).resolves.toBe(expected);
	});

	it("builds the x-phaseo-timestamp and x-phaseo-signature headers in Unix seconds", async () => {
		const headers = await buildWebhookSignatureHeaders(SECRET, "{}", new Date("2026-10-21T10:00:00.900Z"));
		expect(headers).toEqual({
			"x-phaseo-timestamp": "1792576800",
			"x-phaseo-signature": createHmac("sha256", SECRET).update("1792576800.{}").digest("hex"),
		});
	});
});

describe("custom webhook notification signing", () => {
	it("signs a saved destination's test send with its secret", async () => {
		state.destination = await destinationRow({ secret: SECRET });
		await expect(deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) })).resolves.toBe(200);
		const { url, headers, body } = sentRequest();
		expect(url).toBe("https://hooks.example.com/phaseo");
		expect(headers["x-phaseo-timestamp"]).toBe("1792576800");
		expect(headers["x-phaseo-signature"]).toBe(createHmac("sha256", SECRET).update(`1792576800.${body}`).digest("hex"));
		expect(headers["x-phaseo-event-type"]).toBe("notification_test");
		expect(headers["x-phaseo-event-id"]).toBe(JSON.parse(body).id);
		expect(headers["content-type"]).toBe("application/json");
	});

	it("fails verification when the body is changed", async () => {
		state.destination = await destinationRow({ secret: SECRET });
		await deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) });
		const { headers, body } = sentRequest();
		const tampered = body.replace("connected", "tampered");
		expect(tampered).not.toBe(body);
		expect(createHmac("sha256", SECRET).update(`${headers["x-phaseo-timestamp"]}.${tampered}`).digest("hex")).not.toBe(headers["x-phaseo-signature"]);
	});

	it("keeps sending legacy destinations without a secret unsigned", async () => {
		state.destination = await destinationRow({ secret: null });
		await expect(deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) })).resolves.toBe(200);
		const { headers } = sentRequest();
		expect(headers).not.toHaveProperty("x-phaseo-signature");
		expect(headers).not.toHaveProperty("x-phaseo-timestamp");
		expect(headers["x-phaseo-event-type"]).toBe("notification_test");
	});

	it("does not send unsigned when a stored secret cannot be decrypted", async () => {
		state.destination = { ...(await destinationRow({ secret: SECRET })), signing_secret_ciphertext: "bm90LXZhbGlk" };
		await expect(deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) })).rejects.toThrow("notification_signing_secret_unavailable");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends unsaved configuration tests unsigned because no secret exists yet", async () => {
		await deliverNotificationTest({ workspaceId: WORKSPACE_ID, type: "custom_webhook", target: "https://hooks.example.com/phaseo" });
		const { headers } = sentRequest();
		expect(headers).not.toHaveProperty("x-phaseo-signature");
	});

	it("only signs custom webhooks", async () => {
		const encrypted = await encryptWebhookSecret(SECRET);
		const columns = { signing_secret_ciphertext: encrypted.secretCiphertext, signing_secret_iv: encrypted.secretIv, signing_secret_key_version: encrypted.secretKeyVersion };
		await expect(resolveDestinationSigningSecret({ type: "slack", ...columns })).resolves.toBeNull();
		await expect(resolveDestinationSigningSecret({ type: "custom_webhook", ...columns })).resolves.toBe(SECRET);
		await expect(resolveDestinationSigningSecret({ type: "custom_webhook", signing_secret_ciphertext: null, signing_secret_iv: null, signing_secret_key_version: null })).resolves.toBeNull();
	});

	it("signs again with a fresh timestamp on each attempt", async () => {
		state.destination = await destinationRow({ secret: SECRET });
		await deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) });
		vi.setSystemTime(new Date("2026-10-21T10:05:00.000Z"));
		await deliverNotificationTest({ workspaceId: WORKSPACE_ID, destinationId: String(state.destination.id) });
		const [first, second] = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
		expect(first["x-phaseo-timestamp"]).toBe("1792576800");
		expect(second["x-phaseo-timestamp"]).toBe("1792577100");
		expect(second["x-phaseo-signature"]).not.toBe(first["x-phaseo-signature"]);
	});
});
