import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import type { UsageLabelFacet, UsageLabelSummary } from "./settingsTypes";
import type { UsageDay } from "@/lib/gateway/usage/periodUsageKpis";

/** Exact usage for one bucket, model, provider, key, app and BYOK, summed in the database. */
export type ObservabilityUsageCell = {
	/** The bucket's start, or null for a window summed whole. */
	bucket: string | null;
	modelId: string | null;
	provider: string | null;
	keyId: string | null;
	appId: string | null;
	byok: boolean;
	requests: number;
	successfulRequests: number;
	guardrailBlocked: number;
	costNanos: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cachedTokens: number;
};

export type ObservabilityUsageWindow = { from: string; to: string; cells: ObservabilityUsageCell[] };

export type SettingsObservabilityData = {
	currentUserId?: string;
	canViewWorkspaceUsers?: boolean;
	creatorFilter: { id: string; name: string | null; avatarUrl: string | null } | null;
	appMetadataEntries: Array<[string, { id: string; title: string; appKey: string | null; imageUrl: string | null }]>;
	appNameEntries: Array<[string, string]>;
	current: ObservabilityUsageWindow;
	keys: Array<{ id: string; name: string | null; prefix: string | null }>;
	labelFacets: UsageLabelFacet[];
	labelSummary: UsageLabelSummary | null;
	modelMetadataEntries: Array<[string, { organisationId: string; organisationName: string; canonicalModelId?: string; modelName?: string }]>;
	/** Exact daily workspace usage since the start of last month; null for filtered views. */
	monthUsage?: { observedAt: number; days: UsageDay[] } | null;
	/** When the windows were read. */
	observedAt?: number;
	previous: ObservabilityUsageWindow;
	/** The last 7 days under the same filters, which set the forecasts' pace. */
	recent?: ObservabilityUsageWindow;
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
	workspaceId?: string | null;
	creatorId?: string | null;
	keyId?: string | null;
}): Promise<FetchSettingsObservabilityDataResult> {
	const context = await getServerAccountContext();
	if (!context.accessToken) return { status: "unauthenticated" };

	// Validate even a non-empty cookie value. It can outlive a user's access
	// to that workspace, and forwarding it directly produces a 403.
	let workspaceId: string | undefined;
	try {
		workspaceId = args.workspaceId?.trim() || await resolveAccessibleWorkspaceIdFromCookie({ throwOnFailure: true });
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
		if (args.creatorId) params.set("user", args.creatorId);
		if (args.keyId) params.set("key", args.keyId);
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
