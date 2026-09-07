export const WEBHOOK_EVENT_OPTIONS = [
	{
		value: "job.created",
		label: "Job created",
		description: "The request was accepted and a job was created.",
	},
	{
		value: "job.status_changed",
		label: "Status changes",
		description: "The job moved between pending, running, and terminal states.",
	},
	{
		value: "job.progress",
		label: "Progress updates",
		description: "The job reached a new progress milestone.",
	},
	{
		value: "job.completed",
		label: "Completed",
		description: "The job finished successfully.",
	},
	{
		value: "job.failed",
		label: "Failed",
		description: "The job could not be completed.",
	},
	{
		value: "job.cancelled",
		label: "Cancelled",
		description: "The job was cancelled before it completed.",
	},
	{
		value: "job.expired",
		label: "Expired",
		description: "The job expired before it completed.",
	},
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENT_OPTIONS)[number]["value"];

export const DEFAULT_WEBHOOK_EVENTS: WebhookEvent[] = [
	"job.status_changed",
	"job.completed",
	"job.failed",
	"job.cancelled",
	"job.expired",
];

const EVENT_LABELS = new Map<string, string>(
	WEBHOOK_EVENT_OPTIONS.map((option) => [option.value, option.label]),
);

export function getWebhookEventLabel(value: string): string {
	const normalized = value.trim().toLowerCase();
	const knownLabel = EVENT_LABELS.get(normalized);
	if (knownLabel) return knownLabel;

	const [, phase] = normalized.split(".");
	if (!phase) return value;
	return phase
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function toCanonicalWebhookEvent(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (normalized.startsWith("video.")) return `job.${normalized.slice("video.".length)}`;
	if (normalized.startsWith("batch.")) return `job.${normalized.slice("batch.".length)}`;
	return normalized;
}

export function normalizeWebhookEvents(values: readonly string[]): string[] {
	return [...new Set(values.map(toCanonicalWebhookEvent).filter(Boolean))];
}
