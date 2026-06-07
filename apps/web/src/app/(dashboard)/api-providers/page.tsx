import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import Script from "next/script";

export const metadata: Metadata = buildMetadata({
	title: "AI API Providers: Pricing, Models & Performance",
	description:
		"Compare AI API providers by pricing, model coverage, latency signals, BYOK support and gateway capabilities.",
	path: "/api-providers",
	keywords: [
		"AI API providers",
		"AI provider pricing",
		"LLM API providers",
		"BYOK AI providers",
		"AI gateway providers",
	],
});

async function APIProvidersSection() {
	const apiProviders =
		(await getAllAPIProvidersCached()) as APIProviderCard[];
	const topByModels = [...apiProviders]
		.sort((a, b) => b.total_models - a.total_models)
		.slice(0, 6)
		.map((provider) => provider.api_provider_name);
	const totalModels = apiProviders.reduce(
		(sum, provider) => sum + Math.max(0, Number(provider.total_models ?? 0)),
		0,
	);
	const totalFreeModels = apiProviders.reduce(
		(sum, provider) => sum + Math.max(0, Number(provider.free_models ?? 0)),
		0,
	);
	const dataCatalogSchema = {
		"@context": "https://schema.org",
		"@type": "DataCatalog",
		name: "AI Stats API Provider Database",
		description:
			"Compare AI API providers by model coverage, modality support, gateway usage signals, and free model availability.",
		url: absoluteUrl("/api-providers"),
		keywords: [
			"AI API providers",
			"LLM providers",
			"provider coverage",
			"free models",
			"gateway providers",
		],
		includesObject: topByModels.map((name) => ({
			"@type": "Dataset",
			name,
		})),
	};
	const breadcrumbSchema = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: "Home",
				item: absoluteUrl("/"),
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "API Providers",
				item: absoluteUrl("/api-providers"),
			},
		],
	};

	return (
		<>
			<Script
				id="api-providers-data-catalog-schema"
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(dataCatalogSchema) }}
			/>
			<Script
				id="api-providers-breadcrumb-schema"
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
			/>
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">
					Compare AI API providers by model coverage, usage, and modality support
				</h1>
				<p className="max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base">
					AI Stats tracks {apiProviders.length.toLocaleString()} API providers with{" "}
					{totalModels.toLocaleString()} listed provider-model combinations and{" "}
					{totalFreeModels.toLocaleString()} free-model entries. Use this index to
					compare provider breadth, gateway usage, and modality support before you
					choose where to route traffic.
				</p>
				{topByModels.length > 0 ? (
					<p className="max-w-4xl text-sm leading-6 text-muted-foreground">
						High-coverage providers in the current index include{" "}
						{topByModels.join(", ")}.
					</p>
				) : null}
			</div>
			<APIProvidersDisplay providers={apiProviders} showPrimaryHeader={false} />
		</>
	);
}

function APIProvidersFallback() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-56" />
			<Skeleton className="h-11 w-full" />
			<div className="overflow-hidden rounded-xl border border-border/70">
				{Array.from({ length: 8 }).map((_, index) => (
					<Skeleton key={index} className="h-20 w-full rounded-none border-b last:border-b-0" />
				))}
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8 space-y-8">
				<Suspense fallback={<APIProvidersFallback />}>
					<APIProvidersSection />
				</Suspense>
			</div>
		</main>
	);
}

