import { GATEWAY_API_KEY, sleep } from "./live-gateway.helpers";

export type LiveBatchWebhookFixture = {
	endpointId: string;
	receiverToken: string;
	receiverUrl: string;
	signingSecret: string;
};

export type LiveWebhookRequest = {
	uuid: string;
	method: string;
	content: string;
	headers: Record<string, string[]>;
	created_at: string;
};

export function normalizeLiveEnv(value: string | undefined): string {
	return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

export function requireLiveEnv(name: string): string {
	const value = normalizeLiveEnv(process.env[name]);
	if (!value) throw new Error(`${name} is required for live batch tests`);
	return value;
}

function gatewayKeyKid(): string {
	const match = GATEWAY_API_KEY.match(/^aistats_v1_sk_([^_]+)_/);
	if (!match?.[1]) throw new Error("Expected structured Phaseo API key");
	return match[1];
}

export async function supabaseAdminRest<T>(args: {
	pathname: string;
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}): Promise<T> {
	const supabaseUrl = normalizeLiveEnv(process.env.SUPABASE_URL) || requireLiveEnv("NEXT_PUBLIC_SUPABASE_URL");
	const serviceRole = requireLiveEnv("SUPABASE_SERVICE_ROLE_KEY");
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
	const body = await response.text();
	if (!response.ok) throw new Error(`Supabase REST ${args.method ?? "GET"} ${args.pathname} failed (${response.status}): ${body}`);
	return (body ? JSON.parse(body) : null) as T;
}

export async function resolveLiveWorkspaceId(): Promise<string> {
	const rows = await supabaseAdminRest<Array<{ workspace_id?: string }>>({
		pathname: `keys?select=workspace_id&kid=eq.${encodeURIComponent(gatewayKeyKid())}&limit=1`,
	});
	const workspaceId = String(rows[0]?.workspace_id ?? "").trim();
	if (!workspaceId) throw new Error("Could not resolve workspace_id for live gateway key");
	return workspaceId;
}

function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

function randomToken(bytes = 32): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return bytesToBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function webhookEncryptionMaterial(): string {
	return normalizeLiveEnv(process.env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY)
		|| normalizeLiveEnv(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY)
		|| normalizeLiveEnv(process.env.KEY_PEPPER_ACTIVE)
		|| normalizeLiveEnv(process.env.KEY_PEPPER);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function encryptWebhookSecret(secret: string): Promise<{ ciphertext: string; iv: string; hash: string }> {
	const material = webhookEncryptionMaterial();
	if (!material) throw new Error("ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY or KEY_PEPPER_ACTIVE is required");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
	return {
		ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
		iv: bytesToBase64(iv),
		hash: await hmacSha256Hex(material, secret),
	};
}

async function createWebhookSiteToken(): Promise<string> {
	const response = await fetch("https://webhook.site/token", { method: "POST" });
	if (!response.ok) throw new Error(`Failed to create webhook.site token: ${response.status} ${await response.text()}`);
	const payload = await response.json() as { uuid?: string };
	const token = String(payload.uuid ?? "").trim();
	if (!token) throw new Error("webhook.site did not return a token");
	return token;
}

export async function createLiveBatchWebhookFixture(workspaceId: string): Promise<LiveBatchWebhookFixture> {
	const receiverToken = await createWebhookSiteToken();
	const receiverUrl = `https://webhook.site/${receiverToken}`;
	const signingSecret = `whsec_${randomToken(32)}`;
	const encrypted = await encryptWebhookSecret(signingSecret);
	const rows = await supabaseAdminRest<Array<{ id?: string }>>({
		pathname: "gateway_webhook_endpoints?select=id",
		method: "POST",
		headers: { Prefer: "return=representation" },
		body: {
			workspace_id: workspaceId,
			name: `Live provider batch matrix ${Date.now()}`,
			url: receiverUrl,
			events: ["batch.completed", "batch.failed", "batch.cancelled"],
			status: "active",
			secret_ciphertext: encrypted.ciphertext,
			secret_iv: encrypted.iv,
			secret_hash: encrypted.hash,
		},
	});
	const endpointId = String(rows[0]?.id ?? "").trim();
	if (!endpointId) throw new Error("Failed to create managed webhook endpoint fixture");
	return { endpointId, receiverToken, receiverUrl, signingSecret };
}

export async function deleteLiveBatchWebhookFixture(endpointId: string): Promise<void> {
	await supabaseAdminRest<null>({
		pathname: `gateway_webhook_endpoints?id=eq.${encodeURIComponent(endpointId)}`,
		method: "PATCH",
		headers: { Prefer: "return=minimal" },
		body: { status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
	});
}

async function listWebhookRequests(token: string): Promise<LiveWebhookRequest[]> {
	const response = await fetch(`https://webhook.site/token/${encodeURIComponent(token)}/requests?sorting=newest`);
	if (!response.ok) throw new Error(`Failed to list webhook.site requests: ${response.status} ${await response.text()}`);
	const payload = await response.json() as { data?: LiveWebhookRequest[] };
	return Array.isArray(payload.data) ? payload.data : [];
}

export async function waitForBatchWebhook(args: {
	receiverToken: string;
	batchId: string;
	eventType: string;
	attempts: number;
	delayMs: number;
}): Promise<LiveWebhookRequest | null> {
	for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
		const requests = await listWebhookRequests(args.receiverToken);
		const found = requests.find((request) => {
			if (request.method !== "POST") return false;
			try {
				const payload = JSON.parse(request.content);
				return payload?.type === args.eventType && payload?.data?.id === args.batchId;
			} catch {
				return false;
			}
		}) ?? null;
		if (found) return found;
		if (attempt < args.attempts) await sleep(args.delayMs);
	}
	return null;
}

export function webhookHeader(request: LiveWebhookRequest, name: string): string | null {
	const target = name.toLowerCase();
	const entry = Object.entries(request.headers).find(([key]) => key.toLowerCase() === target);
	return entry?.[1]?.[0] ?? null;
}
