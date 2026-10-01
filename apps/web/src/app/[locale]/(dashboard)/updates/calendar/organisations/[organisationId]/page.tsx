import Link from "next/link";
import { Rocket } from "lucide-react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import ModelUpdateCard, { type EventTypeOption } from "@/components/(data)/models/ModelUpdates/ModelUpdateCard";
import ModelCalendarRouteSwitch from "@/components/updates/ModelCalendarRouteSwitch";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import { fetchFrontendOrganisationReleaseEvents } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import type { RuntimeLocale } from "@/i18n/locales";
import { DisplayNumber } from "@/components/display/DisplayValue";

type PageProps = {
	params: Promise<{ locale: RuntimeLocale; organisationId: string }>;
	searchParams: Promise<{ view?: string }>;
};

type ViewMode = "today" | "all";
type ReleaseDayGroup = {
	weekdayIndex: number;
	weekdayKey: string;
	label: string;
	weekdayLabel: string;
	weekdayColor: string;
	events: ModelEvent[];
};

const WEEKDAY_SERIES = [
	{ key: "mon", color: "#60a5fa" },
	{ key: "tue", color: "#34d399" },
	{ key: "wed", color: "#fbbf24" },
	{ key: "thu", color: "#f97316" },
	{ key: "fri", color: "#a78bfa" },
	{ key: "sat", color: "#f472b6" },
	{ key: "sun", color: "#94a3b8" },
] as const;

function parseViewMode(value: string | undefined): ViewMode {
	return value === "today" ? "today" : "all";
}

function getWeekdaySeries(date: Date, locale: string) {
	const mondayFirstIndex = (date.getUTCDay() + 6) % 7;
	const weekdayDate = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
	);
	return {
		...(WEEKDAY_SERIES[mondayFirstIndex] ?? WEEKDAY_SERIES[0]),
		fullLabel: new Intl.DateTimeFormat(locale, {
			weekday: "long",
			timeZone: "UTC",
		}).format(weekdayDate),
		label: new Intl.DateTimeFormat(locale, {
			weekday: "short",
			timeZone: "UTC",
		}).format(weekdayDate),
	};
}

function resolveValidTimeZone(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
		return value;
	} catch {
		return null;
	}
}

function getMonthDayKeyForDate(
	date: Date,
	timeZone: string | null | undefined
): string {
	if (!timeZone) {
		return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate()
		).padStart(2, "0")}`;
	}
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		month: "2-digit",
		day: "2-digit",
	});
	const parts = formatter.formatToParts(date);
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;
	if (!month || !day) {
		return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate()
		).padStart(2, "0")}`;
	}
	return `${month}-${day}`;
}

export async function generateMetadata(props: {
	params: Promise<{ locale: RuntimeLocale; organisationId: string }>;
}): Promise<Metadata> {
	const { locale, organisationId } = await props.params;
	const t = await getTranslations({
		locale,
		namespace: "Catalogue.updatesCalendar.organisation",
	});
	return buildMetadata({
		title: t("metadataTitle", { organisation: organisationId }),
		description: t("description"),
		path: `/updates/calendar/organisations/${organisationId}`,
		keywords: [
			"AI model releases",
			"organisation releases",
			"AI model calendar",
			"Phaseo",
		],
	});
}

export default async function OrganisationCalendarPage({
	params,
	searchParams,
}: PageProps) {
	const [{ locale, organisationId }, { view: rawView }] = await Promise.all([
		params,
		searchParams,
	]);
	const t = await getTranslations({
		locale,
		namespace: "Catalogue.updatesCalendar.organisation",
	});
	const eventTypeT = await getTranslations({
		locale,
		namespace: "Catalogue.updates.eventTypes",
	});
	const requestHeaders = await headers();
	const view = parseViewMode(rawView);
	const requestTimeZone = resolveValidTimeZone(
		requestHeaders.get("x-vercel-ip-timezone") ??
			requestHeaders.get("cf-timezone") ??
			requestHeaders.get("x-time-zone")
	);
	const todayMonthDayKey = getMonthDayKeyForDate(new Date(), requestTimeZone);
	const organisationEvents =
		await fetchFrontendOrganisationReleaseEvents(organisationId);

	const organisationName =
		organisationEvents.find((event) => event.model.organisation.name?.trim())
			?.model.organisation.name ?? organisationId;

	const releasedEvents = organisationEvents.filter((event) =>
		event.types.includes("Released")
	);

	const releasedTodayEvents = releasedEvents.filter(
		(event) => event.date.slice(5, 10) === todayMonthDayKey
	);
	const uniqueReleasedModelCount = new Set(
		releasedEvents.map((event) => event.model.model_id)
	).size;
	const visibleEvents = view === "today" ? releasedTodayEvents : releasedEvents;
	const formatCount = (count: number) => new Intl.NumberFormat(locale).format(count);
	const cardsTitle = view === "today"
		? t("titleToday", { count: formatCount(releasedTodayEvents.length) })
		: t("titleAll", { count: formatCount(releasedEvents.length) });
	const groupedByDayMap = new Map<string, ReleaseDayGroup>();
	for (const event of visibleEvents) {
		const date = new Date(event.date);
		const weekdayIndex = (date.getUTCDay() + 6) % 7;
		const weekday = getWeekdaySeries(date, locale);
		const existing = groupedByDayMap.get(weekday.key);
		if (existing) {
			existing.events.push(event);
			continue;
		}
		groupedByDayMap.set(weekday.key, {
			weekdayIndex,
			weekdayKey: weekday.key,
			label: weekday.fullLabel,
			weekdayLabel: weekday.label,
			weekdayColor: weekday.color,
			events: [event],
		});
	}
	const groupedByDay = [...groupedByDayMap.values()].sort(
		(a, b) => a.weekdayIndex - b.weekdayIndex
	);

	const releaseBadge: EventTypeOption = {
		type: "Released",
		label: eventTypeT("released"),
		icon: <Rocket className="size-3.5" />,
		badgeClass:
			"bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
	};

	return (
		<div className="w-full">
				<div className="space-y-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<Link
								href="/updates/calendar"
								className="font-medium text-zinc-700 hover:underline dark:text-zinc-300"
							>
								{t("backToCalendar")}
							</Link>
						</div>
						<ModelCalendarRouteSwitch active="calendar" />
					</div>

					<div className="space-y-1">
						<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
							{t("detailsTitle", { organisation: organisationName })}
						</h1>
						<p className="text-sm text-zinc-600 dark:text-zinc-300">
							{t("description")}
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-xs">
						<span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-950">
							{t("totalReleaseEvents", { count: formatCount(releasedEvents.length) })}
						</span>
						<span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-950">
							{t("releasedModels", { count: formatCount(uniqueReleasedModelCount) })}
						</span>
						<span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-950">
							{t("releasedOnThisDay", { count: formatCount(releasedTodayEvents.length) })}
						</span>
						<span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-950">
							{t("weekdayGroups", { count: formatCount(groupedByDay.length) })}
						</span>
					</div>

					<div className="flex flex-wrap gap-2">
						<Link
							href={`/updates/calendar/organisations/${encodeURIComponent(
								organisationId
							)}?view=today`}
							className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
								view === "today"
									? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
									: "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500"
							}`}
						>
							{t("releasedOnThisDayButton")}
						</Link>
						<Link
							href={`/updates/calendar/organisations/${encodeURIComponent(
								organisationId
							)}?view=all`}
							className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
								view === "all"
									? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
									: "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500"
							}`}
						>
							{t("allReleasedModelsButton")}
						</Link>
					</div>
				</div>

				<section className="mt-4">
					<h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
						{cardsTitle}
					</h2>
					{groupedByDay.length === 0 ? (
						<div className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
							{t("noReleasesThisDay")}
						</div>
					) : (
						<div className="space-y-4">
							{groupedByDay.map((dayGroup) => (
								<section
									key={dayGroup.weekdayKey}
									className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
								>
									<header
										className="flex flex-wrap items-center justify-between gap-2 border-b bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
									>
										<div className="flex items-center gap-2">
											<span
												className="inline-block h-2.5 w-2.5 rounded-full"
												style={{
													backgroundColor:
														dayGroup.weekdayColor,
												}}
											/>
											<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
												{dayGroup.label}
											</h3>
										</div>
										<div className="flex items-center gap-2 text-xs">
											<span className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
												{t("releaseCount", {
													count: formatCount(dayGroup.events.length),
												})}
											</span>
										</div>
									</header>
									<div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
										{dayGroup.events.map((event) => (
											<ModelUpdateCard
												key={`${event.model.model_id}-${event.date}`}
												event={event}
												eventTypeOptions={[releaseBadge]}
											/>
										))}
									</div>
								</section>
							))}
						</div>
					)}
				</section>
		</div>
	);
}
