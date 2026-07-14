import UpdateCard from "@/components/updates/UpdateCard";
import { Card, CardContent } from "@/components/ui/card";
import { fetchFrontendYouTubeUpdates } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "AI Video Updates",
	description:
		"Browse the latest AI-related YouTube updates tracked by Phaseo. See livestreams, explainers, release breakdowns and analysis videos from top AI channels in one place.",
	path: "/updates/youtube",
	keywords: [
		"YouTube AI updates",
		"AI videos",
		"AI livestreams",
		"AI explainers",
		"AI release breakdowns",
		"Phaseo",
	],
});

export default async function Page() {
	const cards = await fetchFrontendYouTubeUpdates(100);

	return (
		<div className="space-y-6">
			{cards.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="py-10 text-sm text-zinc-600 dark:text-zinc-400">
						No YouTube updates available yet.
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
							accentClass={card.accentClass}
						/>
					))}
				</div>
			)}
		</div>
	);
}
