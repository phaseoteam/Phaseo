import { formatRoomError } from "@/lib/chat/formatRoomError";

type GuardrailEnforcementBucketUnit = "5min" | "hour" | "day" | "month";

export type GuardrailEnforcementEventRow = {
	createdAt: string;
	errorPayload?: Record<string, unknown> | null;
	errorMessage?: string | null;
};

export type GuardrailEnforcementBucket = {
	bucket: string;
	label: string;
	blocked: number;
	redacted: number;
	flagged: number;
	total: number;
};

export type GuardrailEnforcementMetricsResult = {
	totals: {
		blocked: number;
		redacted: number;
		flagged: number;
	};
	buckets: GuardrailEnforcementBucket[];
	topGuardrails: Array<{
		id: string;
		count: number;
	}>;
	signalsRecorded: {
		blocked: boolean;
		redacted: boolean;
		flagged: boolean;
	};
};

export type GuardrailSignalSummary = {
	blocked: boolean;
	redacted: boolean;
	flagged: boolean;
	guardrailIds: string[];
};

function normalizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
		.filter(Boolean);
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function normalizeBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value > 0;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return ["1", "true", "yes", "on", "blocked", "flagged", "redacted"].includes(
			normalized,
		);
	}
	return false;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readGuardrailEnforcementPayload(
	value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	if (!value) return null;
	return (
		readRecord(value.guardrail_enforcement) ??
		readRecord(value.guardrailEnforcement) ??
		readRecord(value.enforcement)
	);
}

export function extractGuardrailSignals(
	row: GuardrailEnforcementEventRow,
): GuardrailSignalSummary {
	const formatted = row.errorPayload
		? formatRoomError(JSON.stringify(row.errorPayload))
		: row.errorMessage?.trim()
			? formatRoomError(row.errorMessage)
			: null;
	const workspacePolicy = formatted?.routingDiagnostics?.workspacePolicy;
	const enforcement = readGuardrailEnforcementPayload(row.errorPayload ?? null);
	const actions = normalizeStringList(
		enforcement?.actions ?? enforcement?.outcomes ?? enforcement?.decisions,
	).map((action) => action.toLowerCase());
	const enforcementGuardrailIds = normalizeStringList(
		enforcement?.guardrail_ids ?? enforcement?.guardrailIds,
	);
	const blocked =
		Boolean(workspacePolicy) ||
		actions.includes("block") ||
		normalizeBoolean(enforcement?.blocked) ||
		String(enforcement?.decision ?? "")
			.trim()
			.toLowerCase() === "block";
	const redacted =
		actions.includes("redact") ||
		normalizeBoolean(enforcement?.redacted) ||
		(toFiniteNumber(enforcement?.redaction_count ?? enforcement?.redacted_count) ?? 0) >
			0;
	const flagged =
		actions.includes("flag") ||
		actions.includes("review") ||
		normalizeBoolean(enforcement?.flagged) ||
		normalizeBoolean(enforcement?.needs_review) ||
		normalizeBoolean(enforcement?.needsReview);
	const guardrailIds = Array.from(
		new Set([
			...(workspacePolicy?.activeGuardrailIds ?? []),
			...enforcementGuardrailIds,
		]),
	);

	return {
		blocked,
		redacted,
		flagged,
		guardrailIds,
	};
}

function bucketUnitForRange(
	range: "1h" | "1d" | "1w" | "1m" | "1y",
): GuardrailEnforcementBucketUnit {
	if (range === "1h") return "5min";
	if (range === "1d") return "hour";
	if (range === "1y") return "month";
	return "day";
}

function floorToBucket(date: Date, unit: GuardrailEnforcementBucketUnit): Date {
	const next = new Date(date);
	if (unit === "5min") {
		next.setSeconds(0, 0);
		next.setMinutes(Math.floor(next.getMinutes() / 5) * 5);
		return next;
	}
	if (unit === "hour") {
		next.setMinutes(0, 0, 0);
		return next;
	}
	if (unit === "day") {
		next.setHours(0, 0, 0, 0);
		return next;
	}
	next.setDate(1);
	next.setHours(0, 0, 0, 0);
	return next;
}

function incrementBucket(
	date: Date,
	unit: GuardrailEnforcementBucketUnit,
): Date {
	const next = new Date(date);
	if (unit === "5min") {
		next.setMinutes(next.getMinutes() + 5);
		return next;
	}
	if (unit === "hour") {
		next.setHours(next.getHours() + 1);
		return next;
	}
	if (unit === "day") {
		next.setDate(next.getDate() + 1);
		return next;
	}
	next.setMonth(next.getMonth() + 1);
	return next;
}

function formatBucketLabel(
	date: Date,
	unit: GuardrailEnforcementBucketUnit,
): string {
	if (unit === "5min") {
		return new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	}
	if (unit === "hour") {
		return new Intl.DateTimeFormat("en-GB", {
			day: "numeric",
			month: "short",
			hour: "2-digit",
		}).format(date);
	}
	if (unit === "day") {
		return new Intl.DateTimeFormat("en-GB", {
			day: "numeric",
			month: "short",
		}).format(date);
	}
	return new Intl.DateTimeFormat("en-GB", {
		month: "short",
		year: "numeric",
	}).format(date);
}

function buildEmptyBuckets(args: {
	from: string;
	to: string;
	range: "1h" | "1d" | "1w" | "1m" | "1y";
}): GuardrailEnforcementBucket[] {
	const from = new Date(args.from);
	const to = new Date(args.to);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
		return [];
	}

	const unit = bucketUnitForRange(args.range);
	const buckets: GuardrailEnforcementBucket[] = [];
	for (
		let cursor = floorToBucket(from, unit);
		cursor <= to;
		cursor = incrementBucket(cursor, unit)
	) {
		buckets.push({
			bucket: cursor.toISOString(),
			label: formatBucketLabel(cursor, unit),
			blocked: 0,
			redacted: 0,
			flagged: 0,
			total: 0,
		});
	}
	return buckets;
}

export function buildGuardrailEnforcementMetrics(args: {
	rows: GuardrailEnforcementEventRow[];
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
}): GuardrailEnforcementMetricsResult {
	const buckets = buildEmptyBuckets({
		from: args.timeRange.from,
		to: args.timeRange.to,
		range: args.range,
	});
	const bucketMap = new Map(
		buckets.map((bucket) => [bucket.bucket, bucket] as const),
	);
	const guardrailCounts = new Map<string, number>();
	const totals = {
		blocked: 0,
		redacted: 0,
		flagged: 0,
	};
	const signalsRecorded = {
		blocked: false,
		redacted: false,
		flagged: false,
	};
	const bucketUnit = bucketUnitForRange(args.range);

	for (const row of args.rows) {
		const signals = extractGuardrailSignals(row);
		if (!signals.blocked && !signals.redacted && !signals.flagged) continue;

		const createdAt = new Date(row.createdAt);
		if (Number.isNaN(createdAt.getTime())) continue;
		const bucketKey = floorToBucket(createdAt, bucketUnit).toISOString();
		const bucket = bucketMap.get(bucketKey);
		if (!bucket) continue;

		if (signals.blocked) {
			totals.blocked += 1;
			bucket.blocked += 1;
			signalsRecorded.blocked = true;
		}
		if (signals.redacted) {
			totals.redacted += 1;
			bucket.redacted += 1;
			signalsRecorded.redacted = true;
		}
		if (signals.flagged) {
			totals.flagged += 1;
			bucket.flagged += 1;
			signalsRecorded.flagged = true;
		}

		const totalForRow =
			(signals.blocked ? 1 : 0) +
			(signals.redacted ? 1 : 0) +
			(signals.flagged ? 1 : 0);
		bucket.total += totalForRow;

		if (totalForRow > 0) {
			for (const guardrailId of signals.guardrailIds) {
				guardrailCounts.set(
					guardrailId,
					(guardrailCounts.get(guardrailId) ?? 0) + 1,
				);
			}
		}
	}

	return {
		totals,
		buckets,
		topGuardrails: Array.from(guardrailCounts.entries())
			.map(([id, count]) => ({ id, count }))
			.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
			.slice(0, 6),
		signalsRecorded,
	};
}
