import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import ProviderTokenUsageChart from "@/components/(data)/api-providers/Gateway/ProviderTokenUsageChart";
import PerformanceCards from "@/components/(data)/api-providers/Gateway/PerformanceCards";
import {
	fetchFrontendAPIProviderHeader,
	fetchFrontendAPIProviderModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ProviderModelsClient from "./models/ProviderModelsClient";
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { PublicLocale } from "@/i18n/routing";

// Provider metadata comes from an uncached API request. Allow this route to
// resolve it as a blocking render instead of treating it as static.
export const instant = false;

async function fetchProviderMeta(apiProviderId: string) {
	try {
		return await fetchFrontendAPIProviderHeader(apiProviderId);
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("[seo] failed to load api provider metadata", {
			apiProviderId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ apiProvider: string }>;
}): Promise<Metadata> {
	const { apiProvider } = await props.params;
	const locale = await getLocale();
	const header = await fetchProviderMeta(apiProvider);
	if (!header) notFound();
	const imagePath = `/og/api-providers/${apiProvider}`;
	const t = await getTranslations({
		locale,
		namespace: "Catalogue.providers",
	});
	const providerName = header.api_provider_name ?? t("unknown");
	const description = `${providerName} — ${t("performanceDescription")}`;

	return buildLocalizedPageMetadata({
		locale: locale as PublicLocale,
		title: `${providerName} API`,
		description,
		pathname: `/api-providers/${apiProvider}`,
		keywords: [
			providerName,
			`${providerName} API`,
			`${providerName} performance`,
			"AI API provider",
			"API latency metrics",
			"gateway analytics",
			"Phaseo",
		],
		imagePath,
		imageAlt: `${providerName} — ${t("performance")}`,
		openGraph: {
			type: "website",
		},
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const resolved = await params;
	const apiProvider = resolved.apiProvider;
	const header = await fetchProviderMeta(apiProvider);
	if (!header) notFound();
	const models = await fetchFrontendAPIProviderModels(apiProvider);
	const t = await getTranslations("Catalogue.providers");
	const tNav = await getTranslations("Common.nav");

	// Generate structured data for the provider page.
	const generateStructuredData = () => {
		if (!header) return null;

		const providerName = header.api_provider_name || t("unknown");

		// Organization Schema
		const organizationSchema = {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": providerName,
			"description": `${providerName} — ${t("performanceDescription")}`,
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": tNav("home"),
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": tNav("providers"),
					"item": absoluteUrl("/api-providers"),
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": providerName,
					"item": absoluteUrl(`/api-providers/${apiProvider}`),
				},
			],
		};

		return { organizationSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	return (
		<>
			{structuredData && (
				<>
					<JsonLdScript id="provider-org-schema" data={structuredData.organizationSchema} />
					<JsonLdScript id="provider-breadcrumb-schema" data={structuredData.breadcrumbSchema} />
				</>
			)}
			<APIProviderDetailShell apiProviderId={apiProvider} tocItems={[{ id: "performance", label: t("performance") }, { id: "token-usage", label: t("tokenUsage") }, { id: "top-models", label: t("topModels") }, { id: "top-apps", label: t("topApps") }, { id: "models", label: t("models") }]}>
				<div className="flex flex-col gap-10 w-full">
					<section id="performance" className="scroll-mt-36 space-y-4">
						<div className="space-y-1">
							<h2 className="text-xl font-semibold tracking-tight">{t("performance")}</h2>
							<p className="text-sm text-muted-foreground">{t("performanceDescription")}</p>
						</div>
						<PerformanceCards params={params} />
					</section>

					<ProviderTokenUsageChart apiProviderId={apiProvider} />

					<section id="models" className="scroll-mt-36 space-y-4 border-t border-border pt-10">
						<div className="space-y-1">
							<h2 className="text-xl font-semibold">{t("models")}</h2>
							<p className="text-sm text-muted-foreground">
								{t("browseModels", { name: header.api_provider_name })}
							</p>
						</div>
						<ProviderModelsClient
							apiProvider={apiProvider}
							providerLabel={header.api_provider_name}
							models={models}
						/>
					</section>
				</div>
			</APIProviderDetailShell>
		</>
	);
}
