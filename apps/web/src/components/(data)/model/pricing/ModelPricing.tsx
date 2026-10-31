import React from "react";
import Link from "@/components/link";
import { CircleAlert, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient, useSuspenseQueries, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import {
	modelHeaderQuery,
	modelPricingQuery,
	modelPricingRenderTimeQuery,
	modelQuickstartGatewayMetadataQuery,
} from "@/components/(data)/model/modelData.queries";
import {
	modelPricingAdminViewerQuery,
	modelPricingRoutingHealthQuery,
	modelPricingRuntimeStatsQuery,
	modelPricingWorkspacePrivacySettingsQuery,
} from "./ModelPricing.queries";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ModelOverviewHeader } from "@/lib/fetchers/models/getModelOverviewHeader";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import { toPricingRuntimeStats } from "./pricingRuntimeStats";
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import type { WorkspacePrivacySettings } from "@/lib/fetchers/internal/settingsTypes";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { useTranslations } from "@/i18n/react";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

// Conditional query tuples; each result is read with its own cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuspenseQueryList = UseSuspenseQueryOptions<any, Error, any, any>[];

function mergePreviewOffers(
	providers: ProviderPricing[],
	previews: AuthenticatedProviderCatalogPreview[],
): ProviderPricing[] {
	if (!previews.length) return providers;

	const byProvider = new Map(
		providers.map((provider) => [provider.provider.api_provider_id, provider]),
	);
	for (const preview of previews) {
		const providerId = preview.provider_slug.trim();
		if (!providerId) continue;
		const isRetired = ["deprecated", "retired", "removed", "shutdown"].includes(String(preview.availability_reason ?? "").trim().toLowerCase());
		const providerModel: ProviderPricing["provider_models"][number] = {
			id: `provider-preview:${providerId}:${preview.provider_model_slug}`,
			api_provider_id: providerId,
			provider_model_slug: preview.provider_model_slug,
			model_id: preview.canonical_model_slug?.trim() || preview.model_id,
			endpoint: preview.endpoints?.[0] || "unmapped",
			is_active_gateway: false,
			is_unreleased: true,
			provider_availability_status: isRetired ? "deprecated" : "coming_soon",
			phaseo_status: isRetired ? "disabled" : "planned",
			access_scope: "internal",
			routing_status: "preview",
			capability_status: isRetired ? "disabled" : "planned",
			input_modalities: (preview.input_modalities ?? []).join(","),
			output_modalities: (preview.output_modalities ?? []).join(","),
			context_length: preview.context_length ?? null,
			max_input_tokens: preview.context_length ?? null,
			max_output_tokens: preview.max_output_tokens ?? null,
			effective_from: preview.available_from ?? null,
			effective_to: preview.shutdown_at ?? null,
			created_at: preview.created_at ?? undefined,
			params: Object.fromEntries((preview.supported_params ?? []).map((parameter) => [parameter, true])),
		};
		const pricingRules = (preview.pricing ?? []).map((price, index) => ({
			id: `provider-preview:${providerId}:${preview.provider_model_slug}:${index}`,
			model_key: `${providerId}:${preview.api_model_id}:${price.meterKey}`,
			provider_id: providerId,
			api_model_id: preview.api_model_id,
			capability_id: price.modality || preview.endpoints?.[0] || "unmapped",
			pricing_plan: "standard",
			meter: price.meterKey,
			unit: price.unit,
			unit_size: price.unitQuantity,
			price_per_unit: price.priceNanos / 1_000_000_000,
			currency: "USD",
			note: null,
			priority: 100,
			effective_from: preview.created_at ?? new Date(0).toISOString(),
			effective_to: null,
			match: [],
		}));
		const incoming: ProviderPricing = {
			provider: {
				api_provider_id: providerId,
				api_provider_name: preview.provider_name,
				status: "active",
			},
			provider_models: [providerModel],
			pricing_rules: pricingRules,
		};
		const existing = byProvider.get(providerId);
		byProvider.set(providerId, existing
			? {
					...existing,
					provider_models: [
						...existing.provider_models,
						...incoming.provider_models.filter(
							(model) => !existing.provider_models.some((candidate) => candidate.id === model.id),
						),
					],
					pricing_rules: [...existing.pricing_rules, ...incoming.pricing_rules],
				}
			: incoming);
	}
	return [...byProvider.values()];
}

type AnySuspenseQuery = UseSuspenseQueryOptions<any, Error, any, any>;

export default function ModelPricing({
	modelId,
	includeHidden,
	showHeader = true,
	headerDescription,
	modelStatus,
	modelName,
	creatorOrganisationId,
	creatorOrganisationName,
	providersOverride,
	previewOffers = [],
}: {
	modelId: string;
	includeHidden: boolean;
	showHeader?: boolean;
	headerDescription?: string | null;
	modelStatus?: string | null;
	modelName?: string | null;
	creatorOrganisationId?: string | null;
	creatorOrganisationName?: string | null;
	providersOverride?: ProviderPricing[];
	previewOffers?: AuthenticatedProviderCatalogPreview[];
}) {
	const tProvider = useTranslations("Catalogue.modelDetail.providerTable");
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const tModel = useTranslations("Catalogue.models.detail");
	const tActions = useTranslations("Common.ui.actions");
	const queryClient = useQueryClient();
	// One hook call loads every first-stage query in parallel; props that
	// already carry the data skip the matching fetch.
	const firstStageQueries: AnySuspenseQuery[] = [
		modelPricingAdminViewerQuery(queryClient),
		modelQuickstartGatewayMetadataQuery(modelId),
		modelPricingWorkspacePrivacySettingsQuery(queryClient),
		modelPricingRenderTimeQuery(modelId),
	];
	if (!providersOverride) firstStageQueries.push(modelPricingQuery(modelId, includeHidden));
	if (modelStatus === undefined) firstStageQueries.push(modelHeaderQuery(modelId, includeHidden));
	const firstStage = useSuspenseQueries({ queries: firstStageQueries });
	const showAdminPricingControls = firstStage[0].data as boolean;
	const gatewayMetadata = firstStage[1].data as ModelGatewayMetadata | null;
	const workspacePrivacySettings = firstStage[2].data as WorkspacePrivacySettings | null;
	const pricingTimeMs = firstStage[3].data as number;
	const providers = providersOverride ?? (firstStage[4].data as ProviderPricing[]);
	const header = modelStatus === undefined
		? (firstStage[providersOverride ? 4 : 5].data as ModelOverviewHeader | null)
		: null;
	const identity = modelStatus !== undefined
		? {
				status: modelStatus,
				name: modelName ?? null,
				organisationId: creatorOrganisationId ?? null,
				organisationName: creatorOrganisationName ?? null,
			}
		: {
				status: header?.status ?? null,
				name: header?.name ?? null,
				organisationId: header?.organisation_id ?? null,
				organisationName: header?.organisation?.name ?? null,
			};
	const providersWithPreviews = mergePreviewOffers(providers || [], previewOffers);
	const credentialModesByProvider = new Map<string, Array<"managed_and_byok" | "byok_only">>();
	for (const provider of gatewayMetadata?.activeProviders ?? []) {
		const modes = credentialModesByProvider.get(provider.api_provider_id) ?? [];
		modes.push(provider.credential_mode === "byok_only" ? "byok_only" : "managed_and_byok");
		credentialModesByProvider.set(provider.api_provider_id, modes);
	}
	const credentialModeByProvider = new Map(
		Array.from(credentialModesByProvider, ([providerId, modes]) => [
			providerId,
			modes.every((mode) => mode === "byok_only") ? "byok_only" : "managed_and_byok",
		] as const),
	);
	const providersWithCredentialModes = providersWithPreviews.map((provider) => ({
		...provider,
		provider: {
			...provider.provider,
			credential_mode:
				credentialModeByProvider.get(provider.provider.api_provider_id) ??
				provider.provider.credential_mode ??
				"managed_and_byok",
		},
	}));

	// Show providers with model mappings even when pricing rules are missing.
	const providersForDisplay = providersWithCredentialModes.filter(
		(p) => Array.isArray(p.provider_models) && p.provider_models.length > 0
	);
	// Request time captured once and shared with hydration (see modelPricingRenderTimeQuery).
	const now = new Date(pricingTimeMs);
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

	const telemetry = useSuspenseQueries({
		queries: (providersOverride ? [] : [
			modelPricingRuntimeStatsQuery({
				modelId,
				providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
				modelAliases: providersForDisplay.flatMap((p) =>
					p.provider_models.flatMap((pm) => [
						pm.model_id,
						pm.provider_model_slug ?? "",
					])
				),
			}),
			modelPricingRoutingHealthQuery({
				modelId,
				providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
				windowHours: 24,
			}),
		]) as SuspenseQueryList,
	});
	const [runtimeStats, routingHealth]: [ProviderRuntimeStatsMap, ProviderRoutingStatusMap] = providersOverride
		? [{}, {}]
		: [telemetry[0].data as ProviderRuntimeStatsMap, telemetry[1].data as ProviderRoutingStatusMap];

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
				{showAdminPricingControls ? (
					<div className="flex justify-end">
						<Button asChild size="sm" variant="outline">
							<Link href={`/internal/data/models/edit/${modelId}?tab=pricing`}>
								<Pencil className="mr-1 h-3.5 w-3.5" />
								{tActions("addPricing")}
							</Link>
						</Button>
					</div>
				) : null}
				{showHeader ? (
					<h2 className="text-2xl font-semibold tracking-tight text-foreground">
						{tProvider("heading")}
					</h2>
				) : null}
				{showPendingApiBanner ? (
					<div>
						<ModelPendingApiReleaseBanner
							modelName={identity.name ?? tModel("sections.thisModel")}
							surface="providers"
						/>
					</div>
				) : null}
				<ModelPricingClient
					modelId={modelId}
					providers={[]}
					refreshPricing={!providersOverride && !includeHidden}
					internalOnly={includeHidden}
					creatorOrgId={identity.organisationId}
					initialPricingTimeMs={now.getTime()}
					runtimeStats={toPricingRuntimeStats(runtimeStats, { includeHourlyPerformance: includeHidden })}
					routingHealth={routingHealth}
					workspacePrivacySettings={workspacePrivacySettings}
					showHeader={false}
					emptyState={<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleAlert className="size-4" />
						</EmptyMedia>
						<EmptyTitle>
							{identity.status === "Announced" && identity.organisationName
								? tPricing("organisationComingSoon", { organisation: identity.organisationName })
								: tPricing("noProviderPricing")}
						</EmptyTitle>
						<EmptyDescription>
							{identity.status === "Announced" && identity.organisationName
								? tPricing("announcedPricingDescription", { model: identity.name ?? tPricing("thisModel"), organisation: identity.organisationName })
								: tPricing("noProviderAvailability")}
						</EmptyDescription>
					</EmptyHeader>
					{identity.status === "Announced" && identity.organisationName ? null : (
						<EmptyContent>
							<EmptyDescription>
								{tPricing("suggestProvider")}
								<a
									className="ml-1 text-primary underline"
									href="https://github.com/phaseoteam/Phaseo/issues"
									target="_blank"
									rel="noopener noreferrer"
								>
									{tPricing("openIssue")}
								</a>
							</EmptyDescription>
						</EmptyContent>
					)}
				</Empty>}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{showAdminPricingControls ? (
				<div className="flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link href={`/internal/data/models/edit/${modelId}?tab=pricing`}>
							<Pencil className="mr-1 h-3.5 w-3.5" />
							{tActions("editPricing")}
						</Link>
					</Button>
				</div>
			) : null}
			{showPendingApiBanner ? (
				<ModelPendingApiReleaseBanner
					modelName={identity.name ?? tModel("sections.thisModel")}
					surface="providers"
				/>
			) : null}
			<ModelPricingClient
				modelId={modelId}
				providers={providersForDisplay}
				refreshPricing={!providersOverride && !includeHidden}
				internalOnly={includeHidden}
				creatorOrgId={identity.organisationId}
				initialPricingTimeMs={now.getTime()}
				runtimeStats={toPricingRuntimeStats(runtimeStats, { includeHourlyPerformance: includeHidden })}
				routingHealth={routingHealth}
				workspacePrivacySettings={workspacePrivacySettings}
				showHeader={showHeader}
				headerDescription={headerDescription}
			/>
		</div>
	);
}
