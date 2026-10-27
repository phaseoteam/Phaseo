import type { Env } from "@/env";

export const NOTIFICATION_DESTINATION_TYPES = ["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"] as const;
export type NotificationDestinationType = typeof NOTIFICATION_DESTINATION_TYPES[number];
/** Routable notification kinds; matches notification_event_destinations_event_kind_check. */
export const NOTIFICATION_EVENT_KINDS = ["low_balance", "auto_top_up_failed", "payment_method_expiring", "model_deprecation", "model_substitution", "rate_limit_throttled", "broadcast_destination_failing", "spend_alert", "spend_blocked", "spend_report"] as const;
export function isNotificationEventKind(value: unknown): value is typeof NOTIFICATION_EVENT_KINDS[number] { return typeof value === "string" && (NOTIFICATION_EVENT_KINDS as readonly string[]).includes(value); }

const IANA_TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;
/** An IANA time zone such as Europe/London, trimmed; null otherwise. The database re-checks it against pg_timezone_names. */
export function parseIanaTimeZone(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const zone = value.trim();
	if (!zone || zone.length > 64 || !IANA_TIME_ZONE.test(zone)) return null;
	try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return zone; } catch { return null; }
}

function text(value: unknown): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || null;
}

function discordMentionIds(value: unknown): string[] {
	const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const ids = values.map(text).filter((entry): entry is string => Boolean(entry));
	if (ids.length > 25 || ids.some((id) => !/^\d{15,24}$/.test(id))) throw new Error("Discord mention IDs must be valid user or role IDs");
	return [...new Set(ids)];
}

function slackMentionIds(value: unknown, prefix: RegExp): string[] {
	const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const ids = values.map(text).filter((entry): entry is string => Boolean(entry)).map((id) => id.toUpperCase());
	if (ids.length > 25 || ids.some((id) => !prefix.test(id))) throw new Error("Slack mention IDs are invalid");
	return [...new Set(ids)];
}

function teamsMentionIds(value: unknown): string[] {
	const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const ids = values.map(text).filter((entry): entry is string => Boolean(entry));
	const valid = (id: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
	if (ids.length > 20 || ids.some((id) => !valid(id))) throw new Error("Teams mentions must be valid UPNs or Microsoft Entra object IDs");
	return [...new Set(ids)];
}

function bytes(value: Uint8Array): ArrayBuffer { return Uint8Array.from(value).buffer; }
function base64(value: Uint8Array): string { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
function material(env: Env): string {
	const value = text(env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY) ?? text(env.WEBHOOK_SECRET_ENCRYPTION_KEY);
	if (!value) throw new Error("Notification destination encryption key is missing");
	return value;
}

export function validateNotificationTarget(type: NotificationDestinationType, raw: unknown): string {
	const target = text(raw);
	if (!target) throw new Error("Destination is required");
	if (type === "email") {
		let values: unknown = target;
		try { values = JSON.parse(target); } catch { /* Backward-compatible single address. */ }
		const emails = (Array.isArray(values) ? values : [values]).map((value) => text(value)?.toLowerCase()).filter((value): value is string => Boolean(value));
		if (emails.length === 0 || emails.length > 25 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) throw new Error("Enter between 1 and 25 valid email addresses");
		return JSON.stringify([...new Set(emails)]);
	}
	if (type === "discord") {
		let parsed: unknown;
		try { parsed = JSON.parse(target); } catch { throw new Error("Discord credentials are invalid"); }
		const row = parsed as Record<string, unknown>;
		const channelId = text(row.channelId);
		const botToken = text(row.botToken);
		if (!channelId || !/^\d{15,24}$/.test(channelId) || !botToken || botToken.length < 20) throw new Error("Discord channel ID and bot token are required");
		return JSON.stringify({ channelId, botToken, userIds: discordMentionIds(row.userIds), roleIds: discordMentionIds(row.roleIds) });
	}
	if (type === "discord_webhook" && target.startsWith("{")) {
		let parsed: Record<string, unknown>;
		try { parsed = JSON.parse(target) as Record<string, unknown>; } catch { throw new Error("Discord webhook configuration is invalid"); }
		const url = validateNotificationTarget(type, parsed.url);
		return JSON.stringify({ url, userIds: discordMentionIds(parsed.userIds), roleIds: discordMentionIds(parsed.roleIds) });
	}
	if (type === "slack" && target.startsWith("{")) {
		let parsed: Record<string, unknown>;
		try { parsed = JSON.parse(target) as Record<string, unknown>; } catch { throw new Error("Slack webhook configuration is invalid"); }
		const url = validateNotificationTarget(type, parsed.url);
		return JSON.stringify({ url, userIds: slackMentionIds(parsed.userIds, /^[UW][A-Z0-9]{7,}$/), userGroupIds: slackMentionIds(parsed.userGroupIds, /^S[A-Z0-9]{7,}$/) });
	}
	if (type === "microsoft_teams" && target.startsWith("{")) {
		let parsed: Record<string, unknown>;
		try { parsed = JSON.parse(target) as Record<string, unknown>; } catch { throw new Error("Microsoft Teams webhook configuration is invalid"); }
		const url = validateNotificationTarget(type, parsed.url);
		return JSON.stringify({ url, mentionIds: teamsMentionIds(parsed.mentionIds) });
	}
	let url: URL;
	try { url = new URL(target); } catch { throw new Error("Enter a valid HTTPS URL"); }
	if (url.protocol !== "https:" || url.username || url.password) throw new Error("Destination URL must use HTTPS");
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || /^(0|10|127|169\.254|192\.168)\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || hostname === "::" || hostname === "::1" || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(hostname)) throw new Error("Destination must not target a private network");
	if ((type === "discord_webhook" && hostname !== "discord.com" && hostname !== "discordapp.com") || (type === "slack" && hostname !== "hooks.slack.com")) throw new Error(`Enter a valid ${type === "slack" ? "Slack" : "Discord"} webhook URL`);
	url.hash = "";
	return url.toString();
}

export function targetPreview(type: NotificationDestinationType, target: string): string {
	if (type === "email") { const emails = JSON.parse(target) as string[]; const [local, domain] = emails[0]!.split("@"); const first = `${local.slice(0, 2)}•••@${domain}`; return emails.length === 1 ? first : `${first} +${emails.length - 1}`; }
	if (type === "discord") { const row = JSON.parse(target) as { channelId: string }; return `Channel ••••${row.channelId.slice(-4)}`; }
	const url = new URL((type === "discord_webhook" || type === "slack" || type === "microsoft_teams") && target.startsWith("{") ? String((JSON.parse(target) as { url: string }).url) : target);
	return `${url.hostname}/••••${url.pathname.slice(-4)}`;
}

/** Destination types whose deliveries are signed with a per-destination secret. */
export function isSignedNotificationDestinationType(type: string): boolean { return type === "custom_webhook"; }

async function encryptValue(env: Env, value: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material(env)));
	const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv) }, key, new TextEncoder().encode(value));
	return { ciphertext: base64(new Uint8Array(ciphertext)), iv: base64(iv), keyVersion: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION?.trim() || "v1" };
}

/**
 * A new webhook signing secret (`whsec_…`, the format the gateway uses for batch and
 * video webhooks) and its encrypted columns. The gateway decrypts it with the same key
 * material and signs each delivery with x-phaseo-timestamp and x-phaseo-signature.
 */
export async function issueNotificationSigningSecret(env: Env, now: Date = new Date()) {
	const random = crypto.getRandomValues(new Uint8Array(32));
	const secret = `whsec_${base64(random).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
	const encrypted = await encryptValue(env, secret);
	return {
		secret,
		columns: {
			signing_secret_ciphertext: encrypted.ciphertext,
			signing_secret_iv: encrypted.iv,
			signing_secret_key_version: encrypted.keyVersion,
			signing_secret_rotated_at: now.toISOString(),
		},
	};
}

export async function encryptNotificationTarget(env: Env, target: string) {
	const secret = material(env);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
	const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv) }, key, new TextEncoder().encode(target));
	const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(target)));
	return {
		target_ciphertext: base64(new Uint8Array(ciphertext)),
		target_iv: base64(iv),
		target_hash: [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
		target_key_version: env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION?.trim() || "v1",
	};
}
