import { getBindings, getSupabaseAdmin } from "@/runtime/env";

export type WebhookEndpointStatus = "active" | "disabled" | "deleted";

export type WebhookEndpointRecord = {
	id: string;
	workspaceId: string;
	name: string;
	url: string;
	status: WebhookEndpointStatus;
	events: string[];
	hasSecret: boolean;
	createdBy: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	deletedAt: string | null;
};

export type WebhookEndpointSigningConfig = {
	id: string;
	url: string;
	secret: string;
	events: string[];
};

const DEFAULT_WEBHOOK_EVENTS = [
	"video.completed",
	"video.failed",
	"video.cancelled",
	"batch.completed",
	"batch.failed",
	"batch.cancelled",
] as const;

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function randomToken(bytes = 32): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return bytesToBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function resolveWebhookEncryptionMaterial(): string {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const secret =
		normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		normalizeText(bindings.WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		normalizeText(bindings.KEY_PEPPER_ACTIVE) ??
		normalizeText(bindings.KEY_PEPPER);
	if (!secret) throw new Error("webhook_secret_encryption_key_missing");
	return secret;
}

async function importAesKey(): Promise<CryptoKey> {
	const material = resolveWebhookEncryptionMaterial();
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hmacSecret(secret: string): Promise<string> {
	const material = resolveWebhookEncryptionMaterial();
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(material),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(secret));
	return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptWebhookSecret(secret: string): Promise<{
	secretCiphertext: string;
	secretIv: string;
	secretHash: string;
}> {
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await importAesKey(),
		new TextEncoder().encode(secret),
	);
	return {
		secretCiphertext: bytesToBase64(new Uint8Array(ciphertext)),
		secretIv: bytesToBase64(iv),
		secretHash: await hmacSecret(secret),
	};
}

export async function decryptWebhookSecret(args: {
	secretCiphertext: string;
	secretIv: string;
}): Promise<string> {
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: base64ToBytes(args.secretIv) },
		await importAesKey(),
		base64ToBytes(args.secretCiphertext),
	);
	return new TextDecoder().decode(plaintext);
}

export function generateWebhookSigningSecret(): string {
	return `whsec_${randomToken(32)}`;
}

export function normalizeWebhookEndpointEvents(value: unknown): string[] {
	const source = Array.isArray(value) ? value : DEFAULT_WEBHOOK_EVENTS;
	const out = source
		.map((entry) => normalizeText(entry)?.toLowerCase())
		.filter((entry): entry is string => Boolean(entry));
	return [...new Set(out.length > 0 ? out : [...DEFAULT_WEBHOOK_EVENTS])];
}

export function toPublicWebhookEndpoint(row: Record<string, unknown>): WebhookEndpointRecord {
	return {
		id: String(row.id ?? ""),
		workspaceId: String(row.workspace_id ?? ""),
		name: String(row.name ?? ""),
		url: String(row.url ?? ""),
		status: (normalizeText(row.status) as WebhookEndpointStatus | null) ?? "active",
		events: normalizeWebhookEndpointEvents(row.events),
		hasSecret: Boolean(normalizeText(row.secret_ciphertext)),
		createdBy: normalizeText(row.created_by),
		createdAt: normalizeText(row.created_at),
		updatedAt: normalizeText(row.updated_at),
		deletedAt: normalizeText(row.deleted_at),
	};
}

export async function getWebhookEndpointSigningConfig(args: {
	workspaceId: string;
	endpointId: string;
}): Promise<WebhookEndpointSigningConfig | null> {
	const endpointId = normalizeText(args.endpointId);
	if (!args.workspaceId || !endpointId) return null;
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.select("id, workspace_id, url, status, events, secret_ciphertext, secret_iv")
		.eq("workspace_id", args.workspaceId)
		.eq("id", endpointId)
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to load webhook endpoint");
	if (!data || String((data as any).status ?? "") !== "active") return null;
	const secret = await decryptWebhookSecret({
		secretCiphertext: String((data as any).secret_ciphertext ?? ""),
		secretIv: String((data as any).secret_iv ?? ""),
	});
	return {
		id: String((data as any).id ?? ""),
		url: String((data as any).url ?? ""),
		secret,
		events: normalizeWebhookEndpointEvents((data as any).events),
	};
}
