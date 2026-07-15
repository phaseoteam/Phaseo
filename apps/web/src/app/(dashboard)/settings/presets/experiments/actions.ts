"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { presetExperimentsEnabled } from "@/lib/flags";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

const VALID_STATUSES = new Set([
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
]);

function cleanText(value: FormDataEntryValue | null, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanUuid(value: FormDataEntryValue | null): string | null {
	const text = cleanText(value, 128);
	return text &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
		? text
		: null;
}

function cleanStatus(value: FormDataEntryValue | null): string {
	const text = cleanText(value, 32) ?? "pending";
	return VALID_STATUSES.has(text) ? text : "pending";
}

function cleanDimensionKeys(value: FormDataEntryValue | null): string[] {
	const text = cleanText(value, 500);
	if (!text) return [];
	return Array.from(
		new Set(
			text
				.split(",")
				.map((item) => item.trim().slice(0, 64))
				.filter((item) => /^[a-zA-Z0-9_.:-]+$/.test(item)),
		),
	).slice(0, 8);
}

async function requirePresetExperimentAdminContext() {
	if (!(await presetExperimentsEnabled())) {
		throw new Error("Preset experiments are not available for this workspace yet.");
	}
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);
	return { supabase, user, workspaceId };
}

async function assertPresetBelongsToWorkspace(
	supabase: Awaited<ReturnType<typeof requireAuthenticatedUser>>["supabase"],
	workspaceId: string,
	presetId: string | null,
) {
	if (!presetId) return;
	const { data, error } = await supabase
		.from("presets")
		.select("id")
		.eq("workspace_id", workspaceId)
		.eq("id", presetId)
		.maybeSingle();
	if (error) throw error;
	if (!data?.id) throw new Error("Preset not found in this workspace");
}

export async function createPresetExperiment(formData: FormData) {
	const { supabase, user, workspaceId } = await requirePresetExperimentAdminContext();
	const presetId = cleanUuid(formData.get("preset_id"));
	const baselinePresetId = cleanUuid(formData.get("baseline_preset_id"));
	if (!presetId) throw new Error("Select a candidate preset");
	if (baselinePresetId && baselinePresetId === presetId) {
		throw new Error("Baseline must be a different preset");
	}

	await Promise.all([
		assertPresetBelongsToWorkspace(supabase, workspaceId, presetId),
		assertPresetBelongsToWorkspace(supabase, workspaceId, baselinePresetId),
	]);

	const dimensionKeys = cleanDimensionKeys(formData.get("dimension_keys"));
	const { data, error } = await supabase
		.from("gateway_preset_test_runs")
		.insert({
			workspace_id: workspaceId,
			preset_id: presetId,
			baseline_preset_id: baselinePresetId,
			name: cleanText(formData.get("name"), 160),
			description: cleanText(formData.get("description"), 1000),
			status: cleanStatus(formData.get("status")),
			dataset_name: cleanText(formData.get("dataset_name"), 160),
			config: {
				metadata_dimension_keys: dimensionKeys,
			},
			created_by_user_id: user.id,
			started_at:
				cleanStatus(formData.get("status")) === "running"
					? new Date().toISOString()
					: null,
		})
		.select("id")
		.maybeSingle();
	if (error) throw error;
	if (!data?.id) throw new Error("Experiment was not created");

	revalidatePath("/settings/presets");
	revalidatePath("/settings/presets/experiments");
	redirect(`/settings/presets/experiments/${data.id}`);
}

export async function updatePresetExperimentStatus(formData: FormData) {
	const { supabase, workspaceId } = await requirePresetExperimentAdminContext();
	const id = cleanUuid(formData.get("id"));
	if (!id) throw new Error("Experiment id is required");
	const status = cleanStatus(formData.get("status"));
	const now = new Date().toISOString();
	const update: Record<string, unknown> = {
		status,
		updated_at: now,
	};
	if (status === "running") update.started_at = now;
	if (status === "completed" || status === "failed" || status === "cancelled") {
		update.completed_at = now;
	}

	const { error } = await supabase
		.from("gateway_preset_test_runs")
		.update(update)
		.eq("workspace_id", workspaceId)
		.eq("id", id);
	if (error) throw error;

	revalidatePath("/settings/presets/experiments");
	revalidatePath(`/settings/presets/experiments/${id}`);
}
