import { CLOSED_WORK_ITEM_STATES, DEFAULT_WORK_SETTINGS, type WorkItem, type WorkSettings } from "./types";

export type SlaStatus = "breached" | "at_risk" | "ok" | "none";

const HOUR = 3_600_000;

/** The SLA hours for a priority, or null when priority 0 (none) has no SLA. */
export function slaHoursFor(settings: Pick<WorkSettings, "slaHours"> | null | undefined, priority: number): number | null {
	const key = String(priority) as keyof WorkSettings["slaHours"];
	if (!["1", "2", "3", "4"].includes(key)) return null;
	const hours = Number(settings?.slaHours?.[key] ?? DEFAULT_WORK_SETTINGS.slaHours[key]);
	return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/**
 * Breached: closed after the due time, or open and past it. At risk: open with under 25% of its time left.
 * The API's slaBreached / slaAtRisk flags win when present; otherwise this works it out from sla_due_at,
 * using the SLA hours for the item's priority to know how long the window was.
 */
export function slaStatus(
	item: Pick<WorkItem, "state" | "priority" | "closedAt" | "slaDueAt" | "slaBreached" | "slaAtRisk">,
	now: number = Date.now(),
	settings?: Pick<WorkSettings, "slaHours"> | null,
): SlaStatus {
	if (item.slaBreached) return "breached";
	if (item.slaAtRisk) return "at_risk";
	const due = item.slaDueAt ? Date.parse(item.slaDueAt) : Number.NaN;
	if (!Number.isFinite(due)) return "none";
	const closed = CLOSED_WORK_ITEM_STATES.includes(item.state);
	if (closed) {
		const closedAt = item.closedAt ? Date.parse(item.closedAt) : Number.NaN;
		return Number.isFinite(closedAt) && closedAt > due ? "breached" : "ok";
	}
	// Flags were sent and both false: trust the API.
	if (item.slaBreached === false && item.slaAtRisk === false) return "ok";
	if (now > due) return "breached";
	const hours = slaHoursFor(settings, item.priority);
	if (hours === null) return "ok";
	return due - now < hours * HOUR * 0.25 ? "at_risk" : "ok";
}
