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

export type WebhookEndpointUrlValidation =
	| { ok: true; url: string }
	| {
			ok: false;
			reason:
				| "webhook_url_required"
				| "webhook_url_invalid"
				| "webhook_url_must_use_https"
				| "webhook_url_private_network_not_allowed"
				| "webhook_url_dns_resolution_failed";
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

function normalizeHostname(value: string): string {
	return value.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isPrivateIpv4(hostname: string): boolean {
	const octets = hostname.split(".");
	if (octets.length !== 4) return false;
	const parts = octets.map((part) => {
		if (!/^\d+$/.test(part)) return Number.NaN;
		const value = Number(part);
		return Number.isInteger(value) && value >= 0 && value <= 255 ? value : Number.NaN;
	});
	if (parts.some((part) => Number.isNaN(part))) return false;
	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		(a === 100 && b >= 64 && b <= 127) ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function isPrivateIpv6(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	if (!hostname) return true;
	if (hostname === "::" || hostname === "::1") return true;
	if (hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
	if (hostname.startsWith("fe8") || hostname.startsWith("fe9") || hostname.startsWith("fea") || hostname.startsWith("feb")) return true;
	if (hostname.startsWith("ff")) return true;
	const mappedIpv4 = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
	return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

function isPrivateOrLocalhostLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	if (!hostname) return true;
	if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
	if (isPrivateIpv4(hostname)) return true;
	if (isPrivateIpv6(hostname)) return true;
	return false;
}

function isIpLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	return isPrivateIpv4(hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":");
}

export function validateWebhookEndpointUrl(value: unknown): WebhookEndpointUrlValidation {
	const text = normalizeText(value);
	if (!text) return { ok: false, reason: "webhook_url_required" };
	let parsed: URL;
	try {
		parsed = new URL(text);
	} catch {
		return { ok: false, reason: "webhook_url_invalid" };
	}
	if (parsed.protocol !== "https:") {
		return { ok: false, reason: "webhook_url_must_use_https" };
	}
	if (isPrivateOrLocalhostLiteral(parsed.hostname)) {
		return { ok: false, reason: "webhook_url_private_network_not_allowed" };
	}
	parsed.hash = "";
	return { ok: true, url: parsed.toString() };
}

type DnsResolver = (hostname: string) => Promise<string[]>;

async function resolveWebhookDnsAddresses(hostname: string): Promise<string[]> {
	const out = new Set<string>();
	for (const type of ["A", "AAAA"] as const) {
		const url = new URL("https://cloudflare-dns.com/dns-query");
		url.searchParams.set("name", hostname);
		url.searchParams.set("type", type);
		const response = await fetch(url.toString(), {
			headers: { Accept: "application/dns-json" },
		});
		if (!response.ok) throw new Error(`webhook_dns_${type.toLowerCase()}_${response.status}`);
		const payload = await response.json().catch(() => null) as { Answer?: Array<{ data?: unknown }> } | null;
		for (const answer of Array.isArray(payload?.Answer) ? payload.Answer : []) {
			const data = normalizeText(answer.data);
			if (data && (/^\d+\.\d+\.\d+\.\d+$/.test(data) || data.includes(":"))) {
				out.add(data);
			}
		}
	}
	return [...out];
}

function shouldSkipDnsPreflight(): boolean {
	return process.env.NODE_ENV === "test";
}

export async function validateWebhookEndpointUrlForDelivery(
	value: unknown,
	options?: {
		resolveAddresses?: DnsResolver;
		forceDns?: boolean;
	},
): Promise<WebhookEndpointUrlValidation> {
	const validated = validateWebhookEndpointUrl(value);
	if (!validated.ok) return validated;
	const hostname = new URL(validated.url).hostname;
	if (isIpLiteral(hostname)) return validated;
	if (!options?.forceDns && shouldSkipDnsPreflight()) return validated;
	const resolveAddresses = options?.resolveAddresses ?? resolveWebhookDnsAddresses;
	let addresses: string[];
	try {
		addresses = await resolveAddresses(hostname);
	} catch {
		return { ok: false, reason: "webhook_url_dns_resolution_failed" };
	}
	if (addresses.length === 0) {
		return { ok: false, reason: "webhook_url_dns_resolution_failed" };
	}
	if (addresses.some((address) => isPrivateOrLocalhostLiteral(address))) {
		return { ok: false, reason: "webhook_url_private_network_not_allowed" };
	}
	return validated;
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

type WebhookEncryptionMaterial = { version: string; material: string };

function resolveActiveWebhookEncryptionMaterial(): WebhookEncryptionMaterial {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const material = normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ?? normalizeText(bindings.WEBHOOK_SECRET_ENCRYPTION_KEY);
	if (!material) throw new Error("dedicated_webhook_secret_encryption_key_missing");
	return {
		version: normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION) ?? "v1",
		material,
	};
}

function resolveWebhookDecryptionMaterials(preferredVersion?: string | null): WebhookEncryptionMaterial[] {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const out: WebhookEncryptionMaterial[] = [];
	const active = normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ?? normalizeText(bindings.WEBHOOK_SECRET_ENCRYPTION_KEY);
	if (active) out.push({ version: normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION) ?? "v1", material: active });
	const previous = normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS);
	if (previous) out.push({ version: normalizeText(bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS_VERSION) ?? "previous", material: previous });
	const legacy = normalizeText(bindings.KEY_PEPPER_ACTIVE) ?? normalizeText(bindings.KEY_PEPPER);
	if (legacy) out.push({ version: "legacy-key-pepper", material: legacy });
	const unique = out.filter((entry, index, values) => values.findIndex((candidate) => candidate.version === entry.version && candidate.material === entry.material) === index);
	if (!preferredVersion) return unique;
	return [...unique.filter((entry) => entry.version === preferredVersion), ...unique.filter((entry) => entry.version !== preferredVersion)];
}

async function importAesKey(material: string): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hmacSecret(secret: string): Promise<string> {
	const material = resolveActiveWebhookEncryptionMaterial().material;
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
	secretKeyVersion: string;
}> {
	const encryption = resolveActiveWebhookEncryptionMaterial();
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await importAesKey(encryption.material),
		new TextEncoder().encode(secret),
	);
	return {
		secretCiphertext: bytesToBase64(new Uint8Array(ciphertext)),
		secretIv: bytesToBase64(iv),
		secretHash: await hmacSecret(secret),
		secretKeyVersion: encryption.version,
	};
}

export async function decryptWebhookSecret(args: {
	secretCiphertext: string;
	secretIv: string;
	secretKeyVersion?: string | null;
}): Promise<string> {
	let lastError: unknown = null;
	for (const candidate of resolveWebhookDecryptionMaterials(args.secretKeyVersion)) {
		try {
			const plaintext = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: base64ToBytes(args.secretIv) },
				await importAesKey(candidate.material),
				base64ToBytes(args.secretCiphertext),
			);
			return new TextDecoder().decode(plaintext);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError ?? new Error("webhook_secret_decryption_key_missing");
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
		.select("id, workspace_id, url, status, events, secret_ciphertext, secret_iv, secret_key_version")
		.eq("workspace_id", args.workspaceId)
		.eq("id", endpointId)
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to load webhook endpoint");
	if (!data || String((data as any).status ?? "") !== "active") return null;
	const validatedUrl = await validateWebhookEndpointUrlForDelivery((data as any).url);
	if (!validatedUrl.ok) return null;
	const secretCiphertext = normalizeText((data as any).secret_ciphertext);
	const secretIv = normalizeText((data as any).secret_iv);
	if (!secretCiphertext || !secretIv) {
		console.warn("webhook_endpoint_missing_secret_material", {
			workspaceId: args.workspaceId,
			endpointId,
		});
		return null;
	}
	let secret: string;
	try {
		secret = await decryptWebhookSecret({
			secretCiphertext,
			secretIv,
			secretKeyVersion: normalizeText((data as any).secret_key_version),
		});
	} catch {
		console.warn("webhook_endpoint_secret_decryption_failed", {
			workspaceId: args.workspaceId,
			endpointId,
		});
		return null;
	}
	return {
		id: String((data as any).id ?? ""),
		url: validatedUrl.url,
		secret,
		events: normalizeWebhookEndpointEvents((data as any).events),
	};
}
