import UpdateCard from "@/components/updates/UpdateCard";
import Image from "next/image";
import Link from "next/link";
import {
	TooltipProvider,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModelEvent } from "@/lib/fetchers/updates/getModelUpdates";

interface ModelUpdatesOnThisDayProps {
	todayEvents: ModelEvent[];
	eventTypeOptions: any[];
	today: Date;
	formatDate: (dateStr: string) => string;
	getRelativeTime: (dateStr: string) => string | null;
}

export default function ModelUpdatesOnThisDay({
	todayEvents,
	eventTypeOptions,
	today,
	formatDate,
	getRelativeTime,
}: ModelUpdatesOnThisDayProps) {
	if (!todayEvents.length) return null;

	// Helper to check if a given date is today
	const isDateToday = (dateStr: string) => {
		const d = new Date(dateStr);
		return (
			today.getFullYear() === d.getFullYear() &&
			today.getMonth() === d.getMonth() &&
			today.getDate() === d.getDate()
		);
	};

	// Sort: today's events first, then prior events in descending order
	const sortedEvents = [...todayEvents].sort((a, b) => {
		const aToday = isDateToday(a.date);
		const bToday = isDateToday(b.date);
		if (aToday && !bToday) return -1;
		if (!aToday && bToday) return 1;
		// Descending by date
		return new Date(b.date).getTime() - new Date(a.date).getTime();
	});

	return (
		<div className="mb-6">
			<div className="font-bold text-xl mb-2">On This Day</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				{sortedEvents
					.filter((event) => !isDateToday(event.date))
					.map((event) => {
						const { model } = event;

						// map event types to UpdateCard badges (reuse logic from RecentReleases)
						const badges = event.types
							.map((t: string) =>
								eventTypeOptions.find((o: any) => o.type === t)
							)
							.filter(Boolean)
							.map((opt: any) => {
								let IconComp: any = null;
								if (opt.icon) {
									IconComp =
										typeof opt.icon === "function"
											? opt.icon
											: ({
													className,
											  }: {
													className?: string;
											  }) => (
													<span className={className}>
														{opt.icon}
													</span>
											  );
								}

								return {
									label: opt.label,
									icon: IconComp,
									className: opt.badgeClass,
								};
							});

						const accentMap: Record<string, string> = {
							Released: "bg-green-500",
							Announced: "bg-blue-500",
							Deprecated: "bg-red-500",
							Retired: "bg-zinc-500",
						};

						const primaryType = event.types[0];
						const accentClass = accentMap[primaryType] ?? null;

						return (
							<UpdateCard
								key={`${model.model_id}-${event.date}`}
								id={`${model.model_id}-${event.date}`}
								badges={badges}
								avatar={{
									organisationId: (
										model.organisation.organisation_id || ""
									).toLowerCase(),
									name: model.organisation.name,
								}}
								title={model.name}
								subtitle={model.organisation.name}
								source={model.organisation.name}
								link={{
									href: `/models/${model.model_id}`,
									external: false,
									cta: "View",
								}}
								dateIso={new Date(event.date).toISOString()}
								isReleaseToday={false}
								// relative={getRelativeTime(event.date)}
								accentClass={accentClass}
							/>
						);
					})}
			</div>
		</div>
	);
}
