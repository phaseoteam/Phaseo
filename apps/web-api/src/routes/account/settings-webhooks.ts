import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

const DEFAULT_EVENTS = [
	"job.status_changed",
	"job.completed",
	"job.failed",
	"job.cancelled",
	"job.expired",
];

const SUPPORTED_EVENTS = new Set([
	"job.created",
	"job.status_changed",
	"job.progress",
	"job.completed",
	"job.failed",
	"job.cancelled",
	"job.expired",
	"video.created",
	"video.status_changed",
	"video.progress",
	"video.completed",
	"video.failed",
	"video.cancelled",
	"video.expired",
	"batch.created",
	"batch.status_changed",
	"batch.progress",
	"batch.completed",
	"batch.failed",
	"batch.cancelled",
	"batch.expired",
]);

function text(value: unknown): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || null;
}

function eventName(value: unknown): string | null {
	const normalized = text(value)?.toLowerCase().replace(/\.canceled$/, ".cancelled");
	return normalized && SUPPORTED_EVENTS.has(normalized) ? normalized : null;
}

export function normalizeWebhookEventList(value: unknown): string[] {
	if (value === undefined) return [...DEFAULT_EVENTS];
	if (!Array.isArray(value)) throw new Error("Webhook events must be an array");

	const normalizedEntries = value.map(eventName);
	if (normalizedEntries.some((entry) => entry === null)) {
		throw new Error("Webhook events include an unsupported event");
	}
	const normalized = [...new Set(normalizedEntries.filter((entry): entry is string => Boolean(entry)))];
	if (normalized.length === 0) throw new Error("Choose at least one webhook event");
	return normalized;
}

function events(value: unknown): string[] {
	return normalizeWebhookEventList(value);
}

function endpointName(value: unknown): string {
	const name = text(value) ?? "Async job updates";
	if (name.length > 120) throw new Error("Webhook name must be 120 characters or fewer");
	return name;
}

function privateAddress(host: string): boolean {
	const value = host.toLowerCase().replace(/^\[|\]$/g, "");
	return (
		!value ||
		value === "localhost" ||
		value.endsWith(".localhost") ||
		/^(0|10|127|169\.254|192\.168)\./.test(value) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
		value === "::" ||
		value === "::1" ||
		/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value)
	);
}

async function endpoint(value: unknown): Promise<string> {
	const input = text(value);
	if (!input) throw new Error("Webhook URL is required");
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error("Webhook URL must be a valid URL");
	}
	if (url.protocol !== "https:") throw new Error("Webhook URL must use https");
	if (url.username || url.password || privateAddress(url.hostname)) {
		throw new Error("Webhook URL must not target a private network");
	}
	url.hash = "";
	return url.toString();
}

function bytes(value: Uint8Array): ArrayBuffer {
	return Uint8Array.from(value).buffer;
}

function base64(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): ArrayBuffer {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer;
}

function secretMaterial(env: Env): string {
	const value =
		text(env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		text(env.WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		text(env.KEY_PEPPER_ACTIVE);
	if (!value) throw new Error("Webhook secret encryption key is missing");
	return value;
}

function signingSecret(): string {
	const value = crypto.getRandomValues(new Uint8Array(32));
	return `whsec_${base64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

async function encrypt(env: Env, secret: string) {
	const material = new TextEncoder().encode(secretMaterial(env));
	const digest = await crypto.subtle.digest("SHA-256", material);
	const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: bytes(iv) },
		key,
		new TextEncoder().encode(secret),
	);
	const hmacKey = await crypto.subtle.importKey(
		"raw",
		bytes(material),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(secret)));
	return {
		secret_ciphertext: base64(new Uint8Array(ciphertext)),
		secret_iv: base64(iv),
		secret_hash: [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
	};
}

async function decrypt(env: Env, row: Record<string, unknown>): Promise<string> {
	const ciphertext = text(row.secret_ciphertext);
	const iv = text(row.secret_iv);
	if (!ciphertext || !iv) throw new Error("Webhook signing secret is unavailable");
	const preferredVersion = text(row.secret_key_version);
	const candidates = [
		{ value: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY, version: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION ?? "v1" },
		{ value: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS, version: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS_VERSION ?? "previous" },
		{ value: env.WEBHOOK_SECRET_ENCRYPTION_KEY, version: "v1" },
		{ value: env.KEY_PEPPER_ACTIVE, version: "legacy-key-pepper" },
	].filter((candidate): candidate is { value: string; version: string } => Boolean(candidate.value?.trim()));
	candidates.sort((left, right) => Number(right.version === preferredVersion) - Number(left.version === preferredVersion));
	for (const candidate of candidates) {
		try {
			const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate.value));
			const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
			const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
			return new TextDecoder().decode(plaintext);
		} catch {}
	}
	throw new Error("Webhook signing secret could not be decrypted");
}

async function signature(secret: string, timestamp: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
	return [...signed].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function adminContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({
		request: c.req.raw,
		env: c.env,
		workspaceId: String(workspaceId ?? ""),
	});
	return context && ["owner", "admin"].includes(context.role.toLowerCase()) ? context : null;
}

export const accountSettingsWebhooksRouter = new Hono<{ Bindings: Env }>();

accountSettingsWebhooksRouter.get("/webhooks", async (c) => {
	const context = await adminContext(c, c.req.query("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client
		.from("gateway_webhook_endpoints")
		.select("id,name,url,status,events,secret_ciphertext,created_at,updated_at")
		.eq("workspace_id", context.workspaceId)
		.neq("status", "deleted")
		.order("created_at", { ascending: false });
	if (result.error) return c.json({ error: "webhooks_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json(
		{
			endpoints: (result.data ?? []).map((row) => ({
				id: String(row.id),
				name: String(row.name ?? "Async job updates"),
				url: String(row.url ?? ""),
				status: String(row.status ?? "active"),
				events: Array.isArray(row.events) ? row.events.map(String) : [],
				hasSecret: Boolean(row.secret_ciphertext),
				createdAt: row.created_at ?? null,
				updatedAt: row.updated_at ?? null,
			})),
		},
		200,
		PRIVATE_NO_STORE_HEADERS,
	);
});

accountSettingsWebhooksRouter.post("/webhooks", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const secret = signingSecret();
		const encrypted = await encrypt(c.env, secret);
		const result = await context.client
			.from("gateway_webhook_endpoints")
			.insert({
				workspace_id: context.workspaceId,
				name: endpointName(body.name),
				url: await endpoint(body.url),
				events: events(body.events),
				status: "active",
				...encrypted,
				created_by: context.user.id,
			})
			.select("id")
			.single();
		if (result.error) throw result.error;
		return c.json({ ok: true, id: String(result.data.id), signingSecret: secret }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "webhook_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsWebhooksRouter.patch("/webhooks/:endpointId", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (Object.prototype.hasOwnProperty.call(body, "name")) updates.name = endpointName(body.name);
		if (Object.prototype.hasOwnProperty.call(body, "url")) updates.url = await endpoint(body.url);
		if (Object.prototype.hasOwnProperty.call(body, "events")) updates.events = events(body.events);
		if (Object.keys(updates).length === 1) return c.json({ error: "No webhook changes supplied" }, 400, PRIVATE_NO_STORE_HEADERS);

		const result = await context.client
			.from("gateway_webhook_endpoints")
			.update(updates)
			.eq("id", c.req.param("endpointId"))
			.eq("workspace_id", context.workspaceId)
			.neq("status", "deleted")
			.select("id")
			.maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return c.json({ error: "Webhook endpoint not found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "webhook_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsWebhooksRouter.put("/webhooks/:endpointId/status", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!["active", "disabled"].includes(body.status)) return c.json({ error: "invalid_status" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client
		.from("gateway_webhook_endpoints")
		.update({ status: body.status, updated_at: new Date().toISOString() })
		.eq("id", c.req.param("endpointId"))
		.eq("workspace_id", context.workspaceId)
		.neq("status", "deleted");
	if (result.error) return c.json({ error: "webhook_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsWebhooksRouter.post("/webhooks/:endpointId/rotate", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const secret = signingSecret();
		const result = await context.client
			.from("gateway_webhook_endpoints")
			.update({ ...(await encrypt(c.env, secret)), updated_at: new Date().toISOString() })
			.eq("id", c.req.param("endpointId"))
			.eq("workspace_id", context.workspaceId)
			.neq("status", "deleted")
			.select("id")
			.maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return c.json({ error: "Webhook endpoint not found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return c.json({ ok: true, signingSecret: secret }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "webhook_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsWebhooksRouter.post("/webhooks/:endpointId/test", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const endpointId = c.req.param("endpointId");
	const result = await context.client
		.from("gateway_webhook_endpoints")
		.select("id,url,status,secret_ciphertext,secret_iv,secret_key_version")
		.eq("id", endpointId)
		.eq("workspace_id", context.workspaceId)
		.neq("status", "deleted")
		.maybeSingle();
	if (result.error) return c.json({ error: "webhooks_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data) return c.json({ error: "Webhook endpoint not found" }, 404, PRIVATE_NO_STORE_HEADERS);
	if (String(result.data.status) !== "active") return c.json({ error: "Enable the endpoint before sending a test" }, 409, PRIVATE_NO_STORE_HEADERS);
	try {
		const url = await endpoint(result.data.url);
		const secret = await decrypt(c.env, result.data as Record<string, unknown>);
		const eventId = `evt_test_${crypto.randomUUID()}`;
		const payload = JSON.stringify({
			id: eventId,
			type: "webhook.test",
			created_at: Math.floor(Date.now() / 1000),
			delivery: { key: eventId, attempt: 1, max_attempts: 1 },
			data: { object: "webhook_endpoint", endpoint_id: endpointId, test: true },
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30_000);
		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				redirect: "manual",
				signal: controller.signal,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "Phaseo-Async-Webhook/1.0",
					"x-phaseo-event-id": eventId,
					"x-phaseo-event-type": "webhook.test",
					"x-phaseo-delivery-key": eventId,
					"x-phaseo-attempt": "1",
					"x-phaseo-max-attempts": "1",
					"x-phaseo-timestamp": timestamp,
					"x-phaseo-signature": await signature(secret, timestamp, payload),
				},
				body: payload,
			});
		} finally {
			clearTimeout(timeout);
		}
		const redirected = response.status >= 300 && response.status < 400;
		const ok = response.ok && !redirected;
		return c.json({
			ok,
			event_id: eventId,
			status_code: response.status,
			error: redirected ? "Webhook redirects are not allowed" : ok ? null : `Destination returned HTTP ${response.status}`,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		const message = error instanceof Error && error.name === "AbortError" ? "Test delivery timed out after 30 seconds" : error instanceof Error ? error.message : "Test delivery failed";
		return c.json({ ok: false, event_id: null, status_code: null, error: message }, 200, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsWebhooksRouter.delete("/webhooks/:endpointId", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const now = new Date().toISOString();
	const result = await context.client
		.from("gateway_webhook_endpoints")
		.update({ status: "deleted", deleted_at: now, updated_at: now })
		.eq("id", c.req.param("endpointId"))
		.eq("workspace_id", context.workspaceId)
		.neq("status", "deleted");
	if (result.error) return c.json({ error: "webhook_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
