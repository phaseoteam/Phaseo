// Per-attempt provider health for model pages: reachability, capacity and call
// errors. Rows come from get_v2_model_provider_attempt_health, one per provider
// and service tier with hourly buckets. Customer- and Phaseo-caused attempts are
// excluded from the denominators in SQL; their counts are internal and are never
// published here.

export type AttemptHealthCounts = {
	attempts: number;
	eligibleAttempts: number;
	successAttempts: number;
	reachabilityFailures: number;
	capacityFailures: number;
	callErrorFailures: number;
};

export type AttemptHealthRates = {
	reachabilityPct: number | null;
	capacityPct: number | null;
	callErrorPct: number | null;
	uptimePct: number | null;
};

export type AttemptHealthBucket = AttemptHealthCounts & AttemptHealthRates & { start: string; end: string };

export type ProviderAttemptHealth = AttemptHealthCounts & AttemptHealthRates & {
	providerId: string;
	serviceTier: string;
	providerName: string;
	buckets: AttemptHealthBucket[];
};

const count = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** rate = 1 - failures / eligible attempts; null when nothing was eligible. */
export function attemptHealthRates(counts: AttemptHealthCounts): AttemptHealthRates {
	const eligible = counts.eligibleAttempts;
	if (eligible <= 0) return { reachabilityPct: null, capacityPct: null, callErrorPct: null, uptimePct: null };
	return {
		reachabilityPct: round2((1 - counts.reachabilityFailures / eligible) * 100),
		capacityPct: round2((1 - counts.capacityFailures / eligible) * 100),
		callErrorPct: round2((1 - counts.callErrorFailures / eligible) * 100),
		uptimePct: round2((counts.successAttempts / eligible) * 100),
	};
}

function readCounts(record: Record<string, unknown>): AttemptHealthCounts {
	return {
		attempts: count(record.attempts),
		eligibleAttempts: count(record.eligible_attempts),
		successAttempts: count(record.success_attempts),
		reachabilityFailures: count(record.reachability_failures),
		capacityFailures: count(record.capacity_failures),
		callErrorFailures: count(record.call_error_failures),
	};
}

function emptyCounts(): AttemptHealthCounts {
	return { attempts: 0, eligibleAttempts: 0, successAttempts: 0, reachabilityFailures: 0, capacityFailures: 0, callErrorFailures: 0 };
}

function addCounts(target: AttemptHealthCounts, source: AttemptHealthCounts): void {
	target.attempts += source.attempts;
	target.eligibleAttempts += source.eligibleAttempts;
	target.successAttempts += source.successAttempts;
	target.reachabilityFailures += source.reachabilityFailures;
	target.capacityFailures += source.capacityFailures;
	target.callErrorFailures += source.callErrorFailures;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

function hourKey(value: unknown): string | null {
	const timestamp = Date.parse(String(value ?? ""));
	if (!Number.isFinite(timestamp)) return null;
	const hour = new Date(timestamp);
	hour.setUTCMinutes(0, 0, 0);
	return hour.toISOString();
}

export function normalizeAttemptHealthTier(value: unknown): string {
	const tier = String(value ?? "").trim().toLowerCase();
	if (!tier || tier === "default") return "standard";
	return tier === "fast" ? "priority" : tier;
}

export function parseAttemptHealthRows(data: unknown): ProviderAttemptHealth[] {
	if (!Array.isArray(data)) return [];
	return data.flatMap((value) => {
		if (!isRecord(value)) return [];
		const providerId = String(value.provider_id ?? "").trim();
		if (!providerId) return [];
		const counts = readCounts(value);
		const buckets = (Array.isArray(value.buckets) ? value.buckets : []).flatMap((bucket) => {
			if (!isRecord(bucket)) return [];
			const start = hourKey(bucket.start);
			if (!start) return [];
			const bucketCounts = readCounts(bucket);
			return [{
				start,
				end: new Date(Date.parse(start) + 3_600_000).toISOString(),
				...bucketCounts,
				...attemptHealthRates(bucketCounts),
			}];
		}).sort((a, b) => a.start.localeCompare(b.start));
		return [{
			providerId,
			serviceTier: normalizeAttemptHealthTier(value.service_tier),
			providerName: String(value.provider_name ?? providerId),
			...counts,
			...attemptHealthRates(counts),
			buckets,
		}];
	});
}

/** One provider across service tiers (or several stealth routes under one public id). */
export function combineAttemptHealth(rows: ProviderAttemptHealth[]): (AttemptHealthCounts & AttemptHealthRates & { buckets: AttemptHealthBucket[] }) | null {
	if (!rows.length) return null;
	const totals = emptyCounts();
	const byHour = new Map<string, AttemptHealthCounts>();
	for (const row of rows) {
		addCounts(totals, row);
		for (const bucket of row.buckets) {
			const hour = byHour.get(bucket.start) ?? emptyCounts();
			addCounts(hour, bucket);
			byHour.set(bucket.start, hour);
		}
	}
	const buckets = [...byHour.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([start, counts]) => ({
			start,
			end: new Date(Date.parse(start) + 3_600_000).toISOString(),
			...counts,
			...attemptHealthRates(counts),
		}));
	return { ...totals, ...attemptHealthRates(totals), buckets };
}

/** All providers' attempts per UTC hour: what the model page's uptime chart plots. */
export function attemptHealthByHour(rows: ProviderAttemptHealth[]): Map<string, AttemptHealthCounts & AttemptHealthRates> {
	const byHour = new Map<string, AttemptHealthCounts>();
	for (const row of rows) {
		for (const bucket of row.buckets) {
			const hour = byHour.get(bucket.start) ?? emptyCounts();
			addCounts(hour, bucket);
			byHour.set(bucket.start, hour);
		}
	}
	return new Map([...byHour.entries()].map(([hour, counts]) => [hour, { ...counts, ...attemptHealthRates(counts) }]));
}

/** The /provider-health wire shape (snake_case, like the rows beside it). */
export function attemptHealthToWire(row: ProviderAttemptHealth & { providerId: string; providerName: string }) {
	const wireCounts = (value: AttemptHealthCounts & AttemptHealthRates) => ({
		attempts: value.attempts,
		eligible_attempts: value.eligibleAttempts,
		success_attempts: value.successAttempts,
		reachability_failures: value.reachabilityFailures,
		capacity_failures: value.capacityFailures,
		call_error_failures: value.callErrorFailures,
		reachability_pct: value.reachabilityPct,
		capacity_pct: value.capacityPct,
		call_error_pct: value.callErrorPct,
		uptime_pct: value.uptimePct,
	});
	return {
		provider_id: row.providerId,
		service_tier: row.serviceTier,
		provider_name: row.providerName,
		...wireCounts(row),
		buckets: row.buckets.map((bucket) => ({ start: bucket.start, end: bucket.end, ...wireCounts(bucket) })),
	};
}

export function isMissingAttemptHealthRpcError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
	if (!error) return false;
	const message = String(error.message ?? "");
	return error.code === "PGRST202" ||
		(message.includes("get_v2_model_provider_attempt_health") && /could not find|does not exist/i.test(message));
}
