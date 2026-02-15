import type { Metadata } from "next";
import OrganisationsDisplay from "@/components/(data)/organisations/OrganisationDisplay";
import {
	getAllOrganisationsCached,
	OrganisationCard,
} from "@/lib/fetchers/organisations/getAllOrganisations";

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

export default async function Page() {
	const organisations =
		(await getAllOrganisationsCached()) as OrganisationCard[];

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<OrganisationsDisplay organisations={organisations} />
			</div>
		</main>
	);
}
