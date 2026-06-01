export type InternalModelNotificationModel = {
	modelId: string;
	modelName: string;
	modelUrl: string;
	creatorId?: string;
	creatorName?: string;
	creatorColor?: string;
	changeSummaryLines?: string[];
};

type DiscordEmbed = {
	title: string;
	description?: string;
	url?: string;
	color: number;
	footer: {
		text: string;
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

type BuildWebhookPayloadOptions = {
	discordUserId?: string | null;
	includeMentions?: boolean;
	username?: string;
	avatarUrl?: string | null;
	maxModelEmbeds?: number;
	nowIso?: string;
	latestModelsUrl?: string;
};

type SendDiscordTextMessageArgs = {
	webhookUrl: string;
	message: string;
	roleId?: string | null;
	userId?: string | null;
	username?: string | null;
};

const DEFAULT_EMBED_COLOR = 0x2563eb;
const DEFAULT_USERNAME = "AI Stats Model Discovery";
const DEFAULT_MAX_MODEL_EMBEDS = 10;
const DEFAULT_LATEST_MODELS_URL = "https://ai-stats.phaseo.app/models";
const DEFAULT_ASSET_BASE_URL = "https://ai-stats.phaseo.app";
const DEFAULT_AVATAR_PATH = "/png_logo_light.png";

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function parseHexColor(value: string | null | undefined): number | null {
	const raw = trimOrNull(value);
	if (!raw) return null;
	const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
	return Number.parseInt(normalized, 16);
}

function formatFooterText(nowIso: string): string {
	const date = new Date(nowIso);
	if (!Number.isFinite(date.getTime())) return "AI Stats";
	const day = date.getUTCDate().toString().padStart(2, "0");
	const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
	const year = date.getUTCFullYear();
	return `AI Stats | ${day} ${month} ${year}`;
}

function toAnnouncementKey(model: Pick<InternalModelNotificationModel, "modelId">): string {
	return model.modelId.trim().toLowerCase();
}

function sanitizeModel(input: InternalModelNotificationModel): InternalModelNotificationModel | null {
	const modelId = trimOrNull(input.modelId);
	const modelName = trimOrNull(input.modelName);
	const modelUrl = trimOrNull(input.modelUrl);
	if (!modelId || !modelName || !modelUrl) return null;
	const creatorId = trimOrNull(input.creatorId) ?? modelId.split("/")[0] ?? null;
	const creatorName = trimOrNull(input.creatorName);
	const creatorColor = trimOrNull(input.creatorColor);
	const changeSummaryLines = Array.isArray(input.changeSummaryLines)
		? input.changeSummaryLines
				.filter((line): line is string => typeof line === "string")
				.map((line) => line.trim())
				.filter(Boolean)
				.slice(0, 8)
		: [];
	return {
		modelId,
		modelName,
		modelUrl,
		creatorId: creatorId ?? undefined,
		creatorName: creatorName ?? undefined,
		creatorColor: creatorColor ?? undefined,
		changeSummaryLines: changeSummaryLines.length > 0 ? changeSummaryLines : undefined,
	};
}

function normalizeModels(models: InternalModelNotificationModel[]): InternalModelNotificationModel[] {
	const deduped = new Map<string, InternalModelNotificationModel>();
	for (const model of models) {
		const sanitized = sanitizeModel(model);
		if (!sanitized) continue;
		const key = toAnnouncementKey(sanitized);
		if (!deduped.has(key)) deduped.set(key, sanitized);
	}
	return Array.from(deduped.values());
}

function buildDisplayTitle(model: InternalModelNotificationModel): string {
	const safeModel = sanitizeModel(model);
	if (!safeModel) return "Model";
	const creator = trimOrNull(safeModel.creatorName);
	if (!creator) return safeModel.modelName;
	const modelLower = safeModel.modelName.toLowerCase();
	const creatorLower = creator.toLowerCase();
	if (modelLower.startsWith(`${creatorLower}:`)) return safeModel.modelName;
	return `${creator}: ${safeModel.modelName}`;
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

function resolveEmbedColor(model: InternalModelNotificationModel): number {
	return parseHexColor(model.creatorColor) ?? DEFAULT_EMBED_COLOR;
}

function formatPerModelEmbed(model: InternalModelNotificationModel, nowIso: string): DiscordEmbed {
	const safeModel = sanitizeModel(model);
	if (!safeModel) {
		throw new Error("formatPerModelEmbed requires modelId, modelName, and modelUrl.");
	}

	const descriptionLines = [
		`Model ID: \`${safeModel.modelId}\``,
		`[View Model](${safeModel.modelUrl})`,
		...(safeModel.changeSummaryLines ? ["", ...safeModel.changeSummaryLines] : []),
	];

	return {
		title: truncateText(buildDisplayTitle(safeModel), 180),
		url: safeModel.modelUrl,
		description: descriptionLines.join("\n"),
		color: resolveEmbedColor(safeModel),
		footer: { text: formatFooterText(nowIso) },
	};
}

function formatOverflowEmbed(hiddenCount: number, nowIso: string, latestModelsUrl: string): DiscordEmbed {
	return {
		title: `+${hiddenCount} more model${hiddenCount === 1 ? "" : "s"}`,
		description: `[View Models](${latestModelsUrl})`,
		url: latestModelsUrl,
		color: DEFAULT_EMBED_COLOR,
		footer: { text: formatFooterText(nowIso) },
	};
}

export function buildInternalModelWebhookPayload(
	models: InternalModelNotificationModel[],
	roleId: string | null,
	options?: BuildWebhookPayloadOptions
): DiscordWebhookPayload {
	const normalized = normalizeModels(models);
	if (normalized.length === 0) {
		throw new Error("buildInternalModelWebhookPayload requires at least one model.");
	}

	const includeMentions = options?.includeMentions !== false;
	const nowIso = options?.nowIso ?? new Date().toISOString();
	const normalizedRoleId = trimOrNull(roleId);
	const normalizedUserId = trimOrNull(options?.discordUserId);
	const roles = includeMentions && normalizedRoleId ? [normalizedRoleId] : [];
	const users = includeMentions && normalizedUserId ? [normalizedUserId] : [];
	const mentionParts: string[] = [];
	if (roles.length > 0) mentionParts.push(`<@&${roles[0]}>`);
	if (users.length > 0) mentionParts.push(`<@${users[0]}>`);

	const latestModelsUrl = trimOrNull(options?.latestModelsUrl) ?? DEFAULT_LATEST_MODELS_URL;
	const avatarUrl = resolveAvatarUrl(options?.avatarUrl);
	const maxModelEmbeds = Number.isFinite(options?.maxModelEmbeds)
		? Math.max(1, Math.floor(options?.maxModelEmbeds as number))
		: DEFAULT_MAX_MODEL_EMBEDS;
	const cappedLimit = Math.min(10, maxModelEmbeds);
	const hasOverflow = normalized.length > cappedLimit;
	const detailSlots = hasOverflow ? Math.max(1, cappedLimit - 1) : cappedLimit;
	const visible = normalized.slice(0, detailSlots);
	const embeds = visible.map((entry) => formatPerModelEmbed(entry, nowIso));
	const hiddenCount = normalized.length - visible.length;
	if (hiddenCount > 0) {
		embeds.push(formatOverflowEmbed(hiddenCount, nowIso, latestModelsUrl));
	}

	return {
		content: mentionParts.join(" "),
		allowed_mentions: {
			parse: [],
			roles,
			users,
		},
		username: trimOrNull(options?.username) ?? DEFAULT_USERNAME,
		avatar_url: avatarUrl,
		embeds,
	};
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
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Discord webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
	}
}

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
	});
}
