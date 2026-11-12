import { getBindings } from "@/runtime/env";
import { encryptWebhookSecret, generateWebhookSigningSecret } from "@/core/webhook-endpoints";

/** Destination types whose deliveries are signed with a per-destination secret. */
export function isSignedNotificationDestinationType(type: string): boolean { return type === "custom_webhook"; }

/**
 * A new signing secret for a notification destination: the plaintext (shown once)
 * and the encrypted columns to store, encrypted like webhook endpoint secrets.
 */
export async function issueNotificationSigningSecret(now: Date = new Date()) {
	const secret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(secret);
	return {
		secret,
		columns: {
			signing_secret_ciphertext: encrypted.secretCiphertext,
			signing_secret_iv: encrypted.secretIv,
			signing_secret_key_version: encrypted.secretKeyVersion,
			signing_secret_rotated_at: now.toISOString(),
		},
	};
}

/** Public destination fields, without the encrypted target or secret. */
export function toPublicNotificationDestination(row: Record<string, unknown>) {
	return {
		id: row.id,
		name: row.name,
		type: row.type,
		status: row.status,
		target_preview: row.target_preview,
		has_signing_secret: Boolean(row.signing_secret_ciphertext),
		signing_secret_rotated_at: row.signing_secret_rotated_at ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

export const NOTIFICATION_DESTINATION_TYPES = ["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"] as const;
export type NotificationDestinationType = typeof NOTIFICATION_DESTINATION_TYPES[number];

function text(value: unknown) { const normalized = typeof value === "string" ? value.trim() : ""; return normalized || null; }
function mentions(value: unknown, pattern: RegExp, limit: number, message: string) {
	const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const ids = values.map(text).filter((entry): entry is string => Boolean(entry));
	if (ids.length > limit || ids.some((id) => !pattern.test(id))) throw new Error(message);
	return [...new Set(ids)];
}
function buffer(value: Uint8Array): ArrayBuffer { return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer; }
function base64(value: Uint8Array) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }

export function validateNotificationTarget(type: NotificationDestinationType, raw: unknown): string {
	const target = text(raw); if (!target) throw new Error("Destination is required");
	if (type === "email") {
		let values: unknown = target; try { values = JSON.parse(target); } catch { /* Single-address shorthand. */ }
		const emails = (Array.isArray(values) ? values : [values]).map((value) => text(value)?.toLowerCase()).filter((value): value is string => Boolean(value));
		if (!emails.length || emails.length > 25 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) throw new Error("Enter between 1 and 25 valid email addresses");
		return JSON.stringify([...new Set(emails)]);
	}
	if (type === "discord") {
		let row: Record<string, unknown>; try { row = JSON.parse(target); } catch { throw new Error("Discord credentials are invalid"); }
		const channelId = text(row.channelId); const botToken = text(row.botToken);
		if (!channelId || !/^\d{15,24}$/.test(channelId) || !botToken || botToken.length < 20) throw new Error("Discord channel ID and bot token are required");
		return JSON.stringify({ channelId, botToken, userIds: mentions(row.userIds, /^\d{15,24}$/, 25, "Discord mention IDs are invalid"), roleIds: mentions(row.roleIds, /^\d{15,24}$/, 25, "Discord mention IDs are invalid") });
	}
	if (["discord_webhook", "slack", "microsoft_teams"].includes(type) && target.startsWith("{")) {
		let row: Record<string, unknown>; try { row = JSON.parse(target); } catch { throw new Error("Webhook configuration is invalid"); }
		const url = validateNotificationTarget(type, row.url);
		if (type === "discord_webhook") return JSON.stringify({ url, userIds: mentions(row.userIds, /^\d{15,24}$/, 25, "Discord mention IDs are invalid"), roleIds: mentions(row.roleIds, /^\d{15,24}$/, 25, "Discord mention IDs are invalid") });
		if (type === "slack") return JSON.stringify({ url, userIds: mentions(row.userIds, /^[UW][A-Z0-9]{7,}$/i, 25, "Slack mention IDs are invalid"), userGroupIds: mentions(row.userGroupIds, /^S[A-Z0-9]{7,}$/i, 25, "Slack mention IDs are invalid") });
		const teamsPattern = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
		return JSON.stringify({ url, mentionIds: mentions(row.mentionIds, teamsPattern, 20, "Teams mentions are invalid") });
	}
	let url: URL; try { url = new URL(target); } catch { throw new Error("Enter a valid HTTPS URL"); }
	if (url.protocol !== "https:" || url.username || url.password) throw new Error("Destination URL must use HTTPS");
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (!host || host === "localhost" || host.endsWith(".localhost") || /^(0|10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::" || host === "::1" || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(host)) throw new Error("Destination must not target a private network");
	if ((type === "discord_webhook" && !["discord.com", "discordapp.com"].includes(host)) || (type === "slack" && host !== "hooks.slack.com")) throw new Error("Enter a valid webhook URL");
	url.hash = ""; return url.toString();
}

export function notificationTargetPreview(type: NotificationDestinationType, target: string) {
	if (type === "email") { const emails = JSON.parse(target) as string[]; const [local, domain] = emails[0]!.split("@"); const first = `${local.slice(0, 2)}•••@${domain}`; return emails.length === 1 ? first : `${first} +${emails.length - 1}`; }
	if (type === "discord") { const row = JSON.parse(target) as { channelId: string }; return `Channel ••••${row.channelId.slice(-4)}`; }
	const rawUrl = ["discord_webhook", "slack", "microsoft_teams"].includes(type) && target.startsWith("{") ? String((JSON.parse(target) as { url: string }).url) : target;
	const url = new URL(rawUrl); return `${url.hostname}/••••${url.pathname.slice(-4)}`;
}

export async function encryptNotificationTarget(target: string) {
	const bindings = getBindings(); const secret = bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY?.trim();
	if (!secret) throw new Error("Notification destination encryption is not configured");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
	const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv) }, key, new TextEncoder().encode(target));
	const hmac = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(target)));
	return { target_ciphertext: base64(new Uint8Array(ciphertext)), target_iv: base64(iv), target_hash: [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join(""), target_key_version: bindings.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION?.trim() || "v1" };
}
