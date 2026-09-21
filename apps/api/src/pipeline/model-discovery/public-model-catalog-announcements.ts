// Track public catalog state and claim announcements; embed formatting lives in public-model-announcement-discord.ts.
import { getSupabaseAdmin } from "@/runtime/env";
import { readBindingEnv, toBool } from "./helpers";
import { buildPublicModelAnnouncementPayload } from "./public-model-announcement-discord";
import { sendDiscordWebhookPayload } from "./discord-webhook";

const PUBLIC_ANNOUNCEMENT_BATCH_SIZE = 10;
const PUBLIC_ANNOUNCEMENT_STATE_BATCH_SIZE = 100;
const PUBLIC_ANNOUNCEMENT_PAGE_SIZE = 1_000;
const PUBLIC_ANNOUNCEMENT_CLAIM_LEASE_SECONDS = 300;
const PUBLIC_MODEL_DISCOVERY_USERNAME = "Phaseo Public Model Discovery";
const PUBLIC_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_light.png";
const PUBLIC_MODELS_URL = "https://phaseo.app/models";

type PublicModelRow = {
	model_slug: string | null;
	name: string | null;
	lab_slug: string | null;
	hidden: boolean | null;
	status: string | null;
	catalogue_status: string | null;
};

type AnnouncementStateRow = {
	model_slug: string | null;
	status: string | null;
	attempt_count: number | null;
	first_seen_at: string | null;
	announced_at: string | null;
	catalogue_status_snapshot: string | null;
	public_visibility_snapshot: boolean | null;
};

type PendingAnnouncement = {
	modelSlug: string;
	modelName: string;
	labSlug: string;
	modelUrl: string;
	imageUrl: string;
	stateAttemptCount: number;
};

export type PublicModelAnnouncementSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	detected: number;
	notified: number;
	skipped: number;
	pending: number;
	reason?: string | null;
	error?: string | null;
};

function emptySummary(): PublicModelAnnouncementSummary {
	return {
		enabled: false,
		executed: false,
		baselineInitialized: false,
		detected: 0,
		notified: 0,
		skipped: 0,
		pending: 0,
		reason: null,
		error: null,
	};
}

function normalizeSlug(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	return normalized || null;
}

function normalizeName(value: string | null | undefined, fallback: string): string {
	if (typeof value === "string" && value.trim()) return value.trim();
	return fallback;
}

function displayLabName(value: string): string {
	return value
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function isPublicModel(row: PublicModelRow): boolean {
	if (row.hidden === true) return false;
	const status = row.status?.trim().toLowerCase();
	return !status || !["draft", "disabled", "retired"].includes(status);
}

function isAvailableCatalogueStatus(value: string | null | undefined): boolean {
	return value?.trim().toLowerCase() === "available";
}

function isNewlyAvailable(
	model: PublicModelRow,
	state: AnnouncementStateRow,
): boolean {
	if (state.status !== "baseline" && state.status !== "announced") return false;
	return isPublicModel(model)
		&& isAvailableCatalogueStatus(model.catalogue_status)
		&& (
			!isAvailableCatalogueStatus(state.catalogue_status_snapshot)
			|| state.public_visibility_snapshot === false
		);
}

function modelPath(modelSlug: string): string {
	return modelSlug
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function modelUrl(modelSlug: string): string {
	return `${PUBLIC_MODELS_URL}/${modelPath(modelSlug)}`;
}

function modelImageUrl(modelSlug: string): string {
	return `https://phaseo.app/og/models/${modelPath(modelSlug)}`;
}

async function loadPublicModels(): Promise<PublicModelRow[]> {
	const supabase = getSupabaseAdmin();
	const rows: PublicModelRow[] = [];

	for (let offset = 0; ; offset += PUBLIC_ANNOUNCEMENT_PAGE_SIZE) {
		const { data, error } = await supabase
			.from("v2_models")
			.select("model_slug,name,lab_slug,hidden,status,catalogue_status")
			.order("model_slug", { ascending: true })
			.range(offset, offset + PUBLIC_ANNOUNCEMENT_PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed to load public model catalog");

		const page = (data ?? []) as PublicModelRow[];
		rows.push(...page);
		if (page.length < PUBLIC_ANNOUNCEMENT_PAGE_SIZE) break;
	}

	return rows;
}

async function loadAnnouncementState(): Promise<AnnouncementStateRow[]> {
	const supabase = getSupabaseAdmin();
	const rows: AnnouncementStateRow[] = [];

	for (let offset = 0; ; offset += PUBLIC_ANNOUNCEMENT_PAGE_SIZE) {
		const { data, error } = await supabase
			.from("model_discovery_public_announcements")
			.select("model_slug,status,attempt_count,first_seen_at,announced_at,catalogue_status_snapshot,public_visibility_snapshot")
			.order("model_slug", { ascending: true })
			.range(offset, offset + PUBLIC_ANNOUNCEMENT_PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed to load public model announcement state");

		const page = (data ?? []) as AnnouncementStateRow[];
		rows.push(...page);
		if (page.length < PUBLIC_ANNOUNCEMENT_PAGE_SIZE) break;
	}

	return rows;
}

async function insertNewAnnouncementState(
	runId: string,
	models: PublicModelRow[],
	nowIso: string,
	baseline = false,
): Promise<void> {
	if (models.length === 0) return;

	const rows = models.flatMap((model) => {
		const modelSlug = normalizeSlug(model.model_slug);
		if (!modelSlug) return [];
		return [{
			model_slug: modelSlug,
			status: baseline || !isPublicModel(model) || !isAvailableCatalogueStatus(model.catalogue_status)
				? "baseline"
				: "pending",
			catalogue_status_snapshot: model.catalogue_status,
			public_visibility_snapshot: isPublicModel(model),
			last_run_id: runId,
			first_seen_at: nowIso,
			updated_at: nowIso,
		}];
	});
	if (rows.length === 0) return;

	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from("model_discovery_public_announcements")
		.upsert(rows, { onConflict: "model_slug", ignoreDuplicates: true });
	if (error) throw new Error(error.message || "Failed to persist public model announcement state");
}

async function promoteAvailableAnnouncementState(
	runId: string,
	models: PublicModelRow[],
	nowIso: string,
): Promise<void> {
	const modelSlugs: string[] = [];
	for (const model of models) {
		const modelSlug = normalizeSlug(model.model_slug);
		if (!modelSlug) continue;
		modelSlugs.push(modelSlug);
	}
	if (modelSlugs.length === 0) return;

	const supabase = getSupabaseAdmin();
	for (let offset = 0; offset < modelSlugs.length; offset += PUBLIC_ANNOUNCEMENT_STATE_BATCH_SIZE) {
		const batch = modelSlugs.slice(offset, offset + PUBLIC_ANNOUNCEMENT_STATE_BATCH_SIZE);
		const { error } = await supabase
			.from("model_discovery_public_announcements")
			.update({
				status: "pending",
				catalogue_status_snapshot: "available",
				public_visibility_snapshot: true,
				last_run_id: runId,
				last_error: null,
				updated_at: nowIso,
			})
			.in("model_slug", batch)
			.in("status", ["baseline", "announced"]);
		if (error) throw new Error(error.message || "Failed to promote available model announcement state");
	}
}

async function persistObservedAnnouncementState(
	runId: string,
	models: PublicModelRow[],
	stateBySlug: Map<string, AnnouncementStateRow>,
	nowIso: string,
): Promise<void> {
	const updates = new Map<string, string[]>();
	for (const model of models) {
		const modelSlug = normalizeSlug(model.model_slug);
		const state = modelSlug ? stateBySlug.get(modelSlug) : undefined;
		if (!modelSlug || !state || (state.status !== "baseline" && state.status !== "announced")) continue;
		const catalogueStatus = model.catalogue_status ?? "";
		const publicVisibility = isPublicModel(model);
		if (
			(state.catalogue_status_snapshot ?? "") === catalogueStatus
			&& state.public_visibility_snapshot === publicVisibility
		) continue;
		const key = JSON.stringify([catalogueStatus, publicVisibility]);
		const modelSlugs = updates.get(key) ?? [];
		modelSlugs.push(modelSlug);
		updates.set(key, modelSlugs);
	}
	if (updates.size === 0) return;

	const supabase = getSupabaseAdmin();
	for (const [key, modelSlugs] of updates) {
		const [catalogueStatus, publicVisibility] = JSON.parse(key) as [string, boolean];
		for (let offset = 0; offset < modelSlugs.length; offset += PUBLIC_ANNOUNCEMENT_STATE_BATCH_SIZE) {
			const batch = modelSlugs.slice(offset, offset + PUBLIC_ANNOUNCEMENT_STATE_BATCH_SIZE);
			const { error } = await supabase
				.from("model_discovery_public_announcements")
				.update({
					catalogue_status_snapshot: catalogueStatus || null,
					public_visibility_snapshot: publicVisibility,
					last_run_id: runId,
					updated_at: nowIso,
				})
				.in("model_slug", batch)
				.in("status", ["baseline", "announced"]);
			if (error) throw new Error(error.message || "Failed to persist public model announcement observation");
		}
	}
}

async function markPendingRun(
	runId: string,
	models: PendingAnnouncement[],
	nowIso: string,
): Promise<PendingAnnouncement[]> {
	if (models.length === 0) return [];
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.rpc("claim_model_discovery_public_announcements", {
		p_run_id: runId,
		p_model_slugs: models.map((model) => model.modelSlug),
		p_now: nowIso,
		p_lease_seconds: PUBLIC_ANNOUNCEMENT_CLAIM_LEASE_SECONDS,
	});
	if (error) throw new Error(error.message || "Failed to update public model announcement run state");

	const attemptsBySlug = new Map<string, number>();
	for (const row of (Array.isArray(data) ? data : []) as Array<{ model_slug?: unknown; attempt_count?: unknown }>) {
		const modelSlug = normalizeSlug(typeof row.model_slug === "string" ? row.model_slug : null);
		if (!modelSlug) continue;
		const attemptCount = typeof row.attempt_count === "number" && Number.isFinite(row.attempt_count)
			? Math.max(0, Math.trunc(row.attempt_count))
			: 0;
		attemptsBySlug.set(modelSlug, attemptCount);
	}

	return models.flatMap((model) => {
		const stateAttemptCount = attemptsBySlug.get(model.modelSlug);
		return stateAttemptCount === undefined ? [] : [{ ...model, stateAttemptCount }];
	});
}

async function markAnnounced(
	runId: string,
	models: PendingAnnouncement[],
	nowIso: string,
): Promise<void> {
	if (models.length === 0) return;
	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from("model_discovery_public_announcements")
		.update({
			status: "announced",
			catalogue_status_snapshot: "available",
			last_run_id: runId,
			announced_at: nowIso,
			last_attempt_at: nowIso,
			last_error: null,
			claim_run_id: null,
			claim_expires_at: null,
			updated_at: nowIso,
		})
		.in("model_slug", models.map((model) => model.modelSlug))
		.eq("claim_run_id", runId);
	if (error) throw new Error(error.message || "Failed to mark public model announcements delivered");
}

async function markAttemptFailed(
	runId: string,
	models: PendingAnnouncement[],
	errorMessage: string,
	nowIso: string,
): Promise<void> {
	if (models.length === 0) return;
	const supabase = getSupabaseAdmin();
	for (const model of models) {
		const { error } = await supabase
			.from("model_discovery_public_announcements")
			.update({
				status: "pending",
				last_run_id: runId,
				last_attempt_at: nowIso,
				attempt_count: model.stateAttemptCount + 1,
				last_error: errorMessage.slice(0, 2_000),
				claim_run_id: null,
				claim_expires_at: null,
				updated_at: nowIso,
			})
			.eq("model_slug", model.modelSlug)
			.eq("claim_run_id", runId);
		if (error) throw new Error(error.message || "Failed to persist public model announcement attempt");
	}
}

function toNotification(model: PublicModelRow, stateAttemptCount: number): PendingAnnouncement | null {
	const modelSlug = normalizeSlug(model.model_slug);
	if (!modelSlug || !isPublicModel(model) || !isAvailableCatalogueStatus(model.catalogue_status)) return null;
	const labSlug = normalizeSlug(model.lab_slug) ?? modelSlug.split("/")[0] ?? "phaseo";
	return {
		modelSlug,
		modelName: normalizeName(model.name, modelSlug),
		labSlug,
		modelUrl: modelUrl(modelSlug),
		imageUrl: modelImageUrl(modelSlug),
		stateAttemptCount,
	};
}

export async function runPublicModelAnnouncementCheck(args: {
	runId: string;
	notify: boolean;
}): Promise<PublicModelAnnouncementSummary> {
	const summary = emptySummary();
	const notificationsDisabled = toBool(
		readBindingEnv(["MODEL_UPDATES_NOTIFICATIONS_DISABLED"]) ?? "false",
		false,
	);
	const webhookUrl = readBindingEnv(["DISCORD_WEBHOOK_NEW_MODELS_PUBLIC"]);
	summary.enabled = !notificationsDisabled && Boolean(webhookUrl);

	try {
		const [models, stateRows] = await Promise.all([loadPublicModels(), loadAnnouncementState()]);
		summary.executed = true;
		const stateBySlug = new Map(
			stateRows.flatMap((row) => {
				const modelSlug = normalizeSlug(row.model_slug);
				return modelSlug ? [[modelSlug, row] as const] : [];
			}),
		);

		if (stateRows.length === 0) {
			summary.baselineInitialized = true;
			await insertNewAnnouncementState(args.runId, models, new Date().toISOString(), true);
			return summary;
		}

		const nowIso = new Date().toISOString();
		const newModels: PublicModelRow[] = [];
		const newlyAvailableModels: PublicModelRow[] = [];
		const skippedModels: PublicModelRow[] = [];
		for (const model of models) {
			const modelSlug = normalizeSlug(model.model_slug);
			if (!modelSlug || stateBySlug.has(modelSlug)) continue;
			if (isPublicModel(model) && isAvailableCatalogueStatus(model.catalogue_status)) newModels.push(model);
			else skippedModels.push(model);
		}
		for (const model of models) {
			const modelSlug = normalizeSlug(model.model_slug);
			const state = modelSlug ? stateBySlug.get(modelSlug) : undefined;
			if (state && isNewlyAvailable(model, state)) newlyAvailableModels.push(model);
		}

		summary.detected = newModels.length + newlyAvailableModels.length;
		summary.skipped = skippedModels.length;
		await insertNewAnnouncementState(args.runId, [...newModels, ...skippedModels], nowIso);
		await persistObservedAnnouncementState(args.runId, models, stateBySlug, nowIso);
		await promoteAvailableAnnouncementState(args.runId, newlyAvailableModels, nowIso);

		const newModelSlugs = new Set(
			[...newModels, ...newlyAvailableModels].flatMap((model) => {
				const modelSlug = normalizeSlug(model.model_slug);
				return modelSlug ? [modelSlug] : [];
			}),
		);
		const newlyAvailableModelSlugs = new Set(
			newlyAvailableModels.flatMap((model) => {
				const modelSlug = normalizeSlug(model.model_slug);
				return modelSlug ? [modelSlug] : [];
			}),
		);
		const pendingModels = models.flatMap((model) => {
			const modelSlug = normalizeSlug(model.model_slug);
			if (!modelSlug || !isPublicModel(model) || !isAvailableCatalogueStatus(model.catalogue_status)) return [];
			const state = stateBySlug.get(modelSlug);
			if (state?.status !== "pending" && !newModelSlugs.has(modelSlug)) {
				return [];
			}
			return toNotification(model, Number.isFinite(state?.attempt_count) ? Number(state?.attempt_count) : 0) ?? [];
		});

		summary.pending = pendingModels.length;
		if (pendingModels.length === 0) return summary;

		if (!args.notify) {
			summary.reason = "notifications disabled for this run";
			return summary;
		}
		if (notificationsDisabled) {
			summary.reason = "disabled by MODEL_UPDATES_NOTIFICATIONS_DISABLED";
			return summary;
		}
		if (!webhookUrl) {
			summary.reason = "missing DISCORD_WEBHOOK_NEW_MODELS_PUBLIC";
			return summary;
		}

		const claimedModels = await markPendingRun(args.runId, pendingModels, new Date().toISOString());
		if (claimedModels.length === 0) return summary;
		for (let index = 0; index < claimedModels.length; index += PUBLIC_ANNOUNCEMENT_BATCH_SIZE) {
			const batch = claimedModels.slice(index, index + PUBLIC_ANNOUNCEMENT_BATCH_SIZE);
			try {
				const payload = buildPublicModelAnnouncementPayload(
					batch.map((model) => ({
						modelId: model.modelSlug,
						modelName: model.modelName,
						modelUrl: model.modelUrl,
						imageUrl: model.imageUrl,
						creatorId: model.labSlug,
						creatorName: displayLabName(model.labSlug),
						changeSummaryLines: [
							newlyAvailableModelSlugs.has(model.modelSlug)
								? "Now available in the public Phaseo model catalog."
								: "Added to the public Phaseo model catalog.",
						],
					})),
					readBindingEnv(["DISCORD_ROLE_ID"]),
					{
						username: PUBLIC_MODEL_DISCOVERY_USERNAME,
						avatarUrl: PUBLIC_MODEL_DISCOVERY_AVATAR_URL,
						latestModelsUrl: PUBLIC_MODELS_URL,
						message: "Public model catalog updates detected.",
						includeMentions: true,
						maxModelEmbeds: PUBLIC_ANNOUNCEMENT_BATCH_SIZE,
					},
				);
				await sendDiscordWebhookPayload(webhookUrl, payload);
				await markAnnounced(args.runId, batch, new Date().toISOString());
				summary.notified += batch.length;
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				summary.error = reason;
				await markAttemptFailed(
					args.runId,
					claimedModels.slice(index),
					reason,
					new Date().toISOString(),
				);
				break;
			}
		}

		summary.pending = Math.max(0, pendingModels.length - summary.notified);
		return summary;
	} catch (error) {
		summary.error = error instanceof Error ? error.message : String(error);
		return summary;
	}
}
