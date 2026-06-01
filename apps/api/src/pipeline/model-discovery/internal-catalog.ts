import { getSupabaseAdmin } from "@/runtime/env";
import { buildInternalModelWebhookPayload, sendDiscordWebhookPayload, type InternalModelNotificationModel } from "./discord";
import { readBindingEnv, toBool } from "./helpers";

type InternalCurrentRow = {
	model_id: string;
	name: string;
	organisation_id: string;
	status: string | null;
	announcement_date: string | null;
	release_date: string | null;
	deprecation_date: string | null;
	retirement_date: string | null;
	organisation:
		| {
				organisation_id: string | null;
				name: string | null;
				colour: string | null;
		  }
		| Array<{
		organisation_id: string | null;
		name: string | null;
		colour: string | null;
		  }>
		| null;
};

type InternalSeenRow = {
	model_id: string;
	name: string;
	organisation_id: string;
	organisation_name: string | null;
	organisation_colour: string | null;
	status: string | null;
	announcement_date: string | null;
	release_date: string | null;
	deprecation_date: string | null;
	retirement_date: string | null;
};

type InternalModelSnapshot = {
	modelId: string;
	name: string;
	organisationId: string;
	organisationName: string | null;
	organisationColour: string | null;
	status: string | null;
	announcementDate: string | null;
	releaseDate: string | null;
	deprecationDate: string | null;
	retirementDate: string | null;
};

type InternalSeenUpsertRow = {
	model_id: string;
	name: string;
	organisation_id: string;
	organisation_name: string | null;
	organisation_colour: string | null;
	status: string | null;
	announcement_date: string | null;
	release_date: string | null;
	deprecation_date: string | null;
	retirement_date: string | null;
	last_seen_at: string;
};

export type InternalCatalogDiscoverySummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	modelsCurrent: number;
	additionsDetected: number;
	updatesDetected: number;
	removalsDetected: number;
	notified: boolean;
	skippedReason?: string | null;
	notificationError?: string | null;
};

const PAGE_SIZE = 500;
const UPSERT_BATCH_SIZE = 500;

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function toIsoOrNull(value: string | null | undefined): string | null {
	const normalized = trimOrNull(value);
	if (!normalized) return null;
	const parsed = new Date(normalized);
	if (!Number.isFinite(parsed.getTime())) return normalized;
	return parsed.toISOString();
}

function mapCurrentRow(row: InternalCurrentRow): InternalModelSnapshot | null {
	const modelId = trimOrNull(row.model_id);
	const name = trimOrNull(row.name);
	const organisationId = trimOrNull(row.organisation_id);
	if (!modelId || !name || !organisationId) return null;
	const organisation = Array.isArray(row.organisation) ? row.organisation[0] ?? null : row.organisation;

	return {
		modelId,
		name,
		organisationId,
		organisationName: trimOrNull(organisation?.name),
		organisationColour: trimOrNull(organisation?.colour),
		status: trimOrNull(row.status),
		announcementDate: toIsoOrNull(row.announcement_date),
		releaseDate: toIsoOrNull(row.release_date),
		deprecationDate: toIsoOrNull(row.deprecation_date),
		retirementDate: toIsoOrNull(row.retirement_date),
	};
}

function mapSeenRow(row: InternalSeenRow): InternalModelSnapshot | null {
	const modelId = trimOrNull(row.model_id);
	const name = trimOrNull(row.name);
	const organisationId = trimOrNull(row.organisation_id);
	if (!modelId || !name || !organisationId) return null;

	return {
		modelId,
		name,
		organisationId,
		organisationName: trimOrNull(row.organisation_name),
		organisationColour: trimOrNull(row.organisation_colour),
		status: trimOrNull(row.status),
		announcementDate: toIsoOrNull(row.announcement_date),
		releaseDate: toIsoOrNull(row.release_date),
		deprecationDate: toIsoOrNull(row.deprecation_date),
		retirementDate: toIsoOrNull(row.retirement_date),
	};
}

function buildModelUrl(modelId: string): string {
	const parts = modelId.split("/");
	if (parts.length < 2) return "https://ai-stats.phaseo.app/models";
	const organisationId = encodeURIComponent(parts[0]);
	const slug = encodeURIComponent(parts.slice(1).join("/"));
	return `https://ai-stats.phaseo.app/models/${organisationId}/${slug}`;
}

function formatStatusValue(status: string | null): string {
	return status ?? "Not set";
}

function formatDateValue(value: string | null): string {
	if (!value) return "Not set";
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.getTime())) return value;
	return parsed.toLocaleDateString("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function buildAddedModelSummaryLines(snapshot: InternalModelSnapshot): string[] {
	const lines = [`Event: Added`, `Status: ${formatStatusValue(snapshot.status)}`];
	if (snapshot.announcementDate) lines.push(`Announced: ${formatDateValue(snapshot.announcementDate)}`);
	if (snapshot.releaseDate) lines.push(`Release: ${formatDateValue(snapshot.releaseDate)}`);
	if (snapshot.deprecationDate) lines.push(`Deprecation: ${formatDateValue(snapshot.deprecationDate)}`);
	if (snapshot.retirementDate) lines.push(`Retirement: ${formatDateValue(snapshot.retirementDate)}`);
	return lines;
}

function buildUpdatedModelSummaryLines(previous: InternalModelSnapshot, current: InternalModelSnapshot): string[] {
	const lines: string[] = ["Event: Updated"];

	if (previous.status !== current.status) {
		lines.push(`Status: ${formatStatusValue(previous.status)} -> ${formatStatusValue(current.status)}`);
	}
	if (previous.announcementDate !== current.announcementDate) {
		lines.push(`Announced: ${formatDateValue(previous.announcementDate)} -> ${formatDateValue(current.announcementDate)}`);
	}
	if (previous.releaseDate !== current.releaseDate) {
		lines.push(`Release: ${formatDateValue(previous.releaseDate)} -> ${formatDateValue(current.releaseDate)}`);
	}
	if (previous.deprecationDate !== current.deprecationDate) {
		lines.push(`Deprecation: ${formatDateValue(previous.deprecationDate)} -> ${formatDateValue(current.deprecationDate)}`);
	}
	if (previous.retirementDate !== current.retirementDate) {
		lines.push(`Retirement: ${formatDateValue(previous.retirementDate)} -> ${formatDateValue(current.retirementDate)}`);
	}

	return lines.length > 1 ? lines : [];
}

function toNotificationModel(snapshot: InternalModelSnapshot, changeSummaryLines: string[]): InternalModelNotificationModel {
	return {
		modelId: snapshot.modelId,
		modelName: snapshot.name,
		modelUrl: buildModelUrl(snapshot.modelId),
		creatorId: snapshot.organisationId,
		creatorName: snapshot.organisationName ?? undefined,
		creatorColor: snapshot.organisationColour ?? undefined,
		changeSummaryLines,
	};
}

async function loadCurrentInternalModels(): Promise<Map<string, InternalModelSnapshot>> {
	const supabase = getSupabaseAdmin();
	const out = new Map<string, InternalModelSnapshot>();

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("data_models")
			.select(
				"model_id,name,organisation_id,status,announcement_date,release_date,deprecation_date,retirement_date,organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name,colour)"
			)
			.order("model_id", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			throw new Error(error.message || "Failed to load current internal models");
		}

		const rows = (data ?? []) as InternalCurrentRow[];
		for (const row of rows) {
			const snapshot = mapCurrentRow(row);
			if (!snapshot) continue;
			out.set(snapshot.modelId, snapshot);
		}

		if (rows.length < PAGE_SIZE) break;
	}

	return out;
}

async function loadPreviousInternalModels(): Promise<Map<string, InternalModelSnapshot>> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_internal_seen_models")
		.select("model_id,name,organisation_id,organisation_name,organisation_colour,status,announcement_date,release_date,deprecation_date,retirement_date");

	if (error) {
		throw new Error(error.message || "Failed to load previous internal model discovery state");
	}

	const out = new Map<string, InternalModelSnapshot>();
	for (const row of (data ?? []) as InternalSeenRow[]) {
		const snapshot = mapSeenRow(row);
		if (!snapshot) continue;
		out.set(snapshot.modelId, snapshot);
	}

	return out;
}

async function upsertCurrentInternalModels(rows: InternalSeenUpsertRow[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = getSupabaseAdmin();

	for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
		const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
		const { error } = await supabase
			.from("model_discovery_internal_seen_models")
			.upsert(batch, { onConflict: "model_id" });
		if (error) {
			throw new Error(error.message || "Failed to persist internal model discovery state");
		}
	}
}

async function deleteRemovedInternalModels(modelIds: string[]): Promise<void> {
	if (modelIds.length === 0) return;
	const supabase = getSupabaseAdmin();

	for (let index = 0; index < modelIds.length; index += UPSERT_BATCH_SIZE) {
		const batch = modelIds.slice(index, index + UPSERT_BATCH_SIZE);
		const { error } = await supabase
			.from("model_discovery_internal_seen_models")
			.delete()
			.in("model_id", batch);
		if (error) {
			throw new Error(error.message || "Failed to delete removed internal model discovery rows");
		}
	}
}

export async function runInternalCatalogDiscovery(): Promise<InternalCatalogDiscoverySummary> {
	if (!toBool(readBindingEnv(["MODEL_DISCOVERY_INTERNAL_ENABLED"]) ?? "true", true)) {
		return {
			enabled: false,
			executed: false,
			baselineInitialized: false,
			modelsCurrent: 0,
			additionsDetected: 0,
			updatesDetected: 0,
			removalsDetected: 0,
			notified: false,
			skippedReason: "disabled by MODEL_DISCOVERY_INTERNAL_ENABLED=false",
		};
	}

	const previous = await loadPreviousInternalModels();
	const current = await loadCurrentInternalModels();
	const nowIso = new Date().toISOString();

	const additions: InternalModelNotificationModel[] = [];
	const updates: InternalModelNotificationModel[] = [];
	const removals: string[] = [];

	for (const [modelId, currentSnapshot] of current.entries()) {
		const previousSnapshot = previous.get(modelId);
		if (!previousSnapshot) {
			additions.push(toNotificationModel(currentSnapshot, buildAddedModelSummaryLines(currentSnapshot)));
			continue;
		}

		const changeSummaryLines = buildUpdatedModelSummaryLines(previousSnapshot, currentSnapshot);
		if (changeSummaryLines.length > 0) {
			updates.push(toNotificationModel(currentSnapshot, changeSummaryLines));
		}
	}

	for (const modelId of previous.keys()) {
		if (!current.has(modelId)) {
			removals.push(modelId);
		}
	}

	const upsertRows: InternalSeenUpsertRow[] = Array.from(current.values()).map((snapshot) => ({
		model_id: snapshot.modelId,
		name: snapshot.name,
		organisation_id: snapshot.organisationId,
		organisation_name: snapshot.organisationName,
		organisation_colour: snapshot.organisationColour,
		status: snapshot.status,
		announcement_date: snapshot.announcementDate,
		release_date: snapshot.releaseDate,
		deprecation_date: snapshot.deprecationDate,
		retirement_date: snapshot.retirementDate,
		last_seen_at: nowIso,
	}));

	await upsertCurrentInternalModels(upsertRows);
	await deleteRemovedInternalModels(removals);

	const baselineInitialized = previous.size === 0 && current.size > 0;
	if (baselineInitialized) {
		console.log("[model-discovery][internal] Baseline initialized; skipping first-run notifications.");
		return {
			enabled: true,
			executed: true,
			baselineInitialized: true,
			modelsCurrent: current.size,
			additionsDetected: 0,
			updatesDetected: 0,
			removalsDetected: 0,
			notified: false,
		};
	}

	const modelsToNotify = [...additions, ...updates];
	if (modelsToNotify.length === 0) {
		return {
			enabled: true,
			executed: true,
			baselineInitialized: false,
			modelsCurrent: current.size,
			additionsDetected: 0,
			updatesDetected: 0,
			removalsDetected: removals.length,
			notified: false,
		};
	}

	const webhookUrl = trimOrNull(readBindingEnv(["DISCORD_WEBHOOK_NEW_MODELS_PUBLIC"]));
	if (!webhookUrl) {
		console.log(
			`[model-discovery][internal] ${modelsToNotify.length} internal model notification(s) detected, but DISCORD_WEBHOOK_NEW_MODELS_PUBLIC is missing.`
		);
		return {
			enabled: true,
			executed: true,
			baselineInitialized: false,
			modelsCurrent: current.size,
			additionsDetected: additions.length,
			updatesDetected: updates.length,
			removalsDetected: removals.length,
			notified: false,
			skippedReason: "missing DISCORD_WEBHOOK_NEW_MODELS_PUBLIC",
		};
	}

	try {
		const payload = buildInternalModelWebhookPayload(
			modelsToNotify,
			trimOrNull(readBindingEnv(["DISCORD_ROLE_ID_MODEL_UPDATES"])),
			{
				discordUserId: trimOrNull(readBindingEnv(["DISCORD_USER_ID"])),
				avatarUrl: trimOrNull(readBindingEnv(["DISCORD_MODEL_DISCOVERY_AVATAR_URL"])),
				includeMentions: true,
				maxModelEmbeds: 10,
			}
		);
		await sendDiscordWebhookPayload(webhookUrl, payload);
		return {
			enabled: true,
			executed: true,
			baselineInitialized: false,
			modelsCurrent: current.size,
			additionsDetected: additions.length,
			updatesDetected: updates.length,
			removalsDetected: removals.length,
			notified: true,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[model-discovery][internal] Discord notification failed: ${message}`);
		return {
			enabled: true,
			executed: true,
			baselineInitialized: false,
			modelsCurrent: current.size,
			additionsDetected: additions.length,
			updatesDetected: updates.length,
			removalsDetected: removals.length,
			notified: false,
			notificationError: message,
		};
	}
}
