import React from "react";
import { CircleAlert } from "lucide-react";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getModelProviderRoutingHealthCached } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

type WorkspacePrivacySettings = {
	isAuthenticated: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
	privacyZdrOnly: boolean;
	providerRestrictionMode: "none" | "allowlist" | "blocklist";
	providerRestrictionProviderIds: string[];
};

export default async function ModelPricing({
	modelId,
	includeHidden,
	showHeader = true,
}: {
	modelId: string;
	includeHidden: boolean;
	showHeader?: boolean;
}) {
	const [providers, header, subscriptionPlans] = await Promise.all([
		getModelPricingCached(modelId, includeHidden),
		getModelOverviewHeader(modelId, includeHidden),
		getModelSubscriptionPlansCached(modelId, includeHidden).catch((error) => {
			console.warn("[pricing] failed to fetch subscription plans; continuing without plans", {
				modelId,
				error,
			});
			return [];
		}),
	]);
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const workspaceId = user?.id ? await getWorkspaceIdFromCookie() : undefined;
	let workspacePrivacySettings: WorkspacePrivacySettings | null = null;
	if (user?.id && workspaceId) {
		const { data: settingsRow, error: settingsError } = await supabase
			.from("workspace_settings")
			.select(
				"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids",
			)
			.eq("workspace_id", workspaceId)
			.maybeSingle();
		if (settingsError) {
			console.warn("[pricing] failed to load workspace privacy settings", {
				workspaceId,
				error: settingsError.message,
			});
		} else if (settingsRow) {
			const rawMode = String(settingsRow.provider_restriction_mode ?? "")
				.trim()
				.toLowerCase();
			const providerRestrictionMode =
				rawMode === "allowlist" || rawMode === "blocklist" || rawMode === "none"
					? rawMode
					: "none";
			workspacePrivacySettings = {
				isAuthenticated: true,
				privacyEnablePaidMayTrain: Boolean(
					settingsRow.privacy_enable_paid_may_train ?? true,
				),
				privacyEnableFreeMayTrain: Boolean(
					settingsRow.privacy_enable_free_may_train ?? true,
				),
				privacyZdrOnly: Boolean(settingsRow.privacy_zdr_only ?? false),
				providerRestrictionMode,
				providerRestrictionProviderIds: Array.isArray(
					settingsRow.provider_restriction_provider_ids,
				)
					? settingsRow.provider_restriction_provider_ids
							.map((value: unknown) => String(value ?? "").trim())
							.filter(Boolean)
					: [],
			};
		}
	}

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
		header?.status === "Available" && !hasActiveApiProviders;

	const runtimeStats = await getModelProviderRuntimeStatsCached({
		modelId,
		providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
		modelAliases: providersForDisplay.flatMap((p) =>
			p.provider_models.flatMap((pm) => [
				pm.model_id,
				pm.provider_model_slug ?? "",
			])
		),
	});
	const routingHealth = await getModelProviderRoutingHealthCached({
		providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
		windowHours: 24,
	});

	// console.log(
	// 	"Providers with rules:",
	// 	providersWithRules.map((p) => ({
	// 		name: p.provider.api_provider_name,
	// 		plans: p.pricing_rules.map((r) => r.pricing_plan || "standard"),
	// 	}))
	// );

	if (!providersForDisplay.length && !subscriptionPlans.length) {
		return (
			<div className="space-y-4">
				{showHeader ? (
					<h2 className="text-2xl font-semibold tracking-tight text-foreground">
						Availability + Pricing
					</h2>
				) : null}
				{showPendingApiBanner ? (
					<div>
						<ModelPendingApiReleaseBanner
							modelName={header?.name ?? "This model"}
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
							No API pricing or subscription plan information is available
							for this model yet.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<EmptyDescription>
							If you know providers we can integrate, please tell us on
							Discord or open an issue on GitHub so we can add pricing
							data.
							<a
								className="ml-1 text-primary underline"
								href="https://github.com/AI-Stats/AI-Stats/issues"
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
					modelName={header?.name ?? "This model"}
					surface="providers"
				/>
			) : null}
			<ModelPricingClient
				providers={providersForDisplay}
				subscriptionPlans={subscriptionPlans}
				creatorOrgId={header?.organisation_id ?? null}
				runtimeStats={runtimeStats}
				routingHealth={routingHealth}
				workspacePrivacySettings={workspacePrivacySettings}
				showHeader={showHeader}
			/>
		</div>
	);
}
