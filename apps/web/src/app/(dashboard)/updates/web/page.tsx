import UpdateCard from "@/components/updates/UpdateCard";
import { Card, CardContent } from "@/components/ui/card";
import { getWebUpdatesCached } from "@/lib/fetchers/updates/getWebUpdates";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Web AI Updates - Research Drops, Destinations & Data Hubs",
	description:
		"Track web updates across the AI ecosystem. Discover new research drops, documentation sites, product pages and data hubs surfaced by AI Stats.",
	path: "/updates/web",
	keywords: [
		"AI web updates",
		"AI research updates",
		"AI documentation",
		"AI product launches",
		"AI data hubs",
		"AI Stats",
	],
});

export default async function Page() {
	const cards = await getWebUpdatesCached(100);

	return (
		<div className="space-y-6">
			{cards.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="py-10 text-sm text-zinc-600 dark:text-zinc-400">
						No web updates available yet.
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{cards.map((card) => (
						<UpdateCard
							key={card.id}
							id={card.id}
							badges={card.badges}
							title={card.title}
							subtitle={card.subtitle ?? undefined}
							link={card.link}
							dateIso={card.dateIso}
							// relative={card.relative}
							accentClass={card.accentClass}
						/>
					))}
				</div>
			)}
		</div>
	);
}
