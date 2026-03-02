import type { Metadata } from "next";
import { Suspense } from "react";
import {
	APIProviderCard,
	getAllAPIProvidersCached,
} from "@/lib/fetchers/api-providers/getAllAPIProviders";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
	title: "AI API providers - Compare Pricing & Capabilities",
	description:
		"Explore a comprehensive directory of AI API providers. Compare pricing, supported models, and capabilities across leading providers to find the best fit for your use case with AI Stats.",
	keywords: [
		"AI API providers",
		"AI API pricing",
		"LLM API",
		"token pricing",
		"AI model pricing",
		"compare AI providers",
		"AI gateway",
		"AI Stats",
	],
	alternates: {
		canonical: "/api-providers",
	},
};

async function APIProvidersSection() {
	const apiProviders =
		(await getAllAPIProvidersCached()) as APIProviderCard[];

	return <APIProvidersDisplay providers={apiProviders} />;
}

function APIProvidersFallback() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-56" />
			<Skeleton className="h-11 w-full" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<Skeleton key={index} className="h-40 w-full rounded-xl" />
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
