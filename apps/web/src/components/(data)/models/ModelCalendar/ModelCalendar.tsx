"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import ModelCalendarChart from "./ModelCalendarChart";
import ModelReleasePace from "./ModelReleasePace";
import ModelReleaseWeekdayAnalysis from "./ModelReleaseWeekdayAnalysis";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
	EventType,
	ModelEvent,
} from "@/lib/fetchers/updates/types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Archive,
	Ban,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Megaphone,
	Rocket,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_EVENTS_PER_DAY = 3;

const EVENT_TYPE_BORDER_COLOR: Record<EventType, string> = {
	Released: "#22c55e",
	Announced: "#3b82f6",
	Deprecated: "#ef4444",
	Retired: "#4b5563",
};

const EVENT_TYPE_ICON: Record<
	EventType,
	React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
	Released: Rocket,
	Announced: Megaphone,
	Deprecated: Ban,
	Retired: Archive,
};

const TYPE_RANK: Record<EventType, number> = {
	Released: 0,
	Announced: 1,
	Deprecated: 2,
	Retired: 3,
};

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function getDateKey(date: Date) {
	return `${date.getFullYear()}-${(date.getMonth() + 1)
		.toString()
		.padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function getWeekdayIndex(date: Date) {
	return (date.getDay() + 6) % 7;
}

function CalendarModelLink({ event }: { event: ModelEvent }) {
	const linkRef = useRef<HTMLAnchorElement>(null);
	const [isTruncated, setIsTruncated] = useState(false);

	useEffect(() => {
		const link = linkRef.current;
		if (!link) return;

		const measure = () => {
			setIsTruncated(link.scrollWidth > link.clientWidth);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(link);
		return () => observer.disconnect();
	}, []);

	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<Link
					ref={linkRef}
					href={`/models/${event.model.model_id}`}
					className="block truncate text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-50"
				>
					{event.model.name}
				</Link>
			</TooltipTrigger>
			{isTruncated ? (
				<TooltipContent side="top">{event.model.name}</TooltipContent>
			) : null}
		</Tooltip>
	);
}

type ModelCalendarProps = {
	events: ModelEvent[];
	monthsWindow?: number;
	headerActions?: React.ReactNode;
};

export default function ModelCalendar({
	events,
	monthsWindow = 13,
	headerActions,
}: ModelCalendarProps) {
	const format = useDisplayFormatters();
	const now = useMemo(() => new Date(), []);
	const currentYear = new Date().getFullYear();
	const startYear = 2018;
	const endYear = currentYear + 2;
	const [currentMonth, setCurrentMonth] = useState(() => {
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});

	const todayKey = useMemo(() => getDateKey(new Date()), []);
	const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

	const eventsByDate = useMemo(() => {
		const buckets = new Map<string, ModelEvent[]>();
		for (const event of events) {
			const parsed = new Date(event.date);
			if (Number.isNaN(parsed.getTime())) continue;
			const key = getDateKey(parsed);
			const bucket = buckets.get(key);
			if (bucket) {
				bucket.push(event);
			} else {
				buckets.set(key, [event]);
			}
		}

		for (const bucket of buckets.values()) {
			bucket.sort((a, b) => {
				const aRank = TYPE_RANK[a.types[0] ?? "Announced"];
				const bRank = TYPE_RANK[b.types[0] ?? "Announced"];
				if (aRank !== bRank) {
					return aRank - bRank;
				}
				return a.model.name.localeCompare(b.model.name);
			});
		}

		return buckets;
	}, [events]);

	const days = useMemo(() => {
		const startOfMonth = new Date(
			currentMonth.getFullYear(),
			currentMonth.getMonth(),
			1
		);
		const daysInMonth = new Date(
			currentMonth.getFullYear(),
			currentMonth.getMonth() + 1,
			0
		).getDate();
		const startWeekday = getWeekdayIndex(startOfMonth);
		const totalSlots = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

		return Array.from({ length: totalSlots }, (_, index) => {
			const dayOffset = index - startWeekday + 1;
			const date = new Date(
				currentMonth.getFullYear(),
				currentMonth.getMonth(),
				dayOffset
			);
			return {
				date,
				inCurrentMonth: date.getMonth() === currentMonth.getMonth(),
				events: eventsByDate.get(getDateKey(date)) ?? [],
			};
		});
	}, [currentMonth, eventsByDate]);

	useEffect(() => {
		const selectedCell = days.find(
			(cell) => getDateKey(cell.date) === selectedDateKey
		);
		if (selectedCell?.inCurrentMonth) return;

		const firstEventDay = days.find(
			(cell) => cell.inCurrentMonth && cell.events.length > 0
		);
		const firstMonthDay = days.find((cell) => cell.inCurrentMonth);
		const nextSelection = firstEventDay ?? firstMonthDay;
		if (nextSelection) setSelectedDateKey(getDateKey(nextSelection.date));
	}, [days, selectedDateKey]);

	const selectedDay = days.find(
		(cell) => getDateKey(cell.date) === selectedDateKey
	);

	const adjustMonth = (delta: number) => {
		setCurrentMonth((prev) => {
			return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
		});
	};

	type DayCell = {
		date: Date;
		inCurrentMonth: boolean;
		events: ModelEvent[];
	};

	const renderDayCell = (cell: DayCell, context: "desktop" | "mobile") => {
		const dateKey = getDateKey(cell.date);
		const isToday = dateKey === todayKey;
		const visibleEvents = cell.events.slice(0, MAX_EVENTS_PER_DAY);
		const hiddenCount = cell.events.length - visibleEvents.length;

		return (
			<div
				key={`${context}-${dateKey}`}
				className={cn(
					"flex min-h-28 flex-col border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950",
					cell.inCurrentMonth
						? "border-zinc-200 dark:border-zinc-800"
						: "opacity-60 dark:opacity-50",
					isToday && "border-zinc-900 dark:border-zinc-100"
				)}
			>
				<header className="flex items-center justify-between">
					<p
						className={cn(
							"text-lg font-semibold",
							!cell.inCurrentMonth
								? "text-zinc-400 dark:text-zinc-500"
								: "text-zinc-900 dark:text-zinc-50"
						)}
					>
						{cell.date.getDate()}
					</p>
					<span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
						{WEEKDAY_LABELS[getWeekdayIndex(cell.date)]}
					</span>
				</header>

				<div className="mt-2 flex flex-col gap-2">
					{visibleEvents.map((event, idx) => {
						const org = event.model.organisation;
						const eventType = event.types[0] ?? "Announced";
						const eventBorderColor =
							EVENT_TYPE_BORDER_COLOR[eventType];
						const EventIcon = EVENT_TYPE_ICON[eventType];
						const key = `${event.model.model_id}-${event.date}-${idx}`;
						return (
							<div
								key={key}
								className="rounded-md border bg-zinc-50 p-1.5 dark:bg-zinc-900"
								style={{
									borderColor: eventBorderColor,
								}}
								aria-label={`Model update: ${event.model.name} (${eventType})`}
							>
								<div className="flex items-center gap-1.5">
									<EventIcon
										className="size-3 shrink-0"
										style={{ color: eventBorderColor }}
									/>
									<Link
										href={`/organisations/${encodeURIComponent(
											org.organisation_id
										)}`}
										className="group"
									>
										<div className="relative flex size-4 items-center justify-center rounded-sm border">
											<div className="h-3 w-3 relative">
												<Logo
													id={org.organisation_id}
													alt={
														org.name ??
														org.organisation_id
													}
													className="object-contain"
													fill
												/>
											</div>
										</div>
									</Link>
									<div className="min-w-0 flex-1">
										<CalendarModelLink event={event} />
									</div>
								</div>
							</div>
						);
					})}
				</div>

				{hiddenCount > 0 ? (
					<Dialog>
						<DialogTrigger asChild>
							<button
								type="button"
								className="mt-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-400 cursor-pointer"
							>
								+{hiddenCount} more
							</button>
						</DialogTrigger>
						<DialogContent className="max-w-2xl">
							<DialogHeader>
								<DialogTitle>
									Releases on{" "}
									{format.calendarDate(`${getDateKey(cell.date)}T00:00:00.000Z`)}
								</DialogTitle>
							</DialogHeader>
							<ScrollArea className="max-h-96">
								<div className="space-y-4 pr-4">
									{(() => {
										const eventsByOrg = new Map<
											string,
											ModelEvent[]
										>();
										for (const event of cell.events) {
											const orgId =
												event.model.organisation
													.organisation_id;
											if (!eventsByOrg.has(orgId)) {
												eventsByOrg.set(orgId, []);
											}
											eventsByOrg.get(orgId)!.push(event);
										}
										return Array.from(
											eventsByOrg.entries()
										).map(([orgId, orgEvents]) => {
											const org =
												orgEvents[0].model.organisation;
											return (
												<div
													key={orgId}
													className="space-y-2"
												>
													<Link
														href={`/organisations/${encodeURIComponent(
															org.organisation_id
														)}`}
														className="flex items-center gap-2 group"
													>
														<div className="h-6 w-6 relative flex items-center justify-center rounded-xl border">
															<div className="h-5 w-5 relative">
																<Logo
																	id={
																		org.organisation_id
																	}
																	alt={
																		org.name ??
																		org.organisation_id
																	}
																	className="object-contain"
																	fill
																/>
															</div>
														</div>
														<span className="font-semibold text-sm relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
															{org.name ??
																org.organisation_id}
														</span>
													</Link>
													<div className="space-y-1 ml-8">
														{orgEvents.map(
															(event, idx) => {
																const eventType =
																	event
																		.types[0] ??
																	"Announced";
																const borderColor =
																	EVENT_TYPE_BORDER_COLOR[
																		eventType
																	];
																const key = `${event.model.model_id}-${event.date}-${idx}`;
																return (
																	<div
																		key={
																			key
																		}
																		className="rounded-md border bg-white p-2 text-xs dark:bg-zinc-950"
																		style={{
																			borderColor,
																		}}
																	>
																		<div className="flex items-center gap-2">
																			<Link
																				href={`/models/${event.model.model_id}`}
																				className="font-semibold underline decoration-transparent transition-colors duration-200 hover:decoration-current"
																			>
																				{event.model.name}
																			</Link>
																			<span className="text-zinc-500 dark:text-zinc-400">
																				(
																				{
																					eventType
																				}
																				)
																			</span>
																		</div>
																	</div>
																);
															}
														)}
													</div>
												</div>
											);
										});
									})()}
								</div>
							</ScrollArea>
						</DialogContent>
					</Dialog>
				) : null}
			</div>
		);
	};

	return (
		<section className="space-y-0 text-sm">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => adjustMonth(-1)}
						className="rounded-full border border-zinc-200 p-1 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</button>

					<DropdownMenu>
						<DropdownMenuTrigger className="inline-flex items-center gap-1 text-base font-semibold text-zinc-900 transition hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300">
							<span>{MONTH_NAMES[currentMonth.getMonth()]}</span>
							<ChevronDown className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-40 rounded-lg">
							{MONTH_NAMES.map((month, index) => (
								<DropdownMenuItem
									key={month}
									onClick={() =>
										setCurrentMonth(
											new Date(
												currentMonth.getFullYear(),
												index,
												1
											)
										)
									}
									className="flex items-center justify-between rounded-lg"
								>
									<span>{month}</span>
									{currentMonth.getMonth() === index ? (
										<Check className="h-4 w-4 text-sky-500" />
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger className="inline-flex items-center gap-1 text-base font-semibold text-zinc-900 transition hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300">
							<span>{currentMonth.getFullYear()}</span>
							<ChevronDown className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-32 rounded-lg">
							<ScrollArea className="h-48">
								{Array.from(
									{ length: endYear - startYear + 1 },
									(_, index) => endYear - index
								).map((year) => {
									const isCurrent =
										currentMonth.getFullYear() === year;
									return (
										<DropdownMenuItem
											key={year}
											onClick={() =>
												setCurrentMonth(
													new Date(
														year,
														currentMonth.getMonth(),
														1
													)
												)
											}
											className={cn(
												"flex items-center justify-between rounded-lg",
												isCurrent && "font-semibold"
											)}
										>
											<span>{year}</span>
											{isCurrent ? (
												<Check className="h-4 w-4 text-sky-500" />
											) : null}
										</DropdownMenuItem>
									);
								})}
							</ScrollArea>
						</DropdownMenuContent>
					</DropdownMenu>

					<button
						type="button"
						onClick={() => adjustMonth(1)}
						className="rounded-full border border-zinc-200 p-1 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
					>
						<ChevronRight className="h-3.5 w-3.5" />
					</button>

					{!(
						currentMonth.getFullYear() === now.getFullYear() &&
						currentMonth.getMonth() === now.getMonth()
					) && (
						<button
							type="button"
							onClick={() =>
								setCurrentMonth(
									new Date(now.getFullYear(), now.getMonth(), 1)
								)
							}
							className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
						>
							Today
						</button>
					)}
				</div>

				{headerActions ? (
					<div className="flex items-center gap-2">{headerActions}</div>
				) : null}
			</div>

			<div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
				<div className="hidden grid-cols-7 px-2 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 lg:grid">
					{WEEKDAY_LABELS.map((label) => (
						<span key={`weekday-${label}`} className="text-center">
							{label}
						</span>
					))}
				</div>

				<div className="bg-white dark:bg-zinc-950 lg:hidden">
					<div className="grid grid-cols-7 border-b border-zinc-200 px-1 py-2 text-center text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
						{WEEKDAY_LABELS.map((label) => (
							<span key={`mobile-weekday-${label}`}>{label.slice(0, 1)}</span>
						))}
					</div>
					<div className="grid grid-cols-7 gap-1 p-2">
						{days.map((cell) => {
							const dateKey = getDateKey(cell.date);
							const isSelected = dateKey === selectedDateKey;
							const isToday = dateKey === todayKey;

							return (
								<button
									key={`mobile-${dateKey}`}
									type="button"
									onClick={() => {
										setSelectedDateKey(dateKey);
										if (!cell.inCurrentMonth) {
											setCurrentMonth(
												new Date(cell.date.getFullYear(), cell.date.getMonth(), 1)
											);
										}
									}}
									className={cn(
										"flex min-h-10 flex-col items-center justify-center gap-1 rounded-md text-xs transition-colors",
										cell.inCurrentMonth
											? "text-zinc-900 dark:text-zinc-100"
											: "text-zinc-400 dark:text-zinc-600",
										isSelected && "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
										!isSelected && "hover:bg-zinc-100 dark:hover:bg-zinc-900",
										isToday && !isSelected && "font-bold ring-1 ring-inset ring-zinc-400"
									)}
									aria-label={format.calendarDate(`${getDateKey(cell.date)}T00:00:00.000Z`)}
								>
									<span>{cell.date.getDate()}</span>
									{cell.events.length > 0 ? (
										<span className="flex items-center gap-0.5" aria-hidden="true">
											{cell.events.slice(0, 3).map((event, index) => {
												const type = event.types[0] ?? "Announced";
												return (
													<span
														key={`${event.model.model_id}-${index}`}
														className="size-1 rounded-full"
														style={{
															backgroundColor: isSelected
																? "currentColor"
																: EVENT_TYPE_BORDER_COLOR[type],
														}}
													/>
												);
											})}
										</span>
									) : null}
								</button>
							);
						})}
					</div>

					<div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
						<h3 className="mb-2 text-sm font-semibold">
							{selectedDay ? format.dateParts(
								`${getDateKey(selectedDay.date)}T00:00:00.000Z`,
								{ weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
							) : ""}
						</h3>
						{selectedDay?.events.length ? (
							<div className="space-y-2">
								{selectedDay.events.map((event, index) => {
									const eventType = event.types[0] ?? "Announced";
									const EventIcon = EVENT_TYPE_ICON[eventType];
									const colour = EVENT_TYPE_BORDER_COLOR[eventType];
									const org = event.model.organisation;

									return (
										<div
											key={`${event.model.model_id}-${event.date}-${index}`}
											className="flex items-center gap-2 rounded-md border bg-zinc-50 p-2 dark:bg-zinc-900"
											style={{ borderColor: colour }}
										>
											<div className="relative size-8 shrink-0 rounded-md border bg-white p-1 dark:bg-zinc-950">
												<Logo
													id={org.organisation_id}
													alt={org.name ?? org.organisation_id}
													fill
													className="object-contain p-1"
												/>
											</div>
											<div className="min-w-0 flex-1">
												<Link
													href={`/models/${event.model.model_id}`}
													className="font-semibold leading-snug hover:underline"
												>
													{event.model.name}
												</Link>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{org.name ?? org.organisation_id}
												</p>
											</div>
											<span
												className="flex shrink-0 items-center gap-1 text-[10px] font-medium"
												style={{ color: colour }}
											>
												<EventIcon className="size-3" />
												{eventType}
											</span>
										</div>
									);
								})}
							</div>
						) : (
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								No model updates recorded for this day.
							</p>
						)}
					</div>
				</div>

				<div className="hidden lg:block">
					<div className="overflow-x-auto">
						<div className="min-w-[560px]">
							<div className="grid grid-cols-7 gap-px">
								{days.map((cell) =>
									renderDayCell(cell, "desktop")
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			<ModelReleaseWeekdayAnalysis events={events} />
			<ModelCalendarChart events={events} monthsWindow={monthsWindow} />
			<ModelReleasePace events={events} monthsWindow={monthsWindow} />
		</section>
	);
}
