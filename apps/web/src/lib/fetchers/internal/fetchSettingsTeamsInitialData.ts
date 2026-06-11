import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { TeamsSettingsData } from "@/app/(dashboard)/settings/teams/teamsData";

export async function fetchSettingsTeamsInitialData(
	preferredWorkspaceId?: string | null,
): Promise<TeamsSettingsData> {
	const requestHeaders = await headers();
	const params = new URLSearchParams();
	const normalizedPreferredWorkspaceId = String(
		preferredWorkspaceId ?? "",
	).trim();
	if (normalizedPreferredWorkspaceId) {
		params.set("preferredWorkspaceId", normalizedPreferredWorkspaceId);
	}
	const query = params.toString();

	const response = await fetch(
		absoluteUrl(`/api/internal/settings/teams/initial${query ? `?${query}` : ""}`),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch settings teams initial data: ${response.status}`,
		);
	}

	return (await response.json()) as TeamsSettingsData;
}
