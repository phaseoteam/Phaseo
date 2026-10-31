import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";

import {
	normalizeDisplayPreferences,
	type DisplayPreferences,
} from "@/lib/displayPreferences";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { OBFUSCATE_INFO_COOKIE, serializeObfuscateInfo } from "@/lib/obfuscation";
import { setResponseCookie } from "@/lib/server/currentRequest";

export const updateDisplayPreferences = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: DisplayPreferences) => input)
	.handler(async ({ data: input }): Promise<{ ok: true; preferences: DisplayPreferences }> => {
		const context = await getServerAccountContext();
		if (!context.accessToken) throw new Error("Not authenticated");
		const preferences = normalizeDisplayPreferences(input);
		const response = await fetchAccountWebApi<{ ok: true; preferences: DisplayPreferences }>(
			"/api/account/settings/preferences",
			context.accessToken,
			{ method: "PUT", body: JSON.stringify(preferences) },
		);
		setResponseCookie(
			OBFUSCATE_INFO_COOKIE,
			serializeObfuscateInfo(response.preferences.maskSensitiveData),
			{
				path: "/",
				maxAge: 60 * 60 * 24 * 365,
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
			},
		);
		return response;
	});
