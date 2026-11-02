// Roadmap layout: a month-by-month range covering every dated project (and today), and each
// project's bar as left and width percentages of that range.

import type { RoadmapProject } from "./types";

const DAY = 86_400_000;

function dayStart(value: string): number {
	return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

export type RoadmapRange = { start: number; end: number; months: Array<{ key: string; start: number; label: Date }> };

/** The project's start: its start date, or the day it was made. */
export function projectStart(project: Pick<RoadmapProject, "startDate" | "createdAt">): number {
	return project.startDate ? dayStart(project.startDate) : dayStart(project.createdAt);
}

/** From the first of the earliest month to the end of the latest one, covering today. */
export function roadmapRange(projects: RoadmapProject[], today: Date = new Date()): RoadmapRange {
	const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
	const dated = projects.filter((project) => project.targetDate);
	const starts = [now, ...dated.map(projectStart)];
	const ends = [now + 30 * DAY, ...dated.map((project) => dayStart(project.targetDate!) + DAY)];
	const first = new Date(Math.min(...starts));
	const last = new Date(Math.max(...ends));
	const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
	const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
	const months: RoadmapRange["months"] = [];
	for (let cursor = new Date(start); cursor.getTime() < end && months.length < 36; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
		months.push({ key: cursor.toISOString().slice(0, 7), start: cursor.getTime(), label: cursor });
	}
	return { start, end: months.length ? Date.UTC(new Date(months.at(-1)!.start).getUTCFullYear(), new Date(months.at(-1)!.start).getUTCMonth() + 1, 1) : end, months };
}

/** Where a project's bar sits, in percent of the range. At least 1% wide, so a one-day project shows. */
export function barPosition(project: RoadmapProject, range: RoadmapRange): { left: number; width: number } | null {
	if (!project.targetDate) return null;
	const span = range.end - range.start;
	const from = Math.max(range.start, Math.min(projectStart(project), dayStart(project.targetDate)));
	const to = Math.min(range.end, dayStart(project.targetDate) + DAY);
	const left = ((from - range.start) / span) * 100;
	const width = Math.max(1, ((to - from) / span) * 100);
	return { left: Math.round(left * 100) / 100, width: Math.round(Math.min(width, 100 - left) * 100) / 100 };
}

/** Today's line, in percent of the range. */
export function todayPosition(range: RoadmapRange, today: Date = new Date()): number {
	const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
	return Math.round(((now - range.start) / (range.end - range.start)) * 10_000) / 100;
}
