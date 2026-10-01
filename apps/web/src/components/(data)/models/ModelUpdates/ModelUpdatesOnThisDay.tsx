import { useLocale, useTranslations } from "next-intl";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import ModelUpdateCard, { type EventTypeOption } from "./ModelUpdateCard";

interface ModelUpdatesOnThisDayProps {
	todayEvents: ModelEvent[];
	eventTypeOptions: EventTypeOption[];
	today: Date;
}

export default function ModelUpdatesOnThisDay({ todayEvents, eventTypeOptions, today }: ModelUpdatesOnThisDayProps) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.updates.models");
	const dateLabel = today.toLocaleDateString(locale, {
		day: "numeric",
		month: "long",
		timeZone: "UTC",
	});
	const sortedEvents = [...todayEvents].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);

	return (
		<section className="mb-8 border-y border-zinc-200 py-5 dark:border-zinc-800">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h2 className="text-xl font-bold">{t("onThisDay")}</h2>
				<span className="text-sm text-zinc-500 dark:text-zinc-400">{dateLabel}</span>
			</div>
			{sortedEvents.length === 0 ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">{t("noReleasesOnThisDate")}</p>
			) : (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{sortedEvents.map((event) => (
						<ModelUpdateCard
							key={`${event.model.model_id}-${event.date}`}
							event={event}
							eventTypeOptions={eventTypeOptions}
						/>
					))}
				</div>
			)}
		</section>
	);
}
