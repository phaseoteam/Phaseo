import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Button } from "@/components/ui/button";
import { getModelCollections } from "@/lib/fetchers/collections/getCollections";
import {
	ArrowLeft as ArrowLeftIcon,
	Grid as GridIcon,
	Layers as LayersIcon,
	Table as TableIcon,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type CollectionPageProps = {
	params: Promise<{ collectionId: string }>;
};

async function findCollection(collectionId: string) {
	const collections = await getModelCollections(10);
	return collections.find((collection) => collection.id === collectionId) ?? null;
}

export async function generateStaticParams() {
	const collections = await getModelCollections(10);
	return collections.map((collection) => ({ collectionId: collection.id }));
}

export async function generateMetadata({
	params,
}: CollectionPageProps): Promise<Metadata> {
	const { collectionId } = await params;
	const collection = await findCollection(collectionId);

	if (!collection) {
		return {
			title: "Collection not found",
		};
	}

	return {
		title: `${collection.title} - Model collection`,
		description: collection.description,
		alternates: {
			canonical: `/models/collections/${collection.id}`,
		},
	};
}

function CollectionDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-6 w-56 rounded bg-muted animate-pulse" />
			<div className="h-4 w-96 max-w-full rounded bg-muted animate-pulse" />
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="h-32 rounded-xl bg-muted animate-pulse" />
				))}
			</div>
		</div>
	);
}

async function CollectionDetailContent({ params }: CollectionPageProps) {
	const { collectionId } = await params;
	const collection = await findCollection(collectionId);

	if (!collection) {
		notFound();
	}

	return (
		<div className="space-y-8">
			<header className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
					<div className="inline-flex rounded-md overflow-hidden border bg-background">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									asChild
									variant="outline"
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
								>
									<Link href="/models" aria-label="Card view">
										<GridIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Card view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									asChild
									variant="outline"
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
								>
									<Link href="/models/table" aria-label="Table view">
										<TableIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Table view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									asChild
									variant="default"
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
								>
									<Link href="/models/collections" aria-label="Collections view">
										<LayersIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Collections</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="space-y-2">
					<Button variant="ghost" size="sm" asChild className="px-1 text-muted-foreground">
						<Link href="/models/collections">
							<ArrowLeftIcon className="h-4 w-4" />
							Back to all collections
						</Link>
					</Button>
					<h2 className="text-2xl font-semibold tracking-tight">{collection.title}</h2>
					<p className="max-w-2xl text-sm text-muted-foreground">
						{collection.description}
					</p>
					{collection.hint ? (
						<p className="text-xs text-muted-foreground">{collection.hint}</p>
					) : null}
				</div>
			</header>

			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{collection.models.map((model) => (
					<ModelCard key={model.model_id} model={model} />
				))}
			</div>
		</div>
	);
}

export default function CollectionDetailPage(props: CollectionPageProps) {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<CollectionDetailSkeleton />}>
					<CollectionDetailContent {...props} />
				</Suspense>
			</div>
		</main>
	);
}
