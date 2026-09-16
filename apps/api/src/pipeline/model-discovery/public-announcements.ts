import { getSupabaseAdmin } from "@/runtime/env";
import { readBindingEnv, toBool } from "./helpers";
import { buildInternalModelWebhookPayload, sendDiscordWebhookPayload } from "./discord";

const PUBLIC_ANNOUNCEMENT_BATCH_SIZE = 10;
const PUBLIC_ANNOUNCEMENT_PAGE_SIZE = 1_000;
const PUBLIC_MODEL_DISCOVERY_USERNAME = "Phaseo Public Model Discovery";
const PUBLIC_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_light.png";
const PUBLIC_MODELS_URL = "https://phaseo.app/models";

type PublicModelRow = {
	model_slug: string | null;
	name: string | null;
	lab_slug: string | null;
	hidden: boolean | null;
	status: string | null;
};

type AnnouncementStateRow = {
	model_slug: string | null;
	status: string | null;
	attempt_count: number | null;
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
	return `https://phaseo.app/og/models/${modelPath(modelSlug)}?discovery=1`;
}

async function loadPublicModels(): Promise<PublicModelRow[]> {
	const supabase = getSupabaseAdmin();
	const rows: PublicModelRow[] = [];

	for (let offset = 0; ; offset += PUBLIC_ANNOUNCEMENT_PAGE_SIZE) {
		const { data, error } = await supabase
			.from("v2_models")
			.select("model_slug,name,lab_slug,hidden,status")
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
			.select("model_slug,status,attempt_count")
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
			status: baseline || !isPublicModel(model) ? "baseline" : "pending",
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

async function markPendingRun(
	runId: string,
	models: PendingAnnouncement[],
	nowIso: string,
): Promise<void> {
	if (models.length === 0) return;
	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from("model_discovery_public_announcements")
		.update({ last_run_id: runId, updated_at: nowIso })
		.in("model_slug", models.map((model) => model.modelSlug));
	if (error) throw new Error(error.message || "Failed to update public model announcement run state");
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
			last_run_id: runId,
			announced_at: nowIso,
			last_attempt_at: nowIso,
			last_error: null,
			updated_at: nowIso,
		})
		.in("model_slug", models.map((model) => model.modelSlug));
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
				updated_at: nowIso,
			})
			.eq("model_slug", model.modelSlug);
		if (error) throw new Error(error.message || "Failed to persist public model announcement attempt");
	}
}

function toNotification(model: PublicModelRow, stateAttemptCount: number): PendingAnnouncement | null {
	const modelSlug = normalizeSlug(model.model_slug);
	if (!modelSlug || !isPublicModel(model)) return null;
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

		const newModels: PublicModelRow[] = [];
		const skippedModels: PublicModelRow[] = [];
		for (const model of models) {
			const modelSlug = normalizeSlug(model.model_slug);
			if (!modelSlug || stateBySlug.has(modelSlug)) continue;
			if (isPublicModel(model)) newModels.push(model);
			else skippedModels.push(model);
		}

		summary.detected = newModels.length;
		summary.skipped = skippedModels.length;
		await insertNewAnnouncementState(args.runId, [...newModels, ...skippedModels], new Date().toISOString());

		const newModelSlugs = new Set(
			newModels.flatMap((model) => {
				const modelSlug = normalizeSlug(model.model_slug);
				return modelSlug ? [modelSlug] : [];
			}),
		);
		const pendingModels = models.flatMap((model) => {
			const modelSlug = normalizeSlug(model.model_slug);
			if (!modelSlug) return [];
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

		await markPendingRun(args.runId, pendingModels, new Date().toISOString());
		for (let index = 0; index < pendingModels.length; index += PUBLIC_ANNOUNCEMENT_BATCH_SIZE) {
			const batch = pendingModels.slice(index, index + PUBLIC_ANNOUNCEMENT_BATCH_SIZE);
			try {
				const payload = buildInternalModelWebhookPayload(
					batch.map((model) => ({
						modelId: model.modelSlug,
						modelName: model.modelName,
						modelUrl: model.modelUrl,
						imageUrl: model.imageUrl,
						creatorId: model.labSlug,
						creatorName: displayLabName(model.labSlug),
						changeSummaryLines: ["Added to the public Phaseo model catalog."],
					})),
					null,
					{
						username: PUBLIC_MODEL_DISCOVERY_USERNAME,
						avatarUrl: PUBLIC_MODEL_DISCOVERY_AVATAR_URL,
						latestModelsUrl: PUBLIC_MODELS_URL,
						message: "New public model catalog entries detected.",
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
					pendingModels.slice(index),
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
