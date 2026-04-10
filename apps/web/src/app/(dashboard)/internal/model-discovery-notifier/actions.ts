"use server";

import fs from "node:fs";
import path from "node:path";
import {
	buildWebhookPayload,
	sendDiscordWebhookPayload,
	type InternalModelNotificationModel,
} from "@/lib/model-discovery/internalModelDiscordNotifier";
import { createClient } from "@/utils/supabase/server";

type NotifierTestResult = {
	ok: boolean;
	message: string;
	payloadPreview: string;
	modelCount: number;
};

type NotifierTestInput = {
	modelsText: string;
	roleId?: string;
	userId?: string;
	webhookUrl?: string;
	send: boolean;
};

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function normalizeHexColour(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	if (!raw) return null;
	const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
	return `#${normalized.toLowerCase()}`;
}

function resolveRepoRoot(startDir: string): string {
	const candidates = [
		startDir,
		path.resolve(startDir, ".."),
		path.resolve(startDir, "..", ".."),
	];
	for (const candidate of candidates) {
		const canonical = path.join(candidate, "packages", "data", "catalog", "src", "data", "organisations");
		const legacy = path.join(candidate, "apps", "web", "src", "data", "organisations");
		if (fs.existsSync(canonical) || fs.existsSync(legacy)) return candidate;
	}
	return startDir;
}

type OrganisationMeta = {
	name?: string;
	colour?: string;
};

function loadOrganisationMetaMap(): Record<string, OrganisationMeta> {
	const map = new Map<string, OrganisationMeta>();
	const repoRoot = resolveRepoRoot(process.cwd());
	const canonicalRoot = path.join(repoRoot, "packages", "data", "catalog", "src", "data", "organisations");
	const legacyRoot = path.join(repoRoot, "apps", "web", "src", "data", "organisations");
	const root = fs.existsSync(canonicalRoot) ? canonicalRoot : fs.existsSync(legacyRoot) ? legacyRoot : null;
	if (!root) return {};

	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const organisationPath = path.join(root, entry.name, "organisation.json");
		if (!fs.existsSync(organisationPath)) continue;
		try {
			const parsed = JSON.parse(fs.readFileSync(organisationPath, "utf-8")) as Record<string, unknown>;
			const organisationId =
				typeof parsed.organisation_id === "string" && parsed.organisation_id.trim()
					? parsed.organisation_id.trim().toLowerCase()
					: entry.name.trim().toLowerCase();
			const organisationName =
				typeof parsed.name === "string" && parsed.name.trim()
					? parsed.name.trim()
					: null;
			const colour =
				normalizeHexColour(parsed.colour) ??
				normalizeHexColour(parsed.color) ??
				normalizeHexColour(parsed.colour_hex);
			if (!organisationId) continue;
			map.set(organisationId, {
				name: organisationName ?? undefined,
				colour: colour ?? undefined,
			});
		} catch {
			// ignore malformed organisation records
		}
	}

	return Object.fromEntries(Array.from(map.entries()));
}

async function requireAdmin(): Promise<void> {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("Unauthorized");

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		throw new Error("Unauthorized");
	}
}

function titleCaseFromSlug(raw: string): string {
	return raw
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.filter(Boolean)
		.map((part) => {
			if (part.length <= 2 && part === part.toUpperCase()) return part;
			return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function toModelUrlFromId(modelId: string): string {
	const trimmed = modelId.trim();
	if (!trimmed) return "https://ai-stats.phaseo.app/models";
	const parts = trimmed.split("/");
	if (parts.length < 2) return "https://ai-stats.phaseo.app/models";
	const organisation = encodeURIComponent(parts[0]);
	const slug = encodeURIComponent(parts.slice(1).join("/"));
	return `https://ai-stats.phaseo.app/models/${organisation}/${slug}`;
}

function parseModelLine(rawLine: string): InternalModelNotificationModel | null {
	const line = rawLine.trim();
	if (!line) return null;

	const [leftRaw, rightRaw] = line.split("|", 2).map((value) => value.trim());
	if (rightRaw) {
		const modelName = leftRaw;
		const modelUrl = rightRaw;
		const modelId =
			modelUrl
				.replace(/^https?:\/\/[^/]+\/models\//i, "")
				.split("?")[0]
				.split("#")[0]
				.replace(/\/+/g, "/")
				.replace(/^\/|\/$/g, "") || leftRaw.toLowerCase().replace(/\s+/g, "-");
		if (!modelName || !modelUrl || !modelId) return null;
		return { modelId, modelName, modelUrl };
	}

	if (/^https?:\/\//i.test(line)) {
		const modelUrl = line;
		const modelId = line
			.replace(/^https?:\/\/[^/]+\/models\//i, "")
			.split("?")[0]
			.split("#")[0]
			.replace(/\/+/g, "/")
			.replace(/^\/|\/$/g, "");
		if (!modelId) return null;
		const slug = modelId.split("/").at(-1) ?? modelId;
		return {
			modelId,
			modelName: titleCaseFromSlug(slug),
			modelUrl,
		};
	}

	const modelId = line;
	return {
		modelId,
		modelName: titleCaseFromSlug(modelId.split("/").at(-1) ?? modelId),
		modelUrl: toModelUrlFromId(modelId),
	};
}

function parseModelsText(modelsText: string): InternalModelNotificationModel[] {
	const metaMap = loadOrganisationMetaMap();
	return modelsText
		.split(/\r?\n/g)
		.map((line) => parseModelLine(line))
		.filter((value): value is InternalModelNotificationModel => Boolean(value))
		.map((model) => {
			const creatorId = model.modelId.split("/")[0]?.trim().toLowerCase() || undefined;
			const creatorMeta = creatorId ? metaMap[creatorId] : undefined;
			return {
				...model,
				creatorId,
				creatorName: creatorMeta?.name,
				creatorColor: creatorMeta?.colour,
			};
		});
}

export async function testInternalModelDiscoveryNotifierAction(
	input: NotifierTestInput
): Promise<NotifierTestResult> {
	try {
		await requireAdmin();
		const models = parseModelsText(input.modelsText ?? "");
		if (models.length === 0) {
			return {
				ok: false,
				message: "Add at least one model line. Use `provider/slug`, full model URL, or `Name | URL`.",
				payloadPreview: "",
				modelCount: 0,
			};
		}

		const payload = buildWebhookPayload(models, trimOrNull(input.roleId), {
			discordUserId: trimOrNull(input.userId),
			includeMentions: true,
			avatarUrl: trimOrNull(process.env.DISCORD_MODEL_DISCOVERY_AVATAR_URL),
			maxModelEmbeds: 10,
		});
		const payloadPreview = JSON.stringify(payload, null, 2);

		if (!input.send) {
			return {
				ok: true,
				message: `Payload preview generated for ${models.length} model${models.length === 1 ? "" : "s"}.`,
				payloadPreview,
				modelCount: models.length,
			};
		}

		const webhookUrl =
			trimOrNull(input.webhookUrl) ??
			trimOrNull(process.env.DISCORD_WEBHOOK_URL) ??
			null;
		if (!webhookUrl) {
			return {
				ok: false,
				message: "Webhook URL missing. Provide one in the form or set DISCORD_WEBHOOK_URL.",
				payloadPreview,
				modelCount: models.length,
			};
		}

		await sendDiscordWebhookPayload(webhookUrl, payload, {
			maxAttempts: 3,
			timeoutMs: 10_000,
			retryDelayMs: 750,
			logger: console,
		});

		return {
			ok: true,
			message: `Sent test Discord embed notification for ${models.length} model${models.length === 1 ? "" : "s"}.`,
			payloadPreview,
			modelCount: models.length,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			ok: false,
			message: `Notifier test failed: ${message}`,
			payloadPreview: "",
			modelCount: 0,
		};
	}
}
