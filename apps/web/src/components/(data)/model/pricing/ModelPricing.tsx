import React from "react";
import { CircleAlert } from "lucide-react";
import {
	fetchFrontendModelHeader,
	fetchFrontendModelProviderRoutingHealth,
	fetchFrontendModelProviderRuntimeStats,
	fetchFrontendModelPricing,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import { fetchWorkspacePrivacySettings } from "@/lib/fetchers/internal/fetchWorkspacePrivacySettings";
import type { WorkspacePrivacySettings } from "@/lib/fetchers/internal/settingsTypes";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

const OPTIONAL_PROVIDER_TELEMETRY_TIMEOUT_MS = 2_500;

function withOptionalTimeout<T>(
	promise: Promise<T>,
	fallback: T,
	label: string
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<T>((resolve) => {
		timeout = setTimeout(() => {
			console.warn(`[ModelPricing] ${label} timed out; using fallback.`);
			resolve(fallback);
		}, OPTIONAL_PROVIDER_TELEMETRY_TIMEOUT_MS);
	});

	return Promise.race([promise, timeoutPromise])
		.catch((error) => {
			console.warn(`[ModelPricing] ${label} failed; using fallback.`, error);
			return fallback;
		})
		.finally(() => {
			if (timeout) clearTimeout(timeout);
		});
}

export default async function ModelPricing({
	modelId,
	includeHidden,
	showHeader = true,
	modelStatus,
	modelName,
	creatorOrganisationId,
}: {
	modelId: string;
	includeHidden: boolean;
	showHeader?: boolean;
	modelStatus?: string | null;
	modelName?: string | null;
	creatorOrganisationId?: string | null;
}) {
	const includeInternalProviders = await withOptionalTimeout(
		isAdminViewer(),
		false,
		"admin viewer check"
	);
	const [providers, identity] = await Promise.all([
		includeInternalProviders
			? getModelPricingCached(modelId, includeHidden)
			: fetchFrontendModelPricing(modelId),
		modelStatus !== undefined
			? Promise.resolve({ status: modelStatus, name: modelName ?? null, organisationId: creatorOrganisationId ?? null })
			: fetchFrontendModelHeader(modelId, includeHidden).then((header) => ({ status: header?.status ?? null, name: header?.name ?? null, organisationId: header?.organisation_id ?? null })),
	]);
	const workspacePrivacySettings: WorkspacePrivacySettings | null =
		await withOptionalTimeout(
			fetchWorkspacePrivacySettings(),
			null,
			"workspace privacy settings"
		);

	// Show providers with model mappings even when pricing rules are missing.
	const providersForDisplay = (providers || []).filter(
		(p) => Array.isArray(p.provider_models) && p.provider_models.length > 0
	);
	const now = new Date();
	const hasActiveApiProviders = providersForDisplay.some((provider) =>
		provider.provider_models.some((providerModel) => {
			if (!providerModel.is_active_gateway) return false;
			if (providerModel.capability_status === "disabled") return false;
			if (!providerModel.endpoint || providerModel.endpoint === "unmapped") return false;
			const from = providerModel.effective_from
				? new Date(providerModel.effective_from)
				: null;
			const to = providerModel.effective_to
				? new Date(providerModel.effective_to)
				: null;
			if (from && Number.isFinite(from.getTime()) && now < from) return false;
			if (to && Number.isFinite(to.getTime()) && now >= to) return false;
			return true;
		})
	);
	const showPendingApiBanner =
		identity.status === "Available" && !hasActiveApiProviders;

	const [runtimeStats, routingHealth] = await Promise.all([
		withOptionalTimeout(
			fetchFrontendModelProviderRuntimeStats({
				modelId,
				providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
				modelAliases: providersForDisplay.flatMap((p) =>
					p.provider_models.flatMap((pm) => [
						pm.model_id,
						pm.provider_model_slug ?? "",
					])
				),
			}),
			{},
			"provider runtime stats"
		),
		withOptionalTimeout(
			fetchFrontendModelProviderRoutingHealth({
				modelId,
				providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
				windowHours: 24,
			}),
			{},
			"provider routing health"
		),
	]);

	// console.log(
	// 	"Providers with rules:",
	// 	providersWithRules.map((p) => ({
	// 		name: p.provider.api_provider_name,
	// 		plans: p.pricing_rules.map((r) => r.pricing_plan || "standard"),
	// 	}))
	// );

	if (!providersForDisplay.length) {
		return (
			<div className="space-y-4">
				{showHeader ? (
					<h2 className="text-2xl font-semibold tracking-tight text-foreground">
						Providers
					</h2>
				) : null}
				{showPendingApiBanner ? (
					<div>
						<ModelPendingApiReleaseBanner
							modelName={identity.name ?? "This model"}
							surface="providers"
						/>
					</div>
				) : null}
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleAlert className="size-4" />
						</EmptyMedia>
						<EmptyTitle>No pricing data available yet</EmptyTitle>
						<EmptyDescription>
							No API provider pricing or availability is available for this model yet.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<EmptyDescription>
							If you know providers we can integrate, please tell us on
							Discord or open an issue on GitHub so we can add pricing
							data.
							<a
								className="ml-1 text-primary underline"
								href="https://github.com/phaseoteam/Phaseo/issues"
								target="_blank"
								rel="noopener noreferrer"
							>
								Open an issue
							</a>
						</EmptyDescription>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{showPendingApiBanner ? (
				<ModelPendingApiReleaseBanner
					modelName={identity.name ?? "This model"}
					surface="providers"
				/>
			) : null}
			<ModelPricingClient
				modelId={modelId}
				providers={providersForDisplay}
				creatorOrgId={identity.organisationId}
				runtimeStats={runtimeStats}
				routingHealth={routingHealth}
				workspacePrivacySettings={workspacePrivacySettings}
				showHeader={showHeader}
			/>
		</div>
	);
}
