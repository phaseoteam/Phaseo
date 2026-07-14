import type { Metadata } from "next";
import { Suspense } from "react";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Providers",
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
		(await fetchFrontendAPIProviders()) as APIProviderCard[];

	return <APIProvidersDisplay providers={apiProviders} />;
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

