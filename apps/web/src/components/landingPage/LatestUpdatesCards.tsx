import UpdateCard from "@/components/updates/UpdateCard";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getLatestUpdateCards } from "@/lib/fetchers/updates/getLatestUpdates";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";

const CARD_LIMIT = 4;

export function LatestUpdatesCardsFallback() {
	return (
		<div className="space-y-4">
			<div className="space-y-3">
				<div className="h-3 w-28 animate-pulse rounded bg-muted sm:hidden" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{Array.from({ length: 4 }).map((_, index) => (
						<div
							key={`model-${index}`}
							className="h-56 animate-pulse rounded-xl bg-muted"
						/>
					))}
				</div>
			</div>

			<div className="space-y-3">
				<div className="h-3 w-28 animate-pulse rounded bg-muted sm:hidden" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
					{Array.from({ length: 4 }).map((_, index) => (
						<div
							key={`other-${index}`}
							className="h-56 animate-pulse rounded-xl bg-muted"
						/>
					))}
				</div>
			</div>
		</div>
	);
}

export default async function LatestUpdatesCards() {
	const includeHidden = false;

	const [modelCards, watcherCards] = await Promise.all([
		getLatestModelUpdateCards(CARD_LIMIT, includeHidden),
		getLatestUpdateCards(CARD_LIMIT),
	]);

	return (
		<>
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
								No model updates to display yet. Check back soon.
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
		</>
	);
}

