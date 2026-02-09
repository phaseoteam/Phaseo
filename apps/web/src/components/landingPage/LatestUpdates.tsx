// components/updates/LatestUpdates.tsx
import Link from "next/link";
import UpdateCard from "@/components/updates/UpdateCard";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getLatestUpdateCards } from "@/lib/fetchers/updates/getLatestUpdates";
import { ArrowUpRight } from "lucide-react";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";

const CARD_LIMIT = 4;

export default async function LatestUpdates() {
	const includeHidden = false;
	// Fetch model and watcher (other) updates in parallel
	const [modelCards, watcherCards] = await Promise.all([
		getLatestModelUpdateCards(CARD_LIMIT, includeHidden),
		getLatestUpdateCards(CARD_LIMIT),
	]);

	return (
		<section className="space-y-4">
			<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
				<div className="space-y-2">
					<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
						The Latest Updates{" "}
						<span className="text-zinc-500 font-normal">
							from AI Stats
						</span>
					</h2>
				</div>
				<Link
					href="/updates"
					className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
				>
					View all updates
					<ArrowUpRight className="h-4 w-4" />
				</Link>
			</div>

			{/* Model updates row */}
			<div className="space-y-3">
				<div className="flex items-center gap-2 sm:hidden">
					<span className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
						Model Updates
					</span>
					<Separator className="flex-1" />
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{modelCards.map((card) => (
						<UpdateCard
							key={String(card.id)}
							{...card}
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
								No model updates to display yet. Check back
								soon.
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>

			{/* Other updates row */}
			<div className="space-y-3">
				<div className="flex items-center gap-2 sm:hidden">
					<span className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
						Other updates
					</span>
					<Separator className="flex-1" />
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{watcherCards.map((card) => (
						<UpdateCard
							key={String(card.id)}
							{...card}
							className={cn(
								"group",
								"border border-zinc-200 bg-white/90 shadow-sm ring-1 ring-inset ring-zinc-200/60",
								"transition hover:-translate-y-1 hover:shadow-lg",
								"dark:border-zinc-800 dark:bg-zinc-950/80 dark:ring-zinc-800/60",
								"flex h-full flex-col"
							)}
						/>
					))}

					{watcherCards.length === 0 ? (
						<Card className="border border-dashed border-zinc-200 bg-white/70 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
							<CardContent className="py-12">
								No updates to display yet. Check back soon.
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</section>
	);
}
