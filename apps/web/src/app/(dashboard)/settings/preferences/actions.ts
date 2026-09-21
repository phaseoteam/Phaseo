"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
	normalizeDisplayPreferences,
	type DisplayPreferences,
} from "@/lib/displayPreferences";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { OBFUSCATE_INFO_COOKIE, serializeObfuscateInfo } from "@/lib/obfuscation";

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
	const cookieStore = await cookies();
	cookieStore.set(
		OBFUSCATE_INFO_COOKIE,
		serializeObfuscateInfo(response.preferences.maskSensitiveData),
		{
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
		},
	);
	revalidatePath("/settings/preferences");
	revalidatePath("/settings/account");
	return response;
}
