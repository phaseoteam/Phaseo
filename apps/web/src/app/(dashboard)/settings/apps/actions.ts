"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

type UpdateAppInput = {
	title?: string;
	url?: string | null;
	image_url?: string | null;
	is_public?: boolean;
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

	if (Object.keys(updateObj).length === 0) {
		return { success: true };
	}

	const { error } = await supabase
		.from("api_apps")
		.update(updateObj)
		.eq("id", appId);

	if (error) {
		throw new Error(error.message ?? "Failed to update app");
	}

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
		.select("id, team_id, title")
		.in("id", [sourceAppId, targetAppId]);

	if (appError || !apps || apps.length !== 2) {
		throw new Error("Apps must belong to your team");
	}

	const teamId = apps[0].team_id;
	if (!apps.every((app) => app.team_id === teamId)) {
		throw new Error("Apps must belong to the same team");
	}

	const admin = createAdminClient();
	const { error: updateError } = await admin
		.from("gateway_requests")
		.update({ app_id: targetAppId })
		.eq("app_id", sourceAppId)
		.eq("team_id", teamId);

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

	revalidatePath("/settings/apps");
	revalidatePath(`/apps/${sourceAppId}`);
	revalidatePath(`/apps/${targetAppId}`);

	return { success: true };
}
