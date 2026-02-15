import { getRecentModelUpdatesSplit } from "@/lib/fetchers/updates/getModelUpdates";
import ModelUpdatesPage from "@/components/(data)/models/ModelUpdates/ModelUpdates";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "AI Model Updates",
	description:
		"Stay up to date with the latest AI model changes. Track new releases, deprecations, major upgrades and benchmark highlights across leading LLMs and multimodal models.",
	path: "/updates/models",
	keywords: [
		"AI model updates",
		"LLM updates",
		"AI releases",
		"model changelog",
		"AI benchmarks",
		"new AI models",
		"AI Stats",
		"GPT-5.1",
		"Claude 4.5",
		"Gemini 2.5",
		"Grok 4",
	],
});

export default async function Page() {
	// Fetch recent model update events (same source as landing page)
	const { past: pastEvents, future: upcomingEvents } =
		await getRecentModelUpdatesSplit({
			limit: 250,
			upcomingLimit: 4,
		});

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex flex-1">
				<div className="flex-1">
					<ModelUpdatesPage
						pastEvents={pastEvents}
						upcomingEvents={upcomingEvents}
					/>
				</div>
			</div>
		</main>
	);
}
