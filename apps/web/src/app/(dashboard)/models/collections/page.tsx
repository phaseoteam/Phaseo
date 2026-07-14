import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchFrontendModelCollections } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import CollectionsDisplay from "@/components/(data)/models/Collections/CollectionsDisplay";

export const metadata: Metadata = {
	title: "Model collections - Curated groups by capability",
	description:
		"Explore curated AI model collections by use case, from free tiers to top benchmark performers, with quick links for evaluation and selection.",
	alternates: {
		canonical: "/models/collections",
	},
};

function CollectionSkeleton() {
	return (
		<div className="flex min-h-screen flex-col">
			<div className="border-b border-border/70 px-4 py-2.5 lg:px-8">
				<div className="h-8 w-40 rounded bg-muted animate-pulse" />
				<div className="mt-2 h-8 w-full max-w-[460px] rounded bg-muted animate-pulse" />
			</div>
			<div className="px-4 pt-2 pb-5 lg:px-8 lg:pb-6">
				<div className="space-y-px bg-border/70">
					{Array.from({ length: 5 }).map((_, index) => (
						<div
							key={index}
							className="h-28 bg-muted animate-pulse"
						/>
					))}
				</div>
			</div>
		</div>
	);
}

async function CollectionsPageContent() {
	const collections = await fetchFrontendModelCollections(10);
	return <CollectionsDisplay collections={collections} />;
}

export default function CollectionsPage() {
	return (
		<main className="flex min-h-screen flex-col">
			<Suspense fallback={<CollectionSkeleton />}>
				<CollectionsPageContent />
			</Suspense>
		</main>
	);
}
