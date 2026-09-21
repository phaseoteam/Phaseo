import type { ModelEvent } from "@/lib/fetchers/updates/types";
import { DisplayCalendarDate } from "@/components/display/DisplayValue";
import ModelUpdateCard, { type EventTypeOption } from "./ModelUpdateCard";

interface ModelUpdatesOnThisDayProps {
	todayEvents: ModelEvent[];
	eventTypeOptions: EventTypeOption[];
	today: Date;
}

export default function ModelUpdatesOnThisDay({ todayEvents, eventTypeOptions, today }: ModelUpdatesOnThisDayProps) {
	const sortedEvents = [...todayEvents].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);

	return (
		<section className="mb-8 border-y border-zinc-200 py-5 dark:border-zinc-800">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h2 className="text-xl font-bold">On this day</h2>
				<span className="text-sm text-zinc-500 dark:text-zinc-400"><DisplayCalendarDate value={today} /></span>
			</div>
			{sortedEvents.length === 0 ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">No model releases are recorded for this date.</p>
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
