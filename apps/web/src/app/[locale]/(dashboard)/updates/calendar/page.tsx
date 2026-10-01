import ModelCalendar from "@/components/(data)/models/ModelCalendar/ModelCalendar";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import { fetchFrontendModelUpdates } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
