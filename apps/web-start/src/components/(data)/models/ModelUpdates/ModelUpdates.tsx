"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import ModelUpdatesOnThisDay from "./ModelUpdatesOnThisDay";
import ModelUpdatesRecentReleases from "./ModelUpdatesRecentReleases";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import { Megaphone, Rocket, Ban, Archive } from "lucide-react";
import type {
	ModelEvent,
	EventType,
} from "@/lib/fetchers/updates/types";

const RECENT_EVENT_LIMIT = 250;

interface ModelUpdatesPageProps {
	pastEvents: ModelEvent[];
	upcomingEvents: ModelEvent[];
}

export default function ModelUpdatesPage({
	pastEvents,
	upcomingEvents,
}: ModelUpdatesPageProps) {
	const t = useTranslations("Catalogue.updates");
	// events are passed in; keep stable reference
	const allEvents = React.useMemo(() => pastEvents, [pastEvents]);

	// Highlight releases on this calendar date, across all recorded years.
	const today = React.useMemo(() => new Date(), []);
	const todayEvents = React.useMemo(() => {
		return allEvents.filter((e) => {
			const d = new Date(e.date);
			return (
				e.types.includes("Released") &&
				d.getUTCDate() === today.getUTCDate() &&
				d.getUTCMonth() === today.getUTCMonth()
			);
		});
	}, [allEvents, today]);

	// Filtering logic
	const filteredEvents = React.useMemo(() => {
		return allEvents
			.filter((e) => {
				// Only show events up to today
				// eslint-disable-next-line react-hooks/purity
				if (new Date(e.date).getTime() > Date.now()) return false;
				return true;
			})
			.sort(
				(a, b) =>
					new Date(b.date).getTime() - new Date(a.date).getTime()
			)
			.slice(0, RECENT_EVENT_LIMIT);
	}, [allEvents]);

	const upcomingList = React.useMemo(
		() => upcomingEvents.slice(0, 3),
		[upcomingEvents]
	);

	// Event type options
	const eventTypeOptions: {
		type: EventType;
		label: string;
		icon: React.ReactNode;
		badgeClass: string;
	}[] = [
		{
			type: "Announced",
			label: t("eventTypes.announced"),
			icon: <Megaphone size={14} className="mr-1" />,
			badgeClass:
				"bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:hover:border-blue-700",
		},
		{
			type: "Released",
			label: t("eventTypes.released"),
			icon: <Rocket size={14} className="mr-1" />,
			badgeClass:
				"bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-green-200 hover:text-green-900 hover:border-green-400 dark:bg-green-950 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900 dark:hover:text-green-200 dark:hover:border-green-700",
		},
		{
			type: "Deprecated",
			label: t("eventTypes.deprecated"),
			icon: <Ban size={14} className="mr-1" />,
			badgeClass:
				"bg-red-100 text-red-800 border border-red-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-red-200 hover:text-red-900 hover:border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900 dark:hover:text-red-200 dark:hover:border-red-700",
		},
		{
			type: "Retired",
			label: t("eventTypes.retired"),
			icon: <Archive size={14} className="mr-1" />,
			badgeClass:
				"bg-zinc-300 text-zinc-800 border border-zinc-400 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-zinc-400 hover:text-zinc-900 hover:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:hover:border-zinc-600",
		},
	];

	// Layout
	return (
		<div className="w-full">
			<ModelUpdatesRecentReleases
				title={t("models.upcomingTitle")}
				events={upcomingList}
				eventTypeOptions={eventTypeOptions}
				emptyMessage={t("models.noUpcoming")}
				headerActions={<ModelCalendarRouteSwitch active="models" />}
			/>
			<ModelUpdatesOnThisDay
				todayEvents={todayEvents}
				eventTypeOptions={eventTypeOptions}
				today={today}
			/>
			<ModelUpdatesRecentReleases
				title={t("models.recentTitle")}
				events={filteredEvents}
				eventTypeOptions={eventTypeOptions}
				emptyMessage={t("models.noRecent")}
			/>
		</div>
	);
}
