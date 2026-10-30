import "server-only";
import { z } from "zod";
import { requireAuthenticatedUser, requireWorkspaceMembership } from "@/utils/serverActionAuth";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { WebApiError } from "@/lib/web-api/client";
import type { FeedbackRow, PresetRow } from "@/app/(dashboard)/settings/presets/experiments/PresetFeedbackClient";

const filtersSchema = z.object({
	fromIso: z.iso.datetime(), toIso: z.iso.datetime(),
	rating: z.enum(["all", "thumbs_up", "thumbs_down", "correct", "partly_correct", "incorrect", "unsafe", "unrated"]),
	metadataKey: z.string().max(64), metadataValue: z.string().max(256),
});

export async function fetchSettingsPresetFeedback(parameters?: string) {
	const filters = filtersSchema.parse(JSON.parse(parameters ?? "{}"));
	let identity: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
	try { identity = await requireAuthenticatedUser(); }
	catch { throw new WebApiError("/settings/presets/experiments", 401); }
	const { supabase, user } = identity;
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) return { workspaceId: null };
	try { await requireWorkspaceMembership(supabase, user.id, workspaceId); }
	catch { throw new WebApiError("/settings/presets/experiments", 403); }
	const { data: presetsData, error: presetsError } = await supabase.from("presets")
		.select("id,name,slug,description,config").eq("workspace_id", workspaceId).order("name", { ascending: true });
	if (presetsError) throw presetsError;
	const presets = (presetsData ?? []) as PresetRow[];
	const presetIds = presets.map((preset) => preset.id);
	const feedback: FeedbackRow[] = [];
	let feedbackTruncated = false;
	if (presetIds.length) {
		const pageSize = 1_000;
		const maxFeedbackRows = 10_000;
		for (let offset = 0; offset < maxFeedbackRows; offset += pageSize) {
			let query = supabase.from("gateway_feedback")
				.select("id,request_id,session_id,preset_id,rating,score,reason,reason_tags,comment,metadata_dimensions,end_user_id,created_at")
				.eq("workspace_id", workspaceId).in("preset_id", presetIds)
				.gte("created_at", filters.fromIso).lte("created_at", filters.toIso)
				.order("created_at", { ascending: false }).order("id", { ascending: false })
				.range(offset, offset + pageSize - 1);
			if (filters.rating === "unrated") query = query.is("rating", null);
			else if (filters.rating !== "all") query = query.eq("rating", filters.rating);
			if (filters.metadataKey && filters.metadataValue) query = query.contains("metadata_dimensions", { [filters.metadataKey]: filters.metadataValue });
			const { data, error } = await query;
			if (error) throw error;
			const page = (data ?? []) as FeedbackRow[];
			feedback.push(...page);
			if (page.length < pageSize) break;
			if (feedback.length >= maxFeedbackRows) feedbackTruncated = true;
		}
	}
	return { workspaceId, presets, feedback, feedbackTruncated };
}
