// Optional provider telemetry and viewer data for ModelPricing. Each raced the
// 2.5 s timeout with a fallback inside its queryFn.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
	fetchFrontendModelProviderRoutingHealth,
	fetchFrontendModelProviderRuntimeStats,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import type { WorkspacePrivacySettings } from "@/lib/fetchers/internal/settingsTypes";
import {
	catalogueInternalAuthStatusQuery,
	catalogueWorkspacePrivacySettingsQuery,
	isAdminViewerStatus,
} from "@/components/(data)/catalogueViewer.functions";
import { catalogueModelRoot, withOptionalTimeout } from "@/components/(data)/model/modelData.queries";

const LOG_PREFIX = "[ModelPricing]";

function stableList(values: string[]): string {
	return [...new Set(values)].sort().join("\u001f");
}

/** `isAdminViewer()` with the timeout and false fallback. */
export const modelPricingAdminViewerQuery = (queryClient: QueryClient) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "section", "pricing-admin-viewer"] as const,
		queryFn: () =>
			withOptionalTimeout(
				queryClient.fetchQuery(catalogueInternalAuthStatusQuery()).then(isAdminViewerStatus),
				false,
				"admin viewer check",
				LOG_PREFIX,
			),
	});

/** `fetchWorkspacePrivacySettings()` with the timeout and null fallback. */
export const modelPricingWorkspacePrivacySettingsQuery = (queryClient: QueryClient) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "section", "pricing-workspace-privacy-settings"] as const,
		queryFn: () =>
			withOptionalTimeout<WorkspacePrivacySettings | null>(
				queryClient.fetchQuery(catalogueWorkspacePrivacySettingsQuery()),
				null,
				"workspace privacy settings",
				LOG_PREFIX,
			),
	});

export const modelPricingRuntimeStatsQuery = (args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
}) =>
	queryOptions({
		queryKey: [
			...catalogueModelRoot,
			"section",
			"pricing-runtime-stats",
			args.modelId,
			stableList(args.providerIds),
			stableList(args.modelAliases),
		] as const,
		queryFn: () =>
			withOptionalTimeout<ProviderRuntimeStatsMap>(
				fetchFrontendModelProviderRuntimeStats(args),
				{},
				"provider runtime stats",
				LOG_PREFIX,
			),
	});

export const modelPricingRoutingHealthQuery = (args: {
	modelId: string;
	providerIds: string[];
	windowHours: number;
}) =>
	queryOptions({
		queryKey: [
			...catalogueModelRoot,
			"section",
			"pricing-routing-health",
			args.modelId,
			stableList(args.providerIds),
			args.windowHours,
		] as const,
		queryFn: () =>
			withOptionalTimeout<ProviderRoutingStatusMap>(
				fetchFrontendModelProviderRoutingHealth(args),
				{},
				"provider routing health",
				LOG_PREFIX,
			),
	});
