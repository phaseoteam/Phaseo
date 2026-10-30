import { useTranslations } from "next-intl";
import ModelUpdateCard, { type EventTypeOption } from "./ModelUpdateCard";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import type React from "react";

interface ModelUpdatesRecentReleasesProps {
	events: ModelEvent[];
	eventTypeOptions: EventTypeOption[];
	title: string;
	emptyMessage?: string;
	headerActions?: React.ReactNode;
}

export default function ModelUpdatesRecentReleases({
	events,
	eventTypeOptions,
	title,
	emptyMessage,
	headerActions,
}: ModelUpdatesRecentReleasesProps) {
	const t = useTranslations("Catalogue.updates.models");
	if (events.length === 0) {
		return (
			<div className="mb-6">
				<div className="mb-2 flex items-center justify-between gap-3">
					<h2 className="text-xl font-bold">{title}</h2>
					{headerActions ? <div className="shrink-0">{headerActions}</div> : null}
				</div>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					{emptyMessage ?? t("noUpdates")}
				</p>
			</div>
		);
	}

	return (
		<div className="mb-6">
			<div className="mb-2 flex items-center justify-between gap-3">
				<h2 className="text-xl font-bold">{title}</h2>
				{headerActions ? <div className="shrink-0">{headerActions}</div> : null}
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{events.map((event) => (
					<ModelUpdateCard
						key={`${event.model.model_id}-${event.types.join("+")}-${event.date}`}
						event={event}
						eventTypeOptions={eventTypeOptions}
					/>
				))}
			</div>
		</div>
	);
}
