import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import RoadmapComingSoon from "@/components/(data)/RoadmapComingSoon";
import {
	APIProviderCard,
	getAllAPIProvidersCached,
} from "@/lib/fetchers/api-providers/getAllAPIProviders";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";

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

export default async function Page() {
	"use cache";
	cacheLife({
		stale: 60 * 60 * 24 * 7,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 365,
	});

	const apiProviders =
		(await getAllAPIProvidersCached()) as APIProviderCard[];

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<APIProvidersDisplay providers={apiProviders} />
			</div>
		</main>
	);
}
