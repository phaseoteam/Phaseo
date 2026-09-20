"use server";

import { revalidatePath } from "next/cache";

import {
	normalizeDisplayPreferences,
	type DisplayPreferences,
} from "@/lib/displayPreferences";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function updateDisplayPreferences(
	input: DisplayPreferences,
): Promise<{ ok: true; preferences: DisplayPreferences }> {
	const context = await getServerAccountContext();
	if (!context.accessToken) throw new Error("Not authenticated");
	const preferences = normalizeDisplayPreferences(input);
	const response = await fetchAccountWebApi<{ ok: true; preferences: DisplayPreferences }>(
		"/api/account/settings/preferences",
		context.accessToken,
		{ method: "PUT", body: JSON.stringify(preferences) },
	);
	revalidatePath("/settings/preferences");
	return response;
}
