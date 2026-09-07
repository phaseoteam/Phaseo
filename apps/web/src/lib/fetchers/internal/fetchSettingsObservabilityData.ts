import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import type { UsageLabelFacet, UsageLabelSummary } from "./settingsTypes";

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
	appMetadataEntries: Array<[string, { id: string; title: string; appKey: string | null; imageUrl: string | null }]>;
	appNameEntries: Array<[string, string]>;
	current: ObservabilityRequestResult;
	keys: Array<{ id: string; name: string | null; prefix: string | null }>;
	labelFacets: UsageLabelFacet[];
	labelSummary: UsageLabelSummary | null;
	modelMetadataEntries: Array<[string, { organisationId: string; organisationName: string; canonicalModelId?: string; modelName?: string }]>;
	previous: ObservabilityRequestResult;
	signedIn: boolean;
	workspaceId: string | null;
};

export type FetchSettingsObservabilityDataResult =
	| { status: "loaded"; data: SettingsObservabilityData }
	| { status: "unauthenticated" }
	| { status: "no-workspace" }
	| { status: "load-failed" };

export async function fetchSettingsObservabilityData(args: {
	from: string;
	to: string;
	previousFrom: string;
	previousTo: string;
	labelKey?: string | null;
	labelValue?: string | null;
}): Promise<FetchSettingsObservabilityDataResult> {
	const context = await getServerAccountContext();
	if (!context.accessToken) return { status: "unauthenticated" };

	// Validate even a non-empty cookie value. It can outlive a user's access
	// to that workspace, and forwarding it directly produces a 403.
	let workspaceId: string | undefined;
	try {
		workspaceId = await resolveAccessibleWorkspaceIdFromCookie({ throwOnFailure: true });
	} catch {
		return { status: "load-failed" };
	}
	if (!workspaceId) return { status: "no-workspace" };

	try {
		const params = new URLSearchParams({
			workspaceId,
			from: args.from,
			to: args.to,
			previousFrom: args.previousFrom,
			previousTo: args.previousTo,
		});
		if (args.labelKey) params.set("label_key", args.labelKey);
		if (args.labelValue) params.set("label_value", args.labelValue);
		const data = await fetchAccountWebApi<SettingsObservabilityData>(
			`/api/account/settings/usage/observability?${params.toString()}`,
			context.accessToken,
		);
		return { status: "loaded", data };
	} catch (error) {
		console.warn("[settings-observability] failed to load data", {
			error: String(error),
		});
		return { status: "load-failed" };
	}
}
