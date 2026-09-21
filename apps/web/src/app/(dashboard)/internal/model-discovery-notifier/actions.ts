"use server";

import fs from "node:fs";
import path from "node:path";
import type { InternalModelNotificationModel } from "@/lib/model-discovery/internalModelDiscordNotifier";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import {
	fetchAdminCatalogRecord,
	sendAdminModelAnnouncement,
	sendAdminModelAnnouncementTest,
} from "@/lib/fetchers/internal/fetchAdminCatalog";
import { buildPublicModelAnnouncementPayload } from "../../../../../../api/src/pipeline/model-discovery/public-model-announcement-discord";

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
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn || !status.isAdmin) throw new Error("Unauthorized");
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
	if (!trimmed) return "https://phaseo.app/models";
	const segments = trimmed.split("/").map((segment) => segment.trim()).filter(Boolean).map(encodeURIComponent);
	return segments.length > 0 ? `https://phaseo.app/models/${segments.join("/")}` : "https://phaseo.app/models";
}

function toPublicModelImageUrl(modelId: string): string {
	const segments = modelId.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
	return segments.length > 0 ? `https://phaseo.app/og/models/${segments.join("/")}` : "https://phaseo.app/og.png";
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
		return { modelId, modelName, modelUrl, imageUrl: toPublicModelImageUrl(modelId) };
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
			imageUrl: toPublicModelImageUrl(modelId),
		};
	}

	const modelId = line;
	return {
		modelId,
		modelName: titleCaseFromSlug(modelId.split("/").at(-1) ?? modelId),
		modelUrl: toModelUrlFromId(modelId),
		imageUrl: toPublicModelImageUrl(modelId),
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

		const payload = buildPublicModelAnnouncementPayload(models, trimOrNull(input.roleId), {
			discordUserId: trimOrNull(input.userId),
			includeMentions: true,
			avatarUrl: null,
			username: "Phaseo Public Model Discovery",
			latestModelsUrl: "https://phaseo.app/models",
			message: "Public model catalog updates detected.",
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

		const delivery = await sendAdminModelAnnouncementTest(
			payload,
			trimOrNull(input.webhookUrl) ?? undefined,
			models.map((model) => model.modelId),
		);

		return {
			ok: true,
			message: delivery.stateRecorded === false
				? `Sent the Discord embed notification for ${models.length} model${models.length === 1 ? "" : "s"}, but could not save its announcement state.`
				: `Sent the Discord embed notification for ${models.length} model${models.length === 1 ? "" : "s"}.`,
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

export async function sendInternalModelAnnouncementAction(
	rawModelId: string,
): Promise<{ ok: boolean; message: string }> {
	try {
		await requireAdmin();

		const modelId = trimOrNull(rawModelId)?.toLowerCase();
		if (!modelId || !modelId.includes("/") || !/^[a-z0-9][a-z0-9._:/+@-]*$/.test(modelId)) {
			return { ok: false, message: "Invalid model ID." };
		}

		const { row } = await fetchAdminCatalogRecord("model", modelId);
		if (!row) return { ok: false, message: "Model not found in the catalog." };

		const canonicalModelId = trimOrNull(String(row.model_id ?? ""))?.toLowerCase();
		if (!canonicalModelId) return { ok: false, message: "Model ID is missing from the catalog record." };
		const labSlug = (
			trimOrNull(typeof row.lab_slug === "string" ? row.lab_slug : null) ??
			canonicalModelId.split("/")[0] ??
			"phaseo"
		).toLowerCase();
		const lab = loadOrganisationMetaMap()[labSlug];
		const modelName = trimOrNull(typeof row.name === "string" ? row.name : null) ?? canonicalModelId;
		const nowIso = new Date().toISOString();
		const payload = buildPublicModelAnnouncementPayload([{
			modelId: canonicalModelId,
			modelName,
			modelUrl: toModelUrlFromId(canonicalModelId),
			imageUrl: toPublicModelImageUrl(canonicalModelId),
			creatorId: labSlug,
			creatorName: lab?.name ?? titleCaseFromSlug(labSlug),
			creatorColor: lab?.colour,
			changeSummaryLines: ["Shared by the Phaseo team."],
		}], null, {
			username: "Phaseo Public Model Discovery",
			avatarUrl: "https://phaseo.app/png_logo_light.png",
			latestModelsUrl: "https://phaseo.app/models",
			message: "Model announcement from Phaseo.",
			includeMentions: false,
			maxModelEmbeds: 1,
			nowIso,
		});
		const result = await sendAdminModelAnnouncement(canonicalModelId, payload);
		if (result.stateRecorded === false) {
			return { ok: true, message: "Sent the Discord announcement, but could not save its state." };
		}

		return { ok: true, message: "Sent a Discord announcement for " + modelName + "." };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return { ok: false, message: "Discord announcement failed: " + message };
	}
}
