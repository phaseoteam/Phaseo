export type InternalModelNotificationModel = {
	modelId: string;
	modelName: string;
	modelUrl: string;
	creatorId?: string;
	creatorName?: string;
	creatorColor?: string;
	changeSummaryLines?: string[];
};

export type DiscordEmbed = {
	title: string;
	description?: string;
	url?: string;
	color: number;
	footer: {
		text: string;
	};
	timestamp?: string;
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
	embeds: DiscordEmbed[];
};

export type BuildWebhookPayloadOptions = {
	discordUserId?: string | null;
	includeMentions?: boolean;
	username?: string;
	avatarUrl?: string | null;
	maxModelEmbeds?: number;
	nowIso?: string;
	latestModelsUrl?: string;
};

export type SendDiscordWebhookOptions = {
	maxAttempts?: number;
	timeoutMs?: number;
	retryDelayMs?: number;
	requestImpl?: (args: {
		path: string;
		body: string;
		timeoutMs: number;
	}) => Promise<{ status: number; body: string }>;
	logger?: Pick<Console, "info" | "warn" | "error">;
};

const DEFAULT_EMBED_COLOR = 0x2563eb;
const DEFAULT_USERNAME = "Phaseo Model Discovery";
const DEFAULT_MAX_MODEL_EMBEDS = 10;
const DEFAULT_LATEST_MODELS_URL = "https://phaseo.ai/models";
const DEFAULT_ASSET_BASE_URL = "https://phaseo.ai";
const DEFAULT_AVATAR_PATH = "/png_logo_light.png";
const ALLOWED_DISCORD_WEBHOOK_HOSTS = new Set([
	"discord.com",
	"discordapp.com",
	"canary.discord.com",
	"ptb.discord.com",
	"canary.discordapp.com",
	"ptb.discordapp.com",
]);

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
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

export function toAnnouncementKey(model: Pick<InternalModelNotificationModel, "modelId">): string {
	return model.modelId.trim().toLowerCase();
}

function parseHexColor(value: string | null | undefined): number | null {
	const raw = trimOrNull(value);
	if (!raw) return null;
	const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
	return Number.parseInt(normalized, 16);
}

function resolveEmbedColor(model: InternalModelNotificationModel): number {
	const parsed = parseHexColor(model.creatorColor);
	return parsed ?? DEFAULT_EMBED_COLOR;
}

function formatFooterText(nowIso: string): string {
	const date = new Date(nowIso);
	if (!Number.isFinite(date.getTime())) return "Phaseo";
	const day = date.getUTCDate().toString().padStart(2, "0");
	const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
	const year = date.getUTCFullYear();
	return `Phaseo | ${day} ${month} ${year}`;
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

function resolveDefaultAvatarUrl(): string {
	return `${DEFAULT_ASSET_BASE_URL}${DEFAULT_AVATAR_PATH}`;
}

function resolveAvatarUrl(rawAvatarUrl: string | null | undefined): string {
	const fallback = resolveDefaultAvatarUrl();
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

export function filterUnannouncedModels(
	models: InternalModelNotificationModel[],
	announcedByModelId: Record<string, string | undefined> = {}
): InternalModelNotificationModel[] {
	const normalized = normalizeModels(models);
	return normalized.filter((model) => {
		const announcedAt = trimOrNull(announcedByModelId[toAnnouncementKey(model)]);
		return !announcedAt;
	});
}

export function formatSingleModelEmbed(
	model: InternalModelNotificationModel,
	nowIso = new Date().toISOString()
): DiscordEmbed {
	const safeModel = sanitizeModel(model);
	if (!safeModel) {
		throw new Error("formatSingleModelEmbed requires modelId, modelName, and modelUrl.");
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

function formatPerModelDetailEmbed(
	model: InternalModelNotificationModel,
	nowIso: string
): DiscordEmbed {
	const safeModel = sanitizeModel(model);
	if (!safeModel) {
		throw new Error("formatPerModelDetailEmbed requires modelId, modelName, and modelUrl.");
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

function formatOverflowEmbed(
	hiddenCount: number,
	nowIso: string,
	latestModelsUrl: string
): DiscordEmbed {
	return {
		title: `+${hiddenCount} more model${hiddenCount === 1 ? "" : "s"}`,
		description: `[View Models](${latestModelsUrl})`,
		url: latestModelsUrl,
		color: DEFAULT_EMBED_COLOR,
		footer: { text: formatFooterText(nowIso) },
	};
}

export function buildWebhookPayload(
	models: InternalModelNotificationModel[],
	roleId: string | null,
	options?: BuildWebhookPayloadOptions
): DiscordWebhookPayload {
	const normalized = normalizeModels(models);
	if (normalized.length === 0) {
		throw new Error("buildWebhookPayload requires at least one model.");
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

	let embeds: DiscordEmbed[];
	if (normalized.length === 1) {
		embeds = [formatSingleModelEmbed(normalized[0], nowIso)];
	} else {
		const cappedLimit = Math.min(10, maxModelEmbeds);
		const hasOverflow = normalized.length > cappedLimit;
		const detailSlots = hasOverflow ? Math.max(1, cappedLimit - 1) : cappedLimit;
		const visible = normalized.slice(0, detailSlots);
		embeds = visible.map((entry) => formatPerModelDetailEmbed(entry, nowIso));
		const hiddenCount = normalized.length - visible.length;
		if (hiddenCount > 0) {
			embeds.push(formatOverflowEmbed(hiddenCount, nowIso, latestModelsUrl));
		}
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

export function validateDiscordWebhookUrl(webhookUrl: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(webhookUrl);
	} catch {
		throw new Error("Discord webhook URL is invalid.");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("Discord webhook URL must use https.");
	}
	const hostname = parsed.hostname.toLowerCase();
	if (!ALLOWED_DISCORD_WEBHOOK_HOSTS.has(hostname)) {
		throw new Error("Discord webhook URL host is not allowed.");
	}
	const segments = parsed.pathname.split("/").filter(Boolean);
	const hasWebhookPath =
		segments.length >= 4 &&
		segments[0] === "api" &&
		segments[1] === "webhooks" &&
		segments[2].length > 0 &&
		segments[3].length > 0;
	if (!hasWebhookPath) {
		throw new Error("Discord webhook URL path is invalid.");
	}
	return parsed;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function resolveErrorMessage(value: unknown): string {
	if (value instanceof Error && value.message) return value.message;
	return String(value);
}

async function sendDiscordWebhookRequest(args: {
	path: string;
	body: string;
	timeoutMs: number;
}): Promise<{ status: number; body: string }> {
	const { path, body, timeoutMs } = args;
	const https = await import("node:https");
	return new Promise((resolve, reject) => {
		const req = https.request(
			{
				protocol: "https:",
				hostname: "discord.com",
				method: "POST",
				path,
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body).toString(),
				},
				timeout: timeoutMs,
			},
			(res) => {
				let responseBody = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					responseBody += chunk;
				});
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 0,
						body: responseBody,
					});
				});
			}
		);
		req.on("timeout", () => {
			req.destroy(new Error("timeout"));
		});
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

export async function sendDiscordWebhookPayload(
	webhookUrl: string,
	payload: DiscordWebhookPayload,
	options?: SendDiscordWebhookOptions
): Promise<void> {
	const parsedWebhookUrl = validateDiscordWebhookUrl(webhookUrl);
	const segments = parsedWebhookUrl.pathname.split("/").filter(Boolean);
	const webhookId = segments[2] ?? "";
	const webhookToken = segments[3] ?? "";
	const requestPath = `/api/webhooks/${webhookId}/${webhookToken}`;
	const requestBody = JSON.stringify(payload);
	const maxAttempts = Number.isFinite(options?.maxAttempts)
		? Math.max(1, Math.floor(options?.maxAttempts as number))
		: 3;
	const timeoutMs = Number.isFinite(options?.timeoutMs)
		? Math.max(1_000, Math.floor(options?.timeoutMs as number))
		: 10_000;
	const retryDelayMs = Number.isFinite(options?.retryDelayMs)
		? Math.max(0, Math.floor(options?.retryDelayMs as number))
		: 500;
	const requestImpl = options?.requestImpl ?? sendDiscordWebhookRequest;
	const logger = options?.logger ?? console;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await requestImpl({
				path: requestPath,
				body: requestBody,
				timeoutMs,
			});
			if (response.status >= 200 && response.status < 300) {
				if (attempt > 1) {
					logger.info(
						`[internal-model-check] Discord webhook send succeeded on retry ${attempt}/${maxAttempts}.`
					);
				}
				return;
			}

			const body = response.body ?? "";
			const bodySnippet = body ? `: ${body.slice(0, 300)}` : "";
			const retryableStatus = response.status === 429 || response.status >= 500 || response.status === 0;
			if (!retryableStatus || attempt >= maxAttempts) {
				throw new Error(`Discord webhook failed with HTTP ${response.status}${bodySnippet}`);
			}
			logger.warn(
				`[internal-model-check] Discord webhook attempt ${attempt}/${maxAttempts} failed with HTTP ${response.status}; retrying.`
			);
		} catch (error) {
			const message = resolveErrorMessage(error);
			const retryableError =
				message.includes("aborted") || message.includes("timeout") || message.includes("fetch");
			if (!retryableError || attempt >= maxAttempts) {
				throw new Error(`Discord webhook request failed on attempt ${attempt}: ${message}`);
			}
			logger.warn(
				`[internal-model-check] Discord webhook attempt ${attempt}/${maxAttempts} failed (${message}); retrying.`
			);
		}

		if (retryDelayMs > 0) {
			await delay(retryDelayMs * attempt);
		}
	}
}
