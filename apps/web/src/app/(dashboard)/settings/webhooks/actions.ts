"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { batchApiFlag } from "@/lib/flags";

const DEFAULT_WEBHOOK_EVENTS = [
	"video.completed",
	"video.failed",
	"video.cancelled",
	"batch.completed",
	"batch.failed",
	"batch.cancelled",
];

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeEvents(value: unknown): string[] {
	const source = Array.isArray(value) ? value : DEFAULT_WEBHOOK_EVENTS;
	const events = source
		.map((entry) => normalizeText(entry)?.toLowerCase())
		.filter((entry): entry is string => Boolean(entry));
	return [...new Set(events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS)];
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
	return (
		!hostname ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		isPrivateIpv4(hostname) ||
		isPrivateIpv6(hostname)
	);
}

function isIpLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	return isPrivateIpv4(hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":");
}

async function resolveWebhookDnsAddresses(hostname: string): Promise<string[]> {
	const out = new Set<string>();
	for (const type of ["A", "AAAA"] as const) {
		const url = new URL("https://cloudflare-dns.com/dns-query");
		url.searchParams.set("name", hostname);
		url.searchParams.set("type", type);
		const response = await fetch(url.toString(), {
			headers: { Accept: "application/dns-json" },
		});
		if (!response.ok) throw new Error(`Webhook URL DNS lookup failed (${type})`);
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

async function validateWebhookEndpointUrl(value: unknown): Promise<string> {
	const text = normalizeText(value);
	if (!text) throw new Error("Webhook URL is required");

	let parsed: URL;
	try {
		parsed = new URL(text);
	} catch {
		throw new Error("Webhook URL must be a valid URL");
	}

	if (parsed.protocol !== "https:") {
		throw new Error("Webhook URL must use https");
	}

	const hostname = normalizeHostname(parsed.hostname);
	if (isPrivateOrLocalhostLiteral(hostname)) {
		throw new Error("Webhook URL must not target a private network");
	}
	if (!isIpLiteral(hostname) && process.env.NODE_ENV !== "test") {
		let addresses: string[];
		try {
			addresses = await resolveWebhookDnsAddresses(hostname);
		} catch {
			throw new Error("Webhook URL DNS could not be verified");
		}
		if (addresses.length === 0) {
			throw new Error("Webhook URL DNS could not be verified");
		}
		if (addresses.some((address) => isPrivateOrLocalhostLiteral(address))) {
			throw new Error("Webhook URL must not target a private network");
		}
	}

	parsed.hash = "";
	return parsed.toString();
}

function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

function randomToken(bytes = 32): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return bytesToBase64(buffer)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function generateWebhookSigningSecret(): string {
	return `whsec_${randomToken(32)}`;
}

function resolveWebhookEncryptionMaterial(): string {
	const secret =
		normalizeText(process.env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		normalizeText(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY) ??
		normalizeText(process.env.KEY_PEPPER_ACTIVE) ??
		normalizeText(process.env.KEY_PEPPER);
	if (!secret) throw new Error("Webhook secret encryption key is missing");
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
	return Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function encryptWebhookSecret(secret: string) {
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

async function requireWebhookAdmin() {
	if (!(await batchApiFlag())) {
		throw new Error("Webhook settings are currently limited to the enabled Batch API segment");
	}
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);
	return { supabase, user, workspaceId };
}

export async function createWebhookEndpointAction(args: {
	name: string;
	url: string;
	events?: string[];
}) {
	const { supabase, user, workspaceId } = await requireWebhookAdmin();
	const name = normalizeText(args.name) ?? "Async webhooks";
	const url = await validateWebhookEndpointUrl(args.url);
	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);

	const { data, error } = await supabase
		.from("gateway_webhook_endpoints")
		.insert({
			workspace_id: workspaceId,
			name,
			url,
			events: normalizeEvents(args.events),
			status: "active",
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
			created_by: user.id,
		})
		.select("id")
		.single();
	if (error) throw new Error(error.message);

	revalidatePath("/settings/webhooks");
	return { ok: true, id: String(data.id), signingSecret };
}

export async function updateWebhookEndpointStatusAction(id: string, status: "active" | "disabled") {
	const { supabase, workspaceId } = await requireWebhookAdmin();
	if (!id) throw new Error("Missing webhook endpoint id");

	const { error } = await supabase
		.from("gateway_webhook_endpoints")
		.update({ status, updated_at: new Date().toISOString() })
		.eq("id", id)
		.eq("workspace_id", workspaceId)
		.neq("status", "deleted");
	if (error) throw new Error(error.message);

	revalidatePath("/settings/webhooks");
	return { ok: true };
}

export async function rotateWebhookEndpointSecretAction(id: string) {
	const { supabase, workspaceId } = await requireWebhookAdmin();
	if (!id) throw new Error("Missing webhook endpoint id");

	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);
	const { data, error } = await supabase
		.from("gateway_webhook_endpoints")
		.update({
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("workspace_id", workspaceId)
		.neq("status", "deleted")
		.select("id")
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error("Webhook endpoint not found");

	revalidatePath("/settings/webhooks");
	return { ok: true, signingSecret };
}

export async function deleteWebhookEndpointAction(id: string) {
	const { supabase, workspaceId } = await requireWebhookAdmin();
	if (!id) throw new Error("Missing webhook endpoint id");

	const { error } = await supabase
		.from("gateway_webhook_endpoints")
		.update({
			status: "deleted",
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("workspace_id", workspaceId)
		.neq("status", "deleted");
	if (error) throw new Error(error.message);

	revalidatePath("/settings/webhooks");
	return { ok: true };
}
