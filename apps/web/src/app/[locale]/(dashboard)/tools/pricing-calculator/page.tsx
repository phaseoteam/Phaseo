import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";
import PricingCalculator from "@/components/(tools)/PricingCalculator";
import { fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendPricingModels } from "@/lib/fetchers/frontend/fetchFrontendPricingModels";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import { loadPricingCalculatorSearchParams } from "./search-params";
import { sanitizeModelSelections } from "@/components/(tools)/pricing-calculator/calculatorState";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Product.tools.pricing" });
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/pricing-calculator",
	});
}

export default async function PricingCalculatorPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<PricingCalculator initialModels={[]} totalModelsCount={0} providersCount={0} />}>
			<PricingCalculatorPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function PricingCalculatorPageContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [catalogueResult, cachedModelsResult, resolvedSearchParams] = await Promise.all([
		fetchFrontendModels().catch(() => []),
		fetchFrontendGatewayModels().catch(() => []),
		searchParams,
	]);
	const tCountry = await getTranslations("Catalogue.countryDetail");
	const parsedParams =
		loadPricingCalculatorSearchParams(resolvedSearchParams);
	const selectedModelIds = sanitizeModelSelections(parsedParams.selections).map(
		(selection) => selection.modelId,
	);
	if (selectedModelIds.length === 0) {
		selectedModelIds.push(...parsedParams.models);
	}
	if (selectedModelIds.length === 0 && parsedParams.model) {
		selectedModelIds.push(parsedParams.model);
	}
	const pricingModels: PricingModel[] = selectedModelIds.length > 0
		? await fetchFrontendPricingModels(selectedModelIds).catch(() => [])
		: [];
	const catalogModels = catalogueResult.map((model) => ({
		modelId: model.model_id,
		displayName: model.name || model.model_id,
		organisationId: model.organisation_id || model.model_id.split("/")[0] || "unknown",
		organisationName:
			model.organisation_name ||
			model.organisation_id ||
			tCountry("unknownOrganisation"),
		releaseDate: model.release_date,
		announcementDate: model.announcement_date,
	}));
	const cachedModels = cachedModelsResult;

	const providers = Array.from(new Set(cachedModels.map((model) => model.providerId))).sort();

	return (
		<PricingCalculator
			initialModels={pricingModels}
			catalogModels={catalogModels}
			cachedModels={cachedModels}
			initialModel={parsedParams.model || undefined}
			initialEndpoint={parsedParams.endpoint || undefined}
			initialProvider={parsedParams.provider || undefined}
			initialPlan={parsedParams.plan || undefined}
			initialSelectedModels={parsedParams.models}
			initialSelections={parsedParams.selections}
			initialModelConfigs={parsedParams.configs}
			initialMeterInputs={parsedParams.usage}
			initialRequestMultiplier={parsedParams.requests}
			initialPricingTimeUtc={parsedParams.time || undefined}
			totalModelsCount={catalogModels.length}
			providersCount={providers.length}
		/>
	);
}
