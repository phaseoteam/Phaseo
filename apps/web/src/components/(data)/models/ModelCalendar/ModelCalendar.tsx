"use client";

import React, { useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import ModelCalendarChart from "./ModelCalendarChart";
import ModelReleasePace from "./ModelReleasePace";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
	EventType,
	ModelEvent,
} from "@/lib/fetchers/updates/getModelUpdates";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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

function withAlpha(hex?: string | null, alpha = 0.08) {
	if (!hex) return undefined;
	const trimmed = hex.trim();
	if (!trimmed) return undefined;
	const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
	if (normalized.length !== 3 && normalized.length !== 6) return undefined;
	if (!/^[0-9A-Fa-f]+$/.test(normalized)) return undefined;
	const expanded =
		normalized.length === 3
			? normalized
					.split("")
					.map((char) => char + char)
					.join("")
			: normalized;
	const r = parseInt(expanded.slice(0, 2), 16);
	const g = parseInt(expanded.slice(2, 4), 16);
	const b = parseInt(expanded.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getWeekdayIndex(date: Date) {
	return (date.getDay() + 6) % 7;
}

type ModelCalendarProps = {
	events: ModelEvent[];
	monthsWindow?: number;
};

type OrganisationWithColour = ModelEvent["model"]["organisation"] & {
	colour?: string | null;
};

export default function ModelCalendar({
	events,
	monthsWindow = 13,
}: ModelCalendarProps) {
	const now = useMemo(() => new Date(), []);
	const currentYear = new Date().getFullYear();
	const startYear = 2018;
	const endYear = currentYear + 2;
	const [currentMonth, setCurrentMonth] = useState(() => {
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});

	const todayKey = useMemo(() => getDateKey(new Date()), []);

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

	const monthLabel = useMemo(
		() =>
			currentMonth.toLocaleString("en-US", {
				month: "long",
				year: "numeric",
			}),
		[currentMonth]
	);

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
					"flex flex-col rounded-2xl border bg-white/80 p-2 shadow-sm transition dark:bg-zinc-950/70",
					cell.inCurrentMonth
						? "border-zinc-200 dark:border-zinc-800"
						: "opacity-60 dark:opacity-50",
					isToday &&
						"border-sky-400/80 bg-sky-50 dark:border-sky-500/80 dark:bg-sky-900/40"
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
					<span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
						{WEEKDAY_LABELS[getWeekdayIndex(cell.date)]}
					</span>
				</header>

				<div className="mt-2 flex flex-col gap-2">
					{visibleEvents.map((event, idx) => {
						const org = event.model
							.organisation as OrganisationWithColour;
						const accent = withAlpha(org.colour, 0.08);
						const eventType = event.types[0] ?? "Announced";
						const eventBorderColor =
							EVENT_TYPE_BORDER_COLOR[eventType];
						const key = `${event.model.model_id}-${event.date}-${idx}`;
						return (
							<div
								key={key}
								className="rounded-2xl border-2 bg-white/80 p-2 shadow-sm transition dark:bg-zinc-950/70"
								style={{
									borderColor: eventBorderColor,
									backgroundColor: accent,
								}}
								aria-label={`Model update: ${event.model.name} (${eventType})`}
							>
								<div className="flex items-center gap-2">
									<Link
										href={`/organisations/${encodeURIComponent(
											org.organisation_id
										)}`}
										className="group"
									>
										<div className="h-4 w-4 relative flex items-center justify-center rounded-xl border">
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
										<Tooltip delayDuration={500}>
											<TooltipTrigger asChild>
												<Link
													href={`/models/${event.model.model_id}`}
													className="block truncate text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-50"
												>
													{event.model.name}
												</Link>
											</TooltipTrigger>
											<TooltipContent side="top">
												{event.model.name}
											</TooltipContent>
										</Tooltip>
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
									{cell.date.toLocaleDateString("en-US", {
										month: "long",
										day: "numeric",
										year: "numeric",
									})}
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
														<span className="font-semibold text-sm relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
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
																		className="rounded-2xl border-2 bg-white/80 p-2 text-xs transition dark:bg-zinc-950/70"
																		style={{
																			borderColor,
																		}}
																	>
																		<div className="flex items-center gap-2">
																			<Tooltip
																				delayDuration={
																					500
																				}
																			>
																				<TooltipTrigger
																					asChild
																				>
																					<Link
																						href={`/models/${event.model.model_id}`}
																						className="font-semibold relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full"
																					>
																						{
																							event
																								.model
																								.name
																						}
																					</Link>
																				</TooltipTrigger>
																				<TooltipContent side="top">
																					{
																						event
																							.model
																							.name
																					}
																				</TooltipContent>
																			</Tooltip>
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
			<div className="flex flex-wrap items-center gap-3 mb-4">
				<button
					type="button"
					onClick={() => adjustMonth(-1)}
					className="rounded-full border border-zinc-200 p-1 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
				>
					<ChevronLeft className="h-3.5 w-3.5" />
				</button>

				<DropdownMenu>
					<DropdownMenuTrigger className="flex min-w-[140px] items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-1 text-sm font-semibold transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
						<span>{MONTH_NAMES[currentMonth.getMonth()]}</span>
						<ChevronDown className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-32">
						{MONTH_NAMES.map((month, index) => (
							<DropdownMenuItem
								key={month}
								onSelect={() =>
									setCurrentMonth(
										new Date(
											currentMonth.getFullYear(),
											index,
											1
										)
									)
								}
								className="flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-900"
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
					<DropdownMenuTrigger className="flex min-w-[120px] items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-1 text-sm font-semibold transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
						<span>{currentMonth.getFullYear()}</span>
						<ChevronDown className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-32">
						<ScrollArea className="h-48">
							{Array.from(
								{ length: endYear - startYear + 1 },
								(_, index) => endYear - index
							).map((year) => {
								const isCurrent =
									currentMonth.getFullYear() === year;
								return (
									<React.Fragment key={year}>
										{isCurrent && (
											<div className="border-t border-zinc-200 dark:border-zinc-700" />
										)}
										<DropdownMenuItem
											onSelect={() =>
												setCurrentMonth(
													new Date(
														year,
														currentMonth.getMonth(),
														1
													)
												)
											}
											className={cn(
												"flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-900 pr-2",
												isCurrent &&
													"font-bold bg-zinc-50 dark:bg-zinc-800"
											)}
										>
											<span>{year}</span>
											{isCurrent ? (
												<Check className="h-4 w-4 text-sky-500" />
											) : null}
										</DropdownMenuItem>
										{isCurrent && (
											<div className="border-b border-zinc-200 dark:border-zinc-700" />
										)}
									</React.Fragment>
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

				<div className="ml-auto text-base font-semibold text-zinc-900 dark:text-zinc-50">
					{monthLabel}
				</div>
			</div>

			<div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white/70 shadow-lg shadow-zinc-200/40 dark:border-zinc-800 dark:bg-zinc-950/70">
				<div className="hidden grid-cols-7 px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-zinc-500 dark:text-zinc-400 sm:grid">
					{WEEKDAY_LABELS.map((label) => (
						<span key={`weekday-${label}`} className="text-center">
							{label}
						</span>
					))}
				</div>

				<div className="grid grid-cols-2 gap-3 px-2 pb-4 pt-2 sm:hidden">
					{days.map((cell) => renderDayCell(cell, "mobile"))}
				</div>

				<div className="hidden sm:block">
					<div className="overflow-x-auto">
						<div className="min-w-[560px] space-y-3 px-2 pb-4 pt-2">
							<div className="grid grid-cols-7 gap-3">
								{days.map((cell) =>
									renderDayCell(cell, "desktop")
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			<ModelCalendarChart events={events} monthsWindow={monthsWindow} />
			<ModelReleasePace events={events} monthsWindow={monthsWindow} />
		</section>
	);
}
