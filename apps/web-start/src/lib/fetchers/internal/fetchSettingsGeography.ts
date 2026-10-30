import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export type PrivateGeographyRow = {
	country_code: string;
	continent_code: string | null;
	requests: number | string;
	tokens: number | string;
	spend_nanos: number | string;
	successes: number | string;
	average_latency_ms: number | string | null;
};

export type SettingsGeographyData = {
	data: PrivateGeographyRow[];
	from: string;
	to: string;
	signedIn: boolean;
	workspaceId: string | null;
};

export async function fetchSettingsGeography(
	searchParams: Record<string, string | string[] | undefined>,
): Promise<SettingsGeographyData | null> {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return null;
	const params = new URLSearchParams({ workspaceId: context.workspaceId });
	for (const key of ["usage_preset", "usage_from", "usage_to"]) {
		const value = searchParams[key];
		if (typeof value === "string") params.set(key, value);
	}
	return fetchAccountWebApi<SettingsGeographyData>(
		`/api/account/settings/usage/geography?${params.toString()}`,
		context.accessToken,
	).catch(() => ({
		data: [],
		from: "",
		to: "",
		signedIn: true,
		workspaceId: context.workspaceId,
	}));
}
