import ModelCalendar from "@/components/(data)/models/ModelCalendar/ModelCalendar";
import {
	getRecentModelUpdatesSplit,
	type ModelEvent,
} from "@/lib/fetchers/updates/getModelUpdates";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildMetadata({
	title: "AI Model Release Calendar - Announcements & Lifecycle Changes",
	description:
		"Visualise every model announcement, release and lifecycle change in one calendar. Explore what happened on any day and see how the AI model ecosystem is evolving over time.",
	path: "/updates/models/calendar",
	keywords: [
		"AI model calendar",
		"AI model release calendar",
		"LLM releases",
		"AI changelog",
		"model lifecycle",
		"AI Stats",
	],
});

const UPCOMING_LIMIT = 64;

export default async function Page() {
	const { past: pastEvents, future: upcomingEvents } =
		await getRecentModelUpdatesSplit({
			pastMonths: 12,
			upcomingLimit: UPCOMING_LIMIT,
		});

	const events: ModelEvent[] = [...pastEvents, ...upcomingEvents].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex flex-1 flex-col">
				<ModelCalendar events={events} />
			</div>
		</main>
	);
}
