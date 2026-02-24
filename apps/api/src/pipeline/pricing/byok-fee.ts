import { getSupabaseAdmin } from "@/runtime/env";
import { formatUsdFromNanosExact } from "./money";

const NANOS_PER_CENT = 10_000_000;
const COUNTER_RPC_MAX_ATTEMPTS = 3;
const COUNTER_RPC_RETRY_BASE_MS = 25;

export const BYOK_MONTHLY_FREE_REQUESTS = 100_000;
export const BYOK_SERVICE_FEE_RATE = 0.035;

type ByokCounterRow = {
	month_start?: string | null;
	request_count?: number | string | null;
};

type ByokFeeArgs = {
	teamId: string;
	isByok: boolean;
	baseCostNanos: number;
	pricedUsage: any;
	currencyHint?: string;
};

type ByokFeeResult = {
	pricedUsage: any;
	totalNanos: number;
	totalCents: number;
	currency: string;
	byokFeeNanos: number;
	byokMonthlyRequestCount: number | null;
	byokFreeRequestsRemaining: number | null;
};

type ByokCounterResolution = {
	requestCount: number | null;
	monthStart: string | null;
	source: "rpc" | "fallback_read" | "unavailable";
};

function normalizeNanos(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.round(parsed);
}

function normalizeCurrency(value: unknown, fallback = "USD"): string {
	if (typeof value === "string" && value.trim().length > 0) return value.trim().toUpperCase();
	return fallback;
}

function coerceRequestCount(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return Math.floor(value);
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
	}
	return null;
}

function extractByokCounterRow(data: unknown): ByokCounterRow | null {
	if (Array.isArray(data)) {
		const first = data[0];
		if (first && typeof first === "object") return first as ByokCounterRow;
		return null;
	}
	if (data && typeof data === "object") return data as ByokCounterRow;
	return null;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcMonthStartIso(nowIso: string): string {
	const now = new Date(nowIso);
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

async function resolveByokCounter(teamId: string): Promise<ByokCounterResolution> {
	const supabase = getSupabaseAdmin();
	const nowIso = new Date().toISOString();
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= COUNTER_RPC_MAX_ATTEMPTS; attempt++) {
		try {
			const { data, error } = await supabase.rpc("increment_team_byok_monthly_request_count", {
				p_team_id: teamId,
				p_now: nowIso,
			});
			if (error) throw error;
			const row = extractByokCounterRow(data);
			const requestCount = coerceRequestCount(row?.request_count);
			if (requestCount != null) {
				return {
					requestCount,
					monthStart: typeof row?.month_start === "string" ? row.month_start : utcMonthStartIso(nowIso),
					source: "rpc",
				};
			}
			lastError = new Error("byok counter rpc returned no request_count");
		} catch (err) {
			lastError = err;
		}

		if (attempt < COUNTER_RPC_MAX_ATTEMPTS) {
			await sleep(COUNTER_RPC_RETRY_BASE_MS * attempt);
		}
	}

	// Fallback read path: approximate count by reading current row and treating this call as +1.
	const monthStartIso = utcMonthStartIso(nowIso);
	try {
		const { data, error } = await supabase
			.from("team_byok_monthly_usage")
			.select("month_start,request_count")
			.eq("team_id", teamId)
			.eq("month_start", monthStartIso)
			.maybeSingle();
		if (error) throw error;
		const row = data as ByokCounterRow | null;
		const existingCount = coerceRequestCount(row?.request_count) ?? 0;
		return {
			requestCount: existingCount + 1,
			monthStart: (typeof row?.month_start === "string" ? row.month_start : monthStartIso),
			source: "fallback_read",
		};
	} catch (fallbackErr) {
		console.error("byok_monthly_counter_fallback_failed", {
			teamId,
			error: fallbackErr,
			lastRpcError: lastError,
		});
		return {
			requestCount: null,
			monthStart: monthStartIso,
			source: "unavailable",
		};
	}
}

function buildByokFeeLine(feeNanos: number) {
	if (feeNanos <= 0) return [];
	const feeUsd = formatUsdFromNanosExact(feeNanos);
	return [{
		dimension: "requests",
		meter: "byok_service_fee",
		quantity: 1,
		billable_units: 1,
		unit_size: 1,
		unit_price_usd: feeUsd,
		line_cost_usd: feeUsd,
		line_nanos: feeNanos,
	}];
}

function buildByokPricing(args: {
	basePricing: Record<string, any>;
	baseCostNanos: number;
	chargedNanos: number;
	requestCount: number | null;
	monthStart: string | null;
	currency: string;
}) {
	const freeRemaining = args.requestCount == null
		? null
		: Math.max(0, BYOK_MONTHLY_FREE_REQUESTS - args.requestCount);
	return {
		...args.basePricing,
		total_nanos: args.chargedNanos,
		total_usd_str: formatUsdFromNanosExact(args.chargedNanos),
		total_cents: Math.trunc(args.chargedNanos / NANOS_PER_CENT),
		currency: args.currency,
		lines: buildByokFeeLine(args.chargedNanos),
		byok_reference_total_nanos: args.baseCostNanos,
		byok_reference_total_usd_str: formatUsdFromNanosExact(args.baseCostNanos),
		byok_service_fee_rate: BYOK_SERVICE_FEE_RATE,
		byok_monthly_request_count: args.requestCount,
		byok_monthly_free_request_limit: BYOK_MONTHLY_FREE_REQUESTS,
		byok_free_requests_remaining: freeRemaining,
		byok_fee_applied: args.chargedNanos > 0,
		byok_month_start_utc: args.monthStart,
	};
}

export async function applyByokServiceFee(args: ByokFeeArgs): Promise<ByokFeeResult> {
	const usageIn = args.pricedUsage && typeof args.pricedUsage === "object"
		? args.pricedUsage
		: {};
	const pricingIn =
		usageIn.pricing && typeof usageIn.pricing === "object"
			? (usageIn.pricing as Record<string, any>)
			: {};
	const currency = normalizeCurrency(pricingIn.currency, normalizeCurrency(args.currencyHint, "USD"));
	const baseCostNanos = normalizeNanos(args.baseCostNanos);
	const baseTotalNanos =
		normalizeNanos(pricingIn.total_nanos) > 0
			? normalizeNanos(pricingIn.total_nanos)
			: baseCostNanos;
	const baseTotalCents =
		typeof pricingIn.total_cents === "number" && Number.isFinite(pricingIn.total_cents)
			? Math.trunc(pricingIn.total_cents)
			: Math.trunc(baseTotalNanos / NANOS_PER_CENT);

	if (!args.isByok) {
		return {
			pricedUsage: usageIn,
			totalNanos: baseTotalNanos,
			totalCents: baseTotalCents,
			currency,
			byokFeeNanos: 0,
			byokMonthlyRequestCount: null,
			byokFreeRequestsRemaining: null,
		};
	}

	const counter = await resolveByokCounter(args.teamId);
	const requestCount = counter.requestCount;
	const monthStart = counter.monthStart;
	if (counter.source === "unavailable") {
		console.error("byok_monthly_counter_failed", {
			teamId: args.teamId,
			failureMode: "charge",
		});
	}

	const feeApplies = requestCount == null
		? true
		: requestCount > BYOK_MONTHLY_FREE_REQUESTS;
	const byokFeeNanos = feeApplies ? Math.max(0, Math.round(baseTotalNanos * BYOK_SERVICE_FEE_RATE)) : 0;
	const chargedNanos = byokFeeNanos;
	const chargedCents = Math.trunc(chargedNanos / NANOS_PER_CENT);
	const freeRemaining = requestCount == null
		? null
		: Math.max(0, BYOK_MONTHLY_FREE_REQUESTS - requestCount);

	const usageOut = {
		...usageIn,
		pricing: buildByokPricing({
			basePricing: pricingIn,
			baseCostNanos: baseTotalNanos,
			chargedNanos,
			requestCount,
			monthStart,
			currency,
		}),
		byok_billing: {
			monthly_request_count: requestCount,
			monthly_free_request_limit: BYOK_MONTHLY_FREE_REQUESTS,
			free_requests_remaining: freeRemaining,
			fee_rate: BYOK_SERVICE_FEE_RATE,
			fee_applied: byokFeeNanos > 0,
			fee_nanos: byokFeeNanos,
			charged_nanos: chargedNanos,
			provider_reference_nanos: baseTotalNanos,
			month_start_utc: monthStart,
			counter_source: counter.source,
			counter_failure_mode: requestCount == null ? "charge" : null,
		},
	};

	return {
		pricedUsage: usageOut,
		totalNanos: chargedNanos,
		totalCents: chargedCents,
		currency,
		byokFeeNanos,
		byokMonthlyRequestCount: requestCount,
		byokFreeRequestsRemaining: freeRemaining,
	};
}
