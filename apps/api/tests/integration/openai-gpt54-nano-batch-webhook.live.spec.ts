import { beforeAll, describe, expect, it } from "vitest";
import {
	LIVE_RUN,
	GATEWAY_API_KEY,
	assertOk,
	getGateway,
	postJson,
	requireGatewayApiKey,
	sleep,
} from "./live-gateway.helpers";

const LIVE_OPENAI_BATCH_WEBHOOK_RUN =
	(process.env.LIVE_OPENAI_BATCH_WEBHOOK_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_OPENAI_BATCH_WEBHOOK_RUN ? describe : describe.skip;

const MODEL = (process.env.LIVE_OPENAI_BATCH_WEBHOOK_MODEL ?? "openai/gpt-5.4-nano").trim();
const POLL_ATTEMPTS = Number(process.env.LIVE_OPENAI_BATCH_WEBHOOK_POLL_ATTEMPTS ?? "120");
const POLL_DELAY_MS = Number(process.env.LIVE_OPENAI_BATCH_WEBHOOK_POLL_DELAY_MS ?? "30000");
const WEBHOOK_POLL_ATTEMPTS = Number(process.env.LIVE_OPENAI_BATCH_WEBHOOK_DELIVERY_POLL_ATTEMPTS ?? "30");
const WEBHOOK_POLL_DELAY_MS = Number(process.env.LIVE_OPENAI_BATCH_WEBHOOK_DELIVERY_POLL_DELAY_MS ?? "5000");
const TERMINAL_STATES = new Set(["completed", "failed", "expired", "cancelled", "canceled"]);

type WebhookSiteToken = {
	uuid: string;
};

type WebhookSiteRequest = {
	uuid: string;
	method: string;
	content: string;
	headers: Record<string, string[]>;
	created_at: string;
};

type ManagedEndpointFixture = {
	id: string;
	signingSecret: string;
};

function makePrompts(): string[] {
	return [
		'Reply with exactly JSON: {"webhook":true,"index":1}',
	];
}

function normalizeEnv(value: string | undefined): string {
	return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function requireEnv(name: string): string {
	const value = normalizeEnv(process.env[name]);
	if (!value) throw new Error(`${name} is required for the live webhook smoke`);
	return value;
}

function parseGatewayKeyKid(value: string): string {
	const match = value.match(/^aistats_v1_sk_([^_]+)_/);
	if (!match?.[1]) throw new Error("Expected structured AI Stats API key");
	return match[1];
}

function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

function randomToken(bytes = 32): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return bytesToBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function resolveWebhookSecretMaterial(): string {
	return (
		normalizeEnv(process.env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ||
		normalizeEnv(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY) ||
		normalizeEnv(process.env.KEY_PEPPER_ACTIVE) ||
		normalizeEnv(process.env.KEY_PEPPER)
	);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return Array.from(new Uint8Array(signature))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
}

async function encryptWebhookSecret(secret: string): Promise<{
	secretCiphertext: string;
	secretIv: string;
	secretHash: string;
}> {
	const material = resolveWebhookSecretMaterial();
	if (!material) throw new Error("KEY_PEPPER_ACTIVE or webhook secret encryption key is required");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(secret),
	);
	return {
		secretCiphertext: bytesToBase64(new Uint8Array(ciphertext)),
		secretIv: bytesToBase64(iv),
		secretHash: await hmacSha256Hex(material, secret),
	};
}

function headerValue(headers: Record<string, string[]>, name: string): string | null {
	const target = name.toLowerCase();
	const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
	return entry?.[1]?.[0] ?? null;
}

async function supabaseRest<T>(args: {
	pathname: string;
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}): Promise<T> {
	const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL) || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
	const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
	const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${args.pathname.replace(/^\/+/, "")}`, {
		method: args.method ?? "GET",
		headers: {
			apikey: serviceRole,
			Authorization: `Bearer ${serviceRole}`,
			"Content-Type": "application/json",
			...(args.headers ?? {}),
		},
		body: args.body === undefined ? undefined : JSON.stringify(args.body),
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Supabase REST ${args.method ?? "GET"} ${args.pathname} failed (${response.status}): ${text}`);
	}
	return (text ? JSON.parse(text) : null) as T;
}

async function resolveWorkspaceIdFromGatewayKey(): Promise<string> {
	const kid = parseGatewayKeyKid(GATEWAY_API_KEY);
	const rows = await supabaseRest<Array<{ workspace_id?: string }>>({
		pathname: `keys?select=workspace_id&kid=eq.${encodeURIComponent(kid)}&limit=1`,
	});
	const workspaceId = String(rows[0]?.workspace_id ?? "").trim();
	if (!workspaceId) throw new Error("Could not resolve workspace_id for live gateway key");
	return workspaceId;
}

async function createManagedWebhookEndpoint(args: {
	receiverUrl: string;
}): Promise<ManagedEndpointFixture> {
	const workspaceId = await resolveWorkspaceIdFromGatewayKey();
	const signingSecret = `whsec_${randomToken(32)}`;
	const encrypted = await encryptWebhookSecret(signingSecret);
	const rows = await supabaseRest<Array<{ id: string }>>({
		pathname: "gateway_webhook_endpoints?select=id",
		method: "POST",
		headers: {
			Prefer: "return=representation",
		},
		body: {
			workspace_id: workspaceId,
			name: `Live batch webhook ${Date.now()}`,
			url: args.receiverUrl,
			events: ["batch.completed", "batch.failed", "batch.cancelled"],
			status: "active",
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
		},
	});
	const id = String(rows[0]?.id ?? "").trim();
	if (!id) throw new Error("Failed to create managed webhook endpoint fixture");
	return { id, signingSecret };
}

async function deleteManagedWebhookEndpoint(id: string): Promise<void> {
	await supabaseRest<null>({
		pathname: `gateway_webhook_endpoints?id=eq.${encodeURIComponent(id)}`,
		method: "PATCH",
		headers: {
			Prefer: "return=minimal",
		},
		body: {
			status: "deleted",
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	});
}

async function createWebhookSiteToken(): Promise<WebhookSiteToken> {
	const response = await fetch("https://webhook.site/token", { method: "POST" });
	if (!response.ok) {
		throw new Error(`Failed to create webhook.site token: ${response.status} ${await response.text()}`);
	}
	return response.json() as Promise<WebhookSiteToken>;
}

async function listWebhookSiteRequests(token: string): Promise<WebhookSiteRequest[]> {
	const response = await fetch(`https://webhook.site/token/${encodeURIComponent(token)}/requests?sorting=newest`);
	if (!response.ok) {
		throw new Error(`Failed to list webhook.site requests: ${response.status} ${await response.text()}`);
	}
	const payload = await response.json() as { data?: WebhookSiteRequest[] };
	return Array.isArray(payload.data) ? payload.data : [];
}

async function pollBatch(batchId: string): Promise<any> {
	let latest: any = null;
	for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
		const result = await getGateway(`/batches/${encodeURIComponent(batchId)}`);
		assertOk(result, `/batches/${batchId}`);
		if (!("json" in result)) throw new Error("Expected JSON response from /batches/:id");
		latest = result.json;
		const status = String(latest?.status ?? "").trim().toLowerCase();
		console.log(
			`[openai-gpt54-nano-batch-webhook] poll ${attempt}/${POLL_ATTEMPTS} batch=${batchId} status=${status || "unknown"}`,
		);
		if (TERMINAL_STATES.has(status)) return latest;
		if (attempt < POLL_ATTEMPTS) await sleep(POLL_DELAY_MS);
	}
	return latest;
}

async function pollWebhookDelivery(token: string, batchId: string): Promise<WebhookSiteRequest | null> {
	for (let attempt = 1; attempt <= WEBHOOK_POLL_ATTEMPTS; attempt += 1) {
		const requests = await listWebhookSiteRequests(token);
		const found = requests.find((request) => {
			if (request.method !== "POST") return false;
			try {
				const payload = JSON.parse(request.content);
				return payload?.type === "batch.completed" && payload?.data?.id === batchId;
			} catch {
				return false;
			}
		}) ?? null;
		console.log(
			`[openai-gpt54-nano-batch-webhook] webhook poll ${attempt}/${WEBHOOK_POLL_ATTEMPTS} found=${found ? "yes" : "no"}`,
		);
		if (found) return found;
		if (attempt < WEBHOOK_POLL_ATTEMPTS) await sleep(WEBHOOK_POLL_DELAY_MS);
	}
	return null;
}

describeLive("OpenAI GPT-5.4 Nano live batch webhook", () => {
	beforeAll(() => {
		requireGatewayApiKey();
	}, 30_000);

	it(
		"creates a managed webhook endpoint, runs a batch, and verifies signed delivery",
		async () => {
			const receiver = await createWebhookSiteToken();
			const receiverUrl = `https://webhook.site/${receiver.uuid}`;
			console.log(`[openai-gpt54-nano-batch-webhook] receiver=${receiverUrl}`);

			const endpoint = await createManagedWebhookEndpoint({ receiverUrl });
			const endpointId = endpoint.id;
			const signingSecret = endpoint.signingSecret;
			console.log(`[openai-gpt54-nano-batch-webhook] endpoint=${endpointId}`);

			try {
				const create = await postJson("/batches", {
					model: MODEL,
					prompts: makePrompts(),
					system: "Return only the requested JSON. No markdown.",
					max_tokens: 48,
					completion_window: "24h",
					webhook_endpoint_id: endpointId,
					session_id: `live_openai_gpt54_nano_batch_webhook_${Date.now()}`,
					metadata: {
						test: "openai-gpt54-nano-batch-webhook",
						webhook_endpoint_id: endpointId,
					},
				});
				assertOk(create, "/batches");
				if (!("json" in create)) throw new Error("Expected JSON response from /batches");
				const batchId = String(create.json?.id ?? "");
				expect(batchId.length).toBeGreaterThan(0);
				expect(String(create.json?.provider ?? "")).toBe("openai");
				expect(create.json?.webhook).toMatchObject({
					endpoint_id: endpointId,
					has_secret: true,
				});
				console.log(`[openai-gpt54-nano-batch-webhook] created batch=${batchId} status=${create.json.status}`);

				const latest = await pollBatch(batchId);
				expect(String(latest?.status ?? "").trim().toLowerCase()).toBe("completed");
				expect(latest?.webhook).toMatchObject({
					endpoint_id: endpointId,
					has_secret: true,
				});

				const delivered = await pollWebhookDelivery(receiver.uuid, batchId);
				expect(delivered, `Expected webhook.site to receive batch.completed for ${batchId}`).not.toBeNull();
				if (!delivered) return;
				const timestamp = headerValue(delivered.headers, "x-ai-stats-timestamp");
				const signature = headerValue(delivered.headers, "x-ai-stats-signature");
				expect(timestamp).toMatch(/^\d+$/);
				expect(signature).toBe(
					await hmacSha256Hex(signingSecret, `${timestamp}.${delivered.content}`),
				);
				const payload = JSON.parse(delivered.content);
				expect(payload).toMatchObject({
					type: "batch.completed",
					data: {
						id: batchId,
						object: "batch",
						kind: "batch",
						status: "completed",
						lifecycle_status: "completed",
						webhook: {
							endpoint_id: endpointId,
							has_secret: true,
						},
					},
				});
			} finally {
				if (endpointId) {
					await deleteManagedWebhookEndpoint(endpointId);
				}
			}
		},
		Math.max(
			180_000,
			(POLL_ATTEMPTS * POLL_DELAY_MS) +
				(WEBHOOK_POLL_ATTEMPTS * WEBHOOK_POLL_DELAY_MS) +
				120_000,
		),
	);
});
