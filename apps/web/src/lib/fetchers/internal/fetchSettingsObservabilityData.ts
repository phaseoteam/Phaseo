import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export type ObservabilityRequestRow = {
	created_at: string;
	model_id: string | null;
	provider: string | null;
	app_id: string | null;
	key_id: string | null;
	usage: unknown;
	cost_nanos: number | string | null;
	success: boolean | null;
	error_payload: Record<string, unknown> | null;
	error_message: string | null;
	pricing_lines: unknown;
};

export type ObservabilityRequestResult = { rows: ObservabilityRequestRow[]; isSampled: boolean; limit: number };

export type SettingsObservabilityData = {
	appNameEntries: Array<[string, string]>;
	current: ObservabilityRequestResult;
	keys: Array<{ id: string; name: string | null; prefix: string | null }>;
	modelMetadataEntries: Array<[string, { organisationId: string; organisationName: string; modelName?: string }]>;
	previous: ObservabilityRequestResult;
	signedIn: boolean;
	workspaceId: string | null;
};

export async function fetchSettingsObservabilityData(args: {
	from: string;
	to: string;
	previousFrom: string;
	previousTo: string;
}): Promise<SettingsObservabilityData | null> {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return null;
	const params = new URLSearchParams({ workspaceId: context.workspaceId, ...args });
	return fetchAccountWebApi<SettingsObservabilityData>(
		`/api/account/settings/usage/observability?${params.toString()}`,
		context.accessToken,
	);
}
