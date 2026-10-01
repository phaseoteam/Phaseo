import type { DiscordEmbed, DiscordWebhookPayload } from "./discord-webhook";

// Public catalog announcements own model links, OG images, and Discord embeds.
export type PublicModelAnnouncementModel = {
	modelId: string;
	modelName: string;
	modelUrl: string;
	imageUrl?: string;
	creatorId?: string;
	creatorName?: string;
	creatorColor?: string;
	changeSummaryLines?: string[];
};

type BuildPublicAnnouncementPayloadOptions = {
	discordUserId?: string | null;
	includeMentions?: boolean;
	username?: string;
	avatarUrl?: string | null;
	maxModelEmbeds?: number;
	nowIso?: string;
	latestModelsUrl?: string;
	message?: string;
};

const DEFAULT_EMBED_COLOR = 0x2563eb;
const DEFAULT_USERNAME = "Phaseo Public Model Discovery";
const DEFAULT_MAX_MODEL_EMBEDS = 10;
const DEFAULT_LATEST_MODELS_URL = "https://phaseo.app/models";
const DEFAULT_ASSET_BASE_URL = "https://phaseo.app";
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
	if (!Number.isFinite(date.getTime())) return "Phaseo";
	const day = date.getUTCDate().toString().padStart(2, "0");
	const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
	const year = date.getUTCFullYear();
	return `Phaseo | ${day} ${month} ${year}`;
}

function toAnnouncementKey(model: Pick<PublicModelAnnouncementModel, "modelId">): string {
	return model.modelId.trim().toLowerCase();
}

function sanitizeModel(input: PublicModelAnnouncementModel): PublicModelAnnouncementModel | null {
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
		imageUrl: trimOrNull(input.imageUrl) ?? undefined,
		creatorId: creatorId ?? undefined,
		creatorName: creatorName ?? undefined,
		creatorColor: creatorColor ?? undefined,
		changeSummaryLines: changeSummaryLines.length > 0 ? changeSummaryLines : undefined,
	};
}

function normalizeModels(models: PublicModelAnnouncementModel[]): PublicModelAnnouncementModel[] {
	const deduped = new Map<string, PublicModelAnnouncementModel>();
	for (const model of models) {
		const sanitized = sanitizeModel(model);
		if (!sanitized) continue;
		const key = toAnnouncementKey(sanitized);
		if (!deduped.has(key)) deduped.set(key, sanitized);
	}
	return Array.from(deduped.values());
}

function buildDisplayTitle(model: PublicModelAnnouncementModel): string {
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

function resolveEmbedColor(model: PublicModelAnnouncementModel): number {
	return parseHexColor(model.creatorColor) ?? DEFAULT_EMBED_COLOR;
}

function resolveImageUrl(rawImageUrl: string | null | undefined): string | null {
	const value = trimOrNull(rawImageUrl);
	if (!value) return null;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" ? parsed.toString() : null;
	} catch {
		return null;
	}
}

function formatPerModelEmbed(model: PublicModelAnnouncementModel, nowIso: string): DiscordEmbed {
	const safeModel = sanitizeModel(model);
	if (!safeModel) {
		throw new Error("formatPerModelEmbed requires modelId, modelName, and modelUrl.");
	}

	const descriptionLines = [
		`Model ID: \`${safeModel.modelId}\``,
		`[View Model](${safeModel.modelUrl})`,
		...(safeModel.changeSummaryLines ? ["", ...safeModel.changeSummaryLines] : []),
	];

	const imageUrl = resolveImageUrl(safeModel.imageUrl);
	return {
		title: truncateText(buildDisplayTitle(safeModel), 180),
		url: safeModel.modelUrl,
		description: descriptionLines.join("\n"),
		color: resolveEmbedColor(safeModel),
		footer: { text: formatFooterText(nowIso) },
		...(imageUrl ? { image: { url: imageUrl } } : {}),
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

export function buildPublicModelAnnouncementPayload(
	models: PublicModelAnnouncementModel[],
	roleId: string | null,
	options?: BuildPublicAnnouncementPayloadOptions,
): DiscordWebhookPayload {
	const normalized = normalizeModels(models);
	if (normalized.length === 0) {
		throw new Error("buildPublicModelAnnouncementPayload requires at least one model.");
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
	const message = trimOrNull(options?.message);
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
		content: [mentionParts.join(" "), message].filter(Boolean).join(mentionParts.length > 0 && message ? "\n" : ""),
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
