import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import ProviderTokenUsageChart from "@/components/(data)/api-providers/Gateway/ProviderTokenUsageChart";
import PerformanceCards from "@/components/(data)/api-providers/Gateway/PerformanceCards";
import { Suspense } from "react";
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
import { connection } from "next/server";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { toAccountQueryScope, type AccountQueryScope } from "@/lib/query/queryKeys";
import type { APIProviderHeader } from "@/lib/fetchers/api-providers/types";

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
	const [header, privatePreviews] = await Promise.all([
		fetchProviderMeta(apiProvider),
		fetchServerProviderCatalogPreviews(apiProvider),
	]);
	if (!header && !privatePreviews.length) notFound();
	const imagePath = `/og/api-providers/${apiProvider}`;
	const t = await getTranslations({
		locale,
		namespace: "Catalogue.providers",
	});
	const providerName = header?.api_provider_name ?? privatePreviews[0]?.provider_name ?? t("unknown");
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
		robots: !header ? { index: false, follow: false } : undefined,
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
	const [publicHeader, initialProviderPreviews, accountContext] = await Promise.all([
		fetchProviderMeta(apiProvider),
		fetchServerProviderCatalogPreviews(apiProvider),
		getServerAccountContext(),
	]);
	const accountQueryScope = toAccountQueryScope(accountContext);
	const header: APIProviderHeader | null = publicHeader ?? (initialProviderPreviews[0]
		? {
			api_provider_id: apiProvider,
			api_provider_name: initialProviderPreviews[0].provider_name,
			country_code: "",
			subdivision_code: null,
		}
		: null);
	if (!header) notFound();
	const t = await getTranslations("Catalogue.providers");
	const tNav = await getTranslations("Common.nav");
	const models = await fetchFrontendAPIProviderModels(apiProvider).catch(() => []);
	const isPreviewOnlyProvider = !publicHeader && initialProviderPreviews.length > 0 && models.length === 0;
	const providerTocItems = isPreviewOnlyProvider
		? [{ id: "models", label: t("models") }]
		: [{ id: "performance", label: t("performance") }, { id: "token-usage", label: t("tokenUsage") }, { id: "top-models", label: t("topModels") }, { id: "top-apps", label: t("topApps") }, { id: "models", label: t("models") }];

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
			<APIProviderDetailShell apiProviderId={apiProvider} prefetchedHeader={header} tocItems={providerTocItems}>
				<div className="flex flex-col gap-10 w-full">
					{isPreviewOnlyProvider ? (
						<section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-50">
							<h2 className="text-xl font-semibold tracking-tight">{t("internalPreview")}</h2>
							<p className="mt-1 text-sm text-cyan-900/90 dark:text-cyan-100/90">{t("internalPreviewDescription")}</p>
						</section>
					) : (
						<>
							<section id="performance" className="scroll-mt-36 space-y-4">
								<div className="space-y-1">
									<h2 className="text-xl font-semibold tracking-tight">{t("performance")}</h2>
									<p className="text-sm text-muted-foreground">{t("performanceDescription")}</p>
								</div>
								<PerformanceCards params={params} />
							</section>
							<ProviderTokenUsageChart apiProviderId={apiProvider} />
						</>
					)}

					<section id="models" className="scroll-mt-36 space-y-4 border-t border-border pt-10">
						<div className="space-y-1">
							<h2 className="text-xl font-semibold">{t("models")}</h2>
							<p className="text-sm text-muted-foreground">
								{t("browseModels", { name: header.api_provider_name })}
							</p>
						</div>
						<Suspense fallback={<div className="rounded-xl border p-8 text-sm text-muted-foreground">{t("loadingModels")}</div>}>
							<ProviderModelsWithPreview
								apiProvider={apiProvider}
								providerLabel={header.api_provider_name}
								models={models}
								initialProviderPreviews={initialProviderPreviews}
								accountQueryScope={accountQueryScope}
							/>
						</Suspense>
					</section>
				</div>
			</APIProviderDetailShell>
		</>
	);
}

async function ProviderModelsWithPreview({
	apiProvider,
	providerLabel,
	models,
	initialProviderPreviews,
	accountQueryScope,
}: {
	apiProvider: string;
	providerLabel: string;
	models: Awaited<ReturnType<typeof fetchFrontendAPIProviderModels>>;
	initialProviderPreviews: Awaited<ReturnType<typeof fetchServerProviderCatalogPreviews>>;
	accountQueryScope: AccountQueryScope;
}) {
	await connection();
	return (
		<ProviderModelsClient
			apiProvider={apiProvider}
			providerLabel={providerLabel}
			models={models}
			initialProviderPreviews={initialProviderPreviews}
			accountQueryScope={accountQueryScope}
		/>
	);
}
