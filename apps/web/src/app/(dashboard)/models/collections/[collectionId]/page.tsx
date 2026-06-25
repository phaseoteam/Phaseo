import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchFrontendModelCollections } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import CollectionDetailDisplay from "@/components/(data)/models/Collections/CollectionDetailDisplay";

type CollectionPageProps = {
	params: Promise<{ collectionId: string }>;
};

async function findCollection(collectionId: string, limit = 10) {
	const collections = await fetchFrontendModelCollections(limit);
	return collections.find((collection) => collection.id === collectionId) ?? null;
}

export async function generateStaticParams() {
	const collections = await fetchFrontendModelCollections(1);
	return collections.map((collection) => ({ collectionId: collection.id }));
}

export async function generateMetadata({
	params,
}: CollectionPageProps): Promise<Metadata> {
	const { collectionId } = await params;
	const collection = await findCollection(collectionId, 10);

	if (!collection) {
		return {
			title: "Collection not found",
		};
	}

	return {
		title: `${collection.title} - Model collection`,
		description:
			collection.description ??
			`Browse the ${collection.title} model collection on AI Stats with curated models, provider coverage, and quick links for comparison.`,
		alternates: {
			canonical: `/models/collections/${collection.id}`,
		},
	};
}

function CollectionDetailSkeleton() {
	return (
		<div className="flex min-h-screen flex-col">
			<div className="border-b border-border/70 px-4 py-2.5 lg:px-8">
				<div className="h-8 w-52 rounded bg-muted animate-pulse" />
				<div className="mt-1 h-4 w-80 max-w-full rounded bg-muted animate-pulse" />
				<div className="mt-2 h-8 w-full max-w-[460px] rounded bg-muted animate-pulse" />
			</div>
			<div className="px-4 pt-2 pb-5 lg:px-8 lg:pb-6">
				<div className="space-y-px bg-border/70">
					{Array.from({ length: 6 }).map((_, index) => (
						<div
							key={index}
							className="h-40 bg-muted animate-pulse"
						/>
					))}
				</div>
			</div>
		</div>
	);
}

async function CollectionDetailContent({ params }: CollectionPageProps) {
	const { collectionId } = await params;
	const collection = await findCollection(collectionId, 120);

	if (!collection) {
		notFound();
	}

	return <CollectionDetailDisplay collection={collection} />;
}

export default function CollectionDetailPage(props: CollectionPageProps) {
	return (
		<main className="flex min-h-screen flex-col">
			<Suspense fallback={<CollectionDetailSkeleton />}>
				<CollectionDetailContent {...props} />
			</Suspense>
		</main>
	);
}
