// Transport-only Discord helpers. Model-specific formatting belongs in the workflow that owns it.
export type DiscordEmbed = {
	title: string;
	description?: string;
	url?: string;
	color: number;
	footer: {
		text: string;
	};
	image?: {
		url: string;
	};
};

export type DiscordWebhookPayload = {
	content: string;
	allowed_mentions: {
		parse: [];
		roles: string[];
		users: string[];
	};
	username: string;
	avatar_url?: string;
	embeds?: DiscordEmbed[];
};

type SendDiscordTextMessageArgs = {
	webhookUrl: string;
	message: string;
	roleId?: string | null;
	userId?: string | null;
	username?: string | null;
	avatarUrl?: string | null;
};

const DEFAULT_USERNAME = "Phaseo Model Discovery";
const DEFAULT_ASSET_BASE_URL = "https://phaseo.app";
const DEFAULT_AVATAR_PATH = "/png_logo_light.png";
const DISCORD_WEBHOOK_TIMEOUT_MS = 30_000;

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function resolveAvatarUrl(rawAvatarUrl: string | null | undefined): string {
	const fallback = `${DEFAULT_ASSET_BASE_URL}${DEFAULT_AVATAR_PATH}`;
	const value = trimOrNull(rawAvatarUrl);
	if (!value) return fallback;
	if (value.startsWith("/")) {
		return `${DEFAULT_ASSET_BASE_URL}${value}`;
	}
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "https:") return fallback;
		return parsed.toString();
	} catch {
		return fallback;
	}
}

function validateWebhookUrl(webhookUrl: string): URL {
	const parsed = new URL(webhookUrl);
	if (parsed.protocol !== "https:") {
		throw new Error("Discord webhook URL must use https.");
	}
	return parsed;
}

export async function sendDiscordWebhookPayload(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
	const parsed = validateWebhookUrl(webhookUrl);
	const response = await fetch(parsed.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(DISCORD_WEBHOOK_TIMEOUT_MS),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Discord webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
	}
}

// Keep text notifications separate from public catalog formatting. Private discovery is an operator workflow.
export async function sendDiscordTextMessage(args: SendDiscordTextMessageArgs): Promise<void> {
	const roleId = trimOrNull(args.roleId);
	const userId = trimOrNull(args.userId);
	const mentions: string[] = [];
	if (roleId) mentions.push(`<@&${roleId}>`);
	if (userId) mentions.push(`<@${userId}>`);
	const content = mentions.length > 0 ? `${mentions.join(" ")}\n${args.message}` : args.message;

	await sendDiscordWebhookPayload(args.webhookUrl, {
		content,
		allowed_mentions: {
			parse: [],
			roles: roleId ? [roleId] : [],
			users: userId ? [userId] : [],
		},
		username: trimOrNull(args.username) ?? DEFAULT_USERNAME,
		avatar_url: resolveAvatarUrl(args.avatarUrl),
	});
}
