import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsKeysInitialData } from "@/app/api/internal/settings/keys/initial/route";

export async function fetchSettingsKeysInitialData(
	workspaceId?: string,
): Promise<SettingsKeysInitialData> {
	const requestHeaders = await headers();
	const params = new URLSearchParams();
	if (workspaceId?.trim()) {
		params.set("workspace_id", workspaceId.trim());
	}
	const query = params.toString();
	const response = await fetch(
		absoluteUrl(`/api/internal/settings/keys/initial${query ? `?${query}` : ""}`),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch API keys settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsKeysInitialData;
}
