import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";
import PricingCalculator from "@/components/(tools)/PricingCalculator";
import {
	pricingCalculatorCatalogueQuery,
	pricingCalculatorGatewayModelsQuery,
	pricingCalculatorPricingModelsQuery,
} from "./page.queries";
import { loadPricingCalculatorSearchParams } from "./search-params";
import { sanitizeModelSelections } from "@/components/(tools)/pricing-calculator/calculatorState";

export async function getPricingCalculatorMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = params.locale as PublicLocale;
	const t = await getTranslations({ locale, namespace: "Product.tools.pricing" });
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/pricing-calculator",
	});
}

export function PricingCalculatorPage() {
	return (
		<Suspense fallback={<PricingCalculator initialModels={[]} totalModelsCount={0} providersCount={0} />}>
			<PricingCalculatorPageContent />
		</Suspense>
	);
}

function PricingCalculatorPageContent() {
	const search = useSearch({ from: "/{-$locale}/_dashboard/tools/pricing-calculator/" }) as Record<string, string | string[] | undefined>;
	const [{ data: catalogueResult }, { data: cachedModelsResult }] = useSuspenseQueries({
		queries: [pricingCalculatorCatalogueQuery(), pricingCalculatorGatewayModelsQuery()],
	});
	const tCountry = useTranslations("Catalogue.countryDetail");
	const parsedParams =
		loadPricingCalculatorSearchParams(search);
	const selectedModelIds = sanitizeModelSelections(parsedParams.selections).map(
		(selection) => selection.modelId,
	);
	if (selectedModelIds.length === 0) {
		selectedModelIds.push(...parsedParams.models);
	}
	if (selectedModelIds.length === 0 && parsedParams.model) {
		selectedModelIds.push(parsedParams.model);
	}
	const { data: pricingModels } = useSuspenseQuery(pricingCalculatorPricingModelsQuery(selectedModelIds));
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
