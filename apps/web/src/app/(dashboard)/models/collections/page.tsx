import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getModelCollections } from "@/lib/fetchers/collections/getCollections";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Grid as GridIcon,
	Table as TableIcon,
	Layers as LayersIcon,
} from "lucide-react";

export const metadata: Metadata = {
	title: "Model collections - Curated groups by capability",
	description:
		"Explore curated collections of AI models, from free tiers to top benchmark performers.",
	alternates: {
		canonical: "/collections",
	},
};

function CollectionSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-6 w-48 rounded bg-muted animate-pulse" />
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="h-28 rounded-xl bg-muted animate-pulse" />
				))}
			</div>
		</div>
	);
}

async function CollectionsPageContent() {
	const collections = await getModelCollections(10);

	return (
		<div className="space-y-12">
			<header className="space-y-3">
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
									<Link
										href="/models/collections"
										aria-label="Collections view"
									>
										<LayersIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Collections</TooltipContent>
						</Tooltip>
					</div>
				</div>
				<p className="text-muted-foreground max-w-2xl">
					Quick picks across providers to help you find the right model faster.
				</p>
			</header>

			{collections.map((collection) => (
				<section key={collection.id} className="space-y-4">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold">{collection.title}</h2>
						<p className="text-sm text-muted-foreground">
							{collection.description}
						</p>
						{collection.hint ? (
							<p className="text-xs text-muted-foreground">{collection.hint}</p>
						) : null}
					</div>
					<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
						{collection.models.map((model) => (
							<ModelCard key={model.model_id} model={model} />
						))}
					</div>
				</section>
			))}
		</div>
	);
}

export default function CollectionsPage() {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<CollectionSkeleton />}>
					<CollectionsPageContent />
				</Suspense>
			</div>
		</main>
	);
}
