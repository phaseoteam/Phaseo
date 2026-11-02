import { MONEY_LOCALE } from "@/lib/displayPreferences";
import { CLOSED_WORK_ITEM_STATES, type WorkErrorFrame, type WorkItemState } from "./types";

const NANOS_PER_USD = 1_000_000_000;

/** Agent run cost in US format: "$0.0042" under a cent, "$12.50" above it. */
export function formatCostNanos(nanos: number | string | null | undefined): string {
	const value = Number(nanos ?? 0);
	const usd = Number.isFinite(value) ? value / NANOS_PER_USD : 0;
	const digits = usd > 0 && usd < 0.01 ? 4 : 2;
	return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(usd);
}

export function isClosedState(state: WorkItemState): boolean {
	return CLOSED_WORK_ITEM_STATES.includes(state);
}

/** "acme/api" when the value is a valid GitHub owner/name pair, else null. */
export function normaliseGithubRepo(value: string): string | null {
	const repo = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
	return /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo) ? repo : null;
}

/** Labels typed as "bug, billing api" become ["bug", "billing-api"]: short, lowercase and unique. */
export function parseLabels(value: string): string[] {
	const labels = value
		.split(",")
		.map((label) => label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40))
		.filter(Boolean);
	return [...new Set(labels)].slice(0, 20);
}

/** Item numbers typed as "#42", "42" or "PHA-42" style references. */
export function parseItemNumber(value: string): number | null {
	const match = value.trim().match(/^(?:[a-z]+-)?#?(\d{1,9})$/i);
	if (!match) return null;
	const number = Number(match[1]);
	return number > 0 ? number : null;
}

function readFrame(value: unknown): WorkErrorFrame | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	const text = (key: string) => (typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : undefined);
	const number = (key: string) => (typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : undefined);
	const frame: WorkErrorFrame = { function: text("function"), file: text("file"), line: number("line"), column: number("column"), inApp: typeof raw.inApp === "boolean" ? raw.inApp : undefined };
	return frame.function || frame.file ? frame : null;
}

/** The frames stored with an error group's last sample event, top of the stack first. */
export function sampleFrames(event: Record<string, unknown> | null | undefined, limit = 50): WorkErrorFrame[] {
	const frames = Array.isArray(event?.frames) ? event.frames : [];
	return frames.map(readFrame).filter((frame): frame is WorkErrorFrame => frame !== null).slice(0, limit);
}

/** A string field from a sample event, such as url or userAgent. */
export function sampleText(event: Record<string, unknown> | null | undefined, key: string): string | null {
	const value = event?.[key];
	return typeof value === "string" && value.trim() ? value : null;
}

export function frameLocation(frame: WorkErrorFrame): string {
	const position = [frame.line, frame.column].filter((part) => part !== undefined).join(":");
	return [frame.file ?? "", position].filter(Boolean).join(":");
}
