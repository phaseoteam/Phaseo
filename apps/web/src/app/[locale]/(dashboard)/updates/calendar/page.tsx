import ModelCalendar from "@/components/(data)/models/ModelCalendar/ModelCalendar";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { modelUpdatesQuery } from "../models/page.queries";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import type { RuntimeLocale } from "@/i18n/locales";

export async function generateMetadata(props: {
	params: Promise<{ locale: RuntimeLocale }>;
}): Promise<Metadata> {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "Catalogue.updatesMetadata" });
	return buildMetadata({
		title: t("calendarTitle"),
		description: t("calendarDescription"),
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
}

const UPCOMING_LIMIT = 64;

export default function Page() {
	const { data: { past: pastEvents, future: upcomingEvents } } =
		useSuspenseQuery(modelUpdatesQuery(UPCOMING_LIMIT));

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
