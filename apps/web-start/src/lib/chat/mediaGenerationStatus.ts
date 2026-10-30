export type MediaGenerationStatus = "pending" | "completed" | "failed";

const COMPLETED_STATUSES = new Set([
	"completed",
	"complete",
	"succeeded",
	"success",
	"done",
	"finished",
]);

const FAILED_STATUSES = new Set([
	"failed",
	"fail",
	"error",
	"cancelled",
	"canceled",
	"expired",
]);

const PENDING_STATUSES = new Set([
	"queued",
	"pending",
	"in_progress",
	"processing",
	"running",
	"submitted",
	"created",
]);

export function normalizeMediaGenerationStatus(
	value: unknown,
): MediaGenerationStatus | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	if (COMPLETED_STATUSES.has(normalized)) return "completed";
	if (FAILED_STATUSES.has(normalized)) return "failed";
	if (PENDING_STATUSES.has(normalized)) return "pending";
	return null;
}

export function toMediaEntryStatus(args: {
	rawStatus: unknown;
	hasUrls: boolean;
}): MediaGenerationStatus {
	if (args.hasUrls) return "completed";
	return normalizeMediaGenerationStatus(args.rawStatus) ?? "pending";
}

