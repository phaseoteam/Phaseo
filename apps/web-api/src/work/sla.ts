import type { WorkSettings, WorkSettingsRow, WorkSlaHours } from "./types";

// SLA due times for work items. Each priority from 1 (urgent) to 4 (low) has a number of hours in
// the workspace's work_settings.sla_hours; priority 0 (none) has no SLA. sla_due_at is set when an
// item is created with a priority or its priority changes, and kept when the item closes so the
// API can tell whether it was resolved in time.

export const DEFAULT_SLA_HOURS: WorkSlaHours = { "1": 4, "2": 24, "3": 72, "4": 168 };
export const MIN_SLA_HOURS = 1;
export const MAX_SLA_HOURS = 2160;
/** An open item is at risk when less than this share of its SLA window is left. */
export const SLA_AT_RISK_SHARE = 0.25;

/** Settings in either shape (API or row); null or undefined means the defaults. */
export type SlaSettingsInput = Pick<WorkSettings, "slaHours"> | Pick<WorkSettingsRow, "sla_hours"> | null | undefined;

function hoursFor(settings: SlaSettingsInput, priority: number): number | null {
	if (!Number.isInteger(priority) || priority < 1 || priority > 4) return null;
	const key = String(priority) as keyof WorkSlaHours;
	const table = settings ? ("slaHours" in settings ? settings.slaHours : settings.sla_hours) : null;
	const value = Number(table?.[key]);
	if (Number.isFinite(value) && value >= MIN_SLA_HOURS && value <= MAX_SLA_HOURS) return value;
	return DEFAULT_SLA_HOURS[key];
}

/**
 * When an item of this priority, starting at `from`, is due under the workspace SLA (ISO string),
 * or null for priority 0 (no SLA) and invalid input.
 */
export function slaDueAt(settings: SlaSettingsInput, priority: number, from: Date | string = new Date()): string | null {
	const hours = hoursFor(settings, priority);
	if (hours == null) return null;
	const start = from instanceof Date ? from.getTime() : Date.parse(from);
	if (!Number.isFinite(start)) return null;
	return new Date(start + hours * 3_600_000).toISOString();
}

export type SlaStatus = { breached: boolean; atRisk: boolean };

/**
 * Whether an item breached its SLA (closed after the due time, or open and past it) or is at risk
 * (open, not breached, with under 25% of its window left). The window runs from `windowStart`
 * (the item's creation time, as the time the SLA was last set is not stored) to the due time.
 */
export function slaStatus(item: { sla_due_at: string | null; closed_at: string | null; created_at: string }, now: Date | string = new Date()): SlaStatus {
	if (!item.sla_due_at) return { breached: false, atRisk: false };
	const due = Date.parse(item.sla_due_at);
	if (!Number.isFinite(due)) return { breached: false, atRisk: false };
	if (item.closed_at) {
		const closed = Date.parse(item.closed_at);
		return { breached: Number.isFinite(closed) && closed > due, atRisk: false };
	}
	const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
	if (nowMs > due) return { breached: true, atRisk: false };
	const start = Date.parse(item.created_at);
	const window = Number.isFinite(start) ? due - start : 0;
	if (window <= 0) return { breached: false, atRisk: false };
	return { breached: false, atRisk: (due - nowMs) / window < SLA_AT_RISK_SHARE };
}
