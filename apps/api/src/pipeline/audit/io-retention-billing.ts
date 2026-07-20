import { getBindings, getSupabaseAdmin } from "@/runtime/env";

type WorkspaceRetentionRow = {
	workspace_id: string;
	io_logging_enabled: boolean | null;
	io_logging_retention_days: number | string | null;
	io_logging_billing_status: string | null;
	io_logging_grace_until: string | null;
	io_logging_last_billing_warning_at: string | null;
	io_logging_last_billing_warning_kind: string | null;
	io_logging_price_per_million_units_nanos: number | string | null;
};

type RetentionUsageSnapshot = {
	event_units: number | string | null;
	billable_bytes: number | string | null;
	object_count: number | string | null;
};

type RetentionChargeResult = {
	status: string | null;
	amount_nanos: number | string | null;
	before_balance_nanos: number | string | null;
	after_balance_nanos: number | string | null;
	grace_until: string | null;
};

export type GatewayIoRetentionBillingSummary = {
	processed: number;
	charged: number;
	grace: number;
	suspended: number;
	skipped: number;
	prunedObjects: number;
	warningsQueued: number;
	failed: number;
};

const INCLUDED_RETENTION_DAYS = 90;
const EVENT_UNIT_BYTES = 64 * 1024;
const DEFAULT_PRICE_PER_MILLION_UNITS_NANOS = 0;
const DEFAULT_GRACE_DAYS = 14;
const DEFAULT_LIMIT = 100;
const DEFAULT_PRUNE_LIMIT = 250;
const DAYS_PER_MONTH = 30.4375;
const TARGET_MARGIN_BPS = 2500;
const R2_STANDARD_STORAGE_NANOS_PER_GB_MONTH = 15_000_000;
const R2_CLASS_A_NANOS_PER_MILLION_WRITES = 4_500_000_000;

function toInt(value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function toFiniteNumber(value: unknown, fallback = 0): number {
	const parsed = Number(value ?? "");
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateStringUtc(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): string {
	const next = new Date(date.getTime());
	next.setUTCDate(next.getUTCDate() - days);
	return next.toISOString();
}

function ceilDiv(a: bigint, b: bigint): bigint {
	return (a + b - 1n) / b;
}

function deriveDefaultPricePerMillionUnitsNanos(retentionDays: unknown): number {
	const normalizedRetentionDays = toInt(retentionDays, 90, 30, 365);
	const storageGbPerMillionUnits = (EVENT_UNIT_BYTES * 1_000_000) / 1_000_000_000;
	const storageCostNanos = Math.ceil(
		storageGbPerMillionUnits * R2_STANDARD_STORAGE_NANOS_PER_GB_MONTH,
	);
	const amortizedWriteCostNanos = Math.ceil(
		(R2_CLASS_A_NANOS_PER_MILLION_WRITES * DAYS_PER_MONTH) / normalizedRetentionDays,
	);
	const targetCostRatio = (10_000 - TARGET_MARGIN_BPS) / 10_000;
	return Math.ceil((storageCostNanos + amortizedWriteCostNanos) / targetCostRatio);
}

function calculateDailyRetentionCostNanos(args: {
	eventUnits: number;
	pricePerMillionUnitsNanos: number;
}): number {
	if (args.eventUnits <= 0 || args.pricePerMillionUnitsNanos <= 0) return 0;
	const monthlyNanos = ceilDiv(
		BigInt(Math.trunc(args.eventUnits)) * BigInt(Math.trunc(args.pricePerMillionUnitsNanos)),
		1_000_000n,
	);
	const dailyNanos = ceilDiv(monthlyNanos * 10_000n, 304_375n);
	const capped = dailyNanos > BigInt(Number.MAX_SAFE_INTEGER)
		? BigInt(Number.MAX_SAFE_INTEGER)
		: dailyNanos;
	return Number(capped);
}

function shouldQueueWarning(row: WorkspaceRetentionRow, kind: "grace" | "suspended", now: Date): boolean {
	if (row.io_logging_last_billing_warning_kind !== kind) return true;
	const lastSentMs = row.io_logging_last_billing_warning_at
		? Date.parse(row.io_logging_last_billing_warning_at)
		: NaN;
	if (!Number.isFinite(lastSentMs)) return true;
	return now.getTime() - lastSentMs >= 7 * 24 * 60 * 60 * 1000;
}

function deriveFirstNameFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
	if (!metadata) return "there";
	for (const value of [metadata.first_name, metadata.given_name, metadata.full_name, metadata.name]) {
		const normalized = String(value ?? "").trim();
		if (normalized) return normalized.split(/\s+/)[0] ?? "there";
	}
	return "there";
}

async function enqueueRetentionWarning(args: {
	workspace: WorkspaceRetentionRow;
	kind: "grace" | "suspended";
	amountNanos: number;
	eventUnits: number;
	billableBytes: number;
	graceUntil: string | null;
	now: Date;
}): Promise<boolean> {
	if (!shouldQueueWarning(args.workspace, args.kind, args.now)) return false;

	const supabase = getSupabaseAdmin();
	const { data: workspaceRow } = await supabase
		.from("workspaces")
		.select("id,name,owner_user_id")
		.eq("id", args.workspace.workspace_id)
		.maybeSingle();

	const ownerUserId = (workspaceRow as any)?.owner_user_id ?? null;
	if (!ownerUserId) return false;

	let ownerEmail: string | null = null;
	let ownerMetadata: Record<string, unknown> | null = null;
	try {
		const userRes = await (supabase as any).auth.admin.getUserById(ownerUserId);
		ownerEmail = userRes?.data?.user?.email ?? null;
		ownerMetadata = (userRes?.data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
	} catch {
		ownerEmail = null;
		ownerMetadata = null;
	}
	if (!ownerEmail) return false;

	const workspaceName =
		typeof (workspaceRow as any)?.name === "string" && (workspaceRow as any).name.trim()
			? (workspaceRow as any).name.trim()
			: "your workspace";
	const subject =
		args.kind === "grace"
			? "I/O log retention billing paused"
			: "I/O log extended retention suspended";

	const { error } = await supabase.from("email_outbox").insert({
		kind: `io_retention_${args.kind}`,
		template: `io_retention_${args.kind}`,
		to_email: ownerEmail,
		subject,
		workspace_id: args.workspace.workspace_id,
		user_id: ownerUserId,
		payload: {
			user_first_name: deriveFirstNameFromMetadata(ownerMetadata),
			workspace_id: args.workspace.workspace_id,
			workspace_name: workspaceName,
			amount_nanos: args.amountNanos,
			amount_usd: Number((args.amountNanos / 1_000_000_000).toFixed(4)),
			event_units: args.eventUnits,
			billable_bytes: args.billableBytes,
			retention_days: toInt(args.workspace.io_logging_retention_days, 90, 30, 365),
			grace_until: args.graceUntil,
		},
	} as any);

	if (error) {
		console.warn("[io-retention] failed to enqueue warning", {
			workspaceId: args.workspace.workspace_id,
			kind: args.kind,
			error: error.message,
		});
		return false;
	}

	await supabase
		.from("workspace_settings")
		.update({
			io_logging_last_billing_warning_at: args.now.toISOString(),
			io_logging_last_billing_warning_kind: args.kind,
			updated_at: args.now.toISOString(),
		} as any)
		.eq("workspace_id", args.workspace.workspace_id);

	return true;
}

async function pruneSuspendedExtendedRetention(args: {
	workspaceId: string;
	asOf: Date;
	limit: number;
}): Promise<number> {
	const bucket = getBindings().GATEWAY_IO_LOGS_BUCKET;
	if (!bucket) return 0;

	const supabase = getSupabaseAdmin();
	const cutoff = subtractDays(args.asOf, INCLUDED_RETENTION_DAYS);
	const { data, error } = await supabase
		.from("gateway_io_logs")
		.select("id,io_log_object_key")
		.eq("workspace_id", args.workspaceId)
		.eq("io_log_status", "stored")
		.not("io_log_object_key", "is", null)
		.lt("created_at", cutoff)
		.order("created_at", { ascending: true })
		.limit(args.limit);

	if (error) {
		throw new Error(`io_retention_prune_select_error:${error.message ?? "unknown"}`);
	}

	const rows = (data ?? []) as Array<{ id: string; io_log_object_key: string | null }>;
	let deleted = 0;
	const deletedIds: string[] = [];
	for (const row of rows) {
		if (!row.io_log_object_key) continue;
		try {
			await bucket.delete(row.io_log_object_key);
			deleted += 1;
			deletedIds.push(row.id);
		} catch (error) {
			console.warn("[io-retention] failed to delete R2 object", {
				workspaceId: args.workspaceId,
				objectKey: row.io_log_object_key,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	if (deletedIds.length > 0) {
		await supabase
			.from("gateway_io_logs")
			.update({
				io_log_status: "deleted",
				io_log_error: "extended_retention_suspended",
				io_log_retention_until: args.asOf.toISOString(),
			} as any)
			.in("id", deletedIds);
	}

	return deleted;
}

export async function runGatewayIoRetentionBillingJob(options?: {
	asOf?: Date;
	limit?: number;
	graceDays?: number;
	pricePerMillionUnitsNanos?: number;
	pruneLimit?: number;
}): Promise<GatewayIoRetentionBillingSummary> {
	const bindings = getBindings();
	const asOf = options?.asOf ?? new Date();
	const limit = options?.limit ?? toInt(bindings.GATEWAY_IO_RETENTION_BILLING_LIMIT, DEFAULT_LIMIT, 1, 1000);
	const graceDays = options?.graceDays ?? toInt(bindings.GATEWAY_IO_RETENTION_GRACE_DAYS, DEFAULT_GRACE_DAYS, 1, 90);
	const configuredPrice = options?.pricePerMillionUnitsNanos ?? toInt(
		bindings.GATEWAY_IO_RETENTION_PRICE_PER_MILLION_UNITS_NANOS,
		DEFAULT_PRICE_PER_MILLION_UNITS_NANOS,
		0,
	);
	const pruneLimit = options?.pruneLimit ?? toInt(
		bindings.GATEWAY_IO_RETENTION_PRUNE_LIMIT,
		DEFAULT_PRUNE_LIMIT,
		1,
		5000,
	);
	const supabase = getSupabaseAdmin();
	const summary: GatewayIoRetentionBillingSummary = {
		processed: 0,
		charged: 0,
		grace: 0,
		suspended: 0,
		skipped: 0,
		prunedObjects: 0,
		warningsQueued: 0,
		failed: 0,
	};

	const { data, error } = await supabase
		.from("workspace_settings")
		.select("workspace_id,io_logging_enabled,io_logging_retention_days,io_logging_billing_status,io_logging_grace_until,io_logging_last_billing_warning_at,io_logging_last_billing_warning_kind,io_logging_price_per_million_units_nanos")
		.eq("io_logging_enabled", true)
		.gt("io_logging_retention_days", INCLUDED_RETENTION_DAYS)
		.order("io_logging_last_billed_at", { ascending: true, nullsFirst: true })
		.limit(limit);

	if (error) {
		throw new Error(`io_retention_workspace_fetch_error:${error.message ?? "unknown"}`);
	}

	const workspaces = (data ?? []) as WorkspaceRetentionRow[];
	for (const workspace of workspaces) {
		summary.processed += 1;
		try {
			const { data: usageData, error: usageError } = await supabase.rpc(
				"gateway_io_retention_usage_snapshot",
				{
					p_workspace_id: workspace.workspace_id,
					p_as_of: asOf.toISOString(),
					p_included_days: INCLUDED_RETENTION_DAYS,
					p_event_unit_bytes: EVENT_UNIT_BYTES,
				},
			);
			if (usageError) throw usageError;
			const usage = (Array.isArray(usageData) ? usageData[0] : usageData) as RetentionUsageSnapshot | null;
			const eventUnits = Math.max(0, toFiniteNumber(usage?.event_units));
			const billableBytes = Math.max(0, toFiniteNumber(usage?.billable_bytes));
			const objectCount = Math.max(0, toFiniteNumber(usage?.object_count));
			const rowPrice = toFiniteNumber(workspace.io_logging_price_per_million_units_nanos);
			const pricePerMillion =
				rowPrice > 0
					? rowPrice
					: configuredPrice > 0
						? configuredPrice
						: deriveDefaultPricePerMillionUnitsNanos(workspace.io_logging_retention_days);
			const amountNanos = calculateDailyRetentionCostNanos({
				eventUnits,
				pricePerMillionUnitsNanos: pricePerMillion,
			});

			const { data: chargeData, error: chargeError } = await supabase.rpc(
				"gateway_io_retention_charge_once",
				{
					p_workspace_id: workspace.workspace_id,
					p_billing_date: toDateStringUtc(asOf),
					p_amount_nanos: amountNanos,
					p_event_units: Math.trunc(eventUnits),
					p_billable_bytes: Math.trunc(billableBytes),
					p_object_count: Math.trunc(objectCount),
					p_grace_days: graceDays,
				},
			);
			if (chargeError) throw chargeError;

			const charge = (Array.isArray(chargeData) ? chargeData[0] : chargeData) as RetentionChargeResult | null;
			const status = String(charge?.status ?? "skipped");
			if (status === "charged" || status === "already_charged") {
				summary.charged += 1;
			} else if (status === "grace") {
				summary.grace += 1;
				const queued = await enqueueRetentionWarning({
					workspace,
					kind: "grace",
					amountNanos,
					eventUnits,
					billableBytes,
					graceUntil: charge?.grace_until ?? null,
					now: asOf,
				});
				if (queued) summary.warningsQueued += 1;
			} else if (status === "suspended") {
				summary.suspended += 1;
				const queued = await enqueueRetentionWarning({
					workspace,
					kind: "suspended",
					amountNanos,
					eventUnits,
					billableBytes,
					graceUntil: charge?.grace_until ?? null,
					now: asOf,
				});
				if (queued) summary.warningsQueued += 1;
				summary.prunedObjects += await pruneSuspendedExtendedRetention({
					workspaceId: workspace.workspace_id,
					asOf,
					limit: pruneLimit,
				});
			} else {
				summary.skipped += 1;
			}
		} catch (error) {
			summary.failed += 1;
			console.error("[io-retention] billing workspace failed", {
				workspaceId: workspace.workspace_id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return summary;
}
