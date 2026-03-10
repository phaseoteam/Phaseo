import Link from "next/link";
import { ChevronRight } from "lucide-react";
import UpdateCard from "@/components/updates/UpdateCard";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";

const CARD_LIMIT = 4;

export function HomeModelUpdatesSectionFallback() {
	return (
		<section className="w-full border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
			<div className="space-y-6">
				<div className="mx-auto flex justify-center">
					<div className="h-8 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{Array.from({ length: CARD_LIMIT }).map((_, index) => (
						<div
							key={`model-update-fallback-${index}`}
							className="h-56 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
						/>
					))}
				</div>
			</div>
		</section>
	);
}

export default async function HomeModelUpdatesSection() {
	const modelCards = await getLatestModelUpdateCards(CARD_LIMIT, false);

	return (
		<section className="w-full border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
			<div className="space-y-6">
				<div className="flex justify-center">
					<h2>
						<Link
							href="/updates"
							className="group inline-flex items-center gap-1 text-center text-3xl font-semibold tracking-[-0.04em] text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200 sm:text-4xl"
						>
							<span>Latest Model Updates</span>
							<ChevronRight className="h-5 w-5 shrink-0 translate-y-px opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
						</Link>
					</h2>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{modelCards.map((card) => (
						<UpdateCard
							key={String(card.id)}
							{...card}
							compact
							hideFooterLink
							metaPlacement="header"
							className={cn(
								"group",
								"border border-zinc-200 bg-white/90 shadow-sm ring-1 ring-inset ring-zinc-200/60",
								"transition hover:-translate-y-1 hover:shadow-lg",
								"dark:border-zinc-800 dark:bg-zinc-950/80 dark:ring-zinc-800/60",
								"flex h-full flex-col"
							)}
						/>
					))}

					{modelCards.length === 0 ? (
						<Card className="border border-dashed border-zinc-200 bg-white/70 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
							<CardContent className="py-12">
								No model updates to display yet. Check back soon.
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</section>
	);
}
