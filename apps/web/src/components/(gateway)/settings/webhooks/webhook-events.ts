const WEBHOOK_PHASE_OPTIONS = [
	{ phase: "created", label: "Created", description: "The request was accepted and the job was created." },
	{ phase: "status_changed", label: "Status changes", description: "The job moved between lifecycle states." },
	{ phase: "progress", label: "Progress updates", description: "The job reached a new progress milestone." },
	{ phase: "completed", label: "Completed", description: "The job finished successfully." },
	{ phase: "failed", label: "Failed", description: "The job could not be completed." },
	{ phase: "cancelled", label: "Cancelled", description: "The job was cancelled before it completed." },
	{ phase: "expired", label: "Expired", description: "The job expired before it completed." },
] as const;

export type WebhookPhase = (typeof WEBHOOK_PHASE_OPTIONS)[number]["phase"];
export type WebhookEvent = `${"batch" | "video"}.${WebhookPhase}`;

export const WEBHOOK_EVENT_GROUPS = ([
	{ kind: "batch", label: "Batch events", description: "Updates from Batch API jobs." },
	{ kind: "video", label: "Video events", description: "Updates from Video API jobs." },
] as const).map((group) => ({
	...group,
	options: WEBHOOK_PHASE_OPTIONS.map((option) => ({
		...option,
		value: `${group.kind}.${option.phase}` as WebhookEvent,
	})),
}));

export const WEBHOOK_EVENT_OPTIONS = WEBHOOK_EVENT_GROUPS.flatMap((group) => group.options);

export const DEFAULT_WEBHOOK_EVENTS: WebhookEvent[] = WEBHOOK_EVENT_OPTIONS
	.filter((option) => option.phase !== "created" && option.phase !== "progress")
	.map((option) => option.value);

const EVENT_LABELS = new Map<string, string>(
	WEBHOOK_EVENT_GROUPS.flatMap((group) =>
		group.options.map((option) => [option.value, `${group.kind === "batch" ? "Batch" : "Video"}: ${option.label}`] as const),
	),
);

export function getWebhookEventLabel(value: string): string {
	const normalized = value.trim().toLowerCase();
	const knownLabel = EVENT_LABELS.get(normalized);
	if (knownLabel) return knownLabel;

	const [kind, phase] = normalized.split(".");
	if (!phase) return value;
	const phaseLabel = phase.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
	return kind === "job" ? `All jobs: ${phaseLabel}` : phaseLabel;
}

export function expandGenericWebhookEvents(values: readonly string[]): string[] {
	return [...new Set(values.flatMap((value) => {
		const normalized = value.trim().toLowerCase();
		if (!normalized.startsWith("job.")) return normalized ? [normalized] : [];
		const phase = normalized.slice("job.".length);
		return [`batch.${phase}`, `video.${phase}`];
	}))];
}

export function getWebhookEventsForUpdate(
	mode: "create" | "edit",
	values: readonly string[],
	selectionChanged: boolean,
): string[] | undefined {
	if (mode === "edit" && !selectionChanged) return undefined;
	return [...values];
}
