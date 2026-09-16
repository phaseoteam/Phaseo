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
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
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
	const [header, privatePreviews] = await Promise.all([
		fetchProviderMeta(apiProvider),
		fetchServerProviderCatalogPreviews(apiProvider),
	]);
	if (!header && !privatePreviews.length) notFound();
	const imagePath = `/og/api-providers/${apiProvider}`;

	const providerName = header?.api_provider_name ?? privatePreviews[0]?.provider_name ?? "AI API provider";

	const description = [
		`${providerName} on Phaseo - real-world performance analytics from the Phaseo Gateway.`,
		"Review token usage trends, latency, throughput, and average generation time, plus which apps and models drive this provider's traffic.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${providerName} API`,
		description,
		path: `/api-providers/${apiProvider}`,
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
		imageAlt: `${providerName} gateway analytics on Phaseo`,
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
	const [publicHeader, initialProviderPreviews] = await Promise.all([
		fetchProviderMeta(apiProvider),
		fetchServerProviderCatalogPreviews(apiProvider),
	]);
	const header: APIProviderHeader | null = publicHeader ?? (initialProviderPreviews[0]
		? {
			api_provider_id: apiProvider,
			api_provider_name: initialProviderPreviews[0].provider_name,
			country_code: "",
			subdivision_code: null,
		}
		: null);
	if (!header) notFound();
	const models = await fetchFrontendAPIProviderModels(apiProvider).catch(() => []);
	const isPreviewOnlyProvider = initialProviderPreviews.length > 0 && models.length === 0;
	const providerTocItems = isPreviewOnlyProvider
		? [{ id: "models", label: "Models" }]
		: [{ id: "performance", label: "Performance" }, { id: "token-usage", label: "Token Usage" }, { id: "top-models", label: "Top Models" }, { id: "top-apps", label: "Top Apps" }, { id: "models", label: "Models" }];

	// Generate structured data for the provider page.
	const generateStructuredData = () => {
		if (!header) return null;

		const providerName = header.api_provider_name || "API Provider";

		// Organization Schema
		const organizationSchema = {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": providerName,
			"description": `${providerName} is an AI API provider tracked on Phaseo. View real-world performance analytics, latency metrics, throughput data, and popular models.`,
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": "Home",
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "API Providers",
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
							<h2 className="text-xl font-semibold tracking-tight">Internal provider preview</h2>
							<p className="mt-1 text-sm text-cyan-900/90 dark:text-cyan-100/90">This provider has authorized catalogue submissions but no public gateway analytics yet. Model submissions below are visible only to the provider workspace and Phaseo administrators.</p>
						</section>
					) : (
						<>
							<section id="performance" className="scroll-mt-36 space-y-4">
								<div className="space-y-1">
									<h2 className="text-xl font-semibold tracking-tight">Performance</h2>
									<p className="text-sm text-muted-foreground">Latency and throughput from recent gateway traffic, with leading models for each signal.</p>
								</div>
								<PerformanceCards params={params} />
							</section>
							<ProviderTokenUsageChart apiProviderId={apiProvider} />
						</>
					)}

					<section id="models" className="scroll-mt-36 space-y-4 border-t border-border pt-10">
						<div className="space-y-1">
							<h2 className="text-xl font-semibold">Models</h2>
							<p className="text-sm text-muted-foreground">
								Browse models available through {header.api_provider_name}.
							</p>
						</div>
						<Suspense fallback={<div className="rounded-xl border p-8 text-sm text-muted-foreground">Loading models…</div>}>
							<ProviderModelsWithPreview
								apiProvider={apiProvider}
								providerLabel={header.api_provider_name}
								models={models}
								initialProviderPreviews={initialProviderPreviews}
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
}: {
	apiProvider: string;
	providerLabel: string;
	models: Awaited<ReturnType<typeof fetchFrontendAPIProviderModels>>;
	initialProviderPreviews: Awaited<ReturnType<typeof fetchServerProviderCatalogPreviews>>;
}) {
	await connection();
	return (
		<ProviderModelsClient
			apiProvider={apiProvider}
			providerLabel={providerLabel}
			models={models}
			initialProviderPreviews={initialProviderPreviews}
		/>
	);
}
