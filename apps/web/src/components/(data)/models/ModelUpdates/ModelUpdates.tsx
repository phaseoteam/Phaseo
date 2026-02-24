"use client";

import * as React from "react";
import ModelUpdatesOnThisDay from "./ModelUpdatesOnThisDay";
import ModelUpdatesRecentReleases from "./ModelUpdatesRecentReleases";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import { Megaphone, Rocket, Ban, Archive } from "lucide-react";
import type {
	ModelEvent,
	EventType,
} from "@/lib/fetchers/updates/getModelUpdates";

function formatDate(dateStr: string | null | undefined) {
	if (!dateStr) return "-";
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function getRelativeTime(dateStr: string | null | undefined) {
	if (!dateStr) return null;
	const now = new Date();
	const date = new Date(dateStr);
	const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
	const isToday =
		now.getFullYear() === date.getFullYear() &&
		now.getMonth() === date.getMonth() &&
		now.getDate() === date.getDate();
	if (isToday) return "Today";
	const days = Math.floor(diff / 86400);
	if (days === 1) return "1 day ago";
	if (days < 30) return `${days} days ago`;
	const months = Math.floor(diff / 2592000);
	if (months === 1) return "1 mo ago";
	if (months < 12) return `${months} mo ago`;
	const years = Math.floor(diff / 31536000);
	if (years === 1) return "1 yr ago";
	return `${years} yr ago`;
}

function getTimeUntil(dateStr: string | null | undefined) {
	if (!dateStr) return null;
	const now = new Date();
	const date = new Date(dateStr);
	const diff = Math.floor((date.getTime() - now.getTime()) / 1000);

	if (diff <= 0) return "Today";
	if (diff < 60) return "In 1 min";
	if (diff < 3600) {
		const mins = Math.ceil(diff / 60);
		return `In ${mins} min`;
	}
	if (diff < 86400) {
		const hours = Math.ceil(diff / 3600);
		return hours === 1 ? "In 1 hr" : `In ${hours} hr`;
	}
	const days = Math.ceil(diff / 86400);
	if (days === 1) return "Tomorrow";
	if (days < 30) return `In ${days} days`;
	const months = Math.ceil(diff / 2592000);
	if (months === 1) return "In 1 mo";
	if (months < 12) return `In ${months} mo`;
	const years = Math.ceil(diff / 31536000);
	if (years === 1) return "In 1 yr";
	return `In ${years} yr`;
}

interface ModelUpdatesPageProps {
	pastEvents: ModelEvent[];
	upcomingEvents: ModelEvent[];
}

export default function ModelUpdatesPage({
	pastEvents,
	upcomingEvents,
}: ModelUpdatesPageProps) {
	// events are passed in; keep stable reference
	const allEvents = React.useMemo(() => pastEvents, [pastEvents]);

	// Highlight events for today (same day/month, any year)
	const today = React.useMemo(() => new Date(), []);
	const todayEvents = React.useMemo(() => {
		return allEvents.filter((e) => {
			const d = new Date(e.date);
			return (
				d.getDate() === today.getDate() &&
				d.getMonth() === today.getMonth()
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
			);
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
			label: "Announcement",
			icon: <Megaphone size={14} className="mr-1" />,
			badgeClass:
				"bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:hover:border-blue-700",
		},
		{
			type: "Released",
			label: "Release",
			icon: <Rocket size={14} className="mr-1" />,
			badgeClass:
				"bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-green-200 hover:text-green-900 hover:border-green-400 dark:bg-green-950 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900 dark:hover:text-green-200 dark:hover:border-green-700",
		},
		{
			type: "Deprecated",
			label: "Deprecation",
			icon: <Ban size={14} className="mr-1" />,
			badgeClass:
				"bg-red-100 text-red-800 border border-red-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-red-200 hover:text-red-900 hover:border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900 dark:hover:text-red-200 dark:hover:border-red-700",
		},
		{
			type: "Retired",
			label: "Retirement",
			icon: <Archive size={14} className="mr-1" />,
			badgeClass:
				"bg-zinc-300 text-zinc-800 border border-zinc-400 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-zinc-400 hover:text-zinc-900 hover:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:hover:border-zinc-600",
		},
	];

	// Layout
	return (
		<div className="w-full">
			<ModelUpdatesRecentReleases
				title="Upcoming Model Updates"
				events={upcomingList}
				eventTypeOptions={eventTypeOptions}
				getRelativeLabel={getTimeUntil}
				emptyMessage="No upcoming updates scheduled."
				headerActions={<ModelCalendarRouteSwitch active="models" />}
			/>
			<ModelUpdatesOnThisDay
				todayEvents={todayEvents}
				eventTypeOptions={eventTypeOptions}
				today={today}
				formatDate={formatDate}
				getRelativeTime={getRelativeTime}
			/>
			<ModelUpdatesRecentReleases
				title="Recent Model Releases"
				events={filteredEvents}
				eventTypeOptions={eventTypeOptions}
				getRelativeLabel={getRelativeTime}
				emptyMessage="No recent updates recorded."
			/>
		</div>
	);
}
