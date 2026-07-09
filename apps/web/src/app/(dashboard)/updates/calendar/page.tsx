import ModelCalendar from "@/components/(data)/models/ModelCalendar/ModelCalendar";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import type { ModelEvent } from "@/lib/fetchers/updates/getModelUpdates";
import { fetchFrontendModelUpdates } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildMetadata({
	title: "AI Model Release Calendar - Announcements & Lifecycle Changes",
	description:
		"Visualise every model announcement, release and lifecycle change in one calendar. Explore what happened on any day and see how the AI model ecosystem is evolving over time.",
	path: "/updates/calendar",
	keywords: [
		"AI model calendar",
		"AI model release calendar",
		"LLM releases",
		"AI changelog",
		"model lifecycle",
		"Phaseo",
	],
});

const UPCOMING_LIMIT = 64;

export default async function Page() {
	const { past: pastEvents, future: upcomingEvents } =
		await fetchFrontendModelUpdates({
			includeAllPast: true,
			upcomingLimit: UPCOMING_LIMIT,
		});

	const events: ModelEvent[] = [...pastEvents, ...upcomingEvents].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex flex-1 flex-col">
				<ModelCalendar
					events={events}
					headerActions={
						<ModelCalendarRouteSwitch active="calendar" />
					}
				/>
			</div>
		</main>
	);
}
