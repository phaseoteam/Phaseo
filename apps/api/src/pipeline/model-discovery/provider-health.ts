// Purpose: Keep one status row per watched provider and alert when its /models check keeps failing.
// Why: Run summaries keep only counters, so providers failed on every sweep for days without anyone
//      noticing (Cloudflare overnight, AtlasCloud's dropped categories, Pioneer's retired host).
// How: Fold each sweep's outcome into the provider's previous row, alert once a failure streak has lasted
//      an hour, alert again when it ends, and persist all rows with one upsert.

import { getSupabaseAdmin } from "@/runtime/env";
import { deliverPrivateModelDiscoveryMessage } from "./private-model-discovery-notifications";

export type ProviderCheckStatus = "ok" | "skipped" | "error";

export type ProviderCheckOutcome = {
	providerId: string;
	providerName: string;
	status: ProviderCheckStatus;
	reason: string | null;
	modelCount: number | null;
	durationMs: number | null;
	/**
	 * False when a successful check's models were not persisted this sweep (delivery deferred persistence,
	 * or the provider's first check was deferred). It then leaves last_success_at and model_count alone,
	 * because the first-check baseline rule reads them as proof of what was stored.
	 */
	recorded?: boolean;
	/**
	 * Fingerprint of the processed /models response. `undefined` keeps the stored one (the sweep's model
	 * state was not persisted); `null` clears it.
	 */
	payloadFingerprint?: string | null;
};

export type ProviderStatusRow = {
	provider_id: string;
	provider_name: string;
	status: ProviderCheckStatus;
	reason: string | null;
	/** Models listed by the last recorded successful check. */
	model_count: number | null;
	duration_ms: number | null;
	consecutive_failures: number;
	failing_since: string | null;
	/** Set when operators were told the provider is failing; cleared once they are told it stopped. */
	alerted_at: string | null;
	/** A checked provider became skipped and operators have not been told yet. */
	skip_notice_pending: boolean;
	/** Fingerprint of the last /models response whose models were processed and persisted. */
	payload_fingerprint: string | null;
	last_checked_at: string;
	last_success_at: string | null;
	last_run_id: string | null;
};

export type ProviderHealthAlert = { row: ProviderStatusRow; previous: ProviderStatusRow | undefined };

export type ProviderHealthAlerts = {
	failing: ProviderHealthAlert[];
	recovered: ProviderHealthAlert[];
	stoppedChecking: ProviderHealthAlert[];
};

export type ProviderHealthSummary = {
	checked: number;
	failing: number;
	alertsSent: number;
	error?: string | null;
};

export const PROVIDER_FAILURE_ALERT_AFTER_MS = 60 * 60 * 1000;
export const PROVIDER_FAILURE_ALERT_MIN_CHECKS = 3;
const MAX_REASON_LENGTH = 300;
const MAX_MESSAGE_LENGTH = 1_900;
const MAX_ALERT_MESSAGES_PER_SWEEP = 5;
const PROVIDER_STATUS_COLUMNS =
	"provider_id,provider_name,status,reason,model_count,duration_ms,consecutive_failures,failing_since,alerted_at,skip_notice_pending,payload_fingerprint,last_checked_at,last_success_at,last_run_id";
const SECRET_PATTERN = /\b(?:sk|pk|rk|api[_-]?key|key)[-_][A-Za-z0-9_-]{12,}/gi;

/** Removes the provider key and anything shaped like a key from an upstream error before it is stored or posted. */
export function redactProviderError(message: string, apiKey?: string | null): string {
	let redacted = message;
	const secret = apiKey?.trim();
	if (secret && secret.length >= 8) redacted = redacted.split(secret).join("[redacted]");
	return redacted.replace(SECRET_PATTERN, "[redacted]");
}

function truncateReason(reason: string | null): string | null {
	if (!reason) return null;
	const trimmed = reason.trim();
	if (!trimmed) return null;
	return trimmed.length <= MAX_REASON_LENGTH ? trimmed : `${trimmed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

export function nextProviderStatus(
	previous: ProviderStatusRow | undefined,
	outcome: ProviderCheckOutcome,
	args: { nowIso: string; runId: string },
): ProviderStatusRow {
	const failing = outcome.status === "error";
	const recordedSuccess = outcome.status === "ok" && outcome.recorded !== false;
	const continuingStreak = failing && previous?.status === "error";
	return {
		provider_id: outcome.providerId,
		provider_name: outcome.providerName,
		status: outcome.status,
		reason: truncateReason(outcome.reason),
		model_count: recordedSuccess ? outcome.modelCount : previous?.model_count ?? null,
		duration_ms: outcome.durationMs,
		consecutive_failures: failing ? (continuingStreak ? previous.consecutive_failures + 1 : 1) : 0,
		failing_since: failing ? (continuingStreak ? previous.failing_since ?? args.nowIso : args.nowIso) : null,
		// Carried until delivery says otherwise, so an undelivered recovery notice is retried.
		alerted_at: previous?.alerted_at ?? null,
		// A checked provider that becomes skipped (usually a removed key) is noticed once; the flag keeps
		// that notice pending across sweeps until it is delivered.
		skip_notice_pending: outcome.status === "skipped" && (previous?.status === "ok" || previous?.skip_notice_pending === true),
		payload_fingerprint: outcome.status !== "ok"
			? null
			: outcome.payloadFingerprint === undefined
				? previous?.payload_fingerprint ?? null
				: outcome.payloadFingerprint,
		last_checked_at: args.nowIso,
		last_success_at: recordedSuccess ? args.nowIso : previous?.last_success_at ?? null,
		last_run_id: args.runId,
	};
}

export function selectProviderHealthAlerts(
	previousById: ReadonlyMap<string, ProviderStatusRow>,
	rows: ProviderStatusRow[],
	now: Date,
): ProviderHealthAlerts {
	const alerts: ProviderHealthAlerts = { failing: [], recovered: [], stoppedChecking: [] };
	for (const row of rows) {
		const previous = previousById.get(row.provider_id);
		if (row.status === "error") {
			const failingSince = row.failing_since ? Date.parse(row.failing_since) : Number.NaN;
			if (
				!row.alerted_at &&
				row.consecutive_failures >= PROVIDER_FAILURE_ALERT_MIN_CHECKS &&
				Number.isFinite(failingSince) &&
				now.getTime() - failingSince >= PROVIDER_FAILURE_ALERT_AFTER_MS
			) {
				alerts.failing.push({ row, previous });
			}
		} else if (row.status === "ok") {
			if (row.alerted_at) alerts.recovered.push({ row, previous });
		} else if (row.alerted_at || row.skip_notice_pending) {
			// A key removed from the Worker silently stops a provider's checks, so say so once.
			alerts.stoppedChecking.push({ row, previous });
		}
	}
	return alerts;
}

export function hasProviderHealthAlerts(alerts: ProviderHealthAlerts): boolean {
	return alerts.failing.length + alerts.recovered.length + alerts.stoppedChecking.length > 0;
}

function formatDuration(ms: number): string {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	const hours = Math.floor(minutes / 60);
	if (hours === 0) return `${minutes}m`;
	if (hours < 48) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function providerLabel(row: ProviderStatusRow): string {
	return row.provider_name === row.provider_id ? row.provider_id : `${row.provider_name} (${row.provider_id})`;
}

export function buildProviderHealthMessage(alerts: ProviderHealthAlerts, now: Date): string {
	const lines: string[] = ["Model watcher provider checks"];
	if (alerts.failing.length > 0) {
		lines.push("", `Failing for over an hour (${alerts.failing.length}):`);
		for (const { row } of alerts.failing) {
			const since = row.failing_since ? formatDuration(now.getTime() - Date.parse(row.failing_since)) : "?";
			lines.push(`- ${providerLabel(row)}: ${row.consecutive_failures} failed checks over ${since}. ${row.reason ?? "No error message."}`);
		}
	}
	if (alerts.recovered.length > 0) {
		lines.push("", `Recovered (${alerts.recovered.length}):`);
		for (const { row, previous } of alerts.recovered) {
			const since = previous?.failing_since ? ` after ${formatDuration(now.getTime() - Date.parse(previous.failing_since))}` : "";
			lines.push(`- ${providerLabel(row)}: checking again${since}, ${row.model_count ?? 0} models.`);
		}
	}
	if (alerts.stoppedChecking.length > 0) {
		lines.push("", `No longer checked (${alerts.stoppedChecking.length}):`);
		for (const { row } of alerts.stoppedChecking) {
			lines.push(`- ${providerLabel(row)}: ${row.reason ?? "skipped"}`);
		}
	}
	return lines.join("\n");
}

/**
 * Splits alerts into messages that each fit Discord's limit, so no alert is acknowledged without being
 * shown. Each batch keeps the alerts it contains, so only delivered batches are acknowledged.
 */
export function batchProviderHealthAlerts(
	alerts: ProviderHealthAlerts,
	now: Date,
): Array<{ text: string; alerts: ProviderHealthAlerts }> {
	const entries = [
		...alerts.failing.map((alert) => ({ kind: "failing" as const, alert })),
		...alerts.recovered.map((alert) => ({ kind: "recovered" as const, alert })),
		...alerts.stoppedChecking.map((alert) => ({ kind: "stoppedChecking" as const, alert })),
	];
	const batches: Array<{ text: string; alerts: ProviderHealthAlerts }> = [];
	let current: ProviderHealthAlerts = { failing: [], recovered: [], stoppedChecking: [] };
	for (const { kind, alert } of entries) {
		const candidate: ProviderHealthAlerts = { ...current, [kind]: [...current[kind], alert] };
		if (hasProviderHealthAlerts(current) && buildProviderHealthMessage(candidate, now).length > MAX_MESSAGE_LENGTH) {
			batches.push({ text: buildProviderHealthMessage(current, now), alerts: current });
			current = { failing: [], recovered: [], stoppedChecking: [], [kind]: [alert] };
		} else {
			current = candidate;
		}
	}
	if (hasProviderHealthAlerts(current)) batches.push({ text: buildProviderHealthMessage(current, now), alerts: current });
	return batches;
}

export async function loadProviderStatuses(): Promise<Map<string, ProviderStatusRow>> {
	const { data, error } = await getSupabaseAdmin()
		.from("model_discovery_provider_status")
		.select(PROVIDER_STATUS_COLUMNS);
	if (error) throw new Error(error.message || "Failed to load model discovery provider status");
	return new Map(((data ?? []) as ProviderStatusRow[]).map((row) => [row.provider_id, row]));
}

async function saveProviderStatuses(rows: ProviderStatusRow[]): Promise<void> {
	if (rows.length === 0) return;
	const { error } = await getSupabaseAdmin()
		.from("model_discovery_provider_status")
		.upsert(rows, { onConflict: "provider_id" });
	if (error) throw new Error(error.message || "Failed to save model discovery provider status");
}

async function deleteUnwatchedProviderStatuses(previousById: ReadonlyMap<string, ProviderStatusRow>, watchedIds: Set<string>): Promise<void> {
	const unwatched = [...previousById.keys()].filter((providerId) => !watchedIds.has(providerId));
	if (unwatched.length === 0) return;
	const { error } = await getSupabaseAdmin()
		.from("model_discovery_provider_status")
		.delete()
		.in("provider_id", unwatched);
	if (error) throw new Error(error.message || "Failed to remove unwatched model discovery providers");
}

/**
 * Records this sweep's provider outcomes and sends any failure, recovery or stopped-checking alert.
 * A failed delivery leaves `alerted_at` unchanged so the next sweep retries it.
 */
export async function runProviderHealthCheck(args: {
	runId: string;
	outcomes: ProviderCheckOutcome[];
	notify: boolean;
	/** True when the sweep covered every watched provider, so rows for removed providers can go. */
	coversAllProviders: boolean;
	/** Rows the sweep already loaded before checking providers; loaded here when absent. */
	previousById?: ReadonlyMap<string, ProviderStatusRow>;
	now?: Date;
}): Promise<ProviderHealthSummary> {
	const now = args.now ?? new Date();
	const nowIso = now.toISOString();
	const previousById = args.previousById ?? await loadProviderStatuses();
	const rows = args.outcomes.map((outcome) =>
		nextProviderStatus(previousById.get(outcome.providerId), outcome, { nowIso, runId: args.runId }),
	);
	const alerts = selectProviderHealthAlerts(previousById, rows, now);
	let alertsSent = 0;
	let deliveryError: string | null = null;

	if (args.notify && hasProviderHealthAlerts(alerts)) {
		// Bounded per sweep; alerts in batches not sent stay pending and go out on a later sweep.
		for (const batch of batchProviderHealthAlerts(alerts, now).slice(0, MAX_ALERT_MESSAGES_PER_SWEEP)) {
			try {
				const delivery = await deliverPrivateModelDiscoveryMessage(batch.text);
				deliveryError ??= delivery.error ?? null;
				// A skipped delivery (no webhook configured) is not an error; it simply retries next sweep.
				if (!delivery.delivered) break;
				for (const { row } of batch.alerts.failing) row.alerted_at = nowIso;
				for (const { row } of batch.alerts.recovered) row.alerted_at = null;
				for (const { row } of batch.alerts.stoppedChecking) {
					row.alerted_at = null;
					row.skip_notice_pending = false;
				}
				alertsSent += batch.alerts.failing.length + batch.alerts.recovered.length + batch.alerts.stoppedChecking.length;
			} catch (error) {
				deliveryError = error instanceof Error ? error.message : String(error);
				break;
			}
		}
	}

	await saveProviderStatuses(rows);
	if (args.coversAllProviders) {
		await deleteUnwatchedProviderStatuses(previousById, new Set(rows.map((row) => row.provider_id)));
	}

	return {
		checked: rows.length,
		failing: rows.filter((row) => row.status === "error").length,
		alertsSent,
		error: deliveryError ? `Provider health alert not delivered: ${deliveryError}` : null,
	};
}
