"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { revalidateAppDataTags } from "@/lib/cache/revalidateDataTags";
import { normalizeAppCategoryCsv } from "@/lib/appCategories";
import { requireWorkspaceMembership } from "@/utils/serverActionAuth";

const PROTECTED_APP_TITLES = new Set([
	"ai stats chat",
	"ai stats playground",
]);
const PROTECTED_APP_KEY_PREFIXES = [
	"ai-stats-chat",
	"aistats-chat",
	"ai-stats-playground",
	"aistats-playground",
];

function isProtectedApp(title: string | null, appKey: string | null) {
	const normalizedTitle = title?.trim().toLowerCase();
	if (normalizedTitle && PROTECTED_APP_TITLES.has(normalizedTitle)) {
		return true;
	}
	const normalizedKey = appKey?.trim().toLowerCase();
	return Boolean(
		normalizedKey &&
			PROTECTED_APP_KEY_PREFIXES.some((prefix) =>
				normalizedKey.startsWith(prefix)
			)
	);
}

function normalizeOptionalHttpUrl(value: string | null | undefined, field: string) {
	if (value == null) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`${field} must be a valid URL`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`${field} must start with http:// or https://`);
	}

	return parsed.toString();
}

type UpdateAppInput = {
	title?: string;
	url?: string | null;
	docs_url?: string | null;
	image_url?: string | null;
	is_public?: boolean;
	is_active?: boolean;
	category?: string | null;
};

export async function updateAppAction(appId: string, updates: UpdateAppInput) {
	if (!appId || typeof appId !== "string") {
		throw new Error("Valid app ID is required");
	}

	const supabase = await createClient();
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	const { data: existingApp, error: existingAppError } = await supabase
		.from("api_apps")
		.select("id, workspace_id, title, app_key")
		.eq("id", appId)
		.maybeSingle();

	if (existingAppError) {
		throw new Error(existingAppError.message ?? "Failed to load app");
	}

	if (!existingApp) {
		throw new Error("App not found");
	}

	if (!existingApp.workspace_id) {
		throw new Error("App not found");
	}
	await requireWorkspaceMembership(supabase, user.id, existingApp.workspace_id);

	if (isProtectedApp(existingApp.title, existingApp.app_key)) {
		throw new Error("This app is managed by AI Stats and cannot be edited");
	}

	const updateObj: Record<string, unknown> = {};

	if (typeof updates.title === "string") {
		const trimmed = updates.title.trim();
		if (!trimmed) {
			throw new Error("Title cannot be empty");
		}
		updateObj.title = trimmed;
	}

	if (typeof updates.url === "string") {
		const trimmed = updates.url.trim();
		updateObj.url = trimmed.length > 0 ? trimmed : "about:blank";
	}

	if (updates.url === null) {
		updateObj.url = "about:blank";
	}

	if (typeof updates.docs_url === "string") {
		updateObj.docs_url = normalizeOptionalHttpUrl(
			updates.docs_url,
			"Docs URL"
		);
	}

	if (updates.docs_url === null) {
		updateObj.docs_url = null;
	}

	if (typeof updates.image_url === "string") {
		const trimmed = updates.image_url.trim();
		updateObj.image_url = trimmed.length > 0 ? trimmed : null;
	}

	if (updates.image_url === null) {
		updateObj.image_url = null;
	}

	if (typeof updates.is_public === "boolean") {
		updateObj.is_public = updates.is_public;
	}

	if (typeof updates.is_active === "boolean") {
		updateObj.is_active = updates.is_active;
	}

	if (Object.prototype.hasOwnProperty.call(updates, "category")) {
		updateObj.category = normalizeAppCategoryCsv(updates.category);
	}

	if (Object.keys(updateObj).length === 0) {
		return { success: true };
	}

	const { error } = await supabase
		.from("api_apps")
		.update(updateObj)
		.eq("id", appId)
		.eq("workspace_id", existingApp.workspace_id);

	if (error) {
		throw new Error(error.message ?? "Failed to update app");
	}

	revalidateAppDataTags([appId]);
	revalidatePath("/settings/apps");
	revalidatePath(`/apps/${appId}`);

	return { success: true };
}

export async function mergeAppsAction(
	sourceAppId: string,
	targetAppId: string
) {
	if (!sourceAppId || !targetAppId) {
		throw new Error("Source and target apps are required");
	}
	if (sourceAppId === targetAppId) {
		throw new Error("Select a different target app");
	}

	const supabase = await createClient();
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	const { data: apps, error: appError } = await supabase
		.from("api_apps")
		.select("id, workspace_id, title, app_key")
		.in("id", [sourceAppId, targetAppId]);

	if (appError || !apps || apps.length !== 2) {
		throw new Error("Apps must belong to your workspace");
	}

	const workspaceId = apps[0].workspace_id;
	if (!apps.every((app) => app.workspace_id === workspaceId)) {
		throw new Error("Apps must belong to the same workspace");
	}

	if (!workspaceId) {
		throw new Error("Apps must belong to your workspace");
	}
	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	if (apps.some((app) => isProtectedApp(app.title, app.app_key))) {
		throw new Error("AI Stats managed apps cannot be merged");
	}

	const admin = createAdminClient();
	const { error: updateError } = await admin
		.from("gateway_requests")
		.update({ app_id: targetAppId })
		.eq("app_id", sourceAppId)
		.eq("workspace_id", workspaceId);

	if (updateError) {
		throw new Error(updateError.message ?? "Failed to move request history");
	}

	const { error: deleteError } = await supabase
		.from("api_apps")
		.delete()
		.eq("id", sourceAppId);

	if (deleteError) {
		throw new Error(deleteError.message ?? "Failed to remove source app");
	}

	revalidateAppDataTags([sourceAppId, targetAppId]);
	revalidatePath("/settings/apps");
	revalidatePath(`/apps/${sourceAppId}`);
	revalidatePath(`/apps/${targetAppId}`);

	return { success: true };
}
