import type { Metadata } from "next";
import { Suspense } from "react";
import OrganisationsDisplay from "@/components/(data)/organisations/OrganisationDisplay";
import {
	getAllOrganisationsCached,
	OrganisationCard,
} from "@/lib/fetchers/organisations/getAllOrganisations";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
	title: "AI Organisations - Compare Organisations and their AI Models",
	description:
		"Explore a comprehensive directory of AI organisations. Compare providers by their models, features, benchmarks, and pricing, and find the best fit for your use case with AI Stats.",
	keywords: [
		"AI providers",
		"AI companies",
		"AI models",
		"machine learning providers",
		"AI benchmarks",
		"AI pricing",
		"AI directory",
		"compare AI providers",
		"AI Stats",
	],
	alternates: {
		canonical: "/organisations",
	},
};

async function OrganisationsSection() {
	const organisations =
		(await getAllOrganisationsCached()) as OrganisationCard[];
	return <OrganisationsDisplay organisations={organisations} />;
}

function OrganisationsFallback() {
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
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<OrganisationsFallback />}>
					<OrganisationsSection />
				</Suspense>
			</div>
		</main>
	);
}
